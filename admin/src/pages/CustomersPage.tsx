import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCustomersStore } from '../stores/customers';
import { TableSearch, SortableTh, useTableSort, fullLabel } from '../components/TableTools';

export function CustomersPage() {
  const { customers: rows, segments, load } = useCustomersStore();
  const [q, setQ] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        (c.phone || '').includes(t) ||
        (c.email || '').toLowerCase().includes(t),
    );
  }, [rows, q]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, 'name');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="text-sm text-muted mt-1">
            {fullLabel('CRM')}, {fullLabel('LTV')}, and segments
          </p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search customers…" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {segments.map((s) => (
          <div key={s.key} className="panel p-3">
            <div className="section-label">{s.name}</div>
            <div className="text-xl font-bold mt-1">{s.count}</div>
          </div>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-canvas-subtle">
            <tr>
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Phone" sortKey="phone" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Loyalty points" sortKey="loyalty_points" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3"><Link className="font-medium hover:text-accent-600" to={`/customers/${c.id}`}>{c.name}</Link></td>
                <td className="px-4 py-3">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.loyalty_points ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-muted text-sm">No customers</div>}
      </div>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { profile, loadProfile, addNote } = useCustomersStore();
  const [note, setNote] = useState('');

  useEffect(() => {
    if (id) void loadProfile(id);
  }, [id, loadProfile]);

  if (!profile) return <div className="skeleton h-40" />;
  const c = profile.customer as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <Link to="/customers" className="text-sm text-accent-600">← Customers</Link>
      <h1 className="page-title">{String(c.name)}</h1>
      <div className="grid md:grid-cols-4 gap-3">
        <div className="panel p-4">
          <div className="section-label">{fullLabel('LTV')}</div>
          <div className="text-xl font-bold mt-1">{String(profile.ltv)}</div>
        </div>
        <div className="panel p-4">
          <div className="section-label">Orders</div>
          <div className="text-xl font-bold mt-1">{String(profile.order_count)}</div>
        </div>
        <div className="panel p-4">
          <div className="section-label">{fullLabel('AOV')}</div>
          <div className="text-xl font-bold mt-1">{String(profile.avg_order_value)}</div>
        </div>
        <div className="panel p-4">
          <div className="section-label">Loyalty points</div>
          <div className="text-xl font-bold mt-1">{String(c.loyalty_points)}</div>
        </div>
      </div>
      <form
        className="panel p-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!id) return;
          await addNote(id, note);
          setNote('');
        }}
      >
        <input className="input h-10" placeholder="Add note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary h-10" type="submit">Add</button>
      </form>
    </div>
  );
}
