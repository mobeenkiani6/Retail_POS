import { create } from 'zustand';
import { get as apiGet, post, put, del } from '../api/client';
import { errMsg, notifyAction } from './helpers';

export type Employee = {
  id: number;
  username: string;
  role: string;
  branch_id?: string;
  branch_name?: string;
  last_login_at?: string | null;
  created_at?: string;
};

type EmployeesState = {
  employees: Employee[];
  loading: boolean;
  error: string | null;
  message: string;
  load: () => Promise<void>;
  create: (data: { username: string; password: string; role: string }) => Promise<void>;
  update: (id: number, data: Record<string, unknown>) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearMessage: () => void;
};

export const useEmployeesStore = create<EmployeesState>((set, get) => ({
  employees: [],
  loading: false,
  error: null,
  message: '',

  clearMessage: () => set({ message: '', error: null }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const r = await apiGet<Employee[] | { users: Employee[] }>('/users/');
      set({
        employees: Array.isArray(r) ? r : r.users || [],
        loading: false,
      });
    } catch (e) {
      set({ employees: [], loading: false, error: errMsg(e) });
    }
  },

  create: async (data) => {
    await notifyAction(async () => {
      await post('/users/', data);
      set({ message: 'User created' });
      await get().load();
    }, 'Employee created', 'Could not create employee');
  },

  update: async (id, data) => {
    await notifyAction(async () => {
      await put(`/users/${id}`, data);
      set({ message: 'User updated' });
      await get().load();
    }, 'Employee updated', 'Could not update employee');
  },

  remove: async (id) => {
    await notifyAction(async () => {
      await del(`/users/${id}`);
      set({ message: 'User deleted' });
      await get().load();
    }, 'Employee deleted', 'Could not delete employee');
  },
}));
