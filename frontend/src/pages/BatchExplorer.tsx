import { useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import SearchInput from '../components/ui/SearchInput';
import { get, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { getBranchId } from '../branch';

type BatchDetail = {
  batch: {
    id: number;
    product_name: string;
    batch_number: string;
    quantity: number;
    cost_price: number;
    sell_price: number;
    effective_price: number;
    expiry_date?: string;
    status: string;
  };
  movements: {
    id: number;
    movement_type: string;
    quantity_delta: number;
    reference_type?: string;
    notes?: string;
    created_at?: string;
  }[];
};

export default function BatchExplorer() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const branchId = getBranchId();
      const data = await get<{ batches?: Record<string, unknown>[] }>(`/v1/batches/?search=${encodeURIComponent(search)}&branch_id=${branchId}`);
      setResults(data?.batches ?? []);
    } catch (e) {
      setError(getUserMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadBatch = async (id: number) => {
    try {
      const data = await get<BatchDetail>(`/v1/batches/${id}`);
      setSelected(data);
    } catch (e) {
      setError(getUserMessage(e));
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      <PageHeader title="Batch Explorer" description="Search batches, view timeline and movement history" />

      <div className="flex gap-3 mb-6">
        <SearchInput
          wrapperClassName="flex-1 max-w-md"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Batch number, product name, or barcode…"
        />
        <Button onClick={handleSearch} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}</Button>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Search Results</h3>
          <ul className="space-y-2">
            {results.map(b => (
              <li key={String(b.id)}>
                <button onClick={() => loadBatch(Number(b.id))} className="w-full text-left p-3 rounded-xl hover:bg-neutral-50 border border-neutral-100">
                  <p className="font-medium text-sm">{String(b.product_name)} — {String(b.batch_number)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={String(b.status)} />
                    <span className="text-xs text-neutral-500">{String(b.quantity)} units</span>
                  </div>
                </button>
              </li>
            ))}
            {results.length === 0 && !loading && <p className="text-neutral-400 text-sm py-8 text-center">Search for a batch</p>}
          </ul>
        </Card>

        {selected && (
          <Card className="p-6">
            <h3 className="font-semibold text-lg mb-1">{selected.batch.product_name}</h3>
            <p className="text-sm text-neutral-500 mb-4">Batch {selected.batch.batch_number}</p>
            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              <div><span className="text-neutral-500">Qty</span><p className="font-bold">{selected.batch.quantity}</p></div>
              <div><span className="text-neutral-500">Status</span><p><StatusBadge status={selected.batch.status} /></p></div>
              <div><span className="text-neutral-500">Cost</span><p className="font-bold">{formatCurrency(selected.batch.cost_price)}</p></div>
              <div><span className="text-neutral-500">Sell</span><p className="font-bold">{formatCurrency(selected.batch.effective_price)}</p></div>
            </div>
            <h4 className="font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Movement Timeline</h4>
            <ul className="space-y-2">
              {selected.movements.map(m => (
                <li key={m.id} className="flex justify-between p-3 rounded-xl bg-neutral-50 text-sm">
                  <span className="font-medium capitalize">{m.movement_type.replace('_', ' ')}</span>
                  <span className={m.quantity_delta > 0 ? 'text-emerald-600' : 'text-red-600'}>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</span>
                </li>
              ))}
              {selected.movements.length === 0 && <p className="text-neutral-400 text-sm">No movements recorded</p>}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
