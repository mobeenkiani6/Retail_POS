from flask import Blueprint, request, jsonify
from sqlalchemy import func
from datetime import datetime, timedelta, time
import uuid
from app.models import db, Sale, SaleItem, Product, ProductSku, Setting, AuditLog, Customer
from app.utils.product_variants import resolve_variant_pricing
from app.utils.auth_decorators import token_required, owner_required
from app.services.stock_service import deduct_stock, get_stock_level, get_sku_stock_level
from app.services.sync_service import enqueue_sale
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

sales_bp = Blueprint('sales', __name__)


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
            total_amount=0,
            tax_amount=0,
            cogs_amount=0,
            payment_method=data['payment_method'],
            customer_id=customer.id if customer else None,
        )
        db.session.add(new_sale)
        db.session.flush()

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

        if data.get('payment_method') == 'Cash':
            try:
                cash_received = float(data.get('cash_received', 0) or 0)
            except (TypeError, ValueError):
                raise ValueError('Invalid cash received amount')
            if cash_received < float(new_sale.total_amount):
                raise ValueError(
                    f'Cash received ({cash_received:.2f}) is less than total ({float(new_sale.total_amount):.2f})'
                )

        audit = AuditLog(
            user_id=current_user.id,
            action='sale.completed',
            entity_type='sale',
            entity_id=new_sale.id,
            details={'invoice_uuid': invoice_uuid, 'total': float(new_sale.total_amount)},
        )
        db.session.add(audit)
        db.session.flush()

        enqueue_sale(new_sale)
        db.session.commit()

        from app.services.printer_service import PrinterService
        printer_service = PrinterService()
        from app.models import Branch
        branch_obj = Branch.query.get(branch_id)
        receipt_items = []
        for si in new_sale.items:
            title = si.product.name if si.product else 'Item'
            receipt_items.append({'title': title, 'quantity': si.quantity, 'unit_price': float(si.unit_price)})
        receipt_data = {
            'total': float(new_sale.total_amount),
            'subtotal': float(total_amount),
            'tax_amount': float(new_sale.tax_amount),
            'tax_rate': tax_rate,
            'discount_amount': float(discount_amount),
            'operator': current_user.username,
            'branch': branch_obj.name if branch_obj else 'Main Branch',
            'branch_id': branch_id,
            'items': receipt_items,
        }
        print_success = printer_service.print_receipt(receipt_data)

        return jsonify({
            "message": "Checkout successful",
            "sale_id": new_sale.id,
            "invoice_uuid": new_sale.invoice_uuid,
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
    elif time_filter == 'week':
        start_of_week = local_now - timedelta(days=local_now.weekday())
        start_dt = datetime.combine(start_of_week.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
    elif time_filter == 'month':
        start_of_month = local_now.replace(day=1)
        start_dt = datetime.combine(start_of_month.date(), time.min) - tz_offset
        end_dt = datetime.combine(local_now.date(), time.max) - tz_offset
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

    query = Sale.query.filter(Sale.archived_at == None)
    if current_user.role != 'owner':
        query = query.filter_by(branch_id=current_user.branch_id)
    elif branch_id:
        query = query.filter_by(branch_id=branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)

    sales = query.order_by(Sale.created_at.desc()).all()
    return jsonify({'sales': [{
        'id': s.id,
        'invoice_uuid': s.invoice_uuid,
        'branch_id': s.branch_id,
        'total_amount': float(s.total_amount),
        'cogs_amount': float(s.cogs_amount or 0),
        'created_at': s.created_at.isoformat(),
        'payment_method': s.payment_method,
        'status': s.status,
        'synced_at': s.synced_at.isoformat() if s.synced_at else None,
    } for s in sales]}), 200


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
    return jsonify({
        'id': sale.id,
        'invoice_uuid': sale.invoice_uuid,
        'total_amount': float(sale.total_amount),
        'cogs_amount': float(sale.cogs_amount or 0),
        'items': [{
            'product_id': i.product_id,
            'batch_id': i.batch_id,
            'product_title': i.product.name if i.product else 'Unknown',
            'quantity': i.quantity,
            'unit_price': float(i.unit_price),
            'cost_price': float(i.cost_price),
            'subtotal': float(i.subtotal),
        } for i in sale.items],
    }), 200


@sales_bp.route('/<int:sale_id>/rollback', methods=['POST'])
@token_required
def rollback_sale(current_user, sale_id):
    from app.models import BatchMovement
    sale = Sale.query.get_or_404(sale_id)
    if current_user.role != 'owner' and sale.branch_id != current_user.branch_id:
        return error_response("Forbidden", "Unauthorized", 403)
    if sale.status == 'refunded':
        return error_response("Bad Request", "Sale already refunded", 400)
    try:
        sale.status = 'refunded'
        for item in sale.items:
            if item.batch_id:
                batch = ProductBatch.query.get(item.batch_id)
                if batch:
                    batch.quantity += item.quantity
                    db.session.add(BatchMovement(
                        batch_id=batch.id,
                        movement_type='return_in',
                        quantity_delta=item.quantity,
                        reference_type='sale',
                        reference_id=sale.id,
                        created_by=current_user.id,
                    ))
        db.session.commit()
        return jsonify({"message": "Sale rolled back successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return error_response("Internal Server Error", str(e), 500)
