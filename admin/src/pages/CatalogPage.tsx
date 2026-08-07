import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import { useBranchFilter } from '../stores/branch';
import { useProductsStore, type ProductSku } from '../stores/products';
import { TableSearch, SortableTh, useTableSort, fullLabel } from '../components/TableTools';
import { useRefreshOnEvents } from '../hooks/useEvents';

function money(n?: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);
}

function formatSkuLabel(s: ProductSku) {
  const qty = Number(s.quantity_value ?? 1);
  const unit = (s.unit_abbr || '').trim();
  if (unit && !['ea', 'each', 'pc', 'piece'].includes(unit.toLowerCase())) {
    return `${Number.isInteger(qty) ? qty : qty} ${unit}`;
  }
  return s.variant_name || String(qty);
}

function priceRange(skus: ProductSku[]) {
  if (!skus.length) return '—';
  const prices = skus.map((s) => Number(s.selling_price || 0));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

export function CatalogPage() {
  const { selectedBranchId } = useBranchFilter();
  const { products, loading, load, invalidate } = useProductsStore();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    invalidate();
    void load(true);
  }, [selectedBranchId, load, invalidate]);

  useRefreshOnEvents(() => {
    invalidate();
    void load(true);
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.brand || '').toLowerCase().includes(term) ||
        (p.skus || []).some(
          (s) =>
            (s.barcode || '').toLowerCase().includes(term) ||
            (s.sku_code || '').toLowerCase().includes(term) ||
            (s.variant_name || '').toLowerCase().includes(term),
        ),
    );
  }, [products, q]);

  const withSort = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        sku_count: (p.skus || []).length,
        stock_total: Number(p.stock_level || 0) || (p.skus || []).reduce((a, s) => a + Number(s.stock_level || 0), 0),
      })),
    [filtered],
  );
  const { sorted, sortKey, sortDir, toggle: toggleSort } = useTableSort(withSort, 'name');

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Catalog</h1>
          <p className="text-sm text-muted mt-1">
            View-only product catalog with {fullLabel('SKU')} variants
          </p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search products, barcodes…" />
      </div>

      {loading ? (
        <div className="skeleton h-48" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-canvas-subtle">
              <tr>
                <th className="px-4 py-3 w-8" />
                <SortableTh label="Product" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Category" sortKey="category_name" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <SortableTh label={fullLabel('SKUs')} sortKey="sku_count" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Price range</th>
                <SortableTh label="Total stock" sortKey="stock_total" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const skus = p.skus || [];
                const open = expanded.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-border hover:bg-canvas-subtle/40">
                      <td className="px-4 py-3">
                        {skus.length > 0 && (
                          <button type="button" className="btn-ghost p-1" onClick={() => toggle(p.id)}>
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package size={16} className="text-accent-500 shrink-0" />
                          <div>
                            <div className="font-medium">{p.name}</div>
                            {p.brand && <div className="text-xs text-muted">{p.brand}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.category_name || '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{skus.length}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{priceRange(skus)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.stock_level ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${p.archived_at ? 'text-muted' : 'text-success'}`}>
                          {p.archived_at ? 'Archived' : 'Active'}
                        </span>
                      </td>
                    </tr>
                    {open &&
                      skus.map((sku) => (
                        <tr key={`${p.id}-${sku.id}`} className="border-t border-border/60 bg-canvas-subtle/30">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pl-3 sm:pl-8">
                              <div>
                                <div className="section-label">Variant</div>
                                <div className="font-medium mt-0.5">{sku.variant_name || '—'}</div>
                              </div>
                              <div>
                                <div className="section-label">Pack size</div>
                                <div className="font-medium mt-0.5">{formatSkuLabel(sku)}</div>
                              </div>
                              <div>
                                <div className="section-label">Barcode</div>
                                <div className="font-mono text-xs mt-0.5">{sku.barcode || '—'}</div>
                              </div>
                              <div>
                                <div className="section-label">Purchase</div>
                                <div className="mt-0.5 tabular-nums">{money(sku.cost_price)}</div>
                              </div>
                              <div>
                                <div className="section-label">Sale</div>
                                <div className="mt-0.5 font-medium text-accent-600 tabular-nums">{money(sku.selling_price)}</div>
                              </div>
                              <div>
                                <div className="section-label">Stock</div>
                                <div className="mt-0.5 font-semibold tabular-nums">{sku.stock_level ?? 0}</div>
                              </div>
                              <div>
                                <div className="section-label">{fullLabel('SKU')} code</div>
                                <div className="font-mono text-xs mt-0.5">{sku.sku_code || '—'}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="p-10 text-center text-muted text-sm">No products</div>}
        </div>
      )}
    </div>
  );
}

export function CatalogDetailPage({ id }: { id: string }) {
  const { selectedBranchId } = useBranchFilter();
  const { products, load } = useProductsStore();

  useEffect(() => {
    void load();
  }, [id, selectedBranchId, load]);

  const product = products.find((p) => String(p.id) === String(id));
  if (!product) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      <a href="/catalog" className="text-sm text-accent-600">← Catalog</a>
      <h1 className="page-title">{product.name}</h1>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-canvas-subtle text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3 text-right">Purchase</th>
              <th className="px-4 py-3 text-right">Sale</th>
              <th className="px-4 py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {(product.skus || []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{s.variant_name || '—'}</td>
                <td className="px-4 py-3">{formatSkuLabel(s)}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.barcode || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(s.cost_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{money(s.selling_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{s.stock_level ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
