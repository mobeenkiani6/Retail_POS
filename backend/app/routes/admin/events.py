"""Socket.IO handlers for /events namespace — admin HQ + branch rooms."""
from flask import request
from flask_socketio import join_room, leave_room
from app import socketio


@socketio.on('connect', namespace='/events')
def events_connect():
    print(f'[events] client connected: {request.sid}')


@socketio.on('disconnect', namespace='/events')
def events_disconnect():
    print(f'[events] client disconnected: {request.sid}')


@socketio.on('join_admin', namespace='/events')
def join_admin(data=None):
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
