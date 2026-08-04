from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, time
from sqlalchemy import func
from app.models import db, Sale, SaleItem, Product, ProductBatch, Category, Supplier, Customer, User
from app.utils.auth_decorators import token_required, role_required
from app.routes.sales import get_time_filter_ranges
from app.branch_scope import resolve_branch_id

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/sales', methods=['GET'])
@token_required
def sales_report(current_user):
    time_filter = request.args.get('time_filter', 'month')
    start_dt, end_dt = get_time_filter_ranges(time_filter, request.args.get('start_date'), request.args.get('end_date'))
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    query = Sale.query.filter(Sale.status != 'refunded', Sale.archived_at == None)
    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)

    sales = query.all()
    by_payment = {}
    by_day = {}
    for s in sales:
        pm = s.payment_method or 'Unknown'
        by_payment[pm] = by_payment.get(pm, 0) + float(s.total_amount)
        day = s.created_at.strftime('%Y-%m-%d') if s.created_at else 'unknown'
        by_day[day] = by_day.get(day, 0) + float(s.total_amount)

    total = sum(float(s.total_amount) for s in sales)
    cogs = sum(float(s.cogs_amount or 0) for s in sales)
    return jsonify({
        'total_sales': total,
        'total_transactions': len(sales),
        'cogs': cogs,
        'gross_profit': total - cogs,
        'margin_percent': round((total - cogs) / total * 100, 2) if total else 0,
        'by_payment_method': [{'method': k, 'amount': v} for k, v in by_payment.items()],
        'by_day': [{'date': k, 'amount': v} for k, v in sorted(by_day.items())],
    }), 200


@reports_bp.route('/products', methods=['GET'])
@token_required
def product_report(current_user):
    time_filter = request.args.get('time_filter', 'month')
    start_dt, end_dt = get_time_filter_ranges(time_filter, request.args.get('start_date'), request.args.get('end_date'))
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    query = db.session.query(
        SaleItem.product_id,
        func.sum(SaleItem.quantity).label('qty'),
        func.sum(SaleItem.subtotal).label('revenue'),
        func.sum(SaleItem.cost_price * SaleItem.quantity).label('cogs'),
    ).join(Sale).filter(Sale.status != 'refunded')
    if branch_id:
        query = query.filter(Sale.branch_id == branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)

    results = query.group_by(SaleItem.product_id).order_by(func.sum(SaleItem.subtotal).desc()).limit(50).all()
    products = []
    for r in results:
        p = Product.query.get(r.product_id)
        rev = float(r.revenue or 0)
        c = float(r.cogs or 0)
        products.append({
            'product_id': r.product_id,
            'product_name': p.name if p else 'Unknown',
            'quantity_sold': int(r.qty or 0),
            'revenue': rev,
            'cogs': c,
            'profit': rev - c,
            'margin': round((rev - c) / rev * 100, 2) if rev else 0,
        })
    return jsonify({'products': products}), 200


@reports_bp.route('/categories', methods=['GET'])
@token_required
def category_report(current_user):
    time_filter = request.args.get('time_filter', 'month')
    start_dt, end_dt = get_time_filter_ranges(time_filter, request.args.get('start_date'), request.args.get('end_date'))
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    query = db.session.query(
        Category.name,
        func.sum(SaleItem.subtotal).label('revenue'),
        func.sum(SaleItem.quantity).label('qty'),
    ).join(Product, Product.id == SaleItem.product_id).join(Category, Category.id == Product.category_id).join(Sale).filter(Sale.status != 'refunded')
    if branch_id:
        query = query.filter(Sale.branch_id == branch_id)
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)

    results = query.group_by(Category.name).order_by(func.sum(SaleItem.subtotal).desc()).all()
    return jsonify({'categories': [{'name': r.name, 'revenue': float(r.revenue or 0), 'quantity': int(r.qty or 0)} for r in results]}), 200


@reports_bp.route('/inventory-valuation', methods=['GET'])
@token_required
def inventory_valuation(current_user):
    branch_id = request.args.get('branch_id')
    branch_id = resolve_branch_id(current_user, branch_id)

    query = ProductBatch.query.filter(ProductBatch.quantity > 0)
    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    batches = query.all()

    cost_value = sum(float(b.cost_price) * b.quantity for b in batches)
    retail_value = sum(float(b.sell_price) * b.quantity for b in batches)
    return jsonify({
        'total_batches': len(batches),
        'total_units': sum(b.quantity for b in batches),
        'cost_value': cost_value,
        'retail_value': retail_value,
        'potential_margin': retail_value - cost_value,
    }), 200


@reports_bp.route('/cashiers', methods=['GET'])
@token_required
@role_required('owner', 'manager')
def cashier_report(current_user):
    time_filter = request.args.get('time_filter', 'month')
    start_dt, end_dt = get_time_filter_ranges(time_filter, request.args.get('start_date'), request.args.get('end_date'))

    query = db.session.query(
        User.username,
        func.count(Sale.id).label('txns'),
        func.sum(Sale.total_amount).label('total'),
    ).join(Sale, Sale.user_id == User.id).filter(Sale.status != 'refunded')
    if start_dt and end_dt:
        query = query.filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
    results = query.group_by(User.username).order_by(func.sum(Sale.total_amount).desc()).all()
    return jsonify({'cashiers': [{'username': r.username, 'transactions': r.txns, 'total': float(r.total or 0)} for r in results]}), 200
