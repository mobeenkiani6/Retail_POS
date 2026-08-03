from flask import Blueprint, request, jsonify
from app.utils.auth_decorators import token_required

scanner_bp = Blueprint('scanner', __name__)


@scanner_bp.route('/webhook', methods=['POST'])
def receive_scan():
    """
    Endpoint for the LAN barcode scanner to POST scanned data.
    Expected JSON: {"barcode": "SHI-123456", "terminal_ip": "192.168.1.5"}

    The backend broadcasts the barcode to all connected browser clients
    via Socket.IO (/scanner namespace), which adds the matching product to the cart.
    """
    data = request.get_json()
    if not data or 'barcode' not in data:
        return jsonify({"message": "Invalid payload — 'barcode' field required"}), 400

    barcode = data['barcode']

    # Broadcast to all connected React frontends via WebSocket
    from app import socketio
    socketio.emit('scan_event', {'barcode': barcode}, namespace='/scanner')

    print(f"[SCANNER WEBHOOK] Received barcode: {barcode}")
    return jsonify({"status": "received", "barcode": barcode}), 200


@scanner_bp.route('/lookup/<string:barcode>', methods=['GET'])
def lookup_barcode(barcode: str):
    """
    Look up a product by its SKU (barcode value).
    No auth token required — intended for internal LAN use only.

    Returns the full product record so headless scanner clients can
    resolve barcodes without a UI.
    """
    from app.models import db, Product, ProductSku
    sku = ProductSku.query.filter(
        db.or_(ProductSku.barcode == barcode, ProductSku.sku_code == barcode),
        ProductSku.archived_at == None,
    ).first()
    if sku:
        product = Product.query.filter_by(id=sku.product_id).filter(Product.archived_at == None).first()
        if product:
            from app.services.sku_service import format_sku_display
            return jsonify({
                "found": True,
                "sku": {
                    "id": sku.id,
                    "product_id": product.id,
                    "barcode": sku.barcode,
                    "sku_code": sku.sku_code,
                    "name": product.name,
                    "display_label": format_sku_display(sku),
                    "selling_price": float(sku.selling_price),
                    "cost_price": float(sku.cost_price),
                    "category_id": product.category_id,
                }
            }), 200

    product = Product.query.filter_by(barcode=barcode).filter(Product.archived_at == None).first()

    if not product:
        return jsonify({"found": False, "message": f"No product found for barcode: {barcode}"}), 404

    return jsonify({
        "found": True,
        "product": {
            "id": product.id,
            "barcode": product.barcode,
            "name": product.name,
            "base_price": float(product.base_price),
            "category_id": product.category_id,
            "requires_expiry": product.requires_expiry,
        }
    }), 200
