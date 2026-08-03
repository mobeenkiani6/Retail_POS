import { useState, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Upload, X, Package, FileText, Layers } from 'lucide-react';
import Input from '../ui/Input';
import SkuTable from './SkuTable';
import { skuToForm, skuFormToPayload, type ProductSkuForm } from '../../utils/productSkus';

export type ProductFormData = {
  name: string;
  category_id: string;
  brand_id: string;
  supplier_id: string;
  image_url: string;
  tax_rate: string;
  description: string;
  notes: string;
  status: string;
  skus: ProductSkuForm[];
};

export const emptyProductForm = (): ProductFormData => ({
  name: '', category_id: '', brand_id: '', supplier_id: '',
  image_url: '', tax_rate: '0', description: '', notes: '', status: 'active',
  skus: [],
});

type CategoryOption = { id: number; name: string };
type Option = { id: number; name: string; abbreviation?: string };

type Props = {
  form: ProductFormData;
  onChange: (form: ProductFormData) => void;
  categories: CategoryOption[];
  units: Option[];
  brands: Option[];
  suppliers: Option[];
  isEditing?: boolean;
  productId?: number;
  errors?: Record<string, string>;
};

function Section({
  title, icon: Icon, defaultOpen = true, children,
}: { title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-canvas-subtle transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-accent-600" />
          </div>
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProductForm({ form, onChange, categories, units, brands, suppliers, isEditing, productId, errors = {} }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => onChange({ ...form, [key]: value });
  const ch = (key: keyof ProductFormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => set('image_url', reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <Section title="General Information" icon={Package}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted mb-1 block">Product Name *</label>
            <Input value={form.name} onChange={ch('name')} placeholder="e.g. Milk, Rice, Cooking Oil" />
            {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Category</label>
            <select value={form.category_id} onChange={ch('category_id')} className="input-base w-full">
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Brand</label>
            <select value={form.brand_id} onChange={ch('brand_id')} className="input-base w-full">
              <option value="">Select brand</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Supplier</label>
            <select value={form.supplier_id} onChange={ch('supplier_id')} className="input-base w-full">
              <option value="">Select supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Default Tax %</label>
            <Input type="number" step="0.01" min="0" value={form.tax_rate} onChange={ch('tax_rate')} className="max-w-[120px]" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Status</label>
            <select value={form.status} onChange={ch('status')} className="input-base w-full">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted mb-2 block">Product Image</label>
          <div className="flex items-start gap-4">
            {form.image_url ? (
              <div className="relative w-24 h-24 rounded-xl border border-border overflow-hidden bg-canvas-subtle">
                <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => set('image_url', '')} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-border hover:border-accent-400 flex flex-col items-center justify-center gap-1 text-muted hover:text-accent-600 transition-colors">
                <Upload className="w-5 h-5" />
                <span className="text-[10px] font-medium">Upload</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="flex-1">
              <Input value={form.image_url.startsWith('data:') ? '' : form.image_url} onChange={ch('image_url')} placeholder="Or paste image URL" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Product SKUs (Pack Sizes)" icon={Layers}>
        <SkuTable
          skus={form.skus}
          onChange={skus => set('skus', skus)}
          units={units}
          productName={form.name}
          productId={productId}
          isEditing={isEditing}
        />
      </Section>

      <Section title="Description & Notes" icon={FileText} defaultOpen={false}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Description</label>
            <textarea value={form.description} onChange={ch('description')} rows={3} className="input-base w-full resize-none" placeholder="Product description for catalog" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Internal Notes</label>
            <textarea value={form.notes} onChange={ch('notes')} rows={2} className="input-base w-full resize-none" placeholder="Staff-only notes" />
          </div>
        </div>
      </Section>
    </div>
  );
}

export function productToForm(p: Record<string, unknown>): ProductFormData {
  const skusRaw = (p.skus as unknown[]) || [];
  return {
    name: String(p.name || ''),
    category_id: p.category_id ? String(p.category_id) : '',
    brand_id: p.brand_id ? String(p.brand_id) : '',
    supplier_id: p.supplier_id ? String(p.supplier_id) : '',
    image_url: String(p.image_url || ''),
    tax_rate: String(p.tax_rate ?? '0'),
    description: String(p.description || ''),
    notes: String(p.notes || ''),
    status: String(p.status || 'active'),
    skus: skusRaw.map(s => skuToForm(s as Parameters<typeof skuToForm>[0])),
  };
}

export function formToPayload(form: ProductFormData, branchId?: number) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    category_id: form.category_id ? parseInt(form.category_id, 10) : null,
    brand_id: form.brand_id ? parseInt(form.brand_id, 10) : null,
    supplier_id: form.supplier_id ? parseInt(form.supplier_id, 10) : null,
    image_url: form.image_url || '',
    tax_rate: parseFloat(form.tax_rate) || 0,
    notes: form.notes.trim() || null,
    status: form.status || 'active',
    skus: form.skus.map(s => skuFormToPayload(s)),
    branch_id: branchId,
  };
}
