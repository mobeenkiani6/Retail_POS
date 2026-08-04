import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type GrnSkuLine = {
  sku_id: number;
  label: string;
  selected: boolean;
  quantity: number;
  cost_price: number;
  sell_price: number;
};

export type GrnProductBlock = {
  product_id: number;
  expanded: boolean;
  skus: GrnSkuLine[];
};

export type GrnEditing = {
  id: number;
  grn_number: string;
  supplier_id?: number;
  notes?: string;
  status: string;
} | null;

type GrnState = {
  modalOpen: boolean;
  editing: GrnEditing;
  supplierId: string;
  notes: string;
  blocks: GrnProductBlock[];
  pickerProductId: string;

  setModalOpen: (v: boolean) => void;
  setEditing: (v: GrnEditing) => void;
  setSupplierId: (v: string) => void;
  setNotes: (v: string) => void;
  setBlocks: (v: GrnProductBlock[] | ((prev: GrnProductBlock[]) => GrnProductBlock[])) => void;
  setPickerProductId: (v: string) => void;
  openCreate: () => void;
  openEdit: (editing: NonNullable<GrnEditing>, blocks: GrnProductBlock[]) => void;
  closeModal: () => void;
  clearDraft: () => void;
};

const emptyDraft = {
  modalOpen: false,
  editing: null as GrnEditing,
  supplierId: '',
  notes: '',
  blocks: [] as GrnProductBlock[],
  pickerProductId: '',
};

export const useGrnStore = create<GrnState>()(
  persist(
    (set, get) => ({
      ...emptyDraft,

      setModalOpen: (modalOpen) => set({ modalOpen }),
      setEditing: (editing) => set({ editing }),
      setSupplierId: (supplierId) => set({ supplierId }),
      setNotes: (notes) => set({ notes }),
      setBlocks: (blocks) =>
        set({ blocks: typeof blocks === 'function' ? blocks(get().blocks) : blocks }),
      setPickerProductId: (pickerProductId) => set({ pickerProductId }),
      openCreate: () => set({ ...emptyDraft, modalOpen: true }),
      openEdit: (editing, blocks) =>
        set({
          modalOpen: true,
          editing,
          supplierId: editing.supplier_id ? String(editing.supplier_id) : '',
          notes: editing.notes || '',
          blocks,
          pickerProductId: '',
        }),
      closeModal: () => set({ modalOpen: false }),
      clearDraft: () => set({ ...emptyDraft }),
    }),
    {
      name: 'nycto-grn',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        modalOpen: s.modalOpen,
        editing: s.editing,
        supplierId: s.supplierId,
        notes: s.notes,
        blocks: s.blocks,
        pickerProductId: s.pickerProductId,
      }),
    },
  ),
);
