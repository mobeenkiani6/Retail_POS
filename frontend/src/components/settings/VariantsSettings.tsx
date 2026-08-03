import { useEffect, useState } from 'react';
import { Plus, Edit2, Archive, RotateCcw } from 'lucide-react';
import { get, post, put, patch, getUserMessage } from '../../api';
import { showToast } from '../Toast';
import { showConfirm } from '../ConfirmDialog';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';

type VariantOption = {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
  archived_at?: string;
};

export default function VariantsSettings() {
  const [options, setOptions] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VariantOption | null>(null);
  const [form, setForm] = useState({ name: '', sort_order: '0', active: true });

  const load = () => {
    setLoading(true);
    get<{ variant_options?: VariantOption[] }>('/v1/variant-options/?include_archived=true')
      .then(d => setOptions(d?.variant_options ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', sort_order: '0', active: true });
    setModalOpen(true);
  };

  const openEdit = (o: VariantOption) => {
    setEditing(o);
    setForm({ name: o.name, sort_order: String(o.sort_order ?? 0), active: o.active });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Variant name is required', 'error');
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        sort_order: parseInt(form.sort_order, 10) || 0,
        active: form.active,
      };
      if (editing) {
        await put(`/v1/variant-options/${editing.id}`, payload);
        showToast('Variant updated', 'success');
      } else {
        await post('/v1/variant-options/', payload);
        showToast('Variant created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleArchive = async (o: VariantOption) => {
    const ok = await showConfirm({ title: 'Archive Variant', message: `Archive "${o.name}"?`, variant: 'danger' });
    if (!ok) return;
    await patch(`/v1/variant-options/${o.id}/archive`, {});
    showToast('Variant archived', 'success');
    load();
  };

  const handleRestore = async (o: VariantOption) => {
    await patch(`/v1/variant-options/${o.id}/restore`, {});
    showToast('Variant restored', 'success');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <p className="text-sm text-muted">
          Global size and option labels (Small, Medium, Large, etc.) — assign them per product when editing products.
        </p>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Add Variant</Button>
      </div>

      <DataTable
        loading={loading}
        data={options as unknown as Record<string, unknown>[]}
        emptyMessage="No variant options yet"
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-medium">{String(r.name)}</span> },
          { key: 'sort_order', header: 'Order', render: r => String(r.sort_order ?? 0) },
          { key: 'active', header: 'Status', render: r => r.archived_at ? <Badge>Archived</Badge> : r.active ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Inactive</Badge> },
        ]}
        actions={r => {
          const o = r as unknown as VariantOption;
          return (
            <div className="flex gap-1">
              <button type="button" onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-3.5 h-3.5" /></button>
              {o.archived_at
                ? <button type="button" onClick={() => handleRestore(o)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><RotateCcw className="w-3.5 h-3.5" /></button>
                : <button type="button" onClick={() => handleArchive(o)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-3.5 h-3.5" /></button>
              }
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Variant' : 'New Variant'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Small, Red, 500ml" />
          <Input label="Sort Order" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} placeholder="0" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
            Active
          </label>
        </div>
      </Modal>
    </div>
  );
}
