from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Supplier, GoodsReceivedNote
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response

suppliers_bp = Blueprint('suppliers', __name__)


def _supplier_dict(s):
    return {
        'id': s.id,
        'name': s.name,
        'contact_name': s.contact_name or '',
        'email': s.email or '',
        'phone': s.phone or '',
        'address': s.address or '',
        'notes': getattr(s, 'notes', None) or '',
        'outstanding_balance': float(getattr(s, 'outstanding_balance', 0) or 0),
        'grn_count': GoodsReceivedNote.query.filter_by(supplier_id=s.id).count(),
        'status': 'archived' if s.archived_at else 'active',
        'archived_at': s.archived_at.isoformat() if s.archived_at else None,
        'created_at': s.created_at.isoformat() if s.created_at else None,
    }


@suppliers_bp.route('/', methods=['GET'])
@token_required
def list_suppliers(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    search = request.args.get('search', '').strip()
    query = Supplier.query
    if not include_archived:
        query = query.filter(Supplier.archived_at == None)
    if search:
        query = query.filter(
            db.or_(
                Supplier.name.ilike(f'%{search}%'),
                Supplier.contact_name.ilike(f'%{search}%'),
                Supplier.email.ilike(f'%{search}%'),
            )
        )
    suppliers = query.order_by(Supplier.name).all()
    return jsonify({'suppliers': [_supplier_dict(s) for s in suppliers]}), 200


@suppliers_bp.route('/<int:supplier_id>', methods=['GET'])
@token_required
def get_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    grns = GoodsReceivedNote.query.filter_by(supplier_id=supplier_id).order_by(GoodsReceivedNote.created_at.desc()).limit(20).all()
    return jsonify({
        'supplier': _supplier_dict(supplier),
        'recent_grns': [{'id': g.id, 'grn_number': g.grn_number, 'status': g.status, 'created_at': g.created_at.isoformat() if g.created_at else None} for g in grns],
    }), 200


@suppliers_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_supplier(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return error_response('Bad Request', 'Name is required', 400)
    supplier = Supplier(
        name=name,
        contact_name=data.get('contact_name'),
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        notes=data.get('notes'),
        outstanding_balance=data.get('outstanding_balance', 0),
    )
    db.session.add(supplier)
    db.session.commit()
    return jsonify({'supplier': _supplier_dict(supplier)}), 201


@suppliers_bp.route('/<int:supplier_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.get_json() or {}
    for field in ('name', 'contact_name', 'email', 'phone', 'address', 'notes'):
        if field in data:
            setattr(supplier, field, data[field])
    if 'outstanding_balance' in data:
        supplier.outstanding_balance = data['outstanding_balance']
    db.session.commit()
    return jsonify({'supplier': _supplier_dict(supplier)}), 200


@suppliers_bp.route('/<int:supplier_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    supplier.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Supplier archived', 'supplier': _supplier_dict(supplier)}), 200


@suppliers_bp.route('/<int:supplier_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def restore_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    supplier.archived_at = None
    db.session.commit()
    return jsonify({'supplier': _supplier_dict(supplier)}), 200


@suppliers_bp.route('/<int:supplier_id>', methods=['DELETE'])
@token_required
@role_required('owner')
def delete_supplier(current_user, supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    if GoodsReceivedNote.query.filter_by(supplier_id=supplier.id).count() > 0:
        return error_response('Conflict', 'Supplier has GRNs. Archive instead.', 409)
    db.session.delete(supplier)
    db.session.commit()
    return jsonify({'message': 'Supplier deleted'}), 200
