"""Expiry alerts API — shared by POS and Admin."""
from flask import Blueprint, request, jsonify
from app.utils.auth_decorators import token_required
from app.branch_scope import resolve_branch_id
from app.services.expiry_service import list_expiry_alerts, upsert_expiry_notifications

expiry_bp = Blueprint('expiry', __name__)


@expiry_bp.route('/alerts', methods=['GET'])
@token_required
def expiry_alerts(current_user):
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))
    # Refresh notifications so bell stays in sync
    try:
        upsert_expiry_notifications(branch_id)
        from app.models import db
        db.session.commit()
    except Exception:
        from app.models import db
        db.session.rollback()

    alerts = list_expiry_alerts(branch_id=branch_id)
    expired = [a for a in alerts if a['status'] == 'expired']
    near = [a for a in alerts if a['status'] == 'near_expiry']
    return jsonify({
        'alerts': alerts,
        'expired': expired,
        'near_expiry': near,
        'expired_count': len(expired),
        'near_expiry_count': len(near),
        'total_count': len(alerts),
    }), 200
