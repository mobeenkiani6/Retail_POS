import { useEffect, useState } from 'react';
import { Plus, Edit2, Archive, ArchiveRestore, Trash2, Loader2 } from 'lucide-react';
import { get, post, put, patch, del, getUserMessage } from '../../api';
import { showToast } from '../Toast';
import { showConfirm } from '../ConfirmDialog';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

type Supplier = {
  id: number;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  outstanding_balance?: number;
  archived_at?: string | null;
};

const emptyForm = { name: '', contact_name: '', email: '', phone: '', address: '', notes: '' };

export default function SuppliersSettings() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    const q = includeArchived ? '?include_archived=true' : '';
    get<{ suppliers?: Supplier[] }>(`/v1/suppliers/${q}`)
      .then(d => setSuppliers(d?.suppliers ?? []))
      .catch(e => showToast(getUserMessage(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [includeArchived]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contact_name: s.contact_name || '',
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || '',
      notes: s.notes || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { showToast('Supplier name required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await put(`/v1/suppliers/${editing.id}`, form);
        showToast('Supplier updated', 'success');
      } else {
        await post('/v1/suppliers/', form);
        showToast('Supplier created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (s: Supplier) => {
    await patch(`/v1/suppliers/${s.id}/archive`, {});
    showToast('Supplier archived', 'success');
    load();
  };

  const restore = async (s: Supplier) => {
    await patch(`/v1/suppliers/${s.id}/restore`, {});
    showToast('Supplier restored', 'success');
    load();
  };

  const remove = async (s: Supplier) => {
    const ok = await showConfirm({ title: 'Delete Supplier', message: `Permanently delete "${s.name}"?`, variant: 'danger' });
    if (!ok) return;
    await del(`/v1/suppliers/${s.id}`);
    showToast('Supplier deleted', 'success');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Suppliers</h3>
          <p className="text-sm text-muted">Manage vendors for purchase receiving and products.</p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} className="rounded border-border" />
        Include archived
      </label>

      {loading ? (
        <div className="flex justify-center py-12 text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border bg-surface">
          {suppliers.length === 0 ? (
            <p className="p-6 text-sm text-muted text-center">No suppliers yet.</p>
          ) : suppliers.map(s => (
            <div key={s.id} className={`flex items-center justify-between px-4 py-3 gap-3 ${s.archived_at ? 'opacity-70 bg-canvas-subtle' : ''}`}>
              <div className="min-w-0">
                <p className="font-medium text-sm text-foreground">{s.name}</p>
                <p className="text-xs text-muted truncate">{s.contact_name || s.email || s.phone || '—'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.archived_at && <Badge variant="warning">Archived</Badge>}
                {!s.archived_at && (
                  <>
                    <button type="button" onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => archive(s)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-4 h-4" /></button>
                  </>
                )}
                {s.archived_at && (
                  <>
                    <button type="button" onClick={() => restore(s)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><ArchiveRestore className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(s)} className="p-2 rounded-lg hover:bg-canvas-subtle text-danger"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} size="md">
        <div className="space-y-3">
          <Input label="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Contact Person" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input-base w-full resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
