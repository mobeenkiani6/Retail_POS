import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { emptyProductForm, type ProductFormData } from '../components/products/ProductForm';

type ProductsState = {
  search: string;
  showArchived: boolean;
  modalOpen: boolean;
  editingId: number | null;
  form: ProductFormData;
  expandedIds: number[];

  setSearch: (v: string) => void;
  setShowArchived: (v: boolean) => void;
  setModalOpen: (v: boolean) => void;
  setEditingId: (v: number | null) => void;
  setForm: (v: ProductFormData | ((prev: ProductFormData) => ProductFormData)) => void;
  setExpandedIds: (v: number[] | ((prev: number[]) => number[])) => void;
  openCreate: () => void;
  openEdit: (id: number, form: ProductFormData) => void;
  closeModal: () => void;
  clearDraft: () => void;
};

export const useProductsStore = create<ProductsState>()(
  persist(
    (set, get) => ({
      search: '',
      showArchived: false,
      modalOpen: false,
      editingId: null,
      form: emptyProductForm(),
      expandedIds: [],

      setSearch: (search) => set({ search }),
      setShowArchived: (showArchived) => set({ showArchived }),
      setModalOpen: (modalOpen) => set({ modalOpen }),
      setEditingId: (editingId) => set({ editingId }),
      setForm: (form) =>
        set({ form: typeof form === 'function' ? form(get().form) : form }),
      setExpandedIds: (expandedIds) =>
        set({
          expandedIds:
            typeof expandedIds === 'function' ? expandedIds(get().expandedIds) : expandedIds,
        }),
      openCreate: () =>
        set({ modalOpen: true, editingId: null, form: emptyProductForm() }),
      openEdit: (editingId, form) => set({ modalOpen: true, editingId, form }),
      closeModal: () => set({ modalOpen: false }),
      clearDraft: () =>
        set({ modalOpen: false, editingId: null, form: emptyProductForm() }),
    }),
    {
      name: 'nycto-products',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        search: s.search,
        showArchived: s.showArchived,
        modalOpen: s.modalOpen,
        editingId: s.editingId,
        form: s.form,
        expandedIds: s.expandedIds,
      }),
    },
  ),
);
