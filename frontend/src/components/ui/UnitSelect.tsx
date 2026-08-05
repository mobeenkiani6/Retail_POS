import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { isPackagingUnit, unitDisplayLabel, unitStorageAbbr } from '../../utils/unitLabels';

export type UnitOption = { id: number; name: string; abbreviation?: string };

type Props = {
  units: UnitOption[];
  value: string; // unit id as string, or abbreviation when id-less
  onChange: (unitId: string, abbr: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  className?: string;
  /** When true, value is abbreviation rather than id */
  valueIsAbbr?: boolean;
};

function groupFor(u: UnitOption): string {
  const a = (u.abbreviation || u.name || '').toLowerCase();
  const n = (u.name || '').toLowerCase();
  if (['kg', 'g', 'gram', 'kilogram'].some(x => a === x || n.includes(x))) return 'Weight';
  if (['l', 'ltr', 'ml', 'liter', 'litre'].some(x => a === x || n.includes(x))) return 'Volume';
  if (['pc', 'pcs', 'ea', 'each', 'piece'].some(x => a === x || n.includes(x))) return 'Count';
  if (isPackagingUnit(a) || isPackagingUnit(n) || ['dz', 'dozen'].includes(a)) return 'Packaging';
  return 'Other';
}

function labelOf(u: UnitOption): string {
  return unitDisplayLabel(u.abbreviation || u.name, u.name);
}

export default function UnitSelect({
  units,
  value,
  onChange,
  allowNone = false,
  noneLabel = 'No unit',
  placeholder = 'Select unit',
  className = '',
  valueIsAbbr = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = useMemo(() => {
    if (!value) return null;
    if (valueIsAbbr) {
      const v = value.toLowerCase();
      return units.find(u => (u.abbreviation || '').toLowerCase() === v)
        || units.find(u => u.name.toLowerCase() === v)
        || units.find(u => unitDisplayLabel(u.abbreviation, u.name).toLowerCase() === v)
        || null;
    }
    return units.find(u => String(u.id) === value) || null;
  }, [units, value, valueIsAbbr]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return units.filter(u => {
      if (!query) return true;
      return u.name.toLowerCase().includes(query)
        || (u.abbreviation || '').toLowerCase().includes(query);
    });
  }, [units, q]);

  const groups = useMemo(() => {
    const map = new Map<string, UnitOption[]>();
    for (const u of filtered) {
      const g = groupFor(u);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(u);
    }
    const order = ['Weight', 'Volume', 'Count', 'Packaging', 'Other'];
    return order.filter(g => map.has(g)).map(g => ({ name: g, items: map.get(g)! }));
  }, [filtered]);

  const display = selected ? labelOf(selected) : (allowNone && !value ? noneLabel : placeholder);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`input-base w-full flex items-center justify-between gap-2 text-left ${
          open ? 'border-accent-500 ring-2 ring-accent-500/40' : ''
        }`}
      >
        <span className={!selected && !(allowNone && !value) ? 'text-muted' : ''}>{display}</span>
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[12rem] rounded-xl border border-border bg-surface shadow-premium overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search units…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-canvas-subtle text-foreground placeholder:text-muted focus:outline-none focus:border-accent-500"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto scrollbar-thin py-1">
            {allowNone && (
              <button
                type="button"
                onClick={() => { onChange('', ''); setOpen(false); setQ(''); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-canvas-subtle text-left"
              >
                <span>{noneLabel}</span>
                {!value && <Check className="w-4 h-4 text-accent-600" />}
              </button>
            )}
            {groups.map(g => (
              <div key={g.name}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{g.name}</p>
                {g.items.map(u => {
                  const display = labelOf(u);
                  const active = valueIsAbbr
                    ? (u.abbreviation || '').toLowerCase() === value.toLowerCase()
                      || u.name.toLowerCase() === value.toLowerCase()
                      || display.toLowerCase() === value.toLowerCase()
                    : String(u.id) === value;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        onChange(String(u.id), unitStorageAbbr(u));
                        setOpen(false);
                        setQ('');
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent-500/10 text-left ${
                        active ? 'bg-accent-500/15 text-foreground' : ''
                      }`}
                    >
                      <span>{display}</span>
                      {active && <Check className="w-4 h-4 text-accent-600" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted text-center">No units found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
