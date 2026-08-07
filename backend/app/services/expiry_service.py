"""Product expiry / lot alerts — shared by POS and Admin."""
from datetime import date, datetime, timedelta
from app.models import db, Product, ProductBatch, Category, Notification, BatchMovement, Setting
from app.services.event_bus import notification_created


DEFAULT_WARNING_DAYS = 14  # standard grocery: ~2 weeks
FRESH_WARNING_DAYS = 2     # fruits / veg / meat style


def resolve_warning_days(product, branch_id=None):
    """
    Warning window (days before expiry):
      1. product.expiry_warning_days if set
      2. category.expiry_warning_days if set
      3. branch Setting near_expiry_days if set
      4. DEFAULT_WARNING_DAYS (14)
    """
    if product is None:
        return DEFAULT_WARNING_DAYS
    own = getattr(product, 'expiry_warning_days', None)
    if own is not None and int(own) >= 0:
        return int(own)
    cat = getattr(product, 'category', None)
    if cat is not None:
        cat_days = getattr(cat, 'expiry_warning_days', None)
        if cat_days is not None and int(cat_days) >= 0:
            return int(cat_days)
    if branch_id:
        setting = Setting.query.filter_by(branch_id=branch_id).first()
        if not setting:
            setting = Setting.query.filter_by(branch_id=None).first()
        cfg = (setting.config if setting else {}) or {}
        if cfg.get('near_expiry_days') is not None:
            try:
                return max(0, int(cfg['near_expiry_days']))
            except (TypeError, ValueError):
                pass
    return DEFAULT_WARNING_DAYS


def parse_expiry_date(value):
    if value in (None, ''):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()[:10]
    try:
        return datetime.strptime(text, '%Y-%m-%d').date()
    except ValueError:
        raise ValueError(f'Invalid expiry date: {value}')


def suggest_expiry_from_shelf_life(product, from_date=None):
    days = getattr(product, 'shelf_life_days', None) if product else None
    if not days or int(days) <= 0:
        return None
    base = from_date or date.today()
    return base + timedelta(days=int(days))


def lot_alert_status(expiry_date, warning_days, today=None):
    """Return expired | near_expiry | ok | none."""
    if not expiry_date:
        return 'none'
    today = today or date.today()
    if expiry_date < today:
        return 'expired'
    if expiry_date <= today + timedelta(days=max(0, int(warning_days or 0))):
        return 'near_expiry'
    return 'ok'


def create_or_update_batch_from_receive(
    *,
    branch_id,
    product,
    sku_id,
    quantity,
    cost_price,
    sell_price,
    batch_number,
    expiry_date,
    grn_id=None,
    grn_number=None,
    grn_item_id=None,
    user_id=None,
):
    """
    Upsert a ProductBatch lot for received stock.
    Always creates/updates a lot so expiry can be tracked for all products.
    expiry_date may be None for non-perishables.
    """
    if quantity <= 0:
        return None

    bn = (batch_number or '').strip()
    if not bn or bn.upper() == 'N/A':
        if expiry_date:
            bn = f"EXP-{expiry_date.isoformat()}"
            if sku_id:
                bn = f"{bn}-S{sku_id}"
        elif grn_item_id:
            bn = f"{grn_number or 'GRN'}-L{grn_item_id}"
        else:
            bn = f"{grn_number or 'LOT'}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    batch = ProductBatch.query.filter_by(
        branch_id=branch_id,
        product_id=product.id,
        batch_number=bn,
    ).first()

    if batch:
        batch.quantity = int(batch.quantity or 0) + int(quantity)
        if sku_id and not batch.sku_id:
            batch.sku_id = sku_id
        if expiry_date:
            batch.expiry_date = expiry_date
        if cost_price is not None:
            batch.cost_price = cost_price
        if sell_price is not None and float(sell_price or 0) > 0:
            batch.sell_price = sell_price
    else:
        batch = ProductBatch(
            branch_id=branch_id,
            product_id=product.id,
            sku_id=sku_id,
            batch_number=bn,
            quantity=int(quantity),
            cost_price=cost_price or 0,
            sell_price=sell_price or getattr(product, 'base_price', 0) or 0,
            expiry_date=expiry_date,
            received_at=datetime.utcnow(),
        )
        db.session.add(batch)
        db.session.flush()

    db.session.add(BatchMovement(
        batch_id=batch.id,
        movement_type='grn_in',
        quantity_delta=int(quantity),
        reference_type='grn',
        reference_id=grn_id,
        notes=f'Received on {grn_number or grn_id}',
        created_by=user_id,
    ))
    return batch


def list_expiry_alerts(branch_id=None, include_ok=False):
    """Lots that are expired or within their warning window."""
    today = date.today()
    query = (
        db.session.query(ProductBatch, Product)
        .join(Product, ProductBatch.product_id == Product.id)
        .filter(
            Product.archived_at == None,
            ProductBatch.quantity > 0,
            ProductBatch.expiry_date != None,
        )
    )
    if branch_id:
        query = query.filter(ProductBatch.branch_id == branch_id)

    alerts = []
    for batch, product in query.order_by(ProductBatch.expiry_date.asc()).all():
        warning_days = resolve_warning_days(product, batch.branch_id)
        status = lot_alert_status(batch.expiry_date, warning_days, today)
        if status == 'ok' and not include_ok:
            continue
        if status == 'none':
            continue
        days_left = (batch.expiry_date - today).days
        sku_label = None
        if batch.sku_id and batch.sku:
            from app.services.sku_service import format_sku_display
            sku_label = format_sku_display(batch.sku)
        alerts.append({
            'batch_id': batch.id,
            'product_id': product.id,
            'sku_id': batch.sku_id,
            'name': product.name,
            'display_label': sku_label,
            'batch_number': batch.batch_number,
            'quantity': int(batch.quantity or 0),
            'expiry_date': batch.expiry_date.isoformat(),
            'days_left': days_left,
            'warning_days': warning_days,
            'status': status,
            'branch_id': batch.branch_id,
            'requires_expiry': bool(product.requires_expiry),
            'category_id': product.category_id,
            'category_name': product.category.name if product.category else None,
        })
    return alerts


def upsert_expiry_notifications(branch_id=None):
    """Create/update Notification rows for near-expiry and expired lots; emit realtime events."""
    alerts = list_expiry_alerts(branch_id=branch_id)
    created = []
    for a in alerts:
        if a['status'] == 'expired':
            title = f"Expired stock: {a['name']}"
            message = (
                f"Batch {a['batch_number']} of {a['name']}"
                + (f" ({a['display_label']})" if a.get('display_label') else '')
                + f" expired on {a['expiry_date']} — {a['quantity']} units still on hand."
            )
            severity = 'danger'
        else:
            title = f"Expiring soon: {a['name']}"
            message = (
                f"Batch {a['batch_number']} of {a['name']}"
                + (f" ({a['display_label']})" if a.get('display_label') else '')
                + f" expires in {a['days_left']} day(s) ({a['expiry_date']}) — {a['quantity']} units."
            )
            severity = 'warning'

        # Dedupe by title + batch in message key via title including product; refine with batch
        dedupe_title = f"{title} [{a['batch_number']}]"
        existing = Notification.query.filter_by(
            branch_id=a['branch_id'],
            title=dedupe_title,
            read=False,
        ).first()
        if existing:
            existing.message = message
            existing.severity = severity
            note = existing
            is_new = False
        else:
            note = Notification(
                branch_id=a['branch_id'],
                title=dedupe_title,
                message=message,
                severity=severity,
            )
            db.session.add(note)
            is_new = True
        db.session.flush()
        if is_new:
            try:
                notification_created(note)
            except Exception:
                pass
            created.append(note.id)
    return created
