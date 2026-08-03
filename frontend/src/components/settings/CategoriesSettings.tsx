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

type Category = {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  parent_name?: string;
  product_count?: number;
  archived_at?: string;
};

export default function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', parent_id: '' });

  const load = () => {
    setLoading(true);
    get<{ categories?: Category[] }>('/v1/categories/?include_archived=true')
      .then(d => setCategories(d?.categories ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', parent_id: '' });
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description || '',
      parent_id: c.parent_id ? String(c.parent_id) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Category name is required', 'error');
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        parent_id: form.parent_id ? parseInt(form.parent_id, 10) : null,
      };
      if (editing) {
        await put(`/v1/categories/${editing.id}`, payload);
        showToast('Category updated', 'success');
      } else {
        await post('/v1/categories/', payload);
        showToast('Category created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleArchive = async (c: Category) => {
    const ok = await showConfirm({ title: 'Archive Category', message: `Archive "${c.name}"?`, variant: 'danger' });
    if (!ok) return;
    await patch(`/v1/categories/${c.id}/archive`, {});
    showToast('Category archived', 'success');
    load();
  };

  const handleRestore = async (c: Category) => {
    await patch(`/v1/categories/${c.id}/restore`, {});
    showToast('Category restored', 'success');
    load();
  };

  const parentOptions = categories.filter(c => !c.archived_at && c.id !== editing?.id);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <p className="text-sm text-muted">Organize products into categories</p>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Add Category</Button>
      </div>

      <DataTable
        loading={loading}
        data={categories as unknown as Record<string, unknown>[]}
        emptyMessage="No categories yet"
        columns={[
          { key: 'name', header: 'Name', render: r => (
            <div>
              <span className="font-medium">{String(r.name)}</span>
              {r.parent_name ? <p className="text-xs text-muted">under {String(r.parent_name)}</p> : null}
            </div>
          )},
          { key: 'product_count', header: 'Products', render: r => String(r.product_count ?? 0) },
          { key: 'status', header: 'Status', render: r => r.archived_at ? <Badge>Archived</Badge> : <Badge variant="success">Active</Badge> },
        ]}
        actions={r => {
          const c = r as unknown as Category;
          return (
            <div className="flex gap-1">
              <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-3.5 h-3.5" /></button>
              {c.archived_at
                ? <button type="button" onClick={() => handleRestore(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><RotateCcw className="w-3.5 h-3.5" /></button>
                : <button type="button" onClick={() => handleArchive(c)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-3.5 h-3.5" /></button>
              }
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Category' : 'New Category'}
        size="md"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Clothing, Beverages" />
          <Input label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Parent Category</label>
            <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} className="input-base">
              <option value="">None (top level)</option>
              {parentOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
