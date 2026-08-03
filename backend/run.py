import os
from app import create_app, socketio
from app.models import db
from app.db_migrate import run_migrations

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        run_migrations(db)
        print("Database tables and migrations ensured.")

    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    if not debug and os.environ.get('FLASK_ENV', '').lower() == 'development':
        debug = True
    print(f"Starting Nycto Retail Mart POS API on http://0.0.0.0:{port}")
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=True,
    )
