"""Product SKU helpers — retail pack-size model."""
import random
import string
from decimal import Decimal
from app.models import db, Product, ProductSku, Unit, Inventory


def format_sku_display(sku: ProductSku) -> str:
    """Human label e.g. '250 ml' or '1 kg'."""
    qty = sku.quantity_value
    if qty is None:
        return sku.variant_name or 'Standard'
    qty_f = float(qty)
    qty_str = str(int(qty_f)) if qty_f == int(qty_f) else str(qty_f).rstrip('0').rstrip('.')
    unit = sku.unit_abbr or ''
    if unit and unit.lower() not in ('ea', 'each', 'piece', 'pc'):
        return f'{qty_str} {unit}'.strip()
    return sku.variant_name or qty_str


def sku_to_dict(sku: ProductSku, branch_id=None) -> dict:
    unit_name = sku.unit_abbr or 'ea'
    if sku.unit_ref:
        unit_name = sku.unit_ref.abbreviation or sku.unit_ref.name
    stock_level = None
    if branch_id:
        row = Inventory.query.filter_by(branch_id=branch_id, sku_id=sku.id).first()
        stock_level = row.stock_level if row else 0
    tax = sku.tax_rate
    if tax is None and sku.product:
        tax = sku.product.tax_rate
    return {
        'id': sku.id,
        'product_id': sku.product_id,
        'sku_code': sku.sku_code,
        'barcode': sku.barcode,
        'variant_name': sku.variant_name,
        'quantity_value': float(sku.quantity_value or 1),
        'unit_id': sku.unit_id,
        'unit_abbr': unit_name,
        'display_label': format_sku_display(sku),
        'cost_price': float(sku.cost_price or 0),
        'selling_price': float(sku.selling_price or 0),
        'wholesale_price': float(sku.wholesale_price) if sku.wholesale_price is not None else None,
        'tax_rate': float(tax or 0),
        'min_stock': sku.min_stock or 0,
        'max_stock': sku.max_stock,
        'reorder_level': sku.reorder_level or 0,
        'shelf_location': sku.shelf_location or '',
        'image_url': sku.image_url or '',
        'notes': sku.notes or '',
        'status': 'archived' if sku.archived_at else (sku.status or 'active'),
        'sort_order': sku.sort_order or 0,
        'stock_level': stock_level,
    }


def generate_barcode(prefix='890') -> str:
    """Generate a unique EAN-style barcode."""
    for _ in range(100):
        suffix = ''.join(random.choices(string.digits, k=10))
        code = f'{prefix}{suffix}'[:13]
        if not ProductSku.query.filter_by(barcode=code).first():
            if not Product.query.filter_by(barcode=code).first():
                return code
    return f'{prefix}{random.randint(1000000000, 9999999999)}'


def generate_sku_code(product_name: str, product_id: int | None = None) -> str:
    """Generate SKU code from product name."""
    base = ''.join(c.upper() for c in product_name if c.isalnum())[:6] or 'SKU'
    pid = product_id or 0
    for i in range(100):
        code = f'{base}-{pid}-{i + 1:03d}' if pid else f'{base}-{i + 1:04d}'
        exists = ProductSku.query.filter_by(sku_code=code).first()
        if not exists:
            return code
    return f'{base}-{random.randint(1000, 9999)}'


def parse_sku_payload(data: dict, product: Product | None = None) -> dict | None:
    variant_name = (data.get('variant_name') or data.get('name') or 'Standard').strip()
    barcode = (data.get('barcode') or '').strip()
    sku_code = (data.get('sku_code') or '').strip()
    if not barcode:
        return None
    try:
        qty = float(data.get('quantity_value', data.get('quantity', 1)) or 1)
    except (TypeError, ValueError):
        qty = 1.0
    if qty <= 0:
        qty = 1.0
    try:
        cost = float(data.get('cost_price', data.get('purchase_price', 0)) or 0)
    except (TypeError, ValueError):
        cost = 0.0
    try:
        sell = float(data.get('selling_price', data.get('base_price', data.get('sell_price', 0))) or 0)
    except (TypeError, ValueError):
        sell = 0.0
    wholesale = data.get('wholesale_price')
    try:
        wholesale = float(wholesale) if wholesale not in (None, '') else None
    except (TypeError, ValueError):
        wholesale = None
    unit_id = data.get('unit_id')
    try:
        unit_id = int(unit_id) if unit_id not in (None, '') else None
    except (TypeError, ValueError):
        unit_id = None
    unit_abbr = (data.get('unit_abbr') or data.get('unit') or '').strip() or None
    if unit_id and not unit_abbr:
        u = Unit.query.get(unit_id)
        if u:
            unit_abbr = u.abbreviation
    tax_rate = data.get('tax_rate')
    try:
        tax_rate = float(tax_rate) if tax_rate not in (None, '') else None
    except (TypeError, ValueError):
        tax_rate = None
    if tax_rate is None and product:
        tax_rate = float(product.tax_rate or 0)
    return {
        'variant_name': variant_name,
        'barcode': barcode,
        'sku_code': sku_code or barcode,
        'quantity_value': qty,
        'unit_id': unit_id,
        'unit_abbr': unit_abbr,
        'cost_price': max(cost, 0),
        'selling_price': max(sell, 0),
        'wholesale_price': wholesale,
        'tax_rate': tax_rate,
        'min_stock': int(data.get('min_stock', 0) or 0),
        'max_stock': int(data['max_stock']) if data.get('max_stock') not in (None, '') else None,
        'reorder_level': int(data.get('reorder_level', data.get('reorder_qty', 0)) or 0),
        'shelf_location': (data.get('shelf_location') or '').strip() or None,
        'image_url': (data.get('image_url') or '').strip() or None,
        'notes': (data.get('notes') or '').strip() or None,
        'status': (data.get('status') or 'active').strip(),
        'sort_order': int(data.get('sort_order', 0) or 0),
        'initial_stock': int(data.get('initial_stock', data.get('stock_level', 0)) or 0),
    }


def apply_sku_fields(sku: ProductSku, parsed: dict):
    sku.variant_name = parsed['variant_name']
    sku.barcode = parsed['barcode']
    sku.sku_code = parsed['sku_code']
    sku.quantity_value = Decimal(str(parsed['quantity_value']))
    sku.unit_id = parsed.get('unit_id')
    sku.unit_abbr = parsed.get('unit_abbr')
    sku.cost_price = parsed['cost_price']
    sku.selling_price = parsed['selling_price']
    sku.wholesale_price = parsed.get('wholesale_price')
    sku.tax_rate = parsed.get('tax_rate')
    sku.min_stock = parsed.get('min_stock', 0)
    sku.max_stock = parsed.get('max_stock')
    sku.reorder_level = parsed.get('reorder_level', 0)
    sku.shelf_location = parsed.get('shelf_location')
    sku.image_url = parsed.get('image_url')
    sku.notes = parsed.get('notes')
    sku.status = parsed.get('status', 'active')
    sku.sort_order = parsed.get('sort_order', 0)
