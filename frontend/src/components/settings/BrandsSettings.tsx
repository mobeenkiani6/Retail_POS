import { useEffect, useState } from 'react';
import { Plus, Edit2, Archive, ArchiveRestore, Copy, Trash2, Loader2 } from 'lucide-react';
import { get, post, put, patch, del, getUserMessage } from '../../api';
import { showToast } from '../Toast';
import { showConfirm } from '../ConfirmDialog';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

type Brand = { id: number; name: string; description?: string; logo_url?: string; product_count?: number; archived_at?: string | null };

export default function BrandsSettings() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = () => {
    setLoading(true);
    const q = includeArchived ? '?include_archived=true' : '';
    get<{ brands?: Brand[] }>(`/v1/brands/${q}`)
      .then(d => setBrands(d?.brands ?? []))
      .catch(e => showToast(getUserMessage(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [includeArchived]);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setModalOpen(true); };
  const openEdit = (b: Brand) => { setEditing(b); setForm({ name: b.name, description: b.description || '' }); setModalOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { showToast('Name required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await put(`/v1/brands/${editing.id}`, form);
        showToast('Brand updated', 'success');
      } else {
        await post('/v1/brands/', form);
        showToast('Brand created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (b: Brand) => {
    await patch(`/v1/brands/${b.id}/archive`, {});
    showToast('Brand archived', 'success');
    load();
  };

  const restore = async (b: Brand) => {
    await patch(`/v1/brands/${b.id}/restore`, {});
    showToast('Brand restored', 'success');
    load();
  };

  const duplicate = async (b: Brand) => {
    await post(`/v1/brands/${b.id}/duplicate`, {});
    showToast('Brand duplicated', 'success');
    load();
  };

  const remove = async (b: Brand) => {
    const ok = await showConfirm({ title: 'Delete Brand', message: `Permanently delete "${b.name}"?`, variant: 'danger' });
    if (!ok) return;
    await del(`/v1/brands/${b.id}`);
    showToast('Brand deleted', 'success');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Brands</h3>
          <p className="text-sm text-muted">Manage product brands for your catalog.</p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Brand</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} className="rounded border-border" />
        Include archived
      </label>

      {loading ? (
        <div className="flex justify-center py-12 text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border bg-surface">
          {brands.length === 0 ? (
            <p className="p-6 text-sm text-muted text-center">No brands yet.</p>
          ) : brands.map(b => (
            <div key={b.id} className={`flex items-center justify-between px-4 py-3 gap-3 ${b.archived_at ? 'opacity-70 bg-canvas-subtle' : ''}`}>
              <div>
                <p className="font-medium text-sm text-foreground">{b.name}</p>
                {b.description && <p className="text-xs text-muted">{b.description}</p>}
                <p className="text-[10px] text-muted mt-0.5">{b.product_count ?? 0} products</p>
              </div>
              <div className="flex items-center gap-1">
                {b.archived_at && <Badge variant="warning">Archived</Badge>}
                {!b.archived_at && (
                  <>
                    <button type="button" onClick={() => openEdit(b)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => duplicate(b)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Copy className="w-4 h-4" /></button>
                    <button type="button" onClick={() => archive(b)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-4 h-4" /></button>
                  </>
                )}
                {b.archived_at && (
                  <>
                    <button type="button" onClick={() => restore(b)} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted"><ArchiveRestore className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(b)} className="p-2 rounded-lg hover:bg-canvas-subtle text-danger"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Brand' : 'New Brand'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Name *</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="input-base w-full resize-none" />
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
