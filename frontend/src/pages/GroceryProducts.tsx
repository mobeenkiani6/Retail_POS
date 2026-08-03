import { Fragment, useEffect, useState } from 'react';
import { Plus, Edit2, Archive, RotateCcw, Copy, Package, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchInput from '../components/ui/SearchInput';
import ProductForm, { emptyProductForm, productToForm, formToPayload, type ProductFormData } from '../components/products/ProductForm';
import { get, post, put, patch, del, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import { formatSkuLabel, priceRange, type ProductParent, type ProductSku } from '../utils/productSkus';

type CategoryOption = { id: number; name: string };
type Option = { id: number; name: string; abbreviation?: string };

export default function GroceryProducts() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const branchId = parseInt(localStorage.getItem('active_branch_id') || user?.branch_id || '1', 10);

  const [products, setProducts] = useState<ProductParent[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductParent | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyProductForm());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = () => {
    setLoading(true);
    const q = showArchived ? `?include_archived=true&branch_id=${branchId}` : `?branch_id=${branchId}`;
    Promise.all([
      get<{ products?: ProductParent[] }>(`/products/${q}`),
      get<{ categories?: CategoryOption[] }>('/v1/categories/'),
      get<{ units?: Option[] }>('/v1/units/'),
      get<{ brands?: Option[] }>('/v1/brands/'),
      get<{ suppliers?: Option[] }>('/v1/suppliers/'),
    ]).then(([p, c, u, b, s]) => {
      setProducts(p?.products ?? []);
      setCategories(c?.categories ?? []);
      setUnits(u?.units ?? []);
      setBrands(b?.brands ?? []);
      setSuppliers(s?.suppliers ?? []);
    }).catch(e => showToast(getUserMessage(e), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [showArchived, branchId]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.skus || []).some(s => s.barcode.includes(search) || s.sku_code.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = () => { setEditing(null); setForm(emptyProductForm()); setModalOpen(true); };
  const openEdit = (p: ProductParent) => { setEditing(p); setForm(productToForm(p as unknown as Record<string, unknown>)); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Product name is required', 'error');
      return;
    }
    if (!editing && form.skus.length === 0) {
      showToast('Add at least one SKU (pack size)', 'error');
      return;
    }
    for (const sku of form.skus) {
      if (!sku.barcode.trim()) {
        showToast('Each SKU needs a barcode', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = formToPayload(form, branchId);
      if (editing) {
        const res = await put<{ product: ProductParent }>(`/products/${editing.id}`, payload);
        if (res?.product) setProducts(prev => prev.map(p => p.id === res.product.id ? res.product : p));
        showToast('Product updated', 'success');
      } else {
        const res = await post<{ product: ProductParent }>('/products/', payload);
        if (res?.product) setProducts(prev => [...prev, res.product]);
        showToast('Product created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: ProductParent) => {
    const ok = await showConfirm({ title: 'Archive Product', message: `Archive "${p.name}" and all SKUs?`, variant: 'danger' });
    if (!ok) return;
    await del(`/products/${p.id}`);
    showToast('Product archived', 'success');
    load();
  };

  const handleRestore = async (p: ProductParent) => {
    await patch(`/products/${p.id}/restore`, {});
    showToast('Product restored', 'success');
    load();
  };

  const handleDuplicate = async (p: ProductParent) => {
    await post(`/products/${p.id}/duplicate`, {});
    showToast('Product duplicated', 'success');
    load();
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Products"
        description="Retail catalog — parent products with pack-size SKUs"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Product</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <SearchInput
          wrapperClassName="flex-1 min-w-[200px] max-w-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products or barcodes…"
        />
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded border-border" />
          Show archived
        </label>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted">No products yet</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-surface overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="bg-canvas-subtle text-[10px] uppercase tracking-wider text-muted border-b border-border">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">SKUs</th>
                <th className="px-4 py-3 font-semibold">Price Range</th>
                <th className="px-4 py-3 font-semibold">Total Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const skus = p.skus || [];
                const isOpen = expanded.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <tr key={p.id} className="border-b border-border hover:bg-canvas-subtle/50">
                      <td className="px-4 py-3">
                        {skus.length > 0 && (
                          <button type="button" onClick={() => toggleExpand(p.id)} className="p-0.5 rounded hover:bg-canvas-subtle text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-accent-500 shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            {p.brand && <p className="text-xs text-muted">{p.brand}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{p.category_name || '—'}</td>
                      <td className="px-4 py-3 text-sm">{skus.length}</td>
                      <td className="px-4 py-3 text-sm font-medium">{priceRange(skus, formatCurrency)}</td>
                      <td className="px-4 py-3 text-sm">{p.stock_level ?? 0}</td>
                      <td className="px-4 py-3">
                        {p.archived_at ? <Badge>Archived</Badge> : <Badge variant="success">Active</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => handleDuplicate(p)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Copy className="w-3.5 h-3.5" /></button>
                          {p.archived_at
                            ? <button type="button" onClick={() => handleRestore(p)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><RotateCcw className="w-3.5 h-3.5" /></button>
                            : <button type="button" onClick={() => handleArchive(p)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Archive className="w-3.5 h-3.5" /></button>
                          }
                        </div>
                      </td>
                    </tr>
                    {isOpen && skus.map((sku: ProductSku) => (
                      <tr key={`${p.id}-sku-${sku.id}`} className="bg-canvas-subtle/40 border-b border-border/50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pl-8 text-sm">
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">Pack Size</p>
                              <p className="font-medium">{formatSkuLabel(sku)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">Barcode</p>
                              <p className="font-mono text-xs">{sku.barcode}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">Purchase</p>
                              <p>{formatCurrency(sku.cost_price)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">Sale</p>
                              <p className="font-medium text-accent-600">{formatCurrency(sku.selling_price)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">Stock</p>
                              <p className="font-semibold tabular-nums">{sku.stock_level ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted font-semibold">SKU Code</p>
                              <p className="font-mono text-xs">{sku.sku_code}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Product' : 'New Product'}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Product'}</Button>
          </>
        }
      >
        <ProductForm
          form={form}
          onChange={setForm}
          categories={categories}
          units={units}
          brands={brands}
          suppliers={suppliers}
          isEditing={!!editing}
          productId={editing?.id}
        />
      </Modal>
    </div>
  );
}
