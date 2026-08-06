import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useBranchFilter } from '../stores/branch';
import { useFinanceStore } from '../stores/finance';
import { TableSearch, SortableTh, useTableSort, fullLabel } from '../components/TableTools';
import { NumberField, NumberFieldString } from '../components/NumberField';

export function FinancePage() {
  const { selectedBranchId } = useBranchFilter();
  const { pnl, expenses, expensesTotal, load, addExpense, updateExpense, deleteExpense } = useFinanceStore();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: number; title: string; amount: number | '' } | null>(null);

  useEffect(() => {
    void load();
  }, [load, selectedBranchId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return expenses;
    return expenses.filter((e) => e.title.toLowerCase().includes(t));
  }, [expenses, q]);

  const withSort = useMemo(
    () =>
      filtered.map((e) => ({
        ...e,
        date_sort: e.expense_date ? new Date(e.expense_date).getTime() : 0,
      })),
    [filtered],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(withSort, 'date_sort', 'desc');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="text-sm text-muted mt-1">{fullLabel('P&L')}, expenses, and cash overview</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search expenses…" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Revenue', pnl?.revenue],
          [fullLabel('COGS'), pnl?.cogs],
          ['Gross profit', pnl?.gross_profit],
          ['Net profit', pnl?.net_profit],
        ].map(([l, v]) => (
          <div key={String(l)} className="panel p-4">
            <div className="section-label">{l as string}</div>
            <div className="text-2xl font-bold mt-2">{String(v ?? '—')}</div>
          </div>
        ))}
      </div>
      <form
        className="panel p-4 flex flex-wrap gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          await addExpense(title, Number(amount));
          setTitle('');
          setAmount('');
        }}
      >
        <div className="flex-1 min-w-[160px]">
          <label className="section-label">Expense</label>
          <input className="input mt-1 h-10" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="section-label">Amount</label>
          <NumberFieldString className="input mt-1 h-10" value={amount} onValueChange={setAmount} required />
        </div>
        <button className="btn-primary h-10" type="submit">Add expense</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-canvas-subtle">
            <tr>
              <SortableTh label="Title" sortKey="title" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
              <SortableTh label="Date" sortKey="date_sort" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-t border-border">
                {edit?.id === e.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        className="input h-9"
                        value={edit.title}
                        onChange={(ev) => setEdit({ ...edit, title: ev.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <NumberField
                        className="input h-9 w-28 ml-auto"
                        value={edit.amount}
                        onValueChange={(v) => setEdit({ ...edit, amount: v })}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {e.expense_date ? new Date(e.expense_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-ghost p-1 text-success"
                        title="Save"
                        onClick={async () => {
                          if (!edit.title.trim() || edit.amount === '' || Number(edit.amount) <= 0) return;
                          await updateExpense(e.id, { title: edit.title.trim(), amount: Number(edit.amount) });
                          setEdit(null);
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button type="button" className="btn-ghost p-1" title="Cancel" onClick={() => setEdit(null)}>
                        <X size={14} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">{e.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.amount}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {e.expense_date ? new Date(e.expense_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-ghost p-1"
                        title="Edit"
                        onClick={() => setEdit({ id: e.id, title: e.title, amount: e.amount })}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost p-1 text-danger"
                        title="Delete"
                        onClick={() => void deleteExpense(e.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-muted text-sm">No expenses</div>}
        <div className="px-4 py-3 text-sm border-t border-border">Total: {expensesTotal}</div>
      </div>
    </div>
  );
}
