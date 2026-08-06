import { useEffect } from 'react';
import { useBranchFilter } from '../stores/branch';
import { useDashboardStore } from '../stores/dashboard';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { fullLabel } from '../components/TableTools';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#10b981'];

export function BiPage() {
  const { selectedBranchId } = useBranchFilter();
  const { bi: data, affinity, loadBi, loadAffinity } = useDashboardStore();

  useEffect(() => {
    void loadBi(30);
    void loadAffinity();
  }, [loadBi, loadAffinity, selectedBranchId]);

  const kpis = (data?.kpis || {}) as Record<string, number>;
  const trend = (data?.sales_trend || []) as { date: string; revenue: number; profit: number }[];
  const payments = (data?.payment_methods || []) as { method: string; amount: number }[];
  const insights = (data?.insights || []) as { title: string; message: string; severity: string }[];
  const branches = (data?.branch_performance || []) as { name: string; revenue: number; orders: number }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Business Intelligence</h1>
        <p className="text-sm text-muted mt-1">Trends, affinity, and rule-based insights</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Revenue', kpis.revenue],
          [fullLabel('AOV'), kpis.aov],
          ['Basket size', kpis.avg_basket_size],
          ['Repeat %', kpis.repeat_purchase_rate],
        ].map(([l, v]) => (
          <div key={String(l)} className="panel p-4">
            <div className="section-label">{l as string}</div>
            <div className="text-2xl font-bold mt-2">{v ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="section-label mb-3">Revenue & profit</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb33" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" fill="#10b98122" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Payment mix</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={payments} dataKey="amount" nameKey="method" outerRadius={90} label>
                  {payments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="section-label mb-3">Branch performance</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branches}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Cross-sell affinity</div>
          <ul className="space-y-2 text-sm max-h-56 overflow-y-auto">
            {(affinity?.pairs || []).slice(0, 12).map((p, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{p.product_a.name} + {p.product_b.name}</span>
                <span className="text-muted shrink-0">{p.count}×</span>
              </li>
            ))}
            {!affinity?.pairs?.length && <li className="text-muted">Not enough co-occurrence data</li>}
          </ul>
        </div>
      </div>
      <div className="panel p-4">
        <div className="section-label mb-3">Insights & recommendations</div>
        <div className="grid md:grid-cols-2 gap-3">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="font-medium text-sm">{ins.title}</div>
              <div className="text-xs text-muted mt-1">{ins.message}</div>
            </div>
          ))}
          {!insights.length && <div className="text-sm text-muted">No anomalies detected</div>}
        </div>
      </div>
    </div>
  );
}
