from flask import jsonify, request
from datetime import datetime
from app.models import db, Expense, ExpenseCategory, Sale
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.routes.admin.helpers import parse_branch_id, period_bounds
from app.services import event_bus


def _expense_dict(e):
    return {
        'id': e.id,
        'branch_id': e.branch_id,
        'category_id': e.category_id,
        'category_name': e.category.name if e.category else None,
        'title': e.title,
        'amount': float(e.amount or 0),
        'payment_method': e.payment_method,
        'expense_date': e.expense_date.isoformat() if e.expense_date else None,
        'notes': e.notes,
        'created_by': e.created_by,
        'created_at': e.created_at.isoformat() if e.created_at else None,
    }


@admin_bp.route('/expenses/categories', methods=['GET'])
@token_required
@admin_access
def list_expense_categories(current_user):
    cats = ExpenseCategory.query.filter_by(active=True).order_by(ExpenseCategory.name).all()
    return jsonify([{'id': c.id, 'name': c.name, 'description': c.description} for c in cats]), 200


@admin_bp.route('/expenses/categories', methods=['POST'])
@token_required
@admin_access
def create_expense_category(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Name required'}), 400
    if ExpenseCategory.query.filter_by(name=name).first():
        return jsonify({'message': 'Category exists'}), 409
    cat = ExpenseCategory(name=name, description=data.get('description'))
    db.session.add(cat)
    db.session.commit()
    return jsonify({'id': cat.id, 'name': cat.name}), 201


@admin_bp.route('/expenses', methods=['GET'])
@token_required
@admin_access
def list_expenses(current_user):
    branch_id = parse_branch_id() or request.args.get('branch_id')
    period = request.args.get('period')
    q = Expense.query.filter(Expense.archived_at == None)
    if branch_id:
        q = q.filter(Expense.branch_id == branch_id)
    if period:
        start, end = period_bounds(period)
        q = q.filter(Expense.expense_date >= start, Expense.expense_date <= end)
    rows = q.order_by(Expense.expense_date.desc()).limit(500).all()
    total = sum(float(e.amount or 0) for e in rows)
    return jsonify({'expenses': [_expense_dict(e) for e in rows], 'total': round(total, 2)}), 200


@admin_bp.route('/expenses', methods=['POST'])
@token_required
@admin_access
def create_expense(current_user):
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    amount = float(data.get('amount') or 0)
    if not title or amount <= 0:
        return jsonify({'message': 'title and positive amount required'}), 400
    exp = Expense(
        branch_id=data.get('branch_id') or current_user.branch_id,
        category_id=data.get('category_id'),
        title=title,
        amount=amount,
        payment_method=data.get('payment_method'),
        notes=data.get('notes'),
        created_by=current_user.id,
    )
    if data.get('expense_date'):
        try:
            exp.expense_date = datetime.fromisoformat(data['expense_date'].replace('Z', ''))
        except Exception:
            pass
    db.session.add(exp)
    db.session.commit()
    event_bus.emit_domain_event('expense.created', {'id': exp.id, 'amount': float(exp.amount)}, branch_id=exp.branch_id)
    return jsonify(_expense_dict(exp)), 201


@admin_bp.route('/expenses/<int:expense_id>', methods=['PUT'])
@token_required
@admin_access
def update_expense(current_user, expense_id):
    exp = Expense.query.get(expense_id)
    if not exp or exp.archived_at:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'message': 'title required'}), 400
        exp.title = title
    if 'amount' in data:
        amount = float(data.get('amount') or 0)
        if amount <= 0:
            return jsonify({'message': 'positive amount required'}), 400
        exp.amount = amount
    if 'payment_method' in data:
        exp.payment_method = data.get('payment_method')
    if 'notes' in data:
        exp.notes = data.get('notes')
    if data.get('expense_date'):
        try:
            exp.expense_date = datetime.fromisoformat(str(data['expense_date']).replace('Z', ''))
        except Exception:
            pass
    if 'category_id' in data:
        exp.category_id = data.get('category_id')
    db.session.commit()
    event_bus.emit_domain_event('expense.updated', {'id': exp.id, 'amount': float(exp.amount)}, branch_id=exp.branch_id)
    return jsonify(_expense_dict(exp)), 200


@admin_bp.route('/expenses/<int:expense_id>', methods=['DELETE'])
@token_required
@admin_access
def archive_expense(current_user, expense_id):
    exp = Expense.query.get(expense_id)
    if not exp:
        return jsonify({'message': 'Not found'}), 404
    exp.archived_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200


@admin_bp.route('/finance/pnl', methods=['GET'])
@token_required
@admin_access
def finance_pnl(current_user):
    period = request.args.get('period', 'month')
    branch_id = parse_branch_id()
    start, end = period_bounds(period)
    sales_q = Sale.query.filter(
        Sale.created_at >= start, Sale.created_at <= end,
        Sale.status.in_(['completed', 'partially_returned']),
    )
    if branch_id:
        sales_q = sales_q.filter(Sale.branch_id == branch_id)
    sales = sales_q.all()
    revenue = sum(float(s.total_amount or 0) for s in sales)
    cogs = sum(float(s.cogs_amount or 0) for s in sales)
    tax = sum(float(s.tax_amount or 0) for s in sales)
    exp_q = Expense.query.filter(
        Expense.expense_date >= start, Expense.expense_date <= end, Expense.archived_at == None,
    )
    if branch_id:
        exp_q = exp_q.filter(Expense.branch_id == branch_id)
    expenses = sum(float(e.amount or 0) for e in exp_q.all())
    gross = revenue - cogs
    return jsonify({
        'period': period,
        'revenue': round(revenue, 2),
        'cogs': round(cogs, 2),
        'gross_profit': round(gross, 2),
        'tax_collected': round(tax, 2),
        'expenses': round(expenses, 2),
        'net_profit': round(gross - expenses, 2),
        'orders': len(sales),
    }), 200
