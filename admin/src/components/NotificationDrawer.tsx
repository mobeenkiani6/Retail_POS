import { useEffect, useState } from 'react';
import { X, Bell, ScrollText } from 'lucide-react';
import { get } from '../api/client';
import { useNotificationsStore, type Notification } from '../stores/notifications';

export type { Notification };

/** Keep newest notification per title (case-insensitive). */
export function dedupeNotifications(list: Notification[]): Notification[] {
  const seen = new Set<string>();
  const out: Notification[] = [];
  const sorted = [...list].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  for (const n of sorted) {
    const key = (n.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

type AuditRow = {
  id: number;
  action?: string;
  username?: string;
  user_id?: number;
  created_at?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NotificationDrawer({ open, onClose }: Props) {
  const {
    notifications,
    unread,
    loading: notifLoading,
    load,
    markAllRead,
  } = useNotificationsStore();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [tab, setTab] = useState<'alerts' | 'audit'>('alerts');

  useEffect(() => {
    if (!open) return;
    void load();
    let cancelled = false;
    setAuditLoading(true);
    get<AuditRow[]>('/v1/admin/audit-logs?limit=40')
      .then((a) => {
        if (!cancelled) setAudit(Array.isArray(a) ? a : []);
      })
      .catch(() => {
        if (!cancelled) setAudit([]);
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const loading = tab === 'alerts' ? notifLoading : auditLoading;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close notifications"
        onClick={onClose}
      />
      <aside
        className="relative w-full max-w-md h-full bg-surface border-l border-border shadow-lg flex flex-col animate-in"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <div className="font-semibold text-sm">Notifications</div>
            <div className="text-xs text-muted">{unread} unread</div>
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button type="button" className="btn-ghost text-xs" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            )}
            <button type="button" className="btn-ghost p-2" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 px-3 pt-3">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
              tab === 'alerts' ? 'bg-accent-600 text-white' : 'bg-canvas-subtle text-foreground-secondary'
            }`}
            onClick={() => setTab('alerts')}
          >
            <Bell size={14} /> Alerts
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
              tab === 'audit' ? 'bg-accent-600 text-white' : 'bg-canvas-subtle text-foreground-secondary'
            }`}
            onClick={() => setTab('audit')}
          >
            <ScrollText size={14} /> Audit
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          ) : tab === 'alerts' ? (
            <ul className="space-y-2">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-xl border border-border p-3 ${n.read ? 'opacity-60' : 'bg-canvas-subtle/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm">{n.title}</div>
                    {!n.read && <span className="mt-1 h-2 w-2 rounded-full bg-accent-500 shrink-0" />}
                  </div>
                  {n.message && <div className="text-xs text-muted mt-1">{n.message}</div>}
                  {n.created_at && (
                    <div className="text-[10px] text-muted mt-2">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  )}
                </li>
              ))}
              {!notifications.length && (
                <li className="text-sm text-muted text-center py-10">No notifications</li>
              )}
            </ul>
          ) : (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="font-medium">{a.action}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {a.username || a.user_id || 'system'}
                    {a.created_at ? ` · ${new Date(a.created_at).toLocaleString()}` : ''}
                  </div>
                </li>
              ))}
              {!audit.length && (
                <li className="text-sm text-muted text-center py-10">No audit entries</li>
              )}
            </ul>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.8; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
