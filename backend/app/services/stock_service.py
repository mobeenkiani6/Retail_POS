"""Branch-scoped SKU inventory — retail POS stock engine."""
from datetime import datetime
from sqlalchemy import func
from app.models import db, Inventory, InventoryTransaction, ProductBatch, Product, ProductSku


MOVEMENT_REASONS = {
    'stock_in': 'Stock In',
    'stock_out': 'Stock Out',
    'adjustment': 'Manual Adjustment',
    'damage': 'Damage',
    'waste': 'Waste',
    'shrinkage': 'Shrinkage',
    'return_in': 'Return',
    'return_out': 'Return Out',
    'purchase_receive': 'Purchase Receiving',
    'sale': 'Sale',
    'refund': 'Refund',
    'cycle_count': 'Cycle Count',
}


def _norm_variant(variant):
    return (variant or '').strip()


def _sku_inventory_variant(sku_id):
    """Unique legacy variant key per SKU — avoids (branch_id, product_id, variant) collisions."""
    return f'__sku:{sku_id}__'


def get_or_create_inventory(branch_id, product_id, variant='', sku_id=None):
    if sku_id:
        row = Inventory.query.filter_by(branch_id=branch_id, sku_id=sku_id).first()
        if row:
            return row
        sku = ProductSku.query.get(sku_id)
        sku_variant = _sku_inventory_variant(sku_id)
        # Adopt unassigned legacy row matched by variant name or empty variant
        for v in filter(None, [sku.variant_name if sku else None, '']):
            legacy = Inventory.query.filter_by(
                branch_id=branch_id, product_id=product_id, variant=v,
            ).filter(Inventory.sku_id == None).first()
            if legacy:
                legacy.sku_id = sku_id
                legacy.variant = sku_variant
                db.session.flush()
                return legacy
        row = Inventory(
            branch_id=branch_id, product_id=product_id, sku_id=sku_id,
            variant=sku_variant, stock_level=0,
        )
        db.session.add(row)
        db.session.flush()
        return row
    variant = _norm_variant(variant)
    row = Inventory.query.filter_by(
        branch_id=branch_id, product_id=product_id, variant=variant,
    ).first()
    if not row:
        row = Inventory(branch_id=branch_id, product_id=product_id, variant=variant, stock_level=0)
        db.session.add(row)
        db.session.flush()
    return row


def get_stock_level(branch_id, product_id, variant='', sku_id=None):
    if sku_id:
        row = Inventory.query.filter_by(branch_id=branch_id, sku_id=sku_id).first()
        return row.stock_level if row else 0
    variant = _norm_variant(variant)
    row = Inventory.query.filter_by(
        branch_id=branch_id, product_id=product_id, variant=variant,
    ).first()
    return row.stock_level if row else 0


def get_sku_stock_level(branch_id, sku_id):
    return get_stock_level(branch_id, 0, sku_id=sku_id)


def get_product_stock_levels(branch_id, product_id):
    """Aggregate stock for a product — prefers SKU rows, falls back to legacy variant rows."""
    sku_rows = (
        Inventory.query.join(ProductSku, Inventory.sku_id == ProductSku.id)
        .filter(Inventory.branch_id == branch_id, ProductSku.product_id == product_id)
        .all()
    )
    if sku_rows:
        by_sku = {}
        total = 0
        for row in sku_rows:
            if row.sku_id:
                by_sku[str(row.sku_id)] = row.stock_level
            total += row.stock_level
        return total, by_sku
    rows = Inventory.query.filter_by(branch_id=branch_id, product_id=product_id).all()
    by_variant = {}
    total = 0
    for row in rows:
        if row.variant:
            by_variant[row.variant] = row.stock_level
        total += row.stock_level
    return total, by_variant


def get_stock_map(branch_id):
    rows = Inventory.query.filter_by(branch_id=branch_id).all()
    totals = {}
    variants = {}
    sku_totals = {}
    for row in rows:
        pid = str(row.product_id)
        totals[pid] = totals.get(pid, 0) + row.stock_level
        if row.sku_id:
            sku_totals[str(row.sku_id)] = row.stock_level
        elif row.variant:
            variants.setdefault(pid, {})[row.variant] = row.stock_level
    return totals, variants, sku_totals


def adjust_stock(
    branch_id,
    product_id,
    delta,
    reason='adjustment',
    reference_type=None,
    reference_id=None,
    user_id=None,
    notes=None,
    variant='',
    sku_id=None,
):
    if delta == 0:
        raise ValueError('Stock delta cannot be zero')
    variant = _norm_variant(variant)
    row = get_or_create_inventory(branch_id, product_id, variant, sku_id=sku_id)
    new_level = row.stock_level + int(delta)
    if new_level < 0:
        label = ''
        if sku_id:
            sku = ProductSku.query.get(sku_id)
            if sku:
                from app.services.sku_service import format_sku_display
                label = f' ({format_sku_display(sku)})'
        elif variant:
            label = f' ({variant})'
        raise ValueError(f'Insufficient stock{label}')
    row.stock_level = new_level
    row.updated_at = datetime.utcnow()
    txn = InventoryTransaction(
        branch_id=branch_id,
        product_id=product_id,
        sku_id=sku_id,
        variant=variant,
        delta=int(delta),
        reason=reason,
        reference_type=reference_type,
        reference_id=reference_id,
        user_id=user_id,
        notes=notes or MOVEMENT_REASONS.get(reason, reason),
    )
    db.session.add(txn)
    return row


def adjust_sku_stock(branch_id, sku_id, delta, **kwargs):
    sku = ProductSku.query.get(sku_id)
    if not sku:
        raise ValueError(f'SKU {sku_id} not found')
    return adjust_stock(branch_id, sku.product_id, delta, sku_id=sku_id, **kwargs)


def deduct_stock(branch_id, product_id, quantity, reference_type='sale', reference_id=None, user_id=None, variant='', sku_id=None):
    return adjust_stock(
        branch_id, product_id, -int(quantity),
        reason='sale', reference_type=reference_type, reference_id=reference_id,
        user_id=user_id, variant=variant, sku_id=sku_id,
    )


def deduct_sku_stock(branch_id, sku_id, quantity, **kwargs):
    return adjust_sku_stock(branch_id, sku_id, -int(quantity), reason='sale', **kwargs)


def restock(branch_id, product_id, quantity, reason='stock_in', variant='', sku_id=None, **kwargs):
    return adjust_stock(branch_id, product_id, int(quantity), reason=reason, variant=variant, sku_id=sku_id, **kwargs)


def restock_sku(branch_id, sku_id, quantity, reason='stock_in', **kwargs):
    return adjust_sku_stock(branch_id, sku_id, int(quantity), reason=reason, **kwargs)


def fix_sku_inventory_variants(db_session):
    """Ensure each SKU inventory row has a unique (branch_id, product_id, variant) key."""
    rows = Inventory.query.filter(Inventory.sku_id != None).all()
    changed = 0
    for row in rows:
        expected = _sku_inventory_variant(row.sku_id)
        if row.variant == expected:
            continue
        conflict = Inventory.query.filter_by(
            branch_id=row.branch_id, product_id=row.product_id, variant=expected,
        ).filter(Inventory.id != row.id).first()
        if conflict:
            if conflict.sku_id == row.sku_id:
                conflict.stock_level += row.stock_level
                db_session.delete(row)
                changed += 1
            continue
        row.variant = expected
        changed += 1
    if changed:
        db_session.commit()
        print(f'Fixed {changed} SKU inventory variant key(s).')


def migrate_batches_to_inventory(db_session):
    if Inventory.query.count() > 0:
        return
    totals = (
        db_session.query(
            ProductBatch.branch_id,
            ProductBatch.product_id,
            func.sum(ProductBatch.quantity).label('total'),
        )
        .group_by(ProductBatch.branch_id, ProductBatch.product_id)
        .all()
    )
    for branch_id, product_id, total in totals:
        qty = int(total or 0)
        if qty <= 0:
            continue
        sku = ProductSku.query.filter_by(product_id=product_id).order_by(ProductSku.sort_order).first()
        if sku:
            row = Inventory(
                branch_id=branch_id, product_id=product_id, sku_id=sku.id,
                variant=_sku_inventory_variant(sku.id), stock_level=qty,
            )
        else:
            row = Inventory(branch_id=branch_id, product_id=product_id, variant='', stock_level=qty)
        db_session.add(row)
    if totals:
        db_session.commit()
        print(f'Migrated batch stock to inventory for {len(totals)} product/branch rows.')


def resolve_sku_scan(barcode, branch_id, quantity=1):
    """Primary scan resolver — matches ProductSku barcode or sku_code."""
    from app.services.sku_service import format_sku_display, sku_to_dict
    sku = ProductSku.query.filter(
        db.or_(ProductSku.barcode == barcode, ProductSku.sku_code == barcode),
        ProductSku.archived_at == None,
        ProductSku.status != 'inactive',
    ).first()
    if not sku:
        return None
    product = Product.query.get(sku.product_id)
    if not product or product.archived_at:
        raise ValueError(f'Product not found for barcode: {barcode}')
    stock = get_sku_stock_level(branch_id, sku.id)
    if stock < quantity:
        label = format_sku_display(sku)
        raise ValueError(f'Insufficient stock for {product.name} {label} (available: {stock})')
    brand_name = product.brand or ''
    if product.brand_ref:
        brand_name = product.brand_ref.name
    display = format_sku_display(sku)
    tax = float(sku.tax_rate if sku.tax_rate is not None else (product.tax_rate or 0))
    return {
        'sku_id': sku.id,
        'product_id': product.id,
        'product_name': product.name,
        'display_label': display,
        'barcode': sku.barcode,
        'sku_code': sku.sku_code,
        'unit_price': float(sku.selling_price),
        'cost_price': float(sku.cost_price),
        'tax_rate': tax,
        'stock_level': stock,
        'variant': display,
        'category_name': product.category.name if product.category else None,
        'brand': brand_name,
        'image_url': sku.image_url or product.image_url or '',
    }


def resolve_product_scan(barcode, branch_id, quantity=1, variant=''):
    """Scan resolver — SKU-first, legacy product fallback."""
    result = resolve_sku_scan(barcode, branch_id, quantity)
    if result:
        return result
    product = Product.query.filter(
        db.or_(Product.barcode == barcode, Product.sku == barcode),
        Product.archived_at == None,
    ).first()
    if not product:
        raise ValueError(f'Product not found for barcode: {barcode}')
    variant = _norm_variant(variant)
    from app.utils.product_variants import variant_names_from_product
    names = variant_names_from_product(product)
    if names and not variant:
        sku_match = ProductSku.query.filter_by(product_id=product.id, archived_at=None).filter(
            ProductSku.variant_name.in_(names)
        ).first()
        if sku_match:
            return resolve_sku_scan(sku_match.barcode, branch_id, quantity)
        raise ValueError(f'{product.name} requires a variant selection')
    sku = ProductSku.query.filter_by(product_id=product.id, archived_at=None).first()
    if sku and not variant:
        return resolve_sku_scan(sku.barcode, branch_id, quantity)
    stock = get_stock_level(branch_id, product.id, variant)
    if stock < quantity:
        label = f' {variant}' if variant else ''
        raise ValueError(f'Insufficient stock for {product.name}{label} (available: {stock})')
    from app.utils.product_variants import resolve_variant_pricing
    pricing = resolve_variant_pricing(product, variant or None)
    brand_name = product.brand or ''
    if product.brand_ref:
        brand_name = product.brand_ref.name
    _, stock_by_variant = get_product_stock_levels(branch_id, product.id)
    return {
        'product_id': product.id,
        'product_name': product.name,
        'barcode': product.barcode,
        'sku': product.sku or product.barcode,
        'unit_price': pricing['base_price'],
        'cost_price': pricing['cost_price'],
        'tax_rate': float(product.tax_rate or 0),
        'stock_level': stock,
        'stock_by_variant': stock_by_variant,
        'variant': variant or None,
        'variants': names,
        'category_name': product.category.name if product.category else None,
        'brand': brand_name,
        'image_url': product.image_url or '',
    }
