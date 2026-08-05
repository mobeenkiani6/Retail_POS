/** Unit helpers for stock adjustment quantity entry & conversion. */

export type CatalogUnit = {
  id: number;
  name: string;
  abbreviation?: string;
};

export type AdjustUnitChoice = {
  key: string;
  label: string;
  /** Stock units of the current SKU per 1 of this entry unit */
  stockPerUnit: number;
};

type SkuLike = {
  id?: number;
  quantity_value: number;
  unit_abbr: string;
  variant_name?: string;
};

const MASS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  litres: 1000,
};

function norm(abbr: string): string {
  return (abbr || '').trim().toLowerCase();
}

function familyFactor(abbr: string): { family: 'mass' | 'volume'; factor: number } | null {
  const a = norm(abbr);
  if (MASS[a] != null) return { family: 'mass', factor: MASS[a] };
  if (VOLUME[a] != null) return { family: 'volume', factor: VOLUME[a] };
  return null;
}

function prettyLabel(abbr: string, name?: string): string {
  // Lazy import avoided — keep packaging labels readable (Packet, not pkt)
  const PACK: Record<string, string> = {
    pkt: 'Packet', packet: 'Packet', pk: 'Pack', pack: 'Pack',
    ctn: 'Carton', carton: 'Carton', bx: 'Box', box: 'Box',
    crt: 'Crate', crate: 'Crate', bdl: 'Bundle', bundle: 'Bundle',
    dz: 'Dozen', dozen: 'Dozen',
  };
  const a = (abbr || '').trim();
  if (!a && name) return name;
  if (PACK[norm(a)]) return PACK[norm(a)];
  if (name && PACK[norm(name)]) return PACK[norm(name)];
  if (norm(a) === 'kg') return 'Kg';
  if (norm(a) === 'g') return 'g';
  if (norm(a) === 'l' || norm(a) === 'ltr') return 'Ltr';
  if (norm(a) === 'ml') return 'ml';
  if (name && isPackagingName(name)) return name;
  return a || name || 'unit';
}

function isPackagingName(name: string): boolean {
  const n = name.toLowerCase();
  return ['packet', 'pack', 'carton', 'box', 'crate', 'bundle', 'dozen', 'case'].some(p => n === p || n.includes(p));
}

/** Total sellable content in the SKU's unit (stock × pack size). */
export function totalContent(stock: number, quantityValue: number): number {
  return stock * (parseFloat(String(quantityValue)) || 1);
}

/** Format current on-hand with optional mass/volume equivalent. */
export function formatCurrentStock(
  stock: number,
  quantityValue: number,
  unitAbbr: string,
): string {
  const qty = parseFloat(String(quantityValue)) || 1;
  const total = totalContent(stock, qty);
  const unit = (unitAbbr || '').trim() || 'pc';
  const primary = formatAmount(total, unit);
  const fam = familyFactor(unit);
  if (fam?.family === 'mass') {
    const grams = total * fam.factor;
    if (norm(unit) === 'kg' || norm(unit) === 'kilogram') {
      return `${primary} (${formatAmount(grams, 'g')})`;
    }
    if (norm(unit) === 'g' || norm(unit) === 'gram') {
      return `${formatAmount(grams / 1000, 'kg')} (${primary})`;
    }
  }
  if (fam?.family === 'volume') {
    const ml = total * fam.factor;
    if (norm(unit) === 'l' || norm(unit) === 'liter' || norm(unit) === 'litre') {
      return `${primary} (${formatAmount(ml, 'ml')})`;
    }
    if (norm(unit) === 'ml') {
      return `${formatAmount(ml / 1000, 'L')} (${primary})`;
    }
  }
  return primary;
}

function formatAmount(n: number, unit: string): string {
  const rounded = Math.round(n * 1000) / 1000;
  const str = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${str} ${prettyLabel(unit)}`;
}

export type ProductPackaging = {
  carton_qty?: number;
  carton_unit?: string;
  packet_qty?: number;
  packet_unit?: string;
  unit?: string;
};

function contentToStock(
  contentQty: number,
  contentUnit: string,
  skuQty: number,
  skuUnit: string,
): number {
  const from = familyFactor(contentUnit);
  const to = familyFactor(skuUnit);
  let contentInSkuUnit = contentQty;
  if (from && to && from.family === to.family) {
    contentInSkuUnit = (contentQty * from.factor) / to.factor;
  } else if (norm(contentUnit) !== norm(skuUnit) && contentUnit && skuUnit) {
    // non-convertible — assume already in sku units
    contentInSkuUnit = contentQty;
  }
  return contentInSkuUnit / (skuQty || 1);
}

/**
 * Build unit choices for the adjust modal:
 * SKU unit, convertible mass/volume counterparts, product carton/packet packaging.
 */
export function buildAdjustUnitChoices(
  sku: SkuLike,
  siblings: SkuLike[],
  catalog: CatalogUnit[] = [],
  packaging?: ProductPackaging | null,
): AdjustUnitChoice[] {
  const qty = parseFloat(String(sku.quantity_value)) || 1;
  const unit = (sku.unit_abbr || packaging?.unit || 'pc').trim();
  const choices: AdjustUnitChoice[] = [];
  const seen = new Set<string>();

  const add = (key: string, label: string, stockPerUnit: number) => {
    if (seen.has(key) || !(stockPerUnit > 0) || !Number.isFinite(stockPerUnit)) return;
    seen.add(key);
    choices.push({ key, label, stockPerUnit });
  };

  add(`native:${norm(unit)}`, prettyLabel(unit), 1 / qty);

  const fam = familyFactor(unit);
  if (fam?.family === 'mass') {
    if (norm(unit) !== 'g') {
      add('conv:g', 'g', (1 / fam.factor) / qty);
    }
    if (norm(unit) !== 'kg' && norm(unit) !== 'kilogram') {
      add('conv:kg', 'Kg', (1000 / fam.factor) / qty);
    }
  }
  if (fam?.family === 'volume') {
    if (norm(unit) !== 'ml') {
      add('conv:ml', 'ml', (1 / fam.factor) / qty);
    }
    if (!['l', 'ltr', 'liter', 'litre'].includes(norm(unit))) {
      add('conv:L', 'Ltr', (1000 / fam.factor) / qty);
    }
  }

  const cartonQty = parseFloat(String(packaging?.carton_qty ?? 0)) || 0;
  if (cartonQty > 0) {
    const cUnit = packaging?.carton_unit || unit;
    add('pack:carton', 'Carton', contentToStock(cartonQty, cUnit, qty, unit));
  }
  const packetQty = parseFloat(String(packaging?.packet_qty ?? 0)) || 0;
  if (packetQty > 0) {
    const pUnit = packaging?.packet_unit || unit;
    add('pack:packet', 'Packet', contentToStock(packetQty, pUnit, qty, unit));
  }

  for (const s of siblings) {
    if (s.id != null && sku.id != null && s.id === sku.id) continue;
    const sQty = parseFloat(String(s.quantity_value)) || 1;
    const sUnit = (s.unit_abbr || '').trim();
    const label = (s.variant_name && !['standard', 'default'].includes(s.variant_name.toLowerCase()))
      ? s.variant_name
      : prettyLabel(sUnit, s.variant_name);

    const sFam = familyFactor(sUnit);
    const skuFam = familyFactor(unit);
    let stockPer = 0;
    if (sFam && skuFam && sFam.family === skuFam.family) {
      const siblingContentInSkuBase = (sQty * sFam.factor) / skuFam.factor;
      stockPer = siblingContentInSkuBase / qty;
    } else {
      stockPer = sQty / qty;
    }
    add(`sku:${s.id ?? label}`, label, stockPer);
  }

  // Fallback catalog packs only if packaging not configured
  if (cartonQty <= 0 && packetQty <= 0) {
    for (const u of catalog) {
      const name = (u.name || '').toLowerCase();
      const abbr = norm(u.abbreviation || '');
      if (!['packet', 'pack', 'carton', 'box'].some(p => name.includes(p) || abbr === p || abbr === 'pkt' || abbr === 'ctn' || abbr === 'bx')) {
        continue;
      }
      add(`cat:${u.id}`, prettyLabel(u.abbreviation || '', u.name), 1);
    }
  }

  return choices;
}

/** Convert entered quantity + unit choice into an integer stock delta. */
export function quantityToStockDelta(
  quantity: number,
  choice: AdjustUnitChoice,
): { delta: number; error?: string } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { delta: 0, error: 'Enter a quantity greater than zero' };
  }
  const raw = quantity * choice.stockPerUnit;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 0.001) {
    return {
      delta: 0,
      error: `Quantity must convert to a whole number of stock units (got ${raw.toFixed(3)})`,
    };
  }
  if (rounded <= 0) {
    return { delta: 0, error: 'Quantity is too small for this unit' };
  }
  return { delta: rounded };
}
