import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, Edit2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { get, post } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { getUserMessage } from '../api';
import { TableSkeleton } from '../components/ui/Skeleton';

type Batch = {
  id: number; batch_number: string; quantity: number;
  cost_price: number; sell_price: number; effective_price: number;
  expiry_date?: string; status: string;
};

type ProductRow = {
  product_id: number; product_name: string; barcode: string;
  total_quantity: number; batches: Batch[];
};

const ADJUSTMENT_TYPES = [
  { value: 'stock_in', label: 'Stock In' },
  { value: 'stock_out', label: 'Stock Out' },
  { value: 'damage', label: 'Damage' },
  { value: 'waste', label: 'Waste' },
  { value: 'shrinkage', label: 'Shrinkage' },
  { value: 'expired_removal', label: 'Expired Removal' },
  { value: 'adjustment', label: 'Manual Adjustment' },
];

export default function BatchInventory() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<{ batch: Batch; productName: string } | null>(null);
  const [adjustForm, setAdjustForm] = useState({ quantity_delta: '', movement_type: 'adjustment', reason: '' });

  const branchId = localStorage.getItem('active_branch_id') || '1';

  const load = () => {
    setLoading(true);
    get<{ products?: ProductRow[] }>(`/v1/batches/by-product?branch_id=${branchId}`)
      .then(d => setProducts(d?.products ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdjust = async () => {
    if (!adjustModal) return;
    try {
      await post(`/v1/batches/${adjustModal.batch.id}/adjust`, {
        quantity_delta: parseInt(adjustForm.quantity_delta, 10),
        movement_type: adjustForm.movement_type,
        reason: adjustForm.reason,
      });
      showToast('Stock adjusted', 'success');
      setAdjustModal(null);
      setAdjustForm({ quantity_delta: '', movement_type: 'adjustment', reason: '' });
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Batch Inventory"
        description="Batch-level stock management with adjustments, transfers, and movement tracking"
      />

      {loading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.product_id} className="rounded-2xl border border-border bg-surface overflow-hidden shadow-soft">
              <button onClick={() => toggle(p.product_id)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-canvas-subtle text-left transition-colors">
                {expanded.has(p.product_id) ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.product_name}</p>
                  <p className="text-xs text-muted font-mono">{p.barcode}</p>
                </div>
                <span className="text-sm font-bold text-accent-600">{p.total_quantity} units</span>
              </button>
              {expanded.has(p.product_id) && (
                <div className="border-t border-border bg-canvas-subtle px-5 py-3 space-y-2">
                  {p.batches.length === 0 ? (
                    <p className="text-sm text-muted py-2">No batches — receive stock via GRN</p>
                  ) : p.batches.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                      <div>
                        <p className="text-sm font-medium">Batch {b.batch_number}</p>
                        <p className="text-xs text-muted">Exp: {b.expiry_date || 'N/A'} · Cost: {formatCurrency(b.cost_price)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={b.status} />
                        <span className="text-sm font-medium">{b.quantity} @ {formatCurrency(b.effective_price)}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setAdjustModal({ batch: b, productName: p.product_name }); setAdjustForm({ quantity_delta: '1', movement_type: 'stock_in', reason: '' }); }}
                            className="p-1.5 rounded-lg hover:bg-success-soft text-success" title="Stock In"
                          ><Plus className="w-3.5 h-3.5" /></button>
                          <button
                            onClick={() => { setAdjustModal({ batch: b, productName: p.product_name }); setAdjustForm({ quantity_delta: '-1', movement_type: 'stock_out', reason: '' }); }}
                            className="p-1.5 rounded-lg hover:bg-danger-soft text-danger" title="Stock Out"
                          ><Minus className="w-3.5 h-3.5" /></button>
                          <button
                            onClick={() => { setAdjustModal({ batch: b, productName: p.product_name }); setAdjustForm({ quantity_delta: '', movement_type: 'adjustment', reason: '' }); }}
                            className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted" title="Adjust"
                          ><Edit2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {products.length === 0 && <p className="text-center text-muted py-12">No inventory data</p>}
        </div>
      )}

      <Modal
        open={!!adjustModal}
        onClose={() => setAdjustModal(null)}
        title={`Adjust Stock — ${adjustModal?.productName}`}
        description={`Batch ${adjustModal?.batch.batch_number} · Current: ${adjustModal?.batch.quantity} units`}
        footer={<><Button variant="secondary" onClick={() => setAdjustModal(null)}>Cancel</Button><Button onClick={handleAdjust}>Apply Adjustment</Button></>}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Movement Type</label>
            <select value={adjustForm.movement_type} onChange={e => setAdjustForm(f => ({ ...f, movement_type: e.target.value }))} className="input-base">
              {ADJUSTMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Input label="Quantity Change (+/-)" type="number" value={adjustForm.quantity_delta} onChange={e => setAdjustForm(f => ({ ...f, quantity_delta: e.target.value }))} hint="Positive to add, negative to remove" />
          <Input label="Reason" value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for adjustment" />
        </div>
      </Modal>
    </div>
  );
}
