import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { get, getUserMessage } from '../api';
import { formatCurrency } from '../utils/formatCurrency';
import { getBranchId } from '../branch';
import { showToast } from '../components/Toast';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
] as const;

function periodTitle(filter: string) {
  switch (filter) {
    case 'today': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'custom': return 'Custom Range';
    default: return 'Selected Period';
  }
}

export default function BusinessIntelligence() {
  const [analytics, setAnalytics] = useState<{
    total_sales: number;
    total_transactions: number;
    gross_profit: number;
    cogs: number;
  } | null>(null);
  const [sales, setSales] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    if (timeFilter === 'custom' && (!startDate || !endDate)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const branchId = getBranchId();
      const params = new URLSearchParams({
        time_filter: timeFilter,
        branch_id: branchId || '',
        per_page: '100',
      });
      if (timeFilter === 'custom') {
        params.set('start_date', startDate);
        params.set('end_date', endDate);
      }
      const [a, s] = await Promise.all([
        get<{ total_sales: number; total_transactions: number; gross_profit: number; cogs: number }>(
          `/sales/analytics?${params}`,
        ),
        get<{ sales?: Record<string, unknown>[] }>(`/sales/?${params}`),
      ]);
      setAnalytics(a);
      setSales(s?.sales ?? []);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [timeFilter, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const title = periodTitle(timeFilter);

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <PageHeader
        title="Business Intelligence"
        description="Sales analytics, COGS, and transaction reports"
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setTimeFilter(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              timeFilter === p.key
                ? 'bg-accent-600 text-white border-accent-600'
                : 'bg-surface border-border text-muted hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {timeFilter === 'custom' && (
        <div className="surface-card p-4 mb-6 flex flex-wrap items-end gap-3">
          <Input type="date" label="From" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input type="date" label="To" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            onClick={load}
            disabled={!startDate || !endDate}
          >
            <Calendar className="w-3.5 h-3.5" /> Apply
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label={`${title} Revenue`} value={formatCurrency(analytics?.total_sales ?? 0)} />
            <StatCard label="Transactions" value={analytics?.total_transactions ?? 0} />
            <StatCard label="Gross Profit" value={formatCurrency(analytics?.gross_profit ?? 0)} />
            <StatCard label="COGS" value={formatCurrency(analytics?.cogs ?? 0)} />
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Transactions — {title}</h3>
            <DataTable
              columns={[
                {
                  key: 'invoice_number',
                  header: 'Invoice',
                  render: r => (
                    <span className="font-mono text-xs">
                      {String(r.invoice_number || r.id || '—')}
                    </span>
                  ),
                },
                {
                  key: 'total_amount',
                  header: 'Total',
                  render: r => formatCurrency(Number(r.total_amount)),
                },
                {
                  key: 'cogs_amount',
                  header: 'COGS',
                  render: r => formatCurrency(Number(r.cogs_amount || 0)),
                },
                {
                  key: 'payment_method',
                  header: 'Payment',
                  render: r => String(r.payment_method || '—'),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: r => String(r.status || '—'),
                },
                {
                  key: 'created_at',
                  header: 'Date',
                  render: r => (r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—'),
                },
              ]}
              data={sales}
              emptyMessage={
                timeFilter === 'custom' && (!startDate || !endDate)
                  ? 'Select a date range and click Apply'
                  : 'No transactions for this period'
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}
