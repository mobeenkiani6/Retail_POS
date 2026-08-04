"""Single-branch scope helpers.

This POS instance is locked to one branch. The branch id is a 32-character
hex string (UUID without dashes), shared with the admin panel via BRANCH_ID.
"""
from __future__ import annotations

import os
import re
import uuid
from typing import Any, Optional

# Canonical form: 32 lowercase hex digits (no dashes)
_HEX_RE = re.compile(r'^[0-9a-f]{32}$')
# Legacy dashed UUID — accepted and normalized to hex
_DASHED_UUID_RE = re.compile(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)


def normalize_branch_id(value: Any) -> Optional[str]:
    """Return canonical 32-char lowercase hex branch id, or None if invalid."""
    if value is None:
        return None
    s = str(value).strip().lower()
    if not s:
        return None
    if _HEX_RE.match(s):
        return s
    if _DASHED_UUID_RE.match(s):
        return s.replace('-', '')
    # Allow hex with optional 0x prefix
    if s.startswith('0x') and _HEX_RE.match(s[2:]):
        return s[2:]
    return None


def is_valid_branch_id(value: Any) -> bool:
    return normalize_branch_id(value) is not None


# Back-compat alias used by older imports
def is_valid_branch_uuid(value: Any) -> bool:
    return is_valid_branch_id(value)


def new_branch_id() -> str:
    """New branch identity as a hex string (e.g. for admin panel linking)."""
    return uuid.uuid4().hex


def get_configured_branch_id() -> Optional[str]:
    """BRANCH_ID from env — the admin-panel identity for this POS install."""
    raw = (os.environ.get('BRANCH_ID') or '').strip()
    if not raw:
        return None
    normalized = normalize_branch_id(raw)
    if not normalized:
        raise ValueError(
            f'BRANCH_ID must be a 32-character hex id (or dashed UUID), got: {raw!r}'
        )
    return normalized


def coerce_branch_id(value: Any) -> Optional[str]:
    """Normalize a request/user branch id to hex, or None."""
    return normalize_branch_id(value)


def resolve_branch_id(current_user=None, requested: Any = None) -> Optional[str]:
    """Resolve the effective branch for an API call.

    Priority:
      1. Configured BRANCH_ID (instance is single-branch locked)
      2. Explicit requested id (only when it matches configured, or no lock)
      3. current_user.branch_id
    """
    configured = None
    try:
        configured = get_configured_branch_id()
    except ValueError:
        configured = None

    if configured:
        return configured

    req = coerce_branch_id(requested)
    if req:
        return req

    if current_user is not None:
        return coerce_branch_id(getattr(current_user, 'branch_id', None))

    return None


def require_branch_id(current_user=None, requested: Any = None) -> str:
    """Like resolve_branch_id but raises ValueError if none available."""
    bid = resolve_branch_id(current_user, requested)
    if not bid:
        raise ValueError(
            'No branch scope configured. Set BRANCH_ID or assign the user to a branch.'
        )
    return bid
