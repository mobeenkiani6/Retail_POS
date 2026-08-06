import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

type DomainEvent = {
  type: string;
  payload: Record<string, unknown>;
  branch_id?: string;
  emitted_at?: string;
};

/** Connect straight to Flask — Vite's WS proxy breaks Engine.IO upgrades on Windows. */
function socketBaseUrl() {
  const explicit = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5001';
  }
  return undefined; // same origin in production
}

export function useDomainEvents(onEvent: (e: DomainEvent) => void, enabled = true) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const base = socketBaseUrl();
    const socket = io(base ? `${base}/events` : '/events', {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1000,
      withCredentials: false,
      // Avoid racing a WS upgrade that Vite may corrupt
      rememberUpgrade: false,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_admin');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('domain_event', (data: DomainEvent) => handlerRef.current(data));
    socket.on('sale.completed', (data: DomainEvent) => handlerRef.current(data));
    socket.on('inventory.changed', (data: DomainEvent) => handlerRef.current(data));
    socket.on('product.updated', (data: DomainEvent) => handlerRef.current(data));
    socket.on('settings.updated', (data: DomainEvent) => handlerRef.current(data));
    socket.on('notification.created', (data: DomainEvent) => handlerRef.current(data));

    return () => {
      try {
        socket.emit('leave_admin');
      } catch {
        /* ignore */
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled]);

  return { connected, socket: socketRef.current };
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
    }, 15000);
    return () => window.clearInterval(id);
  }, [connected, refresh]);

  return { connected };
}
