from flask import Blueprint, request, jsonify
from app.models import db, Product, ProductBatch, BatchMovement
from app.utils.auth_decorators import token_required, role_required
from app.services.fefo_service import batch_status, effective_sell_price, _get_expiry_config
from app.errors import error_response

batches_bp = Blueprint('batches', __name__)


def _batch_dict(batch):
    cfg = _get_expiry_config(batch.branch_id)
    status = batch_status(batch, cfg['near_expiry_days'])
    return {
        'id': batch.id,
        'product_id': batch.product_id,
        'product_name': batch.product.name if batch.product else None,
        'branch_id': batch.branch_id,
        'batch_number': batch.batch_number,
        'quantity': batch.quantity,
        'cost_price': float(batch.cost_price),
        'sell_price': float(batch.sell_price),
        'effective_price': effective_sell_price(batch, cfg['near_expiry_markdown_percent']),
        'expiry_date': batch.expiry_date.isoformat() if batch.expiry_date else None,
        'status': status,
        'markdown_percent': float(batch.markdown_percent or 0),
        'received_at': batch.received_at.isoformat() if batch.received_at else None,
    }


@batches_bp.route('/', methods=['GET'])
@token_required
def list_batches(current_user):
    branch_id = request.args.get('branch_id')
    product_id = request.args.get('product_id')
    search = request.args.get('search', '').strip()

    if current_user.role != 'owner':
        branch_id = current_user.branch_id
    elif branch_id:
        branch_id = int(branch_id)

    query = ProductBatch.query
    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    if product_id:
        query = query.filter_by(product_id=int(product_id))
    if search:
        query = query.join(Product).filter(
            db.or_(
                ProductBatch.batch_number.ilike(f'%{search}%'),
                Product.name.ilike(f'%{search}%'),
                Product.barcode.ilike(f'%{search}%'),
            )
        )

    batches = query.order_by(ProductBatch.expiry_date.asc().nullslast()).all()
    return jsonify({'batches': [_batch_dict(b) for b in batches]}), 200


@batches_bp.route('/<int:batch_id>', methods=['GET'])
@token_required
def get_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    if current_user.role != 'owner' and batch.branch_id != current_user.branch_id:
        return error_response('Forbidden', 'Unauthorized', 403)

    movements = BatchMovement.query.filter_by(batch_id=batch_id).order_by(BatchMovement.created_at.desc()).all()
    return jsonify({
        'batch': _batch_dict(batch),
        'movements': [
            {
                'id': m.id,
                'movement_type': m.movement_type,
                'quantity_delta': m.quantity_delta,
                'reference_type': m.reference_type,
                'reference_id': m.reference_id,
                'notes': m.notes,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            }
            for m in movements
        ],
    }), 200


@batches_bp.route('/by-product', methods=['GET'])
@token_required
def batches_by_product(current_user):
    branch_id = request.args.get('branch_id')
    if current_user.role != 'owner':
        branch_id = current_user.branch_id
    elif branch_id:
        branch_id = int(branch_id)

    products = Product.query.filter(Product.archived_at == None).all()
    result = []
    for product in products:
        q = ProductBatch.query.filter_by(product_id=product.id)
        if branch_id:
            q = q.filter_by(branch_id=branch_id)
        batches = q.order_by(ProductBatch.expiry_date.asc().nullslast()).all()
        total_qty = sum(b.quantity for b in batches)
        result.append({
            'product_id': product.id,
            'product_name': product.name,
            'barcode': product.barcode,
            'category_id': product.category_id,
            'base_price': float(product.base_price),
            'total_quantity': total_qty,
            'batches': [_batch_dict(b) for b in batches],
        })
    return jsonify({'products': result}), 200


@batches_bp.route('/<int:batch_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    if current_user.role != 'owner' and batch.branch_id != current_user.branch_id:
        return error_response('Forbidden', 'Unauthorized', 403)
    data = request.get_json() or {}
    if 'batch_number' in data:
        batch.batch_number = data['batch_number']
    if 'cost_price' in data:
        batch.cost_price = data['cost_price']
    if 'sell_price' in data:
        batch.sell_price = data['sell_price']
    if 'expiry_date' in data:
        batch.expiry_date = data['expiry_date'] if data['expiry_date'] else None
    if 'markdown_percent' in data:
        batch.markdown_percent = data['markdown_percent']
    db.session.commit()
    return jsonify({'batch': _batch_dict(batch)}), 200


@batches_bp.route('/<int:batch_id>/adjust', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def adjust_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    if current_user.role != 'owner' and batch.branch_id != current_user.branch_id:
        return error_response('Forbidden', 'Unauthorized', 403)
    data = request.get_json() or {}
    delta = int(data.get('quantity_delta', 0))
    reason = data.get('reason', 'adjustment')
    movement_type = data.get('movement_type', 'adjustment')
    if delta == 0:
        return error_response('Bad Request', 'quantity_delta required', 400)
    new_qty = batch.quantity + delta
    if new_qty < 0:
        return error_response('Bad Request', 'Insufficient stock', 400)
    batch.quantity = new_qty
    movement = BatchMovement(
        batch_id=batch.id,
        movement_type=movement_type,
        quantity_delta=delta,
        reference_type='manual',
        notes=reason,
        created_by=current_user.id,
    )
    db.session.add(movement)
    db.session.commit()
    return jsonify({'batch': _batch_dict(batch), 'message': 'Stock adjusted'}), 200


@batches_bp.route('/<int:batch_id>/transfer', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def transfer_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    data = request.get_json() or {}
    target_branch_id = data.get('target_branch_id')
    qty = int(data.get('quantity', 0))
    if not target_branch_id or qty <= 0:
        return error_response('Bad Request', 'target_branch_id and quantity required', 400)
    if qty > batch.quantity:
        return error_response('Bad Request', 'Insufficient stock', 400)
    batch.quantity -= qty
    target = ProductBatch.query.filter_by(
        branch_id=target_branch_id,
        product_id=batch.product_id,
        batch_number=batch.batch_number,
    ).first()
    if target:
        target.quantity += qty
    else:
        target = ProductBatch(
            branch_id=target_branch_id,
            product_id=batch.product_id,
            batch_number=batch.batch_number,
            quantity=qty,
            cost_price=batch.cost_price,
            sell_price=batch.sell_price,
            expiry_date=batch.expiry_date,
        )
        db.session.add(target)
        db.session.flush()
    db.session.add(BatchMovement(batch_id=batch.id, movement_type='transfer_out', quantity_delta=-qty, reference_type='transfer', notes=f'To branch {target_branch_id}', created_by=current_user.id))
    db.session.add(BatchMovement(batch_id=target.id, movement_type='transfer_in', quantity_delta=qty, reference_type='transfer', notes=f'From branch {batch.branch_id}', created_by=current_user.id))
    db.session.commit()
    return jsonify({'message': 'Transfer complete'}), 200


@batches_bp.route('/<int:batch_id>/split', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def split_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    data = request.get_json() or {}
    new_batch_number = data.get('new_batch_number')
    qty = int(data.get('quantity', 0))
    if not new_batch_number or qty <= 0:
        return error_response('Bad Request', 'new_batch_number and quantity required', 400)
    if qty > batch.quantity:
        return error_response('Bad Request', 'Insufficient stock', 400)
    existing = ProductBatch.query.filter_by(branch_id=batch.branch_id, product_id=batch.product_id, batch_number=new_batch_number).first()
    if existing:
        return error_response('Bad Request', 'Batch number already exists', 409)
    batch.quantity -= qty
    new_batch = ProductBatch(
        branch_id=batch.branch_id,
        product_id=batch.product_id,
        batch_number=new_batch_number,
        quantity=qty,
        cost_price=batch.cost_price,
        sell_price=batch.sell_price,
        expiry_date=data.get('expiry_date') or batch.expiry_date,
    )
    db.session.add(new_batch)
    db.session.flush()
    db.session.add(BatchMovement(batch_id=batch.id, movement_type='split_out', quantity_delta=-qty, reference_type='split', reference_id=new_batch.id, created_by=current_user.id))
    db.session.add(BatchMovement(batch_id=new_batch.id, movement_type='split_in', quantity_delta=qty, reference_type='split', reference_id=batch.id, created_by=current_user.id))
    db.session.commit()
    return jsonify({'batch': _batch_dict(new_batch), 'message': 'Batch split'}), 201


@batches_bp.route('/merge', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def merge_batches(current_user):
    data = request.get_json() or {}
    source_ids = data.get('source_batch_ids', [])
    target_batch_id = data.get('target_batch_id')
    if not source_ids or not target_batch_id:
        return error_response('Bad Request', 'source_batch_ids and target_batch_id required', 400)
    target = ProductBatch.query.get_or_404(target_batch_id)
    for sid in source_ids:
        if sid == target_batch_id:
            continue
        source = ProductBatch.query.get(sid)
        if not source or source.product_id != target.product_id:
            continue
        target.quantity += source.quantity
        db.session.add(BatchMovement(batch_id=source.id, movement_type='merge_out', quantity_delta=-source.quantity, reference_type='merge', reference_id=target.id, created_by=current_user.id))
        source.quantity = 0
    db.session.add(BatchMovement(batch_id=target.id, movement_type='merge_in', quantity_delta=0, reference_type='merge', notes=f'Merged from {source_ids}', created_by=current_user.id))
    db.session.commit()
    return jsonify({'batch': _batch_dict(target), 'message': 'Batches merged'}), 200


@batches_bp.route('/<int:batch_id>', methods=['DELETE'])
@token_required
@role_required('owner', 'manager')
def delete_batch(current_user, batch_id):
    batch = ProductBatch.query.get_or_404(batch_id)
    if batch.quantity > 0:
        return error_response('Bad Request', 'Cannot delete batch with remaining stock. Adjust to zero first.', 400)
    db.session.delete(batch)
    db.session.commit()
    return jsonify({'message': 'Batch deleted'}), 200
