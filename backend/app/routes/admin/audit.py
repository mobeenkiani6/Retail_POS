from flask import jsonify, request
from app.models import AuditLog, User, Notification
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp


@admin_bp.route('/audit-logs', methods=['GET'])
@token_required
@admin_access
def list_audit_logs(current_user):
    limit = min(int(request.args.get('limit', 100)), 500)
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    user_ids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u.username for u in User.query.filter(User.id.in_(user_ids or [0])).all()}
    return jsonify([{
        'id': r.id,
        'user_id': r.user_id,
        'username': users.get(r.user_id),
        'action': r.action,
        'entity_type': r.entity_type,
        'entity_id': r.entity_id,
        'details': r.details,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    } for r in rows]), 200


@admin_bp.route('/notifications', methods=['GET'])
@token_required
@admin_access
def admin_notifications(current_user):
    branch_id = request.args.get('branch_id')
    q = Notification.query.order_by(Notification.created_at.desc())
    if branch_id:
        q = q.filter(Notification.branch_id == branch_id)
    rows = q.limit(200).all()

    # Dedupe by title (keep newest) so repeated low-stock alerts don't spam the UI
    seen = set()
    unique = []
    for n in rows:
        key = (n.title or '').strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(n)

    unread = sum(1 for r in unique if not r.read)
    return jsonify({
        'unread': unread,
        'notifications': [{
            'id': n.id,
            'branch_id': n.branch_id,
            'title': n.title,
            'message': n.message,
            'severity': n.severity,
            'read': n.read,
            'created_at': n.created_at.isoformat() if n.created_at else None,
        } for n in unique[:80]],
    }), 200
