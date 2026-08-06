from flask import Flask, jsonify, g, request
from flask_cors import CORS
from flask_socketio import SocketIO
from app.models import db
from app.errors import error_response, handle_http_error, handle_generic_exception
import os
import time
import uuid
import logging
from dotenv import load_dotenv

load_dotenv()
from app.db_migrate import run_migrations
# threading mode: works on Windows + Python 3.13 (eventlet is incompatible)
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")
request_logger = logging.getLogger("app.request")


def create_app():
    app = Flask(__name__)
    CORS(app)

    @app.errorhandler(400)
    def bad_request(e):
        return handle_http_error(e) if hasattr(e, "description") else error_response("Bad Request", str(e), 400)

    @app.errorhandler(404)
    def not_found(e):
        return handle_http_error(e) if hasattr(e, "description") else error_response("Not Found", str(e), 404)

    @app.errorhandler(500)
    def internal_error(e):
        return handle_http_error(e) if hasattr(e, "description") else error_response("Internal Server Error", str(e), 500)

    @app.errorhandler(Exception)
    def unhandled(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return handle_http_error(e)
        return handle_generic_exception(e)

    @app.before_request
    def before_request():
        g.start_time = time.perf_counter()
        g.request_id = uuid.uuid4().hex

    @app.after_request
    def after_request(response):
        if request.path == "/api/health" or request.path.startswith("/socket.io"):
            return response
        duration_ms = (time.perf_counter() - getattr(g, "start_time", 0)) * 1000
        request_logger.info(
            "method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
            request.method, request.path, response.status_code, duration_ms,
            getattr(g, "request_id", ""),
        )
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        return response

    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'postgresql://localhost/nycto_retail'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_secret_key_change_in_production')

    db.init_app(app)
    socketio.init_app(app)

    import time as _time
    with app.app_context():
        retries = 10
        for i in range(retries):
            try:
                db.create_all()
                run_migrations(db)
                print("Database tables created successfully.")
                break
            except Exception as e:
                if i < retries - 1:
                    print(f"DB not ready (attempt {i+1}/{retries}), retrying in 2s... ({e})")
                    _time.sleep(2)
                else:
                    print(f"Failed to create DB tables after {retries} attempts: {e}")
                    raise

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({"status": "healthy", "app": "Nycto Retail Mart POS"}), 200

    from app.routes.auth import auth_bp
    from app.routes.products import products_bp
    from app.routes.sales import sales_bp
    from app.routes.scanner import scanner_bp
    from app.routes.settings import settings_bp
    from app.routes.inventory import inventory_bp
    from app.routes.users import users_bp
    from app.routes.branches import branches_bp
    from app.routes.printer import printer_bp
    from app.routes.pos import pos_bp
    from app.routes.grn import grn_bp
    from app.routes.sync import sync_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.suppliers import suppliers_bp
    from app.routes.categories import categories_bp
    from app.routes.customers import customers_bp
    from app.routes.notifications import notifications_bp
    from app.routes.reports import reports_bp
    from app.routes.units import units_bp
    from app.routes.brands import brands_bp
    from app.routes.variant_options import variant_options_bp
    from app.routes.batches import batches_bp
    from app.routes.inventory_health import inventory_health_bp
    from app.routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(products_bp, url_prefix='/api/products')
    app.register_blueprint(sales_bp, url_prefix='/api/sales')
    app.register_blueprint(scanner_bp, url_prefix='/api/scanner')
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(branches_bp, url_prefix='/api/branches')
    app.register_blueprint(printer_bp, url_prefix='/api/printer')
    app.register_blueprint(pos_bp, url_prefix='/api/v1/pos')
    app.register_blueprint(grn_bp, url_prefix='/api/v1/grn')
    app.register_blueprint(sync_bp, url_prefix='/api/v1/sync')
    app.register_blueprint(dashboard_bp, url_prefix='/api/v1/dashboard')
    app.register_blueprint(suppliers_bp, url_prefix='/api/v1/suppliers')
    app.register_blueprint(categories_bp, url_prefix='/api/v1/categories')
    app.register_blueprint(customers_bp, url_prefix='/api/v1/customers')
    app.register_blueprint(notifications_bp, url_prefix='/api/v1/notifications')
    app.register_blueprint(reports_bp, url_prefix='/api/v1/reports')
    app.register_blueprint(units_bp, url_prefix='/api/v1/units')
    app.register_blueprint(brands_bp, url_prefix='/api/v1/brands')
    app.register_blueprint(variant_options_bp, url_prefix='/api/v1/variant-options')
    app.register_blueprint(batches_bp, url_prefix='/api/v1/batches')
    app.register_blueprint(inventory_health_bp, url_prefix='/api/v1/inventory-health')
    app.register_blueprint(admin_bp, url_prefix='/api/v1/admin')

    # Register Socket.IO event handlers (avoid `import app.*` which rebinds local `app`)
    import importlib
    importlib.import_module('app.routes.admin.events')

    # Auto-drain sync outbox so admin/cloud stay current without manual Retry
    from app.services.sync_service import start_sync_worker
    start_sync_worker(app)

    return app
