import { useEffect, useState, useMemo } from 'react';
import { Plus, CheckCircle, PackageCheck, Copy, Trash2, Edit2, Printer, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import EmptyState from '../components/ui/EmptyState';
import { get, post, put, del, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import { formatSkuLabel, type ProductSku } from '../utils/productSkus';
import { getBranchId } from '../branch';
import { useGrnStore, type GrnProductBlock, type GrnSkuLine } from '../stores/grnStore';

type GRNItem = {
  id?: number;
  product_id: number;
  sku_id?: number;
  product_name?: string;
  sku_label?: string;
  quantity: number;
  ordered_quantity?: number;
  received_quantity?: number;
  remaining_quantity?: number;
  receive_unit?: 'unit' | 'carton' | 'packet';
  cost_price: number;
  sell_price: number;
};

type GRN = {
  id: number;
  grn_number: string;
  supplier_id?: number;
  supplier_name?: string;
  status: string;
  category?: string;
  notes?: string;
  created_at?: string;
  ordered_quantity?: number;
  received_quantity?: number;
  remaining_quantity?: number;
  items: GRNItem[];
};

type PoCategory = 'active' | 'completed' | 'partial' | 'deleted';

const PO_CATEGORIES: { id: PoCategory; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'partial', label: 'Partial' },
  { id: 'completed', label: 'Completed' },
  { id: 'deleted', label: 'Deleted' },
];

function poCategory(g: GRN): PoCategory {
  if (g.category === 'active' || g.category === 'completed' || g.category === 'partial' || g.category === 'deleted') {
    return g.category;
  }
  if (g.status === 'draft') return 'active';
  if (g.status === 'received') return 'completed';
  if (g.status === 'partial') return 'partial';
  return 'deleted';
}

function isReceivable(g: GRN) {
  return g.status === 'draft' || g.status === 'partial';
}

type Product = {
  id: number;
  name: string;
  base_price?: number;
  cost_price?: number;
  carton_qty?: number;
  packet_qty?: number;
  unit?: string;
  skus?: ProductSku[];
};

type Supplier = { id: number; name: string };

function skusFromProduct(p: Product): GrnSkuLine[] {
  return (p.skus || []).map(s => ({
    sku_id: s.id!,
    label: s.display_label || formatSkuLabel(s),
    selected: false,
    quantity: 1,
    receive_unit: 'unit' as const,
    cost_price: s.cost_price ?? 0,
    sell_price: s.selling_price ?? 0,
  }));
}

function blocksFromItems(items: GRNItem[], products: Product[]): GrnProductBlock[] {
  const byProduct = new Map<number, GRNItem[]>();
  for (const item of items) {
    if (!item.product_id) continue;
    const list = byProduct.get(item.product_id) || [];
    list.push(item);
    byProduct.set(item.product_id, list);
  }
  return Array.from(byProduct.entries()).map(([productId, productItems]) => {
    const product = products.find(p => p.id === productId);
    const allSkus = product ? skusFromProduct(product) : [];
    const skus = allSkus.length > 0
      ? allSkus.map(s => {
          const match = productItems.find(i => i.sku_id === s.sku_id);
          return match
            ? {
              ...s,
              selected: true,
              quantity: match.quantity,
              receive_unit: match.receive_unit || 'unit',
              cost_price: match.cost_price,
              sell_price: match.sell_price,
            }
            : s;
        })
      : productItems.map(i => ({
          sku_id: i.sku_id || 0,
          label: i.sku_label || 'Standard',
          selected: true,
          quantity: i.quantity,
          receive_unit: (i.receive_unit || 'unit') as 'unit' | 'carton' | 'packet',
          cost_price: i.cost_price,
          sell_price: i.sell_price,
        }));
    return { product_id: productId, expanded: true, skus };
  });
}

function itemsFromBlocks(blocks: GrnProductBlock[]): GRNItem[] {
  const out: GRNItem[] = [];
  for (const block of blocks) {
    for (const sku of block.skus) {
      if (!sku.selected || sku.quantity <= 0) continue;
      out.push({
        product_id: block.product_id,
        sku_id: sku.sku_id || undefined,
        quantity: sku.quantity,
        receive_unit: sku.receive_unit || 'unit',
        cost_price: sku.cost_price,
        sell_price: sku.sell_price,
      });
    }
  }
  return out;
}

export default function GRNPage() {
  const [grns, setGrns] = useState<GRN[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<PoCategory>('active');
  const [partialGrn, setPartialGrn] = useState<GRN | null>(null);
  const [partialQty, setPartialQty] = useState<Record<number, string>>({});
  const [receiving, setReceiving] = useState(false);
  const [viewingGrn, setViewingGrn] = useState<GRN | null>(null);

  const {
    modalOpen,
    editing,
    supplierId,
    notes,
    blocks,
    pickerProductId,
    setSupplierId,
    setNotes,
    setBlocks,
    setPickerProductId,
    openCreate,
    openEdit: storeOpenEdit,
    closeModal,
    clearDraft,
  } = useGrnStore();

  const branchId = getBranchId();

  const load = async () => {
    setLoading(true);
    try {
      const [g, p, s] = await Promise.all([
        get<{ grns?: GRN[] }>(`/v1/grn/?branch_id=${branchId}`),
        get<{ products?: Product[] }>(`/products/?branch_id=${branchId}`),
        get<{ suppliers?: Supplier[] }>('/v1/suppliers/'),
      ]);
      setGrns(g?.grns ?? []);
      setProducts(p?.products ?? []);
      setSuppliers(s?.suppliers ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredGrns = useMemo(
    () => grns.filter(g => poCategory(g) === category),
    [grns, category],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<PoCategory, number> = { active: 0, completed: 0, partial: 0, deleted: 0 };
    for (const g of grns) counts[poCategory(g)] += 1;
    return counts;
  }, [grns]);

  const openEdit = (grn: GRN) => {
    storeOpenEdit(
      {
        id: grn.id,
        grn_number: grn.grn_number,
        supplier_id: grn.supplier_id,
        notes: grn.notes,
        status: grn.status,
      },
      blocksFromItems(grn.items, products),
    );
  };

  const addProductBlock = () => {
    const pid = parseInt(pickerProductId, 10);
    if (!pid) { showToast('Select a product first', 'error'); return; }
    if (blocks.some(b => b.product_id === pid)) {
      showToast('Product already added — expand it to select variants', 'info');
      return;
    }
    const product = products.find(p => p.id === pid);
    if (!product) return;
    const skus = skusFromProduct(product);
    if (!skus.length) {
      showToast('This product has no SKUs — add pack sizes in Products first', 'error');
      return;
    }
    setBlocks(prev => [...prev, { product_id: pid, expanded: true, skus }]);
    setPickerProductId('');
  };

  const removeBlock = (productId: number) => {
    setBlocks(prev => prev.filter(b => b.product_id !== productId));
  };

  const toggleBlock = (productId: number) => {
    setBlocks(prev => prev.map(b => b.product_id === productId ? { ...b, expanded: !b.expanded } : b));
  };

  const toggleSku = (productId: number, skuId: number) => {
    setBlocks(prev => prev.map(b => {
      if (b.product_id !== productId) return b;
      return {
        ...b,
        skus: b.skus.map(s => s.sku_id === skuId ? { ...s, selected: !s.selected } : s),
      };
    }));
  };

  const updateSkuField = (productId: number, skuId: number, field: keyof GrnSkuLine, value: string | number | boolean) => {
    setBlocks(prev => prev.map(b => {
      if (b.product_id !== productId) return b;
      return {
        ...b,
        skus: b.skus.map(s => s.sku_id === skuId ? { ...s, [field]: value } : s),
      };
    }));
  };

  const selectAllSkus = (productId: number, selected: boolean) => {
    setBlocks(prev => prev.map(b => {
      if (b.product_id !== productId) return b;
      return { ...b, skus: b.skus.map(s => ({ ...s, selected })) };
    }));
  };

  const lineTotal = itemsFromBlocks(blocks).reduce((s, i) => s + (i.quantity || 0) * (i.cost_price || 0), 0);
  const selectedCount = itemsFromBlocks(blocks).length;

  const handleSave = async () => {
    const validItems = itemsFromBlocks(blocks);
    if (!validItems.length) { showToast('Select at least one variant to receive', 'error'); return; }
    try {
      const payload = {
        branch_id: branchId,
        supplier_id: supplierId ? parseInt(supplierId, 10) : null,
        notes,
        items: validItems,
      };
      if (editing) {
        await put(`/v1/grn/${editing.id}`, payload);
        showToast('Purchase order updated', 'success');
      } else {
        await post('/v1/grn/', payload);
        showToast('Purchase order created', 'success');
      }
      clearDraft();
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const applyReceiveResult = async (
    id: number,
    body: { mode: 'complete' | 'partial'; items?: { id: number; quantity: number }[] },
  ) => {
    setReceiving(true);
    try {
      const res = await post<{
        message?: string;
        grn?: GRN;
        price_warnings?: { name: string; variant?: string; cost_price: number; sell_price: number }[];
      }>(`/v1/grn/${id}/receive`, body);
      const cat = res?.grn ? poCategory(res.grn) : 'completed';
      showToast(
        cat === 'completed' ? 'Stock fully received — inventory updated' : 'Partial stock received — inventory updated',
        'success',
      );
      const warnings = res?.price_warnings || [];
      for (const w of warnings) {
        const label = w.variant ? `${w.name} (${w.variant})` : w.name;
        showToast(
          `${label}: purchase ${formatCurrency(w.cost_price)} is above sale ${formatCurrency(w.sell_price)} — update sale price`,
          'error',
        );
      }
      if (editing?.id === id) clearDraft();
      setPartialGrn(null);
      setPartialQty({});
      if (cat === 'partial') setCategory('partial');
      else if (cat === 'completed') setCategory('completed');
      await load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setReceiving(false);
    }
  };

  const receiveComplete = async (g: GRN) => {
    const rem = g.remaining_quantity ?? g.items.reduce(
      (s, i) => s + (i.remaining_quantity ?? Math.max(0, i.quantity - (i.received_quantity || 0))),
      0,
    );
    const ok = await showConfirm({
      title: 'Complete Stock Received',
      message: `Receive all remaining stock (${rem} units) for ${g.grn_number}? Quantities will be added to inventory.`,
      confirmLabel: 'Receive all',
    });
    if (!ok) return;
    await applyReceiveResult(g.id, { mode: 'complete' });
  };

  const openPartialReceive = (g: GRN) => {
    const initial: Record<number, string> = {};
    for (const item of g.items) {
      if (item.id == null) continue;
      const rem = item.remaining_quantity ?? Math.max(0, item.quantity - (item.received_quantity || 0));
      if (rem > 0) initial[item.id] = '';
    }
    setPartialQty(initial);
    setPartialGrn(g);
  };

  const submitPartialReceive = async () => {
    if (!partialGrn) return;
    const items = Object.entries(partialQty)
      .map(([id, val]) => ({ id: parseInt(id, 10), quantity: parseInt(val, 10) || 0 }))
      .filter(i => i.quantity > 0);
    if (!items.length) {
      showToast('Enter at least one quantity to receive', 'error');
      return;
    }
    for (const row of items) {
      const line = partialGrn.items.find(i => i.id === row.id);
      const rem = line
        ? (line.remaining_quantity ?? Math.max(0, line.quantity - (line.received_quantity || 0)))
        : 0;
      if (row.quantity > rem) {
        showToast(`Cannot receive more than ${rem} remaining on a line`, 'error');
        return;
      }
    }
    await applyReceiveResult(partialGrn.id, { mode: 'partial', items });
  };

  const deleteGrn = async (id: number) => {
    const ok = await showConfirm({
      title: 'Delete Purchase Order',
      message: 'Move this purchase order to Deleted? Already received stock stays in inventory.',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await del(`/v1/grn/${id}`);
      showToast('Purchase order deleted', 'success');
      if (editing?.id === id) clearDraft();
      setCategory('deleted');
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const duplicateGrn = async (id: number) => {
    await post(`/v1/grn/${id}/duplicate`, {});
    showToast('Duplicated as a new active order', 'success');
    setCategory('active');
    load();
  };

  const printGrn = (g: GRN) => {
    const escape = (v: unknown) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const items = g.items || [];
    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const totalCost = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.cost_price) || 0), 0);
    const created = g.created_at ? new Date(g.created_at).toLocaleString() : '—';
    const statusLabel = (g.status || '—').replace(/_/g, ' ');

    const rows = items.length
      ? items.map((item, idx) => {
          const lineTotal = (Number(item.quantity) || 0) * (Number(item.cost_price) || 0);
          const name = item.product_name || products.find(p => p.id === item.product_id)?.name || `Product #${item.product_id}`;
          const variant = item.sku_label ? ` (${item.sku_label})` : '';
          return `<tr>
            <td>${idx + 1}</td>
            <td>${escape(name)}${escape(variant)}</td>
            <td style="text-align:right">${Number(item.quantity) || 0}</td>
            <td style="text-align:right">${formatCurrency(Number(item.cost_price) || 0)}</td>
            <td style="text-align:right">${formatCurrency(Number(item.sell_price) || 0)}</td>
            <td style="text-align:right">${formatCurrency(lineTotal)}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#666">No line items</td></tr>';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receiving ${escape(g.grn_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 28px; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #555; font-size: 13px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 20px 0; font-size: 13px; }
    .meta strong { display: inline-block; min-width: 90px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; font-size: 12px; vertical-align: top; }
    th { background: #f3f3f3; text-align: left; }
    .totals { margin-top: 16px; width: 280px; margin-left: auto; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { font-weight: 700; border-top: 1px solid #999; margin-top: 6px; padding-top: 8px; }
    .notes { margin-top: 18px; font-size: 13px; white-space: pre-wrap; }
    @media print {
      body { padding: 12mm; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <h1>Purchase Receiving</h1>
  <p class="muted">Nycto Retail · Goods Received Note</p>
  <div class="meta">
    <div><strong>Reference</strong> ${escape(g.grn_number)}</div>
    <div><strong>Status</strong> ${escape(statusLabel)}</div>
    <div><strong>Supplier</strong> ${escape(g.supplier_name || '—')}</div>
    <div><strong>Created</strong> ${escape(created)}</div>
  </div>
  ${g.notes ? `<div class="notes"><strong>Notes:</strong> ${escape(g.notes)}</div>` : ''}
  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Product / Variant</th>
        <th style="text-align:right;width:70px">Qty</th>
        <th style="text-align:right;width:100px">Cost</th>
        <th style="text-align:right;width:100px">Sell</th>
        <th style="text-align:right;width:110px">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Lines</span><span>${items.length}</span></div>
    <div><span>Total Qty</span><span>${totalQty}</span></div>
    <div class="grand"><span>Total Cost</span><span>${formatCurrency(totalCost)}</span></div>
  </div>
</body>
</html>`;

    // Hidden iframe print — avoids popup blockers / noopener blank windows
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', `Print ${g.grn_number}`);
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* ignore */ }
      }, 1000);
    };

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      cleanup();
      showToast('Print not available in this browser', 'error');
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        showToast('Could not open print dialog', 'error');
      } finally {
        cleanup();
      }
    };

    // Wait for document to be ready before printing
    if (doc.readyState === 'complete') {
      requestAnimationFrame(() => setTimeout(doPrint, 100));
    } else {
      iframe.onload = () => requestAnimationFrame(() => setTimeout(doPrint, 100));
    }
  };

  const viewingItems = viewingGrn?.items || [];
  const viewingOrdered = viewingGrn
    ? (viewingGrn.ordered_quantity ?? viewingItems.reduce((s, i) => s + (i.quantity || 0), 0))
    : 0;
  const viewingReceived = viewingGrn
    ? (viewingGrn.received_quantity ?? viewingItems.reduce((s, i) => s + (i.received_quantity || 0), 0))
    : 0;
  const viewingTotalCost = viewingItems.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.cost_price) || 0),
    0,
  );

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Purchase Receiving"
        description="Receive supplier deliveries and add stock to inventory"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> New Purchase Order</Button>}
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {PO_CATEGORIES.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              category === c.id
                ? 'border-accent-600 bg-accent-600 text-white'
                : 'border-border bg-surface text-muted hover:text-foreground hover:border-accent-300'
            }`}
          >
            {c.label}
            <span className={`ml-1.5 tabular-nums ${category === c.id ? 'text-white/80' : 'text-muted'}`}>
              {categoryCounts[c.id]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted py-16 text-center">Loading purchase orders…</p>
      ) : filteredGrns.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={`No ${category} purchase orders`}
          description={category === 'active' ? 'Create a purchase order to start receiving stock.' : 'Switch category or create a new order.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredGrns.map(g => {
            const ordered = g.ordered_quantity ?? g.items.reduce((s, i) => s + (i.quantity || 0), 0);
            const received = g.received_quantity ?? g.items.reduce((s, i) => s + (i.received_quantity || 0), 0);
            const remaining = g.remaining_quantity ?? Math.max(0, ordered - received);
            const lineCost = g.items.reduce(
              (s, i) => s + (Number(i.quantity) || 0) * (Number(i.cost_price) || 0),
              0,
            );
            const receivable = isReceivable(g);
            return (
              <div key={g.id} className="surface-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setViewingGrn(g)}
                      className="font-semibold text-foreground truncate text-left hover:text-accent-600 transition-colors"
                      title="View order details"
                    >
                      {g.grn_number}
                    </button>
                    <p className="text-xs text-muted font-mono">{g.supplier_name || 'No supplier'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setViewingGrn(g)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {g.status === 'draft' && (
                      <button type="button" onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {category !== 'deleted' && (
                      <button type="button" onClick={() => deleteGrn(g.id)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <StatusBadge status={g.status} />
                  </div>
                </div>

                <div className="text-sm space-y-1">
                  <p className="text-muted">
                    Lines: <span className="text-foreground">{g.items?.length ?? 0}</span>
                    {' · '}
                    Progress:{' '}
                    <span className="text-foreground font-medium">{received}/{ordered}</span>
                    {remaining > 0 && category !== 'completed' ? (
                      <span className="text-warning"> · {remaining} left</span>
                    ) : null}
                  </p>
                  <p className="text-muted">
                    Order value:{' '}
                    <span className="text-foreground font-medium">{formatCurrency(lineCost)}</span>
                  </p>
                  <p className="text-muted">
                    Created:{' '}
                    <span className="text-foreground">
                      {g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}
                    </span>
                  </p>
                  {g.notes ? <p className="text-xs text-muted truncate" title={g.notes}>{g.notes}</p> : null}
                </div>

                <div className="flex flex-col gap-2 mt-auto pt-1">
                  {receivable && (
                    <>
                      <Button className="w-full" onClick={() => receiveComplete(g)} disabled={receiving}>
                        <CheckCircle className="w-4 h-4" /> Complete received
                      </Button>
                      <Button variant="secondary" className="w-full" onClick={() => openPartialReceive(g)} disabled={receiving}>
                        <PackageCheck className="w-4 h-4" /> Partial received
                      </Button>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setViewingGrn(g)}>
                      <Eye className="w-4 h-4" /> View
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => duplicateGrn(g.id)}>
                      <Copy className="w-4 h-4" /> Duplicate
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => printGrn(g)}>
                      <Printer className="w-4 h-4" /> Print
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View purchase order details */}
      <Modal
        open={!!viewingGrn}
        onClose={() => setViewingGrn(null)}
        title={viewingGrn ? viewingGrn.grn_number : 'Purchase order'}
        size="lg"
        footer={
          viewingGrn ? (
            <>
              <Button variant="secondary" onClick={() => setViewingGrn(null)}>Close</Button>
              <Button variant="secondary" onClick={() => printGrn(viewingGrn)}>
                <Printer className="w-4 h-4" /> Print
              </Button>
              {viewingGrn.status === 'draft' && (
                <Button onClick={() => { setViewingGrn(null); openEdit(viewingGrn); }}>
                  <Edit2 className="w-4 h-4" /> Edit
                </Button>
              )}
            </>
          ) : null
        }
      >
        {viewingGrn && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted mb-0.5">Supplier</p>
                  <p className="font-medium text-foreground">{viewingGrn.supplier_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Status</p>
                  <StatusBadge status={viewingGrn.status} />
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Created</p>
                  <p className="text-foreground">
                    {viewingGrn.created_at ? new Date(viewingGrn.created_at).toLocaleString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Progress</p>
                  <p className="text-foreground font-medium">{viewingReceived}/{viewingOrdered} received</p>
                </div>
              </div>
              {viewingGrn.notes ? (
                <div className="rounded-xl border border-border bg-canvas-subtle px-3 py-2">
                  <p className="text-xs text-muted mb-0.5">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{viewingGrn.notes}</p>
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Products</h4>
                  <span className="text-xs text-muted">{viewingItems.length} line{viewingItems.length !== 1 ? 's' : ''}</span>
                </div>
                {viewingItems.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8 rounded-xl border border-dashed border-border">
                    No products on this order.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-auto">
                    {viewingItems.map((item, idx) => {
                      const name =
                        item.product_name
                        || products.find(p => p.id === item.product_id)?.name
                        || `Product #${item.product_id}`;
                      const qty = Number(item.quantity) || 0;
                      const recv = Number(item.received_quantity) || 0;
                      const rem = item.remaining_quantity ?? Math.max(0, qty - recv);
                      const lineCost = qty * (Number(item.cost_price) || 0);
                      const unit = item.receive_unit || 'unit';
                      return (
                        <div
                          key={item.id ?? `${item.product_id}-${idx}`}
                          className="px-3 py-3 rounded-xl border border-border bg-surface"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {name}
                                {item.sku_label ? ` — ${item.sku_label}` : ''}
                              </p>
                              <p className="text-xs text-muted mt-0.5">
                                Ordered {qty} {unit}
                                {' · '}Received {recv}
                                {rem > 0 ? ` · Remaining ${rem}` : ''}
                              </p>
                            </div>
                            <p className="text-sm font-medium text-foreground shrink-0 tabular-nums">
                              {formatCurrency(lineCost)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
                            <span>Cost: <span className="text-foreground">{formatCurrency(Number(item.cost_price) || 0)}</span></span>
                            <span>Sell: <span className="text-foreground">{formatCurrency(Number(item.sell_price) || 0)}</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border text-sm">
                <span className="text-muted">{viewingItems.length} product line{viewingItems.length !== 1 ? 's' : ''}</span>
                <span className="text-muted">
                  Order total:{' '}
                  <span className="font-semibold text-foreground">{formatCurrency(viewingTotalCost)}</span>
                </span>
              </div>
            </div>
        )}
      </Modal>

      {/* Partial receive modal */}
      <Modal
        open={!!partialGrn}
        onClose={() => { if (!receiving) { setPartialGrn(null); setPartialQty({}); } }}
        title={partialGrn ? `Partial receive — ${partialGrn.grn_number}` : 'Partial receive'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" disabled={receiving} onClick={() => { setPartialGrn(null); setPartialQty({}); }}>
              Cancel
            </Button>
            <Button disabled={receiving} onClick={submitPartialReceive}>
              {receiving ? 'Receiving…' : 'Receive & update inventory'}
            </Button>
          </>
        }
      >
        {partialGrn && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Enter how much arrived now for each line. Stock is added to inventory immediately; remaining stays on this order.
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {partialGrn.items.map(item => {
                if (item.id == null) return null;
                const rem = item.remaining_quantity ?? Math.max(0, item.quantity - (item.received_quantity || 0));
                if (rem <= 0) {
                  return (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-canvas-subtle text-sm opacity-70">
                      <span className="truncate">{item.product_name || `Product #${item.product_id}`}{item.sku_label ? ` — ${item.sku_label}` : ''}</span>
                      <span className="text-xs text-success shrink-0">Fully received</span>
                    </div>
                  );
                }
                return (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-3 rounded-xl border border-border bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.product_name || `Product #${item.product_id}`}
                        {item.sku_label ? ` — ${item.sku_label}` : ''}
                      </p>
                      <p className="text-xs text-muted">
                        Ordered {item.quantity} · Received {item.received_quantity || 0} · Remaining {rem}
                        {' '}{item.receive_unit || 'unit'}
                      </p>
                    </div>
                    <div className="w-full sm:w-28 shrink-0">
                      <Input
                        label="Receive now"
                        type="number"
                        min={0}
                        max={rem}
                        value={partialQty[item.id] ?? ''}
                        onChange={e => setPartialQty(prev => ({ ...prev, [item.id!]: e.target.value }))}
                        placeholder={`0–${rem}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${editing.grn_number}` : 'New Purchase Order'}
        size="2xl"
        footer={<><Button variant="secondary" onClick={closeModal}>Cancel</Button><Button onClick={handleSave}>{editing ? 'Save Changes' : 'Create Draft'}</Button></>}
      >
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Supplier</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input-base w-full">
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Invoice #, delivery ref…" />
          </div>

          {/* Add product */}
          <div className="rounded-xl border border-border bg-canvas-subtle/50 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Add Product</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={pickerProductId}
                onChange={e => setPickerProductId(e.target.value)}
                className="input-base flex-1"
              >
                <option value="">Select product…</option>
                {products.filter(p => (p.skus?.length ?? 0) > 0).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.skus?.length} variants)</option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={addProductBlock} className="shrink-0">
                <Plus className="w-4 h-4" /> Add Product
              </Button>
            </div>
            <p className="text-xs text-muted">Select a product, then choose which pack sizes (variants) to receive.</p>
          </div>

          {/* Product blocks with SKU selection */}
          {blocks.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed border-border text-muted text-sm">
              No products added yet. Select a product above to choose variants.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Receiving Lines</h4>
                <span className="text-xs text-muted">{selectedCount} variant{selectedCount !== 1 ? 's' : ''} selected</span>
              </div>

              {blocks.map(block => {
                const product = products.find(p => p.id === block.product_id);
                const selectedInBlock = block.skus.filter(s => s.selected).length;
                return (
                  <div key={block.product_id} className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-canvas-subtle border-b border-border">
                      <button
                        type="button"
                        onClick={() => toggleBlock(block.product_id)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        {block.expanded ? <ChevronDown className="w-4 h-4 text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{product?.name || `Product #${block.product_id}`}</p>
                          <p className="text-xs text-muted">{selectedInBlock} of {block.skus.length} variants selected</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => selectAllSkus(block.product_id, true)} className="text-xs text-accent-600 hover:underline">Select all</button>
                        <span className="text-muted">·</span>
                        <button type="button" onClick={() => selectAllSkus(block.product_id, false)} className="text-xs text-muted hover:underline">Clear</button>
                        <button type="button" onClick={() => removeBlock(block.product_id)} className="p-1.5 rounded-lg hover:bg-danger-soft text-danger ml-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>

                    {block.expanded && (
                      <div className="divide-y divide-border">
                        {block.skus.map(sku => (
                          <div
                            key={sku.sku_id}
                            className={`px-4 py-3 transition-colors ${sku.selected ? 'bg-accent-500/5' : 'bg-surface'}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <label className="flex items-center gap-3 min-w-[140px] cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={sku.selected}
                                  onChange={() => toggleSku(block.product_id, sku.sku_id)}
                                  className="w-4 h-4 rounded border-border text-accent-600"
                                />
                                <span className={`text-sm font-medium ${sku.selected ? 'text-accent-600' : 'text-foreground'}`}>
                                  {sku.label}
                                </span>
                              </label>

                              {sku.selected && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 sm:max-w-xl">
                                  <div>
                                    <label className="text-[10px] uppercase text-muted font-semibold mb-1 block">Qty</label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={sku.quantity}
                                      onChange={e => updateSkuField(block.product_id, sku.sku_id, 'quantity', parseInt(e.target.value, 10) || 1)}
                                      className="input-base w-full py-1.5 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase text-muted font-semibold mb-1 block">As</label>
                                    <select
                                      value={sku.receive_unit || 'unit'}
                                      onChange={e => updateSkuField(block.product_id, sku.sku_id, 'receive_unit', e.target.value)}
                                      className="input-base w-full py-1.5 text-sm"
                                      title={
                                        product && (product.carton_qty || 0) > 0
                                          ? `Carton = ${product.carton_qty} ${product.unit || 'units'}`
                                          : 'Set packaging on the product to receive by carton/packet'
                                      }
                                    >
                                      <option value="unit">Packs</option>
                                      <option value="carton" disabled={!((product?.carton_qty || 0) > 0)}>Cartons</option>
                                      <option value="packet" disabled={!((product?.packet_qty || 0) > 0)}>Packets</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase text-muted font-semibold mb-1 block">
                                      Cost / {sku.receive_unit === 'carton' ? 'carton' : sku.receive_unit === 'packet' ? 'packet' : 'pack'}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={sku.cost_price || ''}
                                      onChange={e => updateSkuField(block.product_id, sku.sku_id, 'cost_price', parseFloat(e.target.value) || 0)}
                                      className="input-base w-full py-1.5 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase text-muted font-semibold mb-1 block">Sell / pack</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={sku.sell_price || ''}
                                      onChange={e => updateSkuField(block.product_id, sku.sku_id, 'sell_price', parseFloat(e.target.value) || 0)}
                                      className="input-base w-full py-1.5 text-sm"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-border">
            <p className="text-xs text-muted">{selectedCount} line{selectedCount !== 1 ? 's' : ''} will be received</p>
            <p className="text-sm text-muted">Estimated cost: <span className="font-semibold text-foreground">{formatCurrency(lineTotal)}</span></p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
