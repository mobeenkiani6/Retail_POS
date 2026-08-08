import { useEffect, useRef, useCallback } from 'react';
import { useDomainEvents, type DomainEvent } from '../hooks/useEvents';
import { useDashboardStore } from '../stores/dashboard';
import { useProductsStore } from '../stores/products';
import { useSalesStore } from '../stores/sales';
import { useCustomersStore } from '../stores/customers';
import { useSuppliersStore } from '../stores/suppliers';
import { useEmployeesStore } from '../stores/employees';
import { useFinanceStore } from '../stores/finance';
import { useMarketingStore } from '../stores/marketing';
import { useSettingsStore } from '../stores/settings';
import { useNotificationsStore } from '../stores/notifications';
import { useBranchFilter } from '../stores/branch';
import { useReportsStore } from '../stores/reports';

/**
 * Keep Zustand domain stores fresh when POS (or another admin) mutates data.
 * Debounced so a burst of events (sale + inventory) only reloads once.
 */
export function useAdminRealtimeSync(enabled = true) {
  const timer = useRef<number | null>(null);
  const pending = useRef<Set<string>>(new Set());

  const flush = useCallback(() => {
    const types = pending.current;
    pending.current = new Set();
    if (!types.size) return;

    if (types.has('settings.updated')) {
      void useSettingsStore.getState().load();
    }
    if (types.has('notification.created')) {
      void useNotificationsStore.getState().load();
    }
    if (types.has('sale.completed') || types.has('inventory.changed')) {
      void useDashboardStore.getState().loadOverview();
      void useSalesStore.getState().load();
      useProductsStore.getState().invalidate();
      void useProductsStore.getState().load(true);
      void useFinanceStore.getState().load();
      void useReportsStore.getState().loadSummary();
    }
    if (
      types.has('product.updated') ||
      types.has('catalog.updated') ||
      types.has('inventory.changed')
    ) {
      useProductsStore.getState().invalidate();
      void useProductsStore.getState().load(true);
      void useMarketingStore.getState().load();
    }
    if (types.has('expense.created') || types.has('expense.updated')) {
      void useFinanceStore.getState().load();
      void useDashboardStore.getState().loadOverview();
    }
    if (types.has('branch.created') || types.has('branch.updated')) {
      void useBranchFilter.getState().load();
      void useBranchFilter.getState().loadAll();
    }
    if (types.has('user.updated')) {
      void useEmployeesStore.getState().load();
    }
    if (types.has('customer.updated') || types.has('sale.completed')) {
      void useCustomersStore.getState().load();
    }
    if (types.has('supplier.updated')) {
      void useSuppliersStore.getState().load();
    }
  }, []);

  const lastPayload = useRef<Record<string, unknown> | null>(null);

  const onEvent = useCallback(
    (e: DomainEvent) => {
      const t = e?.type;
      if (!t || t === 'domain_event') return;
      pending.current.add(t);
      lastPayload.current = e.payload || null;

      // Instant header update for branch rename (don't wait for refetch)
      if (t === 'branch.updated' && e.payload?.id && e.payload?.name) {
        const id = String(e.payload.id);
        const name = String(e.payload.name);
        const patch = (list: { id: string; name: string }[]) =>
          list.map((b) => (b.id === id ? { ...b, name } : b));
        const st = useBranchFilter.getState();
        useBranchFilter.setState({
          branches: patch(st.branches) as typeof st.branches,
          allBranches: patch(st.allBranches) as typeof st.allBranches,
        });
      }

      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 350);
    },
    [flush],
  );

  const { connected } = useDomainEvents(onEvent, enabled);

  // Fallback: when tab becomes visible, soft-refresh common stores
  useEffect(() => {
    if (!enabled) return;
    const refreshVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void useSettingsStore.getState().load();
      void useNotificationsStore.getState().load();
      void useSalesStore.getState().load();
      void useDashboardStore.getState().loadOverview();
      void useBranchFilter.getState().load();
      useProductsStore.getState().invalidate();
      void useProductsStore.getState().load(true);
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [enabled]);

  // While disconnected, poll so Admin still catches up without a hard refresh
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (connected) return;
      void useSettingsStore.getState().load();
      void useSalesStore.getState().load();
      void useNotificationsStore.getState().load();
      useProductsStore.getState().invalidate();
      void useProductsStore.getState().load(true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [enabled, connected]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);
}
