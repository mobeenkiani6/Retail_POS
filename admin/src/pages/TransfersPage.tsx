import { useEffect, useState } from 'react';
import { get, post } from '../api/client';
import { useBranchFilter } from '../stores/branch';
import { NumberFieldString } from '../components/NumberField';

export function TransfersPage() {
  const { branches } = useBranchFilter();
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<string, unknown>[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');

  const load = () => {
    get('/v1/admin/transfers').then((r) => setTransfers(r as Record<string, unknown>[]));
    get('/v1/admin/cycle-counts').then((r) => setCounts(r as Record<string, unknown>[]));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Transfers & cycle counts</h1>
        <p className="text-sm text-muted mt-1">Move stock between branches and reconcile counts</p>
      </div>
      <form
        className="panel p-4 grid md:grid-cols-5 gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          await post('/v1/admin/transfers', {
            from_branch_id: fromId,
            to_branch_id: toId,
            items: [{ product_id: Number(productId), quantity: Number(qty) }],
          });
          load();
        }}
      >
        <div>
          <label className="section-label">From</label>
          <select className="input mt-1" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
            <option value="">Select</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="section-label">To</label>
          <select className="input mt-1" value={toId} onChange={(e) => setToId(e.target.value)} required>
            <option value="">Select</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div><label className="section-label">Product ID</label><input className="input mt-1" value={productId} onChange={(e) => setProductId(e.target.value)} required /></div>
        <div><label className="section-label">Qty</label><NumberFieldString className="input mt-1" value={qty} onValueChange={setQty} /></div>
        <button className="btn-primary" type="submit">Create draft</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-canvas-subtle text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={String(t.id)} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{String(t.transfer_number)}</td>
                <td className="px-4 py-3">{String(t.status)}</td>
                <td className="px-4 py-3 flex gap-2">
                  {t.status === 'draft' && <button type="button" className="btn-ghost" onClick={() => post(`/v1/admin/transfers/${t.id}/ship`).then(load)}>Ship</button>}
                  {t.status === 'in_transit' && <button type="button" className="btn-ghost" onClick={() => post(`/v1/admin/transfers/${t.id}/receive`).then(load)}>Receive</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">Cycle counts</div>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const branch_id = fromId || branches[0]?.id;
              if (!branch_id) return alert('Select a from-branch first');
              await post('/v1/admin/cycle-counts', { branch_id, name: `Count ${new Date().toLocaleDateString()}` });
              load();
            }}
          >
            Start count
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {counts.map((c) => (
            <li key={String(c.id)} className="flex justify-between border-b border-border py-1">
              <span>{String(c.name)} · {String(c.status)} · {String(c.item_count)} items</span>
              {c.status === 'open' && (
                <button type="button" className="btn-ghost" onClick={() => post(`/v1/admin/cycle-counts/${c.id}/complete`, { apply_adjustments: true }).then(load)}>Complete</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
