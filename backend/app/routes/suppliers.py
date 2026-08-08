from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, time
from sqlalchemy import func
from app.models import db, Supplier, GoodsReceivedNote, SupplierLedgerEntry, User
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response
from app.services.supplier_ledger_service import (
    ensure_supplier_code, post_payment, post_purchase, post_return, apply_opening_balance,
)

suppliers_bp = Blueprint('suppliers', __name__)

SUPPLIER_FIELDS = (
    'name', 'contact_name', 'email', 'phone', 'whatsapp', 'address',
    'city', 'state', 'country', 'postal_code', 'ntn', 'strn',
    'payment_terms', 'bank_name', 'bank_account', 'iban', 'notes', 'status',
)


def _supplier_dict(s, include_totals=False):
    ensure_supplier_code(s)
    d = {
        'id': s.id,
        'name': s.name,
        'supplier_code': s.supplier_code or '',
        'contact_name': s.contact_name or '',
        'email': s.email or '',
        'phone': s.phone or '',
        'whatsapp': getattr(s, 'whatsapp', None) or '',
        'address': s.address or '',
        'city': getattr(s, 'city', None) or '',
        'state': getattr(s, 'state', None) or '',
        'country': getattr(s, 'country', None) or '',
        'postal_code': getattr(s, 'postal_code', None) or '',
        'ntn': getattr(s, 'ntn', None) or '',
        'strn': getattr(s, 'strn', None) or '',
        'payment_terms': getattr(s, 'payment_terms', None) or '',
        'credit_limit': float(getattr(s, 'credit_limit', 0) or 0),
        'opening_balance': float(getattr(s, 'opening_balance', 0) or 0),
        'outstanding_balance': float(getattr(s, 'outstanding_balance', 0) or 0),
        'current_balance': float(getattr(s, 'outstanding_balance', 0) or 0),
        'bank_name': getattr(s, 'bank_name', None) or '',
        'bank_account': getattr(s, 'bank_account', None) or '',
        'iban': getattr(s, 'iban', None) or '',
        'notes': getattr(s, 'notes', None) or '',
        'status': 'inactive' if s.archived_at else (getattr(s, 'status', None) or 'active'),
        'grn_count': GoodsReceivedNote.query.filter_by(supplier_id=s.id).count(),
        'archived_at': s.archived_at.isoformat() if s.archived_at else None,
        'created_at': s.created_at.isoformat() if s.created_at else None,
        'updated_at': s.updated_at.isoformat() if getattr(s, 'updated_at', None) else None,
    }
    if include_totals:
        totals = _ledger_totals(s.id)
        d.update(totals)
    return d


def _ledger_totals(supplier_id):
    rows = db.session.query(
        SupplierLedgerEntry.entry_type,
        func.coalesce(func.sum(SupplierLedgerEntry.amount), 0),
    ).filter_by(supplier_id=supplier_id).group_by(SupplierLedgerEntry.entry_type).all()
    purchased = paid = returned = 0.0
    for etype, amt in rows:
        val = float(amt or 0)
        if etype == 'purchase':
            purchased += val
        elif etype == 'payment':
            paid += abs(val)
        elif etype == 'return':
            returned += abs(val)
    supplier = Supplier.query.get(supplier_id)
    balance = float(supplier.outstanding_balance or 0) if supplier else (purchased - paid - returned)
    return {
        'total_purchases': purchased,
        'total_purchased': purchased,
        'total_payments': paid,
        'total_paid': paid,
        'total_returns': returned,
        'balance_due': balance,
        'current_due': balance,
    }


def _date_range(time_filter, start_date_str, end_date_str):
    now = datetime.utcnow()
    tz = timedelta(hours=5)
    local = now + tz
    start_dt = end_dt = None
    if time_filter == 'today':
        start_dt = datetime.combine(local.date(), time.min) - tz
        end_dt = datetime.combine(local.date(), time.max) - tz
    elif time_filter in ('week', 'this_week'):
        start_local = local - timedelta(days=local.weekday())
        start_dt = datetime.combine(start_local.date(), time.min) - tz
        end_dt = datetime.combine(local.date(), time.max) - tz
    elif time_filter in ('month', 'this_month'):
        start_local = local.replace(day=1)
        start_dt = datetime.combine(start_local.date(), time.min) - tz
        end_dt = datetime.combine(local.date(), time.max) - tz
    elif time_filter in ('last_3_months', '3m'):
        start_local = local - timedelta(days=90)
        start_dt = datetime.combine(start_local.date(), time.min) - tz
        end_dt = datetime.combine(local.date(), time.max) - tz
    elif time_filter == 'custom' and start_date_str and end_date_str:
        try:
            s = datetime.strptime(start_date_str, '%Y-%m-%d')
            e = datetime.strptime(end_date_str, '%Y-%m-%d')
            start_dt = datetime.combine(s.date(), time.min) - tz
            end_dt = datetime.combine(e.date(), time.max) - tz
        except ValueError:
            pass
    return start_dt, end_dt


def _entry_dict(e):
    user = User.query.get(e.created_by) if e.created_by else None
    return {
        'id': e.id,
        'supplier_id': e.supplier_id,
        'entry_type': e.entry_type,
        'amount': float(e.amount),
        'balance_after': float(e.balance_after or 0),
        'reference_type': e.reference_type,
        'reference_id': e.reference_id,
        'reference_number': e.reference_number or '',
        'payment_method': e.payment_method or '',
        'notes': e.notes or '',
        'created_by': e.created_by,
        'created_by_name': user.username if user else None,
        'created_at': e.created_at.isoformat() if e.created_at else None,
    }


@suppliers_bp.route('/', methods=['GET'])
@token_required
def list_suppliers(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    status = (request.args.get('status') or '').strip()
    query = Supplier.query
    if not include_archived:
        query = query.filter(Supplier.archived_at == None)
    if status in ('active', 'inactive'):
        query = query.filter(Supplier.status == status)
    if search:
        like = f'%{search}%'
        query = query.filter(db.or_(
            Supplier.name.ilike(like),
            Supplier.contact_name.ilike(like),
            Supplier.email.ilike(like),
            Supplier.phone.ilike(like),
            Supplier.supplier_code.ilike(like),
        ))
    suppliers = query.order_by(Supplier.name).all()
    for s in suppliers:
        ensure_supplier_code(s)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({'suppliers': [_supplier_dict(s) for s in suppliers]}), 200


@suppliers_bp.route('/<int:supplier_id>', methods=['GET'])
@token_required
def get_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    ensure_supplier_code(supplier)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    grns = GoodsReceivedNote.query.filter_by(supplier_id=supplier_id).order_by(
        GoodsReceivedNote.created_at.desc()
    ).limit(50).all()
    purchase_history = []
    for g in grns:
        items_total = sum(float(i.cost_price or 0) * int(i.quantity or 0) for i in (g.items or []))
        items_qty = sum(int(i.quantity or 0) for i in (g.items or []))
        purchase_history.append({
            'id': g.id,
            'purchase_number': g.grn_number,
            'grn_number': g.grn_number,
            'purchase_date': (g.received_at or g.created_at).isoformat() if (g.received_at or g.created_at) else None,
            'status': g.status,
            'items_count': len(g.items or []),
            'quantity': items_qty,
            'total': items_total,
            'paid': 0,
            'due': items_total if g.status == 'received' else 0,
            'items': [{
                'product_id': i.product_id,
                'product_name': i.product.name if i.product else 'Item',
                'quantity': i.quantity,
                'cost_price': float(i.cost_price or 0),
                'total': float(i.cost_price or 0) * int(i.quantity or 0),
            } for i in (g.items or [])],
        })

    recent = SupplierLedgerEntry.query.filter_by(supplier_id=supplier_id).order_by(
        SupplierLedgerEntry.created_at.desc()
    ).limit(30).all()

    return jsonify({
        'supplier': _supplier_dict(supplier, include_totals=True),
        'recent_grns': [{'id': g.id, 'grn_number': g.grn_number, 'status': g.status,
                         'created_at': g.created_at.isoformat() if g.created_at else None} for g in grns[:20]],
        'purchase_history': purchase_history,
        'recent_transactions': [_entry_dict(e) for e in recent],
        'payment_history': [_entry_dict(e) for e in recent if e.entry_type == 'payment'],
    }), 200


@suppliers_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'admin', 'manager', 'inventory_manager')
def create_supplier(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or data.get('company_name') or '').strip()
    if not name:
        return error_response('Bad Request', 'Company name is required', 400)

    supplier = Supplier(name=name)
    for field in SUPPLIER_FIELDS:
        if field == 'name':
            continue
        if field in data:
            setattr(supplier, field, data[field] if data[field] != '' else None)
    if data.get('company_name'):
        supplier.name = name
    if 'credit_limit' in data:
        supplier.credit_limit = float(data.get('credit_limit') or 0)
    if data.get('supplier_code'):
        supplier.supplier_code = data['supplier_code'].strip()
    if data.get('status') in ('active', 'inactive'):
        supplier.status = data['status']
        if data['status'] == 'inactive':
            supplier.archived_at = datetime.utcnow()

    db.session.add(supplier)
    db.session.flush()
    ensure_supplier_code(supplier)

    opening = float(data.get('opening_balance') or 0)
    if opening:
        apply_opening_balance(supplier, opening, user_id=current_user.id)
    elif 'outstanding_balance' in data:
        supplier.outstanding_balance = float(data.get('outstanding_balance') or 0)

    db.session.commit()
    try:
        from app.services.event_bus import supplier_updated
        supplier_updated(supplier.id, action='created')
    except Exception:
        pass
    return jsonify({'supplier': _supplier_dict(supplier, include_totals=True)}), 201


@suppliers_bp.route('/<int:supplier_id>', methods=['PUT'])
@token_required
@role_required('owner', 'admin', 'manager', 'inventory_manager')
def update_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.get_json() or {}
    if 'company_name' in data or 'name' in data:
        supplier.name = (data.get('name') or data.get('company_name') or '').strip() or supplier.name
    for field in SUPPLIER_FIELDS:
        if field == 'name':
            continue
        if field in data:
            setattr(supplier, field, data[field] if data[field] != '' else None)
    if 'supplier_code' in data and data['supplier_code']:
        supplier.supplier_code = data['supplier_code'].strip()
    if 'credit_limit' in data:
        supplier.credit_limit = float(data.get('credit_limit') or 0)
    if 'opening_balance' in data:
        apply_opening_balance(supplier, data.get('opening_balance') or 0, user_id=current_user.id)
    if 'status' in data and data['status'] in ('active', 'inactive'):
        supplier.status = data['status']
        supplier.archived_at = datetime.utcnow() if data['status'] == 'inactive' else None
    supplier.updated_at = datetime.utcnow()
    ensure_supplier_code(supplier)
    db.session.commit()
    try:
        from app.services.event_bus import supplier_updated
        supplier_updated(supplier.id, action='updated')
    except Exception:
        pass
    return jsonify({'supplier': _supplier_dict(supplier, include_totals=True)}), 200


@suppliers_bp.route('/<int:supplier_id>/ledger', methods=['GET'])
@token_required
def get_ledger(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    entry_type = (request.args.get('type') or request.args.get('entry_type') or 'all').strip().lower()
    time_filter = request.args.get('time_filter', 'last_3_months')
    start_dt, end_dt = _date_range(time_filter, request.args.get('start_date'), request.args.get('end_date'))

    query = SupplierLedgerEntry.query.filter_by(supplier_id=supplier_id)
    if entry_type in ('purchase', 'purchases'):
        query = query.filter_by(entry_type='purchase')
    elif entry_type in ('payment', 'payments'):
        query = query.filter_by(entry_type='payment')
    elif entry_type in ('return', 'returns'):
        query = query.filter_by(entry_type='return')
    if start_dt and end_dt:
        query = query.filter(
            SupplierLedgerEntry.created_at >= start_dt,
            SupplierLedgerEntry.created_at <= end_dt,
        )
    entries = query.order_by(SupplierLedgerEntry.created_at.desc()).limit(500).all()
    totals = _ledger_totals(supplier_id)
    return jsonify({
        'supplier': _supplier_dict(supplier),
        'entries': [_entry_dict(e) for e in entries],
        'summary': {
            'total_purchased': totals['total_purchased'],
            'total_paid': totals['total_paid'],
            'total_returns': totals['total_returns'],
            'balance_due': totals['balance_due'],
        },
    }), 200


def _parse_entry_date(data):
    """Optional YYYY-MM-DD → datetime (noon UTC+5 local ≈ morning UTC)."""
    raw = (data.get('date') or data.get('entry_date') or '').strip()
    if not raw:
        return None
    try:
        d = datetime.strptime(raw[:10], '%Y-%m-%d')
        return d.replace(hour=7, minute=0, second=0)  # ~noon PKT
    except ValueError:
        return None


@suppliers_bp.route('/<int:supplier_id>/payments', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def record_payment(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.get_json() or {}
    try:
        amount = float(data.get('amount') or 0)
    except (TypeError, ValueError):
        return error_response('Bad Request', 'Invalid amount', 400)
    if amount <= 0:
        return error_response('Bad Request', 'Amount must be positive', 400)

    method = (data.get('payment_method') or data.get('method') or 'cash').strip().lower()
    allowed = {'cash', 'bank_transfer', 'cheque', 'online', 'online_transfer'}
    if method not in allowed:
        return error_response('Bad Request', f'Invalid payment method. Use one of: {", ".join(sorted(allowed))}', 400)
    if method == 'online_transfer':
        method = 'online'

    try:
        entry = post_payment(
            supplier.id, amount,
            payment_method=method,
            reference_number=(data.get('reference_number') or data.get('reference') or '').strip() or None,
            notes=(data.get('notes') or '').strip() or None,
            user_id=current_user.id,
            created_at=_parse_entry_date(data),
            commit=True,
        )
        return jsonify({
            'message': 'Payment recorded',
            'entry': _entry_dict(entry),
            'supplier': _supplier_dict(supplier, include_totals=True),
        }), 201
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)


@suppliers_bp.route('/<int:supplier_id>/purchases', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def record_purchase(current_user, supplier_id):
    """Manual purchase / invoice entry (increases balance due)."""
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.get_json() or {}
    try:
        amount = float(data.get('amount') or 0)
    except (TypeError, ValueError):
        return error_response('Bad Request', 'Invalid amount', 400)
    if amount <= 0:
        return error_response('Bad Request', 'Amount must be positive', 400)

    try:
        entry = post_purchase(
            supplier.id, amount,
            reference_number=(data.get('reference_number') or data.get('reference') or '').strip() or None,
            notes=(data.get('notes') or '').strip() or None,
            user_id=current_user.id,
            created_at=_parse_entry_date(data),
            commit=True,
        )
        return jsonify({
            'message': 'Purchase recorded',
            'entry': _entry_dict(entry),
            'supplier': _supplier_dict(supplier, include_totals=True),
        }), 201
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)


@suppliers_bp.route('/<int:supplier_id>/returns', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def record_supplier_return(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.get_json() or {}
    try:
        amount = float(data.get('amount') or 0)
    except (TypeError, ValueError):
        return error_response('Bad Request', 'Invalid amount', 400)
    try:
        entry = post_return(
            supplier.id, amount,
            reference_number=(data.get('reference_number') or '').strip() or None,
            notes=(data.get('notes') or '').strip() or None,
            user_id=current_user.id,
            commit=True,
        )
        return jsonify({
            'message': 'Supplier return recorded',
            'entry': _entry_dict(entry),
            'supplier': _supplier_dict(supplier, include_totals=True),
        }), 201
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)


@suppliers_bp.route('/<int:supplier_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'admin', 'manager')
def archive_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    supplier.archived_at = datetime.utcnow()
    supplier.status = 'inactive'
    db.session.commit()
    return jsonify({'message': 'Supplier deleted', 'supplier': _supplier_dict(supplier)}), 200


@suppliers_bp.route('/<int:supplier_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'admin', 'manager')
def restore_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    supplier.archived_at = None
    supplier.status = 'active'
    db.session.commit()
    return jsonify({'supplier': _supplier_dict(supplier)}), 200


@suppliers_bp.route('/<int:supplier_id>', methods=['DELETE'])
@token_required
@role_required('owner', 'admin', 'manager')
def delete_supplier(current_user, supplier_id):
    """Hard delete when unused; otherwise soft-archive so the list stays clean."""
    supplier = Supplier.query.get_or_404(supplier_id)
    has_grn = GoodsReceivedNote.query.filter_by(supplier_id=supplier.id).count() > 0
    has_ledger = SupplierLedgerEntry.query.filter_by(supplier_id=supplier.id).count() > 0
    if has_grn or has_ledger:
        supplier.archived_at = datetime.utcnow()
        supplier.status = 'inactive'
        db.session.commit()
        try:
            from app.services.event_bus import supplier_updated
            supplier_updated(supplier.id, action='deleted')
        except Exception:
            pass
        return jsonify({'message': 'Supplier deleted'}), 200
    db.session.delete(supplier)
    db.session.commit()
    try:
        from app.services.event_bus import supplier_updated
        supplier_updated(supplier_id, action='deleted')
    except Exception:
        pass
    return jsonify({'message': 'Supplier deleted'}), 200
