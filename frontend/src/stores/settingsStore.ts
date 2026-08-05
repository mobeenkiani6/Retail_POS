import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PrinterConnectionType = 'lan' | 'usb';

export type PrinterEndpointConfig = {
  connection_type: PrinterConnectionType;
  host: string;
  port: string;
  printer_vendor_id: string;
  printer_product_id: string;
};

export type HardwareConfig = {
  paper_width: string;
  receipt_printer: PrinterEndpointConfig;
  kot_printer: PrinterEndpointConfig;
  /** @deprecated kept in sync with receipt_printer for older clients */
  printer_vendor_id: string;
  /** @deprecated kept in sync with receipt_printer for older clients */
  printer_product_id: string;
};

export const defaultPrinterEndpoint = (
  overrides: Partial<PrinterEndpointConfig> = {},
): PrinterEndpointConfig => ({
  connection_type: 'lan',
  host: '',
  port: '9100',
  printer_vendor_id: '',
  printer_product_id: '',
  ...overrides,
});

export const defaultHardware = (): HardwareConfig => ({
  paper_width: '80mm',
  receipt_printer: defaultPrinterEndpoint(),
  kot_printer: defaultPrinterEndpoint(),
  printer_vendor_id: '',
  printer_product_id: '',
});

/** Normalize API / legacy flat hardware into the nested shape. */
export function normalizeHardware(raw?: Record<string, unknown> | null): HardwareConfig {
  const base = defaultHardware();
  if (!raw || typeof raw !== 'object') return base;

  const asEndpoint = (value: unknown, legacyVid = '', legacyPid = ''): PrinterEndpointConfig => {
    const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const conn = String(obj.connection_type || raw.connection_type || (legacyVid || legacyPid ? 'usb' : 'lan')).toLowerCase();
    return defaultPrinterEndpoint({
      connection_type: conn === 'usb' ? 'usb' : 'lan',
      host: String(obj.host ?? obj.ip ?? raw.printer_host ?? ''),
      port: String(obj.port ?? raw.printer_port ?? '9100'),
      printer_vendor_id: String(obj.printer_vendor_id ?? legacyVid ?? ''),
      printer_product_id: String(obj.printer_product_id ?? legacyPid ?? ''),
    });
  };

  const legacyVid = String(raw.printer_vendor_id ?? '');
  const legacyPid = String(raw.printer_product_id ?? '');
  const receipt = asEndpoint(raw.receipt_printer, legacyVid, legacyPid);
  const kot = asEndpoint(raw.kot_printer);

  return {
    paper_width: String(raw.paper_width ?? '80mm'),
    receipt_printer: receipt,
    kot_printer: kot,
    printer_vendor_id: receipt.printer_vendor_id,
    printer_product_id: receipt.printer_product_id,
  };
}

type SettingsState = {
  activeTab: string;
  taxEnabled: boolean;
  taxPercentage: number;
  taxRatesByPaymentMethod: Record<string, number>;
  hardware: HardwareConfig;

  setActiveTab: (v: string) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxPercentage: (v: number) => void;
  setTaxRatesByPaymentMethod: (
    v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>),
  ) => void;
  setHardware: (
    v: HardwareConfig | ((prev: HardwareConfig) => HardwareConfig),
  ) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      activeTab: 'general',
      taxEnabled: true,
      taxPercentage: 0,
      taxRatesByPaymentMethod: { Cash: 0, Card: 8 },
      hardware: defaultHardware(),

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
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          hardware: normalizeHardware(p.hardware as Record<string, unknown> | undefined),
        };
      },
    },
  ),
);
