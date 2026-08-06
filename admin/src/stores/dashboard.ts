import { create } from 'zustand';
import { get as apiGet } from '../api/client';
import { useBranchFilter } from './branch';
import { errMsg } from './helpers';

export type DashboardOverview = {
  revenue: Record<string, { revenue: number; profit: number; orders: number }>;
  orders: Record<string, number>;
  inventory: Record<string, number>;
  customers: Record<string, number>;
  products: {
    top_selling: { id: number; name: string; qty: number; revenue: number }[];
    least_selling: { id: number; name: string; qty: number; revenue: number }[];
  };
  employees: {
    best_cashier: { username: string; sales_total: number } | null;
    leaderboard: { username: string; sales_total: number; sales_count: number }[];
    active: number;
  };
};

export type BiOverview = {
  sales_trend: { date: string; revenue: number; orders: number; profit?: number }[];
  peak_hours: { hour: number; orders: number }[];
  insights: { type?: string; severity: string; title: string; message: string }[];
  kpis: { aov: number; avg_basket_size: number; repeat_purchase_rate: number; revenue?: number };
  payment_methods?: { method: string; amount: number }[];
  branch_performance?: { name: string; revenue: number; orders: number }[];
};

type DashboardState = {
  overview: DashboardOverview | null;
  bi: BiOverview | null;
  biDays: number;
  affinity: { pairs: { product_a: { name: string }; product_b: { name: string }; count: number }[] } | null;
  loading: boolean;
  error: string | null;
  loadOverview: () => Promise<void>;
  loadBi: (days?: number) => Promise<void>;
  loadAffinity: () => Promise<void>;
  loadAll: () => Promise<void>;
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  overview: null,
  bi: null,
  biDays: 14,
  affinity: null,
  loading: false,
  error: null,

  loadOverview: async () => {
    const q = useBranchFilter.getState().queryParam();
    const qs = q ? `?${q}` : '';
    try {
      const overview = await apiGet<DashboardOverview>(`/v1/admin/dashboard/overview${qs}`);
      set({ overview, error: null });
    } catch (e) {
      set({ error: errMsg(e) });
    }
  },

  loadBi: async (days = get().biDays) => {
    const q = useBranchFilter.getState().queryParam();
    try {
      const bi = await apiGet<BiOverview>(`/v1/admin/bi/overview?days=${days}${q ? `&${q}` : ''}`);
      set({ bi, biDays: days, error: null });
    } catch (e) {
      set({ error: errMsg(e) });
    }
  },

  loadAffinity: async () => {
    try {
      const affinity = await apiGet<DashboardState['affinity']>('/v1/admin/bi/product-affinity?days=90');
      set({ affinity });
    } catch {
      set({ affinity: null });
    }
  },

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      await Promise.all([get().loadOverview(), get().loadBi()]);
    } finally {
      set({ loading: false });
    }
  },
}));
