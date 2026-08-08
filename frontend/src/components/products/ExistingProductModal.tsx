import Button from '../ui/Button';
import Modal from '../ui/Modal';
import type { ExistingBarcodeProduct } from '../../utils/barcode';

type Props = {
  open: boolean;
  product: ExistingBarcodeProduct | null;
  onClose: () => void;
  onView: (productId: number) => void;
};

export default function ExistingProductModal({ open, product, onClose, onView }: Props) {
  if (!product) return null;
  const name = product.product_name || product.name || 'Unknown product';
  const variant = product.display_label || product.variant_name || '';
  const sku = product.sku_code || product.sku || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Product Already Exists"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onView(product.product_id)}>View Product</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          This barcode is already assigned. Do not create another product.
        </p>
        <div className="rounded-xl border border-border bg-canvas-subtle/60 p-4 space-y-2">
          <div>
            <p className="text-xs text-muted">Barcode</p>
            <p className="font-mono font-semibold">{product.barcode}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Product</p>
            <p className="font-semibold">{name}{variant ? ` · ${variant}` : ''}</p>
          </div>
          {sku && (
            <div>
              <p className="text-xs text-muted">SKU</p>
              <p className="font-mono">{sku}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
