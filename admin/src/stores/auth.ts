import { create } from 'zustand';

export type AdminUser = {
  id: number;
  username: string;
  role: string;
  branch_id?: string;
  branch_name?: string;
};

type AuthState = {
  token: string | null;
  user: AdminUser | null;
  hydrated: boolean;
  hydrate: () => void;
  logout: () => void;
  canAccessAdmin: () => boolean;
};

export const ADMIN_ROLES = new Set(['owner', 'admin', 'manager']);

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: () => {
    const token = localStorage.getItem('admin_auth_token');
    const raw = localStorage.getItem('admin_user');
    let user: AdminUser | null = null;
    try {
      user = raw ? JSON.parse(raw) : null;
    } catch {
      user = null;
    }
    set({ token, user, hydrated: true });
  },
  logout: () => {
    localStorage.removeItem('admin_auth_token');
    localStorage.removeItem('admin_user');
    set({ token: null, user: null });
  },
  canAccessAdmin: () => {
    const u = get().user;
    return !!u && ADMIN_ROLES.has(u.role);
  },
}));

export async function loginAdmin(username: string, password: string) {
  const { request } = await import('../api/client');
  const res = await request<{ token: string; user: AdminUser }>('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipAuth: true,
  });
  if (!ADMIN_ROLES.has(res.user.role)) {
    throw new Error('This account does not have Admin Panel access.');
  }
  localStorage.setItem('admin_auth_token', res.token);
  localStorage.setItem('admin_user', JSON.stringify(res.user));
  useAuth.setState({ token: res.token, user: res.user, hydrated: true });
  return res.user;
}
