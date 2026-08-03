from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Brand, Product
from app.utils.auth_decorators import token_required, role_required, owner_required
from app.errors import error_response

brands_bp = Blueprint('brands', __name__)


def _brand_dict(b):
    count = Product.query.filter_by(brand_id=b.id, archived_at=None).count()
    return {
        'id': b.id,
        'name': b.name,
        'description': b.description or '',
        'logo_url': b.logo_url or '',
        'product_count': count,
        'archived_at': b.archived_at.isoformat() if b.archived_at else None,
        'created_at': b.created_at.isoformat() if b.created_at else None,
    }


@brands_bp.route('/', methods=['GET'])
@token_required
def list_brands(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    query = Brand.query
    if not include_archived:
        query = query.filter(Brand.archived_at == None)
    if search:
        query = query.filter(Brand.name.ilike(f'%{search}%'))
    brands = query.order_by(Brand.name).all()
    return jsonify({'brands': [_brand_dict(b) for b in brands]}), 200


@brands_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_brand(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return error_response('Bad Request', 'Name is required', 400)
    if Brand.query.filter_by(name=name).first():
        return error_response('Conflict', 'Brand already exists', 409)
    brand = Brand(
        name=name,
        description=(data.get('description') or '').strip() or None,
        logo_url=(data.get('logo_url') or '').strip() or None,
    )
    db.session.add(brand)
    db.session.commit()
    return jsonify({'brand': _brand_dict(brand)}), 201


@brands_bp.route('/<int:brand_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_brand(current_user, brand_id):
    brand = Brand.query.get_or_404(brand_id)
    data = request.get_json() or {}
    name = (data.get('name') or brand.name).strip()
    if name != brand.name and Brand.query.filter_by(name=name).first():
        return error_response('Conflict', 'Brand name already exists', 409)
    brand.name = name
    brand.description = (data.get('description') or '').strip() or None
    brand.logo_url = (data.get('logo_url') or '').strip() or None
    db.session.commit()
    return jsonify({'brand': _brand_dict(brand)}), 200


@brands_bp.route('/<int:brand_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_brand(current_user, brand_id):
    brand = Brand.query.get_or_404(brand_id)
    brand.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'brand': _brand_dict(brand)}), 200


@brands_bp.route('/<int:brand_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def restore_brand(current_user, brand_id):
    brand = Brand.query.get_or_404(brand_id)
    brand.archived_at = None
    db.session.commit()
    return jsonify({'brand': _brand_dict(brand)}), 200


@brands_bp.route('/<int:brand_id>', methods=['DELETE'])
@token_required
@owner_required
def delete_brand(current_user, brand_id):
    brand = Brand.query.get_or_404(brand_id)
    Product.query.filter_by(brand_id=brand.id).update({'brand_id': None})
    db.session.delete(brand)
    db.session.commit()
    return jsonify({'message': 'Brand deleted'}), 200


@brands_bp.route('/<int:brand_id>/duplicate', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def duplicate_brand(current_user, brand_id):
    brand = Brand.query.get_or_404(brand_id)
    suffix = 1
    new_name = f'{brand.name} (Copy)'
    while Brand.query.filter_by(name=new_name).first():
        suffix += 1
        new_name = f'{brand.name} (Copy {suffix})'
    dup = Brand(name=new_name, description=brand.description, logo_url=brand.logo_url)
    db.session.add(dup)
    db.session.commit()
    return jsonify({'brand': _brand_dict(dup)}), 201
