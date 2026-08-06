import { create } from 'zustand';
import { get as apiGet, put, post } from '../api/client';
import { errMsg } from './helpers';

type SecurityState = {
  history: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  matrix: Record<string, unknown> | null;
  policy: Record<string, unknown>;
  minLength: number | '';
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setPolicyField: (key: string, value: unknown) => void;
  setMinLength: (v: number | '') => void;
  savePolicy: () => Promise<void>;
  revokeSession: (id: number) => Promise<void>;
};

export const useSecurityStore = create<SecurityState>((set, get) => ({
  history: [],
  sessions: [],
  matrix: null,
  policy: {},
  minLength: 8,
  loading: false,
  error: null,

  setPolicyField: (key, value) => set({ policy: { ...get().policy, [key]: value } }),
  setMinLength: (minLength) => set({ minLength }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [history, sessions, matrix, policy] = await Promise.all([
        apiGet<Record<string, unknown>[]>('/v1/admin/security/login-history').catch(() => []),
        apiGet<Record<string, unknown>[]>('/v1/admin/security/sessions').catch(() => []),
        apiGet<Record<string, unknown>>('/v1/admin/security/permissions').catch(() => null),
        apiGet<Record<string, unknown>>('/v1/admin/security/password-policy').catch(() => ({})),
      ]);
      set({
        history: history as Record<string, unknown>[],
        sessions: sessions as Record<string, unknown>[],
        matrix,
        policy: policy || {},
        minLength: Number((policy as Record<string, unknown>)?.min_length || 8),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  savePolicy: async () => {
    const { policy, minLength } = get();
    await put('/v1/admin/security/password-policy', { ...policy, min_length: Number(minLength) || 8 });
    await get().load();
  },

  revokeSession: async (id) => {
    await post(`/v1/admin/security/sessions/${id}/revoke`);
    await get().load();
  },
}));
