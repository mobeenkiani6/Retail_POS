from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Category, Product
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response

categories_bp = Blueprint('categories', __name__)


def _cat_dict(c):
    return {
        'id': c.id,
        'name': c.name,
        'description': c.description or '',
        'parent_id': getattr(c, 'parent_id', None),
        'parent_name': c.parent.name if getattr(c, 'parent', None) else None,
        'sort_order': getattr(c, 'sort_order', 0) or 0,
        'icon': getattr(c, 'icon', None) or '',
        'image_url': getattr(c, 'image_url', None) or '',
        'product_count': Product.query.filter_by(category_id=c.id, archived_at=None).count(),
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'archived_at': c.archived_at.isoformat() if c.archived_at else None,
        'status': 'archived' if c.archived_at else 'active',
    }


@categories_bp.route('/', methods=['GET'])
@token_required
def list_categories(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    query = Category.query
    if not include_archived:
        query = query.filter(Category.archived_at == None)
    if search:
        query = query.filter(Category.name.ilike(f'%{search}%'))
    cats = query.order_by(Category.sort_order, Category.name).all()
    return jsonify({'categories': [_cat_dict(c) for c in cats]}), 200


@categories_bp.route('/<int:cat_id>', methods=['GET'])
@token_required
def get_category(current_user, cat_id):
    cat = Category.query.get_or_404(cat_id)
    return jsonify({'category': _cat_dict(cat)}), 200


@categories_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_category(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return error_response('Bad Request', 'Name is required', 400)
    if Category.query.filter_by(name=name).first():
        return error_response('Conflict', 'Category already exists', 409)
    cat = Category(
        name=name,
        description=data.get('description'),
        parent_id=data.get('parent_id'),
        sort_order=int(data.get('sort_order', 0) or 0),
        icon=data.get('icon'),
        image_url=data.get('image_url'),
    )
    db.session.add(cat)
    db.session.commit()
    return jsonify({'category': _cat_dict(cat)}), 201


@categories_bp.route('/<int:cat_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_category(current_user, cat_id):
    cat = Category.query.get_or_404(cat_id)
    data = request.get_json() or {}
    if 'name' in data:
        name = data['name'].strip()
        existing = Category.query.filter_by(name=name).first()
        if existing and existing.id != cat.id:
            return error_response('Conflict', 'Category name already exists', 409)
        cat.name = name
    for field in ('description', 'parent_id', 'icon', 'image_url'):
        if field in data:
            setattr(cat, field, data[field])
    if 'sort_order' in data:
        cat.sort_order = int(data['sort_order'] or 0)
    db.session.commit()
    return jsonify({'category': _cat_dict(cat)}), 200


@categories_bp.route('/<int:cat_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_category(current_user, cat_id):
    cat = Category.query.get_or_404(cat_id)
    cat.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Category archived', 'category': _cat_dict(cat)}), 200


@categories_bp.route('/<int:cat_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def restore_category(current_user, cat_id):
    cat = Category.query.get_or_404(cat_id)
    cat.archived_at = None
    db.session.commit()
    return jsonify({'category': _cat_dict(cat)}), 200


@categories_bp.route('/<int:cat_id>', methods=['DELETE'])
@token_required
@role_required('owner')
def delete_category(current_user, cat_id):
    cat = Category.query.get_or_404(cat_id)
    if Product.query.filter_by(category_id=cat.id).count() > 0:
        return error_response('Conflict', 'Category has products. Archive instead.', 409)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'message': 'Category deleted'}), 200
