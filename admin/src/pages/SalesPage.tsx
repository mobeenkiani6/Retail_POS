import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranchFilter } from '../stores/branch';
import { useSalesStore, type SalePeriod } from '../stores/sales';
import { TableSearch, SortableTh, useTableSort } from '../components/TableTools';

type SaleItem = {
  id: number;
  product_title?: string;
  variant?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  quantity_returned?: number;
};

function money(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n));
}

export function SalesPage() {
  const { selectedBranchId } = useBranchFilter();
  const {
    sales,
    period,
    startDate,
    endDate,
    loading,
    setPeriod,
    setCustomRange,
    load,
  } = useSalesStore();
  const [q, setQ] = useState('');

  useEffect(() => {
    void load();
  }, [period, startDate, endDate, selectedBranchId, load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sales;
    return sales.filter(
      (s) =>
        String(s.invoice_number || s.id).toLowerCase().includes(t) ||
        (s.status || '').toLowerCase().includes(t) ||
        (s.payment_method || '').toLowerCase().includes(t),
    );
  }, [sales, q]);

  const withSort = useMemo(
    () =>
      filtered.map((s) => ({
        ...s,
        invoice_sort: s.invoice_number || String(s.id),
        created_sort: s.created_at ? new Date(s.created_at).getTime() : 0,
      })),
    [filtered],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(withSort, 'created_sort', 'desc');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="text-sm text-muted mt-1">Order explorer — refunds stay on POS</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search invoices…" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {([
          ['today', 'Today'],
          ['week', 'This week'],
          ['month', 'Monthly'],
          ['custom', 'Custom'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors h-10 ${
              period === key
                ? 'bg-accent-600 text-white border-accent-600'
                : 'border-border text-foreground-secondary hover:bg-canvas-subtle'
            }`}
            onClick={() => setPeriod(key as SalePeriod)}
          >
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input
              type="date"
              className="input h-10 w-auto"
              value={startDate}
              onChange={(e) => setCustomRange(e.target.value, endDate)}
            />
            <span className="text-muted text-sm">to</span>
            <input
              type="date"
              className="input h-10 w-auto"
              value={endDate}
              onChange={(e) => setCustomRange(startDate, e.target.value)}
            />
          </>
        )}
      </div>

      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="skeleton h-40 m-4" />
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-canvas-subtle">
              <tr>
                <SortableTh label="Invoice" sortKey="invoice_sort" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                <SortableTh label="Payment" sortKey="payment_method" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                <SortableTh label="Total" sortKey="total_amount" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortableTh label="When" sortKey="created_sort" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-canvas-subtle/40">
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:text-accent-600" to={`/sales/${s.id}`}>
                      {s.invoice_number || `#${s.id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{s.status}</td>
                  <td className="px-4 py-3">{s.payment_method}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{money(s.total_amount)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !sorted.length && <div className="p-8 text-center text-muted text-sm">No sales for this period</div>}
      </div>
    </div>
  );
}

export function SaleDetailPage({ id }: { id: string }) {
  const { detail: sale, detailLoading, error, loadDetail } = useSalesStore();

  useEffect(() => {
    void loadDetail(id);
  }, [id, loadDetail]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/sales" className="text-sm text-accent-600">← Sales</Link>
        <div className="panel p-6 text-sm text-danger">{error}</div>
      </div>
    );
  }

  if (detailLoading || !sale) return <div className="skeleton h-48" />;

  const s = (sale.sale || sale) as Record<string, unknown>;
  const items = (Array.isArray(s.items) ? s.items : []) as SaleItem[];
  const returns = (Array.isArray(s.returns) ? s.returns : []) as Record<string, unknown>[];

  return (
    <div className="space-y-5">
      <Link to="/sales" className="text-sm text-accent-600">← Sales</Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{String(s.invoice_number || `Sale #${id}`)}</h1>
          <p className="text-sm text-muted mt-1">
            {s.created_at ? new Date(String(s.created_at)).toLocaleString() : '—'}
            {s.receipt_number ? ` · Receipt ${String(s.receipt_number)}` : ''}
          </p>
        </div>
        <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium capitalize">
          {String(s.status || '—')}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="panel p-4">
          <div className="section-label">Payment</div>
          <div className="mt-1 font-semibold">{String(s.payment_method || '—')}</div>
        </div>
        <div className="panel p-4">
          <div className="section-label">Cashier</div>
          <div className="mt-1 font-semibold">{String(s.cashier_name || '—')}</div>
        </div>
        <div className="panel p-4">
          <div className="section-label">Customer</div>
          <div className="mt-1 font-semibold">{String(s.customer_name || 'Walk-in')}</div>
          {s.customer_phone ? <div className="text-xs text-muted mt-0.5">{String(s.customer_phone)}</div> : null}
        </div>
        <div className="panel p-4">
          <div className="section-label">Date & time</div>
          <div className="mt-1 font-semibold text-sm">
            {s.created_at ? new Date(String(s.created_at)).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="px-4 py-3 border-b border-border section-label">Line items</div>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-canvas-subtle">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted">Product</th>
              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted">Qty</th>
              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted">Unit price</th>
              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{item.product_title || 'Item'}</div>
                  {item.variant ? <div className="text-xs text-muted">{item.variant}</div> : null}
                  {item.quantity_returned ? (
                    <div className="text-[11px] text-warning mt-0.5">Returned: {item.quantity_returned}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.quantity ?? 0}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(item.unit_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(item.subtotal)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No line items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel p-4 max-w-md ml-auto space-y-2 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-muted">Subtotal</span>
          <span className="tabular-nums">{money(Number(s.subtotal_amount))}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted">Discount</span>
          <span className="tabular-nums">{money(Number(s.discount_amount))}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted">Tax</span>
          <span className="tabular-nums">{money(Number(s.tax_amount))}</span>
        </div>
        <div className="flex justify-between gap-6 border-t border-border pt-2 font-semibold text-base">
          <span>Total</span>
          <span className="tabular-nums">{money(Number(s.total_amount))}</span>
        </div>
        {s.cash_received != null && (
          <div className="flex justify-between gap-6 text-muted">
            <span>Cash received</span>
            <span className="tabular-nums">{money(Number(s.cash_received))}</span>
          </div>
        )}
        {s.notes ? (
          <div className="pt-2 border-t border-border text-xs text-muted">
            Notes: {String(s.notes)}
          </div>
        ) : null}
      </div>

      {returns.length > 0 && (
        <div className="panel p-4">
          <div className="section-label mb-2">Returns</div>
          <ul className="space-y-2 text-sm">
            {returns.map((r) => (
              <li key={String(r.id)} className="flex justify-between gap-3 border-b border-border py-1.5">
                <span>
                  {String(r.return_number || r.id)}
                  {r.reason ? ` · ${String(r.reason)}` : ''}
                </span>
                <span className="tabular-nums">{money(Number(r.refund_amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
