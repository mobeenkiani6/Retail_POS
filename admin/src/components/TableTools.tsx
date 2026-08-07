import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

/** Shared search field — consistent height/alignment across admin tables */
export function TableSearch({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full max-w-sm ${className}`}>
      <Search
        size={15}
        strokeWidth={2}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-[1]"
        aria-hidden
      />
      <input
        type="search"
        className="w-full h-10 rounded-xl border border-border bg-surface text-sm text-foreground outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 pl-10 pr-3"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export type SortDir = 'asc' | 'desc';

export function useTableSort<T>(rows: T[], defaultKey: keyof T | string, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<string>(String(defaultKey));
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const toggle = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { sorted, sortKey, sortDir, toggle };
}

export function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onToggle,
  align = 'left',
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onToggle: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px] text-muted hover:text-foreground"
        onClick={() => onToggle(sortKey)}
      >
        {label}
        <Icon size={12} className={active ? 'text-accent-500' : 'opacity-50'} />
      </button>
    </th>
  );
}

/** Expand common retail abbreviations for newcomers */
export function fullLabel(abbr: string): string {
  const map: Record<string, string> = {
    LTV: 'Lifetime Value (LTV)',
    AOV: 'Average Order Value (AOV)',
    SKU: 'Stock Keeping Unit (SKU)',
    SKUs: 'Stock Keeping Units (SKUs)',
    COGS: 'Cost of Goods Sold (COGS)',
    VIP: 'Very Important Customer (VIP)',
    'P&L': 'Profit & Loss (P&L)',
    CRM: 'Customer Relationship Management (CRM)',
    GRN: 'Goods Received Note (GRN)',
  };
  return map[abbr] || abbr;
}

/** Horizontal scroll wrapper for wide data tables on small screens */
export function ScrollTable({
  children,
  className = '',
  minWidth = '640px',
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={`table-scroll ${className}`}>
      <div style={{ minWidth }} className="w-full">
        {children}
      </div>
    </div>
  );
}
