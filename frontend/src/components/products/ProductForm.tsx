import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Upload, X, ChevronDown } from 'lucide-react';
import Input from '../ui/Input';
import UnitSelect from '../ui/UnitSelect';
import SkuTable from './SkuTable';
import { emptySkuForm, skuToForm, skuFormToPayload, type ProductSkuForm } from '../../utils/productSkus';
import { post } from '../../api';

export type ProductFormData = {
  name: string;
  sku: string;
  category_id: string;
  brand_id: string;
  supplier_id: string;
  unit_id: string;
  unit: string;
  carton_qty: string;
  carton_unit: string;
  packet_qty: string;
  packet_unit: string;
  min_stock: string;
  reorder_qty: string;
  image_url: string;
  tax_rate: string;
  description: string;
  notes: string;
  status: string;
  requires_expiry: boolean;
  shelf_life_days: string;
  expiry_warning_days: string;
  skus: ProductSkuForm[];
};

export const emptyProductForm = (): ProductFormData => ({
  name: '',
  sku: '',
  category_id: '',
  brand_id: '',
  supplier_id: '',
  unit_id: '',
  unit: '',
  carton_qty: '0',
  carton_unit: '',
  packet_qty: '0',
  packet_unit: '',
  min_stock: '0',
  reorder_qty: '0',
  image_url: '',
  tax_rate: '0',
  description: '',
  notes: '',
  status: 'active',
  requires_expiry: false,
  shelf_life_days: '',
  expiry_warning_days: '',
  skus: [],
});

type CategoryOption = { id: number; name: string };
type Option = { id: number; name: string; abbreviation?: string };

type Props = {
  form: ProductFormData;
  onChange: (form: ProductFormData | ((prev: ProductFormData) => ProductFormData)) => void;
  categories: CategoryOption[];
  units: Option[];
  brands: Option[];
  suppliers: Option[];
  isEditing?: boolean;
  productId?: number;
  errors?: Record<string, string>;
};

function Req({ children }: { children: React.ReactNode }) {
  return <span className="text-danger">*</span>;
}

export default function ProductForm({
  form, onChange, categories, units, brands, suppliers, isEditing, productId, errors = {},
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasPackaging = (parseFloat(form.carton_qty) || 0) > 0 || (parseFloat(form.packet_qty) || 0) > 0;
  const [packagingOpen, setPackagingOpen] = useState(hasPackaging);
  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    onChange(prev => ({ ...prev, [key]: value }));
  const ch = (key: keyof ProductFormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value);

  // Auto-generate parent SKU code from name for new products
  useEffect(() => {
    if (isEditing) return;
    const name = form.name.trim();
    if (!name || form.sku.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      post<{ sku_code: string }>('/products/generate-sku-code', { name, product_id: productId })
        .then(r => {
          if (!cancelled && r?.sku_code) set('sku', r.sku_code);
        })
        .catch(() => {});
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, isEditing]);

  // Ensure at least one variant row on create
  useEffect(() => {
    if (isEditing || form.skus.length > 0) return;
    const row = emptySkuForm();
    row.variant_name = 'Default';
    row.quantity_value = '1';
    let cancelled = false;
    post<{ barcode: string }>('/products/generate-barcode', {})
      .then(bc => {
        if (cancelled) return;
        row.barcode = bc.barcode;
        set('skus', [row]);
      })
      .catch(() => { if (!cancelled) set('skus', [row]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const applyUnit = (unitId: string, abbr: string) => {
    onChange(prev => ({
      ...prev,
      unit_id: unitId,
      unit: abbr,
      carton_unit: prev.carton_unit || abbr,
      packet_unit: prev.packet_unit || abbr,
      skus: prev.skus.map(s => {
        if (s.unit_id && s.unit_id !== prev.unit_id) return s;
        return { ...s, unit_id: unitId, unit_abbr: abbr };
      }),
    }));
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => set('image_url', reader.result as string);
    reader.readAsDataURL(file);
  };

  const baseUnitLabel = form.unit || 'unit';

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-muted mb-1.5 block">
          Preferred supplier
        </label>
        <select value={form.supplier_id} onChange={ch('supplier_id')} className="input-base w-full">
          <option value="">— Select supplier —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-muted mb-1.5 block">
          Name <Req />
        </label>
        <Input value={form.name} onChange={ch('name')} placeholder="e.g. Cooking Oil, Carrom Seeds" />
        {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">
            Unit <Req />
          </label>
          <UnitSelect
            units={units}
            value={form.unit_id}
            onChange={applyUnit}
            placeholder="Select unit"
          />
          <p className="text-xs text-muted mt-1.5">
            Selling / inventory base unit (e.g. Kg for 1kg oil packs).
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">SKU</label>
          <Input value={form.sku} onChange={ch('sku')} placeholder="Auto-generated from name" />
          <p className="text-xs text-muted mt-1.5">Auto-generated for new products. You can still edit it.</p>
        </div>
      </div>

      {/* Packaging — collapsed by default */}
      <div className="rounded-xl border border-border bg-canvas-subtle/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setPackagingOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-canvas-subtle transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Packaging sizes for carton/packet orders (optional)
            </p>
            {!packagingOpen && hasPackaging && (
              <p className="text-xs text-muted mt-0.5 truncate">
                {[
                  (parseFloat(form.carton_qty) || 0) > 0 && `${form.carton_qty} ${form.carton_unit || form.unit || 'unit'}/carton`,
                  (parseFloat(form.packet_qty) || 0) > 0 && `${form.packet_qty} ${form.packet_unit || form.unit || 'unit'}/packet`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${packagingOpen ? 'rotate-180' : ''}`} />
        </button>

        {packagingOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <p className="text-xs text-warning mt-3 px-2.5 py-1.5 rounded-lg bg-warning-soft border border-warning/20">
              Changing packaging will not affect existing stock.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <p className="text-sm font-medium">How many</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={form.carton_qty ?? '0'}
                    onChange={ch('carton_qty')}
                    placeholder="Quantity"
                  />
                  <UnitSelect
                    units={units}
                    value={form.carton_unit || form.unit || ''}
                    valueIsAbbr
                    onChange={(_id, abbr) => set('carton_unit', abbr)}
                    placeholder="Unit"
                  />
                </div>
                <p className="text-xs text-muted">
                  in 1 carton? (stored as {baseUnitLabel} per carton)
                </p>
                <p className="text-[11px] text-muted">
                  Example: 12 Kg → receiving 5 cartons adds 60 × 1kg packs.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <p className="text-sm font-medium">How many</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={form.packet_qty ?? '0'}
                    onChange={ch('packet_qty')}
                    placeholder="Quantity"
                  />
                  <UnitSelect
                    units={units}
                    value={form.packet_unit || form.unit || ''}
                    valueIsAbbr
                    onChange={(_id, abbr) => set('packet_unit', abbr)}
                    placeholder="Unit"
                  />
                </div>
                <p className="text-xs text-muted">
                  in 1 packet? (stored as {baseUnitLabel} per packet)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-muted mb-1.5 block">Brand</label>
        <select value={form.brand_id || ''} onChange={ch('brand_id')} className="input-base w-full">
          <option value="">— Select brand —</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-muted mb-1.5 block">
          Category <Req />
        </label>
        <select value={form.category_id || ''} onChange={ch('category_id')} className="input-base w-full">
          <option value="">— Select category —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <SkuTable
        skus={form.skus || []}
        onChange={skus => set('skus', skus)}
        units={units}
        productName={form.name}
        productId={productId}
        defaultUnitId={form.unit_id}
        defaultUnitAbbr={form.unit}
        isEditing={isEditing}
      />

      <div>
        <label className="text-sm font-medium text-muted mb-1.5 block">Item image</label>
        <Input
          value={(form.image_url || '').startsWith('data:') ? '' : (form.image_url || '')}
          onChange={ch('image_url')}
          placeholder="Image URL (or upload below)"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-sm text-accent-600 font-medium hover:underline"
          >
            <Upload className="w-3.5 h-3.5" /> Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {form.image_url && (
            <div className="relative w-12 h-12 rounded-lg border border-border overflow-hidden">
              <img src={form.image_url} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => set('image_url', '')} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-surface/90 flex items-center justify-center">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted mt-1">Shown on checkout and product lists.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">Low Stock Alert (Min Qty)</label>
          <Input type="number" min={0} value={form.min_stock ?? '0'} onChange={ch('min_stock')} />
        </div>
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">Reorder Quantity</label>
          <Input type="number" min={0} value={form.reorder_qty ?? '0'} onChange={ch('reorder_qty')} />
        </div>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-3 bg-canvas-subtle/40">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.requires_expiry}
            onChange={e => set('requires_expiry', e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent-600"
          />
          <span className="text-sm font-semibold">Requires expiry date on receive</span>
        </label>
        <p className="text-xs text-muted">
          When on, Receiving must enter an expiry date. Warning window: product override → category → default 14 days (use 2 for fresh produce/meat).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-muted mb-1.5 block">Shelf life (days)</label>
            <Input
              type="number"
              min={0}
              value={form.shelf_life_days}
              onChange={ch('shelf_life_days')}
              placeholder="e.g. 30"
              disabled={!form.requires_expiry}
            />
            <p className="text-[10px] text-muted mt-1">Optional: suggests expiry = receive date + days</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted mb-1.5 block">Warn before (days)</label>
            <Input
              type="number"
              min={0}
              value={form.expiry_warning_days}
              onChange={ch('expiry_warning_days')}
              placeholder="Blank = category/14"
              disabled={!form.requires_expiry}
            />
            <p className="text-[10px] text-muted mt-1">e.g. 14 grocery · 2 fresh</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">Default Tax %</label>
          <Input type="number" step="0.01" min={0} value={form.tax_rate} onChange={ch('tax_rate')} />
        </div>
        <div>
          <label className="text-sm font-medium text-muted mb-1.5 block">Status</label>
          <select value={form.status} onChange={ch('status')} className="input-base w-full">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function productToForm(p: Record<string, unknown>): ProductFormData {
  const skusRaw = (p.skus as unknown[]) || [];
  return {
    name: String(p.name || ''),
    sku: String(p.sku || ''),
    category_id: p.category_id ? String(p.category_id) : '',
    brand_id: p.brand_id ? String(p.brand_id) : '',
    supplier_id: p.supplier_id ? String(p.supplier_id) : '',
    unit_id: p.unit_id ? String(p.unit_id) : '',
    unit: String(p.unit || ''),
    carton_qty: String(p.carton_qty ?? '0'),
    carton_unit: String(p.carton_unit || p.unit || ''),
    packet_qty: String(p.packet_qty ?? '0'),
    packet_unit: String(p.packet_unit || p.unit || ''),
    min_stock: String(p.min_stock ?? '0'),
    reorder_qty: String(p.reorder_qty ?? '0'),
    image_url: String(p.image_url || ''),
    tax_rate: String(p.tax_rate ?? '0'),
    description: String(p.description || ''),
    notes: String(p.notes || ''),
    status: String(p.status || 'active'),
    requires_expiry: Boolean(p.requires_expiry),
    shelf_life_days: p.shelf_life_days != null && p.shelf_life_days !== '' ? String(p.shelf_life_days) : '',
    expiry_warning_days: p.expiry_warning_days != null && p.expiry_warning_days !== '' ? String(p.expiry_warning_days) : '',
    skus: skusRaw.map(s => skuToForm(s as Parameters<typeof skuToForm>[0])),
  };
}

export function formToPayload(form: ProductFormData, branchId?: string) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    description: form.description.trim() || null,
    category_id: form.category_id ? parseInt(form.category_id, 10) : null,
    brand_id: form.brand_id ? parseInt(form.brand_id, 10) : null,
    supplier_id: form.supplier_id ? parseInt(form.supplier_id, 10) : null,
    unit_id: form.unit_id ? parseInt(form.unit_id, 10) : null,
    unit: form.unit.trim() || null,
    carton_qty: parseFloat(form.carton_qty) || 0,
    carton_unit: form.carton_unit.trim() || form.unit.trim() || null,
    packet_qty: parseFloat(form.packet_qty) || 0,
    packet_unit: form.packet_unit.trim() || form.unit.trim() || null,
    min_stock: parseInt(form.min_stock, 10) || 0,
    reorder_qty: parseInt(form.reorder_qty, 10) || 0,
    image_url: form.image_url || '',
    tax_rate: parseFloat(form.tax_rate) || 0,
    notes: form.notes.trim() || null,
    status: form.status || 'active',
    requires_expiry: Boolean(form.requires_expiry),
    shelf_life_days: form.shelf_life_days.trim() !== '' ? parseInt(form.shelf_life_days, 10) || null : null,
    expiry_warning_days: form.expiry_warning_days.trim() !== '' ? parseInt(form.expiry_warning_days, 10) || null : null,
    skus: form.skus.map(s => skuFormToPayload(s)),
    branch_id: branchId,
  };
}
