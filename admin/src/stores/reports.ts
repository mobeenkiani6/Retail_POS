import { create } from 'zustand';
import { get as apiGet, getToken, API_BASE } from '../api/client';
import { useBranchFilter } from './branch';
import { errMsg } from './helpers';
import { showToast } from '../components/Toast';

export type ReportPreview = {
  type: string;
  period: string;
  headers: string[];
  rows: unknown[][];
  total_rows: number;
  preview_rows: number;
  start?: string;
  end?: string;
  payment_method?: string;
};

export type ReportSummary = {
  revenue?: number;
  cost_of_goods_sold?: number;
  cogs?: number;
  gross_profit?: number;
  expenses?: number;
  net_profit?: number;
  orders?: number;
  refunded_amount?: number;
};

type ReportsState = {
  type: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  paymentMethod: string;
  format: string;
  summary: ReportSummary | null;
  preview: ReportPreview | null;
  loadingPreview: boolean;
  exporting: boolean;
  error: string | null;
  setType: (t: string) => void;
  setPeriod: (p: string) => void;
  setDateFrom: (d: string) => void;
  setDateTo: (d: string) => void;
  setPaymentMethod: (p: string) => void;
  setFormat: (f: string) => void;
  loadSummary: () => Promise<void>;
  loadPreview: () => Promise<void>;
  exportReport: () => Promise<void>;
};

function branchQs() {
  const q = useBranchFilter.getState().queryParam();
  return q ? `&${q}` : '';
}

function filterQs() {
  const { period, dateFrom, dateTo, paymentMethod, type } = useReportsStore.getState();
  let qs = '';
  if (period === 'custom' && dateFrom && dateTo) {
    qs += `&start=${encodeURIComponent(dateFrom)}&end=${encodeURIComponent(dateTo)}`;
  }
  if ((type === 'sales' || type === 'expenses') && paymentMethod && paymentMethod !== 'all') {
    qs += `&payment_method=${encodeURIComponent(paymentMethod)}`;
  }
  return qs;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  type: 'sales',
  period: 'month',
  dateFrom: monthStartISO(),
  dateTo: todayISO(),
  paymentMethod: 'all',
  format: 'csv',
  summary: null,
  preview: null,
  loadingPreview: false,
  exporting: false,
  error: null,

  setType: (type) => set({ type }),
  setPeriod: (period) => {
    if (period === 'custom') {
      const { dateFrom, dateTo } = get();
      set({
        period,
        dateFrom: dateFrom || monthStartISO(),
        dateTo: dateTo || todayISO(),
      });
    } else {
      set({ period });
    }
  },
  setDateFrom: (dateFrom) => set({ dateFrom, period: 'custom' }),
  setDateTo: (dateTo) => set({ dateTo, period: 'custom' }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setFormat: (format) => set({ format }),

  loadSummary: async () => {
    const { period, dateFrom, dateTo } = get();
    if (period === 'custom' && (!dateFrom || !dateTo)) {
      set({ summary: null });
      return;
    }
    try {
      const summary = await apiGet<ReportSummary>(
        `/v1/admin/reports/summary?period=${period}${filterQs()}${branchQs()}`,
      );
      set({ summary });
    } catch {
      set({ summary: null });
    }
  },

  loadPreview: async () => {
    const { type, period, dateFrom, dateTo } = get();
    if (period === 'custom' && (!dateFrom || !dateTo)) {
      set({ preview: null, loadingPreview: false, error: 'Choose a start and end date' });
      return;
    }
    set({ loadingPreview: true, error: null });
    try {
      const preview = await apiGet<ReportPreview>(
        `/v1/admin/reports/preview?type=${type}&period=${period}&limit=80${filterQs()}${branchQs()}`,
      );
      set({ preview, loadingPreview: false });
    } catch (e) {
      set({ preview: null, loadingPreview: false, error: errMsg(e) });
    }
  },

  exportReport: async () => {
    const { type, period, format, dateFrom, dateTo } = get();
    if (period === 'custom' && (!dateFrom || !dateTo)) {
      set({ error: 'Choose a start and end date' });
      return;
    }
    set({ exporting: true, error: null });
    try {
      const url = `${API_BASE}/v1/admin/reports/export?type=${type}&period=${period}&format=${format}${filterQs()}${branchQs()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        let msg = 'Export failed';
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      const range =
        period === 'custom' && dateFrom && dateTo ? `${dateFrom}_${dateTo}` : period;
      a.download = `${type}_${range}.${format === 'xlsx' ? 'xlsx' : format}`;
      a.click();
      URL.revokeObjectURL(obj);
      set({ exporting: false });
      showToast(`Exported ${type} report (${format.toUpperCase()})`, 'success');
    } catch (e) {
      const msg = errMsg(e);
      set({ exporting: false, error: msg });
      showToast(msg, 'error');
    }
  },
}));
