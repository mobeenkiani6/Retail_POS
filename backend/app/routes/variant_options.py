from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, VariantOption, Product
from app.utils.product_variants import variant_names_from_product
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response

variant_options_bp = Blueprint('variant_options', __name__)


def _option_dict(o):
    return {
        'id': o.id,
        'name': o.name,
        'sort_order': o.sort_order or 0,
        'active': bool(o.active),
        'archived_at': o.archived_at.isoformat() if o.archived_at else None,
        'created_at': o.created_at.isoformat() if o.created_at else None,
    }


@variant_options_bp.route('/', methods=['GET'])
@token_required
def list_variant_options(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    query = VariantOption.query
    if not include_archived:
        query = query.filter(VariantOption.archived_at == None)
    if search:
        query = query.filter(VariantOption.name.ilike(f'%{search}%'))
    options = query.order_by(VariantOption.sort_order, VariantOption.name).all()
    return jsonify({'variant_options': [_option_dict(o) for o in options]}), 200


@variant_options_bp.route('/<int:option_id>', methods=['GET'])
@token_required
def get_variant_option(current_user, option_id):
    option = VariantOption.query.get_or_404(option_id)
    return jsonify({'variant_option': _option_dict(option)}), 200


@variant_options_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_variant_option(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return error_response('Bad Request', 'Name is required', 400)
    if VariantOption.query.filter_by(name=name).first():
        return error_response('Conflict', 'Variant option already exists', 409)
    option = VariantOption(
        name=name,
        sort_order=int(data.get('sort_order', 0) or 0),
        active=bool(data.get('active', True)),
    )
    db.session.add(option)
    db.session.commit()
    return jsonify({'variant_option': _option_dict(option)}), 201


@variant_options_bp.route('/<int:option_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_variant_option(current_user, option_id):
    option = VariantOption.query.get_or_404(option_id)
    data = request.get_json() or {}
    if 'name' in data:
        name = data['name'].strip()
        existing = VariantOption.query.filter_by(name=name).first()
        if existing and existing.id != option.id:
            return error_response('Conflict', 'Variant option name already exists', 409)
        option.name = name
    if 'sort_order' in data:
        option.sort_order = int(data['sort_order'] or 0)
    if 'active' in data:
        option.active = bool(data['active'])
    db.session.commit()
    return jsonify({'variant_option': _option_dict(option)}), 200


@variant_options_bp.route('/<int:option_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_variant_option(current_user, option_id):
    option = VariantOption.query.get_or_404(option_id)
    option.archived_at = datetime.utcnow()
    option.active = False
    db.session.commit()
    return jsonify({'message': 'Variant option archived', 'variant_option': _option_dict(option)}), 200


@variant_options_bp.route('/<int:option_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def restore_variant_option(current_user, option_id):
    option = VariantOption.query.get_or_404(option_id)
    option.archived_at = None
    option.active = True
    db.session.commit()
    return jsonify({'variant_option': _option_dict(option)}), 200


@variant_options_bp.route('/<int:option_id>', methods=['DELETE'])
@token_required
@role_required('owner')
def delete_variant_option(current_user, option_id):
    option = VariantOption.query.get_or_404(option_id)
    products = Product.query.all()
    in_use = any(option.name in variant_names_from_product(p) for p in products)
    if in_use:
        return error_response('Conflict', 'Variant option is used by products. Archive instead.', 409)
    db.session.delete(option)
    db.session.commit()
    return jsonify({'message': 'Variant option deleted'}), 200
