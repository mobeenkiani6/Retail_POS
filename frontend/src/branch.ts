/**
 * Single-branch scope for this POS instance.
 * Branch IDs are 32-char hex strings shared with the admin panel via VITE_BRANCH_ID / BRANCH_ID.
 */

const HEX_RE = /^[0-9a-f]{32}$/i;
const DASHED_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalize to canonical 32-char lowercase hex, or null if invalid. */
export function normalizeBranchId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let s = value.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('0x')) s = s.slice(2);
  if (HEX_RE.test(s)) return s;
  if (DASHED_UUID_RE.test(s)) return s.replace(/-/g, '');
  return null;
}

export function isBranchId(value: unknown): value is string {
  return normalizeBranchId(value) !== null;
}

/** @deprecated use isBranchId */
export function isBranchUuid(value: unknown): value is string {
  return isBranchId(value);
}

/** Admin-provisioned hex id baked into the frontend build (optional). */
export function getConfiguredBranchId(): string | null {
  const raw = (import.meta.env.VITE_BRANCH_ID as string | undefined)?.trim();
  if (!raw) return null;
  return normalizeBranchId(raw);
}

/**
 * Effective branch hex id for API calls.
 * Priority: VITE_BRANCH_ID → localStorage → logged-in user.branch_id
 */
export function getBranchId(): string {
  const configured = getConfiguredBranchId();
  if (configured) {
    localStorage.setItem('active_branch_id', configured);
    return configured;
  }

  const stored = normalizeBranchId(localStorage.getItem('active_branch_id'));
  if (stored) {
    localStorage.setItem('active_branch_id', stored);
    return stored;
  }

  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr) as { branch_id?: string | null };
      const fromUser = normalizeBranchId(user.branch_id);
      if (fromUser) {
        localStorage.setItem('active_branch_id', fromUser);
        return fromUser;
      }
    }
  } catch {
    /* ignore */
  }

  return '';
}

/** Persist branch after login/setup and keep in sync with VITE_BRANCH_ID. */
export function setActiveBranchId(branchId: string | null | undefined): void {
  const normalized = normalizeBranchId(branchId);
  if (normalized) {
    localStorage.setItem('active_branch_id', normalized);
  }
}

export function branchQuery(param = 'branch_id'): string {
  const id = getBranchId();
  return id ? `?${param}=${encodeURIComponent(id)}` : '';
}
