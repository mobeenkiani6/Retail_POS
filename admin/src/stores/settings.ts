import { create } from 'zustand';
import { get as apiGet, put } from '../api/client';
import { errMsg } from './helpers';
import { showToast } from '../components/Toast';

export type Discount = {
  id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  archived?: boolean;
};

export type ReceiptSettings = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  logoUrl: string;
  logoHeight: number;
  showLogo: boolean;
  footerMessage: string;
  footerLine1: string;
  footerLine2: string;
  headerText: string;
  gstNumber: string;
  ntnNumber: string;
};

const defaultReceipt = (): ReceiptSettings => ({
  businessName: 'My Business',
  businessAddress: '',
  businessPhone: '',
  logoUrl: '',
  logoHeight: 140,
  showLogo: true,
  footerMessage: 'Thank you for shopping!',
  footerLine1: '',
  footerLine2: '',
  headerText: '',
  gstNumber: '',
  ntnNumber: '',
});

type SettingsState = {
  config: Record<string, unknown>;
  businessName: string;
  currency: string;
  locale: string;
  phone: string;
  address: string;
  taxEnabled: boolean;
  taxPercentage: number | '';
  cashTax: number | '';
  cardTax: number | '';
  discounts: Discount[];
  receipt: ReceiptSettings;
  saving: boolean;
  message: string;
  error: string | null;
  load: () => Promise<void>;
  saveConfig: (next: Record<string, unknown>) => Promise<void>;
  setField: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  setReceipt: (partial: Partial<ReceiptSettings>) => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: {},
  businessName: '',
  currency: 'PKR',
  locale: 'en-PK',
  phone: '',
  address: '',
  taxEnabled: true,
  taxPercentage: 0,
  cashTax: 0,
  cardTax: 0,
  discounts: [],
  receipt: defaultReceipt(),
  saving: false,
  message: '',
  error: null,

  setField: (key, value) => set({ [key]: value } as Partial<SettingsState>),
  setReceipt: (partial) => set({ receipt: { ...get().receipt, ...partial } }),

  load: async () => {
    set({ error: null });
    try {
      const r = await apiGet<{ config: Record<string, unknown> }>('/v1/admin/settings/business');
      const c = r.config || {};
      const rates = (c.tax_rates_by_payment_method || {}) as Record<string, number>;
      const rs = (c.receipt_settings || {}) as Record<string, unknown>;
      const legacy = (c.receipt || c.receipt_template || {}) as Record<string, unknown>;
      set({
        config: c,
        businessName: String(c.business_name || c.store_name || ''),
        currency: String(c.currency || 'PKR'),
        locale: String(c.locale || 'en-PK'),
        phone: String(c.phone || c.business_phone || ''),
        address: String(c.address || c.business_address || ''),
        taxEnabled: c.tax_enabled !== false,
        taxPercentage: Number(c.tax_percentage ?? 0),
        cashTax: Number(rates.Cash ?? rates.cash ?? c.tax_percentage ?? 0),
        cardTax: Number(rates.Card ?? rates.card ?? c.tax_percentage ?? 0),
        discounts: Array.isArray(c.discounts) ? (c.discounts as Discount[]) : [],
        receipt: {
          businessName: String(rs.businessName || c.business_name || c.store_name || 'My Business'),
          businessAddress: String(rs.businessAddress || c.address || c.business_address || ''),
          businessPhone: String(rs.businessPhone || c.phone || c.business_phone || ''),
          logoUrl: String(rs.logoUrl || ''),
          logoHeight: (() => {
            const h = Number(rs.logoHeight ?? 140);
            return h >= 80 && h <= 250 ? h : 140;
          })(),
          showLogo: legacy.show_logo !== false,
          footerMessage: String(rs.footerMessage || legacy.footer || c.receipt_footer || 'Thank you for shopping!'),
          footerLine1: String(rs.footerLine1 || ''),
          footerLine2: String(rs.footerLine2 || ''),
          headerText: String(rs.headerText || legacy.header || c.receipt_header || ''),
          gstNumber: String(rs.gstNumber || ''),
          ntnNumber: String(rs.ntnNumber || ''),
        },
      });
    } catch (e) {
      set({ error: errMsg(e) });
    }
  },

  saveConfig: async (next) => {
    set({ saving: true, message: '', error: null });
    try {
      await put('/v1/admin/settings/business', { config: next, branch_id: null });
      set({ config: next, saving: false, message: 'Saved' });
      showToast('Settings saved', 'success');
    } catch (e) {
      const msg = errMsg(e, 'Save failed');
      set({ saving: false, message: '', error: msg });
      showToast(msg, 'error');
    }
  },
}));
