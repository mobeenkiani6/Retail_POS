from flask import Blueprint, request, jsonify
from sqlalchemy import or_, cast, String, func
from datetime import datetime, timedelta, time
import uuid
from app.models import (
    db, Sale, SaleItem, SaleReturn, SaleReturnItem, Product, ProductSku,
    Setting, AuditLog, Customer, User, Branch,
)
from app.utils.product_variants import resolve_variant_pricing
from app.utils.auth_decorators import token_required, role_required
from app.services.stock_service import deduct_stock, get_stock_level, get_sku_stock_level, restock, restock_sku
from app.services.sync_service import enqueue_sale
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

sales_bp = Blueprint('sales', __name__)


def _generate_invoice_number(sale_id):
    return f'INV-{sale_id:06d}'


def _generate_receipt_number(sale_id, invoice_uuid):
    short = (invoice_uuid or uuid.uuid4().hex)[:8].upper()
    return f'RCPT-{sale_id:06d}-{short}'


def _sale_list_dict(s):
    items_count = len(s.items) if s.items is not None else 0
    qty = sum(int(i.quantity or 0) for i in (s.items or []))
    customer = Customer.query.get(s.customer_id) if s.customer_id else None
    cashier = User.query.get(s.user_id) if s.user_id else None
    subtotal = float(s.subtotal_amount or 0)
    if not subtotal and s.items:
        subtotal = sum(float(i.subtotal or 0) for i in s.items)
    return {
        'id': s.id,
        'invoice_uuid': s.invoice_uuid,
        'invoice_number': s.invoice_number or _generate_invoice_number(s.id),
        'receipt_number': s.receipt_number or '',
        'branch_id': s.branch_id,
        'subtotal_amount': subtotal,
        'discount_amount': float(s.discount_amount or 0),
        'tax_amount': float(s.tax_amount or 0),
        'total_amount': float(s.total_amount or 0),
        'cogs_amount': float(s.cogs_amount or 0),
        'payment_method': s.payment_method,
        'status': s.status,
        'items_count': items_count,
        'quantity_count': qty,
        'customer_id': s.customer_id,
        'customer_name': customer.name if customer else None,
        'customer_phone': customer.phone if customer else None,
        'cashier_id': s.user_id,
        'cashier_name': cashier.username if cashier else None,
        'notes': s.notes or '',
        'created_at': s.created_at.isoformat() if s.created_at else None,
        'updated_at': s.updated_at.isoformat() if getattr(s, 'updated_at', None) else None,
        'synced_at': s.synced_at.isoformat() if s.synced_at else None,
    }


def _sale_detail_dict(s):
    base = _sale_list_dict(s)
    items = []
    for i in s.items:
        returned = int(getattr(i, 'quantity_returned', 0) or 0)
        items.append({
            'id': i.id,
            'product_id': i.product_id,
            'sku_id': i.sku_id,
            'batch_id': i.batch_id,
            'product_title': i.product.name if i.product else 'Unknown',
            'variant': i.variant or '',
            'quantity': i.quantity,
            'quantity_returned': returned,
            'quantity_returnable': max(0, int(i.quantity) - returned),
            'unit_price': float(i.unit_price),
            'cost_price': float(i.cost_price or 0),
            'subtotal': float(i.subtotal),
        })
    returns = []
    for r in (s.returns or []):
        returns.append({
            'id': r.id,
            'return_number': r.return_number,
            'refund_amount': float(r.refund_amount or 0),
            'refund_method': r.refund_method,
            'reason': r.reason or '',
            'created_at': r.created_at.isoformat() if r.created_at else None,
            'items': [{
                'sale_item_id': ri.sale_item_id,
                'quantity': ri.quantity,
                'unit_price': float(ri.unit_price),
                'subtotal': float(ri.subtotal),
            } for ri in (r.items or [])],
        })
    base.update({
        'cash_received': float(s.cash_received) if s.cash_received is not None else None,
        'discount_snapshot': s.discount_snapshot,
        'receipt_snapshot': s.receipt_snapshot,
        'items': items,
        'returns': returns,
        'terminal_id': s.terminal_id,
    })
    return base


def _build_receipt_snapshot(sale, subtotal, tax_rate, operator_name, branch_name, discount_name=None, customer_name=None):
    items = []
    for si in sale.items:
        title = si.product.name if si.product else 'Item'
        if si.variant:
            title = f'{title} ({si.variant})'
        items.append({
            'title': title,
            'quantity': int(si.quantity),
            'unit_price': float(si.unit_price),
        })
    created = sale.created_at or datetime.utcnow()
    return {
        'invoice_number': sale.invoice_number,
        'receipt_number': sale.receipt_number,
        'invoice_uuid': sale.invoice_uuid,
        'total': float(sale.total_amount),
        'subtotal': float(subtotal),
        'tax_amount': float(sale.tax_amount or 0),
        'tax_rate': float(tax_rate or 0),
        'discount_amount': float(sale.discount_amount or 0),
        'discount_name': discount_name or (sale.discount_snapshot or {}).get('name') or 'Discount',
        'payment_method': sale.payment_method,
        'cash_received': float(sale.cash_received) if sale.cash_received is not None else None,
        'operator': operator_name,
        'branch': branch_name,
        'branch_id': sale.branch_id,
        'created_at': created.isoformat(),
        'items': items,
        'notes': sale.notes or '',
        'customer_name': customer_name,
    }


@sales_bp.route('/checkout', methods=['POST'])
@token_required
def checkout(current_user):
    data = request.get_json()
    if not data or 'items' not in data or 'payment_method' not in data:
        return error_response("Bad Request", "Missing necessary checkout data", 400)

    items = data['items']
    if not items:
        return error_response("Bad Request", "Cart is empty", 400)

    try:
        branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    except ValueError as e:
        return error_response("Bad Request", str(e), 400)

    terminal_id = data.get('terminal_id', 'TERM-001')
    invoice_uuid = data.get('invoice_uuid') or str(uuid.uuid4())

    existing = Sale.query.filter_by(invoice_uuid=invoice_uuid).first()
    if existing:
        resp = {
            "message": "Already processed (idempotent)",
            "sale_id": existing.id,
            "invoice_uuid": existing.invoice_uuid,
            "total": float(existing.total_amount),
        }
        if existing.customer_id:
            cust = Customer.query.get(existing.customer_id)
            if cust:
                resp["loyalty_points_earned"] = 0
                resp["loyalty_points_redeemed"] = 0
                resp["customer_loyalty_points"] = cust.loyalty_points or 0
        return jsonify(resp), 200

    setting = Setting.query.filter_by(branch_id=branch_id).first()
    if not setting:
        setting = Setting.query.filter_by(branch_id=None).first()

    tax_rate = 0.0
    if setting and setting.config.get('tax_enabled', True):
        rates = setting.config.get('tax_rates_by_payment_method') or {}
        pm = data.get('payment_method') or 'Cash'
        if isinstance(rates.get(pm), (int, float)):
            tax_rate = float(rates[pm]) / 100.0
        elif 'tax_percentage' in (setting.config or {}):
            tax_rate = float(setting.config['tax_percentage']) / 100.0

    total_amount = 0.0
    cogs_amount = 0.0
    loyalty_points_earned = 0
    loyalty_points_redeemed = 0
    customer = None
    customer_id = data.get('customer_id')
    if customer_id:
        customer = Customer.query.get(int(customer_id))
        if not customer or customer.archived_at:
            customer = None

    try:
        new_sale = Sale(
            invoice_uuid=invoice_uuid,
            branch_id=branch_id,
            user_id=current_user.id,
            terminal_id=terminal_id,
            subtotal_amount=0,
            total_amount=0,
            tax_amount=0,
            cogs_amount=0,
            payment_method=data['payment_method'],
            customer_id=customer.id if customer else None,
            notes=(data.get('notes') or '').strip() or None,
        )
        db.session.add(new_sale)
        db.session.flush()
        new_sale.invoice_number = _generate_invoice_number(new_sale.id)
        new_sale.receipt_number = _generate_receipt_number(new_sale.id, invoice_uuid)

        for idx, item in enumerate(items):
            qty = int(item.get('quantity', 0))
            if qty <= 0:
                raise ValueError(f"Item {idx}: invalid quantity")

            sku_id = item.get('sku_id')
            product_id = item.get('product_id')
            sku = None
            if sku_id:
                sku = ProductSku.query.get(int(sku_id))
                if not sku:
                    raise ValueError(f"Item {idx}: SKU {sku_id} not found")
                product_id = sku.product_id
            if not product_id:
                raise ValueError(f"Item {idx}: product_id or sku_id required")

            product = Product.query.get(product_id)
            if not product:
                raise ValueError(f"Product {product_id} not found")

            variant_name = (item.get('variant') or '').strip() or ''
            if sku:
                available = get_sku_stock_level(branch_id, sku.id)
                unit_price = float(item.get('unit_price', sku.selling_price))
                cost_price = float(sku.cost_price or 0)
                if unit_price <= 0:
                    unit_price = float(sku.selling_price)
                variant_name = variant_name or sku.variant_name
            else:
                available = get_stock_level(branch_id, product_id, variant_name)
                unit_price = float(item.get('unit_price', product.base_price))
                pricing = resolve_variant_pricing(product, variant_name or None)
                cost_price = pricing['cost_price']
                if unit_price <= 0 and variant_name:
                    unit_price = pricing['base_price']

            if available < qty:
                label = f' {variant_name}' if variant_name else ''
                raise ValueError(f'Insufficient stock for {product.name}{label} (available: {available})')

            deduct_stock(
                branch_id, product_id, qty,
                reference_type='sale', reference_id=new_sale.id,
                user_id=current_user.id, variant=variant_name, sku_id=sku.id if sku else None,
            )

            subtotal = unit_price * qty
            total_amount += subtotal
            cogs_amount += cost_price * qty

            sale_item = SaleItem(
                sale_id=new_sale.id,
                product_id=product_id,
                sku_id=sku.id if sku else None,
                batch_id=None,
                quantity=qty,
                unit_price=unit_price,
                cost_price=cost_price,
                subtotal=subtotal,
                variant=variant_name or None,
            )
            db.session.add(sale_item)

        discount_amount = 0.0
        discount_snapshot = None
        discount_data = data.get('discount')
        if discount_data and isinstance(discount_data, dict):
            d_type = discount_data.get('type')
            d_value = float(discount_data.get('value', 0) or 0)
            if d_type == 'percent' and 0 <= d_value <= 100:
                discount_amount = total_amount * (d_value / 100.0)
            elif d_type == 'fixed' and d_value >= 0:
                discount_amount = min(d_value, total_amount)
            discount_snapshot = {
                'name': discount_data.get('name', 'Discount'),
                'type': d_type,
                'value': d_value,
            }

        # Loyalty redemption: 1 point = 1 currency unit discount (after other discounts)
        loyalty_points_redeemed = 0
        raw_redeem = data.get('loyalty_points_to_redeem', 0) or 0
        try:
            requested_redeem = int(raw_redeem)
        except (TypeError, ValueError):
            raise ValueError('Invalid loyalty_points_to_redeem')
        if requested_redeem < 0:
            raise ValueError('loyalty_points_to_redeem cannot be negative')
        if requested_redeem > 0:
            if not customer:
                raise ValueError('A customer is required to redeem loyalty points')
            available_points = int(customer.loyalty_points or 0)
            if requested_redeem > available_points:
                raise ValueError(
                    f'Insufficient loyalty points (available: {available_points}, requested: {requested_redeem})'
                )
            remaining_after_discount = max(0.0, total_amount - discount_amount)
            max_redeemable = int(remaining_after_discount)  # 1 pt = 1 Rs; cannot exceed remaining subtotal
            if requested_redeem > max_redeemable:
                raise ValueError(
                    f'Cannot redeem more than {max_redeemable} points against this sale'
                )
            loyalty_points_redeemed = requested_redeem
            discount_amount += float(loyalty_points_redeemed)
            if discount_snapshot is None:
                discount_snapshot = {}
            discount_snapshot = {
                **discount_snapshot,
                'loyalty_points_redeemed': loyalty_points_redeemed,
                'loyalty_discount': float(loyalty_points_redeemed),
            }
            if not discount_snapshot.get('name'):
                discount_snapshot['name'] = 'Loyalty points'
                discount_snapshot['type'] = 'loyalty'
                discount_snapshot['value'] = loyalty_points_redeemed

        new_sale.discount_amount = discount_amount
        new_sale.discount_snapshot = discount_snapshot
        new_sale.subtotal_amount = total_amount

        discounted = total_amount - discount_amount
        new_sale.tax_amount = discounted * tax_rate
        new_sale.total_amount = discounted + new_sale.tax_amount
        new_sale.cogs_amount = cogs_amount

        if customer:
            # Redeem first, then award points for this sale
            if loyalty_points_redeemed:
                customer.loyalty_points = (customer.loyalty_points or 0) - loyalty_points_redeemed
            loyalty_points_earned = sum(int(item.get('quantity', 0)) for item in items)
            customer.loyalty_points = (customer.loyalty_points or 0) + loyalty_points_earned

        cash_received_val = None
        if data.get('payment_method') == 'Cash':
            try:
                cash_received_val = float(data.get('cash_received', 0) or 0)
            except (TypeError, ValueError):
                raise ValueError('Invalid cash received amount')
            if cash_received_val < float(new_sale.total_amount):
                raise ValueError(
                    f'Cash received ({cash_received_val:.2f}) is less than total ({float(new_sale.total_amount):.2f})'
                )
            new_sale.cash_received = cash_received_val

        branch_obj = Branch.query.get(branch_id)
        discount_name = (discount_snapshot or {}).get('name') if discount_snapshot else 'Discount'
        receipt_data = _build_receipt_snapshot(
            new_sale, total_amount, tax_rate,
            current_user.username,
            branch_obj.name if branch_obj else 'Main Branch',
            discount_name=discount_name,
            customer_name=customer.name if customer else None,
        )
        if cash_received_val is not None:
            receipt_data['cash_received'] = cash_received_val
        new_sale.receipt_snapshot = receipt_data

        audit = AuditLog(
            user_id=current_user.id,
            action='sale.completed',
            entity_type='sale',
            entity_id=new_sale.id,
            details={
                'invoice_uuid': invoice_uuid,
                'invoice_number': new_sale.invoice_number,
                'receipt_number': new_sale.receipt_number,
                'total': float(new_sale.total_amount),
            },
        )
        db.session.add(audit)
        db.session.flush()

        enqueue_sale(new_sale)
        db.session.commit()

        from app.services.printer_service import PrinterService
        printer_service = PrinterService()
        print_success = printer_service.print_receipt(dict(receipt_data))

        return jsonify({
            "message": "Checkout successful",
            "sale_id": new_sale.id,
            "invoice_uuid": new_sale.invoice_uuid,
            "invoice_number": new_sale.invoice_number,
            "receipt_number": new_sale.receipt_number,
            "total": float(new_sale.total_amount),
            "cogs_amount": float(cogs_amount),
            "print_success": print_success,
            "loyalty_points_earned": loyalty_points_earned,
            "loyalty_points_redeemed": loyalty_points_redeemed,
            "customer_loyalty_points": (customer.loyalty_points or 0) if customer else None,
        }), 201

    except ValueError as e:
        db.session.rollback()
        return error_response("Bad Request", str(e), 400)
    except Exception as e:
        db.session.rollback()
        return error_response("Bad Request", f"Checkout failed: {str(e)}", 400)


def get_time_filter_ranges(time_filter, start_date_str, end_date_str):
    now = datetime.utcnow()
    tz_offset = timedelta(hours=5)
    local_now = now + tz_offset
    start_dt = end_dt = None
    if time_filter == 'today':
        start_dt = datetime.combine(local_now.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
    elif time_filter == 'yesterday':
        yday = local_now.date() - timedelta(days=1)
        start_dt = datetime.combine(yday, time.min) - tz_offset
        end_dt = datetime.combine(yday, time.max) - tz_offset
    elif time_filter in ('week', 'last_7_days', '7d'):
        start_local = local_now - timedelta(days=6)
        start_dt = datetime.combine(start_local.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
    elif time_filter in ('last_30_days', '30d'):
        start_local = local_now - timedelta(days=29)
        start_dt = datetime.combine(start_local.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
    elif time_filter == 'month':
        start_of_month = local_now.replace(day=1)
        start_dt = datetime.combine(start_of_month.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
    elif time_filter in ('all', 'all_time'):
        start_dt = end_dt = None
    elif time_filter == 'custom' and start_date_str and end_date_str:
        try:
            start_local = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_local = datetime.strptime(end_date_str, "%Y-%m-%d")
            start_dt = datetime.combine(start_local.date(), time.min) - tz_offset
            end_dt = datetime.combine(end_local.date(), time.max) - tz_offset
        except ValueError:
            pass
    return start_dt, end_dt


@sales_bp.route('/', methods=['GET'])
@token_required
def get_sales(current_user):
    time_filter = request.args.get('time_filter', 'today')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    branch_id = request.args.get('branch_id')
    start_dt, end_dt = get_time_filter_ranges(time_filter, start_date, end_date)

    q = (request.args.get('q') or request.args.get('search') or '').strip()
    invoice_number = (request.args.get('invoice_number') or '').strip()
    receipt_number = (request.args.get('receipt_number') or '').strip()
    customer_name = (request.args.get('customer_name') or '').strip()
    customer_phone = (request.args.get('customer_phone') or '').strip()
    cashier = (request.args.get('cashier') or '').strip()
    payment_method = (request.args.get('payment_method') or '').strip()
    status = (request.args.get('status') or '').strip()
    page = max(1, int(request.args.get('page', 1) or 1))
    per_page = min(100, max(1, int(request.args.get('per_page', 50) or 50)))

    query = Sale.query.filter(Sale.archived_at == None)
    if current_user.role != 'owner':
        query = query.filter_by(branch_id=current_user.branch_id)
    elif branch_id:
        query = query.filter_by(branch_id=branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
    if invoice_number:
        inv_like = f'%{invoice_number}%'
        query = query.filter(or_(
            Sale.invoice_number.ilike(inv_like),
            Sale.invoice_uuid.ilike(inv_like),
            cast(Sale.id, String).ilike(inv_like),
            func.concat('INV-', func.lpad(cast(Sale.id, String), 6, '0')).ilike(inv_like),
        ))
    if receipt_number:
        rcp_like = f'%{receipt_number}%'
        query = query.filter(or_(
            Sale.receipt_number.ilike(rcp_like),
            Sale.invoice_uuid.ilike(rcp_like),
            cast(Sale.id, String).ilike(rcp_like),
        ))
    if payment_method:
        query = query.filter(func.lower(Sale.payment_method) == payment_method.lower())
    if status:
        query = query.filter(func.lower(Sale.status) == status.lower())
    needs_customer = bool(customer_name or customer_phone or q)
    needs_user = bool(cashier or q)
    if needs_customer:
        query = query.outerjoin(Customer, Sale.customer_id == Customer.id)
    if needs_user:
        query = query.outerjoin(User, Sale.user_id == User.id)
    if customer_name:
        query = query.filter(Customer.name.ilike(f'%{customer_name}%'))
    if customer_phone:
        query = query.filter(Customer.phone.ilike(f'%{customer_phone}%'))
    if cashier:
        query = query.filter(User.username.ilike(f'%{cashier}%'))
    if q:
        like = f'%{q}%'
        query = query.filter(or_(
            Sale.invoice_number.ilike(like),
            Sale.receipt_number.ilike(like),
            Sale.invoice_uuid.ilike(like),
            Sale.payment_method.ilike(like),
            Customer.name.ilike(like),
            Customer.phone.ilike(like),
            User.username.ilike(like),
        ))

    # Avoid DISTINCT on full Sale rows — JSON columns (discount_snapshot / receipt_snapshot)
    # have no equality operator in PostgreSQL.
    total = query.with_entities(func.count(func.distinct(Sale.id))).scalar() or 0
    id_rows = (
        query.with_entities(Sale.id, Sale.created_at)
        .distinct()
        .order_by(Sale.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    ids = [row[0] for row in id_rows]
    if ids:
        found = Sale.query.filter(Sale.id.in_(ids)).all()
        by_id = {s.id: s for s in found}
        sales = [by_id[i] for i in ids if i in by_id]
    else:
        sales = []
    return jsonify({
        'sales': [_sale_list_dict(s) for s in sales],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': max(1, (total + per_page - 1) // per_page),
        },
    }), 200


@sales_bp.route('/analytics', methods=['GET'])
@token_required
def get_analytics(current_user):
    time_filter = request.args.get('time_filter', 'today')
    start_dt, end_dt = get_time_filter_ranges(time_filter, request.args.get('start_date'), request.args.get('end_date'))
    query = Sale.query.filter(Sale.status != 'refunded')
    if current_user.role != 'owner':
        query = query.filter(Sale.branch_id == current_user.branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
    sales = query.all()
    total_sales = sum(float(s.total_amount) for s in sales)
    total_cogs = sum(float(s.cogs_amount or 0) for s in sales)
    return jsonify({
        'total_sales': total_sales,
        'total_transactions': len(sales),
        'gross_profit': total_sales - total_cogs,
        'cogs': total_cogs,
    }), 200


@sales_bp.route('/<int:sale_id>', methods=['GET'])
@token_required
def get_sale_details(current_user, sale_id):
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)
    return jsonify(_sale_detail_dict(sale)), 200


@sales_bp.route('/<int:sale_id>/print', methods=['POST'])
@token_required
def print_sale_receipt(current_user, sale_id):
    """Reprint using stored receipt_snapshot — never recalculate totals."""
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)

    snapshot = sale.receipt_snapshot
    if not snapshot:
        branch_obj = Branch.query.get(sale.branch_id)
        cashier = User.query.get(sale.user_id)
        customer = Customer.query.get(sale.customer_id) if sale.customer_id else None
        subtotal = float(sale.subtotal_amount or 0) or sum(float(i.subtotal or 0) for i in sale.items)
        if not sale.invoice_number:
            sale.invoice_number = _generate_invoice_number(sale.id)
        if not sale.receipt_number:
            sale.receipt_number = _generate_receipt_number(sale.id, sale.invoice_uuid)
        snapshot = _build_receipt_snapshot(
            sale, subtotal, 0,
            cashier.username if cashier else '',
            branch_obj.name if branch_obj else 'Main Branch',
            customer_name=customer.name if customer else None,
        )
        sale.receipt_snapshot = snapshot
        db.session.commit()

    from app.services.printer_service import PrinterService
    ok = PrinterService().print_receipt(dict(snapshot))
    db.session.add(AuditLog(
        user_id=current_user.id,
        action='sale.receipt_reprinted',
        entity_type='sale',
        entity_id=sale.id,
        details={
            'invoice_number': sale.invoice_number,
            'receipt_number': sale.receipt_number,
        },
    ))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({
        'message': 'Receipt sent to printer' if ok else 'Print failed or printer unavailable',
        'print_success': ok,
        'receipt': snapshot,
    }), 200


@sales_bp.route('/<int:sale_id>/return', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'cashier')
def return_sale_items(current_user, sale_id):
    """Partial or full item return with stock restore + audit."""
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)
    if sale.status == 'held':
        return error_response("Bad Request", "Cannot return a held sale", 400)

    data = request.get_json() or {}
    items_payload = data.get('items') or []
    if not items_payload:
        return error_response("Bad Request", "Select at least one item to return", 400)
    normalized = []
    for row in items_payload:
        normalized.append({
            'sale_item_id': int(row.get('sale_item_id') or row.get('id') or 0),
            'quantity': int(row.get('quantity') or 0),
        })
    return _process_return(current_user, sale, {
        'items': normalized,
        'refund_method': data.get('refund_method') or sale.payment_method,
        'reason': data.get('reason'),
        'action': 'sale.return',
    })


@sales_bp.route('/<int:sale_id>/refund', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'cashier')
def refund_sale(current_user, sale_id):
    """Full refund of all remaining returnable items."""
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)
    if sale.status == 'refunded':
        return error_response("Bad Request", "Sale already fully refunded", 400)

    items = []
    for si in sale.items:
        remaining = int(si.quantity) - int(getattr(si, 'quantity_returned', 0) or 0)
        if remaining > 0:
            items.append({'sale_item_id': si.id, 'quantity': remaining})
    if not items:
        return error_response("Bad Request", "Nothing left to refund", 400)

    data = request.get_json() or {}
    return _process_return(current_user, sale, {
        'items': items,
        'refund_method': data.get('refund_method') or sale.payment_method,
        'reason': data.get('reason') or 'Full refund',
        'action': 'sale.refund',
    })


def _process_return(current_user, sale, data):
    items_payload = data.get('items') or []
    action = data.get('action') or 'sale.return'
    try:
        refund_amount = 0.0
        return_rows = []
        for row in items_payload:
            sale_item = SaleItem.query.filter_by(id=int(row['sale_item_id']), sale_id=sale.id).first()
            if not sale_item:
                raise ValueError(f"Sale item {row.get('sale_item_id')} not found")
            qty = int(row['quantity'])
            if qty <= 0:
                raise ValueError('Return quantity must be positive')
            already = int(getattr(sale_item, 'quantity_returned', 0) or 0)
            remaining = int(sale_item.quantity) - already
            if qty > remaining:
                raise ValueError(f'Cannot return more than purchased (max {remaining})')
            line = qty * float(sale_item.unit_price)
            refund_amount += line
            return_rows.append((sale_item, qty, line))

        remaining_items = [
            si for si in sale.items
            if int(si.quantity) - int(getattr(si, 'quantity_returned', 0) or 0) > 0
        ]
        if len(return_rows) == len(remaining_items) and all(
            int(si.quantity) - int(getattr(si, 'quantity_returned', 0) or 0) == qty
            for si, qty, _ in return_rows
        ):
            prior = sum(float(r.refund_amount or 0) for r in (sale.returns or []))
            refund_amount = max(0.0, float(sale.total_amount) - prior)

        ret = SaleReturn(
            sale_id=sale.id,
            return_number=f'RET-{sale.id}-{int(datetime.utcnow().timestamp())}',
            refund_amount=refund_amount,
            refund_method=data.get('refund_method') or sale.payment_method,
            reason=(data.get('reason') or '').strip() or None,
            created_by=current_user.id,
        )
        db.session.add(ret)
        db.session.flush()
        for sale_item, qty, line in return_rows:
            db.session.add(SaleReturnItem(
                return_id=ret.id, sale_item_id=sale_item.id,
                quantity=qty, unit_price=sale_item.unit_price, subtotal=line,
            ))
            sale_item.quantity_returned = int(getattr(sale_item, 'quantity_returned', 0) or 0) + qty
            reason = 'refund' if action == 'sale.refund' else 'return_in'
            if sale_item.sku_id:
                restock_sku(
                    sale.branch_id, sale_item.sku_id, qty,
                    reason=reason, reference_type='sale_return',
                    reference_id=ret.id, user_id=current_user.id,
                    notes=f'{ret.return_number}',
                )
            elif sale_item.product_id:
                restock(
                    sale.branch_id, sale_item.product_id, qty,
                    reason=reason, variant=sale_item.variant or '',
                    reference_type='sale_return',
                    reference_id=ret.id, user_id=current_user.id,
                    notes=f'{ret.return_number}',
                )
        fully = all(
            int(si.quantity) <= int(getattr(si, 'quantity_returned', 0) or 0)
            for si in sale.items
        )
        sale.status = 'refunded' if fully else 'partially_returned'
        sale.updated_at = datetime.utcnow()
        db.session.add(AuditLog(
            user_id=current_user.id, action=action,
            entity_type='sale', entity_id=sale.id,
            details={'return_number': ret.return_number, 'refund_amount': float(refund_amount)},
        ))
        db.session.commit()
        return jsonify({
            'message': 'Return processed' if action == 'sale.return' else 'Refund processed',
            'return': {'id': ret.id, 'return_number': ret.return_number, 'refund_amount': float(ret.refund_amount)},
            'sale': _sale_detail_dict(sale),
        }), 201
    except ValueError as e:
        db.session.rollback()
        return error_response("Bad Request", str(e), 400)
    except Exception as e:
        db.session.rollback()
        return error_response("Internal Server Error", str(e), 500)


@sales_bp.route('/<int:sale_id>/rollback', methods=['POST'])
@token_required
def rollback_sale(current_user, sale_id):
    """Legacy full refund alias — restores stock via stock_service."""
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)
    if sale.status == 'refunded':
        return error_response("Bad Request", "Sale already refunded", 400)
    items = []
    for si in sale.items:
        remaining = int(si.quantity) - int(getattr(si, 'quantity_returned', 0) or 0)
        if remaining > 0:
            items.append({'sale_item_id': si.id, 'quantity': remaining})
    if not items:
        return error_response("Bad Request", "Nothing left to refund", 400)
    return _process_return(current_user, sale, {
        'items': items,
        'refund_method': sale.payment_method,
        'reason': 'Rollback',
    })
