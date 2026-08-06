"""Offline-first sync outbox queue and automatic push worker.

POS and Admin share the same API/DB today. The outbox still tracks which sales
have been acknowledged as synced (Sale.synced_at + SyncOutbox status). A
background worker drains pending/failed rows automatically so operators do not
need the Supply Chain "Retry Failed" button.

If CLOUD_SYNC_URL is set, each event is POSTed there before mark_synced.
Otherwise events are marked synced locally (data is already in the shared DB).
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

from app.models import db, SyncOutbox, Sale

MAX_ATTEMPTS = int(os.environ.get('SYNC_MAX_ATTEMPTS', '8'))
SYNC_INTERVAL_SEC = int(os.environ.get('SYNC_INTERVAL_SEC', '10'))
SYNC_BATCH_LIMIT = int(os.environ.get('SYNC_BATCH_LIMIT', '50'))

_worker_started = False
_worker_lock = threading.Lock()
_flush_lock = threading.Lock()


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


def get_pending_events(limit=SYNC_BATCH_LIMIT):
    return (
        SyncOutbox.query.filter_by(status='pending')
        .order_by(SyncOutbox.created_at.asc())
        .limit(limit)
        .all()
    )


def get_retriable_failed(limit=SYNC_BATCH_LIMIT):
    """Failed events that still have attempts remaining."""
    return (
        SyncOutbox.query.filter(
            SyncOutbox.status == 'failed',
            SyncOutbox.attempts < MAX_ATTEMPTS,
        )
        .order_by(SyncOutbox.created_at.asc())
        .limit(limit)
        .all()
    )


def requeue_failed(max_attempts=MAX_ATTEMPTS):
    """Reset retriable failed rows back to pending."""
    rows = (
        SyncOutbox.query.filter(
            SyncOutbox.status == 'failed',
            SyncOutbox.attempts < max_attempts,
        ).all()
    )
    for row in rows:
        row.status = 'pending'
    if rows:
        db.session.commit()
    return len(rows)


def mark_synced(outbox_id):
    entry = SyncOutbox.query.get(outbox_id)
    if entry:
        entry.status = 'synced'
        entry.synced_at = datetime.utcnow()
        entry.last_error = None
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

    return {
        'accepted': len(accepted),
        'skipped': len(skipped),
        'accepted_ids': accepted,
        'skipped_ids': skipped,
    }


def _post_to_cloud(entry, cloud_url):
    """POST a single outbox event to the configured cloud endpoint."""
    body = json.dumps({
        'events': [{
            'id': entry.id,
            'event_type': entry.event_type,
            'invoice_uuid': entry.invoice_uuid,
            'payload': entry.payload,
            'created_at': entry.created_at.isoformat() if entry.created_at else None,
        }],
    }).encode('utf-8')
    req = urllib.request.Request(
        cloud_url,
        data=body,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    timeout = float(os.environ.get('CLOUD_SYNC_TIMEOUT', '10'))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status >= 400:
            raise RuntimeError(f'Cloud sync HTTP {resp.status}')


def push_pending_to_cloud():
    """
    Drain the outbox: requeue failed (under max attempts), then sync pending.
    Thread-safe via _flush_lock so checkout kick + worker don't double-process.
    """
    with _flush_lock:
        requeue_failed()
        pending = get_pending_events()
        if not pending:
            return 0

        cloud_url = (os.environ.get('CLOUD_SYNC_URL') or '').strip()
        synced_count = 0

        for entry in pending:
            try:
                if cloud_url:
                    _post_to_cloud(entry, cloud_url)
                mark_synced(entry.id)
                synced_count += 1
            except Exception as e:
                mark_failed(entry.id, str(e))

        return synced_count


def kick_sync(app=None):
    """Fire-and-forget flush so checkout does not wait on sync I/O."""
    if app is None:
        from flask import current_app
        app = current_app._get_current_object()

    def _run():
        try:
            with app.app_context():
                count = push_pending_to_cloud()
                if count:
                    print(f'[sync] flushed {count} event(s) after enqueue')
        except Exception as e:
            print(f'[sync] kick flush failed: {e}')

    threading.Thread(target=_run, name='sync-kick', daemon=True).start()


def start_sync_worker(app, interval_sec=None):
    """Start a daemon thread that periodically drains the sync outbox."""
    global _worker_started
    interval = interval_sec if interval_sec is not None else SYNC_INTERVAL_SEC

    with _worker_lock:
        if _worker_started:
            return
        # Flask debug reloader spawns a parent + child; only run in the child.
        if os.environ.get('WERKZEUG_RUN_MAIN') == 'false':
            return
        _worker_started = True

    def loop():
        # Brief delay so DB is fully ready after boot
        time.sleep(2)
        while True:
            try:
                with app.app_context():
                    count = push_pending_to_cloud()
                    if count:
                        print(f'[sync] auto-synced {count} event(s)')
            except Exception as e:
                print(f'[sync] worker error: {e}')
            time.sleep(max(3, interval))

    t = threading.Thread(target=loop, name='sync-outbox-worker', daemon=True)
    t.start()
    print(f'[sync] background worker started (every {interval}s)')
