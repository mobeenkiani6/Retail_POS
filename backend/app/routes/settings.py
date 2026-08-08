from typing import Optional

from flask import Blueprint, request, jsonify
from app.models import db, Setting
from app.utils.auth_decorators import token_required, owner_required
from app.branch_scope import resolve_branch_id

settings_bp = Blueprint('settings', __name__)

# Nested keys that must deep-merge (branch must not wipe sibling fields).
_DEEP_MERGE_KEYS = frozenset({
    'receipt_settings',
    'receipt',
    'receipt_template',
    'branding',
    'hardware',
    'tax_rates_by_payment_method',
})

# Shared across Admin HQ + every POS — never shadowed by a branch override.
_GLOBAL_SHARED_KEYS = frozenset({
    'receipt_settings',
    'receipt_header',
    'receipt_footer',
    'receipt',
    'receipt_template',
})


def _deep_merge(base, override):
    """Shallow merge with deep merge for known nested dict keys."""
    if not base:
        return dict(override or {})
    if not override:
        return dict(base)
    merged = {**base, **override}
    for key in _DEEP_MERGE_KEYS:
        if isinstance(base.get(key), dict) or isinstance(override.get(key), dict):
            left = base.get(key) if isinstance(base.get(key), dict) else {}
            right = override.get(key) if isinstance(override.get(key), dict) else {}
            merged[key] = {**left, **right}
    return merged


def _merge_configs(global_config, branch_config):
    """Merge global config as base with branch overrides.

    Receipt settings are always global (Admin ↔ POS sync). If only a branch
    still has legacy receipt_settings, those are used until global is written.
    """
    merged = _deep_merge(global_config, branch_config)
    g = global_config or {}
    b = branch_config or {}

    for key in _GLOBAL_SHARED_KEYS:
        if key in g and g[key] not in (None, {}, ''):
            if isinstance(g[key], dict) and isinstance(b.get(key), dict):
                # Prefer global as source of truth; keep any branch-only extras briefly
                # only when global is empty for that nested field — global wins on conflict.
                merged[key] = {**b[key], **g[key]} if g[key] else b[key]
            else:
                merged[key] = g[key]
        elif key in b:
            merged[key] = b[key]

    return merged


def _get_or_create_setting(branch_id):
    setting = Setting.query.filter_by(branch_id=branch_id).first()
    if not setting:
        setting = Setting(branch_id=branch_id, config={})
        db.session.add(setting)
        db.session.flush()
    if setting.config is None:
        setting.config = {}
    return setting


def upsert_global_receipt_settings(receipt_patch: dict, extra_top_level: Optional[dict] = None):
    """Merge receipt fields into the global Setting row and clear branch overrides."""
    global_setting = _get_or_create_setting(None)
    config = dict(global_setting.config or {})
    existing_receipt = config.get('receipt_settings') if isinstance(config.get('receipt_settings'), dict) else {}
    config['receipt_settings'] = {**existing_receipt, **(receipt_patch or {})}
    if extra_top_level:
        for k, v in extra_top_level.items():
            if k == 'receipt_settings':
                continue
            if isinstance(v, dict) and isinstance(config.get(k), dict):
                config[k] = {**config[k], **v}
            else:
                config[k] = v
    global_setting.config = config
    # Flag SQLAlchemy that JSON mutated in place
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(global_setting, 'config')

    # Remove stale branch copies so they cannot shadow global again
    for row in Setting.query.filter(Setting.branch_id.isnot(None)).all():
        cfg = dict(row.config or {})
        changed = False
        for key in _GLOBAL_SHARED_KEYS:
            if key in cfg:
                cfg.pop(key, None)
                changed = True
        if changed:
            row.config = cfg
            flag_modified(row, 'config')

    db.session.commit()
    try:
        from app.services import event_bus
        event_bus.settings_updated(None)
    except Exception:
        pass
    return global_setting.config


def _migrate_branch_receipt_to_global_if_needed():
    """One-time style migration: if global has no receipt_settings, copy from any branch."""
    global_setting = Setting.query.filter_by(branch_id=None).first()
    gcfg = (global_setting.config or {}) if global_setting else {}
    if isinstance(gcfg.get('receipt_settings'), dict) and gcfg['receipt_settings']:
        return
    for row in Setting.query.filter(Setting.branch_id.isnot(None)).all():
        cfg = row.config or {}
        rs = cfg.get('receipt_settings')
        if isinstance(rs, dict) and rs:
            upsert_global_receipt_settings(rs, {
                k: cfg[k] for k in ('receipt_header', 'receipt_footer', 'receipt', 'receipt_template')
                if k in cfg
            })
            return


@settings_bp.route('/', methods=['GET'])
@token_required
def get_settings(current_user):
    # When global_only=1, return only global config (e.g. for hardware / printer VID-PID)
    if request.args.get('global_only') in ('1', 'true', 'yes'):
        _migrate_branch_receipt_to_global_if_needed()
        global_setting = Setting.query.filter_by(branch_id=None).first()
        global_config = global_setting.config if global_setting else {}
        return jsonify({"config": global_config or {}}), 200

    _migrate_branch_receipt_to_global_if_needed()
    branch_id = resolve_branch_id(current_user, request.args.get('branch_id'))

    global_setting = Setting.query.filter_by(branch_id=None).first()
    global_config = global_setting.config if global_setting else {}

    branch_config = {}
    if branch_id:
        branch_setting = Setting.query.filter_by(branch_id=branch_id).first()
        if branch_setting:
            branch_config = branch_setting.config or {}

    merged = _merge_configs(global_config, branch_config)
    return jsonify({"config": merged}), 200


@settings_bp.route('/', methods=['POST', 'PUT'])
@token_required
@owner_required
def update_settings(current_user):
    data = request.get_json()
    if not data or 'config' not in data:
        return jsonify({"message": "Missing config data"}), 400

    incoming = data['config']
    if not isinstance(incoming, dict):
        return jsonify({"message": "config must be an object"}), 400

    # If the client is updating receipt settings, always persist them globally
    # so Admin and POS stay in sync regardless of branch_id in the payload.
    if any(k in incoming for k in _GLOBAL_SHARED_KEYS):
        receipt_patch = incoming.get('receipt_settings') if isinstance(incoming.get('receipt_settings'), dict) else {}
        extras = {k: incoming[k] for k in _GLOBAL_SHARED_KEYS if k in incoming and k != 'receipt_settings'}
        # Also keep other top-level keys from a dedicated global write
        if 'branch_id' in data and data.get('branch_id') is None:
            # Full global update path — merge entire config onto global, then clear receipt overrides
            setting = _get_or_create_setting(None)
            merged = _deep_merge(setting.config or {}, incoming)
            setting.config = merged
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(setting, 'config')
            # Still strip branch receipt overrides
            for row in Setting.query.filter(Setting.branch_id.isnot(None)).all():
                cfg = dict(row.config or {})
                changed = False
                for key in _GLOBAL_SHARED_KEYS:
                    if key in cfg:
                        cfg.pop(key, None)
                        changed = True
                if changed:
                    row.config = cfg
                    flag_modified(row, 'config')
            db.session.commit()
            try:
                from app.services import event_bus
                event_bus.settings_updated(None)
            except Exception:
                pass
            return jsonify({"message": "Settings updated", "config": setting.config}), 200

        config = upsert_global_receipt_settings(receipt_patch, extras)
        return jsonify({"message": "Settings updated", "config": config}), 200

    # Explicit null = global settings; otherwise resolve to this POS branch UUID.
    if 'branch_id' in data and data.get('branch_id') is None:
        branch_id = None
    elif 'branch_id' in data:
        branch_id = resolve_branch_id(current_user, data.get('branch_id'))
    else:
        branch_id = resolve_branch_id(current_user)

    setting = Setting.query.filter_by(branch_id=branch_id).first()

    try:
        if not setting:
            setting = Setting(branch_id=branch_id, config=incoming)
            db.session.add(setting)
        else:
            # Merge so partial updates don't wipe unrelated keys
            setting.config = _deep_merge(setting.config or {}, incoming)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(setting, 'config')

        db.session.commit()
        try:
            from app.services import event_bus
            event_bus.settings_updated(branch_id)
        except Exception:
            pass
        return jsonify({"message": "Settings updated", "config": setting.config}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Error updating settings", "error": str(e)}), 500
