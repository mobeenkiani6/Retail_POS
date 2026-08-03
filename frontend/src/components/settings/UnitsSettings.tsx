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

type Unit = {
  id: number; name: string; abbreviation: string;
  is_default: boolean; active: boolean; archived_at?: string;
};

export default function UnitsSettings() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', is_default: false, active: true });

  const load = () => {
    setLoading(true);
    get<{ units?: Unit[] }>('/v1/units/?include_archived=true')
      .then(d => setUnits(d?.units ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', abbreviation: '', is_default: false, active: true });
    setModalOpen(true);
  };

  const openEdit = (u: Unit) => {
    setEditing(u);
    setForm({ name: u.name, abbreviation: u.abbreviation, is_default: u.is_default, active: u.active });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await put(`/v1/units/${editing.id}`, form);
        showToast('Unit updated', 'success');
      } else {
        await post('/v1/units/', form);
        showToast('Unit created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleArchive = async (u: Unit) => {
    const ok = await showConfirm({ title: 'Archive Unit', message: `Archive "${u.name}"?`, variant: 'danger' });
    if (!ok) return;
    await patch(`/v1/units/${u.id}/archive`, {});
    showToast('Unit archived', 'success');
    load();
  };

  const handleRestore = async (u: Unit) => {
    await patch(`/v1/units/${u.id}/restore`, {});
    showToast('Unit restored', 'success');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">Manage units of measure for products (each, kg, L, etc.)</p>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Add Unit</Button>
      </div>

      <DataTable
        loading={loading}
        data={units as unknown as Record<string, unknown>[]}
        emptyMessage="No units configured"
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-medium">{String(r.name)}</span> },
          { key: 'abbreviation', header: 'Abbreviation', render: r => <span className="font-mono text-xs">{String(r.abbreviation)}</span> },
          { key: 'is_default', header: 'Default', render: r => r.is_default ? <Badge variant="success">Default</Badge> : '—' },
          { key: 'active', header: 'Status', render: r => r.archived_at ? <Badge>Archived</Badge> : r.active ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Inactive</Badge> },
        ]}
        actions={r => {
          const u = r as unknown as Unit;
          return (
            <div className="flex gap-1">
              <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-3.5 h-3.5" /></button>
              {u.archived_at
                ? <button onClick={() => handleRestore(u)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><RotateCcw className="w-3.5 h-3.5" /></button>
                : <button onClick={() => handleArchive(u)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-3.5 h-3.5" /></button>
              }
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Unit' : 'New Unit'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kilogram" />
          <Input label="Abbreviation" required value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} placeholder="kg" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
            Set as default unit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
            Active
          </label>
        </div>
      </Modal>
    </div>
  );
}
