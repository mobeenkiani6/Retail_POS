from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, User
from app.utils.auth_decorators import token_required, owner_required, admin_owner_required
from app.branch_scope import resolve_branch_id
from werkzeug.security import generate_password_hash

users_bp = Blueprint('users', __name__)

def _user_to_dict(u):
    d = {
        'id': u.id,
        'username': u.username,
        'role': u.role,
        'branch_id': u.branch_id,
        'branch_name': u.branch.name if u.branch else 'Unassigned',
        'created_at': u.created_at.isoformat() if u.created_at else None,
        'last_login_at': u.last_login_at.isoformat() if getattr(u, 'last_login_at', None) else None,
    }
    if hasattr(u, 'archived_at') and u.archived_at:
        d['archived_at'] = u.archived_at.isoformat()
    return d

@users_bp.route('/', methods=['GET'])
@token_required
@admin_owner_required
def get_users(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true', 'yes')
    query = User.query
    if not include_archived and hasattr(User, 'archived_at'):
        query = query.filter(User.archived_at == None)
    users = query.all()
    output = [_user_to_dict(u) for u in users]
    return jsonify(output), 200

@users_bp.route('/', methods=['POST'])
@token_required
@admin_owner_required
def create_user(current_user):
    data = request.get_json()
    if not data or not all(k in data for k in ("username", "password", "role")):
        return jsonify({"message": "Missing required fields (username, password, role)"}), 400
        
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"message": "Username already exists."}), 400
        
    try:
        # Single-branch POS: always assign to this instance's branch UUID
        branch_id = resolve_branch_id(current_user, data.get('branch_id')) or current_user.branch_id

        new_user = User(
            branch_id=branch_id,
            username=data['username'],
            password_hash=generate_password_hash(data['password']),
            role=data['role']
        )
        db.session.add(new_user)
        db.session.commit()
        try:
            from app.services.event_bus import user_updated
            user_updated(new_user.id, branch_id=new_user.branch_id, action='created')
        except Exception:
            pass
        return jsonify({
            "message": "User created successfully", 
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "role": new_user.role,
                "branch_id": new_user.branch_id
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Error creating user", "error": str(e)}), 500

@users_bp.route('/<int:user_id>', methods=['PUT'])
@token_required
@admin_owner_required
def update_user(current_user, user_id):
    data = request.get_json()
    if not data:
        return jsonify({"message": "No data provided"}), 400
        
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    try:
        if 'role' in data and data['role'] != 'owner' and user.role == 'owner':
            owner_count = User.query.filter_by(branch_id=user.branch_id, role='owner').count()
            if owner_count <= 1:
                return jsonify({"message": "Cannot demote the last owner of the branch."}), 400
        
        if 'username' in data and data['username'] != user.username:
            if User.query.filter_by(username=data['username']).first():
                return jsonify({"message": "Username already exists."}), 400
            user.username = data['username']
            
        if 'password' in data and data['password']:
            user.password_hash = generate_password_hash(data['password'])
            
        if 'role' in data:
            user.role = data['role']

        if 'branch_id' in data:
            # Keep users on this POS branch UUID (ignore cross-branch assignment)
            user.branch_id = resolve_branch_id(current_user, data.get('branch_id')) or user.branch_id
            
        db.session.commit()
        try:
            from app.services.event_bus import user_updated
            user_updated(user.id, branch_id=user.branch_id, action='updated')
        except Exception:
            pass
        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Error updating user", "error": str(e)}), 500

@users_bp.route('/<int:user_id>/archive', methods=['PATCH'])
@token_required
@admin_owner_required
def archive_user(current_user, user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({"message": "Cannot delete yourself."}), 400
    if not hasattr(user, 'archived_at'):
        return jsonify({"message": "Archive not supported"}), 400
    try:
        user.archived_at = datetime.utcnow()
        db.session.commit()
        try:
            from app.services.event_bus import user_updated
            user_updated(user.id, branch_id=user.branch_id, action='archived')
        except Exception:
            pass
        return jsonify({'message': 'User deleted', 'archived_at': user.archived_at.isoformat()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500

@users_bp.route('/<int:user_id>/unarchive', methods=['PATCH'])
@token_required
@admin_owner_required
def unarchive_user(current_user, user_id):
    user = User.query.get_or_404(user_id)
    if not hasattr(user, 'archived_at'):
        return jsonify({"message": "Unarchive not supported"}), 400
    try:
        user.archived_at = None
        db.session.commit()
        try:
            from app.services.event_bus import user_updated
            user_updated(user.id, branch_id=user.branch_id, action='restored')
        except Exception:
            pass
        return jsonify({'message': 'User restored'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@token_required
@admin_owner_required
def delete_user(current_user, user_id):
    """Remove user: permanent delete if no sales, otherwise soft-archive."""
    from app.models import Sale
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found"}), 404

    if user.id == current_user.id:
        return jsonify({"message": "Cannot delete yourself."}), 400

    if user.role == 'owner':
        owner_count = User.query.filter_by(branch_id=user.branch_id, role='owner').count()
        if owner_count <= 1:
            return jsonify({"message": "Cannot delete the last owner of the branch."}), 400

    sales_count = Sale.query.filter_by(user_id=user_id).count()
    try:
        if sales_count > 0:
            if not hasattr(user, 'archived_at'):
                return jsonify({
                    "message": f"Cannot delete user — they have {sales_count} transaction(s)."
                }), 409
            user.archived_at = datetime.utcnow()
            db.session.commit()
            try:
                from app.services.event_bus import user_updated
                user_updated(user.id, branch_id=user.branch_id, action='deleted')
            except Exception:
                pass
            return jsonify({"message": "User deleted"}), 200
        branch_id = user.branch_id
        db.session.delete(user)
        db.session.commit()
        try:
            from app.services.event_bus import user_updated
            user_updated(user_id, branch_id=branch_id, action='deleted')
        except Exception:
            pass
        return jsonify({"message": "User deleted"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Error deleting user", "error": str(e)}), 500
