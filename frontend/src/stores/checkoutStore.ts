import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CheckoutCustomer = {
  id: number;
  name: string;
  phone?: string;
  loyalty_points?: number;
};

export type CartItem = {
  uniqueId: string;
  product_id: number;
  sku_id?: number;
  variant?: string;
  title: string;
  price: number;
  original_price: number;
  cost_price: number;
  quantity: number;
  voided?: boolean;
};

export type CheckoutDiscount = {
  type: 'percent' | 'fixed';
  value: number;
  name: string;
};

export type PaymentMethod = 'Cash' | 'Card';

export type HeldCart = {
  id: number;
  cart: CartItem[];
  savedAt: string;
  customer?: string;
};

type CheckoutState = {
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  returnMode: boolean;
  selectedCustomer: CheckoutCustomer | null;
  discount: CheckoutDiscount | null;
  loyaltyPointsToRedeem: number;
  couponCode: string;
  saleNotes: string;
  cashReceived: string;
  activeCategory: number | 'all';
  searchQuery: string;
  activeHeldId: number | null;
  heldCarts: HeldCart[];

  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setReturnMode: (v: boolean) => void;
  setSelectedCustomer: (c: CheckoutCustomer | null) => void;
  setDiscount: (d: CheckoutDiscount | null) => void;
  setLoyaltyPointsToRedeem: (v: number) => void;
  setCouponCode: (v: string) => void;
  setSaleNotes: (v: string) => void;
  setCashReceived: (v: string) => void;
  setActiveCategory: (v: number | 'all') => void;
  setSearchQuery: (v: string) => void;
  setActiveHeldId: (v: number | null) => void;
  setHeldCarts: (v: HeldCart[]) => void;
  clearSale: () => void;
};

const initialSale = {
  cart: [] as CartItem[],
  paymentMethod: 'Card' as PaymentMethod,
  returnMode: false,
  selectedCustomer: null as CheckoutCustomer | null,
  discount: null as CheckoutDiscount | null,
  loyaltyPointsToRedeem: 0,
  couponCode: '',
  saleNotes: '',
  cashReceived: '',
  activeHeldId: null as number | null,
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      ...initialSale,
      activeCategory: 'all',
      searchQuery: '',
      heldCarts: [],

      setCart: (cart) =>
        set({ cart: typeof cart === 'function' ? cart(get().cart) : cart }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setReturnMode: (returnMode) => set({ returnMode }),
      setSelectedCustomer: (selectedCustomer) => set({ selectedCustomer, loyaltyPointsToRedeem: 0 }),
      setDiscount: (discount) => set({ discount }),
      setLoyaltyPointsToRedeem: (loyaltyPointsToRedeem) =>
        set({ loyaltyPointsToRedeem: Math.max(0, Math.floor(loyaltyPointsToRedeem) || 0) }),
      setCouponCode: (couponCode) => set({ couponCode }),
      setSaleNotes: (saleNotes) => set({ saleNotes }),
      setCashReceived: (cashReceived) => set({ cashReceived }),
      setActiveCategory: (activeCategory) => set({ activeCategory }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setActiveHeldId: (activeHeldId) => set({ activeHeldId }),
      setHeldCarts: (heldCarts) => set({ heldCarts }),
      clearSale: () => set({ ...initialSale }),
    }),
    {
      name: 'nycto-checkout',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        cart: s.cart,
        paymentMethod: s.paymentMethod,
        returnMode: s.returnMode,
        selectedCustomer: s.selectedCustomer,
        discount: s.discount,
        loyaltyPointsToRedeem: s.loyaltyPointsToRedeem,
        couponCode: s.couponCode,
        saleNotes: s.saleNotes,
        cashReceived: s.cashReceived,
        activeCategory: s.activeCategory,
        searchQuery: s.searchQuery,
        activeHeldId: s.activeHeldId,
        heldCarts: s.heldCarts,
      }),
    },
  ),
);
