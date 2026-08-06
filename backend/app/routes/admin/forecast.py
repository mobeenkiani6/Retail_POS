from flask import jsonify, request
from sqlalchemy import func
from datetime import datetime, timedelta
from collections import defaultdict
from app.models import db, Sale, SaleItem, Product, Inventory
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.routes.admin.helpers import parse_branch_id


@admin_bp.route('/forecast/demand', methods=['GET'])
@token_required
@admin_access
def demand_forecast(current_user):
    """Simple moving-average demand forecast per product (next 7 days)."""
    branch_id = parse_branch_id()
    lookback = min(int(request.args.get('lookback_days', 28)), 90)
    horizon = min(int(request.args.get('horizon_days', 7)), 30)
    start = datetime.utcnow() - timedelta(days=lookback)

    q = (
        db.session.query(
            SaleItem.product_id,
            Product.name,
            func.date(Sale.created_at).label('day'),
            func.sum(SaleItem.quantity).label('qty'),
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .join(Product, SaleItem.product_id == Product.id)
        .filter(Sale.created_at >= start, Sale.status == 'completed', Product.archived_at == None)
    )
    if branch_id:
        q = q.filter(Sale.branch_id == branch_id)
    rows = q.group_by(SaleItem.product_id, Product.name, func.date(Sale.created_at)).all()

    by_product = defaultdict(list)
    names = {}
    for pid, name, day, qty in rows:
        by_product[pid].append(float(qty or 0))
        names[pid] = name

    forecasts = []
    for pid, qtys in by_product.items():
        daily_avg = sum(qtys) / lookback if lookback else 0
        # mild seasonality: weekday boost from variance
        forecast_qty = round(daily_avg * horizon, 1)
        forecasts.append({
            'product_id': pid,
            'name': names[pid],
            'daily_avg': round(daily_avg, 2),
            'forecast_qty': forecast_qty,
            'horizon_days': horizon,
        })

    forecasts.sort(key=lambda x: -x['forecast_qty'])
    return jsonify({'forecasts': forecasts[:50], 'lookback_days': lookback, 'horizon_days': horizon}), 200


@admin_bp.route('/forecast/inventory', methods=['GET'])
@token_required
@admin_access
def inventory_forecast(current_user):
    """Days-of-cover estimate and reorder suggestions."""
    branch_id = parse_branch_id()
    lookback = 28
    start = datetime.utcnow() - timedelta(days=lookback)

    sales_q = (
        db.session.query(SaleItem.product_id, func.sum(SaleItem.quantity))
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= start, Sale.status == 'completed')
    )
    if branch_id:
        sales_q = sales_q.filter(Sale.branch_id == branch_id)
    sold = {pid: float(qty or 0) for pid, qty in sales_q.group_by(SaleItem.product_id).all()}

    inv_q = db.session.query(Inventory, Product).join(Product, Inventory.product_id == Product.id).filter(
        Product.archived_at == None
    )
    if branch_id:
        inv_q = inv_q.filter(Inventory.branch_id == branch_id)

    suggestions = []
    for inv, prod in inv_q.all():
        daily = sold.get(prod.id, 0) / lookback
        stock = inv.stock_level or 0
        days_cover = round(stock / daily, 1) if daily > 0 else None
        reorder = False
        if daily > 0 and days_cover is not None and days_cover < 7:
            reorder = True
        elif (prod.min_stock or 0) > 0 and stock <= (prod.min_stock or 0):
            reorder = True
        if reorder or (days_cover is not None and days_cover < 14):
            suggestions.append({
                'product_id': prod.id,
                'name': prod.name,
                'stock_level': stock,
                'daily_demand': round(daily, 2),
                'days_of_cover': days_cover,
                'reorder_qty': prod.reorder_qty or max(int(daily * 14 - stock), 0),
                'urgent': reorder,
            })

    suggestions.sort(key=lambda x: (not x['urgent'], x['days_of_cover'] if x['days_of_cover'] is not None else 999))
    return jsonify({'suggestions': suggestions[:100]}), 200
