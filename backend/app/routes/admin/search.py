from flask import jsonify, request
from sqlalchemy import or_
from app.models import (
    Product, Sale, Customer, Supplier, User, Branch, AuditLog,
)
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp


@admin_bp.route('/search', methods=['GET'])
@token_required
@admin_access
def global_search(current_user):
    q = (request.args.get('q') or '').strip()
    if len(q) < 1:
        return jsonify({'results': []}), 200
    limit = min(int(request.args.get('limit', 8)), 20)
    like = f'%{q}%'
    results = []

    for p in Product.query.filter(
        Product.archived_at == None,
        or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)),
    ).limit(limit).all():
        results.append({
            'type': 'product', 'id': p.id, 'title': p.name,
            'subtitle': p.sku or p.barcode or '', 'href': f'/catalog/{p.id}',
        })

    for s in Sale.query.filter(
        or_(Sale.invoice_number.ilike(like), Sale.receipt_number.ilike(like)),
    ).order_by(Sale.created_at.desc()).limit(limit).all():
        results.append({
            'type': 'order', 'id': s.id,
            'title': s.invoice_number or f'Sale #{s.id}',
            'subtitle': f'{s.status} · {float(s.total_amount or 0):.2f}',
            'href': f'/sales/{s.id}',
        })

    for c in Customer.query.filter(
        Customer.archived_at == None,
        or_(Customer.name.ilike(like), Customer.phone.ilike(like), Customer.email.ilike(like)),
    ).limit(limit).all():
        results.append({
            'type': 'customer', 'id': c.id, 'title': c.name,
            'subtitle': c.phone or c.email or '', 'href': f'/customers/{c.id}',
        })

    for s in Supplier.query.filter(
        Supplier.archived_at == None,
        or_(Supplier.name.ilike(like), Supplier.supplier_code.ilike(like)),
    ).limit(limit).all():
        results.append({
            'type': 'supplier', 'id': s.id, 'title': s.name,
            'subtitle': s.supplier_code or s.phone or '', 'href': f'/suppliers/{s.id}',
        })

    for u in User.query.filter(
        User.archived_at == None,
        User.username.ilike(like),
    ).limit(limit).all():
        results.append({
            'type': 'employee', 'id': u.id, 'title': u.username,
            'subtitle': u.role, 'href': f'/employees/{u.id}',
        })

    for b in Branch.query.filter(
        Branch.archived_at == None,
        or_(Branch.name.ilike(like), Branch.id.ilike(like)),
    ).limit(limit).all():
        results.append({
            'type': 'branch', 'id': b.id, 'title': b.name,
            'subtitle': b.id, 'href': f'/branches/{b.id}',
        })

    # Static settings / reports hits
    static = [
        ('reports', 'Reports', '/reports'),
        ('settings', 'Settings', '/settings'),
        ('dashboard', 'Dashboard', '/'),
        ('inventory', 'Inventory', '/inventory'),
        ('finance', 'Finance', '/finance'),
        ('marketing', 'Marketing', '/marketing'),
        ('security', 'Security', '/security'),
        ('bi', 'Business Intelligence', '/bi'),
    ]
    ql = q.lower()
    for typ, title, href in static:
        if ql in title.lower() or ql in typ:
            results.append({'type': typ, 'id': typ, 'title': title, 'subtitle': 'Navigate', 'href': href})

    return jsonify({'results': results[:40], 'query': q}), 200
