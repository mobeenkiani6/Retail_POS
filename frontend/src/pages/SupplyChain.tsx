import { useEffect, useState } from 'react';
import { Truck, Plus, Edit2, Cloud, RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import { get, post, put, getUserMessage } from '../api';
import { showToast } from '../components/Toast';

type Supplier = { id: number; name: string; contact_name?: string; email?: string; phone?: string; address?: string };
type SyncEvent = { id: number; event_type: string; invoice_uuid?: string; created_at?: string; status?: string; attempts?: number };

export default function SupplyChain() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; failed: number; synced: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', address: '' });
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, sync] = await Promise.all([
        get<{ suppliers?: Supplier[] }>('/v1/suppliers/'),
        get<{ pending: number; failed: number; synced: number; events?: SyncEvent[] }>('/v1/sync/outbox'),
      ]);
      setSuppliers(s?.suppliers ?? []);
      setSyncStatus(sync);
      setSyncEvents((sync as { recent_pending?: SyncEvent[] })?.recent_pending ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', contact_name: '', email: '', phone: '', address: '' }); setModalOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_name: s.contact_name || '', email: s.email || '', phone: s.phone || '', address: s.address || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
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
    }
  };

  const flushSync = async () => {
    setSyncing(true);
    try {
      await post('/v1/sync/flush', {});
      showToast('Sync queue flushed', 'success');
      load();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'synced') return <CheckCircle className="w-4 h-4 text-success" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-danger" />;
    return <Clock className="w-4 h-4 text-warning" />;
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Supply Chain"
        description="Supplier management and cloud sync monitoring"
        actions={<Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Supplier</Button>}
      />

      {/* Cloud Sync Monitor */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Cloud className="w-4 h-4 text-accent-600" /> Cloud Sync Monitor</h3>
          <Button size="sm" variant="secondary" onClick={flushSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Retry Failed
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <StatCard label="Pending" value={syncStatus?.pending ?? 0} icon={Clock} trend="Awaiting sync" />
          <StatCard label="Synced" value={syncStatus?.synced ?? 0} icon={CheckCircle} trend="Successfully synced" />
          <StatCard label="Failed" value={syncStatus?.failed ?? 0} icon={XCircle} trend="Needs attention" />
        </div>
        {syncEvents.length > 0 && (
          <div className="surface-card p-4 space-y-2">
            {syncEvents.slice(0, 10).map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-border text-sm">
                <div className="flex items-center gap-2">
                  {statusIcon(e.status || 'pending')}
                  <span className="font-medium capitalize">{e.event_type.replace('_', ' ')}</span>
                  <Badge variant="warning">pending</Badge>
                </div>
                <div className="text-xs text-muted">
                  {(e.attempts ?? 0) > 0 && `${e.attempts} attempts · `}
                  {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suppliers */}
      <div>
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Truck className="w-4 h-4" /> Suppliers</h3>
        <DataTable
          loading={loading}
          data={suppliers as unknown as Record<string, unknown>[]}
          emptyMessage="No suppliers yet"
          columns={[
            { key: 'name', header: 'Name', render: r => <span className="font-medium">{String(r.name)}</span> },
            { key: 'contact_name', header: 'Contact', render: r => String(r.contact_name || '—') },
            { key: 'email', header: 'Email', render: r => String(r.email || '—') },
            { key: 'phone', header: 'Phone', render: r => String(r.phone || '—') },
          ]}
          actions={r => {
            const s = r as unknown as Supplier;
            return (
              <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-canvas-subtle text-muted"><Edit2 className="w-3.5 h-3.5" /></button>
            );
          }}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'New Supplier'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Contact Name" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
