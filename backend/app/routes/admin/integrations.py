from flask import jsonify, request
from datetime import datetime
from app.models import db, IntegrationSetting, Setting
from app.utils.auth_decorators import token_required, admin_access, admin_owner_required
from app.routes.admin import admin_bp


PROVIDERS = ('email', 'sms', 'whatsapp', 'custom')


@admin_bp.route('/integrations', methods=['GET'])
@token_required
@admin_access
def list_integrations(current_user):
    rows = {r.provider: r for r in IntegrationSetting.query.all()}
    out = []
    for p in PROVIDERS:
        r = rows.get(p)
        out.append({
            'provider': p,
            'enabled': r.enabled if r else False,
            'config': (r.config or {}) if r else {},
            'configured': r is not None,
        })
    return jsonify(out), 200


@admin_bp.route('/integrations/<provider>', methods=['PUT'])
@token_required
@admin_owner_required
def upsert_integration(current_user, provider):
    if provider not in PROVIDERS:
        return jsonify({'message': 'Unknown provider'}), 400
    data = request.get_json() or {}
    row = IntegrationSetting.query.filter_by(provider=provider).first()
    if not row:
        row = IntegrationSetting(provider=provider, config={})
        db.session.add(row)
    if 'config' in data:
        row.config = data['config'] or {}
    if 'enabled' in data:
        row.enabled = bool(data['enabled'])
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'provider': provider, 'enabled': row.enabled, 'config': row.config}), 200


@admin_bp.route('/backup/export-meta', methods=['GET'])
@token_required
@admin_owner_required
def backup_meta(current_user):
    """Lightweight backup metadata — full dump via pg_dump recommended in ops."""
    from app.models import Product, Sale, Customer, Branch, User
    return jsonify({
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'counts': {
            'branches': Branch.query.count(),
            'products': Product.query.count(),
            'sales': Sale.query.count(),
            'customers': Customer.query.count(),
            'users': User.query.count(),
        },
        'note': 'Use pg_dump for full database backup. This endpoint provides integrity counts only.',
    }), 200


@admin_bp.route('/settings/business', methods=['GET'])
@token_required
@admin_access
def get_business_settings(current_user):
    branch_id = request.args.get('branch_id')
    if branch_id:
        s = Setting.query.filter_by(branch_id=branch_id).first()
    else:
        s = Setting.query.filter_by(branch_id=None).first()
    return jsonify({'config': (s.config if s else {}) or {}, 'branch_id': branch_id}), 200


@admin_bp.route('/settings/business', methods=['PUT'])
@token_required
@admin_owner_required
def update_business_settings(current_user):
    data = request.get_json() or {}
    branch_id = data.get('branch_id')  # None = global
    config = data.get('config')
    if config is None:
        return jsonify({'message': 'config required'}), 400
    s = Setting.query.filter_by(branch_id=branch_id).first()
    if not s:
        s = Setting(branch_id=branch_id, config=config)
        db.session.add(s)
    else:
        s.config = config
    db.session.commit()
    from app.services import event_bus
    event_bus.settings_updated(branch_id)
    return jsonify({'config': s.config, 'branch_id': branch_id}), 200
