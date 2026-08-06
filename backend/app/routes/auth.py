from flask import Blueprint, jsonify, request
from app.models import db, User, Branch
from app.branch_scope import (
    get_configured_branch_id,
    new_branch_id,
    coerce_branch_id,
)
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
from datetime import datetime, timedelta
import os

auth_bp = Blueprint('auth', __name__)
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_secret_key_change_in_production')

@auth_bp.route('/status', methods=['GET'])
def check_status():
    """
    Checks if the system has been initialized (i.e., if an owner exists).
    Used by the frontend to determine if it should route to /onboarding or /login.
    """
    owner_exists = User.query.filter_by(role='owner').first() is not None
    configured = None
    try:
        configured = get_configured_branch_id()
    except ValueError:
        configured = None
    return jsonify({
        "initialized": owner_exists,
        "branch_id": configured,
        "single_branch": True,
    }), 200

@auth_bp.route('/setup', methods=['POST'])
def initial_setup():
    """
    Registers the first owner and the (single) branch for this POS instance.
    Branch id is a 32-char hex string: from BRANCH_ID env, optional body.branch_id
    (admin panel), or a newly generated hex id.
    """
    if User.query.filter_by(role='owner').first():
        return jsonify({"error": "System is already initialized."}), 400

    data = request.get_json()
    if not data or not all(k in data for k in ("username", "password", "branch_name")):
        return jsonify({"error": "Missing required fields (username, password, branch_name)"}), 400

    try:
        configured = get_configured_branch_id()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    requested = coerce_branch_id(data.get('branch_id'))
    if configured and requested and requested != configured:
        return jsonify({
            "error": "branch_id does not match BRANCH_ID configured for this POS instance."
        }), 400

    branch_id = configured or requested or new_branch_id()
    if Branch.query.get(branch_id):
        return jsonify({"error": "Branch with this id already exists."}), 409

    try:
        new_branch = Branch(
            id=branch_id,
            name=data['branch_name'],
            address=data.get('branch_address', ''),
            phone=data.get('branch_phone', '')
        )
        db.session.add(new_branch)
        db.session.flush()

        hashed_password = generate_password_hash(data['password'])
        new_owner = User(
            branch_id=new_branch.id,
            username=data['username'],
            password_hash=hashed_password,
            role='owner'
        )
        db.session.add(new_owner)
        db.session.commit()

        token = jwt.encode({
            'user_id': new_owner.id,
            'role': new_owner.role,
            'branch_id': new_branch.id,
            'exp': datetime.utcnow() + timedelta(days=30)
        }, SECRET_KEY, algorithm="HS256")

        return jsonify({
            "message": "System initialized successfully.",
            "token": token,
            "user": {
                "id": new_owner.id,
                "username": new_owner.username,
                "role": new_owner.role,
                "branch_id": new_owner.branch_id,
                "branch_name": new_branch.name
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing credentials'}), 400

    user = User.query.filter_by(username=data['username']).first()

    if not user or not check_password_hash(user.password_hash, data['password']):
        try:
            from app.models import LoginHistory
            if user:
                db.session.add(LoginHistory(
                    user_id=user.id, success=False,
                    ip_address=request.remote_addr,
                    user_agent=(request.headers.get('User-Agent') or '')[:512],
                ))
                db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({'message': 'Invalid credentials'}), 401
    if getattr(user, 'archived_at', None):
        return jsonify({'message': 'Account is archived'}), 403

    if hasattr(user, 'last_login_at'):
        user.last_login_at = datetime.utcnow()

    try:
        from app.models import LoginHistory, UserSession
        import uuid as _uuid
        db.session.add(LoginHistory(
            user_id=user.id, success=True,
            ip_address=request.remote_addr,
            user_agent=(request.headers.get('User-Agent') or '')[:512],
        ))
        jti = _uuid.uuid4().hex
        db.session.add(UserSession(
            user_id=user.id,
            token_jti=jti,
            ip_address=request.remote_addr,
            user_agent=(request.headers.get('User-Agent') or '')[:512],
            expires_at=datetime.utcnow() + timedelta(days=30),
        ))
    except Exception:
        pass

    db.session.commit()

    # Prefer configured BRANCH_ID so JWT always matches this POS instance
    try:
        branch_id = get_configured_branch_id() or user.branch_id
    except ValueError:
        branch_id = user.branch_id

    token = jwt.encode({
        'user_id': user.id,
        'role': user.role,
        'branch_id': branch_id,
        'exp': datetime.utcnow() + timedelta(days=30)
    }, SECRET_KEY, algorithm="HS256")

    branch_name = ''
    if branch_id:
        branch = Branch.query.get(branch_id)
        if branch:
            branch_name = branch.name
        elif user.branch:
            branch_name = user.branch.name

    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'branch_id': branch_id,
            'branch_name': branch_name
        }
    }), 200

@auth_bp.route('/branches', methods=['GET'])
def get_branches():
    """Return the single branch for this POS (configured or the only active one)."""
    try:
        configured = get_configured_branch_id()
    except ValueError:
        configured = None

    if configured:
        branch = Branch.query.get(configured)
        branches = [branch] if branch else []
    else:
        branches = Branch.query.filter(Branch.archived_at == None).order_by(Branch.created_at.asc()).all()
        if len(branches) > 1:
            branches = branches[:1]

    output = []
    for branch in branches:
        if not branch:
            continue
        output.append({
            'id': branch.id,
            'name': branch.name,
            'address': branch.address,
            'phone': branch.phone
        })
    return jsonify({'branches': output}), 200
