import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import { get } from '../api';
import { formatCurrency } from '../utils/formatCurrency';

type HealthData = {
  by_status: Record<string, number>;
  expiring_timeline: { product_name: string; batch_number: string; quantity: number; days_left: number; expiry_date: string }[];
  category_risk: { category: string; at_risk_units: number }[];
  total_value_at_risk: number;
  near_expiry_days: number;
  markdown_percent: number;
  health_score: number;
};

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#a1a1aa'];

export default function InventoryHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const branchId = localStorage.getItem('active_branch_id') || '1';
    get<HealthData>(`/v1/inventory-health/summary?branch_id=${branchId}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;
  if (!data) return <div className="p-8 text-red-600">Failed to load inventory health</div>;

  const pieData = Object.entries(data.by_status).map(([name, value]) => ({ name, value }));

  return (
    <div className="flex-1 overflow-auto p-8">
      <PageHeader title="Inventory Health" description="Expiry analytics, at-risk inventory, and auto-markdown status" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Health Score" value={`${data.health_score}%`} />
        <StatCard label="Value at Risk" value={formatCurrency(data.total_value_at_risk)} />
        <StatCard label="Near-Expiry Window" value={`${data.near_expiry_days} days`} />
        <StatCard label="Auto Markdown" value={`${data.markdown_percent}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Batch Status Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Category Risk</h3>
          <ul className="space-y-2">
            {data.category_risk.map(c => (
              <li key={c.category} className="flex justify-between text-sm p-2 rounded-lg bg-amber-50">
                <span>{c.category}</span>
                <span className="font-bold text-amber-800">{c.at_risk_units} units</span>
              </li>
            ))}
            {data.category_risk.length === 0 && <p className="text-neutral-400 text-sm">No at-risk categories</p>}
          </ul>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Expiring Timeline</h3>
        <div className="space-y-2">
          {data.expiring_timeline.slice(0, 20).map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-neutral-100">
              <div>
                <p className="font-medium text-sm">{item.product_name}</p>
                <p className="text-xs text-neutral-500">Batch {item.batch_number} · {item.quantity} units</p>
              </div>
              <div className="text-right">
                <StatusBadge status={item.days_left <= 0 ? 'expired' : item.days_left <= data.near_expiry_days ? 'near_expiry' : 'active'} />
                <p className="text-xs text-neutral-500 mt-1">{item.days_left}d left</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
