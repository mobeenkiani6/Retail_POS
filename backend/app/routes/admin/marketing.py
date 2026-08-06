from flask import jsonify, request
from datetime import datetime
from app.models import db, Coupon, GiftCard, Promotion
from app.utils.auth_decorators import token_required, admin_access
from app.routes.admin import admin_bp
from app.services import event_bus


def _coupon_dict(c):
    return {
        'id': c.id,
        'code': c.code,
        'name': c.name,
        'discount_type': c.discount_type,
        'discount_value': float(c.discount_value or 0),
        'active': c.active,
        'expires_at': c.expires_at.isoformat() if c.expires_at else None,
        'usage_limit': getattr(c, 'usage_limit', None),
        'usage_count': getattr(c, 'usage_count', 0) or 0,
        'min_order_amount': float(getattr(c, 'min_order_amount', 0) or 0),
    }


@admin_bp.route('/marketing/coupons', methods=['GET'])
@token_required
@admin_access
def list_coupons(current_user):
    rows = Coupon.query.order_by(Coupon.id.desc()).all()
    return jsonify([_coupon_dict(c) for c in rows]), 200


@admin_bp.route('/marketing/coupons', methods=['POST'])
@token_required
@admin_access
def create_coupon(current_user):
    data = request.get_json() or {}
    code = (data.get('code') or '').strip().upper()
    if not code:
        return jsonify({'message': 'code required'}), 400
    if Coupon.query.filter_by(code=code).first():
        return jsonify({'message': 'Code already exists'}), 409
    c = Coupon(
        code=code,
        name=data.get('name') or code,
        discount_type=data.get('discount_type', 'percent'),
        discount_value=float(data.get('discount_value') or 0),
        active=bool(data.get('active', True)),
    )
    if hasattr(Coupon, 'usage_limit'):
        c.usage_limit = data.get('usage_limit')
    if hasattr(Coupon, 'min_order_amount'):
        c.min_order_amount = data.get('min_order_amount') or 0
    if data.get('expires_at'):
        try:
            c.expires_at = datetime.fromisoformat(data['expires_at'].replace('Z', ''))
        except Exception:
            pass
    db.session.add(c)
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'coupon', 'id': c.id})
    return jsonify(_coupon_dict(c)), 201


@admin_bp.route('/marketing/coupons/<int:coupon_id>', methods=['PUT'])
@token_required
@admin_access
def update_coupon(current_user, coupon_id):
    c = Coupon.query.get(coupon_id)
    if not c:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ('name', 'discount_type', 'active'):
        if field in data:
            setattr(c, field, data[field])
    if 'discount_value' in data:
        c.discount_value = float(data['discount_value'])
    if 'usage_limit' in data and hasattr(c, 'usage_limit'):
        c.usage_limit = data['usage_limit']
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'coupon', 'id': c.id})
    return jsonify(_coupon_dict(c)), 200


@admin_bp.route('/marketing/gift-cards', methods=['GET'])
@token_required
@admin_access
def list_gift_cards(current_user):
    rows = GiftCard.query.order_by(GiftCard.id.desc()).all()
    return jsonify([{
        'id': g.id,
        'code': g.code,
        'balance': float(g.balance or 0),
        'active': g.active,
        'created_at': g.created_at.isoformat() if g.created_at else None,
    } for g in rows]), 200


@admin_bp.route('/marketing/gift-cards', methods=['POST'])
@token_required
@admin_access
def create_gift_card(current_user):
    data = request.get_json() or {}
    code = (data.get('code') or '').strip().upper()
    balance = float(data.get('balance') or data.get('initial_balance') or 0)
    if not code or balance <= 0:
        return jsonify({'message': 'code and positive balance required'}), 400
    if GiftCard.query.filter_by(code=code).first():
        return jsonify({'message': 'Code exists'}), 409
    g = GiftCard(code=code, balance=balance, active=True)
    if hasattr(g, 'initial_balance'):
        g.initial_balance = balance
    db.session.add(g)
    db.session.commit()
    return jsonify({'id': g.id, 'code': g.code, 'balance': float(g.balance)}), 201


@admin_bp.route('/marketing/promotions', methods=['GET'])
@token_required
@admin_access
def list_promotions(current_user):
    rows = Promotion.query.order_by(Promotion.id.desc()).all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'promo_type': p.promo_type,
        'config': p.config or {},
        'active': p.active,
        'starts_at': p.starts_at.isoformat() if p.starts_at else None,
        'ends_at': p.ends_at.isoformat() if p.ends_at else None,
    } for p in rows]), 200


@admin_bp.route('/marketing/promotions', methods=['POST'])
@token_required
@admin_access
def create_promotion(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'name required'}), 400
    p = Promotion(
        name=name,
        promo_type=data.get('promo_type', 'discount'),
        config=data.get('config') or {},
        active=bool(data.get('active', True)),
    )
    db.session.add(p)
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'promotion', 'id': p.id})
    return jsonify({'id': p.id, 'name': p.name}), 201


@admin_bp.route('/marketing/coupons/<int:coupon_id>', methods=['DELETE'])
@token_required
@admin_access
def delete_coupon(current_user, coupon_id):
    c = Coupon.query.get(coupon_id)
    if not c:
        return jsonify({'message': 'Not found'}), 404
    db.session.delete(c)
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'coupon', 'id': coupon_id, 'action': 'deleted'})
    return jsonify({'message': 'Deleted'}), 200


@admin_bp.route('/marketing/gift-cards/<int:card_id>', methods=['PUT'])
@token_required
@admin_access
def update_gift_card(current_user, card_id):
    g = GiftCard.query.get(card_id)
    if not g:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    if 'balance' in data:
        g.balance = float(data['balance'])
    if 'active' in data:
        g.active = bool(data['active'])
    if 'code' in data and data['code']:
        g.code = str(data['code']).strip().upper()
    db.session.commit()
    return jsonify({'id': g.id, 'code': g.code, 'balance': float(g.balance), 'active': g.active}), 200


@admin_bp.route('/marketing/gift-cards/<int:card_id>', methods=['DELETE'])
@token_required
@admin_access
def delete_gift_card(current_user, card_id):
    g = GiftCard.query.get(card_id)
    if not g:
        return jsonify({'message': 'Not found'}), 404
    db.session.delete(g)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200


@admin_bp.route('/marketing/promotions/<int:promo_id>', methods=['PUT'])
@token_required
@admin_access
def update_promotion(current_user, promo_id):
    p = Promotion.query.get(promo_id)
    if not p:
        return jsonify({'message': 'Not found'}), 404
    data = request.get_json() or {}
    if 'name' in data:
        p.name = (data['name'] or p.name).strip()
    if 'promo_type' in data:
        p.promo_type = data['promo_type']
    if 'config' in data:
        p.config = data['config'] or {}
    if 'active' in data:
        p.active = bool(data['active'])
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'promotion', 'id': p.id})
    return jsonify({'id': p.id, 'name': p.name, 'active': p.active, 'promo_type': p.promo_type, 'config': p.config}), 200


@admin_bp.route('/marketing/promotions/<int:promo_id>', methods=['DELETE'])
@token_required
@admin_access
def delete_promotion(current_user, promo_id):
    p = Promotion.query.get(promo_id)
    if not p:
        return jsonify({'message': 'Not found'}), 404
    db.session.delete(p)
    db.session.commit()
    event_bus.emit_domain_event('catalog.updated', {'entity': 'promotion', 'id': promo_id, 'action': 'deleted'})
    return jsonify({'message': 'Deleted'}), 200
