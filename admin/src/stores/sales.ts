import { create } from 'zustand';
import { get as apiGet } from '../api/client';
import { useBranchFilter } from './branch';
import { errMsg } from './helpers';

export type Sale = {
  id: number;
  invoice_number?: string;
  receipt_number?: string;
  total_amount?: number;
  status?: string;
  payment_method?: string;
  created_at?: string;
};

export type SalePeriod = 'today' | 'week' | 'month' | 'custom';

type SalesState = {
  sales: Sale[];
  detail: Record<string, unknown> | null;
  period: SalePeriod;
  startDate: string;
  endDate: string;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  setPeriod: (p: SalePeriod) => void;
  setCustomRange: (start: string, end: string) => void;
  load: () => Promise<void>;
  loadDetail: (id: string) => Promise<void>;
  clearDetail: () => void;
};

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  detail: null,
  period: 'today',
  startDate: '',
  endDate: '',
  loading: false,
  detailLoading: false,
  error: null,

  setPeriod: (period) => set({ period }),
  setCustomRange: (startDate, endDate) => set({ startDate, endDate }),
  clearDetail: () => set({ detail: null, error: null }),

  load: async () => {
    set({ loading: true, error: null });
    const { period, startDate, endDate } = get();
    const { selectedBranchId, queryParam } = useBranchFilter.getState();
    const params = new URLSearchParams();
    params.set('time_filter', period);
    if (period === 'custom' && startDate && endDate) {
      params.set('start_date', startDate);
      params.set('end_date', endDate);
    }
    if (selectedBranchId) params.set('branch_id', selectedBranchId);
    else {
      const qp = queryParam();
      if (qp.startsWith('branch_id=')) params.set('branch_id', qp.slice('branch_id='.length));
    }

    try {
      const r = await apiGet<{ sales?: Sale[] } | Sale[]>(`/sales/?${params.toString()}`);
      const sales = Array.isArray(r) ? r : r.sales || (r as { items?: Sale[] }).items || [];
      set({ sales, loading: false });
    } catch (e) {
      set({ sales: [], loading: false, error: errMsg(e) });
    }
  },

  loadDetail: async (id) => {
    set({ detailLoading: true, detail: null, error: null });
    try {
      const detail = await apiGet<Record<string, unknown>>(`/sales/${id}`);
      set({ detail, detailLoading: false });
    } catch (e) {
      set({ detail: null, detailLoading: false, error: errMsg(e) });
    }
  },
}));
