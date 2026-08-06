from flask import jsonify, request
from sqlalchemy import func
from datetime import datetime, timedelta
from app.models import (
    db, Sale, SaleItem, Product, ProductBatch, Inventory, Customer, User, Branch,
)
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.routes.admin.helpers import parse_branch_id, period_bounds, apply_branch_filter


def _revenue_for(branch_id, start, end):
    q = Sale.query.filter(
        Sale.status.in_(['completed', 'partially_returned']),
        Sale.created_at >= start,
        Sale.created_at <= end,
    )
    q = apply_branch_filter(q, Sale, branch_id)
    rows = q.all()
    revenue = sum(float(s.total_amount or 0) for s in rows)
    cogs = sum(float(s.cogs_amount or 0) for s in rows)
    return {
        'revenue': round(revenue, 2),
        'cogs': round(cogs, 2),
        'profit': round(revenue - cogs, 2),
        'orders': len(rows),
    }


@admin_bp.route('/dashboard/overview', methods=['GET'])
@token_required
@admin_access
def dashboard_overview(current_user):
    branch_id = parse_branch_id()

    revenue = {}
    for period in ('today', 'week', 'month', 'year'):
        start, end = period_bounds(period)
        revenue[period] = _revenue_for(branch_id, start, end)

    # Order status breakdown (today)
    start, end = period_bounds('today')
    status_q = db.session.query(Sale.status, func.count(Sale.id)).filter(
        Sale.created_at >= start, Sale.created_at <= end,
    )
    if branch_id:
        status_q = status_q.filter(Sale.branch_id == branch_id)
    status_rows = status_q.group_by(Sale.status).all()
    orders = {
        'total': sum(c for _, c in status_rows),
        'completed': 0,
        'pending': 0,
        'cancelled': 0,
        'refunded': 0,
        'held': 0,
        'partially_returned': 0,
    }
    for status, count in status_rows:
        key = status if status in orders else 'total'
        if status in orders:
            orders[status] = count
        if status == 'completed':
            orders['completed'] = count
        elif status in ('refunded',):
            orders['refunded'] = count
        elif status == 'held':
            orders['pending'] = orders.get('pending', 0) + count
            orders['held'] = count

    # Inventory health
    inv_q = (
        db.session.query(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .filter(Product.archived_at == None)
    )
    if branch_id:
        inv_q = inv_q.filter(Inventory.branch_id == branch_id)
    inv_rows = inv_q.all()

    low_stock = out_of_stock = dead_stock = 0
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    sold_product_ids = {
        r[0] for r in db.session.query(SaleItem.product_id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= thirty_days_ago, Sale.status == 'completed')
        .distinct().all()
    }

    for inv, prod in inv_rows:
        level = inv.stock_level or 0
        min_s = prod.min_stock or 0
        if level == 0:
            out_of_stock += 1
        elif min_s > 0 and level <= min_s:
            low_stock += 1
        if level > 0 and prod.id not in sold_product_ids:
            dead_stock += 1

    # Expiring batches (30 days)
    expiring = 0
    try:
        expiry_limit = (now + timedelta(days=30)).date()
        batch_q = ProductBatch.query.filter(
            ProductBatch.expiry_date != None,
            ProductBatch.expiry_date <= expiry_limit,
            ProductBatch.quantity > 0,
        )
        if branch_id:
            batch_q = batch_q.filter(ProductBatch.branch_id == branch_id)
        expiring = batch_q.count()
    except Exception:
        expiring = 0

    inventory = {
        'low_stock': low_stock,
        'out_of_stock': out_of_stock,
        'expiring': expiring,
        'dead_stock': dead_stock,
        'total_skus': len(inv_rows),
        'inventory_value': round(sum(float(p.cost_price or 0) * (r.stock_level or 0) for r, p in inv_rows), 2),
    }

    # Customers
    cust_start, cust_end = period_bounds('today')
    new_customers = Customer.query.filter(
        Customer.created_at >= cust_start,
        Customer.created_at <= cust_end,
        Customer.archived_at == None,
    ).count()
    returning = db.session.query(func.count(func.distinct(Sale.customer_id))).filter(
        Sale.created_at >= cust_start,
        Sale.created_at <= cust_end,
        Sale.customer_id != None,
    ).scalar() or 0
    active_customers = Customer.query.filter(Customer.archived_at == None).count()
    vip = Customer.query.filter(
        Customer.archived_at == None,
        Customer.loyalty_points >= 500,
    ).count()

    customers = {
        'new': new_customers,
        'returning': returning,
        'active': active_customers,
        'vip': vip,
    }

    # Top / least products (30 days)
    prod_start = now - timedelta(days=30)
    top_q = (
        db.session.query(
            Product.id, Product.name,
            func.sum(SaleItem.quantity).label('qty'),
            func.sum(SaleItem.subtotal).label('rev'),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= prod_start, Sale.status == 'completed')
    )
    if branch_id:
        top_q = top_q.filter(Sale.branch_id == branch_id)
    top_rows = top_q.group_by(Product.id, Product.name).order_by(func.sum(SaleItem.subtotal).desc()).limit(10).all()
    least_rows = top_q.group_by(Product.id, Product.name).order_by(func.sum(SaleItem.quantity).asc()).limit(10).all()

    # Profit leaders
    profit_q = (
        db.session.query(
            Product.id, Product.name,
            func.sum(SaleItem.subtotal - (SaleItem.cost_price * SaleItem.quantity)).label('profit'),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= prod_start, Sale.status == 'completed')
    )
    if branch_id:
        profit_q = profit_q.filter(Sale.branch_id == branch_id)
    high_profit = profit_q.group_by(Product.id, Product.name).order_by(
        func.sum(SaleItem.subtotal - (SaleItem.cost_price * SaleItem.quantity)).desc()
    ).limit(5).all()

    products = {
        'top_selling': [{'id': r[0], 'name': r[1], 'qty': int(r[2] or 0), 'revenue': float(r[3] or 0)} for r in top_rows],
        'least_selling': [{'id': r[0], 'name': r[1], 'qty': int(r[2] or 0), 'revenue': float(r[3] or 0)} for r in least_rows],
        'highest_profit': [{'id': r[0], 'name': r[1], 'profit': float(r[2] or 0)} for r in high_profit],
    }

    # Employees
    cashier_q = (
        db.session.query(
            User.id, User.username,
            func.count(Sale.id).label('sales_count'),
            func.coalesce(func.sum(Sale.total_amount), 0).label('sales_total'),
        )
        .outerjoin(Sale, db.and_(
            Sale.user_id == User.id,
            Sale.created_at >= start,
            Sale.created_at <= end,
            Sale.status == 'completed',
        ))
        .filter(User.archived_at == None, User.role.in_(['cashier', 'manager', 'owner']))
    )
    if branch_id:
        cashier_q = cashier_q.filter(User.branch_id == branch_id)
    cashier_rows = cashier_q.group_by(User.id, User.username).order_by(
        func.coalesce(func.sum(Sale.total_amount), 0).desc()
    ).limit(10).all()

    active_employees = User.query.filter(User.archived_at == None).count()
    employees = {
        'best_cashier': (
            {'id': cashier_rows[0][0], 'username': cashier_rows[0][1], 'sales_total': float(cashier_rows[0][3])}
            if cashier_rows else None
        ),
        'leaderboard': [
            {'id': r[0], 'username': r[1], 'sales_count': int(r[2] or 0), 'sales_total': float(r[3] or 0)}
            for r in cashier_rows
        ],
        'active': active_employees,
    }

    branches_count = Branch.query.filter(Branch.archived_at == None).count()

    return jsonify({
        'revenue': revenue,
        'orders': orders,
        'inventory': inventory,
        'customers': customers,
        'products': products,
        'employees': employees,
        'branches_count': branches_count,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'branch_id': branch_id,
    }), 200
