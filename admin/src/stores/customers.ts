import { create } from 'zustand';
import { get as apiGet, post } from '../api/client';
import { errMsg } from './helpers';

export type Customer = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  loyalty_points?: number;
};

type CustomersState = {
  customers: Customer[];
  segments: { key: string; name: string; count: number }[];
  profile: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadProfile: (id: string) => Promise<void>;
  addNote: (id: string, body: string) => Promise<void>;
};

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: [],
  segments: [],
  profile: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [list, seg] = await Promise.all([
        apiGet<{ customers?: Customer[] } | Customer[]>('/v1/customers/'),
        apiGet<{ segments: { key: string; name: string; count: number }[] }>('/v1/admin/customers/segments').catch(
          () => ({ segments: [] }),
        ),
      ]);
      set({
        customers: Array.isArray(list) ? list : list.customers || [],
        segments: seg.segments || [],
        loading: false,
      });
    } catch (e) {
      set({ customers: [], loading: false, error: errMsg(e) });
    }
  },

  loadProfile: async (id) => {
    set({ profile: null, error: null });
    try {
      const profile = await apiGet<Record<string, unknown>>(`/v1/admin/customers/${id}/profile`);
      set({ profile });
    } catch (e) {
      set({ profile: null, error: errMsg(e) });
    }
  },

  addNote: async (id, body) => {
    await post(`/v1/admin/customers/${id}/notes`, { body });
    await get().loadProfile(id);
  },
}));
