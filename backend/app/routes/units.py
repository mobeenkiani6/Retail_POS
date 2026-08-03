from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Unit, Product
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response

units_bp = Blueprint('units', __name__)


def _unit_dict(u):
    return {
        'id': u.id,
        'name': u.name,
        'abbreviation': u.abbreviation,
        'is_default': bool(u.is_default),
        'active': bool(u.active),
        'archived_at': u.archived_at.isoformat() if u.archived_at else None,
        'created_at': u.created_at.isoformat() if u.created_at else None,
    }


@units_bp.route('/', methods=['GET'])
@token_required
def list_units(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    query = Unit.query
    if not include_archived:
        query = query.filter(Unit.archived_at == None)
    if search:
        query = query.filter(
            db.or_(Unit.name.ilike(f'%{search}%'), Unit.abbreviation.ilike(f'%{search}%'))
        )
    units = query.order_by(Unit.is_default.desc(), Unit.name).all()
    return jsonify({'units': [_unit_dict(u) for u in units]}), 200


@units_bp.route('/<int:unit_id>', methods=['GET'])
@token_required
def get_unit(current_user, unit_id):
    unit = Unit.query.get_or_404(unit_id)
    return jsonify({'unit': _unit_dict(unit)}), 200


@units_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_unit(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    abbreviation = (data.get('abbreviation') or '').strip()
    if not name or not abbreviation:
        return error_response('Bad Request', 'Name and abbreviation are required', 400)
    if Unit.query.filter_by(name=name).first():
        return error_response('Conflict', 'Unit already exists', 409)
    if data.get('is_default'):
        Unit.query.update({'is_default': False})
    unit = Unit(
        name=name,
        abbreviation=abbreviation,
        is_default=bool(data.get('is_default')),
        active=bool(data.get('active', True)),
    )
    db.session.add(unit)
    db.session.commit()
    return jsonify({'unit': _unit_dict(unit)}), 201


@units_bp.route('/<int:unit_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_unit(current_user, unit_id):
    unit = Unit.query.get_or_404(unit_id)
    data = request.get_json() or {}
    if 'name' in data:
        name = data['name'].strip()
        existing = Unit.query.filter_by(name=name).first()
        if existing and existing.id != unit.id:
            return error_response('Conflict', 'Unit name already exists', 409)
        unit.name = name
    if 'abbreviation' in data:
        unit.abbreviation = data['abbreviation'].strip()
    if 'active' in data:
        unit.active = bool(data['active'])
    if data.get('is_default'):
        Unit.query.filter(Unit.id != unit.id).update({'is_default': False})
        unit.is_default = True
    elif 'is_default' in data:
        unit.is_default = bool(data['is_default'])
    db.session.commit()
    return jsonify({'unit': _unit_dict(unit)}), 200


@units_bp.route('/<int:unit_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_unit(current_user, unit_id):
    unit = Unit.query.get_or_404(unit_id)
    if Product.query.filter_by(unit_id=unit.id).count() > 0:
        return error_response('Conflict', 'Unit is used by products. Deactivate instead.', 409)
    unit.archived_at = datetime.utcnow()
    unit.active = False
    db.session.commit()
    return jsonify({'message': 'Unit archived', 'unit': _unit_dict(unit)}), 200


@units_bp.route('/<int:unit_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def restore_unit(current_user, unit_id):
    unit = Unit.query.get_or_404(unit_id)
    unit.archived_at = None
    unit.active = True
    db.session.commit()
    return jsonify({'unit': _unit_dict(unit)}), 200


@units_bp.route('/<int:unit_id>', methods=['DELETE'])
@token_required
@role_required('owner')
def delete_unit(current_user, unit_id):
    unit = Unit.query.get_or_404(unit_id)
    if Product.query.filter_by(unit_id=unit.id).count() > 0:
        return error_response('Conflict', 'Unit is used by products', 409)
    db.session.delete(unit)
    db.session.commit()
    return jsonify({'message': 'Unit deleted'}), 200
