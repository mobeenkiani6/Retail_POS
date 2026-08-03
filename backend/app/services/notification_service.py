"""Generate inventory-based system notifications."""
from app.models import db, Notification, Inventory, Product, SyncOutbox


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
