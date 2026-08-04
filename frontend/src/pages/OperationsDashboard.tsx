import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, Package, Users, Cloud, AlertTriangle,
  Activity, ShoppingBag, Loader2, Boxes, TrendingDown,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { get, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { getBranchId } from '../branch';

type DashboardData = {
  today_sales_count: number;
  today_revenue: number;
  gross_profit: number;
  cogs: number;
  inventory_value: number;
  total_skus: number;
  total_units: number;
  customers_today: number;
  active_cashiers: number;
  pending_sync: number;
  low_stock_count: number;
  out_of_stock_count: number;
  top_categories: { name: string; revenue: number }[];
  top_products: { name: string; quantity: number }[];
  hourly_sales: number[];
  inventory_health_score: number;
  recent_activity: { action: string; entity_type: string; created_at: string }[];
  store_status: string;
  cloud_sync_status: string;
};

export default function OperationsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const branchId = getBranchId();
    get<DashboardData>(`/v1/dashboard/operations?branch_id=${branchId}`)
      .then(setData)
      .catch(e => setError(getUserMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-danger">{error || 'Failed to load dashboard'}</div>;
  }

  const hourlyData = data.hourly_sales.map((v, i) => ({ hour: `${i}:00`, revenue: v }));
  const revenueTrend = hourlyData.filter(d => d.revenue > 0);

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Operations Dashboard"
        description="Real-time store performance and inventory overview"
        actions={
          <div className="flex gap-2">
            <Badge variant={data.store_status === 'open' ? 'success' : 'warning'}>Store {data.store_status}</Badge>
            <Badge variant={data.cloud_sync_status === 'online' ? 'success' : 'warning'}>
              <Cloud className="w-3 h-3 mr-1 inline" /> Sync {data.cloud_sync_status}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's Sales" value={data.today_sales_count} icon={ShoppingBag} />
        <StatCard label="Revenue" value={formatCurrency(data.today_revenue)} icon={DollarSign} />
        <StatCard label="Gross Profit" value={formatCurrency(data.gross_profit)} sub={`COGS ${formatCurrency(data.cogs)}`} icon={TrendingUp} />
        <StatCard label="Inventory Value" value={formatCurrency(data.inventory_value)} icon={Package} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total SKUs" value={data.total_skus} icon={Boxes} />
        <StatCard label="Units in Stock" value={data.total_units} />
        <StatCard label="Customers Today" value={data.customers_today} icon={Users} />
        <StatCard label="Health Score" value={`${data.inventory_health_score}%`} icon={Activity} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-warning-soft border border-warning/20">
          <p className="text-xs font-medium text-warning flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> Low Stock</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.low_stock_count}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-danger-soft border border-danger/20">
          <p className="text-xs font-medium text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Out of Stock</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.out_of_stock_count}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-canvas-subtle border border-border">
          <p className="text-xs font-medium text-muted">Pending Cloud Sync</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.pending_sync}</p>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Hourly Sales</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {revenueTrend.length > 1 && (
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-4">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Top Categories</h3>
          {data.top_categories.length === 0 ? (
            <p className="text-sm text-muted">No sales today yet.</p>
          ) : (
            <div className="space-y-2">
              {data.top_categories.map(c => (
                <div key={c.name} className="flex justify-between text-sm">
                  <span className="text-foreground-secondary">{c.name}</span>
                  <span className="font-medium">{formatCurrency(c.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Top Products</h3>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-muted">No sales today yet.</p>
          ) : (
            <div className="space-y-2">
              {data.top_products.map(p => (
                <div key={p.name} className="flex justify-between text-sm">
                  <span className="text-foreground-secondary truncate">{p.name}</span>
                  <span className="font-medium">{p.quantity} sold</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
