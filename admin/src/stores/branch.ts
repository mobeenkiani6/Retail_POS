import { create } from 'zustand';
import { get as apiGet, post, patch } from '../api/client';
import { errMsg, notifyAction } from './helpers';

export type Branch = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  user_count?: number;
  archived_at?: string | null;
};

type BranchState = {
  branches: Branch[];
  /** Includes archived — used by Branches management page */
  allBranches: Branch[];
  selectedBranchId: string | null;
  loading: boolean;
  error: string | null;
  message: string;
  load: () => Promise<void>;
  loadAll: () => Promise<void>;
  select: (id: string | null) => void;
  queryParam: () => string;
  create: (data: { name: string; address?: string; phone?: string }) => Promise<void>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
};

export const useBranchFilter = create<BranchState>((set, getState) => ({
  branches: [],
  allBranches: [],
  selectedBranchId: localStorage.getItem('admin_branch_filter') || null,
  loading: false,
  error: null,
  message: '',

  load: async () => {
    set({ loading: true, error: null });
    try {
      const rows = await apiGet<Branch[]>('/v1/admin/branches');
      set({ branches: rows, loading: false });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const rows = await apiGet<Branch[]>('/v1/admin/branches?include_archived=1');
      const active = rows.filter((b) => !b.archived_at);
      set({ allBranches: rows, branches: active, loading: false });
    } catch (e) {
      set({ loading: false, error: errMsg(e) });
    }
  },

  select: (id) => {
    if (id) localStorage.setItem('admin_branch_filter', id);
    else localStorage.removeItem('admin_branch_filter');
    set({ selectedBranchId: id });
  },

  queryParam: () => {
    const id = getState().selectedBranchId;
    return id ? `branch_id=${encodeURIComponent(id)}` : '';
  },

  create: async (data) => {
    await notifyAction(async () => {
      const res = await post<Branch & { message?: string }>('/v1/admin/branches', data);
      set({ message: res.message || 'Created' });
      await getState().loadAll();
    }, 'Branch created', 'Could not create branch');
  },

  archive: async (id) => {
    await notifyAction(async () => {
      await patch(`/v1/admin/branches/${id}/archive`);
      await getState().loadAll();
    }, 'Branch archived', 'Could not archive branch');
  },

  unarchive: async (id) => {
    await notifyAction(async () => {
      await patch(`/v1/admin/branches/${id}/unarchive`);
      await getState().loadAll();
    }, 'Branch restored', 'Could not restore branch');
  },
}));
