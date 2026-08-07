import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBranchFilter } from '../stores/branch';
import { useProductsStore } from '../stores/products';
import { TableSearch, SortableTh, useTableSort, fullLabel } from '../components/TableTools';
import { useRefreshOnEvents } from '../hooks/useEvents';
import { get } from '../api/client';

function money(n?: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);
}

type ExpiryAlert = {
  batch_id: number;
  name: string;
  display_label?: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  days_left: number;
  warning_days: number;
  status: string;
};

export function InventoryPage() {
  const { selectedBranchId } = useBranchFilter();
  const { inventoryRows: rows, inventorySummary: summary, loading, load, invalidate } = useProductsStore();
  const [q, setQ] = useState('');
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlert[]>([]);

  const loadExpiry = useCallback(async () => {
    try {
      const qs = selectedBranchId ? `?branch_id=${selectedBranchId}` : '';
      const res = await get<{ alerts?: ExpiryAlert[] }>(`/v1/expiry/alerts${qs}`);
      setExpiryAlerts(res.alerts || []);
    } catch {
      setExpiryAlerts([]);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    invalidate();
    void load(true);
    void loadExpiry();
  }, [selectedBranchId, load, invalidate, loadExpiry]);

  useRefreshOnEvents(() => {
    invalidate();
    void load(true);
    void loadExpiry();
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(term) ||
        (r.variant_name || '').toLowerCase().includes(term) ||
        (r.barcode || '').toLowerCase().includes(term) ||
        (r.category_name || '').toLowerCase().includes(term),
    );
  }, [rows, q]);

  const withSort = useMemo(
    () =>
      filtered.map((r) => ({
        ...r,
        stock_value: r.stock_level * r.cost_price,
      })),
    [filtered],
  );
  const { sorted, sortKey, sortDir, toggle } = useTableSort(withSort, 'product_name');

  const low = filtered.filter((r) => (r.min_stock || 0) > 0 && r.stock_level > 0 && r.stock_level <= (r.min_stock || 0)).length;
  const out = filtered.filter((r) => r.stock_level === 0).length;
  const value = filtered.reduce((acc, r) => acc + r.stock_level * r.cost_price, 0);
  const units = filtered.reduce((acc, r) => acc + r.stock_level, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="text-sm text-muted mt-1">View-only stock by {fullLabel('SKU')} variant</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search stock…" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          [`Total ${fullLabel('SKUs')}`, filtered.length],
          ['Total units', units],
          ['Stock value', money(value)],
          ['Low / out', `${low} / ${out}`],
          ['Expiring / expired', expiryAlerts.length],
        ].map(([label, val]) => (
          <div key={String(label)} className="panel p-4">
            <div className="section-label">{label as string}</div>
            <div className="text-2xl font-bold mt-2 tabular-nums">{String(val)}</div>
          </div>
        ))}
      </div>

      {expiryAlerts.length > 0 && (
        <div className="panel p-4 space-y-3">
          <div className="section-label">Expiry alerts</div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {expiryAlerts.slice(0, 40).map((a) => {
              const expired = a.status === 'expired';
              return (
                <div
                  key={a.batch_id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                    expired ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {a.display_label ? `${a.name} — ${a.display_label}` : a.name}
                    </div>
                    <div className="text-xs text-muted">
                      Batch {a.batch_number} · {a.quantity} units · {a.expiry_date}
                      {expired ? ' · Expired' : ` · ${a.days_left}d left (warn ${a.warning_days}d)`}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-semibold ${expired ? 'text-danger' : 'text-warning'}`}>
                    {expired ? 'Expired' : `${a.days_left}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {summary && (
        <div className="text-xs text-muted">
          Branch summary · {fullLabel('SKUs')} {String(summary.total_skus ?? '—')} · Units {String(summary.total_units ?? '—')} · Value {String(summary.total_value ?? '—')}
        </div>
      )}

      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="skeleton h-48 m-4" />
        ) : (
          <>
            <table className="w-full text-sm min-w-[960px]">
              <thead className="bg-canvas-subtle">
                <tr>
                  <SortableTh label="Product" sortKey="product_name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Barcode" sortKey="barcode" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Category" sortKey="category_name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Purchase" sortKey="cost_price" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                  <SortableTh label="Sale price" sortKey="selling_price" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                  <SortableTh label="On hand" sortKey="stock_level" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                  <SortableTh label="Stock value" sortKey="stock_value" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 300).map((r) => {
                  const isOut = r.stock_level === 0;
                  const isLow = !isOut && (r.min_stock || 0) > 0 && r.stock_level <= (r.min_stock || 0);
                  return (
                    <tr key={`${r.product_id}-${r.sku_id}`} className="border-t border-border hover:bg-canvas-subtle/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.product_name}</div>
                        <div className="text-xs text-muted">
                          {r.variant_name || 'Standard'}
                          {r.pack_label ? ` · ${r.pack_label}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.barcode || '—'}</td>
                      <td className="px-4 py-3 text-muted">{r.category_name || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(r.cost_price)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.selling_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold tabular-nums ${isOut ? 'text-danger' : isLow ? 'text-warning' : ''}`}>
                          {r.stock_level}
                        </span>
                        {isOut && <span className="ml-2 text-[10px] uppercase text-danger">Out</span>}
                        {isLow && <span className="ml-2 text-[10px] uppercase text-warning">Low</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(r.stock_level * r.cost_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && <div className="p-10 text-center text-muted text-sm">No inventory rows</div>}
          </>
        )}
      </div>
    </div>
  );
}
