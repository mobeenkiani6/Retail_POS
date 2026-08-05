"""Product packaging conversions (carton / packet ↔ sellable SKU units)."""
from decimal import Decimal, ROUND_HALF_UP

MASS = {
    'g': Decimal('1'), 'gram': Decimal('1'), 'grams': Decimal('1'),
    'kg': Decimal('1000'), 'kilogram': Decimal('1000'), 'kilograms': Decimal('1000'),
}
VOLUME = {
    'ml': Decimal('1'), 'milliliter': Decimal('1'), 'millilitre': Decimal('1'),
    'l': Decimal('1000'), 'ltr': Decimal('1000'), 'liter': Decimal('1000'),
    'litre': Decimal('1000'), 'liters': Decimal('1000'), 'litres': Decimal('1000'),
}


def _norm(unit):
    return (unit or '').strip().lower()


def to_base_factor(unit):
    """Return (family, factor-to-smallest) or None if not convertible."""
    u = _norm(unit)
    if u in MASS:
        return 'mass', MASS[u]
    if u in VOLUME:
        return 'volume', VOLUME[u]
    return None, None


def convert_qty(qty, from_unit, to_unit):
    """Convert qty from from_unit to to_unit. Same discrete units return qty as-is."""
    q = Decimal(str(qty or 0))
    if q <= 0:
        return Decimal('0')
    fu, tu = _norm(from_unit), _norm(to_unit)
    if not fu or not tu or fu == tu:
        return q
    ff, ffac = to_base_factor(fu)
    tf, tfac = to_base_factor(tu)
    if ff and tf and ff == tf and ffac and tfac:
        return q * ffac / tfac
    # discrete / unknown — treat 1:1 by label match only
    return q


def packaging_content_in_unit(product, pack_type, target_unit):
    """Content of one carton/packet expressed in target_unit."""
    if pack_type == 'carton':
        qty = getattr(product, 'carton_qty', None) or 0
        unit = getattr(product, 'carton_unit', None) or product.unit or 'pc'
    elif pack_type == 'packet':
        qty = getattr(product, 'packet_qty', None) or 0
        unit = getattr(product, 'packet_unit', None) or product.unit or 'pc'
    else:
        return Decimal('0')
    return convert_qty(qty, unit, target_unit)


def packs_per_receive_unit(product, sku, receive_unit):
    """
    How many SKU stock units equal one receive_unit (unit|carton|packet).
    Example: SKU 1 kg, carton = 12 kg → 12 packs per carton.
    """
    ru = _norm(receive_unit) or 'unit'
    if ru in ('unit', 'ea', 'each', 'pc', 'pcs', 'piece', ''):
        return Decimal('1')

    sku_qty = Decimal(str(sku.quantity_value or 1))
    sku_unit = (sku.unit_abbr or product.unit or 'pc').strip()
    if sku_qty <= 0:
        sku_qty = Decimal('1')

    if ru == 'carton':
        content = packaging_content_in_unit(product, 'carton', sku_unit)
    elif ru == 'packet':
        content = packaging_content_in_unit(product, 'packet', sku_unit)
    else:
        return Decimal('1')

    if content <= 0:
        raise ValueError(
            f'Packaging for {ru} is not configured on {product.name}. '
            f'Set packaging sizes on the product first.'
        )
    packs = content / sku_qty
    if packs <= 0:
        raise ValueError(f'Invalid packaging conversion for {product.name}')
    return packs


def receive_quantity_to_stock(product, sku, quantity, receive_unit='unit'):
    """Convert GRN quantity in receive_unit into integer SKU stock units."""
    packs = packs_per_receive_unit(product, sku, receive_unit)
    total = Decimal(str(quantity)) * packs
    rounded = int(total.to_integral_value(rounding=ROUND_HALF_UP))
    if rounded <= 0:
        raise ValueError('Received quantity converts to zero stock units')
    # Allow tiny float noise; reject clearly fractional pack totals
    if abs(total - rounded) > Decimal('0.001'):
        raise ValueError(
            f'Quantity must convert to a whole number of packs (got {total})'
        )
    return rounded


def cost_per_sku_unit(cost_price, quantity, stock_units):
    """Derive per-pack cost from line cost × qty / stock units received."""
    if not stock_units:
        return Decimal(str(cost_price or 0))
    line = Decimal(str(cost_price or 0)) * Decimal(str(quantity or 0))
    return (line / Decimal(str(stock_units))).quantize(Decimal('0.01'))
