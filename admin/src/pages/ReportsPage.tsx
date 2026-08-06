import { useEffect } from 'react';
import {
  Download, Eye, FileSpreadsheet, FileText, Loader2, RefreshCw, Table2,
} from 'lucide-react';
import { useBranchFilter } from '../stores/branch';
import { useReportsStore } from '../stores/reports';
import { fullLabel } from '../components/TableTools';

const REPORT_TYPES = [
  { id: 'sales', label: 'Sales', desc: 'Invoices, payments, tax, and cost of goods sold' },
  { id: 'products', label: 'Products', desc: 'Catalog items with prices and status' },
  { id: 'customers', label: 'Customers', desc: 'Customer list with loyalty and store credit' },
  { id: 'suppliers', label: 'Suppliers', desc: 'Vendors with city and payables' },
  { id: 'expenses', label: 'Expenses', desc: 'Expense ledger for the selected period' },
  { id: 'inventory', label: 'Inventory', desc: 'On-hand stock by product and branch' },
  { id: 'employees', label: 'Employees', desc: 'Staff accounts and last login' },
] as const;

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
] as const;

const PAYMENT_FILTERS = [
  { id: 'all', label: 'All payments' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Card', label: 'Card' },
] as const;

const FORMATS = [
  { id: 'csv', label: 'CSV', icon: FileText },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF', icon: FileText },
] as const;

function headerLabel(h: string) {
  const map: Record<string, string> = {
    cogs: fullLabel('COGS'),
    sku: fullLabel('SKU'),
    sku_id: `${fullLabel('SKU')} ID`,
    ltv: fullLabel('LTV'),
    aov: fullLabel('AOV'),
    invoice: 'Invoice No',
    payment_method: 'Payment',
    created_at: 'Date / Time',
    expense_date: 'Expense date',
    last_login_at: 'Last login',
    outstanding_balance: 'Outstanding balance',
    stock_level: 'Stock on hand',
    base_price: 'Base price',
    cost_price: 'Cost price',
    loyalty_points: 'Loyalty points',
    store_credit: 'Store credit',
    product_name: 'Product',
    branch_id: 'Branch',
  };
  return map[h] || h.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(n?: number) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export function ReportsPage() {
  const { selectedBranchId } = useBranchFilter();
  const {
    type,
    period,
    dateFrom,
    dateTo,
    paymentMethod,
    format,
    summary,
    preview,
    loadingPreview,
    exporting,
    error,
    setType,
    setPeriod,
    setDateFrom,
    setDateTo,
    setPaymentMethod,
    setFormat,
    loadSummary,
    loadPreview,
    exportReport,
  } = useReportsStore();

  const showPaymentFilter = type === 'sales' || type === 'expenses';
  const customReady = period !== 'custom' || (Boolean(dateFrom) && Boolean(dateTo));

  useEffect(() => {
    if (!customReady) return;
    void loadSummary();
  }, [loadSummary, period, dateFrom, dateTo, paymentMethod, selectedBranchId, customReady]);

  useEffect(() => {
    if (!customReady) return;
    void loadPreview();
  }, [loadPreview, type, period, dateFrom, dateTo, paymentMethod, selectedBranchId, customReady]);

  const selectedType = REPORT_TYPES.find((t) => t.id === type);
  const rowCount = preview?.total_rows ?? 0;
  const canExport = rowCount > 0 && !exporting && !loadingPreview && customReady;

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-7rem)]">
      <div className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Reports</h1>
            <p className="text-sm text-muted mt-1">Preview data, then export when it looks right</p>
          </div>
          {summary && (
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ['Revenue', money(summary.revenue)],
                [fullLabel('COGS'), money(summary.cost_of_goods_sold ?? summary.cogs)],
                ['Gross', money(summary.gross_profit)],
                ['Net', money(summary.net_profit)],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-surface px-3 py-1.5">
                  <span className="text-muted">{label}</span>
                  <span className="ml-2 font-semibold tabular-nums">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-2">
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
            {REPORT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  type === t.id
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-foreground-secondary hover:bg-canvas-subtle hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="px-2 pt-2 text-xs text-muted border-t border-border mt-2">
            {selectedType?.desc}
          </p>
        </div>

        <div className="panel px-3 py-2.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Period</span>
            <div className="flex rounded-lg border border-border overflow-hidden flex-wrap">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    period === p.id
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface text-foreground-secondary hover:bg-canvas-subtle'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="input h-8 text-xs px-2 py-0 w-[9.5rem]"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  className="input h-8 text-xs px-2 py-0 w-[9.5rem]"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            )}
          </div>

          {showPaymentFilter && (
            <>
              <div className="h-6 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Payment</span>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {PAYMENT_FILTERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaymentMethod(p.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        paymentMethod === p.id
                          ? 'bg-accent-600 text-white'
                          : 'bg-surface text-foreground-secondary hover:bg-canvas-subtle'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Format</span>
            <div className="flex gap-1">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                      format === f.id
                        ? 'border-accent-600 bg-accent-600/10 text-accent-600 dark:text-accent-400'
                        : 'border-border text-foreground-secondary hover:bg-canvas-subtle'
                    }`}
                  >
                    <Icon size={13} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1" />

          {error && <span className="text-xs text-danger">{error}</span>}

          <button
            type="button"
            className="btn-ghost h-9 text-xs gap-1.5"
            onClick={() => void loadPreview()}
            disabled={loadingPreview || !customReady}
          >
            <RefreshCw size={14} className={loadingPreview ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="btn-primary h-9 gap-1.5"
            disabled={!canExport}
            onClick={() => void exportReport()}
            title={rowCount === 0 ? 'Nothing to export for this selection' : `Export ${rowCount} rows`}
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export {format.toUpperCase()}
            {rowCount > 0 && (
              <span className="opacity-80 font-normal">({rowCount})</span>
            )}
          </button>
        </div>
      </div>

      <div className="panel flex-1 flex flex-col min-h-[360px] overflow-hidden">
        <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 bg-canvas-subtle/60">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={15} className="text-accent-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Preview — {selectedType?.label}
                {showPaymentFilter && paymentMethod !== 'all' ? ` · ${paymentMethod}` : ''}
              </div>
              <div className="text-[11px] text-muted">
                {loadingPreview
                  ? 'Loading preview…'
                  : preview
                    ? `Showing ${preview.preview_rows} of ${preview.total_rows.toLocaleString()} rows · full file on export`
                    : 'No preview'}
              </div>
            </div>
          </div>
          {preview && preview.total_rows > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted shrink-0">
              <Table2 size={12} />
              {preview.headers.length} columns
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {loadingPreview ? (
            <div className="h-full min-h-[280px] flex items-center justify-center gap-2 text-muted text-sm">
              <Loader2 size={18} className="animate-spin" /> Building preview…
            </div>
          ) : preview && preview.rows.length ? (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-surface sticky top-0 z-10 shadow-[0_1px_0_var(--color-border)]">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted w-10">#</th>
                  {preview.headers.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted whitespace-nowrap"
                    >
                      {headerLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border hover:bg-canvas-subtle/50">
                    <td className="px-3 py-2 text-xs text-muted tabular-nums">{i + 1}</td>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-3 py-2 whitespace-nowrap tabular-nums text-foreground-secondary ${
                          preview.headers[j] === 'invoice' ? 'font-medium text-foreground' : ''
                        }`}
                      >
                        {cell == null || cell === '' ? '—' : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-2 text-sm text-muted px-6 text-center">
              <Table2 size={28} className="opacity-40 mb-1" />
              <p className="font-medium text-foreground-secondary">No rows for this selection</p>
              <p className="text-xs max-w-sm">
                Try another report type, period, or payment filter. Export stays disabled until preview has data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
