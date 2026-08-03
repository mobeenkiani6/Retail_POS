import { useEffect, useState } from 'react';
import { Plus, Edit2, Archive, RotateCcw, Trash2, User, Star } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import SearchInput from '../components/ui/SearchInput';
import Badge from '../components/ui/Badge';
import { get, post, put, patch, del, getUserMessage } from '../api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';

type Customer = {
  id: number; name: string; email?: string; phone?: string;
  loyalty_points: number; store_credit?: number; notes?: string; archived_at?: string;
};

const emptyForm = { name: '', email: '', phone: '', loyalty_points: '0', notes: '' };

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (showArchived) params.set('include_archived', 'true');
    get<{ customers?: Customer[] }>(`/v1/customers/?${params}`)
      .then(d => setCustomers(d?.customers ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, showArchived]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', loyalty_points: String(c.loyalty_points), notes: c.notes || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, loyalty_points: parseInt(form.loyalty_points, 10) || 0 };
      if (editing) {
        await put(`/v1/customers/${editing.id}`, payload);
        showToast('Customer updated', 'success');
      } else {
        await post('/v1/customers/', payload);
        showToast('Customer created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleArchive = async (c: Customer) => {
    const ok = await showConfirm({ title: 'Archive Customer', message: `Archive ${c.name}?`, variant: 'danger' });
    if (!ok) return;
    await patch(`/v1/customers/${c.id}/archive`, {});
    showToast('Customer archived', 'success');
    load();
  };

  const handleRestore = async (c: Customer) => {
    await patch(`/v1/customers/${c.id}/restore`, {});
    showToast('Customer restored', 'success');
    load();
  };

  const handleDelete = async (c: Customer) => {
    const ok = await showConfirm({ title: 'Delete Customer', message: `Permanently delete ${c.name}?`, variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    await del(`/v1/customers/${c.id}`);
    showToast('Customer deleted', 'success');
    load();
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Customers"
        description="Manage customer profiles, loyalty points, and purchase history"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Customer</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <SearchInput
          wrapperClassName="flex-1 min-w-[200px] max-w-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…"
        />
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
          Show archived
        </label>
      </div>

      <DataTable
        loading={loading}
        data={customers as Record<string, unknown>[]}
        emptyMessage="No customers yet"
        columns={[
          { key: 'name', header: 'Customer', render: r => (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center">
                <User className="w-4 h-4 text-accent-600" />
              </div>
              <div>
                <p className="font-medium">{String(r.name)}</p>
                {r.phone ? <p className="text-xs text-muted">{String(r.phone)}</p> : null}
              </div>
            </div>
          )},
          { key: 'email', header: 'Email', render: r => String(r.email || '—') },
          { key: 'loyalty_points', header: 'Loyalty', render: r => (
            <span className="inline-flex items-center gap-1 text-accent-600 font-medium">
              <Star className="w-3.5 h-3.5" />{Number(r.loyalty_points)}
            </span>
          )},
          { key: 'status', header: 'Status', render: r => r.archived_at ? <Badge variant="default">Archived</Badge> : <Badge variant="success">Active</Badge> },
        ]}
        actions={r => {
          const c = r as unknown as Customer;
          return (
            <div className="flex gap-1">
              <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
              {c.archived_at
                ? <button onClick={() => handleRestore(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted hover:text-success"><RotateCcw className="w-3.5 h-3.5" /></button>
                : <button onClick={() => handleArchive(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted hover:text-warning"><Archive className="w-3.5 h-3.5" /></button>
              }
              <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Customer' : 'New Customer'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label="Loyalty Points" type="number" value={form.loyalty_points} onChange={e => setForm(f => ({ ...f, loyalty_points: e.target.value }))} />
          <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
