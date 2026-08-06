import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, Check, X, Plus } from 'lucide-react';
import { useSuppliersStore, type Supplier, type SupplierInput } from '../stores/suppliers';
import { TableSearch, SortableTh, useTableSort } from '../components/TableTools';

const emptyForm = (): SupplierInput => ({
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  whatsapp: '',
  city: '',
  address: '',
  status: 'active',
});

export function SuppliersPage() {
  const { suppliers: rows, message, load, create, update, remove, clearMessage } = useSuppliersStore();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<SupplierInput>(emptyForm());
  const [edit, setEdit] = useState<(SupplierInput & { id: number }) | null>(null);
  const [localMsg, setLocalMsg] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(t) ||
        (s.city || '').toLowerCase().includes(t) ||
        (s.contact_name || '').toLowerCase().includes(t) ||
        (s.phone || '').includes(t) ||
        (s.email || '').toLowerCase().includes(t),
    );
  }, [rows, q]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, 'name');
  const displayMsg = localMsg || message;

  const startEdit = (s: Supplier) => {
    setEdit({
      id: s.id,
      name: s.name,
      contact_name: s.contact_name || '',
      email: s.email || '',
      phone: s.phone || '',
      whatsapp: s.whatsapp || '',
      city: s.city || '',
      address: s.address || '',
      status: s.status || 'active',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-sm text-muted mt-1">Vendor contacts, cities, performance, and payables</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search suppliers…" />
      </div>

      <form
        className="panel p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          setLocalMsg('');
          clearMessage();
          try {
            await create({
              ...form,
              name: form.name.trim(),
              contact_name: form.contact_name?.trim() || undefined,
              email: form.email?.trim() || undefined,
              phone: form.phone?.trim() || undefined,
              whatsapp: form.whatsapp?.trim() || undefined,
              city: form.city?.trim() || undefined,
              address: form.address?.trim() || undefined,
            });
            setForm(emptyForm());
          } catch (err) {
            setLocalMsg(err instanceof Error ? err.message : 'Create failed');
          }
        }}
      >
        <div>
          <label className="section-label">Supplier name</label>
          <input
            className="input mt-1 h-10"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="section-label">Contact person</label>
          <input
            className="input mt-1 h-10"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label">City</label>
          <input
            className="input mt-1 h-10"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label">Phone</label>
          <input
            className="input mt-1 h-10"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label">Email</label>
          <input
            className="input mt-1 h-10"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label">WhatsApp</label>
          <input
            className="input mt-1 h-10"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="section-label">Address</label>
          <input
            className="input mt-1 h-10"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <button className="btn-primary h-10" type="submit">
          <Plus size={16} /> Add supplier
        </button>
      </form>

      {displayMsg && <div className="text-sm text-muted">{displayMsg}</div>}

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-canvas-subtle">
            <tr>
              <SortableTh label="Supplier" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="City" sortKey="city" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Contact person" sortKey="contact_name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Phone" sortKey="phone" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Outstanding" sortKey="outstanding_balance" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="border-t border-border">
                {edit?.id === s.id ? (
                  <>
                    <td className="px-4 py-2" colSpan={7}>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <input
                          className="input h-9"
                          placeholder="Name"
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="Contact"
                          value={edit.contact_name}
                          onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="City"
                          value={edit.city}
                          onChange={(e) => setEdit({ ...edit, city: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="Phone"
                          value={edit.phone}
                          onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="Email"
                          value={edit.email}
                          onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="WhatsApp"
                          value={edit.whatsapp}
                          onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })}
                        />
                        <input
                          className="input h-9"
                          placeholder="Address"
                          value={edit.address}
                          onChange={(e) => setEdit({ ...edit, address: e.target.value })}
                        />
                        <select
                          className="input h-9"
                          value={edit.status || 'active'}
                          onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap align-top">
                      <button
                        type="button"
                        className="btn-ghost p-1 text-success"
                        title="Save"
                        onClick={async () => {
                          if (!edit.name.trim()) return;
                          setLocalMsg('');
                          clearMessage();
                          try {
                            await update(edit.id, {
                              name: edit.name.trim(),
                              contact_name: edit.contact_name?.trim() || '',
                              email: edit.email?.trim() || '',
                              phone: edit.phone?.trim() || '',
                              whatsapp: edit.whatsapp?.trim() || '',
                              city: edit.city?.trim() || '',
                              address: edit.address?.trim() || '',
                              status: edit.status || 'active',
                            });
                            setEdit(null);
                          } catch (err) {
                            setLocalMsg(err instanceof Error ? err.message : 'Update failed');
                          }
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button type="button" className="btn-ghost p-1" title="Cancel" onClick={() => setEdit(null)}>
                        <X size={14} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <Link className="font-medium hover:text-accent-600" to={`/suppliers/${s.id}`}>{s.name}</Link>
                    </td>
                    <td className="px-4 py-3">{s.city || '—'}</td>
                    <td className="px-4 py-3">{s.contact_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div>{s.phone || '—'}</div>
                      {s.whatsapp && <div className="text-xs text-muted">WA {s.whatsapp}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.email || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{s.outstanding_balance ?? 0}</td>
                    <td className="px-4 py-3 capitalize">{s.status || 'active'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" className="btn-ghost p-1" title="Edit" onClick={() => startEdit(s)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost p-1 text-danger"
                        title="Delete"
                        onClick={async () => {
                          setLocalMsg('');
                          clearMessage();
                          try {
                            await remove(s.id);
                            if (edit?.id === s.id) setEdit(null);
                          } catch (err) {
                            setLocalMsg(err instanceof Error ? err.message : 'Delete failed');
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-muted text-sm">No suppliers</div>}
      </div>
    </div>
  );
}

export function SupplierDetailPage({ id }: { id: string }) {
  const { detail: supplier, ledger, loadDetail } = useSuppliersStore();

  useEffect(() => {
    void loadDetail(id);
  }, [id, loadDetail]);

  if (!supplier) return <div className="skeleton h-40" />;
  const s = (supplier.supplier || supplier) as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <Link to="/suppliers" className="text-sm text-accent-600">← Suppliers</Link>
      <h1 className="page-title">{String(s.name)}</h1>
      <div className="panel p-4 grid md:grid-cols-3 gap-4 text-sm">
        <div><div className="section-label">Contact person</div><div className="mt-1 font-medium">{String(s.contact_name || '—')}</div></div>
        <div><div className="section-label">City</div><div className="mt-1">{String(s.city || '—')}</div></div>
        <div><div className="section-label">Phone</div><div className="mt-1">{String(s.phone || '—')}</div></div>
        <div><div className="section-label">Email</div><div className="mt-1">{String(s.email || '—')}</div></div>
        <div><div className="section-label">WhatsApp</div><div className="mt-1">{String(s.whatsapp || '—')}</div></div>
        <div><div className="section-label">Address</div><div className="mt-1">{String(s.address || '—')}</div></div>
        <div><div className="section-label">Outstanding</div><div className="mt-1 font-semibold tabular-nums">{String(s.outstanding_balance ?? 0)}</div></div>
      </div>
      <div className="panel p-4">
        <div className="section-label mb-2">Ledger</div>
        <ul className="space-y-1 text-sm">
          {ledger.slice(0, 30).map((e, i) => (
            <li key={i} className="flex justify-between border-b border-border py-1">
              <span>{String(e.entry_type)} {String(e.reference_number || '')}</span>
              <span className="tabular-nums">{String(e.amount)}</span>
            </li>
          ))}
          {!ledger.length && <li className="text-muted">No ledger entries</li>}
        </ul>
      </div>
    </div>
  );
}
