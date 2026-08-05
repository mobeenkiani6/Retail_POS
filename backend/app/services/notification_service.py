"""Generate inventory-based system notifications."""
from app.models import db, Notification, Inventory, Product, SyncOutbox


def notify_sale_below_cost(branch_id, product_name, variant_name, cost_price, sell_price):
    """Create a warning when purchase cost rises above the sale price."""
    label = f'{product_name}' + (f' ({variant_name})' if variant_name else '')
    title = f'Sale price below cost: {label}'
    message = (
        f'{label} purchase cost is now {float(cost_price):.2f} but sale price is '
        f'{float(sell_price):.2f}. Update the sale price to protect margin.'
    )
    existing = Notification.query.filter_by(title=title, read=False).first()
    if existing:
        existing.message = message
        existing.severity = 'warning'
        return existing
    note = Notification(
        branch_id=branch_id,
        title=title,
        message=message,
        severity='warning',
    )
    db.session.add(note)
    return note


def generate_system_notifications(branch_id=None):
    query = (
        db.session.query(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .filter(Product.archived_at == None)
    )
    if branch_id:
        query = query.filter(Inventory.branch_id == branch_id)

    for inv, product in query.all():
        if inv.stock_level == 0:
            title = f'Out of stock: {product.name}'
            existing = Notification.query.filter_by(title=title, read=False).first()
            if not existing:
                db.session.add(Notification(
                    branch_id=inv.branch_id,
                    title=title,
                    message=f'{product.name} has no units on hand.',
                    severity='danger',
                ))
        elif (product.min_stock or 0) > 0 and inv.stock_level <= product.min_stock:
            title = f'Low stock: {product.name}'
            existing = Notification.query.filter_by(title=title, read=False).first()
            if not existing:
                db.session.add(Notification(
                    branch_id=inv.branch_id,
                    title=title,
                    message=f'{product.name} has {inv.stock_level} units (min: {product.min_stock}).',
                    severity='warning',
                ))

    failed_sync = SyncOutbox.query.filter_by(status='failed').count()
    if failed_sync > 0:
        existing = Notification.query.filter_by(title='Sync failures detected', read=False).first()
        if not existing:
            db.session.add(Notification(
                branch_id=branch_id,
                title='Sync failures detected',
                message=f'{failed_sync} sync event(s) failed. Review Cloud Sync.',
                severity='danger',
            ))

    db.session.commit()
