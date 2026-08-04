from flask import Blueprint, request, jsonify
from sqlalchemy import func
from datetime import datetime, timedelta, time
from app.models import (
    db, Sale, SaleItem, Product, Category,
    User, SyncOutbox, Customer, AuditLog, Inventory,
)
from app.utils.auth_decorators import token_required
from app.branch_scope import resolve_branch_id

dashboard_bp = Blueprint('dashboard', __name__)


def _branch_filter(current_user, branch_id):
    return resolve_branch_id(current_user, branch_id)


def _today_range():
    now = datetime.utcnow()
    tz_offset = timedelta(hours=5)
    local_now = now + tz_offset
    start = datetime.combine(local_now.date(), time.min) - tz_offset
    end = datetime.combine(local_now.date(), time.max) - tz_offset
    return start, end


@dashboard_bp.route('/operations', methods=['GET'])
@token_required
def operations_dashboard(current_user):
    branch_id = _branch_filter(current_user, request.args.get('branch_id'))
    start_dt, end_dt = _today_range()

    sales_q = Sale.query.filter(
        Sale.status == 'completed',
        Sale.created_at >= start_dt,
        Sale.created_at <= end_dt,
    )
    if branch_id:
        sales_q = sales_q.filter(Sale.branch_id == branch_id)

    sales = sales_q.all()
    total_revenue = sum(float(s.total_amount) for s in sales)
    total_cogs = sum(float(s.cogs_amount or 0) for s in sales)
    gross_profit = total_revenue - total_cogs

    inv_q = (
        db.session.query(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .filter(Product.archived_at == None)
    )
    if branch_id:
        inv_q = inv_q.filter(Inventory.branch_id == branch_id)
    inv_rows = inv_q.all()

    inventory_value = sum(float(p.cost_price or 0) * r.stock_level for r, p in inv_rows)
    total_skus = len(inv_rows)
    total_units = sum(r.stock_level for r, _ in inv_rows)
    out_of_stock = sum(1 for r, _ in inv_rows if r.stock_level == 0)
    low_stock = sum(
        1 for r, p in inv_rows
        if (p.min_stock or 0) > 0 and r.stock_level <= (p.min_stock or 0) and r.stock_level > 0
    )

    pending_sync = SyncOutbox.query.filter_by(status='pending').count()
    active_cashiers = User.query.filter(
        User.role.in_(['cashier', 'manager']),
        User.archived_at == None,
    ).count()

    customers_today = db.session.query(func.count(func.distinct(Sale.customer_id))).filter(
        Sale.created_at >= start_dt,
        Sale.created_at <= end_dt,
        Sale.customer_id != None,
    ).scalar() or 0

    sale_ids = [s.id for s in sales]
    top_cats = []
    if sale_ids:
        rows = (
            db.session.query(Category.name, func.sum(SaleItem.subtotal).label('rev'))
            .join(Product, Product.category_id == Category.id)
            .join(SaleItem, SaleItem.product_id == Product.id)
            .filter(SaleItem.sale_id.in_(sale_ids))
            .group_by(Category.name)
            .order_by(func.sum(SaleItem.subtotal).desc())
            .limit(5)
            .all()
        )
        top_cats = [{'name': r[0] or 'Uncategorized', 'revenue': float(r[1] or 0)} for r in rows]

    top_products = []
    if sale_ids:
        rows = (
            db.session.query(Product.name, func.sum(SaleItem.quantity).label('qty'))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .filter(SaleItem.sale_id.in_(sale_ids))
            .group_by(Product.name)
            .order_by(func.sum(SaleItem.quantity).desc())
            .limit(5)
            .all()
        )
        top_products = [{'name': r[0], 'quantity': int(r[1] or 0)} for r in rows]

    hourly = [0] * 24
    for s in sales:
        if s.created_at:
            h = (s.created_at + timedelta(hours=5)).hour
            hourly[h] += float(s.total_amount)

    total_tracked = total_skus or 1
    health_score = max(0, min(100, int(
        100 - (out_of_stock / total_tracked * 35) - (low_stock / total_tracked * 25)
    )))

    recent = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()

    return jsonify({
        'today_sales_count': len(sales),
        'today_revenue': total_revenue,
        'gross_profit': gross_profit,
        'cogs': total_cogs,
        'inventory_value': round(inventory_value, 2),
        'total_skus': total_skus,
        'total_units': total_units,
        'customers_today': customers_today,
        'active_cashiers': active_cashiers,
        'pending_sync': pending_sync,
        'low_stock_count': low_stock,
        'out_of_stock_count': out_of_stock,
        'top_categories': top_cats,
        'top_products': top_products,
        'hourly_sales': hourly,
        'inventory_health_score': health_score,
        'recent_activity': [
            {
                'action': r.action,
                'entity_type': r.entity_type,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent
        ],
        'store_status': 'open',
        'cloud_sync_status': 'online' if pending_sync == 0 else 'pending',
    }), 200
