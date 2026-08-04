from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Branch, User
from app.branch_scope import get_configured_branch_id, is_valid_branch_id
from app.utils.auth_decorators import token_required, owner_required

branches_bp = Blueprint('branches', __name__)


def _branch_to_dict(b):
    d = {
        'id': b.id,
        'name': b.name,
        'address': b.address or '',
        'phone': b.phone or '',
        'user_count': len(b.users),
        'created_at': b.created_at.isoformat() if b.created_at else None,
        'single_branch': True,
    }
    if hasattr(b, 'archived_at') and b.archived_at:
        d['archived_at'] = b.archived_at.isoformat()
    return d


def _scoped_branch():
    """Return the single branch for this POS instance, or None."""
    configured = None
    try:
        configured = get_configured_branch_id()
    except ValueError:
        configured = None
    if configured:
        return Branch.query.get(configured)
    # Fall back to earliest active branch (setup may have created one UUID without env)
    return (
        Branch.query.filter(Branch.archived_at == None)
        .order_by(Branch.created_at.asc())
        .first()
    )


@branches_bp.route('/', methods=['GET'])
@token_required
def get_branches(current_user):
    """Return this POS's single branch (UUID-scoped)."""
    branch = _scoped_branch()
    if not branch and current_user.branch_id:
        branch = Branch.query.get(current_user.branch_id)
    if not branch:
        return jsonify([]), 200
    return jsonify([_branch_to_dict(branch)]), 200


@branches_bp.route('/', methods=['POST'])
@token_required
@owner_required
def create_branch(current_user):
    """Multi-branch create is disabled — this POS is single-branch scoped."""
    return jsonify({
        'message': (
            'This POS is single-branch scoped. Create additional branches in the '
            'admin panel; provision each store with its own BRANCH_ID hex id.'
        )
    }), 403


@branches_bp.route('/<branch_id>', methods=['PUT'])
@token_required
@owner_required
def update_branch(current_user, branch_id):
    """Update the configured branch (name / address / phone)."""
    if not is_valid_branch_id(branch_id):
        return jsonify({'message': 'Invalid branch id'}), 400

    scoped = _scoped_branch()
    if not scoped or scoped.id != branch_id:
        return jsonify({'message': 'Branch not found or not in scope for this POS'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'message': 'Branch name is required'}), 400

    try:
        scoped.name = name
        scoped.address = data.get('address', scoped.address or '').strip()
        scoped.phone = data.get('phone', scoped.phone or '').strip()
        db.session.commit()
        return jsonify({
            'id': scoped.id,
            'name': scoped.name,
            'address': scoped.address,
            'phone': scoped.phone,
            'message': 'Branch updated successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error updating branch: {str(e)}'}), 500


@branches_bp.route('/<branch_id>/archive', methods=['PATCH'])
@token_required
@owner_required
def archive_branch(current_user, branch_id):
    return jsonify({
        'message': 'Archiving the branch is disabled on a single-branch POS.'
    }), 403


@branches_bp.route('/<branch_id>/unarchive', methods=['PATCH'])
@token_required
@owner_required
def unarchive_branch(current_user, branch_id):
    return jsonify({
        'message': 'Unarchive is disabled on a single-branch POS.'
    }), 403


@branches_bp.route('/<branch_id>', methods=['DELETE'])
@token_required
@owner_required
def delete_branch(current_user, branch_id):
    return jsonify({
        'message': (
            'Deleting the branch is disabled on a single-branch POS. '
            'Manage branch lifecycle from the admin panel.'
        )
    }), 403


@branches_bp.route('/<branch_id>/users', methods=['GET'])
@token_required
@owner_required
def get_branch_users(current_user, branch_id):
    """List users belonging to this POS branch."""
    if not is_valid_branch_id(branch_id):
        return jsonify({'message': 'Invalid branch id'}), 400

    scoped = _scoped_branch()
    if not scoped or scoped.id != branch_id:
        return jsonify({'message': 'Branch not found or not in scope for this POS'}), 404

    users = User.query.filter_by(branch_id=branch_id).order_by(User.created_at.asc()).all()
    output = []
    for u in users:
        output.append({
            'id': u.id,
            'username': u.username,
            'role': u.role,
            'created_at': u.created_at.isoformat() if u.created_at else None
        })
    return jsonify(output), 200
