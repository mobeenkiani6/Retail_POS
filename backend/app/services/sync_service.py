"""Offline-first sync outbox queue and push worker."""
from datetime import datetime
from app.models import db, SyncOutbox, Sale


def enqueue_event(event_type, payload, invoice_uuid=None):
    """Add event to sync outbox."""
    entry = SyncOutbox(
        event_type=event_type,
        payload=payload,
        invoice_uuid=invoice_uuid,
        status='pending',
    )
    db.session.add(entry)
    return entry


def enqueue_sale(sale):
    """Queue a completed sale for cloud sync."""
    payload = {
        'invoice_uuid': sale.invoice_uuid,
        'branch_id': sale.branch_id,
        'user_id': sale.user_id,
        'terminal_id': sale.terminal_id,
        'total_amount': float(sale.total_amount),
        'tax_amount': float(sale.tax_amount),
        'cogs_amount': float(sale.cogs_amount),
        'payment_method': sale.payment_method,
        'status': sale.status,
        'created_at': sale.created_at.isoformat() if sale.created_at else None,
        'items': [
            {
                'product_id': i.product_id,
                'batch_id': i.batch_id,
                'quantity': i.quantity,
                'unit_price': float(i.unit_price),
                'cost_price': float(i.cost_price),
                'subtotal': float(i.subtotal),
            }
            for i in sale.items
        ],
    }
    return enqueue_event('sale.completed', payload, invoice_uuid=sale.invoice_uuid)


def get_pending_events(limit=50):
    return SyncOutbox.query.filter_by(status='pending').order_by(SyncOutbox.created_at.asc()).limit(limit).all()


def mark_synced(outbox_id):
    entry = SyncOutbox.query.get(outbox_id)
    if entry:
        entry.status = 'synced'
        entry.synced_at = datetime.utcnow()
        if entry.invoice_uuid:
            sale = Sale.query.filter_by(invoice_uuid=entry.invoice_uuid).first()
            if sale:
                sale.synced_at = datetime.utcnow()
    db.session.commit()


def mark_failed(outbox_id, error_message):
    entry = SyncOutbox.query.get(outbox_id)
    if entry:
        entry.status = 'failed'
        entry.attempts = (entry.attempts or 0) + 1
        entry.last_error = str(error_message)[:500]
    db.session.commit()


def process_push_batch(events_data):
    """
    Process incoming sync push with idempotency via invoice_uuid.
    Returns dict with accepted/skipped counts.
    """
    accepted = []
    skipped = []

    for event in events_data:
        invoice_uuid = event.get('invoice_uuid')
        if invoice_uuid:
            existing = Sale.query.filter_by(invoice_uuid=invoice_uuid).first()
            if existing:
                skipped.append(invoice_uuid)
                continue
        accepted.append(event.get('id') or invoice_uuid)

    return {'accepted': len(accepted), 'skipped': len(skipped), 'accepted_ids': accepted, 'skipped_ids': skipped}


def push_pending_to_cloud():
    """Worker stub: marks pending events as synced (replace with real cloud API)."""
    pending = get_pending_events()
    synced_count = 0
    for entry in pending:
        try:
            mark_synced(entry.id)
            synced_count += 1
        except Exception as e:
            mark_failed(entry.id, str(e))
    return synced_count
