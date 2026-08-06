import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { useBranchFilter } from '../stores/branch';
import { TableSearch, SortableTh, useTableSort } from '../components/TableTools';

export function BranchesPage() {
  const { allBranches: rows, message, loadAll, create, archive, unarchive } = useBranchFilter();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (b) =>
        b.name.toLowerCase().includes(t) ||
        b.id.toLowerCase().includes(t) ||
        (b.address || '').toLowerCase().includes(t) ||
        (b.phone || '').includes(t),
    );
  }, [rows, q]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, 'name');

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create({ name, address, phone });
    setName('');
    setAddress('');
    setPhone('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="text-sm text-muted mt-1">Provision store hex IDs for POS installs</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search branches…" />
      </div>

      <form onSubmit={onCreate} className="panel p-4 grid md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="section-label">Name</label>
          <input className="input mt-1 h-10" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="section-label">Address</label>
          <input className="input mt-1 h-10" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="section-label">Phone</label>
          <input className="input mt-1 h-10" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary h-10"><Plus size={16} /> Create</button>
      </form>
      {message && <div className="text-sm text-success">{message}</div>}

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-canvas-subtle">
            <tr>
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Hex ID" sortKey="id" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Users" sortKey="user_count" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{b.name}{b.archived_at ? ' (archived)' : ''}</td>
                <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                <td className="px-4 py-3">{b.user_count ?? 0}</td>
                <td className="px-4 py-3 text-right flex gap-2 justify-end">
                  <button type="button" className="btn-ghost" title="Copy BRANCH_ID" onClick={() => navigator.clipboard.writeText(b.id)}>
                    <Copy size={14} />
                  </button>
                  {!b.archived_at ? (
                    <button type="button" className="btn-ghost text-danger" onClick={() => void archive(b.id)}>Archive</button>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={() => void unarchive(b.id)}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-muted text-sm">No branches</div>}
      </div>
    </div>
  );
}
