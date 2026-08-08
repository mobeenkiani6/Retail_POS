/** Shared barcode validation helpers (mirrors backend barcode_service). */

export type BarcodeValidation = {
  ok: boolean;
  normalized: string;
  error?: string;
};

export function normalizeBarcode(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export function validateBarcode(raw: string | null | undefined): BarcodeValidation {
  const code = normalizeBarcode(raw);
  if (!code) {
    return { ok: true, normalized: '' };
  }
  if (code.length < 4) {
    return { ok: false, normalized: code, error: 'Invalid barcode format — too short' };
  }
  if (code.length > 48) {
    return { ok: false, normalized: code, error: 'Invalid barcode format — too long' };
  }
  if (/^\d+$/.test(code)) {
    if ([8, 12, 13].includes(code.length) || (code.length >= 4 && code.length <= 14)) {
      return { ok: true, normalized: code };
    }
    return {
      ok: false,
      normalized: code,
      error: 'Invalid barcode format — numeric barcodes should be 8, 12, or 13 digits (EAN/UPC)',
    };
  }
  // Code 128 printable ASCII
  if (/^[\x21-\x7E]+$/.test(code)) {
    return { ok: true, normalized: code };
  }
  return {
    ok: false,
    normalized: code,
    error: 'Invalid barcode format — use digits (EAN/UPC) or printable Code 128 characters',
  };
}

export type ExistingBarcodeProduct = {
  product_id: number;
  sku_id?: number;
  name?: string;
  product_name?: string;
  variant_name?: string;
  display_label?: string;
  sku?: string;
  sku_code?: string;
  barcode?: string;
  price?: number;
  selling_price?: number;
  stock?: number | null;
  stock_level?: number | null;
};

export type BarcodeCheckResult = {
  available: boolean;
  valid: boolean;
  barcode: string;
  message: string;
  existing: ExistingBarcodeProduct | null;
};
