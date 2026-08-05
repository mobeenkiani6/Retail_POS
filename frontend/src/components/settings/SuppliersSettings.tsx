import { useEffect, useState, type ChangeEvent } from 'react';
import { Plus, Edit2, Archive, ArchiveRestore, Trash2, Loader2 } from 'lucide-react';
import { get, post, put, patch, del, getUserMessage } from '../../api';
import { showToast } from '../Toast';
import { showConfirm } from '../ConfirmDialog';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { formatCurrency } from '../../utils/formatCurrency';

type Supplier = {
  id: number;
  name: string;
  supplier_code?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  outstanding_balance?: number;
  status?: string;
  archived_at?: string | null;
};

const emptyForm = {
  name: '', supplier_code: '', contact_name: '', email: '', phone: '',
  whatsapp: '', address: '', city: '',
};

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
      supplier_code: s.supplier_code || '',
      contact_name: s.contact_name || '',
      email: s.email || '',
      phone: s.phone || '',
      whatsapp: s.whatsapp || '',
      address: s.address || '',
      city: s.city || '',
    });
    setModalOpen(true);
  };

  const payload = () => ({
    name: form.name.trim(),
    supplier_code: form.supplier_code.trim() || undefined,
    contact_name: form.contact_name || null,
    email: form.email || null,
    phone: form.phone || null,
    whatsapp: form.whatsapp || null,
    address: form.address || null,
    city: form.city || null,
  });

  const save = async () => {
    if (!form.name.trim()) { showToast('Company name required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await put(`/v1/suppliers/${editing.id}`, payload());
        showToast('Supplier updated', 'success');
      } else {
        await post('/v1/suppliers/', payload());
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

  const setF = (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

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
                <p className="text-xs text-muted truncate">
                  {[s.supplier_code, s.contact_name || s.phone, formatCurrency(s.outstanding_balance || 0)].filter(Boolean).join(' · ')}
                </p>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit supplier' : 'Add supplier'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Company Name *" value={form.name} onChange={setF('name')} placeholder="e.g. Sysco Foods" />
          <Input label="Supplier Code" hint="Auto-generated for new suppliers. You can still edit it." value={form.supplier_code} onChange={setF('supplier_code')} placeholder="Auto-generated from supplier name" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Person" value={form.contact_name} onChange={setF('contact_name')} placeholder="e.g. John Doe" />
            <Input label="Phone" value={form.phone} onChange={setF('phone')} placeholder="555-0192" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="WhatsApp (optional)" value={form.whatsapp} onChange={setF('whatsapp')} />
            <Input label="Email" value={form.email} onChange={setF('email')} placeholder="orders@sysco.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Address</label>
            <textarea value={form.address} onChange={setF('address')} rows={2} placeholder="123 Industrial Pkwy" className="input-base w-full resize-none" />
          </div>
          <Input label="City" value={form.city} onChange={setF('city')} />
        </div>
      </Modal>
    </div>
  );
}
