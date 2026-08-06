from flask import jsonify, request
from sqlalchemy import func
from app.models import (
    db, Customer, CustomerNote, CustomerAddress, LoyaltyTransaction, Sale,
)
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp


@admin_bp.route('/customers/<int:customer_id>/profile', methods=['GET'])
@token_required
@admin_access
def customer_profile(current_user, customer_id):
    c = Customer.query.get(customer_id)
    if not c or c.archived_at:
        return jsonify({'message': 'Not found'}), 404

    sales = Sale.query.filter_by(customer_id=c.id).order_by(Sale.created_at.desc()).limit(50).all()
    ltv = db.session.query(func.coalesce(func.sum(Sale.total_amount), 0)).filter(
        Sale.customer_id == c.id,
        Sale.status.in_(['completed', 'partially_returned']),
    ).scalar() or 0
    order_count = Sale.query.filter_by(customer_id=c.id).count()

    notes = CustomerNote.query.filter_by(customer_id=c.id).order_by(CustomerNote.created_at.desc()).all()
    addresses = CustomerAddress.query.filter_by(customer_id=c.id).all()
    loyalty = LoyaltyTransaction.query.filter_by(customer_id=c.id).order_by(
        LoyaltyTransaction.created_at.desc()
    ).limit(50).all()

    return jsonify({
        'customer': {
            'id': c.id,
            'name': c.name,
            'email': c.email,
            'phone': c.phone,
            'loyalty_points': c.loyalty_points or 0,
            'store_credit': float(c.store_credit or 0),
            'birthday': c.birthday.isoformat() if c.birthday else None,
            'notes': c.notes,
            'created_at': c.created_at.isoformat() if c.created_at else None,
        },
        'ltv': float(ltv),
        'order_count': order_count,
        'avg_order_value': round(float(ltv) / order_count, 2) if order_count else 0,
        'purchase_history': [{
            'id': s.id,
            'invoice_number': s.invoice_number,
            'total': float(s.total_amount or 0),
            'status': s.status,
            'created_at': s.created_at.isoformat() if s.created_at else None,
        } for s in sales],
        'notes': [{'id': n.id, 'body': n.body, 'created_by': n.created_by,
                   'created_at': n.created_at.isoformat() if n.created_at else None} for n in notes],
        'addresses': [{
            'id': a.id, 'label': a.label, 'line1': a.line1, 'line2': a.line2,
            'city': a.city, 'state': a.state, 'postal_code': a.postal_code,
            'country': a.country, 'is_default': a.is_default,
        } for a in addresses],
        'loyalty_ledger': [{
            'id': t.id, 'points_delta': t.points_delta, 'balance_after': t.balance_after,
            'reason': t.reason, 'created_at': t.created_at.isoformat() if t.created_at else None,
        } for t in loyalty],
    }), 200


@admin_bp.route('/customers/<int:customer_id>/notes', methods=['POST'])
@token_required
@admin_access
def add_customer_note(current_user, customer_id):
    c = Customer.query.get(customer_id)
    if not c:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({'message': 'body required'}), 400
    note = CustomerNote(customer_id=c.id, body=body, created_by=current_user.id)
    db.session.add(note)
    db.session.commit()
    return jsonify({'id': note.id, 'body': note.body}), 201


@admin_bp.route('/customers/<int:customer_id>/addresses', methods=['POST'])
@token_required
@admin_access
def add_customer_address(current_user, customer_id):
    c = Customer.query.get(customer_id)
    if not c:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    line1 = (data.get('line1') or '').strip()
    if not line1:
        return jsonify({'message': 'line1 required'}), 400
    addr = CustomerAddress(
        customer_id=c.id,
        label=data.get('label', 'home'),
        line1=line1,
        line2=data.get('line2'),
        city=data.get('city'),
        state=data.get('state'),
        postal_code=data.get('postal_code'),
        country=data.get('country'),
        is_default=bool(data.get('is_default', False)),
    )
    db.session.add(addr)
    db.session.commit()
    return jsonify({'id': addr.id}), 201


@admin_bp.route('/customers/<int:customer_id>/loyalty', methods=['POST'])
@token_required
@admin_access
def adjust_loyalty(current_user, customer_id):
    c = Customer.query.get(customer_id)
    if not c:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    delta = int(data.get('points_delta') or 0)
    if delta == 0:
        return jsonify({'message': 'points_delta required'}), 400
    c.loyalty_points = (c.loyalty_points or 0) + delta
    tx = LoyaltyTransaction(
        customer_id=c.id,
        points_delta=delta,
        balance_after=c.loyalty_points,
        reason=data.get('reason', 'manual_adjustment'),
        created_by=current_user.id,
    )
    db.session.add(tx)
    db.session.commit()
    return jsonify({'loyalty_points': c.loyalty_points, 'transaction_id': tx.id}), 200


@admin_bp.route('/customers/segments', methods=['GET'])
@token_required
@admin_access
def customer_segments(current_user):
    """Simple rule-based segments."""
    from datetime import datetime, timedelta, timezone
    all_c = Customer.query.filter(Customer.archived_at == None).all()
    vip = [c.id for c in all_c if (c.loyalty_points or 0) >= 500]
    credit = [c.id for c in all_c if float(c.store_credit or 0) > 0]
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    def _aware(dt):
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    new_ids = [c.id for c in all_c if _aware(c.created_at) and _aware(c.created_at) >= cutoff]
    returning_ids = [
        r[0] for r in db.session.query(Sale.customer_id).filter(Sale.customer_id != None)
        .group_by(Sale.customer_id).having(func.count(Sale.id) >= 2).all()
    ]
    return jsonify({
        'segments': [
            {'key': 'vip', 'name': 'VIP', 'count': len(vip), 'customer_ids': vip[:100]},
            {'key': 'new', 'name': 'New (30d)', 'count': len(new_ids), 'customer_ids': new_ids[:100]},
            {'key': 'returning', 'name': 'Returning', 'count': len(returning_ids), 'customer_ids': returning_ids[:100]},
            {'key': 'store_credit', 'name': 'Has Store Credit', 'count': len(credit), 'customer_ids': credit[:100]},
            {'key': 'all', 'name': 'All Active', 'count': len(all_c), 'customer_ids': [c.id for c in all_c[:100]]},
        ]
    }), 200
