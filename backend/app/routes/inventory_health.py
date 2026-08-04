from flask import Blueprint, request, jsonify
from datetime import date, timedelta
from sqlalchemy import func
from app.models import db, ProductBatch, Product, Category
from app.utils.auth_decorators import token_required
from app.services.fefo_service import batch_status, _get_expiry_config, apply_near_expiry_markdowns
from app.branch_scope import resolve_branch_id

inventory_health_bp = Blueprint('inventory_health', __name__)


@inventory_health_bp.route('/summary', methods=['GET'])
@token_required
def health_summary(current_user):
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    if branch_id:
        apply_near_expiry_markdowns(branch_id)

    query = ProductBatch.query.filter(ProductBatch.quantity > 0)
    if branch_id:
        query = query.filter(ProductBatch.branch_id == branch_id)
    batches = query.all()
    cfg = _get_expiry_config(branch_id)
    today = date.today()

    by_status = {'active': 0, 'near_expiry': 0, 'expired': 0, 'depleted': 0}
    expiring_timeline = []
    category_risk = {}

    for batch in batches:
        status = batch_status(batch, cfg['near_expiry_days'])
        by_status[status] = by_status.get(status, 0) + 1
        if batch.expiry_date and batch.expiry_date >= today:
            days_left = (batch.expiry_date - today).days
            expiring_timeline.append({
                'batch_id': batch.id,
                'product_name': batch.product.name if batch.product else None,
                'batch_number': batch.batch_number,
                'quantity': batch.quantity,
                'days_left': days_left,
                'expiry_date': batch.expiry_date.isoformat(),
            })
            if days_left <= cfg['near_expiry_days']:
                cat_name = batch.product.category.name if batch.product and batch.product.category else 'Other'
                category_risk[cat_name] = category_risk.get(cat_name, 0) + batch.quantity

    expiring_timeline.sort(key=lambda x: x['days_left'])

    total_value_at_risk = sum(
        float(b.cost_price) * b.quantity
        for b in batches
        if b.expiry_date and b.expiry_date <= today + timedelta(days=cfg['near_expiry_days'])
    )

    return jsonify({
        'by_status': by_status,
        'expiring_timeline': expiring_timeline[:50],
        'category_risk': [{'category': k, 'at_risk_units': v} for k, v in sorted(category_risk.items(), key=lambda x: -x[1])],
        'total_value_at_risk': total_value_at_risk,
        'near_expiry_days': cfg['near_expiry_days'],
        'markdown_percent': cfg['near_expiry_markdown_percent'],
        'health_score': max(0, min(100, int(100 - by_status.get('expired', 0) * 5 - by_status.get('near_expiry', 0) * 2))),
    }), 200
