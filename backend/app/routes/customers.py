from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Customer, Sale, AuditLog
from app.utils.auth_decorators import token_required, role_required
from app.errors import error_response

customers_bp = Blueprint('customers', __name__)


def _customer_dict(c):
    return {
        'id': c.id,
        'name': c.name,
        'email': c.email or '',
        'phone': c.phone or '',
        'loyalty_points': c.loyalty_points or 0,
        'birthday': getattr(c, 'birthday', None),
        'store_credit': float(getattr(c, 'store_credit', 0) or 0),
        'notes': getattr(c, 'notes', '') or '',
        'archived_at': c.archived_at.isoformat() if getattr(c, 'archived_at', None) else None,
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


@customers_bp.route('/', methods=['GET'])
@token_required
def list_customers(current_user):
    search = request.args.get('search', '').strip()
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true')
    query = Customer.query
    if not include_archived and hasattr(Customer, 'archived_at'):
        query = query.filter(Customer.archived_at == None)
    if search:
        query = query.filter(
            db.or_(
                Customer.name.ilike(f'%{search}%'),
                Customer.email.ilike(f'%{search}%'),
                Customer.phone.ilike(f'%{search}%'),
            )
        )
    customers = query.order_by(Customer.name).all()
    return jsonify({'customers': [_customer_dict(c) for c in customers]}), 200


@customers_bp.route('/<int:customer_id>', methods=['GET'])
@token_required
def get_customer(current_user, customer_id):
    customer = Customer.query.get_or_404(customer_id)
    sales = Sale.query.filter_by(customer_id=customer_id).order_by(Sale.created_at.desc()).limit(20).all() if hasattr(Sale, 'customer_id') else []
    return jsonify({
        'customer': _customer_dict(customer),
        'recent_sales': [{'id': s.id, 'total': float(s.total_amount), 'created_at': s.created_at.isoformat()} for s in sales],
    }), 200


@customers_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'cashier')
def create_customer(current_user):
    data = request.get_json() or {}
    if not data.get('name'):
        return error_response('Bad Request', 'Name is required', 400)
    customer = Customer(
        name=data['name'],
        email=data.get('email'),
        phone=data.get('phone'),
        loyalty_points=int(data.get('loyalty_points', 0)),
    )
    if hasattr(customer, 'birthday') and data.get('birthday'):
        customer.birthday = data['birthday']
    if hasattr(customer, 'notes'):
        customer.notes = data.get('notes', '')
    db.session.add(customer)
    db.session.commit()
    return jsonify({'customer': _customer_dict(customer)}), 201


@customers_bp.route('/<int:customer_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'cashier')
def update_customer(current_user, customer_id):
    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json() or {}
    if 'name' in data:
        customer.name = data['name']
    if 'email' in data:
        customer.email = data['email']
    if 'phone' in data:
        customer.phone = data['phone']
    if 'loyalty_points' in data:
        customer.loyalty_points = int(data['loyalty_points'])
    if hasattr(customer, 'notes') and 'notes' in data:
        customer.notes = data['notes']
    db.session.commit()
    return jsonify({'customer': _customer_dict(customer)}), 200


@customers_bp.route('/<int:customer_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def archive_customer(current_user, customer_id):
    customer = Customer.query.get_or_404(customer_id)
    if hasattr(customer, 'archived_at'):
        customer.archived_at = datetime.utcnow()
        db.session.commit()
    return jsonify({'message': 'Customer archived'}), 200


@customers_bp.route('/<int:customer_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager')
def restore_customer(current_user, customer_id):
    customer = Customer.query.get_or_404(customer_id)
    if hasattr(customer, 'archived_at'):
        customer.archived_at = None
        db.session.commit()
    return jsonify({'message': 'Customer restored'}), 200


@customers_bp.route('/<int:customer_id>', methods=['DELETE'])
@token_required
@role_required('owner')
def delete_customer(current_user, customer_id):
    customer = Customer.query.get_or_404(customer_id)
    db.session.delete(customer)
    db.session.commit()
    return jsonify({'message': 'Customer deleted'}), 200
