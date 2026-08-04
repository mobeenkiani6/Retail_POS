import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type SettingsState = {
  activeTab: string;
  taxEnabled: boolean;
  taxPercentage: number;
  taxRatesByPaymentMethod: Record<string, number>;
  hardware: {
    printer_vendor_id: string;
    printer_product_id: string;
    paper_width: string;
  };

  setActiveTab: (v: string) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxPercentage: (v: number) => void;
  setTaxRatesByPaymentMethod: (
    v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>),
  ) => void;
  setHardware: (
    v:
      | SettingsState['hardware']
      | ((prev: SettingsState['hardware']) => SettingsState['hardware']),
  ) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      activeTab: 'general',
      taxEnabled: true,
      taxPercentage: 0,
      taxRatesByPaymentMethod: { Cash: 0, Card: 8 },
      hardware: {
        printer_vendor_id: '',
        printer_product_id: '',
        paper_width: '80mm',
      },

      setActiveTab: (activeTab) => set({ activeTab }),
      setTaxEnabled: (taxEnabled) => set({ taxEnabled }),
      setTaxPercentage: (taxPercentage) => set({ taxPercentage }),
      setTaxRatesByPaymentMethod: (taxRatesByPaymentMethod) =>
        set({
          taxRatesByPaymentMethod:
            typeof taxRatesByPaymentMethod === 'function'
              ? taxRatesByPaymentMethod(get().taxRatesByPaymentMethod)
              : taxRatesByPaymentMethod,
        }),
      setHardware: (hardware) =>
        set({
          hardware: typeof hardware === 'function' ? hardware(get().hardware) : hardware,
        }),
    }),
    {
      name: 'nycto-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        activeTab: s.activeTab,
        taxEnabled: s.taxEnabled,
        taxPercentage: s.taxPercentage,
        taxRatesByPaymentMethod: s.taxRatesByPaymentMethod,
        hardware: s.hardware,
      }),
    },
  ),
);
