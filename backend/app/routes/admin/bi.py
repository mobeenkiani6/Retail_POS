from flask import jsonify, request
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app.models import db, Sale, SaleItem, Product, Customer, Supplier, Inventory, Expense, Branch
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.routes.admin.helpers import parse_branch_id, period_bounds


@admin_bp.route('/bi/overview', methods=['GET'])
@token_required
@admin_access
def bi_overview(current_user):
    branch_id = parse_branch_id()
    days = min(int(request.args.get('days', 30)), 365)
    start = datetime.utcnow() - timedelta(days=days)

    sales_q = Sale.query.filter(
        Sale.created_at >= start,
        Sale.status.in_(['completed', 'partially_returned']),
    )
    if branch_id:
        sales_q = sales_q.filter(Sale.branch_id == branch_id)
    sales = sales_q.all()

    # Daily trend
    by_day = {}
    for s in sales:
        key = s.created_at.strftime('%Y-%m-%d') if s.created_at else 'unknown'
        bucket = by_day.setdefault(key, {'revenue': 0, 'orders': 0, 'profit': 0})
        rev = float(s.total_amount or 0)
        cogs = float(s.cogs_amount or 0)
        bucket['revenue'] += rev
        bucket['profit'] += rev - cogs
        bucket['orders'] += 1
    sales_trend = [
        {'date': k, 'revenue': round(v['revenue'], 2), 'orders': v['orders'], 'profit': round(v['profit'], 2)}
        for k, v in sorted(by_day.items())
    ]

    # Peak hours
    hour_map = {h: 0 for h in range(24)}
    for s in sales:
        if s.created_at:
            # Approximate local peak with +5h (PK)
            hour = (s.created_at.hour + 5) % 24
            hour_map[hour] += 1
    peak_hours = [{'hour': h, 'orders': hour_map[h]} for h in range(24)]

    # Payment methods
    pay = {}
    for s in sales:
        m = s.payment_method or 'unknown'
        pay[m] = pay.get(m, 0) + float(s.total_amount or 0)
    payment_methods = [{'method': k, 'amount': round(v, 2)} for k, v in sorted(pay.items(), key=lambda x: -x[1])]

    total_rev = sum(float(s.total_amount or 0) for s in sales)
    total_orders = len(sales)
    aov = round(total_rev / total_orders, 2) if total_orders else 0

    # Basket size
    sale_ids = [s.id for s in sales]
    avg_basket = 0
    if sale_ids:
        item_count = db.session.query(func.coalesce(func.sum(SaleItem.quantity), 0)).filter(
            SaleItem.sale_id.in_(sale_ids)
        ).scalar() or 0
        avg_basket = round(float(item_count) / total_orders, 2) if total_orders else 0

    # Customer retention (repeat purchase rate)
    cust_counts = db.session.query(Sale.customer_id, func.count(Sale.id)).filter(
        Sale.created_at >= start,
        Sale.customer_id != None,
        Sale.status == 'completed',
    )
    if branch_id:
        cust_counts = cust_counts.filter(Sale.branch_id == branch_id)
    cust_counts = cust_counts.group_by(Sale.customer_id).all()
    with_purchases = len(cust_counts)
    repeaters = sum(1 for _, c in cust_counts if c >= 2)
    repeat_rate = round((repeaters / with_purchases) * 100, 1) if with_purchases else 0

    # Expenses in period
    exp_q = Expense.query.filter(Expense.expense_date >= start, Expense.archived_at == None)
    if branch_id:
        exp_q = exp_q.filter(Expense.branch_id == branch_id)
    total_expenses = sum(float(e.amount or 0) for e in exp_q.all())

    total_cogs = sum(float(s.cogs_amount or 0) for s in sales)
    gross_profit = total_rev - total_cogs
    net_profit = gross_profit - total_expenses

    # Anomaly rules
    insights = []
    if len(sales_trend) >= 7:
        recent = sales_trend[-3:]
        prior = sales_trend[-7:-3]
        recent_avg = sum(d['revenue'] for d in recent) / max(len(recent), 1)
        prior_avg = sum(d['revenue'] for d in prior) / max(len(prior), 1)
        if prior_avg > 0 and recent_avg < prior_avg * 0.7:
            insights.append({
                'type': 'anomaly',
                'severity': 'warning',
                'title': 'Revenue drop detected',
                'message': f'Recent 3-day avg revenue is {round((1 - recent_avg / prior_avg) * 100)}% below the prior period.',
            })
        if prior_avg > 0 and recent_avg > prior_avg * 1.3:
            insights.append({
                'type': 'opportunity',
                'severity': 'success',
                'title': 'Sales surge',
                'message': 'Recent revenue is significantly above the prior baseline. Consider stocking top movers.',
            })

    if repeat_rate < 20 and with_purchases > 5:
        insights.append({
            'type': 'recommendation',
            'severity': 'info',
            'title': 'Low repeat purchase rate',
            'message': f'Only {repeat_rate}% of customers returned. Activate loyalty or coupons.',
        })

    if aov > 0:
        insights.append({
            'type': 'insight',
            'severity': 'info',
            'title': 'Average order value',
            'message': f'AOV is {aov}. Bundle offers can lift basket size (currently {avg_basket} units).',
        })

    # Branch performance
    branch_perf = []
    for b in Branch.query.filter(Branch.archived_at == None).all():
        b_sales = [s for s in sales if s.branch_id == b.id] if not branch_id else (
            sales if branch_id == b.id else []
        )
        if branch_id and branch_id != b.id:
            continue
        br = sum(float(s.total_amount or 0) for s in (sales if not branch_id else b_sales) if s.branch_id == b.id)
        bo = sum(1 for s in sales if s.branch_id == b.id)
        branch_perf.append({'id': b.id, 'name': b.name, 'revenue': round(br, 2), 'orders': bo})

    return jsonify({
        'sales_trend': sales_trend,
        'peak_hours': peak_hours,
        'payment_methods': payment_methods,
        'kpis': {
            'revenue': round(total_rev, 2),
            'orders': total_orders,
            'aov': aov,
            'avg_basket_size': avg_basket,
            'gross_profit': round(gross_profit, 2),
            'expenses': round(total_expenses, 2),
            'net_profit': round(net_profit, 2),
            'repeat_purchase_rate': repeat_rate,
            'customer_growth': Customer.query.filter(Customer.created_at >= start).count(),
        },
        'branch_performance': branch_perf,
        'insights': insights,
        'days': days,
    }), 200


@admin_bp.route('/bi/product-affinity', methods=['GET'])
@token_required
@admin_access
def product_affinity(current_user):
    """Co-occurrence of products in the same sale (cross-sell)."""
    days = min(int(request.args.get('days', 90)), 365)
    start = datetime.utcnow() - timedelta(days=days)
    limit = min(int(request.args.get('limit', 20)), 50)

    sale_ids = [r[0] for r in db.session.query(Sale.id).filter(
        Sale.created_at >= start, Sale.status == 'completed',
    ).all()]
    if not sale_ids:
        return jsonify({'pairs': []}), 200

    # Build pairs per sale
    items = db.session.query(SaleItem.sale_id, SaleItem.product_id, Product.name).join(
        Product, SaleItem.product_id == Product.id
    ).filter(SaleItem.sale_id.in_(sale_ids)).all()

    from collections import defaultdict
    by_sale = defaultdict(set)
    names = {}
    for sale_id, pid, name in items:
        by_sale[sale_id].add(pid)
        names[pid] = name

    pair_counts = defaultdict(int)
    for pids in by_sale.values():
        plist = sorted(pids)
        for i in range(len(plist)):
            for j in range(i + 1, len(plist)):
                pair_counts[(plist[i], plist[j])] += 1

    top = sorted(pair_counts.items(), key=lambda x: -x[1])[:limit]
    pairs = [
        {
            'product_a': {'id': a, 'name': names.get(a, str(a))},
            'product_b': {'id': b, 'name': names.get(b, str(b))},
            'count': c,
        }
        for (a, b), c in top if c >= 2
    ]
    return jsonify({'pairs': pairs, 'days': days}), 200
