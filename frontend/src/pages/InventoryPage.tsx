import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Plus, Minus, Loader2, History, AlertTriangle,
  TrendingDown, DollarSign, Boxes, Pencil,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import SearchInput from '../components/ui/SearchInput';
import { get, post, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { useScanner } from '../hooks/useScanner';

import { formatSkuLabel, type ProductSku } from '../utils/productSkus';
import { getBranchId } from '../branch';
import { useInventoryStore } from '../stores/inventoryStore';

type Product = {
  id: number; name: string; category_name?: string; brand?: string;
  stock_level?: number; skus?: ProductSku[];
};

type SkuRow = ProductSku & { product_id: number; product_name: string; category_name?: string; brand?: string };

type Movement = {
  id: number; product_name?: string; variant?: string; delta: number; reason: string;
  reason_label?: string; notes?: string; created_at?: string;
};

type Summary = {
  total_skus: number; total_units: number; total_value: number;
  low_stock_count: number; out_of_stock_count: number;
  low_stock: { product_id: number; sku_id?: number; name: string; display_label?: string; stock_level: number; min_stock: number }[];
};

function AdjustStockContent({
  row,
  onAdjust,
}: {
  row: SkuRow;
  onAdjust: (delta: number, reason?: string) => Promise<void>;
}) {
  const savedStock = row.stock_level ?? 0;
  const [draftStock, setDraftStock] = useState(savedStock);
  const [inputVal, setInputVal] = useState(String(savedStock));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftStock(savedStock);
    setInputVal(String(savedStock));
  }, [row.id, savedStock]);

  const delta = draftStock - savedStock;

  const applyDelta = async (change: number, reason = 'adjustment') => {
    if (change === 0 || busy) return;
    const next = Math.max(0, savedStock + change);
    const actualChange = next - savedStock;
    if (actualChange === 0) return;

    setDraftStock(next);
    setInputVal(String(next));
    setBusy(true);
    try {
      await onAdjust(actualChange, reason);
    } catch {
      setDraftStock(savedStock);
      setInputVal(String(savedStock));
    } finally {
      setBusy(false);
    }
  };

  const syncInput = (raw: string) => {
    setInputVal(raw);
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) setDraftStock(n);
  };

  const commitInput = async () => {
    const n = parseInt(inputVal, 10);
    if (!Number.isFinite(n) || n < 0) {
      setInputVal(String(savedStock));
      setDraftStock(savedStock);
      return;
    }
    setDraftStock(n);
    const change = n - savedStock;
    if (change !== 0) await applyDelta(change);
    else setInputVal(String(savedStock));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-canvas-subtle p-4 space-y-1">
        <p className="font-semibold text-sm">{row.product_name}</p>
        <p className="text-sm text-accent-600">{formatSkuLabel(row)}</p>
        <p className="text-xs text-muted font-mono">Barcode: {row.barcode}</p>
        <div className="flex gap-4 pt-2 text-sm">
          <span>Purchase: <strong>{formatCurrency(row.cost_price)}</strong></span>
          <span>Sale: <strong className="text-accent-600">{formatCurrency(row.selling_price)}</strong></span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">On hand</span>
          <span className="font-semibold tabular-nums">{savedStock}</span>
        </div>
        {delta !== 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{delta > 0 ? 'Adding' : 'Removing'}</span>
            <span className={`font-semibold tabular-nums ${delta > 0 ? 'text-success' : 'text-danger'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
          <span className="font-medium">{delta !== 0 ? 'New total' : 'Quantity'}</span>
          <span className="font-bold text-lg tabular-nums text-accent-600">{draftStock}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="secondary" disabled={busy || savedStock <= 0} onClick={() => applyDelta(-1)}>
          <Minus className="w-4 h-4" />
        </Button>
        <input
          type="number"
          min={0}
          value={inputVal}
          disabled={busy}
          onChange={e => syncInput(e.target.value)}
          onBlur={commitInput}
          onKeyDown={e => e.key === 'Enter' && commitInput()}
          className="w-20 text-center input-base py-2 text-base font-semibold tabular-nums"
        />
        <Button variant="secondary" disabled={busy} onClick={() => applyDelta(1)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[5, 10, 25, 50].map(n => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => applyDelta(n, 'stock_in')}
            className="py-2 rounded-lg border border-border text-sm font-medium hover:bg-canvas-subtle disabled:opacity-50"
          >
            +{n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { lastScannedBarcode, clearBarcode } = useScanner();
  const branchId = getBranchId();

  const { tab, search, stockModalSkuId, setTab, setSearch, setStockModal } = useInventoryStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, , sumRes] = await Promise.all([
        get<{ products?: Product[] }>(`/products/?branch_id=${branchId}`),
        get(`/inventory/?branch_id=${branchId}`),
        get<Summary>(`/inventory/summary?branch_id=${branchId}`),
      ]);
      const prods = prodRes?.products ?? [];
      setProducts(prods);
      setSummary(sumRes);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const fetchMovements = useCallback(async () => {
    try {
      const res = await get<{ movements?: Movement[] }>(`/inventory/movements?branch_id=${branchId}&time_filter=week`);
      setMovements(res?.movements ?? []);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  }, [branchId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'history') fetchMovements(); }, [tab, fetchMovements]);

  const skuRows: SkuRow[] = products.flatMap(p =>
    (p.skus && p.skus.length > 0 ? p.skus : []).map(s => ({
      ...s,
      product_id: p.id,
      product_name: p.name,
      category_name: p.category_name,
      brand: p.brand,
    })),
  );

  const stockModal = stockModalSkuId != null
    ? skuRows.find(s => s.id === stockModalSkuId) ?? null
    : null;

  const openStockModal = (row: SkuRow) => {
    if (row.id != null) setStockModal(row.id, row.product_id);
  };

  const adjustStock = async (skuId: number, productId: number, delta: number, reason = 'adjustment') => {
    await post('/inventory/adjust', { sku_id: skuId, product_id: productId, quantity_delta: delta, branch_id: branchId, reason });
    showToast('Stock updated', 'success');
    fetchData();
  };

  useEffect(() => {
    if (!lastScannedBarcode) return;
    const row = skuRows.find(s => s.barcode === lastScannedBarcode || s.sku_code === lastScannedBarcode);
    if (row) openStockModal(row);
    else showToast('SKU not found for scan', 'error');
    clearBarcode();
  }, [lastScannedBarcode, clearBarcode]);

  const filtered = skuRows.filter(s =>
    !search || s.product_name.toLowerCase().includes(search.toLowerCase()) ||
    s.barcode.includes(search) || s.sku_code.toLowerCase().includes(search.toLowerCase())
  );

  const stockColumns = [
    { key: 'product_name', header: 'Product', render: (s: SkuRow) => (
      <div className="min-w-[140px]">
        <p className="font-medium text-sm">{s.product_name}</p>
        <p className="text-xs text-accent-600 font-medium">{formatSkuLabel(s)}</p>
      </div>
    )},
    { key: 'barcode', header: 'Barcode', render: (s: SkuRow) => <span className="font-mono text-xs whitespace-nowrap">{s.barcode}</span> },
    { key: 'category', header: 'Category', render: (s: SkuRow) => <span className="text-sm text-muted">{s.category_name || '—'}</span> },
    { key: 'cost_price', header: 'Purchase', sortValue: (s: SkuRow) => s.cost_price, render: (s: SkuRow) => (
      <span className="text-sm tabular-nums">{formatCurrency(s.cost_price)}</span>
    )},
    { key: 'selling_price', header: 'Sale Price', sortValue: (s: SkuRow) => s.selling_price, render: (s: SkuRow) => (
      <span className="text-sm font-medium text-accent-600 tabular-nums">{formatCurrency(s.selling_price)}</span>
    )},
    { key: 'stock', header: 'On Hand', sortValue: (s: SkuRow) => s.stock_level ?? 0, render: (s: SkuRow) => {
      const qty = s.stock_level ?? 0;
      const low = (s.min_stock || 0) > 0 && qty > 0 && qty <= (s.min_stock || 0);
      const out = qty === 0;
      return (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm tabular-nums min-w-[2ch]">{qty}</span>
          {out && <Badge variant="danger">Out</Badge>}
          {low && !out && <Badge variant="warning">Low</Badge>}
        </div>
      );
    }},
    { key: 'value', header: 'Stock Value', sortValue: (s: SkuRow) => (s.stock_level ?? 0) * s.cost_price, render: (s: SkuRow) => (
      <span className="text-sm tabular-nums">{formatCurrency((s.stock_level ?? 0) * s.cost_price)}</span>
    )},
    { key: 'actions', header: '', sortable: false, render: (s: SkuRow) => (
      <button type="button" onClick={() => openStockModal(s)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted hover:text-foreground" title="Adjust stock"><Pencil className="w-4 h-4" /></button>
    )},
  ];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Inventory"
        description="Stock levels, adjustments, and history"
        actions={<Button onClick={fetchData} variant="secondary" size="sm">Refresh</Button>}
      />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total SKUs" value={String(summary.total_skus)} icon={Package} />
          <StatCard label="Total Units" value={String(summary.total_units)} icon={Boxes} />
          <StatCard label="Stock Value" value={formatCurrency(summary.total_value)} icon={DollarSign} />
          <StatCard label="Low Stock" value={String(summary.low_stock_count)} icon={TrendingDown} />
        </div>
      )}

      <div className="flex gap-1 mb-4 p-1 bg-canvas-subtle rounded-xl w-fit border border-border">
        {(['stock', 'history', 'alerts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-surface shadow-soft text-foreground' : 'text-muted hover:text-foreground'}`}>
            {t === 'stock' ? 'Stock' : t === 'history' ? 'History' : 'Alerts'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <SearchInput
            wrapperClassName="mb-4 max-w-md"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
          />
          {loading ? (
            <div className="flex justify-center py-20 text-muted gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Package} title="No products" description="Add products in the Products module first." />
          ) : (
            <DataTable
              columns={stockColumns}
              data={filtered}
              keyField={(row) => row.id ?? `${row.product_id}-${row.sku_code}`}
            />
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {movements.length === 0 ? (
            <EmptyState icon={History} title="No movements" description="Stock changes will appear here." />
          ) : (
            <div className="divide-y divide-border">
              {movements.map(m => (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {m.product_name || 'Product'}
                      {m.variant ? <span className="text-muted"> ({m.variant})</span> : null}
                    </p>
                    <p className="text-xs text-muted">{m.reason_label || m.reason}{m.notes ? ` — ${m.notes}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${m.delta >= 0 ? 'text-success' : 'text-danger'}`}>{m.delta >= 0 ? '+' : ''}{m.delta}</p>
                    <p className="text-[10px] text-muted">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && summary && (
        <div className="space-y-4">
          {summary.low_stock.length === 0 && summary.out_of_stock_count === 0 ? (
            <EmptyState icon={AlertTriangle} title="All good" description="No low stock or out-of-stock alerts." />
          ) : (
            <>
              {summary.low_stock.map(p => (
                <motion.div
                  key={p.sku_id ?? `${p.product_id}-${p.display_label ?? p.name}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-xl border border-warning/30 bg-warning-soft"
                >
                  <div>
                    <p className="font-medium text-sm">{p.display_label ? `${p.name} — ${p.display_label}` : p.name}</p>
                    <p className="text-xs text-muted">Min: {p.min_stock}</p>
                  </div>
                  <Badge variant="warning">{p.stock_level} left</Badge>
                </motion.div>
              ))}
            </>
          )}
        </div>
      )}

      <Modal open={stockModalSkuId != null} onClose={() => setStockModal(null)} title="Adjust Stock" size="md">
        {stockModal?.id != null && (
          <AdjustStockContent
            key={stockModal.id}
            row={stockModal}
            onAdjust={async (delta, reason) => {
              try {
                await adjustStock(stockModal.id!, stockModal.product_id, delta, reason);
              } catch (e) {
                showToast(getUserMessage(e), 'error');
                throw e;
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}
