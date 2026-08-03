import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, Package, Users } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import DataTable from '../components/ui/DataTable';
import { get } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { TableSkeleton } from '../components/ui/Skeleton';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

type SalesReport = {
  total_sales: number; total_transactions: number; cogs: number;
  gross_profit: number; margin_percent: number;
  by_payment_method: { method: string; amount: number }[];
  by_day: { date: string; amount: number }[];
};

export default function Reports() {
  const [timeFilter, setTimeFilter] = useState('month');
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [products, setProducts] = useState<{ product_name: string; revenue: number; profit: number; quantity_sold: number }[]>([]);
  const [categories, setCategories] = useState<{ name: string; revenue: number }[]>([]);
  const [inventory, setInventory] = useState<{ cost_value: number; retail_value: number; total_units: number } | null>(null);
  const [cashiers, setCashiers] = useState<{ username: string; transactions: number; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = `?time_filter=${timeFilter}`;
    Promise.all([
      get<SalesReport>(`/v1/reports/sales${q}`),
      get<{ products?: typeof products }>(`/v1/reports/products${q}`),
      get<{ categories?: typeof categories }>(`/v1/reports/categories${q}`),
      get<typeof inventory>(`/v1/reports/inventory-valuation`),
      get<{ cashiers?: typeof cashiers }>(`/v1/reports/cashiers${q}`),
    ]).then(([s, p, c, inv, cash]) => {
      setSales(s);
      setProducts(p?.products ?? []);
      setCategories(c?.categories ?? []);
      setInventory(inv);
      setCashiers(cash?.cashiers ?? []);
    }).finally(() => setLoading(false));
  }, [timeFilter]);

  const filters = [
    { id: 'today', label: 'Today' }, { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' }, { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Reports"
        description="Sales, profit, inventory valuation, and performance analytics"
        actions={
          <div className="flex gap-1 p-1 rounded-xl bg-canvas-subtle border border-border">
            {filters.map(f => (
              <button key={f.id} onClick={() => setTimeFilter(f.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeFilter === f.id ? 'bg-surface shadow-soft text-foreground' : 'text-muted hover:text-foreground'}`}>
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl animate-shimmer" />)}
          </div>
          <TableSkeleton />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Sales" value={formatCurrency(sales?.total_sales ?? 0)} icon={DollarSign} trend={`${sales?.total_transactions ?? 0} transactions`} />
            <StatCard label="Gross Profit" value={formatCurrency(sales?.gross_profit ?? 0)} icon={TrendingUp} trend={`${sales?.margin_percent ?? 0}% margin`} />
            <StatCard label="COGS" value={formatCurrency(sales?.cogs ?? 0)} icon={Package} />
            <StatCard label="Inventory Value" value={formatCurrency(inventory?.retail_value ?? 0)} icon={Users} trend={`${inventory?.total_units ?? 0} units`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="surface-card p-5">
              <h3 className="font-semibold mb-4">Daily Sales</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sales?.by_day ?? []}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="surface-card p-5">
              <h3 className="font-semibold mb-4">Payment Methods</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sales?.by_payment_method ?? []} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={80} label={({ method, percent }) => `${method} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {(sales?.by_payment_method ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">Top Products</h3>
              <DataTable
                data={products as Record<string, unknown>[]}
                emptyMessage="No sales data"
                columns={[
                  { key: 'product_name', header: 'Product' },
                  { key: 'quantity_sold', header: 'Qty' },
                  { key: 'revenue', header: 'Revenue', render: r => formatCurrency(Number(r.revenue)) },
                  { key: 'profit', header: 'Profit', render: r => <span className="text-success font-medium">{formatCurrency(Number(r.profit))}</span> },
                ]}
              />
            </div>
            <div>
              <h3 className="font-semibold mb-3">Cashier Performance</h3>
              <DataTable
                data={cashiers as Record<string, unknown>[]}
                emptyMessage="No cashier data"
                columns={[
                  { key: 'username', header: 'Cashier' },
                  { key: 'transactions', header: 'Transactions' },
                  { key: 'total', header: 'Total', render: r => formatCurrency(Number(r.total)) },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
