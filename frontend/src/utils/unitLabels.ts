/** Display helpers so packaging units show full names, not abbreviations. */

const PACKAGING_FULL: Record<string, string> = {
  pkt: 'Packet',
  packet: 'Packet',
  packets: 'Packet',
  pk: 'Pack',
  pack: 'Pack',
  packs: 'Pack',
  ctn: 'Carton',
  carton: 'Carton',
  cartons: 'Carton',
  bx: 'Box',
  box: 'Box',
  boxes: 'Box',
  crt: 'Crate',
  crate: 'Crate',
  bdl: 'Bundle',
  bundle: 'Bundle',
  dz: 'Dozen',
  dozen: 'Dozen',
  case: 'Case',
  cases: 'Case',
};

export function isPackagingUnit(value?: string | null): boolean {
  const v = (value || '').trim().toLowerCase();
  if (!v) return false;
  if (PACKAGING_FULL[v]) return true;
  return Object.values(PACKAGING_FULL).some(n => n.toLowerCase() === v);
}

/** Human label for a unit abbreviation or name (Packet, not pkt). */
export function unitDisplayLabel(abbrOrName?: string | null, fallbackName?: string | null): string {
  const raw = (abbrOrName || '').trim();
  const name = (fallbackName || '').trim();
  const key = raw.toLowerCase();
  if (PACKAGING_FULL[key]) return PACKAGING_FULL[key];
  if (name && isPackagingUnit(name)) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (key === 'kg' || key === 'kilogram') return 'Kg';
  if (key === 'g' || key === 'gram' || key === 'grams') return 'g';
  if (key === 'l' || key === 'ltr' || key === 'liter' || key === 'litre') return 'Ltr';
  if (key === 'ml' || key === 'milliliter' || key === 'millilitre') return 'ml';
  if (key === 'pc' || key === 'pcs' || key === 'piece') return 'Piece';
  if (key === 'ea' || key === 'each') return 'Each';
  // Prefer catalog name for packaging-like names
  if (name && isPackagingUnit(raw)) return name;
  return raw || name || 'unit';
}

/** Value to store as unit_abbr — full name for packaging units. */
export function unitStorageAbbr(unit: { name: string; abbreviation?: string }): string {
  const abbr = (unit.abbreviation || '').trim();
  const name = (unit.name || '').trim();
  if (isPackagingUnit(abbr) || isPackagingUnit(name)) {
    return unitDisplayLabel(abbr || name, name);
  }
  return abbr || name;
}
