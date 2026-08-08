import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X, Upload } from 'lucide-react';
import { useSettingsStore, type Discount, type ReceiptSettings } from '../stores/settings';
import { NumberField } from '../components/NumberField';

/**
 * Admin settings focus on HQ config that isn't already a dedicated module.
 * Catalog masters, suppliers, employees, and branches have their own pages.
 */
export function SettingsPage() {
  const {
    config,
    businessName,
    currency,
    locale,
    phone,
    address,
    taxEnabled,
    taxPercentage,
    cashTax,
    cardTax,
    discounts,
    receipt,
    saving,
    message,
    error,
    load,
    saveConfig,
    setField,
    setReceipt,
  } = useSettingsStore();

  const [tab, setTab] = useState<'business' | 'tax' | 'discounts' | 'receipt'>('business');
  const [newDisc, setNewDisc] = useState<{ name: string; type: 'percent' | 'fixed'; value: number | '' }>({
    name: '',
    type: 'percent',
    value: '',
  });
  const [editDisc, setEditDisc] = useState<(Omit<Discount, 'value'> & { value: number | '' }) | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs = [
    { id: 'business' as const, label: 'Business' },
    { id: 'tax' as const, label: 'Tax & rates' },
    { id: 'discounts' as const, label: 'Discounts' },
    { id: 'receipt' as const, label: 'Receipt' },
  ];

  const updateReceipt = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setReceipt({ [key]: value });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setField('error', 'Logo file must be under 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceipt({ logoUrl: String(reader.result || ''), showLogo: true });
      setField('error', null);
    };
    reader.onerror = () => setField('error', 'Could not read logo file');
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-muted mt-1">
          Business, tax, discounts, and receipt — catalog, suppliers, staff, and branches are managed in their own modules
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
              tab === t.id ? 'bg-accent-600 text-white border-accent-600' : 'border-border text-foreground-secondary'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && <div className="text-sm text-muted">{message}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {tab === 'business' && (
        <div className="panel p-5 space-y-4 max-w-xl">
          <div>
            <label className="section-label">Business name</label>
            <input className="input mt-1 h-10" value={businessName} onChange={(e) => setField('businessName', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="section-label">Currency</label>
              <input className="input mt-1 h-10" value={currency} onChange={(e) => setField('currency', e.target.value)} />
            </div>
            <div>
              <label className="section-label">Locale</label>
              <input className="input mt-1 h-10" value={locale} onChange={(e) => setField('locale', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="section-label">Phone</label>
            <input className="input mt-1 h-10" value={phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>
          <div>
            <label className="section-label">Address</label>
            <textarea className="input mt-1 min-h-[80px]" value={address} onChange={(e) => setField('address', e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary h-10"
            disabled={saving}
            onClick={() =>
              void saveConfig({
                ...config,
                business_name: businessName,
                store_name: businessName,
                currency,
                locale,
                phone,
                business_phone: phone,
                address,
                business_address: address,
              })
            }
          >
            Save business profile
          </button>
        </div>
      )}

      {tab === 'tax' && (
        <div className="panel p-5 space-y-4 max-w-xl">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={taxEnabled} onChange={(e) => setField('taxEnabled', e.target.checked)} />
            Enable tax
          </label>
          <div>
            <label className="section-label">Default tax %</label>
            <NumberField
              className="input mt-1 h-10"
              value={taxPercentage}
              onValueChange={(v) => setField('taxPercentage', v)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="section-label">Cash tax %</label>
              <NumberField className="input mt-1 h-10" value={cashTax} onValueChange={(v) => setField('cashTax', v)} />
            </div>
            <div>
              <label className="section-label">Card tax %</label>
              <NumberField className="input mt-1 h-10" value={cardTax} onValueChange={(v) => setField('cardTax', v)} />
            </div>
          </div>
          <button
            type="button"
            className="btn-primary h-10"
            disabled={saving}
            onClick={() =>
              void saveConfig({
                ...config,
                tax_enabled: taxEnabled,
                tax_percentage: Number(taxPercentage) || 0,
                tax_rates_by_payment_method: { Cash: Number(cashTax) || 0, Card: Number(cardTax) || 0 },
              })
            }
          >
            Save tax settings
          </button>
        </div>
      )}

      {tab === 'discounts' && (
        <div className="panel p-5 space-y-4 max-w-2xl">
          <form
            className="flex flex-wrap gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDisc.name.trim()) return;
              const item: Discount = {
                id: `d_${Date.now()}`,
                name: newDisc.name.trim(),
                type: newDisc.type,
                value: Number(newDisc.value) || 0,
              };
              const next = [...discounts, item];
              setField('discounts', next);
              setNewDisc({ name: '', type: 'percent', value: '' });
              void saveConfig({ ...config, discounts: next });
            }}
          >
            <div className="flex-1 min-w-[140px]">
              <label className="section-label">Name</label>
              <input className="input mt-1 h-10" value={newDisc.name} onChange={(e) => setNewDisc({ ...newDisc, name: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Type</label>
              <select
                className="input mt-1 h-10"
                value={newDisc.type}
                onChange={(e) => setNewDisc({ ...newDisc, type: e.target.value as 'percent' | 'fixed' })}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div>
              <label className="section-label">Value</label>
              <NumberField
                className="input mt-1 h-10 w-24"
                value={newDisc.value}
                onValueChange={(v) => setNewDisc({ ...newDisc, value: v })}
                required
              />
            </div>
            <button className="btn-primary h-10" type="submit">Add</button>
          </form>
          <ul className="space-y-2 text-sm">
            {discounts.filter((d) => !d.archived).map((d) => (
              <li key={d.id} className="flex justify-between items-center gap-3 border-b border-border py-2">
                {editDisc?.id === d.id ? (
                  <>
                    <div className="flex flex-wrap gap-2 flex-1 items-center">
                      <input
                        className="input h-9 flex-1 min-w-[120px]"
                        value={editDisc.name}
                        onChange={(e) => setEditDisc({ ...editDisc, name: e.target.value })}
                      />
                      <select
                        className="input h-9 w-auto"
                        value={editDisc.type}
                        onChange={(e) => setEditDisc({ ...editDisc, type: e.target.value as 'percent' | 'fixed' })}
                      >
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed</option>
                      </select>
                      <NumberField
                        className="input h-9 w-24"
                        value={editDisc.value}
                        onValueChange={(v) => setEditDisc({ ...editDisc, value: v })}
                      />
                    </div>
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        className="btn-ghost p-1 text-success"
                        title="Save"
                        onClick={() => {
                          if (!editDisc.name.trim()) return;
                          const next = discounts.map((x) =>
                            x.id === d.id
                              ? { ...x, name: editDisc.name.trim(), type: editDisc.type, value: Number(editDisc.value) || 0 }
                              : x,
                          );
                          setField('discounts', next);
                          setEditDisc(null);
                          void saveConfig({ ...config, discounts: next });
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button type="button" className="btn-ghost p-1" title="Cancel" onClick={() => setEditDisc(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>
                      {d.name} · {d.value}
                      {d.type === 'percent' ? '%' : ''}
                    </span>
                    <div className="flex shrink-0 items-center">
                      <button type="button" className="btn-ghost p-1" title="Edit" onClick={() => setEditDisc({ ...d })}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost p-1 text-danger"
                        title="Delete"
                        onClick={() => {
                          const next = discounts.filter((x) => x.id !== d.id);
                          setField('discounts', next);
                          if (editDisc?.id === d.id) setEditDisc(null);
                          void saveConfig({ ...config, discounts: next });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {!discounts.filter((d) => !d.archived).length && <li className="text-muted">No active discounts</li>}
          </ul>
        </div>
      )}

      {tab === 'receipt' && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="panel p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Receipt settings</h2>
              <p className="text-xs text-muted mt-1">
                Shared with POS — changes here show up in mart POS Receipt settings (and the other way around).
              </p>
            </div>
            <div>
              <label className="section-label">Business name on receipt</label>
              <input className="input mt-1 h-10" value={receipt.businessName} onChange={(e) => updateReceipt('businessName', e.target.value)} />
            </div>
            <div>
              <label className="section-label">Address</label>
              <textarea
                className="input mt-1 min-h-[72px]"
                value={receipt.businessAddress}
                onChange={(e) => updateReceipt('businessAddress', e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Phone</label>
              <input className="input mt-1 h-10" value={receipt.businessPhone} onChange={(e) => updateReceipt('businessPhone', e.target.value)} />
            </div>
            <div>
              <label className="section-label">Header note</label>
              <input
                className="input mt-1 h-10"
                value={receipt.headerText}
                onChange={(e) => updateReceipt('headerText', e.target.value)}
                placeholder="Optional line under the header"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="section-label">GST / tax ID</label>
                <input className="input mt-1 h-10" value={receipt.gstNumber} onChange={(e) => updateReceipt('gstNumber', e.target.value)} />
              </div>
              <div>
                <label className="section-label">NTN</label>
                <input className="input mt-1 h-10" value={receipt.ntnNumber} onChange={(e) => updateReceipt('ntnNumber', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="section-label">Footer message</label>
              <textarea
                className="input mt-1 min-h-[72px]"
                value={receipt.footerMessage}
                onChange={(e) => updateReceipt('footerMessage', e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Extra footer line 1</label>
              <input className="input mt-1 h-10" value={receipt.footerLine1} onChange={(e) => updateReceipt('footerLine1', e.target.value)} />
            </div>
            <div>
              <label className="section-label">Extra footer line 2</label>
              <input className="input mt-1 h-10" value={receipt.footerLine2} onChange={(e) => updateReceipt('footerLine2', e.target.value)} />
            </div>
            <div>
              <label className="section-label">Logo</label>
              <div className="mt-2 flex items-center gap-3">
                {receipt.logoUrl ? (
                  <img
                    src={receipt.logoUrl}
                    alt="Receipt logo"
                    className="h-12 w-12 object-contain border border-border bg-surface rounded flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded border border-dashed border-border bg-canvas-subtle flex-shrink-0" />
                )}
                <label className="relative flex-1 cursor-pointer">
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleLogoUpload} />
                  <div className="h-10 px-3 border border-dashed border-border rounded-xl bg-surface flex items-center justify-center gap-2 text-sm text-muted pointer-events-none">
                    <Upload className="w-4 h-4" />
                    {receipt.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </div>
                </label>
                {receipt.logoUrl && (
                  <button
                    type="button"
                    className="text-sm text-red-600 font-medium hover:underline shrink-0"
                    onClick={() => setReceipt({ logoUrl: '' })}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">Image under 1MB. High-contrast logos print cleanest on thermal printers.</p>
            </div>
            {receipt.logoUrl && (
              <div>
                <label className="section-label">Logo height</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={80}
                    max={250}
                    step={10}
                    value={receipt.logoHeight}
                    onChange={(e) => updateReceipt('logoHeight', Number(e.target.value))}
                    className="flex-1 accent-accent-600"
                  />
                  <span className="text-sm text-muted w-12 tabular-nums">{receipt.logoHeight}px</span>
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={receipt.showLogo}
                onChange={(e) => updateReceipt('showLogo', e.target.checked)}
                disabled={!receipt.logoUrl}
              />
              Show logo on receipt
            </label>
            <button
              type="button"
              className="btn-primary h-10"
              disabled={saving}
              onClick={() =>
                void saveConfig({
                  ...config,
                  receipt_header: receipt.headerText,
                  receipt_footer: receipt.footerMessage,
                  receipt: {
                    ...((config.receipt as object) || {}),
                    header: receipt.headerText,
                    footer: receipt.footerMessage,
                    show_logo: receipt.showLogo,
                  },
                  receipt_settings: {
                    ...((config.receipt_settings as object) || {}),
                    businessName: receipt.businessName,
                    businessAddress: receipt.businessAddress,
                    businessPhone: receipt.businessPhone,
                    logoUrl: receipt.logoUrl,
                    logoHeight: receipt.logoHeight,
                    footerMessage: receipt.footerMessage,
                    footerLine1: receipt.footerLine1,
                    footerLine2: receipt.footerLine2,
                    gstNumber: receipt.gstNumber,
                    ntnNumber: receipt.ntnNumber,
                    headerText: receipt.headerText,
                  },
                })
              }
            >
              Save receipt settings
            </button>
          </div>

          <div className="panel p-5">
            <div className="section-label mb-3">Live preview</div>
            <div className="mx-auto max-w-[320px] rounded-lg bg-white text-neutral-900 shadow-lg border border-neutral-200 p-4 font-mono text-[11px] leading-relaxed">
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-neutral-300">
                {receipt.showLogo && receipt.logoUrl && (
                  <img
                    src={receipt.logoUrl}
                    alt=""
                    className="mx-auto mb-2 w-full object-contain grayscale"
                    style={{ maxHeight: Math.min(receipt.logoHeight, 120) }}
                  />
                )}
                {receipt.showLogo && !receipt.logoUrl && (
                  <div className="mx-auto mb-2 h-10 w-24 rounded bg-neutral-100 flex items-center justify-center text-[9px] text-neutral-400 uppercase tracking-wide">
                    Logo
                  </div>
                )}
                <div className="font-bold text-sm tracking-wide">{receipt.businessName || 'Business name'}</div>
                {receipt.businessAddress.split('\n').filter(Boolean).map((line, i) => (
                  <div key={i} className="text-neutral-600 whitespace-pre-wrap">{line}</div>
                ))}
                {receipt.businessPhone && <div className="text-neutral-600">{receipt.businessPhone}</div>}
                {receipt.headerText && <div className="text-neutral-500 italic pt-1">{receipt.headerText}</div>}
                {(receipt.gstNumber || receipt.ntnNumber) && (
                  <div className="text-[10px] text-neutral-500 pt-1">
                    {receipt.gstNumber && <div>GST: {receipt.gstNumber}</div>}
                    {receipt.ntnNumber && <div>NTN: {receipt.ntnNumber}</div>}
                  </div>
                )}
              </div>

              <div className="py-3 space-y-1 border-b border-dashed border-neutral-300">
                <div className="flex justify-between text-neutral-500">
                  <span>INV-PREVIEW</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate">Sample item A × 2</span>
                  <span>800</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate">Sample item B × 1</span>
                  <span>450</span>
                </div>
              </div>

              <div className="py-3 space-y-1 border-b border-dashed border-neutral-300">
                <div className="flex justify-between"><span>Subtotal</span><span>1,250</span></div>
                <div className="flex justify-between text-neutral-600"><span>Tax</span><span>0</span></div>
                <div className="flex justify-between font-bold text-sm pt-1"><span>TOTAL</span><span>1,250</span></div>
                <div className="flex justify-between text-neutral-500"><span>Paid (Cash)</span><span>1,250</span></div>
              </div>

              <div className="pt-3 text-center space-y-1 text-neutral-600">
                <div>{receipt.footerMessage || 'Thank you!'}</div>
                {receipt.footerLine1 && <div>{receipt.footerLine1}</div>}
                {receipt.footerLine2 && <div>{receipt.footerLine2}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
