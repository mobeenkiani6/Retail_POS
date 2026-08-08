import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader2, Moon, Sun, Monitor, ScrollText, Copy, Trash, Download, ChevronDown, ChevronUp, Archive, ArchiveRestore } from 'lucide-react';
import UsersSettings from '../components/settings/UsersSettings';
import ReceiptSettings from '../components/settings/ReceiptSettings';
import BranchesSettings from '../components/settings/BranchesSettings';
import CategoriesSettings from '../components/settings/CategoriesSettings';
import UnitsSettings from '../components/settings/UnitsSettings';
import BrandsSettings from '../components/settings/BrandsSettings';
import VariantsSettings from '../components/settings/VariantsSettings';
import SuppliersSettings from '../components/settings/SuppliersSettings';
import HardwareSettings from '../components/settings/HardwareSettings';
import { useTheme } from '../hooks/useTheme';
import appLogger, { type LogEntry } from '../utils/logger';
import { get, put, getUserMessage } from '../api';
import { showConfirm } from '../components/ConfirmDialog';
import { getBranchId } from '../branch';
import { useSettingsStore } from '../stores/settingsStore';
import { SETTINGS_UPDATED_EVENT, useRealtimeReload } from '../hooks/useRealtimeSync';

type SettingsResponse = { config?: Record<string, unknown> };

export default function Settings() {
  const {
    activeTab,
    taxEnabled,
    taxPercentage,
    taxRatesByPaymentMethod,
    setActiveTab,
    setTaxEnabled,
    setTaxPercentage,
    setTaxRatesByPaymentMethod,
  } = useSettingsStore();
  const { theme, setTheme, isDark } = useTheme();

  const [taxLoading, setTaxLoading] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxFeedback, setTaxFeedback] = useState('');
  const PAYMENT_METHODS = ['Cash', 'Card'];

  // ── Discounts state ──
  type DiscountItem = { id: string; name: string; type: 'percent' | 'fixed'; value: number; archived?: boolean };
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsSaving, setDiscountsSaving] = useState(false);
  const [discountsFeedback, setDiscountsFeedback] = useState('');
  const [discountsIncludeArchived, setDiscountsIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DiscountItem | null>(null);
  const [newDiscount, setNewDiscount] = useState<{ name: string; type: 'percent' | 'fixed'; value: number }>({ name: '', type: 'percent', value: 0 });

  // Basic role check
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (user?.role !== 'owner' && user?.role !== 'manager') {
      window.location.href = '/operations';
    }
  }, []);

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isOwner = user?.role === 'owner';
  
  const tabs = ['General', 'Receipt', 'Hardware', 'Categories', 'Variants', 'Units', 'Brands', 'Suppliers', 'Tax & Rates', 'Discounts'];
  if (isOwner) {
    tabs.push('Users');
    tabs.push('Branch');
  }
  tabs.push('App Logs');

  // Fetch settings on mount
  useEffect(() => {
    if (activeTab === 'taxrates') {
      fetchTaxSettings();
    } else if (activeTab === 'discounts') {
      fetchDiscounts();
    }
  }, [activeTab]);

  const fetchDiscounts = async () => {
    setDiscountsLoading(true);
    try {
      const activeBranchId = getBranchId();
      const query = activeBranchId ? `?branch_id=${activeBranchId}` : '';
      const data = await get<SettingsResponse>(`/settings/${query}`);
      const list = data.config?.discounts;
      setDiscounts(Array.isArray(list) ? list : []);
    } catch {
      setDiscounts([]);
    } finally {
      setDiscountsLoading(false);
    }
  };

  const saveDiscounts = async (updatedList: DiscountItem[]) => {
    setDiscountsSaving(true);
    setDiscountsFeedback('');
    try {
      const activeBranchId = getBranchId();
      const query = activeBranchId ? `?branch_id=${activeBranchId}` : '';
      const existing = await get<SettingsResponse>(`/settings/${query}`);
      const currentConfig = (existing?.config ?? {}) as Record<string, unknown>;
      const payload: { config: Record<string, unknown>; branch_id?: string } = {
        config: { ...currentConfig, discounts: updatedList },
      };
      if (activeBranchId) {
        payload.branch_id = activeBranchId;
      }
      await put('/settings/', payload);
      setDiscounts(updatedList);
      setDiscountsFeedback('Discounts saved!');
      setTimeout(() => setDiscountsFeedback(''), 2000);
      setEditingId(null);
    } catch (e) {
      setDiscountsFeedback('error:' + getUserMessage(e));
    } finally {
      setDiscountsSaving(false);
    }
  };

  const handleAddDiscount = () => {
    const name = newDiscount.name.trim();
    if (!name) return;
    const value = newDiscount.type === 'percent' ? Math.min(100, Math.max(0, newDiscount.value)) : Math.max(0, newDiscount.value);
    const id = crypto.randomUUID ? crypto.randomUUID() : `discount-${Date.now()}`;
    const updated = [...discounts, { id, name, type: newDiscount.type, value }];
    setNewDiscount({ name: '', type: 'percent', value: 0 });
    saveDiscounts(updated);
  };

  const handleStartEditDiscount = (d: DiscountItem) => {
    setEditingId(d.id);
    setEditingDraft({ ...d });
  };

  const handleUpdateDiscount = (updatedList: DiscountItem[]) => {
    saveDiscounts(updatedList);
    setEditingId(null);
    setEditingDraft(null);
  };

  const handleArchiveDiscount = (d: DiscountItem) => {
    saveDiscounts(discounts.map(x => x.id === d.id ? { ...x, archived: true } : x));
    setEditingId(null);
  };

  const handleRestoreDiscount = (d: DiscountItem) => {
    saveDiscounts(discounts.map(x => x.id === d.id ? { ...x, archived: false } : x));
    setEditingId(null);
  };

  const handlePermanentDeleteDiscount = async (d: DiscountItem) => {
    const confirmed = await showConfirm({
      title: 'Permanently delete discount?',
      message: `"${d.name}" will be removed from the list. This cannot be undone.`,
      relatedEffects: ['This discount will no longer be available at checkout.'],
      confirmLabel: 'Delete permanently',
      variant: 'danger',
    });
    if (!confirmed) return;
    saveDiscounts(discounts.filter(x => x.id !== d.id));
    setEditingId(null);
  };

  const fetchTaxSettings = async () => {
    setTaxLoading(true);
    try {
      const activeBranchId = getBranchId();
      const query = activeBranchId ? `?branch_id=${activeBranchId}` : '';
      const data = await get<SettingsResponse>(`/settings/${query}`);
      const config = (data?.config ?? {}) as Record<string, unknown>;
      setTaxEnabled(config.tax_enabled !== false);
      setTaxPercentage((config.tax_percentage as number) ?? 8);
      const rates = config.tax_rates_by_payment_method as Record<string, number> | undefined;
      setTaxRatesByPaymentMethod({
        Cash: rates?.Cash ?? 0,
        Card: rates?.Card ?? 8,
      });
    } catch {
      setTaxRatesByPaymentMethod({ Cash: 0, Card: 8 });
    } finally {
      setTaxLoading(false);
    }
  };

  useRealtimeReload([SETTINGS_UPDATED_EVENT], () => {
    if (activeTab === 'taxrates') void fetchTaxSettings();
    if (activeTab === 'discounts') void fetchDiscounts();
  });

  const saveTaxSettings = async () => {
    setTaxSaving(true);
    setTaxFeedback('');
    try {
      const activeBranchId = getBranchId();
      const query = activeBranchId ? `?branch_id=${activeBranchId}` : '';
      const existing = await get<SettingsResponse>(`/settings/${query}`);
      const currentConfig = (existing?.config ?? {}) as Record<string, unknown>;
      const payload: { config: Record<string, unknown>; branch_id?: string } = {
        config: {
          ...currentConfig,
          tax_enabled: taxEnabled,
          tax_percentage: taxPercentage,
          tax_rates_by_payment_method: { ...taxRatesByPaymentMethod },
        },
      };
      if (activeBranchId) payload.branch_id = activeBranchId;
      await put('/settings/', payload);
      setTaxFeedback('Tax settings saved!');
      setTimeout(() => setTaxFeedback(''), 2000);
    } catch (e) {
      setTaxFeedback('error:' + getUserMessage(e));
    } finally {
      setTaxSaving(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-surface rounded-xl shadow-soft border border-border overflow-hidden m-2 sm:m-4 lg:m-6">
      {/* Mobile tab select */}
      <div className="md:hidden border-b border-border p-3 bg-canvas-subtle shrink-0">
        <label className="sr-only" htmlFor="settings-tab">Settings section</label>
        <select
          id="settings-tab"
          value={activeTab}
          onChange={e => setActiveTab(e.target.value)}
          className="input-base w-full text-sm font-medium min-h-11"
        >
          {tabs.map(tab => {
            const key = tab.toLowerCase().replace(/ & | /g, '');
            return <option key={tab} value={key}>{tab}</option>;
          })}
        </select>
      </div>

      <div className="hidden md:block w-56 lg:w-64 bg-canvas-subtle border-r border-border p-4 shrink-0 overflow-y-auto scroll-smooth">
        <h2 className="text-lg font-bold text-foreground mb-6 px-2">Settings</h2>
        <nav className="space-y-0.5">
          {tabs.map(tab => {
            const key = tab.toLowerCase().replace(/ & | /g, '');
            return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`w-full text-left px-3 min-h-11 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key ? 'bg-accent-600 text-white shadow-sm' : 'text-muted hover:bg-surface hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          );})}
        </nav>
      </div>

      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scroll-smooth bg-canvas min-w-0">
        
        {activeTab === 'general' && (
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold text-foreground mb-2">General</h3>
            <p className="text-sm text-muted mb-6">Appearance and global preferences.</p>
            <div className="surface-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-foreground mb-1">Theme</h4>
                <p className="text-sm text-muted">Light, dark, or match system ({isDark ? 'dark' : 'light'} now).</p>
              </div>
              <div className="flex gap-2">
                {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([id, Icon]) => (
                  <button key={id} type="button" onClick={() => setTheme(id)}
                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${theme === id ? 'border-accent-600 bg-accent-500/10 text-accent-600' : 'border-border bg-surface text-muted hover:border-accent-300'}`}>
                    <Icon className="w-4 h-4" />{id.charAt(0).toUpperCase() + id.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'receipt' && <ReceiptSettings />}
        {activeTab === 'users' && <UsersSettings />}
        {activeTab === 'branch' && <BranchesSettings />}

        {activeTab === 'hardware' && <HardwareSettings />}

        {/* ───────── Categories Management ───────── */}
        {activeTab === 'categories' && (
          <div className="max-w-4xl">
            <h3 className="text-2xl font-bold text-foreground mb-2">Product Categories</h3>
            <CategoriesSettings />
          </div>
        )}

        {activeTab === 'variants' && (
          <div className="max-w-4xl">
            <h3 className="text-2xl font-bold text-foreground mb-2">Product Variants</h3>
            <VariantsSettings />
          </div>
        )}

        {/* ───────── Units Management ───────── */}
        {activeTab === 'units' && (
          <div className="max-w-4xl">
            <h3 className="text-2xl font-bold text-foreground mb-2">Units of Measure</h3>
            <UnitsSettings />
          </div>
        )}

        {activeTab === 'brands' && (
          <div className="max-w-4xl">
            <BrandsSettings />
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="max-w-4xl">
            <SuppliersSettings />
          </div>
        )}

        {activeTab === 'taxrates' && (
          <div className="max-w-2xl">
            <h3 className="text-2xl font-bold text-foreground mb-2">Tax & Rates</h3>
            <p className="text-sm text-muted mb-6">Enable or disable tax. When on, set a tax rate per payment method; tax is calculated at checkout and printed on receipts.</p>

            {taxLoading ? (
              <div className="flex items-center gap-2 text-muted py-6">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading settings…
              </div>
            ) : (
              <div className="space-y-6">
                {/* Taxes on/off toggle */}
                <div className="bg-canvas-subtle p-6 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground-secondary">Taxes enabled</p>
                      <p className="text-xs text-muted mt-0.5">When off, no tax is applied or shown on receipts.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={taxEnabled}
                      onClick={() => setTaxEnabled(!taxEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
                        taxEnabled ? 'bg-accent-600 border-accent-600' : 'bg-neutral-300 dark:bg-neutral-700 border-border'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-surface shadow ring-0 transition-transform ${
                          taxEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                        style={{ marginTop: 2 }}
                      />
                    </button>
                  </div>
                </div>

                {/* Per–payment method rates (only when tax enabled) */}
                {taxEnabled && (
                  <div className="bg-canvas-subtle p-6 rounded-xl border border-border space-y-4">
                    <label className="block text-sm font-semibold text-foreground-secondary">Tax rate by payment method (%)</label>
                    <p className="text-xs text-muted -mt-2">Each payment method can have a different tax percentage.</p>
                    {PAYMENT_METHODS.map(method => (
                      <div key={method} className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-foreground-secondary">{method}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={taxRatesByPaymentMethod[method] ?? 0}
                            onChange={(e) => setTaxRatesByPaymentMethod(prev => ({ ...prev, [method]: parseFloat(e.target.value) || 0 }))}
                            className="w-24 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none text-right font-medium"
                          />
                          <span className="text-muted font-medium">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {taxFeedback && (
                  <div className={`text-sm font-medium rounded-lg px-4 py-2 ${
                    taxFeedback.startsWith('error:')
                      ? 'text-red-700 bg-red-50 border border-red-200'
                      : 'text-accent-600 bg-accent-500/10 border border-accent-500/30'
                  }`}>
                    {taxFeedback.replace('error:', '')}
                  </div>
                )}

                <button 
                  onClick={saveTaxSettings}
                  disabled={taxSaving}
                  className="bg-accent-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm flex items-center gap-2"
                >
                  {taxSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Tax Configuration
                </button>
              </div>
            )}
          </div>
        )}

        {/* ───────── Discounts Management ───────── */}
        {activeTab === 'discounts' && (
          <div className="max-w-2xl">
            <h3 className="text-2xl font-bold text-foreground mb-2">Discounts</h3>
            <p className="text-sm text-muted mb-6">Reusable discount presets for use at checkout.</p>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-foreground-secondary mb-4">
              <input type="checkbox" checked={discountsIncludeArchived} onChange={() => setDiscountsIncludeArchived(v => !v)} className="rounded border-border text-accent-600 focus:ring-accent-500" />
              Include archived
            </label>

            {/* Add new discount */}
            <div className="flex flex-wrap gap-3 mb-6 items-end">
              <input
                type="text"
                inputMode="text"
                value={newDiscount.name}
                onChange={e => setNewDiscount(prev => ({ ...prev, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddDiscount()}
                placeholder="e.g. Happy Hour 10%"
                className="flex-1 min-w-[140px] px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none text-sm"
              />
              <select
                value={newDiscount.type}
                onChange={e => setNewDiscount(prev => ({ ...prev, type: e.target.value as 'percent' | 'fixed' }))}
                className="px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none text-sm"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={newDiscount.type === 'percent' ? 100 : undefined}
                  step={newDiscount.type === 'percent' ? 1 : 0.01}
                  value={newDiscount.value || ''}
                  onChange={e => setNewDiscount(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                  placeholder={newDiscount.type === 'percent' ? '10' : '5'}
                  className="w-24 px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none text-sm text-right"
                />
                <span className="text-muted text-sm">{newDiscount.type === 'percent' ? '%' : 'currency'}</span>
              </div>
              <button
                onClick={handleAddDiscount}
                disabled={!newDiscount.name.trim() || discountsSaving}
                className="flex items-center gap-2 bg-accent-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {discountsFeedback && (
              <div className={`mb-4 text-sm font-medium rounded-lg px-4 py-2 ${
                discountsFeedback.startsWith('error:')
                  ? 'text-red-700 bg-red-50 border border-red-200'
                  : 'text-accent-600 bg-accent-500/10 border border-accent-500/30'
              }`}>
                {discountsFeedback.replace('error:', '')}
              </div>
            )}

            {discountsLoading ? (
              <div className="flex items-center gap-2 text-muted py-6">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading discounts…
              </div>
            ) : (() => {
              const displayList = discountsIncludeArchived ? discounts : discounts.filter(d => !d.archived);
              return displayList.length === 0 ? (
                <div className="text-muted py-8 text-center border border-dashed border-border rounded-xl">
                  {discounts.length === 0 ? 'No discounts yet. Add your first discount above.' : "No active discounts. Enable 'Include archived' to see archived ones."}
                </div>
              ) : (
                <div className="space-y-2">
                  {displayList.map(d => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${d.archived ? 'bg-canvas-subtle/70 border-border opacity-90' : 'bg-canvas-subtle border-border group hover:border-border'}`}
                    >
                      {editingId === d.id && editingDraft ? (
                        <div className="flex flex-wrap gap-2 items-center flex-1">
                          <input
                            type="text"
                            inputMode="text"
                            value={editingDraft.name}
                            onChange={e => setEditingDraft(prev => prev ? { ...prev, name: e.target.value } : null)}
                            className="px-3 py-1.5 border border-border rounded text-sm w-32"
                          />
                          <select
                            value={editingDraft.type}
                            onChange={e => setEditingDraft(prev => prev ? { ...prev, type: e.target.value as 'percent' | 'fixed' } : null)}
                            className="px-3 py-1.5 border border-border rounded text-sm"
                          >
                            <option value="percent">Percent</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={editingDraft.type === 'percent' ? 100 : undefined}
                            step={editingDraft.type === 'percent' ? 1 : 0.01}
                            value={editingDraft.value}
                            onChange={e => setEditingDraft(prev => prev ? { ...prev, value: parseFloat(e.target.value) || 0 } : null)}
                            className="px-3 py-1.5 border border-border rounded text-sm w-20 text-right"
                          />
                          <button
                            onClick={() => handleUpdateDiscount(discounts.map(x => x.id === editingDraft.id ? editingDraft : x))}
                            disabled={discountsSaving || !editingDraft.name.trim()}
                            className="text-sm text-accent-600 font-medium disabled:opacity-50"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-foreground-secondary">{d.name}</span>
                            <span className="text-sm text-muted">
                              {d.type === 'percent' ? `${d.value}%` : `Rs.${d.value}`}
                            </span>
                            {d.archived && <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200">Archived</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!d.archived && (
                              <button onClick={() => handleStartEditDiscount(d)} className="text-muted hover:text-accent-600 p-1 rounded text-sm" title="Edit">Edit</button>
                            )}
                            {d.archived ? (
                              <>
                                <button onClick={() => handleRestoreDiscount(d)} disabled={discountsSaving} className="text-muted hover:text-emerald-600 p-1 rounded text-sm" title="Restore"><ArchiveRestore className="w-4 h-4 inline" /></button>
                                <button onClick={() => handlePermanentDeleteDiscount(d)} disabled={discountsSaving} className="text-muted hover:text-danger p-1 rounded hover:bg-danger-soft" title="Delete permanently"><Trash2 className="w-4 h-4" /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleArchiveDiscount(d)} disabled={discountsSaving} className="text-muted hover:text-amber-600 p-1 rounded text-sm" title="Archive"><Archive className="w-4 h-4 inline" /></button>
                                <button onClick={() => handlePermanentDeleteDiscount(d)} disabled={discountsSaving} className="text-muted hover:text-danger p-1 rounded hover:bg-danger-soft" title="Delete permanently"><Trash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'applogs' && <AppLogsPanel />}

        {/* Fallback for other tabs */}
        {!['general', 'hardware', 'sections', 'taxrates', 'receipt', 'users', 'branches', 'applogs', 'discounts', 'categories', 'variants', 'units', 'brands', 'suppliers'].includes(activeTab) && (
           <div className="text-muted">Settings panel for {activeTab} coming soon.</div>
        )}

      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// App Logs Panel
// ────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  info:  'text-blue-700 bg-blue-50 border-blue-200',
  warn:  'text-amber-700 bg-amber-50 border-amber-200',
  error: 'text-red-700 bg-red-50 border-red-200',
};

const LEVEL_DOT: Record<string, string> = {
  info:  'bg-blue-500',
  warn:  'bg-amber-500',
  error: 'bg-red-500',
};

function AppLogsPanel() {
  const sanitize = (list: LogEntry[]) => list.filter(e => e && e.id != null && e.level && e.message);
  const [entries, setEntries] = useState<LogEntry[]>(() => sanitize(appLogger.getEntries()));

  useEffect(() => {
    const sync = () => setEntries(sanitize(appLogger.getEntries()));
    return appLogger.subscribe(sync);
  }, []);

  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.level === filter);
  const displayed = filtered.slice(-200).reverse();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appLogger.exportText());
      setCopyFeedback('Copied!');
    } catch {
      setCopyFeedback('Failed');
    }
    setTimeout(() => setCopyFeedback(''), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([appLogger.exportText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    appLogger.clear();
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-muted" />
            App Logs
          </h3>
          <p className="text-sm text-muted mt-1">{entries.length} entries captured this session</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted bg-surface border border-border rounded-lg hover:bg-canvas-subtle transition-colors">
            <Copy className="w-3.5 h-3.5" />
            {copyFeedback || 'Copy All'}
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted bg-surface border border-border rounded-lg hover:bg-canvas-subtle transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-surface border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 mb-4">
        {(['all', 'info', 'warn', 'error'] as const).map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              filter === level
                ? 'bg-neutral-800 text-white border-neutral-800'
                : 'bg-surface text-muted border-border hover:bg-canvas-subtle'
            }`}
          >
            {level === 'all' ? `All (${entries.length})` : `${level.charAt(0).toUpperCase() + level.slice(1)} (${entries.filter(e => e.level === level).length})`}
          </button>
        ))}
      </div>

      {/* Log list */}
      <div className="bg-canvas-subtle border border-border rounded-xl overflow-hidden">
        {displayed.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <ScrollText className="w-10 h-10 mx-auto mb-3 stroke-1" />
            <p className="font-medium">No logs yet</p>
            <p className="text-xs mt-1">Events will appear here as the app runs.</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto scroll-smooth">
            {displayed.map(entry => (
              <LogRow key={entry.id} entry={entry} expanded={expandedId === entry.id} onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)} formatTime={formatTime} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function LogRow({ entry, expanded, onToggle, formatTime }: { entry: LogEntry; expanded: boolean; onToggle: () => void; formatTime: (s: string) => string }) {
  const level = (entry.level && LEVEL_DOT[entry.level]) ? entry.level : 'info';
  const hasData = entry.data !== undefined && entry.data !== null;
  return (
    <div className="group">
      <button onClick={onToggle} className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-surface/60 transition-colors">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${LEVEL_DOT[level] || LEVEL_DOT.info}`} />
        <span className="text-[11px] font-mono text-muted shrink-0 mt-0.5 w-16">{formatTime(entry.timestamp)}</span>
        <span className={`text-[11px] font-bold uppercase shrink-0 mt-0.5 px-1.5 py-0.5 rounded border ${LEVEL_STYLES[level] || LEVEL_STYLES.info}`}>{level}</span>
        <span className="text-xs font-semibold text-muted shrink-0 mt-0.5">[{entry.source || 'app'}]</span>
        <span className="text-xs text-foreground-secondary flex-1 mt-0.5 truncate">{entry.message}</span>
        {hasData && (
          expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0 mt-0.5" />
        )}
      </button>
      {expanded && hasData && (
        <pre className="mx-4 mb-3 p-3 bg-neutral-950 text-green-400 rounded-lg text-[11px] font-mono overflow-auto max-h-40">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
