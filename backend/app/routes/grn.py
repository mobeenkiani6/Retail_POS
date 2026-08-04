from flask import Blueprint, request, jsonify
from app.models import db, GoodsReceivedNote
from app.utils.auth_decorators import token_required, role_required
from app.services.grn_service import create_grn, receive_grn, cancel_grn, grn_to_dict
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

grn_bp = Blueprint('grn', __name__)


def _resolve_branch(current_user, data):
    requested = data.get('branch_id') if data else None
    return resolve_branch_id(current_user, requested) or require_branch_id(current_user)


@grn_bp.route('/', methods=['GET'])
@token_required
def list_grns(current_user):
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))
    query = GoodsReceivedNote.query
    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    grns = query.order_by(GoodsReceivedNote.created_at.desc()).all()
    return jsonify({'grns': [grn_to_dict(g) for g in grns]}), 200


@grn_bp.route('/<int:grn_id>', methods=['GET'])
@token_required
def get_grn(current_user, grn_id):
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if current_user.role != 'owner' and grn.branch_id != current_user.branch_id:
        return error_response('Forbidden', 'Unauthorized', 403)
    return jsonify({'grn': grn_to_dict(grn)}), 200


@grn_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_grn_route(current_user):
    data = request.get_json() or {}
    branch_id = _resolve_branch(current_user, data)
    items = data.get('items', [])
    try:
        grn = create_grn(
            branch_id=branch_id,
            supplier_id=data.get('supplier_id'),
            items=items,
            user_id=current_user.id,
            notes=data.get('notes'),
        )
        return jsonify({'grn': grn_to_dict(grn)}), 201
    except ValueError as e:
        return error_response('Bad Request', str(e), 400)


@grn_bp.route('/<int:grn_id>/receive', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def receive_grn_route(current_user, grn_id):
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if current_user.role != 'owner' and grn.branch_id != current_user.branch_id:
        return error_response('Forbidden', 'Unauthorized', 403)
    try:
        grn = receive_grn(grn_id, current_user.id)
        return jsonify({'grn': grn_to_dict(grn), 'message': 'GRN received successfully'}), 200
    except ValueError as e:
        return error_response('Bad Request', str(e), 400)


@grn_bp.route('/<int:grn_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_grn_route(current_user, grn_id):
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if grn.status != 'draft':
        return error_response('Bad Request', 'Only draft GRNs can be edited', 400)
    data = request.get_json() or {}
    if 'supplier_id' in data:
        grn.supplier_id = data['supplier_id']
    if 'notes' in data:
        grn.notes = data['notes']
    if 'items' in data:
        from app.models import GRNItem
        GRNItem.query.filter_by(grn_id=grn.id).delete()
        for item in data['items']:
            sku_id = item.get('sku_id')
            product_id = item['product_id']
            if sku_id:
                from app.models import ProductSku
                sku = ProductSku.query.get(int(sku_id))
                if sku:
                    product_id = sku.product_id
            grn_item = GRNItem(
                grn_id=grn.id,
                product_id=product_id,
                sku_id=int(sku_id) if sku_id else None,
                batch_number=item.get('batch_number') or 'N/A',
                quantity=int(item['quantity']),
                cost_price=item['cost_price'],
                sell_price=item.get('sell_price', 0),
                expiry_date=item.get('expiry_date'),
            )
            db.session.add(grn_item)
    db.session.commit()
    return jsonify({'grn': grn_to_dict(grn)}), 200


@grn_bp.route('/<int:grn_id>', methods=['DELETE'])
@token_required
@role_required('owner', 'manager')
def delete_grn_route(current_user, grn_id):
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if grn.status == 'received':
        return error_response('Bad Request', 'Cannot delete received GRN', 400)
    db.session.delete(grn)
    db.session.commit()
    return jsonify({'message': 'GRN deleted'}), 200


@grn_bp.route('/<int:grn_id>/duplicate', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def duplicate_grn_route(current_user, grn_id):
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    items = [{
        'product_id': i.product_id,
        'sku_id': i.sku_id,
        'quantity': i.quantity,
        'cost_price': float(i.cost_price),
        'sell_price': float(i.sell_price),
    } for i in grn.items]
    new_grn = create_grn(grn.branch_id, grn.supplier_id, items, current_user.id, notes=f'Duplicated from {grn.grn_number}')
    return jsonify({'grn': grn_to_dict(new_grn)}), 201


@grn_bp.route('/<int:grn_id>/cancel', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def cancel_grn_route(current_user, grn_id):
    try:
        grn = cancel_grn(grn_id)
        return jsonify({'grn': grn_to_dict(grn), 'message': 'GRN cancelled'}), 200
    except ValueError as e:
        return error_response('Bad Request', str(e), 400)
