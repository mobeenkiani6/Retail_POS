"""FEFO (First Expiry, First Out) batch resolution for retail POS."""
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import nulls_last
from app.models import db, Product, ProductBatch, Setting


DEFAULT_MARKDOWN_PERCENT = 20
DEFAULT_NEAR_EXPIRY_DAYS = 7


def _get_expiry_config(branch_id):
    setting = Setting.query.filter_by(branch_id=branch_id).first()
    if not setting:
        setting = Setting.query.filter_by(branch_id=None).first()
    config = (setting.config if setting else {}) or {}
    return {
        'near_expiry_days': int(config.get('near_expiry_days', DEFAULT_NEAR_EXPIRY_DAYS)),
        'near_expiry_markdown_percent': float(config.get('near_expiry_markdown_percent', DEFAULT_MARKDOWN_PERCENT)),
    }


def batch_status(batch, near_expiry_days=7):
    """Return status: active, near_expiry, expired, depleted."""
    if batch.quantity <= 0:
        return 'depleted'
    if batch.expiry_date:
        today = date.today()
        if batch.expiry_date < today:
            return 'expired'
        if batch.expiry_date <= today + timedelta(days=near_expiry_days):
            return 'near_expiry'
    return 'active'


def effective_sell_price(batch, near_expiry_markdown_percent=DEFAULT_MARKDOWN_PERCENT):
    """Apply near-expiry markdown if applicable."""
    base = float(batch.sell_price)
    if batch.markdown_percent and float(batch.markdown_percent) > 0:
        return base * (1 - float(batch.markdown_percent) / 100)
    if batch.expiry_date:
        today = date.today()
        cfg_days = DEFAULT_NEAR_EXPIRY_DAYS
        if batch.expiry_date <= today + timedelta(days=cfg_days) and batch.expiry_date >= today:
            return base * (1 - near_expiry_markdown_percent / 100)
    return base


def apply_near_expiry_markdowns(branch_id):
    """Auto-apply markdown to batches nearing expiry."""
    cfg = _get_expiry_config(branch_id)
    today = date.today()
    cutoff = today + timedelta(days=cfg['near_expiry_days'])
    batches = ProductBatch.query.filter(
        ProductBatch.branch_id == branch_id,
        ProductBatch.quantity > 0,
        ProductBatch.expiry_date != None,
        ProductBatch.expiry_date <= cutoff,
        ProductBatch.expiry_date >= today,
    ).all()
    for batch in batches:
        batch.markdown_percent = Decimal(str(cfg['near_expiry_markdown_percent']))
    db.session.commit()
    return len(batches)


def resolve_fefo_batch(product_id, branch_id, quantity=1):
    """
    Select earliest-expiring batch with sufficient stock.
    Raises ValueError with message on expired or insufficient stock.
    Returns (batch, unit_price).
    """
    cfg = _get_expiry_config(branch_id)
    apply_near_expiry_markdowns(branch_id)

    batches = (
        ProductBatch.query.filter_by(product_id=product_id, branch_id=branch_id)
        .filter(ProductBatch.quantity >= quantity)
        .order_by(nulls_last(ProductBatch.expiry_date.asc()), ProductBatch.received_at.asc())
        .all()
    )

    for batch in batches:
        status = batch_status(batch, cfg['near_expiry_days'])
        if status == 'expired':
            continue
        price = effective_sell_price(batch, cfg['near_expiry_markdown_percent'])
        return batch, price

    product = Product.query.get(product_id)
    name = product.name if product else f'Product #{product_id}'

    expired = ProductBatch.query.filter_by(product_id=product_id, branch_id=branch_id).filter(
        ProductBatch.quantity > 0,
        ProductBatch.expiry_date != None,
        ProductBatch.expiry_date < date.today(),
    ).first()
    if expired:
        raise ValueError(f'Batch expired for {name}. Cannot sell expired inventory.')

    raise ValueError(f'Insufficient batch stock for {name}')


def resolve_scan(barcode, branch_id, quantity=1):
    """Resolve barcode scan to product + FEFO batch."""
    product = Product.query.filter_by(barcode=barcode).filter(Product.archived_at == None).first()
    if not product:
        raise ValueError(f'Product not found for barcode: {barcode}')
    batch, unit_price = resolve_fefo_batch(product.id, branch_id, quantity)
    return {
        'product_id': product.id,
        'product_name': product.name,
        'barcode': product.barcode,
        'batch_id': batch.id,
        'batch_number': batch.batch_number,
        'expiry_date': batch.expiry_date.isoformat() if batch.expiry_date else None,
        'available_qty': batch.quantity,
        'unit_price': unit_price,
        'cost_price': float(batch.cost_price),
        'status': batch_status(batch, _get_expiry_config(branch_id)['near_expiry_days']),
        'category_id': product.category_id,
    }


def deduct_batch_stock(batch_id, quantity, movement_type='sale_out', reference_type=None, reference_id=None, user_id=None):
    """Deduct quantity from batch and record movement."""
    from app.models import BatchMovement

    batch = ProductBatch.query.get(batch_id)
    if not batch or batch.quantity < quantity:
        raise ValueError('Insufficient batch quantity')
    batch.quantity -= quantity
    movement = BatchMovement(
        batch_id=batch_id,
        movement_type=movement_type,
        quantity_delta=-quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        created_by=user_id,
    )
    db.session.add(movement)
    return batch
