import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export type DomainEvent = {
  type: string;
  payload: Record<string, unknown>;
  branch_id?: string;
  emitted_at?: string;
};

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
let sharedConnected = false;
const connectedSubs = new Set<(v: boolean) => void>();

function socketBaseUrl() {
  const explicit = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5001';
  }
  return undefined;
}

function setSharedConnected(v: boolean) {
  sharedConnected = v;
  connectedSubs.forEach((fn) => fn(v));
}

function forwardEvent(data: DomainEvent) {
  if (!data?.type) return;
  sharedListeners.forEach((fn) => {
    try {
      fn(data);
    } catch {
      /* ignore listener errors */
    }
  });
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
    setSharedConnected(true);
    socket.emit('join_admin');
  });
  socket.on('disconnect', () => setSharedConnected(false));
  socket.on('connect_error', () => setSharedConnected(false));

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
      sharedSocket.emit('leave_admin');
    } catch {
      /* ignore */
    }
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
    setSharedConnected(false);
  }
}

/** Shared Socket.IO connection for the whole admin app (avoids duplicate sockets). */
export function useDomainEvents(onEvent: (e: DomainEvent) => void, enabled = true) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const [connected, setConnected] = useState(sharedConnected);

  useEffect(() => {
    if (!enabled) return;

    const listener: Listener = (e) => handlerRef.current(e);
    sharedListeners.add(listener);
    connectedSubs.add(setConnected);
    retainSharedSocket();
    setConnected(sharedConnected);

    // Re-join HQ on tab focus (in case the room was lost after reconnect)
    const onFocus = () => {
      if (sharedSocket?.connected) sharedSocket.emit('join_admin');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      sharedListeners.delete(listener);
      connectedSubs.delete(setConnected);
      releaseSharedSocket();
    };
  }, [enabled]);

  return { connected, socket: sharedSocket };
}

export function useRefreshOnEvents(refresh: () => void, debounceMs = 800) {
  const timer = useRef<number | null>(null);
  const stableRefresh = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => refresh(), debounceMs);
  }, [refresh, debounceMs]);

  const { connected } = useDomainEvents(() => stableRefresh());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!connected) refresh();
    }, 12000);
    return () => window.clearInterval(id);
  }, [connected, refresh]);

  return { connected };
}
