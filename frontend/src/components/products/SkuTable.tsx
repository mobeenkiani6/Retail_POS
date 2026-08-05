import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { get, post, getUserMessage } from '../../api';
import { showToast } from '../Toast';
import { emptySkuForm, type ProductSkuForm } from '../../utils/productSkus';
import { unitDisplayLabel, unitStorageAbbr } from '../../utils/unitLabels';

type UnitOption = { id: number; name: string; abbreviation?: string };
type VariantOption = { id: number; name: string; active?: boolean; archived_at?: string | null };

type Props = {
  skus: ProductSkuForm[];
  onChange: (skus: ProductSkuForm[]) => void;
  units: UnitOption[];
  productName?: string;
  productId?: number;
  /** Product-level selling unit applied to new variants */
  defaultUnitId?: string;
  defaultUnitAbbr?: string;
  isEditing?: boolean;
};

const ADD_NEW_VALUE = '__add_new_variant__';
const CUSTOM_VALUE = '__custom_variant__';

export default function SkuTable({
  skus, onChange, units, productName, productId,
  defaultUnitId = '', defaultUnitAbbr = 'pc', isEditing,
}: Props) {
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForIdx, setAddForIdx] = useState<number | null>(null);
  const [newVariantName, setNewVariantName] = useState('');
  const [savingVariant, setSavingVariant] = useState(false);
  const [customIdx, setCustomIdx] = useState<number | null>(null);

  const loadVariants = () => {
    get<{ variant_options?: VariantOption[] }>('/v1/variant-options/')
      .then(d => setVariantOptions((d?.variant_options ?? []).filter(v => v.active !== false && !v.archived_at)))
      .catch(() => {});
  };

  useEffect(() => { loadVariants(); }, []);

  const updateSku = (idx: number, patch: Partial<ProductSkuForm>) => {
    onChange(skus.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const ensureCodes = async (row: ProductSkuForm) => {
    try {
      const [bc, code] = await Promise.all([
        row.barcode ? Promise.resolve({ barcode: row.barcode }) : post<{ barcode: string }>('/products/generate-barcode', {}),
        row.sku_code ? Promise.resolve({ sku_code: row.sku_code }) : post<{ sku_code: string }>('/products/generate-sku-code', {
          name: productName || 'Product', product_id: productId,
        }),
      ]);
      row.barcode = bc.barcode;
      row.sku_code = code.sku_code;
    } catch { /* user can fill later */ }
    return row;
  };

  const addSku = async () => {
    const row = emptySkuForm();
    row.variant_name = 'Default';
    row.quantity_value = '1';
    if (defaultUnitId) {
      row.unit_id = defaultUnitId;
      row.unit_abbr = defaultUnitAbbr || 'pc';
    } else if (units[0]) {
      row.unit_id = String(units[0].id);
      row.unit_abbr = unitStorageAbbr(units[0]);
    }
    await ensureCodes(row);
    onChange([...skus, row]);
  };

  const removeSku = (idx: number) => {
    if (skus.length <= 1) {
      showToast('At least one variant is required', 'error');
      return;
    }
    onChange(skus.filter((_, i) => i !== idx));
    if (customIdx === idx) setCustomIdx(null);
  };

  const onVariantSelect = (idx: number, value: string) => {
    if (value === ADD_NEW_VALUE) {
      setAddForIdx(idx);
      setNewVariantName('');
      setAddOpen(true);
      return;
    }
    if (value === CUSTOM_VALUE) {
      setCustomIdx(idx);
      return;
    }
    setCustomIdx(prev => (prev === idx ? null : prev));
    updateSku(idx, { variant_name: value });
  };

  const saveNewVariant = async () => {
    const name = newVariantName.trim();
    if (!name) {
      showToast('Variant name is required', 'error');
      return;
    }
    setSavingVariant(true);
    try {
      const existing = variantOptions.find(v => v.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        if (addForIdx != null) updateSku(addForIdx, { variant_name: existing.name });
        setAddOpen(false);
        return;
      }
      const res = await post<{ variant_option?: VariantOption }>('/v1/variant-options/', { name, active: true });
      const created = res?.variant_option;
      if (created) {
        setVariantOptions(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (addForIdx != null) updateSku(addForIdx, { variant_name: created.name });
        showToast('Variant added', 'success');
      }
      setAddOpen(false);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSavingVariant(false);
    }
  };

  const variantNames = new Set(variantOptions.map(v => v.name));

  const marginWarn = (sku: ProductSkuForm) => {
    const cost = parseFloat(sku.cost_price) || 0;
    const sell = parseFloat(sku.selling_price) || 0;
    return sell > 0 && cost > sell;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Variants <span className="text-danger">*</span>
        </label>
      </div>

      {skus.length === 0 ? (
        <div className="text-center py-6 rounded-xl border border-dashed border-border text-muted text-sm">
          No variants yet. Add at least one (e.g. Default, 1kg Pack).
        </div>
      ) : (
        <div className="space-y-2">
          {skus.map((sku, idx) => {
            const currentName = sku.variant_name || '';
            const isCustom = customIdx === idx || (currentName && !variantNames.has(currentName) && currentName !== 'Default' && !variantOptions.some(v => v.name === currentName));
            const warn = marginWarn(sku);
            return (
              <div key={sku.id != null ? `sku-${sku.id}` : `new-${idx}`} className="space-y-1">
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <div className="flex-1 min-w-0">
                    {isCustom ? (
                      <input
                        value={currentName}
                        onChange={e => updateSku(idx, { variant_name: e.target.value })}
                        placeholder="Custom variant name"
                        className="input-base w-full"
                      />
                    ) : (
                      <select
                        value={variantNames.has(currentName) || currentName === 'Default' ? currentName : (currentName ? currentName : 'Default')}
                        onChange={e => onVariantSelect(idx, e.target.value)}
                        className="input-base w-full"
                      >
                        <option value="Default">Default</option>
                        {variantOptions.map(v => (
                          <option key={v.id} value={v.name}>{v.name}</option>
                        ))}
                        {currentName && !variantNames.has(currentName) && currentName !== 'Default' && (
                          <option value={currentName}>{currentName}</option>
                        )}
                        <option value={CUSTOM_VALUE}>Type custom name…</option>
                        <option value={ADD_NEW_VALUE}>+ Save new to catalog…</option>
                      </select>
                    )}
                  </div>
                  <div className="w-full sm:w-28">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={sku.cost_price}
                      onChange={e => updateSku(idx, { cost_price: e.target.value })}
                      placeholder="Purchase"
                      className={`input-base w-full ${warn ? 'border-warning' : ''}`}
                      title="Purchase price"
                    />
                  </div>
                  <div className="w-full sm:w-28">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={sku.selling_price}
                      onChange={e => updateSku(idx, { selling_price: e.target.value })}
                      placeholder="Sale"
                      className={`input-base w-full ${warn ? 'border-danger' : ''}`}
                      title="Sale price"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSku(idx)}
                    className="px-3 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-danger hover:border-danger/40 shrink-0"
                  >
                    Remove
                  </button>
                </div>
                {warn && (
                  <p className="text-xs text-warning">
                    Sale price is below purchase price — margin is negative.
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={sku.quantity_value}
                    onChange={e => updateSku(idx, { quantity_value: e.target.value })}
                    placeholder="Pack qty"
                    className="input-base text-sm py-2"
                    title="Pack quantity (e.g. 1 for 1kg pack)"
                  />
                  <select
                    value={sku.unit_id}
                    onChange={e => {
                      const u = units.find(x => String(x.id) === e.target.value);
                      updateSku(idx, {
                        unit_id: e.target.value,
                        unit_abbr: u ? unitStorageAbbr(u) : sku.unit_abbr,
                      });
                    }}
                    className="input-base text-sm py-2"
                  >
                    <option value="">Unit</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{unitDisplayLabel(u.abbreviation, u.name)}</option>
                    ))}
                  </select>
                  <input
                    value={sku.barcode}
                    onChange={e => updateSku(idx, { barcode: e.target.value })}
                    placeholder="Barcode"
                    className="input-base text-sm py-2 font-mono"
                  />
                  {!isEditing && (
                    <input
                      type="number"
                      min={0}
                      value={sku.stock_level}
                      onChange={e => updateSku(idx, { stock_level: e.target.value })}
                      placeholder="Initial stock"
                      className="input-base text-sm py-2"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addSku}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-accent-500/50 text-accent-600 text-sm font-semibold hover:bg-accent-500/10 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add variant
      </button>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Variant"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveNewVariant} disabled={savingVariant}>
              {savingVariant ? 'Saving…' : 'Add Variant'}
            </Button>
          </>
        }
      >
        <Input
          label="Variant Name *"
          value={newVariantName}
          onChange={e => setNewVariantName(e.target.value)}
          placeholder="e.g. 1kg Pack, Large, Bottle"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveNewVariant(); } }}
        />
        <p className="text-xs text-muted mt-2">Saved to Settings → Variants for reuse.</p>
      </Modal>
    </div>
  );
}
