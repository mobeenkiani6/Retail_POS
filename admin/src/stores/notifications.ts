import { create } from 'zustand';
import { get as apiGet, patch } from '../api/client';
import { errMsg } from './helpers';

export type Notification = {
  id: number;
  title: string;
  message?: string;
  severity?: string;
  read?: boolean;
  created_at?: string;
};

function dedupe(list: Notification[]): Notification[] {
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

type NotificationsState = {
  notifications: Notification[];
  unread: number;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unread: 0,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const r = await apiGet<{
        unread?: number;
        notifications?: Notification[];
      }>('/v1/admin/notifications');
      const list = dedupe((r.notifications || []) as Notification[]);
      const unread =
        typeof r.unread === 'number' ? r.unread : list.filter((n) => !n.read).length;
      set({ notifications: list, unread, loading: false });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  markRead: async (id) => {
    await patch(`/v1/admin/notifications/${id}/read`).catch(() => undefined);
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
    set({
      notifications,
      unread: notifications.filter((n) => !n.read).length,
    });
  },

  markAllRead: async () => {
    await patch('/v1/notifications/read-all').catch(async () => {
      const unreadIds = get().notifications.filter((n) => !n.read).map((n) => n.id);
      await Promise.all(
        unreadIds.map((id) => patch(`/v1/admin/notifications/${id}/read`).catch(() => undefined)),
      );
    });
    const notifications = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications, unread: 0 });
  },
}));
