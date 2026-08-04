import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import { get } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { getBranchId } from '../branch';

export default function BusinessIntelligence() {
  const [analytics, setAnalytics] = useState<{ total_sales: number; total_transactions: number; gross_profit: number; cogs: number } | null>(null);
  const [sales, setSales] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const branchId = getBranchId();
    Promise.all([
      get<{ total_sales: number; total_transactions: number; gross_profit: number; cogs: number }>(`/sales/analytics?time_filter=today&branch_id=${branchId}`),
      get<{ sales?: Record<string, unknown>[] }>(`/sales/?time_filter=week&branch_id=${branchId}`),
    ]).then(([a, s]) => {
      setAnalytics(a);
      setSales(s?.sales ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-auto p-8">
      <PageHeader title="Business Intelligence" description="Sales analytics, COGS, and transaction reports" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today's Revenue" value={formatCurrency(analytics?.total_sales ?? 0)} />
        <StatCard label="Transactions" value={analytics?.total_transactions ?? 0} />
        <StatCard label="Gross Profit" value={formatCurrency(analytics?.gross_profit ?? 0)} />
        <StatCard label="COGS" value={formatCurrency(analytics?.cogs ?? 0)} />
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Recent Transactions (This Week)</h3>
        <DataTable
          columns={[
            { key: 'id', header: 'Sale #' },
            { key: 'invoice_uuid', header: 'Invoice', render: r => <span className="font-mono text-xs">{String(r.invoice_uuid).slice(0, 8)}…</span> },
            { key: 'total_amount', header: 'Total', render: r => formatCurrency(Number(r.total_amount)) },
            { key: 'cogs_amount', header: 'COGS', render: r => formatCurrency(Number(r.cogs_amount || 0)) },
            { key: 'payment_method', header: 'Payment' },
            { key: 'created_at', header: 'Date', render: r => r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—' },
          ]}
          data={sales}
        />
      </Card>
    </div>
  );
}
