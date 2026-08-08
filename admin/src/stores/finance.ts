import { create } from 'zustand';
import { get as apiGet, post, put, del } from '../api/client';
import { useBranchFilter } from './branch';
import { errMsg, notifyAction } from './helpers';

export type Expense = {
  id: number;
  title: string;
  amount: number;
  expense_date?: string;
};

type FinanceState = {
  pnl: Record<string, number | string> | null;
  expenses: Expense[];
  expensesTotal: number;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  addExpense: (title: string, amount: number) => Promise<void>;
  updateExpense: (id: number, data: { title: string; amount: number }) => Promise<void>;
  deleteExpense: (id: number) => Promise<void>;
};

export const useFinanceStore = create<FinanceState>((set, get) => ({
  pnl: null,
  expenses: [],
  expensesTotal: 0,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    const q = useBranchFilter.getState().queryParam();
    try {
      const [pnl, exp] = await Promise.all([
        apiGet<Record<string, number | string>>(`/v1/admin/finance/pnl?period=month${q ? `&${q}` : ''}`),
        apiGet<{ expenses: Expense[]; total: number }>(`/v1/admin/expenses?period=month${q ? `&${q}` : ''}`),
      ]);
      set({
        pnl,
        expenses: exp.expenses || [],
        expensesTotal: exp.total ?? 0,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  addExpense: async (title, amount) => {
    await notifyAction(async () => {
      await post('/v1/admin/expenses', { title, amount });
      await get().load();
    }, 'Expense added', 'Could not add expense');
  },

  updateExpense: async (id, data) => {
    await notifyAction(async () => {
      await put(`/v1/admin/expenses/${id}`, data);
      await get().load();
    }, 'Expense updated', 'Could not update expense');
  },

  deleteExpense: async (id) => {
    await notifyAction(async () => {
      await del(`/v1/admin/expenses/${id}`);
      await get().load();
    }, 'Expense deleted', 'Could not delete expense');
  },
}));
