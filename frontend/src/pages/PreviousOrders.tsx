import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Printer, Copy, RotateCcw, Banknote, X, Loader2, Calendar, History,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchInput from '../components/ui/SearchInput';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { get, post, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import { useCheckoutStore } from '../stores/checkoutStore';

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground-secondary">{label}</label>
      {children}
    </div>
  );
}

type SaleRow = {
  id: number;
  invoice_number?: string;
  receipt_number?: string;
  invoice_uuid?: string;
  created_at?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_id?: number | null;
  cashier_name?: string | null;
  items_count?: number;
  quantity_count?: number;
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount: number;
  payment_method?: string;
  status?: string;
  notes?: string;
};

type SaleItem = {
  id: number;
  product_title: string;
  variant?: string;
  quantity: number;
  quantity_returned?: number;
  quantity_returnable?: number;
  unit_price: number;
  subtotal: number;
  product_id?: number;
  sku_id?: number | null;
};

type SaleDetail = SaleRow & {
  items: SaleItem[];
  returns?: { id: number; return_number: string; refund_amount: number; created_at?: string }[];
  cash_received?: number | null;
};

const QUICK_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
  { key: 'all', label: 'All Time' },
] as const;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'accent'> = {
  completed: 'success',
  partially_returned: 'warning',
  refunded: 'danger',
  held: 'default',
};

function statusLabel(s?: string) {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function PreviousOrders() {
  const navigate = useNavigate();
  const setCart = useCheckoutStore(s => s.setCart);
  const setSelectedCustomer = useCheckoutStore(s => s.setSelectedCustomer);
  const setPaymentMethod = useCheckoutStore(s => s.setPaymentMethod);
  const clearSale = useCheckoutStore(s => s.clearSale);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [q, setQ] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cashier, setCashier] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [debouncedFilters, setDebouncedFilters] = useState({
    q: '', invoiceNumber: '', receiptNumber: '', customerName: '', customerPhone: '', cashier: '',
  });

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedFilters(prev => {
        const next = {
          q: q.trim(),
          invoiceNumber: invoiceNumber.trim(),
          receiptNumber: receiptNumber.trim(),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          cashier: cashier.trim(),
        };
        const changed = Object.keys(next).some(k => prev[k as keyof typeof prev] !== next[k as keyof typeof next]);
        if (changed) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, invoiceNumber, receiptNumber, customerName, customerPhone, cashier]);

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('time_filter', timeFilter);
      params.set('page', String(page));
      params.set('per_page', '40');
      if (timeFilter === 'custom') {
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
      }
      if (debouncedFilters.q) params.set('q', debouncedFilters.q);
      if (debouncedFilters.invoiceNumber) params.set('invoice_number', debouncedFilters.invoiceNumber);
      if (debouncedFilters.receiptNumber) params.set('receipt_number', debouncedFilters.receiptNumber);
      if (debouncedFilters.customerName) params.set('customer_name', debouncedFilters.customerName);
      if (debouncedFilters.customerPhone) params.set('customer_phone', debouncedFilters.customerPhone);
      if (debouncedFilters.cashier) params.set('cashier', debouncedFilters.cashier);
      if (paymentMethodFilter) params.set('payment_method', paymentMethodFilter);
      if (status) params.set('status', status);

      const data = await get<{ sales?: SaleRow[]; pagination?: { pages: number; total: number } }>(
        `/sales/?${params}`,
      );
      if (reqId !== requestIdRef.current) return;
      setSales(data?.sales ?? []);
      setPages(data?.pagination?.pages ?? 1);
      setTotal(data?.pagination?.total ?? 0);
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      showToast(getUserMessage(e), 'error');
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [timeFilter, startDate, endDate, debouncedFilters, paymentMethodFilter, status, page]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (saleId: number) => {
    setDetailLoading(true);
    try {
      const d = await get<SaleDetail>(`/sales/${saleId}`);
      setDetail(d ?? null);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrint = async (saleId: number) => {
    setActionBusy('print');
    try {
      const res = await post<{ print_success?: boolean; message?: string }>(`/sales/${saleId}/print`, {});
      showToast(res?.print_success ? 'Receipt sent to printer' : (res?.message || 'Print attempted'), res?.print_success ? 'success' : 'info');
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDuplicate = async (saleId: number) => {
    setActionBusy('duplicate');
    try {
      const d = await get<SaleDetail>(`/sales/${saleId}`);
      if (!d?.items?.length) {
        showToast('No items to duplicate', 'error');
        return;
      }
      clearSale();
      setCart(d.items.map((item, i) => ({
        uniqueId: `dup-${saleId}-${item.id}-${i}`,
        product_id: item.product_id || 0,
        sku_id: item.sku_id || undefined,
        variant: item.variant || undefined,
        title: item.variant ? `${item.product_title} (${item.variant})` : item.product_title,
        price: item.unit_price,
        original_price: item.unit_price,
        cost_price: 0,
        quantity: Math.max(1, item.quantity || 1),
      })).filter(x => x.product_id && x.quantity > 0));
      if (d.customer_id && d.customer_name) {
        setSelectedCustomer({ id: d.customer_id, name: d.customer_name, phone: d.customer_phone || undefined });
      }
      if (d.payment_method === 'Cash' || d.payment_method === 'Card') {
        setPaymentMethod(d.payment_method);
      }
      showToast('Sale loaded into New Sale', 'success');
      navigate('/checkout');
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const openReturn = (d: SaleDetail) => {
    const qtys: Record<number, number> = {};
    d.items.forEach(i => {
      const max = i.quantity_returnable ?? (i.quantity - (i.quantity_returned || 0));
      if (max > 0) qtys[i.id] = 0;
    });
    setReturnQtys(qtys);
    setReturnOpen(true);
  };

  const submitReturn = async (fullRefund = false) => {
    if (!detail) return;
    setActionBusy(fullRefund ? 'refund' : 'return');
    try {
      if (fullRefund) {
        const ok = await showConfirm({
          title: 'Full Refund',
          message: `Refund all remaining items on ${detail.invoice_number || detail.id}? Inventory will be restored.`,
          confirmLabel: 'Refund',
          variant: 'danger',
        });
        if (!ok) return;
        await post(`/sales/${detail.id}/refund`, { reason: 'Full refund from Previous Orders' });
        showToast('Refund processed', 'success');
      } else {
        const items = Object.entries(returnQtys)
          .filter(([, qty]) => qty > 0)
          .map(([id, quantity]) => ({ sale_item_id: Number(id), quantity }));
        if (!items.length) {
          showToast('Select at least one item quantity to return', 'error');
          return;
        }
        await post(`/sales/${detail.id}/return`, { items, reason: 'Return from Previous Orders' });
        showToast('Return processed', 'success');
      }
      setReturnOpen(false);
      await openDetail(detail.id);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Previous Orders"
        description="Search sales history, reprint receipts, and process returns"
      />

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setTimeFilter(f.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              timeFilter === f.key
                ? 'bg-accent-600 text-white border-accent-600'
                : 'bg-surface border-border text-muted hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search filters */}
      <div className="surface-card p-4 mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <FieldShell label="Search">
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search all…" className="w-full" />
          </FieldShell>
          <Input label="Invoice No" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-000123" />
          <Input label="Receipt No" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="RCPT-…" />
          <Input label="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
          <Input label="Customer Phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
          <Input label="Cashier" value={cashier} onChange={e => setCashier(e.target.value)} />
          <FieldShell label="Payment Method">
            <select
              value={paymentMethodFilter}
              onChange={e => { setPaymentMethodFilter(e.target.value); setPage(1); }}
              className="input-base w-full"
            >
              <option value="">All</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
            </select>
          </FieldShell>
          <FieldShell label="Order Status">
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="input-base w-full"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="partially_returned">Partially Returned</option>
              <option value="refunded">Refunded</option>
            </select>
          </FieldShell>
        </div>
        {timeFilter === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <Input type="date" label="From" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input type="date" label="To" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <Button size="sm" variant="secondary" onClick={() => load()}>
              <Calendar className="w-3.5 h-3.5" /> Apply
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 text-sm text-muted">
        <span>{total} order{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span>Page {page} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      <DataTable
        loading={loading}
        data={sales as unknown as Record<string, unknown>[]}
        emptyMessage="No orders found for these filters"
        onRowClick={r => openDetail(Number(r.id))}
        columns={[
          { key: 'invoice_number', header: 'Invoice No', render: r => <span className="font-mono text-xs">{String(r.invoice_number || r.id)}</span> },
          {
            key: 'created_at', header: 'Date & Time',
            render: r => r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—',
          },
          {
            key: 'customer_name', header: 'Customer',
            render: r => (
              <div>
                <div>{String(r.customer_name || 'Walk-in')}</div>
                {r.customer_phone ? <div className="text-xs text-muted">{String(r.customer_phone)}</div> : null}
              </div>
            ),
          },
          { key: 'cashier_name', header: 'Cashier', render: r => String(r.cashier_name || '—') },
          { key: 'items_count', header: 'Items', render: r => String(r.quantity_count ?? r.items_count ?? 0) },
          { key: 'subtotal_amount', header: 'Total', render: r => formatCurrency(Number(r.subtotal_amount || 0)) },
          { key: 'discount_amount', header: 'Discount', render: r => formatCurrency(Number(r.discount_amount || 0)) },
          { key: 'tax_amount', header: 'Tax', render: r => formatCurrency(Number(r.tax_amount || 0)) },
          { key: 'total_amount', header: 'Grand Total', render: r => <span className="font-semibold">{formatCurrency(Number(r.total_amount || 0))}</span> },
          { key: 'payment_method', header: 'Payment', render: r => String(r.payment_method || '—') },
          {
            key: 'status', header: 'Status',
            render: r => (
              <Badge variant={STATUS_VARIANT[String(r.status)] || 'default'}>
                {statusLabel(String(r.status))}
              </Badge>
            ),
          },
        ]}
        actions={r => {
          const sale = r as unknown as SaleRow;
          return (
            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
              <button type="button" title="View" className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" onClick={() => openDetail(sale.id)}>
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button type="button" title="Print Receipt" className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" onClick={() => handlePrint(sale.id)}>
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button type="button" title="Duplicate Sale" className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" onClick={() => handleDuplicate(sale.id)}>
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }}
      />

      {/* Order details drawer */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setDetail(null); setReturnOpen(false); }} />
          <div className="relative w-full max-w-xl bg-surface border-l border-border h-full overflow-y-auto shadow-premium">
            <div className="sticky top-0 z-10 bg-surface border-b border-border px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {detail?.invoice_number || (detailLoading ? 'Loading…' : 'Order')}
                </h2>
                {detail?.receipt_number && (
                  <p className="text-xs text-muted font-mono mt-0.5">{detail.receipt_number}</p>
                )}
              </div>
              <button type="button" onClick={() => { setDetail(null); setReturnOpen(false); }} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading && !detail ? (
              <div className="flex justify-center py-20 text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : detail ? (
              <div className="p-5 space-y-6">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted">Date & Time</p>
                    <p>{detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Status</p>
                    <Badge variant={STATUS_VARIANT[detail.status || ''] || 'default'}>{statusLabel(detail.status)}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Customer</p>
                    <p>{detail.customer_name || 'Walk-in'}</p>
                    {detail.customer_phone && <p className="text-xs text-muted">{detail.customer_phone}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted">Cashier</p>
                    <p>{detail.cashier_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Payment</p>
                    <p>{detail.payment_method || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Notes</p>
                    <p>{detail.notes || '—'}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Items</h3>
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {detail.items.map(item => (
                      <div key={item.id} className="px-3 py-2.5 flex justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium">{item.product_title}{item.variant ? ` (${item.variant})` : ''}</p>
                          <p className="text-xs text-muted">
                            Qty {item.quantity}
                            {(item.quantity_returned || 0) > 0 && ` · Returned ${item.quantity_returned}`}
                            {' · '}{formatCurrency(item.unit_price)} each
                          </p>
                        </div>
                        <p className="font-medium shrink-0">{formatCurrency(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-canvas-subtle border border-border p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{formatCurrency(detail.subtotal_amount || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Discount</span><span>{formatCurrency(detail.discount_amount || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Tax</span><span>{formatCurrency(detail.tax_amount || 0)}</span></div>
                  <div className="flex justify-between font-semibold text-base pt-1 border-t border-border">
                    <span>Grand Total</span><span>{formatCurrency(detail.total_amount)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button key="reprint" size="sm" onClick={() => handlePrint(detail.id)} disabled={actionBusy === 'print'}>
                    <Printer className="w-3.5 h-3.5" /> Reprint Receipt
                  </Button>
                  <Button key="duplicate" size="sm" variant="secondary" onClick={() => handleDuplicate(detail.id)}>
                    <Copy className="w-3.5 h-3.5" /> Duplicate Sale
                  </Button>
                  {detail.status !== 'refunded' ? (
                    <Button key="return" size="sm" variant="secondary" onClick={() => openReturn(detail)}>
                      <RotateCcw className="w-3.5 h-3.5" /> Return Items
                    </Button>
                  ) : null}
                  {detail.status !== 'refunded' ? (
                    <Button key="refund" size="sm" variant="danger" onClick={() => submitReturn(true)} disabled={!!actionBusy}>
                      <Banknote className="w-3.5 h-3.5" /> Refund
                    </Button>
                  ) : null}
                </div>

                {returnOpen && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Select items to return</h3>
                    {detail.items.filter(i => (i.quantity_returnable ?? i.quantity - (i.quantity_returned || 0)) > 0).length === 0 ? (
                      <EmptyState icon={History} title="Nothing returnable" description="All items on this order have already been returned." />
                    ) : (
                      detail.items
                        .filter(item => (item.quantity_returnable ?? item.quantity - (item.quantity_returned || 0)) > 0)
                        .map(item => {
                          const max = item.quantity_returnable ?? (item.quantity - (item.quantity_returned || 0));
                          return (
                            <div key={`return-item-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{item.product_title}</p>
                                <p className="text-xs text-muted">Max {max}</p>
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={max}
                                value={returnQtys[item.id] ?? 0}
                                onChange={e => {
                                  const v = Math.min(max, Math.max(0, parseInt(e.target.value, 10) || 0));
                                  setReturnQtys(prev => ({ ...prev, [item.id]: v }));
                                }}
                                className="w-20 rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm"
                              />
                            </div>
                          );
                        })
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => submitReturn(false)} disabled={actionBusy === 'return'}>
                        {actionBusy === 'return' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        Confirm Return
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReturnOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
