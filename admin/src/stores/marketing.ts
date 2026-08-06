import { create } from 'zustand';
import { get as apiGet, post, put, del } from '../api/client';
import { errMsg } from './helpers';

export type Coupon = {
  id: number;
  code: string;
  name?: string;
  discount_type?: string;
  discount_value?: number;
  active?: boolean;
};

export type GiftCard = { id: number; code: string; balance: number; active?: boolean };

export type Promo = {
  id: number;
  name: string;
  promo_type?: string;
  active?: boolean;
  config?: Record<string, unknown>;
};

type MarketingState = {
  coupons: Coupon[];
  giftCards: GiftCard[];
  promos: Promo[];
  loading: boolean;
  error: string | null;
  message: string;
  load: () => Promise<void>;
  createCoupon: (data: Record<string, unknown>) => Promise<void>;
  updateCoupon: (id: number, data: Record<string, unknown>) => Promise<void>;
  deleteCoupon: (id: number) => Promise<void>;
  createGiftCard: (data: Record<string, unknown>) => Promise<void>;
  updateGiftCard: (id: number, data: Record<string, unknown>) => Promise<void>;
  deleteGiftCard: (id: number) => Promise<void>;
  createPromo: (data: Record<string, unknown>) => Promise<void>;
  updatePromo: (id: number, data: Record<string, unknown>) => Promise<void>;
  deletePromo: (id: number) => Promise<void>;
};

export const useMarketingStore = create<MarketingState>((set, get) => ({
  coupons: [],
  giftCards: [],
  promos: [],
  loading: false,
  error: null,
  message: '',

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [coupons, giftCards, promos] = await Promise.all([
        apiGet<Coupon[]>('/v1/admin/marketing/coupons').catch(() => []),
        apiGet<GiftCard[]>('/v1/admin/marketing/gift-cards').catch(() => []),
        apiGet<Promo[]>('/v1/admin/marketing/promotions').catch(() => []),
      ]);
      set({ coupons, giftCards, promos, loading: false });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  createCoupon: async (data) => {
    await post('/v1/admin/marketing/coupons', data);
    set({ message: 'Coupon created' });
    await get().load();
  },
  updateCoupon: async (id, data) => {
    await put(`/v1/admin/marketing/coupons/${id}`, data);
    await get().load();
  },
  deleteCoupon: async (id) => {
    await del(`/v1/admin/marketing/coupons/${id}`);
    await get().load();
  },

  createGiftCard: async (data) => {
    await post('/v1/admin/marketing/gift-cards', data);
    set({ message: 'Gift card issued' });
    await get().load();
  },
  updateGiftCard: async (id, data) => {
    await put(`/v1/admin/marketing/gift-cards/${id}`, data);
    await get().load();
  },
  deleteGiftCard: async (id) => {
    await del(`/v1/admin/marketing/gift-cards/${id}`);
    await get().load();
  },

  createPromo: async (data) => {
    await post('/v1/admin/marketing/promotions', data);
    set({ message: 'Promotion created' });
    await get().load();
  },
  updatePromo: async (id, data) => {
    await put(`/v1/admin/marketing/promotions/${id}`, data);
    await get().load();
  },
  deletePromo: async (id) => {
    await del(`/v1/admin/marketing/promotions/${id}`);
    await get().load();
  },
}));
