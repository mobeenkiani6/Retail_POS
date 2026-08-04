export type ProductSku = {
  id?: number;
  product_id?: number;
  sku_code: string;
  barcode: string;
  variant_name: string;
  quantity_value: number;
  unit_id?: number | null;
  unit_abbr: string;
  display_label?: string;
  cost_price: number;
  selling_price: number;
  tax_rate?: number;
  min_stock: number;
  max_stock?: number | null;
  reorder_level: number;
  shelf_location?: string;
  image_url?: string;
  notes?: string;
  status?: string;
  stock_level?: number;
  sort_order?: number;
};

export type ProductSkuForm = {
  id?: number;
  sku_code: string;
  barcode: string;
  variant_name: string;
  quantity_value: string;
  unit_id: string;
  unit_abbr: string;
  cost_price: string;
  selling_price: string;
  min_stock: string;
  max_stock: string;
  reorder_level: string;
  stock_level: string;
  shelf_location: string;
  notes: string;
  status: string;
};

export type ProductParent = {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  brand_id?: number;
  brand?: string;
  supplier_id?: number;
  image_url?: string;
  tax_rate?: number;
  notes?: string;
  status?: string;
  skus?: ProductSku[];
  sku_count?: number;
  stock_level?: number;
  min_price?: number;
  max_price?: number;
  base_price?: number;
  archived_at?: string;
};

export function emptySkuForm(): ProductSkuForm {
  return {
    sku_code: '',
    barcode: '',
    variant_name: 'Standard',
    quantity_value: '1',
    unit_id: '',
    unit_abbr: 'ea',
    cost_price: '0',
    selling_price: '0',
    min_stock: '0',
    max_stock: '',
    reorder_level: '0',
    stock_level: '0',
    shelf_location: '',
    notes: '',
    status: 'active',
  };
}

export function skuToForm(s: ProductSku): ProductSkuForm {
  return {
    id: s.id,
    sku_code: s.sku_code || '',
    barcode: s.barcode || '',
    variant_name: s.variant_name || 'Standard',
    quantity_value: String(s.quantity_value ?? 1),
    unit_id: s.unit_id ? String(s.unit_id) : '',
    unit_abbr: s.unit_abbr || 'ea',
    cost_price: String(s.cost_price ?? 0),
    selling_price: String(s.selling_price ?? 0),
    min_stock: String(s.min_stock ?? 0),
    max_stock: s.max_stock != null ? String(s.max_stock) : '',
    reorder_level: String(s.reorder_level ?? 0),
    stock_level: String(s.stock_level ?? 0),
    shelf_location: s.shelf_location || '',
    notes: s.notes || '',
    status: s.status || 'active',
  };
}

export function formatSkuLabel(s: Pick<ProductSku, 'quantity_value' | 'unit_abbr' | 'variant_name'>): string {
  const qty = parseFloat(String(s.quantity_value));
  const qtyStr = Number.isInteger(qty) ? String(qty) : String(qty);
  const unit = (s.unit_abbr || '').trim();
  if (unit && !['ea', 'each', 'pc', 'piece'].includes(unit.toLowerCase())) {
    return `${qtyStr} ${unit}`;
  }
  return s.variant_name || qtyStr;
}

export function skuFormToPayload(form: ProductSkuForm) {
  return {
    id: form.id,
    sku_code: form.sku_code.trim(),
    barcode: form.barcode.trim(),
    variant_name: form.variant_name.trim() || 'Standard',
    quantity_value: parseFloat(form.quantity_value) || 1,
    unit_id: form.unit_id ? parseInt(form.unit_id, 10) : null,
    unit_abbr: form.unit_abbr.trim() || 'ea',
    cost_price: parseFloat(form.cost_price) || 0,
    selling_price: parseFloat(form.selling_price) || 0,
    min_stock: parseInt(form.min_stock, 10) || 0,
    max_stock: form.max_stock ? parseInt(form.max_stock, 10) : null,
    reorder_level: parseInt(form.reorder_level, 10) || 0,
    initial_stock: parseInt(form.stock_level, 10) || 0,
    shelf_location: form.shelf_location.trim() || null,
    notes: form.notes.trim() || null,
    status: form.status || 'active',
  };
}

export function priceRange(skus: ProductSku[], format: (n: number) => string): string {
  if (!skus.length) return '—';
  const prices = skus.map(s => s.selling_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? format(min) : `${format(min)} – ${format(max)}`;
}
