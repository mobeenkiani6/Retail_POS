"""Admin panel API package — /api/v1/admin/*"""
from flask import Blueprint

admin_bp = Blueprint('admin', __name__)

from app.routes.admin import dashboard  # noqa: E402,F401
from app.routes.admin import search  # noqa: E402,F401
from app.routes.admin import branches  # noqa: E402,F401
from app.routes.admin import bi  # noqa: E402,F401
from app.routes.admin import reports  # noqa: E402,F401
from app.routes.admin import expenses  # noqa: E402,F401
from app.routes.admin import marketing  # noqa: E402,F401
from app.routes.admin import security  # noqa: E402,F401
from app.routes.admin import crm  # noqa: E402,F401
from app.routes.admin import forecast  # noqa: E402,F401
from app.routes.admin import transfers  # noqa: E402,F401
from app.routes.admin import integrations  # noqa: E402,F401
from app.routes.admin import audit  # noqa: E402,F401
# events registered via importlib in create_app to avoid shadowing Flask app
