from flask import jsonify, request
from datetime import datetime
from app.models import db, Branch, User, Setting
from app.branch_scope import is_valid_branch_id, new_branch_id, coerce_branch_id
from app.utils.auth_decorators import token_required, admin_access, admin_owner_required
from app.routes.admin import admin_bp
from app.services import event_bus


def _branch_dict(b):
    return {
        'id': b.id,
        'name': b.name,
        'address': b.address or '',
        'phone': b.phone or '',
        'user_count': User.query.filter_by(branch_id=b.id, archived_at=None).count(),
        'created_at': b.created_at.isoformat() if b.created_at else None,
        'archived_at': b.archived_at.isoformat() if b.archived_at else None,
    }


@admin_bp.route('/branches', methods=['GET'])
@token_required
@admin_access
def list_branches(current_user):
    include_archived = request.args.get('include_archived') in ('1', 'true')
    q = Branch.query
    if not include_archived:
        q = q.filter(Branch.archived_at == None)
    branches = q.order_by(Branch.created_at.asc()).all()
    return jsonify([_branch_dict(b) for b in branches]), 200


@admin_bp.route('/branches', methods=['POST'])
@token_required
@admin_owner_required
def create_branch(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Branch name is required'}), 400

    requested = coerce_branch_id(data.get('id') or data.get('branch_id'))
    branch_id = requested or new_branch_id()
    if not is_valid_branch_id(branch_id):
        return jsonify({'message': 'Invalid branch id'}), 400
    if Branch.query.get(branch_id):
        return jsonify({'message': 'Branch id already exists'}), 409

    branch = Branch(
        id=branch_id,
        name=name,
        address=(data.get('address') or '').strip(),
        phone=(data.get('phone') or '').strip(),
    )
    db.session.add(branch)
    db.session.flush()
    # Seed empty settings row for the branch
    db.session.add(Setting(branch_id=branch.id, config={}))
    db.session.commit()
    event_bus.emit_domain_event('branch.created', {'id': branch.id, 'name': branch.name}, branch_id=branch.id)
    return jsonify({**_branch_dict(branch), 'message': 'Branch created. Use this hex id as BRANCH_ID / VITE_BRANCH_ID on the POS.'}), 201


@admin_bp.route('/branches/<branch_id>', methods=['GET'])
@token_required
@admin_access
def get_branch(current_user, branch_id):
    if not is_valid_branch_id(branch_id):
        return jsonify({'message': 'Invalid branch id'}), 400
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'message': 'Not found'}), 404
    return jsonify(_branch_dict(branch)), 200


@admin_bp.route('/branches/<branch_id>', methods=['PUT'])
@token_required
@admin_owner_required
def update_branch(current_user, branch_id):
    if not is_valid_branch_id(branch_id):
        return jsonify({'message': 'Invalid branch id'}), 400
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Branch name is required'}), 400
    branch.name = name
    if 'address' in data:
        branch.address = (data.get('address') or '').strip()
    if 'phone' in data:
        branch.phone = (data.get('phone') or '').strip()
    db.session.commit()
    event_bus.emit_domain_event(
        'branch.updated',
        {
            'id': branch.id,
            'name': branch.name,
            'address': branch.address,
            'phone': branch.phone,
        },
        branch_id=None,
    )
    return jsonify(_branch_dict(branch)), 200


@admin_bp.route('/branches/<branch_id>/archive', methods=['PATCH'])
@token_required
@admin_owner_required
def archive_branch(current_user, branch_id):
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'message': 'Not found'}), 404
    branch.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_branch_dict(branch)), 200


@admin_bp.route('/branches/<branch_id>/unarchive', methods=['PATCH'])
@token_required
@admin_owner_required
def unarchive_branch(current_user, branch_id):
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'message': 'Not found'}), 404
    branch.archived_at = None
    db.session.commit()
    return jsonify(_branch_dict(branch)), 200
