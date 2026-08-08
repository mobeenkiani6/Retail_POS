import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getBranchId } from '../branch';

export type DomainEvent = {
  type: string;
  payload: Record<string, unknown>;
  branch_id?: string;
  emitted_at?: string;
};

export const REALTIME_EVENT = 'nycto:realtime';
export const SETTINGS_UPDATED_EVENT = 'nycto:settings-updated';
export const CATALOG_UPDATED_EVENT = 'nycto:catalog-updated';
export const SALES_UPDATED_EVENT = 'nycto:sales-updated';
export const INVENTORY_UPDATED_EVENT = 'nycto:inventory-updated';
export const BRANCH_UPDATED_EVENT = 'nycto:branch-updated';

const EVENT_NAMES = [
  'domain_event',
  'sale.completed',
  'inventory.changed',
  'product.updated',
  'catalog.updated',
  'settings.updated',
  'notification.created',
  'expense.created',
  'expense.updated',
  'branch.created',
  'branch.updated',
  'user.updated',
  'supplier.updated',
  'customer.updated',
] as const;

type Listener = (e: DomainEvent) => void;

let sharedSocket: Socket | null = null;
let sharedRefCount = 0;
const sharedListeners = new Set<Listener>();
let joinedBranch: string | null = null;

function socketBaseUrl() {
  const explicit = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5001';
  }
  return undefined;
}

function dispatchRealtime(e: DomainEvent) {
  window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: e }));
  const t = e.type;
  if (t === 'settings.updated') {
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: e }));
  }
  if (t === 'product.updated' || t === 'catalog.updated') {
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: e }));
  }
  if (t === 'sale.completed') {
    window.dispatchEvent(new CustomEvent(SALES_UPDATED_EVENT, { detail: e }));
  }
  if (t === 'inventory.changed') {
    window.dispatchEvent(new CustomEvent(INVENTORY_UPDATED_EVENT, { detail: e }));
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: e }));
  }
  if (t === 'branch.updated' || t === 'branch.created') {
    window.dispatchEvent(new CustomEvent(BRANCH_UPDATED_EVENT, { detail: e }));
  }
}

function forwardEvent(data: DomainEvent) {
  if (!data?.type || data.type === 'domain_event') {
    // domain_event envelope still has type field set to the real event name
    if (!data?.type) return;
  }
  if (!data?.type) return;
  // Prefer named events; domain_event duplicates are still fine for CustomEvent fan-out
  if (data.type !== 'domain_event') {
    dispatchRealtime(data);
  }
  sharedListeners.forEach((fn) => {
    try {
      fn(data);
    } catch {
      /* ignore */
    }
  });
}

function joinCurrentBranch(socket: Socket) {
  const branchId = getBranchId();
  if (joinedBranch && joinedBranch !== branchId) {
    socket.emit('leave_branch', { branch_id: joinedBranch });
  }
  joinedBranch = branchId || null;
  if (branchId) {
    socket.emit('join_branch', { branch_id: branchId });
  }
}

function ensureSharedSocket() {
  if (sharedSocket) return sharedSocket;

  const base = socketBaseUrl();
  const socket = io(base ? `${base}/events` : '/events', {
    path: '/socket.io',
    transports: ['polling'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    withCredentials: false,
    rememberUpgrade: false,
    autoConnect: true,
  });
  sharedSocket = socket;

  socket.on('connect', () => {
    joinCurrentBranch(socket);
  });

  for (const name of EVENT_NAMES) {
    socket.on(name, forwardEvent);
  }

  return socket;
}

function retainSharedSocket() {
  sharedRefCount += 1;
  ensureSharedSocket();
}

function releaseSharedSocket() {
  sharedRefCount = Math.max(0, sharedRefCount - 1);
  if (sharedRefCount === 0 && sharedSocket) {
    try {
      if (joinedBranch) sharedSocket.emit('leave_branch', { branch_id: joinedBranch });
    } catch {
      /* ignore */
    }
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
    joinedBranch = null;
  }
}

/** Connect POS to /events once and fan out browser CustomEvents for pages. */
export function usePosRealtimeSync(enabled = true) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    retainSharedSocket();
    const socket = ensureSharedSocket();

    const onConnect = () => {
      setConnected(true);
      joinCurrentBranch(socket);
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    if (socket.connected) onConnect();

    const rejoin = () => {
      if (socket.connected) joinCurrentBranch(socket);
    };
    window.addEventListener('focus', rejoin);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') rejoin();
    });

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === 'active_branch_id' && socket.connected) {
        joinCurrentBranch(socket);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', rejoin);
      window.removeEventListener('storage', onStorage);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      releaseSharedSocket();
    };
  }, [enabled]);

  return { connected };
}

/** Reload local page data when matching realtime events arrive.
 *  Does NOT refresh on window focus — that clears unsaved form state
 *  (e.g. a logo just picked from the file dialog).
 */
export function useRealtimeReload(
  eventNames: string[],
  reload: () => void,
  debounceMs = 400,
) {
  const timer = useRef<number | null>(null);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = eventNames.join('|');

  useEffect(() => {
    const onEvt = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => reloadRef.current(), debounceMs);
    };

    const names = key.split('|').filter(Boolean);
    for (const name of names) {
      window.addEventListener(name, onEvt);
    }

    return () => {
      for (const name of names) {
        window.removeEventListener(name, onEvt);
      }
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [key, debounceMs]);
}
