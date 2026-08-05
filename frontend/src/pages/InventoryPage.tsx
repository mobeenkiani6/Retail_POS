import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Package, Loader2, History, AlertTriangle,
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
import {
  buildAdjustUnitChoices,
  formatCurrentStock,
  quantityToStockDelta,
  type CatalogUnit,
} from '../utils/stockUnits';
import { getBranchId } from '../branch';
import { useInventoryStore } from '../stores/inventoryStore';

type Product = {
  id: number; name: string; category_name?: string; brand?: string;
  stock_level?: number; skus?: ProductSku[];
  unit?: string; carton_qty?: number; carton_unit?: string;
  packet_qty?: number; packet_unit?: string;
};

type SkuRow = ProductSku & {
  product_id: number; product_name: string; category_name?: string; brand?: string;
  carton_qty?: number; carton_unit?: string; packet_qty?: number; packet_unit?: string;
  product_unit?: string;
};

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
  siblings,
  packaging,
  onAdjust,
  onClose,
}: {
  row: SkuRow;
  siblings: SkuRow[];
  packaging?: {
    carton_qty?: number; carton_unit?: string;
    packet_qty?: number; packet_unit?: string;
    unit?: string;
  } | null;
  onAdjust: (delta: number, reason?: string, notes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const savedStock = row.stock_level ?? 0;
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [unitKey, setUnitKey] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogUnits, setCatalogUnits] = useState<CatalogUnit[]>([]);

  useEffect(() => {
    get<{ units?: CatalogUnit[] }>('/v1/units/')
      .then(d => setCatalogUnits(d?.units ?? []))
      .catch(() => setCatalogUnits([]));
  }, []);

  const unitChoices = useMemo(
    () => buildAdjustUnitChoices(row, siblings, catalogUnits, packaging),
    [row, siblings, catalogUnits, packaging],
  );

  useEffect(() => {
    if (!unitChoices.length) return;
    setUnitKey(prev => (unitChoices.some(c => c.key === prev) ? prev : unitChoices[0].key));
  }, [unitChoices]);

  const selectedUnit = unitChoices.find(c => c.key === unitKey) ?? unitChoices[0];
  const currentLabel = formatCurrentStock(savedStock, row.quantity_value, row.unit_abbr);

  const submit = async () => {
    if (busy || !selectedUnit) return;
    const qty = parseFloat(quantity);
    const { delta, error } = quantityToStockDelta(qty, selectedUnit);
    if (error || delta <= 0) {
      showToast(error || 'Enter a valid quantity', 'error');
      return;
    }
    const signed = mode === 'add' ? delta : -delta;
    if (mode === 'remove' && delta > savedStock) {
      showToast(`Only ${savedStock} in stock`, 'error');
      return;
    }
    setBusy(true);
    try {
      await onAdjust(
        signed,
        mode === 'add' ? 'stock_in' : 'stock_out',
        note.trim() || undefined,
      );
      onClose();
    } catch {
      /* toast handled by parent */
    } finally {
      setBusy(false);
    }
  };

  const modeBtn = (value: 'add' | 'remove', label: string) => {
    const active = mode === value;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setMode(value)}
        className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
          active
            ? 'border-accent-500 bg-accent-600/15 text-foreground'
            : 'border-border bg-canvas-subtle text-muted hover:text-foreground hover:border-border'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-base tracking-wide uppercase text-foreground">
          {row.product_name}
        </p>
        <p className="text-sm text-muted mt-1">
          Current:{' '}
          <span className="text-foreground font-medium">{currentLabel}</span>
          {' '}at this branch. Movements appear in stock reports.
        </p>
        {(row.variant_name || formatSkuLabel(row)) && (
          <p className="text-xs text-muted mt-1">
            {row.variant_name && row.variant_name !== 'Standard' ? `${row.variant_name} · ` : ''}
            {formatSkuLabel(row)}
            {row.barcode ? ` · ${row.barcode}` : ''}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        {modeBtn('add', 'Add')}
        {modeBtn('remove', 'Remove')}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <div className="space-y-1.5">
          <label htmlFor="adjust-qty" className="block text-sm font-medium text-muted">Quantity</label>
          <input
            id="adjust-qty"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            disabled={busy}
            onChange={e => setQuantity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. 2.5"
            className="input-base"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="adjust-unit" className="block text-sm font-medium text-muted">Unit</label>
          <select
            id="adjust-unit"
            value={selectedUnit?.key ?? ''}
            disabled={busy || !unitChoices.length}
            onChange={e => setUnitKey(e.target.value)}
            className="input-base appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            }}
          >
            {unitChoices.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="adjust-note" className="block text-sm font-medium text-muted">Note (optional)</label>
        <input
          id="adjust-note"
          type="text"
          value={note}
          disabled={busy}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. Stock take correction, spoilage"
          className="input-base"
        />
      </div>

      <p className="text-xs text-muted">
        Purchases with updated cost should use{' '}
        <Link to="/grn" className="text-foreground font-medium hover:text-accent-600 underline-offset-2 hover:underline">
          Restock
        </Link>
        {' '}instead.
      </p>

      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || !quantity} onClick={submit}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Update stock
        </Button>
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
      carton_qty: p.carton_qty,
      carton_unit: p.carton_unit,
      packet_qty: p.packet_qty,
      packet_unit: p.packet_unit,
      product_unit: p.unit,
    })),
  );

  const stockModal = stockModalSkuId != null
    ? skuRows.find(s => s.id === stockModalSkuId) ?? null
    : null;

  const openStockModal = (row: SkuRow) => {
    if (row.id != null) setStockModal(row.id, row.product_id);
  };

  const adjustStock = async (
    skuId: number,
    productId: number,
    delta: number,
    reason = 'adjustment',
    notes?: string,
  ) => {
    await post('/inventory/adjust', {
      sku_id: skuId,
      product_id: productId,
      quantity_delta: delta,
      branch_id: branchId,
      reason,
      notes: notes || undefined,
    });
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

  const filtered = skuRows.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.product_name.toLowerCase().includes(q)
      || (s.variant_name || '').toLowerCase().includes(q)
      || s.barcode.includes(search)
      || s.sku_code.toLowerCase().includes(q)
      || formatSkuLabel(s).toLowerCase().includes(q);
  });

  const stockColumns = [
    { key: 'product_name', header: 'Product', render: (s: SkuRow) => (
      <div className="min-w-[140px]">
        <p className="font-medium text-sm">{s.product_name}</p>
        <p className="text-xs text-foreground font-medium">{s.variant_name || '—'}</p>
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

      <Modal open={stockModalSkuId != null} onClose={() => setStockModal(null)} title="Adjust stock" size="md">
        {stockModal?.id != null && (
          <AdjustStockContent
            key={stockModal.id}
            row={stockModal}
            siblings={skuRows.filter(s => s.product_id === stockModal.product_id)}
            packaging={{
              carton_qty: stockModal.carton_qty,
              carton_unit: stockModal.carton_unit,
              packet_qty: stockModal.packet_qty,
              packet_unit: stockModal.packet_unit,
              unit: stockModal.product_unit || stockModal.unit_abbr,
            }}
            onClose={() => setStockModal(null)}
            onAdjust={async (delta, reason, notes) => {
              try {
                await adjustStock(stockModal.id!, stockModal.product_id, delta, reason, notes);
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
