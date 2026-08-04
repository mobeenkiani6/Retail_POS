export type ProductVariant = {
  name: string;
  base_price: number;
  cost_price: number;
  stock_level?: number;
};

export type ProductVariantForm = {
  name: string;
  base_price: string;
  cost_price: string;
  stock_level: string;
};

export function normalizeProductVariants(
  raw: unknown,
  fallback: { base_price: number; cost_price: number },
): ProductVariant[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: ProductVariant[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (!name) continue;
      out.push({
        name,
        base_price: fallback.base_price,
        cost_price: fallback.cost_price,
      });
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = String(o.name || '').trim();
      if (!name) continue;
      out.push({
        name,
        base_price: Number(o.base_price ?? fallback.base_price) || 0,
        cost_price: Number(o.cost_price ?? fallback.cost_price) || 0,
        stock_level: o.stock_level != null ? Number(o.stock_level) : undefined,
      });
    }
  }
  return out;
}

export function variantsToForm(
  raw: unknown,
  fallback: { base_price: number; cost_price: number },
  stockByVariant?: Record<string, number>,
): ProductVariantForm[] {
  return normalizeProductVariants(raw, fallback).map(v => ({
    name: v.name,
    base_price: String(v.base_price),
    cost_price: String(v.cost_price),
    stock_level: String(stockByVariant?.[v.name] ?? v.stock_level ?? 0),
  }));
}

export function variantDisplayPrice(
  variants: ProductVariant[],
  fallbackPrice: number,
  format: (n: number) => string,
): string {
  if (!variants.length) return format(fallbackPrice);
  const prices = variants.map(v => v.base_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? format(min) : `${format(min)} – ${format(max)}`;
}
