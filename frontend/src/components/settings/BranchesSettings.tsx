import { useState, useEffect } from 'react';
import { Loader2, MapPin, Phone, Copy, Check, Building2 } from 'lucide-react';
import { showToast } from '../Toast';
import { get, put, getUserMessage } from '../../api';
import { getBranchId, setActiveBranchId } from '../../branch';
import { useRealtimeReload, BRANCH_UPDATED_EVENT, REALTIME_EVENT } from '../../hooks/useRealtimeSync';
import type { DomainEvent } from '../../hooks/useRealtimeSync';

type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string;
  user_count: number;
};

export default function BranchesSettings() {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    fetchBranch();
  }, []);

  // Live-sync when Admin (or another client) updates this branch
  useRealtimeReload([BRANCH_UPDATED_EVENT], () => {
    void fetchBranch({ soft: true });
  });

  useEffect(() => {
    const onRealtime = (ev: Event) => {
      const detail = (ev as CustomEvent<DomainEvent>).detail;
      if (detail?.type !== 'branch.updated') return;
      const payload = detail.payload || {};
      if (branch && payload.id && String(payload.id) !== branch.id) return;
      if (payload.name != null) setName(String(payload.name));
      if (payload.address != null) setAddress(String(payload.address));
      if (payload.phone != null) setPhone(String(payload.phone));
      setBranch((prev) =>
        prev
          ? {
              ...prev,
              name: payload.name != null ? String(payload.name) : prev.name,
              address: payload.address != null ? String(payload.address) : prev.address,
              phone: payload.phone != null ? String(payload.phone) : prev.phone,
            }
          : prev,
      );
    };
    window.addEventListener(REALTIME_EVENT, onRealtime);
    return () => window.removeEventListener(REALTIME_EVENT, onRealtime);
  }, [branch?.id]);

  const fetchBranch = async (opts?: { soft?: boolean }) => {
    try {
      if (!opts?.soft) setLoading(true);
      const data = await get<Branch[]>('/branches/');
      const list = Array.isArray(data) ? data : [];
      const b = list[0] || null;
      setBranch(b);
      if (b) {
        setName(b.name);
        setAddress(b.address || '');
        setPhone(b.phone || '');
        setActiveBranchId(b.id);
      }
    } catch (e) {
      if (!opts?.soft) showToast(getUserMessage(e), 'error');
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!branch || !name.trim()) {
      showToast('Branch name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await put(`/branches/${branch.id}`, {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
      });
      showToast('Branch updated', 'success');
      void fetchBranch({ soft: true });
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyId = async () => {
    const id = branch?.id || getBranchId();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('Could not copy branch ID', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12 text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="max-w-2xl rounded-2xl border border-dashed border-border p-8 text-center text-muted">
        No branch found for this POS. Complete setup or set <code className="text-foreground">BRANCH_ID</code> to
        the admin-panel hex id.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-foreground">This Branch</h3>
        <p className="text-sm text-muted mt-1">
          This POS is single-branch scoped. The hex ID below links it to the admin panel.
        </p>
      </div>

      <div className="surface-card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 text-accent-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Branch ID (hex)</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-foreground truncate">{branch.id}</code>
              <button
                type="button"
                onClick={copyId}
                className="p-1.5 rounded-lg text-muted hover:text-accent-600 hover:bg-accent-500/10 transition-colors"
                title="Copy branch ID"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">{branch.user_count} user(s) assigned</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground-secondary mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-base"
            placeholder="Store name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground-secondary mb-1">
            <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input-base"
            placeholder="Street, city"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground-secondary mb-1">
            <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-base"
            placeholder="+92 …"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-accent-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-accent-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
