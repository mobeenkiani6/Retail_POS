import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type InventoryTab = 'stock' | 'history' | 'alerts';

type InventoryState = {
  tab: InventoryTab;
  search: string;
  stockModalSkuId: number | null;
  stockModalProductId: number | null;

  setTab: (v: InventoryTab) => void;
  setSearch: (v: string) => void;
  setStockModal: (skuId: number | null, productId?: number | null) => void;
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      tab: 'stock',
      search: '',
      stockModalSkuId: null,
      stockModalProductId: null,

      setTab: (tab) => set({ tab }),
      setSearch: (search) => set({ search }),
      setStockModal: (stockModalSkuId, stockModalProductId = null) =>
        set({ stockModalSkuId, stockModalProductId }),
    }),
    {
      name: 'nycto-inventory',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        tab: s.tab,
        search: s.search,
        stockModalSkuId: s.stockModalSkuId,
        stockModalProductId: s.stockModalProductId,
      }),
    },
  ),
);
