import { useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useBranchFilter } from '../stores/branch';
import { useDashboardStore } from '../stores/dashboard';
import { useRefreshOnEvents } from '../hooks/useEvents';
import { TrendingUp, ShoppingBag, Package, Users, AlertTriangle, Wifi } from 'lucide-react';
import { fullLabel } from '../components/TableTools';

function money(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof TrendingUp }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel p-4"
    >
      <div className="flex items-start justify-between">
        <div className="section-label">{label}</div>
        <Icon size={16} className="text-accent-600" />
      </div>
      <div className="text-2xl font-bold mt-2 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </motion.div>
  );
}

export function DashboardPage() {
  const { selectedBranchId } = useBranchFilter();
  const { overview: data, bi, loading, loadAll } = useDashboardStore();

  const load = useCallback(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    load();
  }, [load, selectedBranchId]);

  const { connected } = useRefreshOnEvents(load);

  if (loading && !data) return <div className="skeleton h-64" />;
  if (!data) return <div className="text-muted text-sm">Unable to load dashboard</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Live store performance</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-success' : 'text-muted'}`}>
          <Wifi size={12} />
          {connected ? 'Live' : 'Polling'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Today" value={money(data.revenue.today?.revenue)} sub={`${data.revenue.today?.orders || 0} orders · ${money(data.revenue.today?.profit || 0)} profit`} icon={TrendingUp} />
        <Kpi label="This week" value={money(data.revenue.week?.revenue)} sub={`${data.revenue.week?.orders || 0} orders`} icon={ShoppingBag} />
        <Kpi label="This month" value={money(data.revenue.month?.revenue)} sub={`${money(data.revenue.month?.profit || 0)} profit`} icon={TrendingUp} />
        <Kpi label="This year" value={money(data.revenue.year?.revenue)} sub={`${data.revenue.year?.orders || 0} orders`} icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Orders today" value={String(data.orders.total || 0)} sub={`Completed ${data.orders.completed || 0} · Held ${data.orders.held || 0} · Refunded ${data.orders.refunded || 0}`} icon={ShoppingBag} />
        <Kpi label="Low / out of stock" value={`${data.inventory.low_stock || 0} / ${data.inventory.out_of_stock || 0}`} sub={`Expiring ${data.inventory.expiring || 0} · Dead ${data.inventory.dead_stock || 0}`} icon={AlertTriangle} />
        <Kpi label="Customers" value={String(data.customers.active || 0)} sub={`New today ${data.customers.new || 0} · ${fullLabel('VIP')} ${data.customers.vip || 0}`} icon={Users} />
        <Kpi label="Inventory value" value={money(data.inventory.inventory_value || 0)} sub={`${data.inventory.total_skus || 0} ${fullLabel('SKUs')} · ${data.employees.active || 0} staff`} icon={Package} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-4 lg:col-span-2">
          <div className="section-label mb-3">Sales trend (14d)</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bi?.sales_trend || []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} hide={false} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Peak hours</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bi?.peak_hours || []}>
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} width={28} />
                <Tooltip />
                <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="section-label mb-3">Top selling</div>
          <ul className="space-y-2">
            {(data.products.top_selling || []).slice(0, 5).map((p) => (
              <li key={p.id} className="flex justify-between text-sm gap-2">
                <span className="truncate">{p.name}</span>
                <span className="text-muted shrink-0">{money(p.revenue)}</span>
              </li>
            ))}
            {!data.products.top_selling?.length && <li className="text-sm text-muted">No sales yet</li>}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Cashier leaderboard</div>
          <ul className="space-y-2">
            {(data.employees.leaderboard || []).slice(0, 5).map((e) => (
              <li key={e.username} className="flex justify-between text-sm gap-2">
                <span>{e.username}</span>
                <span className="text-muted">{money(e.sales_total)}</span>
              </li>
            ))}
            {!data.employees.leaderboard?.length && <li className="text-sm text-muted">No activity today</li>}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Insights</div>
          <ul className="space-y-3">
            {(bi?.insights || []).slice(0, 4).map((ins, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium">{ins.title}</div>
                <div className="text-muted text-xs mt-0.5">{ins.message}</div>
              </li>
            ))}
            {bi?.kpis && (
              <li className="text-xs text-muted border-t border-border pt-2">
                {fullLabel('AOV')} {money(bi.kpis.aov)} · Basket {bi.kpis.avg_basket_size} · Repeat {bi.kpis.repeat_purchase_rate}%
              </li>
            )}
            {!bi?.insights?.length && <li className="text-sm text-muted">Collecting signal…</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
