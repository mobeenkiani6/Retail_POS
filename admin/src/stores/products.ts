import { create } from 'zustand';
import { get as apiGet } from '../api/client';
import { useBranchFilter } from './branch';
import { errMsg } from './helpers';

export type ProductSku = {
  id?: number;
  sku_code?: string;
  barcode?: string;
  variant_name?: string;
  quantity_value?: number;
  unit_abbr?: string;
  cost_price?: number;
  selling_price?: number;
  stock_level?: number;
  min_stock?: number;
};

export type Product = {
  id: number;
  name: string;
  brand?: string;
  category_name?: string;
  stock_level?: number;
  archived_at?: string | null;
  skus?: ProductSku[];
  status?: string;
};

export type InventorySkuRow = {
  product_id: number;
  product_name: string;
  category_name?: string;
  sku_id?: number;
  variant_name?: string;
  pack_label?: string;
  barcode?: string;
  cost_price: number;
  selling_price: number;
  stock_level: number;
  min_stock?: number;
};

function packLabel(s: ProductSku) {
  const qty = Number(s.quantity_value ?? 1);
  const unit = (s.unit_abbr || '').trim();
  if (unit && !['ea', 'each', 'pc', 'piece'].includes(unit.toLowerCase())) {
    return `${qty} ${unit}`;
  }
  return s.variant_name || 'Standard';
}

function flattenInventory(products: Product[]): InventorySkuRow[] {
  const flat: InventorySkuRow[] = [];
  for (const p of products) {
    for (const s of p.skus || []) {
      flat.push({
        product_id: p.id,
        product_name: p.name,
        category_name: p.category_name,
        sku_id: s.id,
        variant_name: s.variant_name,
        pack_label: packLabel(s),
        barcode: s.barcode,
        cost_price: Number(s.cost_price || 0),
        selling_price: Number(s.selling_price || 0),
        stock_level: Number(s.stock_level || 0),
        min_stock: Number(s.min_stock || 0),
      });
    }
  }
  return flat;
}

type ProductsState = {
  products: Product[];
  inventoryRows: InventorySkuRow[];
  inventorySummary: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  loadedBranchKey: string;
  load: (force?: boolean) => Promise<void>;
  invalidate: () => void;
};

function branchKey() {
  return useBranchFilter.getState().selectedBranchId || 'all';
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  inventoryRows: [],
  inventorySummary: null,
  loading: false,
  error: null,
  loadedBranchKey: '',

  invalidate: () => set({ loadedBranchKey: '' }),

  load: async (force = false) => {
    const key = branchKey();
    if (!force && get().loadedBranchKey === key && get().products.length) return;
    // Allow a forced reload even if a previous load is in-flight
    if (!force && get().loading) return;

    set({ loading: true, error: null });
    const { selectedBranchId, queryParam } = useBranchFilter.getState();
    const qp = queryParam();
    const branchPart = selectedBranchId
      ? `branch_id=${encodeURIComponent(selectedBranchId)}`
      : qp;
    const qs = branchPart ? `?${branchPart}` : '';

    try {
      const [productsRes, sum] = await Promise.all([
        apiGet<{ products?: Product[] }>(`/products/${qs}`),
        apiGet<Record<string, unknown>>(`/inventory/summary${qs}`).catch(() => null),
      ]);
      const products = productsRes.products || [];
      set({
        products,
        inventoryRows: flattenInventory(products),
        inventorySummary: sum,
        loading: false,
        loadedBranchKey: key,
        error: null,
      });
    } catch (e) {
      set({ loading: false, error: errMsg(e), products: [], inventoryRows: [] });
    }
  },
}));
