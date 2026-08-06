from flask import jsonify, request
from datetime import datetime
from app.models import db, LoginHistory, UserSession, PermissionOverride, User, AuditLog
from app.utils.auth_decorators import token_required, admin_access, admin_owner_required
from app.routes.admin import admin_bp


DEFAULT_PERMISSIONS = [
    'dashboard.view', 'catalog.manage', 'inventory.manage', 'sales.view',
    'customers.manage', 'suppliers.manage', 'employees.manage', 'reports.export',
    'finance.manage', 'marketing.manage', 'settings.manage', 'security.manage',
    'branches.manage', 'bi.view',
]

ROLE_MATRIX = {
    'owner': {p: True for p in DEFAULT_PERMISSIONS},
    'admin': {p: True for p in DEFAULT_PERMISSIONS},
    'manager': {
        **{p: True for p in DEFAULT_PERMISSIONS},
        'security.manage': False,
        'branches.manage': False,
        'employees.manage': True,
    },
    'cashier': {
        'dashboard.view': False,
        'sales.view': True,
        'customers.manage': True,
    },
    'inventory_manager': {
        'dashboard.view': True,
        'catalog.manage': True,
        'inventory.manage': True,
        'suppliers.manage': True,
        'reports.export': True,
    },
}


@admin_bp.route('/security/login-history', methods=['GET'])
@token_required
@admin_access
def login_history(current_user):
    limit = min(int(request.args.get('limit', 100)), 500)
    user_id = request.args.get('user_id')
    q = LoginHistory.query.order_by(LoginHistory.created_at.desc())
    if user_id:
        q = q.filter(LoginHistory.user_id == int(user_id))
    rows = q.limit(limit).all()
    users = {u.id: u.username for u in User.query.filter(User.id.in_([r.user_id for r in rows] or [0])).all()}
    return jsonify([{
        'id': r.id,
        'user_id': r.user_id,
        'username': users.get(r.user_id),
        'success': r.success,
        'ip_address': r.ip_address,
        'user_agent': r.user_agent,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    } for r in rows]), 200


@admin_bp.route('/security/sessions', methods=['GET'])
@token_required
@admin_access
def list_sessions(current_user):
    rows = UserSession.query.filter(UserSession.revoked_at == None).order_by(UserSession.created_at.desc()).limit(200).all()
    return jsonify([{
        'id': s.id,
        'user_id': s.user_id,
        'ip_address': s.ip_address,
        'user_agent': s.user_agent,
        'expires_at': s.expires_at.isoformat() if s.expires_at else None,
        'created_at': s.created_at.isoformat() if s.created_at else None,
    } for s in rows]), 200


@admin_bp.route('/security/sessions/<int:session_id>/revoke', methods=['POST'])
@token_required
@admin_owner_required
def revoke_session(current_user, session_id):
    s = UserSession.query.get(session_id)
    if not s:
        return jsonify({'message': 'Not found'}), 404
    s.revoked_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Session revoked'}), 200


@admin_bp.route('/security/permissions', methods=['GET'])
@token_required
@admin_access
def permission_matrix(current_user):
    overrides = PermissionOverride.query.all()
    by_user = {}
    for o in overrides:
        by_user.setdefault(o.user_id, {})[o.permission_key] = o.allowed
    return jsonify({
        'roles': ROLE_MATRIX,
        'permissions': DEFAULT_PERMISSIONS,
        'overrides': by_user,
    }), 200


@admin_bp.route('/security/permissions', methods=['PUT'])
@token_required
@admin_owner_required
def set_permission_override(current_user):
    data = request.get_json() or {}
    user_id = data.get('user_id')
    key = data.get('permission_key')
    allowed = bool(data.get('allowed', True))
    if not user_id or not key:
        return jsonify({'message': 'user_id and permission_key required'}), 400
    row = PermissionOverride.query.filter_by(user_id=user_id, permission_key=key).first()
    if not row:
        row = PermissionOverride(user_id=user_id, permission_key=key, allowed=allowed)
        db.session.add(row)
    else:
        row.allowed = allowed
    db.session.commit()
    return jsonify({'user_id': user_id, 'permission_key': key, 'allowed': allowed}), 200


@admin_bp.route('/security/password-policy', methods=['GET'])
@token_required
@admin_access
def password_policy(current_user):
    from app.models import Setting
    s = Setting.query.filter_by(branch_id=None).first()
    config = (s.config or {}) if s else {}
    policy = config.get('password_policy', {
        'min_length': 8,
        'require_number': True,
        'require_special': False,
        'require_uppercase': False,
    })
    return jsonify(policy), 200


@admin_bp.route('/security/password-policy', methods=['PUT'])
@token_required
@admin_owner_required
def update_password_policy(current_user):
    from app.models import Setting
    data = request.get_json() or {}
    s = Setting.query.filter_by(branch_id=None).first()
    if not s:
        s = Setting(branch_id=None, config={})
        db.session.add(s)
    config = dict(s.config or {})
    config['password_policy'] = {
        'min_length': int(data.get('min_length', 8)),
        'require_number': bool(data.get('require_number', True)),
        'require_special': bool(data.get('require_special', False)),
        'require_uppercase': bool(data.get('require_uppercase', False)),
    }
    s.config = config
    db.session.commit()
    return jsonify(config['password_policy']), 200
