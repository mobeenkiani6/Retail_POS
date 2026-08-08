import { create } from 'zustand';
import { get as apiGet, post, put, del } from '../api/client';
import { errMsg, notifyAction } from './helpers';

export type Supplier = {
  id: number;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  outstanding_balance?: number;
  status?: string;
  city?: string;
};

export type SupplierInput = {
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  address?: string;
  status?: string;
};

type SuppliersState = {
  suppliers: Supplier[];
  detail: Record<string, unknown> | null;
  ledger: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  message: string;
  load: () => Promise<void>;
  loadDetail: (id: string) => Promise<void>;
  create: (data: SupplierInput) => Promise<void>;
  update: (id: number, data: SupplierInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearMessage: () => void;
};

export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: [],
  detail: null,
  ledger: [],
  loading: false,
  error: null,
  message: '',

  clearMessage: () => set({ message: '', error: null }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const r = await apiGet<{ suppliers?: Supplier[] } | Supplier[]>('/v1/suppliers/');
      set({
        suppliers: Array.isArray(r) ? r : r.suppliers || [],
        loading: false,
      });
    } catch (e) {
      set({ suppliers: [], loading: false, error: errMsg(e) });
    }
  },

  loadDetail: async (id) => {
    set({ detail: null, ledger: [], error: null });
    try {
      const [detail, ledgerRes] = await Promise.all([
        apiGet<Record<string, unknown>>(`/v1/suppliers/${id}`),
        apiGet<{ entries?: Record<string, unknown>[] }>(`/v1/suppliers/${id}/ledger`).catch(() => ({ entries: [] })),
      ]);
      set({
        detail,
        ledger: ledgerRes.entries || (Array.isArray(ledgerRes) ? (ledgerRes as unknown as Record<string, unknown>[]) : []),
      });
    } catch (e) {
      set({ detail: null, error: errMsg(e) });
    }
  },

  create: async (data) => {
    await notifyAction(async () => {
      await post('/v1/suppliers/', data as Record<string, unknown>);
      set({ message: 'Supplier created' });
      await get().load();
    }, 'Supplier created', 'Could not create supplier');
  },

  update: async (id, data) => {
    await notifyAction(async () => {
      await put(`/v1/suppliers/${id}`, data as Record<string, unknown>);
      set({ message: 'Supplier updated' });
      await get().load();
    }, 'Supplier updated', 'Could not update supplier');
  },

  remove: async (id) => {
    await notifyAction(async () => {
      await del(`/v1/suppliers/${id}`);
      set({ message: 'Supplier deleted' });
      await get().load();
    }, 'Supplier deleted', 'Could not delete supplier');
  },
}));
