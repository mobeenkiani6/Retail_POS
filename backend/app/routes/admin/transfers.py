from flask import jsonify, request
from datetime import datetime
import uuid
from app.models import (
    db, StockTransfer, StockTransferItem, CycleCount, CycleCountItem,
    Inventory, Product,
)
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.services.stock_service import adjust_stock
from app.services import event_bus


def _transfer_dict(t):
    return {
        'id': t.id,
        'transfer_number': t.transfer_number,
        'from_branch_id': t.from_branch_id,
        'to_branch_id': t.to_branch_id,
        'status': t.status,
        'notes': t.notes,
        'created_at': t.created_at.isoformat() if t.created_at else None,
        'received_at': t.received_at.isoformat() if t.received_at else None,
        'items': [{
            'id': i.id, 'product_id': i.product_id, 'sku_id': i.sku_id, 'quantity': i.quantity,
        } for i in t.items],
    }


@admin_bp.route('/transfers', methods=['GET'])
@token_required
@admin_access
def list_transfers(current_user):
    rows = StockTransfer.query.order_by(StockTransfer.created_at.desc()).limit(100).all()
    return jsonify([_transfer_dict(t) for t in rows]), 200


@admin_bp.route('/transfers', methods=['POST'])
@token_required
@admin_access
def create_transfer(current_user):
    data = request.get_json() or {}
    from_id = data.get('from_branch_id')
    to_id = data.get('to_branch_id')
    items = data.get('items') or []
    if not from_id or not to_id or from_id == to_id:
        return jsonify({'message': 'from_branch_id and to_branch_id required and must differ'}), 400
    if not items:
        return jsonify({'message': 'items required'}), 400

    t = StockTransfer(
        transfer_number=f'TRF-{uuid.uuid4().hex[:8].upper()}',
        from_branch_id=from_id,
        to_branch_id=to_id,
        status='draft',
        notes=data.get('notes'),
        created_by=current_user.id,
    )
    db.session.add(t)
    db.session.flush()
    for it in items:
        db.session.add(StockTransferItem(
            transfer_id=t.id,
            product_id=int(it['product_id']),
            sku_id=it.get('sku_id'),
            quantity=int(it.get('quantity') or 0),
        ))
    db.session.commit()
    return jsonify(_transfer_dict(t)), 201


@admin_bp.route('/transfers/<int:transfer_id>/ship', methods=['POST'])
@token_required
@admin_access
def ship_transfer(current_user, transfer_id):
    t = StockTransfer.query.get(transfer_id)
    if not t or t.status != 'draft':
        return jsonify({'message': 'Transfer not found or not in draft'}), 400
    try:
        for it in t.items:
            adjust_stock(
                t.from_branch_id, it.product_id, -it.quantity,
                reason='transfer_out', reference_type='stock_transfer',
                reference_id=t.id, user_id=current_user.id, sku_id=it.sku_id,
            )
        t.status = 'in_transit'
        db.session.commit()
        event_bus.inventory_changed(t.from_branch_id, reason='transfer_out')
        return jsonify(_transfer_dict(t)), 200
    except ValueError as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400


@admin_bp.route('/transfers/<int:transfer_id>/receive', methods=['POST'])
@token_required
@admin_access
def receive_transfer(current_user, transfer_id):
    t = StockTransfer.query.get(transfer_id)
    if not t or t.status != 'in_transit':
        return jsonify({'message': 'Transfer not in transit'}), 400
    for it in t.items:
        adjust_stock(
            t.to_branch_id, it.product_id, it.quantity,
            reason='transfer_in', reference_type='stock_transfer',
            reference_id=t.id, user_id=current_user.id, sku_id=it.sku_id,
        )
    t.status = 'received'
    t.received_at = datetime.utcnow()
    db.session.commit()
    event_bus.inventory_changed(t.to_branch_id, reason='transfer_in')
    return jsonify(_transfer_dict(t)), 200


@admin_bp.route('/cycle-counts', methods=['GET'])
@token_required
@admin_access
def list_cycle_counts(current_user):
    rows = CycleCount.query.order_by(CycleCount.created_at.desc()).limit(50).all()
    return jsonify([{
        'id': c.id, 'branch_id': c.branch_id, 'name': c.name, 'status': c.status,
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'item_count': len(c.items),
    } for c in rows]), 200


@admin_bp.route('/cycle-counts', methods=['POST'])
@token_required
@admin_access
def create_cycle_count(current_user):
    data = request.get_json() or {}
    branch_id = data.get('branch_id') or current_user.branch_id
    name = (data.get('name') or 'Cycle Count').strip()
    if not branch_id:
        return jsonify({'message': 'branch_id required'}), 400
    cc = CycleCount(branch_id=branch_id, name=name, created_by=current_user.id)
    db.session.add(cc)
    db.session.flush()
    inv_rows = Inventory.query.filter_by(branch_id=branch_id).all()
    for inv in inv_rows:
        db.session.add(CycleCountItem(
            cycle_count_id=cc.id,
            product_id=inv.product_id,
            sku_id=inv.sku_id,
            expected_qty=inv.stock_level or 0,
        ))
    db.session.commit()
    return jsonify({'id': cc.id, 'name': cc.name, 'items': len(cc.items)}), 201


@admin_bp.route('/cycle-counts/<int:cc_id>/items', methods=['PUT'])
@token_required
@admin_access
def update_cycle_count_items(current_user, cc_id):
    cc = CycleCount.query.get(cc_id)
    if not cc or cc.status != 'open':
        return jsonify({'message': 'Cycle count not open'}), 400
    data = request.get_json() or {}
    counts = {int(i['id']): int(i['counted_qty']) for i in (data.get('items') or []) if 'id' in i}
    for item in cc.items:
        if item.id in counts:
            item.counted_qty = counts[item.id]
            item.variance = (item.counted_qty or 0) - (item.expected_qty or 0)
    db.session.commit()
    return jsonify({'message': 'Updated', 'count': len(counts)}), 200


@admin_bp.route('/cycle-counts/<int:cc_id>/complete', methods=['POST'])
@token_required
@admin_access
def complete_cycle_count(current_user, cc_id):
    cc = CycleCount.query.get(cc_id)
    if not cc or cc.status != 'open':
        return jsonify({'message': 'Cycle count not open'}), 400
    apply_adj = bool((request.get_json() or {}).get('apply_adjustments', True))
    try:
        for item in cc.items:
            if item.counted_qty is None:
                continue
            variance = (item.counted_qty or 0) - (item.expected_qty or 0)
            item.variance = variance
            if apply_adj and variance != 0:
                adjust_stock(
                    cc.branch_id, item.product_id, variance,
                    reason='cycle_count', reference_type='cycle_count',
                    reference_id=cc.id, user_id=current_user.id, sku_id=item.sku_id,
                )
        cc.status = 'completed'
        cc.completed_at = datetime.utcnow()
        db.session.commit()
        event_bus.inventory_changed(cc.branch_id, reason='cycle_count')
        return jsonify({'message': 'Completed', 'id': cc.id}), 200
    except ValueError as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400
