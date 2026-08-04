from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, SyncOutbox, Sale
from app.utils.auth_decorators import token_required, role_required
from app.services.sync_service import (
    get_pending_events,
    process_push_batch,
    push_pending_to_cloud,
    mark_synced,
)
from app.errors import error_response
from app.branch_scope import resolve_branch_id

sync_bp = Blueprint('sync', __name__)


@sync_bp.route('/push', methods=['POST'])
@token_required
def sync_push(current_user):
    """Accept sync events with idempotency via invoice_uuid."""
    data = request.get_json() or {}
    events = data.get('events', [])
    if not events:
        return error_response('Bad Request', 'No events provided', 400)

    result = process_push_batch(events)

    for event in events:
        invoice_uuid = event.get('invoice_uuid')
        if invoice_uuid and invoice_uuid not in result.get('skipped_ids', []):
            existing = Sale.query.filter_by(invoice_uuid=invoice_uuid).first()
            if not existing and event.get('payload'):
                payload = event['payload']
                sale = Sale(
                    invoice_uuid=invoice_uuid,
                    branch_id=resolve_branch_id(current_user, payload.get('branch_id')),
                    user_id=payload.get('user_id', current_user.id),
                    terminal_id=payload.get('terminal_id'),
                    total_amount=payload.get('total_amount', 0),
                    tax_amount=payload.get('tax_amount', 0),
                    cogs_amount=payload.get('cogs_amount', 0),
                    payment_method=payload.get('payment_method'),
                    synced_at=datetime.utcnow(),
                )
                db.session.add(sale)

    db.session.commit()
    return jsonify(result), 200


@sync_bp.route('/outbox', methods=['GET'])
@token_required
@role_required('owner', 'manager')
def sync_outbox_status(current_user):
    pending = SyncOutbox.query.filter_by(status='pending').count()
    failed = SyncOutbox.query.filter_by(status='failed').count()
    synced = SyncOutbox.query.filter_by(status='synced').count()
    events = get_pending_events(limit=20)
    return jsonify({
        'pending': pending,
        'failed': failed,
        'synced': synced,
        'recent_pending': [
            {
                'id': e.id,
                'event_type': e.event_type,
                'invoice_uuid': e.invoice_uuid,
                'created_at': e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }), 200


@sync_bp.route('/flush', methods=['POST'])
@token_required
@role_required('owner', 'manager')
def sync_flush(current_user):
    count = push_pending_to_cloud()
    return jsonify({'synced_count': count, 'message': f'Synced {count} events'}), 200
