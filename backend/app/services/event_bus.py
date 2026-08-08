"""Domain event bus — emit Socket.IO events to Admin HQ, branch rooms, and everyone."""
from datetime import datetime

# All /events clients auto-join this room on connect (see routes/admin/events.py)
EVERYONE_ROOM = 'everyone'


def _socketio():
    from app import socketio
    return socketio


def emit_domain_event(event_type, payload=None, branch_id=None):
    """
    Broadcast a domain event to:
      - room everyone (every Admin + POS client on /events)
      - room admin:hq (admin clients that joined HQ)
      - room branch:{branch_id} when branch_id is set
    """
    data = {
        'type': event_type,
        'payload': payload or {},
        'branch_id': branch_id,
        'emitted_at': datetime.utcnow().isoformat() + 'Z',
    }
    sio = _socketio()
    try:
        # Always fan out to the shared room so POS ↔ Admin sync without refresh
        sio.emit(event_type, data, namespace='/events', to=EVERYONE_ROOM)
        sio.emit('domain_event', data, namespace='/events', to=EVERYONE_ROOM)
        # Also target HQ / branch rooms (clients may rely on these)
        sio.emit(event_type, data, namespace='/events', to='admin:hq')
        sio.emit('domain_event', data, namespace='/events', to='admin:hq')
        if branch_id:
            room = f'branch:{branch_id}'
            sio.emit(event_type, data, namespace='/events', to=room)
            sio.emit('domain_event', data, namespace='/events', to=room)
        print(f'[event_bus] {event_type} branch={branch_id or "global"}')
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
    payload = {'product_id': product_id, 'action': action, 'source_branch_id': branch_id}
    emit_domain_event('product.updated', payload, branch_id=None)
    emit_domain_event('catalog.updated', payload, branch_id=None)


def settings_updated(branch_id=None):
    emit_domain_event(
        'settings.updated',
        {'scope': 'global' if not branch_id else 'branch'},
        branch_id=branch_id,
    )


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


def supplier_updated(supplier_id, action='updated'):
    emit_domain_event(
        'supplier.updated',
        {'supplier_id': supplier_id, 'action': action},
        branch_id=None,
    )


def customer_updated(customer_id, action='updated'):
    emit_domain_event(
        'customer.updated',
        {'customer_id': customer_id, 'action': action},
        branch_id=None,
    )
