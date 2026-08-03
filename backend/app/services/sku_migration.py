"""One-time migration: legacy Product + JSON variants → ProductSku records."""
from decimal import Decimal
from app.models import db, Product, ProductSku, Inventory, InventoryTransaction, SaleItem


def migrate_products_to_skus():
    """Convert existing products and variant JSON into ProductSku rows."""
    if ProductSku.query.count() > 0:
        return 0
    count = 0
    products = Product.query.all()
    for product in products:
        variants = product.variants or []
        if isinstance(variants, list) and len(variants) > 0:
            for i, v in enumerate(variants):
                if isinstance(v, str):
                    name = v.strip()
                    base_price = float(product.base_price or 0)
                    cost_price = float(product.cost_price or 0)
                    wholesale = float(product.wholesale_price) if product.wholesale_price else None
                elif isinstance(v, dict):
                    name = str(v.get('name', '')).strip() or f'Variant {i + 1}'
                    base_price = float(v.get('base_price', product.base_price) or 0)
                    cost_price = float(v.get('cost_price', product.cost_price) or 0)
                    wp = v.get('wholesale_price')
                    wholesale = float(wp) if wp not in (None, '') else None
                else:
                    continue
                barcode = _unique_barcode(f'{product.barcode or product.id}-{name}')
                sku = ProductSku(
                    product_id=product.id,
                    sku_code=f'{product.sku or product.barcode or product.id}-{name[:10]}',
                    barcode=barcode,
                    variant_name=name,
                    quantity_value=Decimal('1'),
                    unit_abbr=product.unit or 'ea',
                    unit_id=product.unit_id,
                    cost_price=cost_price,
                    selling_price=base_price,
                    wholesale_price=wholesale,
                    tax_rate=product.tax_rate,
                    min_stock=product.min_stock or 0,
                    max_stock=product.max_stock,
                    reorder_level=product.reorder_qty or 0,
                    shelf_location=product.shelf_location,
                    sort_order=i,
                    status='active',
                )
                db.session.add(sku)
                db.session.flush()
                _migrate_inventory_for_variant(product.id, name, sku.id)
                count += 1
        else:
            barcode = product.barcode or _unique_barcode(str(product.id))
            sku = ProductSku(
                product_id=product.id,
                sku_code=product.sku or product.barcode or f'PRD-{product.id}',
                barcode=barcode,
                variant_name='Standard',
                quantity_value=Decimal('1'),
                unit_abbr=product.unit or 'ea',
                unit_id=product.unit_id,
                cost_price=float(product.cost_price or 0),
                selling_price=float(product.base_price or 0),
                wholesale_price=float(product.wholesale_price) if product.wholesale_price else None,
                tax_rate=product.tax_rate,
                min_stock=product.min_stock or 0,
                max_stock=product.max_stock,
                reorder_level=product.reorder_qty or 0,
                shelf_location=product.shelf_location,
                sort_order=0,
                status='active',
            )
            db.session.add(sku)
            db.session.flush()
            _migrate_inventory_for_variant(product.id, '', sku.id)
            count += 1
    if count:
        db.session.commit()
        print(f'Migrated {count} SKU records from legacy products.')
    return count


def _unique_barcode(base: str) -> str:
    clean = ''.join(c for c in base if c.isalnum())[:20] or '890'
    candidate = clean
    n = 0
    while ProductSku.query.filter_by(barcode=candidate).first() or Product.query.filter_by(barcode=candidate).first():
        n += 1
        candidate = f'{clean}{n}'
    return candidate


def _migrate_inventory_for_variant(product_id: int, variant_name: str, sku_id: int):
    from app.services.stock_service import _sku_inventory_variant
    sku_variant = _sku_inventory_variant(sku_id)
    rows = Inventory.query.filter_by(product_id=product_id, variant=variant_name or '').all()
    for row in rows:
        existing = Inventory.query.filter_by(branch_id=row.branch_id, sku_id=sku_id).first()
        if existing:
            existing.stock_level += row.stock_level
            db.session.delete(row)
        else:
            row.sku_id = sku_id
            row.variant = sku_variant
    txns = InventoryTransaction.query.filter_by(product_id=product_id, variant=variant_name or '').all()
    for txn in txns:
        txn.sku_id = sku_id
    items = SaleItem.query.filter_by(product_id=product_id, variant=variant_name or None).all()
    for item in items:
        if not item.sku_id:
            item.sku_id = sku_id
