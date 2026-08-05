from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Product, ProductSku, Category, Unit, Brand, Supplier
from app.services.stock_service import get_product_stock_levels, restock_sku
from app.services.sku_service import (
    sku_to_dict, parse_sku_payload, apply_sku_fields,
    generate_barcode, generate_sku_code,
)
from app.utils.auth_decorators import token_required, owner_required, role_required
from app.errors import error_response
from app.branch_scope import resolve_branch_id, require_branch_id

products_bp = Blueprint('products', __name__)

PARENT_FIELDS = (
    'description', 'category_id', 'brand_id', 'supplier_id',
    'image_url', 'tax_rate', 'requires_expiry', 'notes', 'status',
    'sku', 'unit', 'unit_id', 'min_stock', 'reorder_qty',
    'carton_qty', 'carton_unit', 'packet_qty', 'packet_unit',
)


def _brand_name(product):
    if getattr(product, 'brand_ref', None) and product.brand_ref:
        return product.brand_ref.name
    return product.brand or ''


def _product_to_dict(product, branch_id=None, include_skus=True):
    skus = []
    total_stock = 0
    min_price = None
    max_price = None
    if include_skus:
        active_skus = [s for s in (product.skus or []) if not s.archived_at]
        active_skus.sort(key=lambda s: (s.sort_order or 0, s.id))
        for sku in active_skus:
            sd = sku_to_dict(sku, branch_id)
            skus.append(sd)
            total_stock += sd.get('stock_level') or 0
            p = sd['selling_price']
            min_price = p if min_price is None else min(min_price, p)
            max_price = p if max_price is None else max(max_price, p)
    elif branch_id:
        total_stock, _ = get_product_stock_levels(branch_id, product.id)

    return {
        'id': product.id,
        'name': product.name,
        'title': product.name,
        'description': getattr(product, 'description', None) or '',
        'category_id': product.category_id,
        'category_name': product.category.name if product.category else None,
        'brand_id': getattr(product, 'brand_id', None),
        'brand': _brand_name(product),
        'supplier_id': getattr(product, 'supplier_id', None),
        'supplier_name': product.supplier.name if getattr(product, 'supplier', None) else None,
        'sku': getattr(product, 'sku', None) or '',
        'unit': getattr(product, 'unit', None) or '',
        'unit_id': getattr(product, 'unit_id', None),
        'carton_qty': float(getattr(product, 'carton_qty', 0) or 0),
        'carton_unit': getattr(product, 'carton_unit', None) or '',
        'packet_qty': float(getattr(product, 'packet_qty', 0) or 0),
        'packet_unit': getattr(product, 'packet_unit', None) or '',
        'min_stock': int(getattr(product, 'min_stock', 0) or 0),
        'reorder_qty': int(getattr(product, 'reorder_qty', 0) or 0),
        'image_url': product.image_url or '',
        'tax_rate': float(getattr(product, 'tax_rate', 0) or 0),
        'requires_expiry': product.requires_expiry,
        'notes': getattr(product, 'notes', None) or '',
        'status': 'archived' if product.archived_at else (getattr(product, 'status', None) or 'active'),
        'archived_at': product.archived_at.isoformat() if getattr(product, 'archived_at', None) else None,
        'sku_count': len(skus),
        'skus': skus,
        'stock_level': total_stock,
        'min_price': min_price,
        'max_price': max_price,
        'base_price': min_price if min_price is not None else float(product.base_price or 0),
        'has_skus': len(skus) > 0,
    }


def _parse_parent_payload(data, *, partial=False):
    if not data:
        return error_response('Bad Request', 'Missing required fields', 400), None
    name = (data.get('name') or data.get('title') or '').strip()
    if not partial and not name:
        return error_response('Bad Request', 'Product name is required', 400), None
    try:
        tax_rate = float(data.get('tax_rate', 0) or 0)
    except (TypeError, ValueError):
        return error_response('Bad Request', 'Tax rate must be a number', 400), None

    def _int_or_none(v):
        if v in (None, ''):
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    def _float(v, default=0):
        try:
            if v in (None, ''):
                return default
            return float(v)
        except (TypeError, ValueError):
            return default

    unit_id = _int_or_none(data.get('unit_id'))
    unit_abbr = (data.get('unit') or data.get('unit_abbr') or '').strip() or None
    if unit_id and not unit_abbr:
        from app.models import Unit
        u = Unit.query.get(unit_id)
        if u:
            unit_abbr = u.abbreviation or u.name

    parsed = {
        'name': name,
        'description': (data.get('description') or '').strip() or None,
        'category_id': _int_or_none(data.get('category_id')),
        'brand_id': _int_or_none(data.get('brand_id')),
        'supplier_id': _int_or_none(data.get('supplier_id')),
        'sku': (data.get('sku') or '').strip() or None,
        'unit_id': unit_id,
        'unit': unit_abbr,
        'carton_qty': _float(data.get('carton_qty'), 0),
        'carton_unit': (data.get('carton_unit') or unit_abbr or '').strip() or None,
        'packet_qty': _float(data.get('packet_qty'), 0),
        'packet_unit': (data.get('packet_unit') or unit_abbr or '').strip() or None,
        'min_stock': _int_or_none(data.get('min_stock')) or 0,
        'reorder_qty': _int_or_none(data.get('reorder_qty')) or 0,
        'image_url': (data.get('image_url') or '').strip() or '',
        'tax_rate': tax_rate,
        'requires_expiry': bool(data.get('requires_expiry', False)),
        'notes': (data.get('notes') or '').strip() or None,
        'status': (data.get('status') or 'active').strip(),
    }
    return None, parsed


def _apply_parent_fields(product, parsed):
    if parsed.get('name'):
        product.name = parsed['name']
    for field in PARENT_FIELDS:
        if field in parsed and hasattr(product, field):
            setattr(product, field, parsed[field])


def _save_skus(product, skus_data, branch_id, user_id):
    saved = []
    for i, raw in enumerate(skus_data or []):
        parsed = parse_sku_payload(raw, product)
        if not parsed:
            continue
        parsed['sort_order'] = i
        sku_id = raw.get('id')
        if sku_id:
            sku = ProductSku.query.filter_by(id=int(sku_id), product_id=product.id).first()
            if not sku:
                continue
            existing_bc = ProductSku.query.filter(
                ProductSku.barcode == parsed['barcode'], ProductSku.id != sku.id,
            ).first()
            if existing_bc:
                raise ValueError(f'Barcode {parsed["barcode"]} already in use')
            apply_sku_fields(sku, parsed)
        else:
            existing_bc = ProductSku.query.filter_by(barcode=parsed['barcode']).first()
            if existing_bc:
                raise ValueError(f'Barcode {parsed["barcode"]} already in use')
            sku = ProductSku(product_id=product.id)
            apply_sku_fields(sku, parsed)
            if not sku.sku_code:
                sku.sku_code = generate_sku_code(product.name, product.id)
            db.session.add(sku)
            db.session.flush()
        initial = parsed.get('initial_stock', 0)
        if initial > 0 and branch_id:
            restock_sku(branch_id, sku.id, initial, reason='stock_in', user_id=user_id, notes='Initial stock')
        saved.append(sku)
    return saved


@products_bp.route('/', methods=['GET'])
@token_required
def get_products(current_user):
    include_archived = request.args.get('include_archived', '').lower() in ('1', 'true', 'yes')
    category_id = request.args.get('category_id')
    brand_id = request.args.get('brand_id')
    search = request.args.get('search', '').strip()
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id')) or require_branch_id(current_user)

    query = Product.query
    if not include_archived:
        query = query.filter(Product.archived_at == None)
    if category_id:
        query = query.filter_by(category_id=int(category_id))
    if brand_id:
        query = query.filter_by(brand_id=int(brand_id))
    if search:
        sku_product_ids = db.session.query(ProductSku.product_id).filter(
            db.or_(
                ProductSku.barcode.ilike(f'%{search}%'),
                ProductSku.sku_code.ilike(f'%{search}%'),
                ProductSku.variant_name.ilike(f'%{search}%'),
            )
        ).distinct()
        query = query.filter(
            db.or_(
                Product.name.ilike(f'%{search}%'),
                Product.description.ilike(f'%{search}%'),
                Product.id.in_(sku_product_ids),
            )
        )
    products = query.order_by(Product.name).all()
    return jsonify({'products': [_product_to_dict(p, branch_id) for p in products]}), 200


@products_bp.route('/generate-barcode', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def api_generate_barcode(current_user):
    return jsonify({'barcode': generate_barcode()}), 200


@products_bp.route('/generate-sku-code', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def api_generate_sku_code(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or 'Product').strip()
    product_id = data.get('product_id')
    return jsonify({'sku_code': generate_sku_code(name, product_id)}), 200


@products_bp.route('/', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def create_product(current_user):
    data = request.get_json() or {}
    err_resp, parsed = _parse_parent_payload(data)
    if err_resp:
        return err_resp
    branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    product = Product(name=parsed['name'], status='active')
    _apply_parent_fields(product, parsed)
    db.session.add(product)
    db.session.flush()
    try:
        skus_data = data.get('skus') or []
        if skus_data:
            _save_skus(product, skus_data, branch_id, current_user.id)
        db.session.commit()
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)
    db.session.refresh(product)
    return jsonify({'product': _product_to_dict(product, branch_id)}), 201


@products_bp.route('/<int:product_id>', methods=['GET'])
@token_required
def get_product(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id')) or require_branch_id(current_user)
    return jsonify({'product': _product_to_dict(product, branch_id)}), 200


@products_bp.route('/<int:product_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_product(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    data = request.get_json() or {}
    merged = {**_product_to_dict(product, include_skus=False), **data}
    err_resp, parsed = _parse_parent_payload(merged, partial=True)
    if err_resp:
        return err_resp
    _apply_parent_fields(product, parsed)
    branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    try:
        if 'skus' in data:
            incoming_ids = {int(s['id']) for s in data['skus'] if s.get('id')}
            for sku in list(product.skus or []):
                if sku.id not in incoming_ids and not sku.archived_at:
                    sku.archived_at = datetime.utcnow()
            _save_skus(product, data['skus'], branch_id, current_user.id)
        db.session.commit()
    except ValueError as e:
        db.session.rollback()
        return error_response('Bad Request', str(e), 400)
    db.session.refresh(product)
    return jsonify({'product': _product_to_dict(product, branch_id)}), 200


@products_bp.route('/<int:product_id>/skus', methods=['GET'])
@token_required
def list_skus(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id')) or require_branch_id(current_user)
    skus = [s for s in (product.skus or []) if not s.archived_at]
    skus.sort(key=lambda s: (s.sort_order or 0, s.id))
    return jsonify({'skus': [sku_to_dict(s, branch_id) for s in skus]}), 200


@products_bp.route('/<int:product_id>/skus', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def add_sku(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    data = request.get_json() or {}
    parsed = parse_sku_payload(data, product)
    if not parsed:
        return error_response('Bad Request', 'Barcode is required', 400)
    if ProductSku.query.filter_by(barcode=parsed['barcode']).first():
        return error_response('Conflict', 'Barcode already in use', 409)
    sku = ProductSku(product_id=product.id)
    apply_sku_fields(sku, parsed)
    if not sku.sku_code:
        sku.sku_code = generate_sku_code(product.name, product.id)
    db.session.add(sku)
    db.session.flush()
    branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    initial = parsed.get('initial_stock', 0)
    if initial > 0:
        restock_sku(branch_id, sku.id, initial, reason='stock_in', user_id=current_user.id, notes='Initial stock')
    db.session.commit()
    return jsonify({'sku': sku_to_dict(sku, branch_id)}), 201


@products_bp.route('/<int:product_id>/skus/<int:sku_id>', methods=['PUT'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def update_sku(current_user, product_id, sku_id):
    product = Product.query.get_or_404(product_id)
    sku = ProductSku.query.filter_by(id=sku_id, product_id=product.id).first_or_404()
    data = request.get_json() or {}
    parsed = parse_sku_payload({**sku_to_dict(sku), **data}, product)
    if not parsed:
        return error_response('Bad Request', 'Invalid SKU data', 400)
    existing_bc = ProductSku.query.filter(
        ProductSku.barcode == parsed['barcode'], ProductSku.id != sku.id,
    ).first()
    if existing_bc:
        return error_response('Conflict', 'Barcode already in use', 409)
    apply_sku_fields(sku, parsed)
    db.session.commit()
    branch_id = resolve_branch_id(current_user, data.get('branch_id')) or require_branch_id(current_user)
    return jsonify({'sku': sku_to_dict(sku, branch_id)}), 200


@products_bp.route('/<int:product_id>/skus/<int:sku_id>', methods=['DELETE'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def archive_sku(current_user, product_id, sku_id):
    Product.query.get_or_404(product_id)
    sku = ProductSku.query.filter_by(id=sku_id, product_id=product_id).first_or_404()
    sku.archived_at = datetime.utcnow()
    sku.status = 'inactive'
    db.session.commit()
    return jsonify({'message': 'SKU archived'}), 200


@products_bp.route('/<int:product_id>/skus/<int:sku_id>/duplicate', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def duplicate_sku(current_user, product_id, sku_id):
    product = Product.query.get_or_404(product_id)
    source = ProductSku.query.filter_by(id=sku_id, product_id=product.id).first_or_404()
    dup = ProductSku(
        product_id=product.id,
        sku_code=generate_sku_code(product.name, product.id),
        barcode=generate_barcode(),
        variant_name=source.variant_name,
        quantity_value=source.quantity_value,
        unit_id=source.unit_id,
        unit_abbr=source.unit_abbr,
        cost_price=source.cost_price,
        selling_price=source.selling_price,
        tax_rate=source.tax_rate,
        min_stock=source.min_stock,
        max_stock=source.max_stock,
        reorder_level=source.reorder_level,
        shelf_location=source.shelf_location,
        notes=source.notes,
        sort_order=(source.sort_order or 0) + 1,
        status='active',
    )
    db.session.add(dup)
    db.session.commit()
    branch_id = resolve_branch_id(current_user) or require_branch_id(current_user)
    return jsonify({'sku': sku_to_dict(dup, branch_id)}), 201


@products_bp.route('/<int:product_id>/restore', methods=['PATCH'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def restore_product(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    product.archived_at = None
    db.session.commit()
    return jsonify({'product': _product_to_dict(product)}), 200


@products_bp.route('/<int:product_id>/duplicate', methods=['POST'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def duplicate_product(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    dup = Product(
        name=f'{product.name} (Copy)',
        description=product.description,
        category_id=product.category_id,
        brand_id=product.brand_id,
        supplier_id=product.supplier_id,
        unit=product.unit,
        unit_id=product.unit_id,
        carton_qty=getattr(product, 'carton_qty', 0) or 0,
        carton_unit=getattr(product, 'carton_unit', None),
        packet_qty=getattr(product, 'packet_qty', 0) or 0,
        packet_unit=getattr(product, 'packet_unit', None),
        min_stock=product.min_stock,
        reorder_qty=product.reorder_qty,
        image_url=product.image_url,
        tax_rate=product.tax_rate,
        requires_expiry=product.requires_expiry,
        notes=product.notes,
        status='active',
    )
    db.session.add(dup)
    db.session.flush()
    for sku in [s for s in (product.skus or []) if not s.archived_at]:
        db.session.add(ProductSku(
            product_id=dup.id,
            sku_code=generate_sku_code(dup.name, dup.id),
            barcode=generate_barcode(),
            variant_name=sku.variant_name,
            quantity_value=sku.quantity_value,
            unit_id=sku.unit_id,
            unit_abbr=sku.unit_abbr,
            cost_price=sku.cost_price,
            selling_price=sku.selling_price,
            tax_rate=sku.tax_rate,
            min_stock=sku.min_stock,
            max_stock=sku.max_stock,
            reorder_level=sku.reorder_level,
            shelf_location=sku.shelf_location,
            notes=sku.notes,
            sort_order=sku.sort_order,
            status='active',
        ))
    db.session.commit()
    return jsonify({'product': _product_to_dict(dup)}), 201


@products_bp.route('/<int:product_id>/archive', methods=['PATCH'])
@token_required
@role_required('owner', 'manager', 'inventory_manager')
def archive_product(current_user, product_id):
    product = Product.query.get_or_404(product_id)
    product.archived_at = datetime.utcnow()
    for sku in product.skus or []:
        if not sku.archived_at:
            sku.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Product archived', 'product': _product_to_dict(product)}), 200


@products_bp.route('/<int:product_id>', methods=['DELETE'])
@token_required
@owner_required
def delete_product(current_user, product_id):
    """Permanently delete a product and its stock rows. Sale lines keep history with null product_id."""
    from app.models import (
        Inventory, InventoryTransaction, ProductBatch, BatchMovement, GRNItem, SaleItem,
    )

    product = Product.query.get_or_404(product_id)

    grn_count = GRNItem.query.filter_by(product_id=product_id).count()
    if grn_count:
        return error_response(
            'Conflict',
            f'Cannot delete — product is used on {grn_count} receiving note line(s). Archive it instead.',
            409,
        )

    try:
        SaleItem.query.filter_by(product_id=product_id).update({'product_id': None, 'sku_id': None})

        batch_ids = [b.id for b in ProductBatch.query.filter_by(product_id=product_id).all()]
        if batch_ids:
            BatchMovement.query.filter(BatchMovement.batch_id.in_(batch_ids)).delete(synchronize_session=False)
            ProductBatch.query.filter_by(product_id=product_id).delete(synchronize_session=False)

        InventoryTransaction.query.filter_by(product_id=product_id).delete(synchronize_session=False)
        Inventory.query.filter_by(product_id=product_id).delete(synchronize_session=False)

        ProductSku.query.filter_by(product_id=product_id).delete(synchronize_session=False)
        db.session.delete(product)
        db.session.commit()
        return jsonify({'message': 'Product deleted permanently'}), 200
    except Exception as e:
        db.session.rollback()
        return error_response('Error', f'Could not delete product: {e}', 500)
