import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Truck, Plus, Edit2, Trash2, BookOpen, Cloud, RefreshCw,
  CheckCircle, XCircle, Clock, Loader2, X, Printer, FileDown,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { get, post, put, del, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';

type Supplier = {
  id: number;
  name: string;
  supplier_code?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  ntn?: string;
  strn?: string;
  payment_terms?: string;
  credit_limit?: number;
  opening_balance?: number;
  outstanding_balance?: number;
  current_balance?: number;
  bank_name?: string;
  bank_account?: string;
  iban?: string;
  notes?: string;
  status?: string;
  total_purchases?: number;
  total_payments?: number;
  balance_due?: number;
};

type LedgerEntry = {
  id: number;
  entry_type: string;
  amount: number;
  balance_after: number;
  reference_number?: string;
  payment_method?: string;
  notes?: string;
  created_at?: string;
};

type SyncEvent = { id: number; event_type: string; invoice_uuid?: string; created_at?: string; status?: string; attempts?: number };

const emptyForm = {
  name: '',
  supplier_code: '',
  contact_name: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
};

const LEDGER_TABS = [
  { key: 'all', label: 'All Transactions' },
  { key: 'purchases', label: 'Purchases Only' },
  { key: 'payments', label: 'Payments Only' },
  { key: 'returns', label: 'Returns' },
] as const;

const DATE_TABS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'custom', label: 'Custom' },
] as const;

export default function SupplyChain() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; failed: number; synced: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState({ total_purchased: 0, total_paid: 0, balance_due: 0 });
  const [ledgerTab, setLedgerTab] = useState('all');
  const [dateTab, setDateTab] = useState('last_3_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const todayStr = () => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  };
  const emptyTxnForm = {
    type: 'purchase' as 'purchase' | 'payment',
    date: todayStr(),
    amount: '',
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  };
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState(emptyTxnForm);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, sync] = await Promise.all([
        get<{ suppliers?: Supplier[] }>('/v1/suppliers/'),
        get<{ pending: number; failed: number; synced: number; recent_pending?: SyncEvent[] }>('/v1/sync/outbox'),
      ]);
      setSuppliers(s?.suppliers ?? []);
      setSyncStatus(sync);
      setSyncEvents(sync?.recent_pending ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      supplier_code: s.supplier_code || '',
      contact_name: s.contact_name || '',
      phone: s.phone || '',
      whatsapp: s.whatsapp || '',
      email: s.email || '',
      address: s.address || '',
      city: s.city || '',
    });
    setModalOpen(true);
  };

  const payloadFromForm = () => ({
    name: form.name.trim(),
    supplier_code: form.supplier_code.trim() || undefined,
    contact_name: form.contact_name.trim() || null,
    phone: form.phone.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
  });

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Company name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await put(`/v1/suppliers/${editing.id}`, payloadFromForm());
        showToast('Supplier updated', 'success');
      } else {
        await post('/v1/suppliers/', payloadFromForm());
        showToast('Supplier created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    const ok = await showConfirm({
      title: 'Delete Supplier',
      message: `Permanently delete "${s.name}"?`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await del(`/v1/suppliers/${s.id}`);
      showToast('Supplier deleted', 'success');
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const loadLedger = async (supplierId: number, type = ledgerTab, timeFilter = dateTab) => {
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ type, time_filter: timeFilter });
      if (timeFilter === 'custom') {
        if (customFrom) params.set('start_date', customFrom);
        if (customTo) params.set('end_date', customTo);
      }
      const data = await get<{
        supplier?: Supplier;
        entries?: LedgerEntry[];
        summary?: { total_purchased: number; total_paid: number; balance_due: number };
      }>(`/v1/suppliers/${supplierId}/ledger?${params}`);
      if (data?.supplier) setLedgerSupplier(data.supplier);
      setLedgerEntries(data?.entries ?? []);
      setLedgerSummary(data?.summary ?? { total_purchased: 0, total_paid: 0, balance_due: 0 });
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  const openLedger = async (s: Supplier) => {
    setLedgerSupplier(s);
    setLedgerTab('all');
    setDateTab('last_3_months');
    await loadLedger(s.id, 'all', 'last_3_months');
  };

  const flushSync = async () => {
    setSyncing(true);
    try {
      await post('/v1/sync/flush', {});
      showToast('Sync queue flushed', 'success');
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const openTxnModal = () => {
    setPayForm({ ...emptyTxnForm, date: todayStr() });
    setPayOpen(true);
  };

  const submitTransaction = async () => {
    if (!ledgerSupplier) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    setPaying(true);
    try {
      const body = {
        amount,
        date: payForm.date || undefined,
        reference_number: payForm.reference_number.trim() || undefined,
        notes: payForm.notes.trim() || undefined,
      };
      if (payForm.type === 'payment') {
        await post(`/v1/suppliers/${ledgerSupplier.id}/payments`, {
          ...body,
          payment_method: payForm.payment_method,
        });
        showToast('Payment recorded', 'success');
      } else {
        await post(`/v1/suppliers/${ledgerSupplier.id}/purchases`, body);
        showToast('Purchase recorded', 'success');
      }
      setPayOpen(false);
      setPayForm({ ...emptyTxnForm, date: todayStr() });
      await loadLedger(ledgerSupplier.id);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setPaying(false);
    }
  };

  const printLedger = () => {
    if (!ledgerSupplier) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = ledgerEntries.map(e => `
      <tr>
        <td>${e.created_at ? new Date(e.created_at).toLocaleString() : ''}</td>
        <td>${e.entry_type}</td>
        <td>${e.reference_number || ''}</td>
        <td>${e.payment_method || ''}</td>
        <td style="text-align:right">${Number(e.amount).toFixed(2)}</td>
        <td style="text-align:right">${Number(e.balance_after).toFixed(2)}</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Ledger — ${ledgerSupplier.name}</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:12px}th{background:#f5f5f5}</style>
      </head><body>
      <h1>${ledgerSupplier.name}</h1>
      <p>${ledgerSupplier.supplier_code || ''} · Balance due: ${formatCurrency(ledgerSummary.balance_due)}</p>
      <p>Purchased: ${formatCurrency(ledgerSummary.total_purchased)} · Paid: ${formatCurrency(ledgerSummary.total_paid)}</p>
      <table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Method</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const statusIcon = (status: string) => {
    if (status === 'synced') return <CheckCircle className="w-4 h-4 text-success" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-danger" />;
    return <Clock className="w-4 h-4 text-warning" />;
  };

  const setF = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Supply Chain"
        description="Supplier directory, ledger, and cloud sync"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add supplier</Button>}
      />

      {/* Cloud Sync Monitor */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Cloud className="w-4 h-4 text-accent-600" /> Cloud Sync Monitor</h3>
          <Button size="sm" variant="secondary" onClick={flushSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Retry Failed
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <StatCard label="Pending" value={syncStatus?.pending ?? 0} icon={Clock} trend="Awaiting sync" />
          <StatCard label="Synced" value={syncStatus?.synced ?? 0} icon={CheckCircle} trend="Successfully synced" />
          <StatCard label="Failed" value={syncStatus?.failed ?? 0} icon={XCircle} trend="Needs attention" />
        </div>
        {syncEvents.length > 0 && (
          <div className="surface-card p-4 space-y-2 mb-6">
            {syncEvents.slice(0, 10).map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-border text-sm">
                <div className="flex items-center gap-2">
                  {statusIcon(e.status || 'pending')}
                  <span className="font-medium capitalize">{e.event_type.replace('_', ' ')}</span>
                  <Badge variant="warning">pending</Badge>
                </div>
                <div className="text-xs text-muted">
                  {(e.attempts ?? 0) > 0 && `${e.attempts} attempts · `}
                  {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supplier Directory */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-xl"><Truck className="w-5 h-5" /> Supplier Directory</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers yet" description="Add your first supplier to track purchases and payments." action={{ label: 'Add supplier', onClick: openCreate }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map(s => {
            const balance = s.current_balance ?? s.outstanding_balance ?? 0;
            const isActive = (s.status || 'active') === 'active';
            return (
              <div key={s.id} className="surface-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground truncate">{s.name}</h4>
                    <p className="text-xs text-muted font-mono">{s.supplier_code || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(s)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <p>{s.contact_name || '—'}</p>
                  <p className="text-muted">Phone: <span className="text-foreground">{s.phone || '—'}</span></p>
                  <p className="text-muted">Balance: <span className={balance > 0 ? 'text-warning font-medium' : 'text-success font-medium'}>{formatCurrency(balance)}</span></p>
                </div>
                <Button variant="secondary" className="w-full mt-auto" onClick={() => openLedger(s)}>
                  <BookOpen className="w-4 h-4" /> Supplier Ledger
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit supplier' : 'Add supplier'}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Company Name *" required value={form.name} onChange={setF('name')} placeholder="e.g. Sysco Foods" />
          <Input
            label="Supplier Code"
            hint="Auto-generated for new suppliers. You can still edit it."
            value={form.supplier_code}
            onChange={setF('supplier_code')}
            placeholder="Auto-generated from supplier name"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Person" value={form.contact_name} onChange={setF('contact_name')} placeholder="e.g. John Doe" />
            <Input label="Phone" value={form.phone} onChange={setF('phone')} placeholder="555-0192" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="WhatsApp (optional)" value={form.whatsapp} onChange={setF('whatsapp')} />
            <Input label="Email" type="email" value={form.email} onChange={setF('email')} placeholder="orders@sysco.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Address</label>
            <textarea value={form.address} onChange={setF('address')} rows={2} placeholder="123 Industrial Pkwy" className="input-base w-full resize-none" />
          </div>
          <Input label="City" value={form.city} onChange={setF('city')} />
        </div>
      </Modal>

      {/* Supplier Ledger Drawer */}
      {ledgerSupplier && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLedgerSupplier(null)} />
          <div className="relative w-full max-w-3xl bg-surface border-l border-border h-full overflow-y-auto shadow-premium">
            <div className="sticky top-0 z-10 bg-surface border-b border-border px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{ledgerSupplier.name}</h2>
                <p className="text-xs text-muted mt-0.5 truncate">
                  {[ledgerSupplier.supplier_code, ledgerSupplier.contact_name, ledgerSupplier.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" onClick={() => setLedgerSupplier(null)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-canvas-subtle p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Total Billed</p>
                  <p className="text-lg font-semibold mt-1">{formatCurrency(ledgerSummary.total_purchased)}</p>
                </div>
                <div className="rounded-xl border border-border bg-emerald-500/10 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Total Paid</p>
                  <p className="text-lg font-semibold mt-1 text-success">{formatCurrency(ledgerSummary.total_paid)}</p>
                </div>
                <div className="rounded-xl border border-border bg-accent-500/10 p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Balance Due</p>
                  <p className={`text-lg font-semibold mt-1 ${ledgerSummary.balance_due > 0 ? 'text-warning' : 'text-success'}`}>
                    {formatCurrency(ledgerSummary.balance_due)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap gap-2">
                  {LEDGER_TABS.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setLedgerTab(t.key); loadLedger(ledgerSupplier.id, t.key, dateTab); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                        ledgerTab === t.key ? 'bg-accent-600 text-white border-accent-600' : 'border-border text-muted'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={printLedger}><Printer className="w-3.5 h-3.5" /> Print Ledger</Button>
                  <Button size="sm" variant="secondary" onClick={printLedger}><FileDown className="w-3.5 h-3.5" /> Export PDF</Button>
                  <Button size="sm" onClick={openTxnModal}><Plus className="w-3.5 h-3.5" /> Add Transaction</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-b border-border pb-2">
                {DATE_TABS.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setDateTab(t.key); if (t.key !== 'custom') loadLedger(ledgerSupplier.id, ledgerTab, t.key); }}
                    className={`text-sm pb-1 border-b-2 ${dateTab === t.key ? 'border-accent-600 text-accent-600 font-medium' : 'border-transparent text-muted'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {dateTab === 'custom' && (
                <div className="flex flex-wrap gap-3 items-end">
                  <Input type="date" label="From" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                  <Input type="date" label="To" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                  <Button size="sm" onClick={() => loadLedger(ledgerSupplier.id, ledgerTab, 'custom')}>Apply</Button>
                </div>
              )}

              {ledgerLoading ? (
                <div className="flex justify-center py-12 text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : ledgerEntries.length === 0 ? (
                <EmptyState icon={BookOpen} title="No transactions yet" description="Add your first entry." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {ledgerEntries.map(e => (
                    <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium capitalize">{e.entry_type}{e.reference_number ? ` · ${e.reference_number}` : ''}</p>
                        <p className="text-xs text-muted">
                          {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                          {e.payment_method ? ` · ${e.payment_method.replace('_', ' ')}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${e.amount < 0 ? 'text-success' : ''}`}>
                          {e.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(e.amount))}
                        </p>
                        <p className="text-xs text-muted">Bal {formatCurrency(e.balance_after)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add transaction modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Add transaction"
        footer={
          <div className="flex w-full justify-between gap-3">
            <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={submitTransaction} disabled={paying}>{paying ? 'Saving…' : 'Save'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-border bg-canvas-subtle">
              {([
                { key: 'purchase' as const, label: 'Purchase (Invoice)' },
                { key: 'payment' as const, label: 'Payment Made' },
              ]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPayForm(f => ({ ...f, type: opt.key }))}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    payForm.type === opt.key
                      ? 'bg-surface text-accent-600 border border-accent-600 shadow-sm'
                      : 'text-muted hover:text-foreground border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              type="date"
              value={payForm.date}
              onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))}
            />
            <Input
              label="Reference / Invoice Number"
              value={payForm.reference_number}
              onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))}
              placeholder="INV-001"
            />
          </div>

          {payForm.type === 'payment' ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount in PKR"
                type="number"
                min="0"
                step="0.01"
                value={payForm.amount}
                onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="15000"
              />
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Payment Method</label>
                <select
                  value={payForm.payment_method}
                  onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="input-base w-full"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online Transfer</option>
                </select>
              </div>
            </div>
          ) : (
            <Input
              label="Amount in PKR"
              type="number"
              min="0"
              step="0.01"
              value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="15000"
            />
          )}

          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Description / Notes</label>
            <textarea
              value={payForm.notes}
              onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Chicken supply, monthly settlement, or cheque details"
              className="input-base w-full resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
