"""Socket.IO handlers for /events namespace — admin HQ + branch rooms + everyone."""
from flask import request
from flask_socketio import join_room, leave_room
from app import socketio
from app.services.event_bus import EVERYONE_ROOM


@socketio.on('connect', namespace='/events')
def events_connect():
    # Every client receives cross-app sync events via this room
    join_room(EVERYONE_ROOM)
    print(f'[events] client connected: {request.sid} (joined {EVERYONE_ROOM})')


@socketio.on('disconnect', namespace='/events')
def events_disconnect():
    print(f'[events] client disconnected: {request.sid}')


@socketio.on('join_admin', namespace='/events')
def join_admin(data=None):
    join_room(EVERYONE_ROOM)
    join_room('admin:hq')
    return {'ok': True, 'room': 'admin:hq'}


@socketio.on('leave_admin', namespace='/events')
def leave_admin(data=None):
    leave_room('admin:hq')
    return {'ok': True}


@socketio.on('join_branch', namespace='/events')
def join_branch(data):
    data = data or {}
    branch_id = data.get('branch_id')
    if not branch_id:
        return {'ok': False, 'error': 'branch_id required'}
    join_room(EVERYONE_ROOM)
    room = f'branch:{branch_id}'
    join_room(room)
    return {'ok': True, 'room': room}


@socketio.on('leave_branch', namespace='/events')
def leave_branch(data):
    data = data or {}
    branch_id = data.get('branch_id')
    if branch_id:
        leave_room(f'branch:{branch_id}')
    return {'ok': True}


@socketio.on('ping_sync', namespace='/events')
def ping_sync(data=None):
    """Lightweight keepalive / connectivity check from clients."""
    return {'ok': True, 'ts': __import__('datetime').datetime.utcnow().isoformat() + 'Z'}
