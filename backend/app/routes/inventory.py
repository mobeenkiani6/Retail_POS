from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from app.models import db, Inventory, InventoryTransaction, Product, ProductSku
from app.services.sku_service import format_sku_display, sku_to_dict
from app.utils.auth_decorators import token_required, role_required
from app.services.stock_service import (
    adjust_stock, get_stock_map, MOVEMENT_REASONS, migrate_batches_to_inventory,
)
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

inventory_bp = Blueprint('inventory', __name__)


def _resolve_branch(current_user, branch_id=None):
    return resolve_branch_id(current_user, branch_id) or require_branch_id(current_user)


@inventory_bp.route('/', methods=['GET'])
@token_required
def get_inventory(current_user):
    branch_id = _resolve_branch(current_user, request.args.get('branch_id'))
    migrate_batches_to_inventory(db.session)
    totals, variants, sku_totals = get_stock_map(branch_id)
    return jsonify({
        'inventory': totals,
        'variant_inventory': variants,
        'sku_inventory': sku_totals,
        'branch_id': branch_id,
    }), 200


@inventory_bp.route('/summary', methods=['GET'])
@token_required
def inventory_summary(current_user):
    branch_id = _resolve_branch(current_user, request.args.get('branch_id'))
    rows = (
        db.session.query(Inventory, ProductSku, Product)
        .outerjoin(ProductSku, Inventory.sku_id == ProductSku.id)
        .join(Product, Inventory.product_id == Product.id)
        .filter(Inventory.branch_id == branch_id, Product.archived_at == None)
        .filter(Inventory.sku_id != None)
        .all()
    )
    total_skus = len(rows)
    total_units = sum(r.stock_level for r, _, _ in rows)
    total_value = sum(
        r.stock_level * float((sku.cost_price if sku else p.cost_price) or 0)
        for r, sku, p in rows
    )
    low_stock = []
    out_of_stock = []
    for r, sku, p in rows:
        min_s = (sku.min_stock if sku else p.min_stock) or 0
        label = format_sku_display(sku) if sku else p.name
        entry = {
            'product_id': p.id,
            'sku_id': sku.id if sku else None,
            'name': p.name,
            'display_label': label,
            'barcode': sku.barcode if sku else p.barcode,
            'stock_level': r.stock_level,
            'min_stock': min_s,
            'reorder_level': (sku.reorder_level if sku else p.reorder_qty) or 0,
        }
        if min_s > 0 and r.stock_level <= min_s:
            low_stock.append(entry)
        if r.stock_level == 0:
            out_of_stock.append(entry)
    return jsonify({
        'branch_id': branch_id,
        'total_skus': total_skus,
        'total_units': total_units,
        'total_value': round(total_value, 2),
        'low_stock': low_stock,
        'out_of_stock': out_of_stock,
        'low_stock_count': len(low_stock),
        'out_of_stock_count': len(out_of_stock),
    }), 200


@inventory_bp.route('/movements', methods=['GET'])
@token_required
def list_movements(current_user):
    branch_id = _resolve_branch(current_user, request.args.get('branch_id'))
    reason = request.args.get('reason') or request.args.get('movement_type')
    product_id = request.args.get('product_id', type=int)
    time_filter = request.args.get('time_filter', 'week')

    query = InventoryTransaction.query.filter_by(branch_id=branch_id)
    if reason:
        query = query.filter(InventoryTransaction.reason == reason)
    if product_id:
        query = query.filter(InventoryTransaction.product_id == product_id)

    now = datetime.utcnow()
    if time_filter == 'today':
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(InventoryTransaction.created_at >= start)
    elif time_filter == 'week':
        query = query.filter(InventoryTransaction.created_at >= now - timedelta(days=7))
    elif time_filter == 'month':
        query = query.filter(InventoryTransaction.created_at >= now - timedelta(days=30))

    txns = query.order_by(InventoryTransaction.created_at.desc()).limit(500).all()
    product_ids = {t.product_id for t in txns}
    products = {p.id: p for p in Product.query.filter(Product.id.in_(product_ids)).all()} if product_ids else {}

    return jsonify({'movements': [{
        'id': t.id,
        'product_id': t.product_id,
        'product_name': products[t.product_id].name if t.product_id in products else None,
        'variant': getattr(t, 'variant', '') or '',
        'delta': t.delta,
        'reason': t.reason,
        'reason_label': MOVEMENT_REASONS.get(t.reason, t.reason),
        'notes': t.notes,
        'reference_type': t.reference_type,
        'reference_id': t.reference_id,
        'user_id': t.user_id,
        'created_at': t.created_at.isoformat() if t.created_at else None,
    } for t in txns]}), 200


@inventory_bp.route('/adjust', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def adjust_inventory(current_user):
    data = request.get_json() or {}
    branch_id = _resolve_branch(current_user, data.get('branch_id'))
    product_id = data.get('product_id')
    sku_id = data.get('sku_id')
    variant = (data.get('variant') or '').strip()
    quantity_delta = int(data.get('quantity_delta', data.get('stock_delta', 0)))
    reason = data.get('reason') or data.get('movement_type', 'adjustment')
    notes = data.get('notes') or data.get('reason', '')

    if sku_id:
        sku = ProductSku.query.get(int(sku_id))
        if not sku:
            return error_response('Bad Request', 'SKU not found', 404)
        product_id = sku.product_id
    if not product_id:
        return error_response('Bad Request', 'product_id or sku_id required', 400)
    if quantity_delta == 0:
        return error_response('Bad Request', 'quantity_delta cannot be zero', 400)
    if reason not in MOVEMENT_REASONS:
        reason = 'adjustment'

    try:
        row = adjust_stock(
            branch_id, product_id, quantity_delta,
            reason=reason, reference_type='manual',
            user_id=current_user.id, notes=notes, variant=variant,
            sku_id=int(sku_id) if sku_id else None,
        )
        db.session.commit()
        return jsonify({
            'message': 'Inventory adjusted',
            'stock_level': row.stock_level,
            'sku_id': row.sku_id,
            'reason': reason,
        }), 200
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)
    except Exception as e:
        db.session.rollback()
        return error_response('Internal Server Error', str(e), 500)


@inventory_bp.route('/update', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_inventory(current_user):
    """Legacy alias for adjust."""
    data = request.get_json() or {}
    data['quantity_delta'] = int(data.get('stock_delta', data.get('quantity_delta', 0)))
    if 'reason' not in data:
        data['reason'] = 'adjustment'
    branch_id = _resolve_branch(current_user, data.get('branch_id'))
    product_id = data.get('product_id')
    quantity_delta = int(data.get('quantity_delta', 0))
    if not product_id or quantity_delta == 0:
        return error_response('Bad Request', 'product_id and stock_delta required', 400)
    try:
        row = adjust_stock(branch_id, product_id, quantity_delta, reason=data.get('reason', 'adjustment'), reference_type='manual', user_id=current_user.id)
        db.session.commit()
        return jsonify({'message': 'Stock updated', 'stock_level': row.stock_level}), 200
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)
