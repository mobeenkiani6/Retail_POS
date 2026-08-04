from flask import Blueprint, request, jsonify
from app.models import db, Notification
from app.utils.auth_decorators import token_required, role_required
from app.services.notification_service import generate_system_notifications
from app.errors import error_response
from app.branch_scope import resolve_branch_id

notifications_bp = Blueprint('notifications', __name__)


def _notif_dict(n):
    return {
        'id': n.id,
        'title': n.title,
        'message': n.message,
        'severity': n.severity,
        'read': n.read,
        'branch_id': n.branch_id,
        'created_at': n.created_at.isoformat() if n.created_at else None,
    }


@notifications_bp.route('/', methods=['GET'])
@token_required
def list_notifications(current_user):
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    generate_system_notifications(branch_id)

    query = Notification.query
    if branch_id:
        query = query.filter(db.or_(Notification.branch_id == branch_id, Notification.branch_id == None))
    unread_only = request.args.get('unread', '').lower() in ('1', 'true')
    if unread_only:
        query = query.filter_by(read=False)
    notifications = query.order_by(Notification.created_at.desc()).limit(100).all()
    unread_count = Notification.query.filter_by(read=False).count()
    return jsonify({'notifications': [_notif_dict(n) for n in notifications], 'unread_count': unread_count}), 200


@notifications_bp.route('/<int:notif_id>/read', methods=['PATCH'])
@token_required
def mark_read(current_user, notif_id):
    notif = Notification.query.get_or_404(notif_id)
    notif.read = True
    db.session.commit()
    return jsonify({'message': 'Marked as read'}), 200


@notifications_bp.route('/read-all', methods=['PATCH'])
@token_required
def mark_all_read(current_user):
    Notification.query.filter_by(read=False).update({'read': True})
    db.session.commit()
    return jsonify({'message': 'All marked as read'}), 200


@notifications_bp.route('/<int:notif_id>', methods=['DELETE'])
@token_required
@role_required('owner', 'manager')
def delete_notification(current_user, notif_id):
    notif = Notification.query.get_or_404(notif_id)
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'message': 'Notification deleted'}), 200
