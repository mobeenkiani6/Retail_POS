import { Plus, Trash2, Copy, Barcode, Hash } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { post } from '../../api';
import { emptySkuForm, formatSkuLabel, type ProductSkuForm } from '../../utils/productSkus';

type UnitOption = { id: number; name: string; abbreviation?: string };

type Props = {
  skus: ProductSkuForm[];
  onChange: (skus: ProductSkuForm[]) => void;
  units: UnitOption[];
  productName?: string;
  productId?: number;
  isEditing?: boolean;
};

function Field({
  label, children, className = '',
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

export default function SkuTable({ skus, onChange, units, productName, productId, isEditing }: Props) {
  const updateSku = (idx: number, patch: Partial<ProductSkuForm>) => {
    onChange(skus.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const addSku = async () => {
    const row = emptySkuForm();
    try {
      const [bc, code] = await Promise.all([
        post<{ barcode: string }>('/products/generate-barcode', {}),
        post<{ sku_code: string }>('/products/generate-sku-code', { name: productName || 'Product', product_id: productId }),
      ]);
      row.barcode = bc.barcode;
      row.sku_code = code.sku_code;
    } catch { /* user can fill manually */ }
    onChange([...skus, row]);
  };

  const duplicateSku = async (idx: number) => {
    const src = skus[idx];
    const row = { ...src, id: undefined, variant_name: `${src.variant_name} (Copy)` };
    try {
      const bc = await post<{ barcode: string }>('/products/generate-barcode', {});
      row.barcode = bc.barcode;
      row.sku_code = `${src.sku_code}-CP`;
    } catch { /* ignore */ }
    onChange([...skus, row]);
  };

  const removeSku = (idx: number) => onChange(skus.filter((_, i) => i !== idx));

  const generateBarcode = async (idx: number) => {
    try {
      const res = await post<{ barcode: string }>('/products/generate-barcode', {});
      updateSku(idx, { barcode: res.barcode });
    } catch { /* ignore */ }
  };

  const generateSkuCode = async (idx: number) => {
    try {
      const res = await post<{ sku_code: string }>('/products/generate-sku-code', { name: productName || 'Product', product_id: productId });
      updateSku(idx, { sku_code: res.sku_code });
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Each pack size is a separate SKU with its own barcode, price, and stock.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={addSku} className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add SKU
        </Button>
      </div>

      {skus.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-dashed border-border text-muted text-sm">
          No SKUs yet. Add pack sizes like 250 ml, 500 ml, 1 L.
        </div>
      ) : (
        <div className="space-y-3">
          {skus.map((sku, idx) => {
            const preview = formatSkuLabel({
              quantity_value: parseFloat(sku.quantity_value) || 1,
              unit_abbr: sku.unit_abbr,
              variant_name: sku.variant_name,
            });
            return (
              <div key={sku.id != null ? `sku-${sku.id}` : `new-${idx}`} className="rounded-xl border border-border bg-canvas-subtle/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">SKU #{idx + 1}</p>
                    <p className="text-xs text-accent-600">{preview}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => generateBarcode(idx)} title="Generate barcode" className="p-1.5 rounded-lg hover:bg-surface border border-border text-muted"><Barcode className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => generateSkuCode(idx)} title="Generate SKU code" className="p-1.5 rounded-lg hover:bg-surface border border-border text-muted"><Hash className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => duplicateSku(idx)} title="Duplicate" className="p-1.5 rounded-lg hover:bg-surface border border-border text-muted"><Copy className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => removeSku(idx)} title="Delete" className="p-1.5 rounded-lg hover:bg-danger-soft border border-border text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Variant Name">
                    <Input value={sku.variant_name} onChange={e => updateSku(idx, { variant_name: e.target.value })} placeholder="Bottle" />
                  </Field>
                  <Field label="Quantity">
                    <Input type="number" min="0" step="any" value={sku.quantity_value} onChange={e => updateSku(idx, { quantity_value: e.target.value })} placeholder="250" className="min-w-0" />
                  </Field>
                  <Field label="Unit">
                    <select
                      value={sku.unit_id}
                      onChange={e => {
                        const u = units.find(x => String(x.id) === e.target.value);
                        updateSku(idx, {
                          unit_id: e.target.value,
                          unit_abbr: u?.abbreviation || u?.name || sku.unit_abbr,
                        });
                      }}
                      className="input-base w-full"
                    >
                      <option value="">Select unit</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Barcode">
                    <Input value={sku.barcode} onChange={e => updateSku(idx, { barcode: e.target.value })} placeholder="8901234567890" className="font-mono text-sm" />
                  </Field>
                  <Field label="SKU Code">
                    <Input value={sku.sku_code} onChange={e => updateSku(idx, { sku_code: e.target.value })} placeholder="MILK-250" className="font-mono text-sm" />
                  </Field>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="Purchase Price">
                    <Input type="number" min="0" step="0.01" value={sku.cost_price} onChange={e => updateSku(idx, { cost_price: e.target.value })} />
                  </Field>
                  <Field label="Selling Price">
                    <Input type="number" min="0" step="0.01" value={sku.selling_price} onChange={e => updateSku(idx, { selling_price: e.target.value })} />
                  </Field>
                  <Field label="Wholesale">
                    <Input type="number" min="0" step="0.01" value={sku.wholesale_price} onChange={e => updateSku(idx, { wholesale_price: e.target.value })} placeholder="Optional" />
                  </Field>
                  {!isEditing && (
                    <Field label="Initial Stock">
                      <Input type="number" min="0" value={sku.stock_level} onChange={e => updateSku(idx, { stock_level: e.target.value })} />
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
