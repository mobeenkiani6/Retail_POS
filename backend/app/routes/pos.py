from flask import Blueprint, request, jsonify
from app.utils.auth_decorators import token_required
from app.services.stock_service import resolve_product_scan
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

pos_bp = Blueprint('pos', __name__)


@pos_bp.route('/scan', methods=['POST'])
@token_required
def scan_barcode(current_user):
    data = request.get_json() or {}
    barcode = (data.get('barcode') or '').strip()
    variant = (data.get('variant') or '').strip()
    quantity = int(data.get('quantity', 1))
    if not barcode:
        return error_response('Bad Request', 'Barcode is required', 400)

    try:
        branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    except ValueError as e:
        return error_response('Bad Request', str(e), 400)

    try:
        result = resolve_product_scan(barcode, branch_id, abs(quantity), variant=variant)
        return jsonify(result), 200
    except ValueError as e:
        return error_response('Bad Request', str(e), 400)
