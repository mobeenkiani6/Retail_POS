"""Domain event bus — emit Socket.IO events to branch rooms and admin HQ."""
from datetime import datetime


def _socketio():
    from app import socketio
    return socketio


def emit_domain_event(event_type, payload=None, branch_id=None):
    """
    Broadcast a domain event to:
      - room admin:hq (all admin clients)
      - room branch:{branch_id} when branch_id is set (POS + branch-scoped admin)
    """
    data = {
        'type': event_type,
        'payload': payload or {},
        'branch_id': branch_id,
        'emitted_at': datetime.utcnow().isoformat() + 'Z',
    }
    sio = _socketio()
    try:
        sio.emit(event_type, data, namespace='/events', room='admin:hq')
        sio.emit('domain_event', data, namespace='/events', room='admin:hq')
        if branch_id:
            room = f'branch:{branch_id}'
            sio.emit(event_type, data, namespace='/events', room=room)
            sio.emit('domain_event', data, namespace='/events', room=room)
    except Exception as e:
        # Never fail the request path because of realtime fan-out
        print(f'[event_bus] emit failed for {event_type}: {e}')


def sale_completed(sale):
    emit_domain_event(
        'sale.completed',
        {
            'sale_id': sale.id,
            'invoice_number': getattr(sale, 'invoice_number', None),
            'total_amount': float(sale.total_amount or 0),
            'status': sale.status,
            'payment_method': sale.payment_method,
            'customer_id': sale.customer_id,
            'user_id': sale.user_id,
        },
        branch_id=sale.branch_id,
    )


def inventory_changed(branch_id, product_id=None, sku_id=None, stock_level=None, reason=None):
    emit_domain_event(
        'inventory.changed',
        {
            'product_id': product_id,
            'sku_id': sku_id,
            'stock_level': stock_level,
            'reason': reason,
        },
        branch_id=branch_id,
    )


def product_updated(product_id, branch_id=None, action='updated'):
    emit_domain_event(
        'product.updated',
        {'product_id': product_id, 'action': action},
        branch_id=branch_id,
    )
    emit_domain_event(
        'catalog.updated',
        {'product_id': product_id, 'action': action},
        branch_id=branch_id,
    )


def settings_updated(branch_id=None):
    emit_domain_event('settings.updated', {}, branch_id=branch_id)


def notification_created(notification):
    emit_domain_event(
        'notification.created',
        {
            'id': notification.id,
            'title': notification.title,
            'message': notification.message,
            'severity': notification.severity,
        },
        branch_id=notification.branch_id,
    )


def user_updated(user_id, branch_id=None, action='updated'):
    emit_domain_event(
        'user.updated',
        {'user_id': user_id, 'action': action},
        branch_id=branch_id,
    )
