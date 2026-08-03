import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

type SortDir = 'asc' | 'desc';

type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T | ((row: T) => string | number);
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  actions?: (row: T) => React.ReactNode;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
};

function cellSortValue<T extends Record<string, unknown>>(row: T, key: string): string | number {
  const raw = row[key];
  if (raw == null) return '';
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  return String(raw).toLowerCase();
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField = 'id' as keyof T,
  emptyMessage = 'No data',
  onRowClick,
  loading,
  actions,
  defaultSortKey,
  defaultSortDir = 'asc',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const getKey = (row: T, i: number) => {
    if (typeof keyField === 'function') return keyField(row);
    return String(row[keyField] ?? i);
  };

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
      return;
    }
    setSortKey(null);
    setSortDir('asc');
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find(c => c.key === sortKey);
    const copy = [...data];
    copy.sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : cellSortValue(a, sortKey);
      const bv = col?.sortValue ? col.sortValue(b) : cellSortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [columns, data, sortDir, sortKey]);

  const allColumns = actions ? [...columns, { key: '_actions', header: '', className: 'w-24', sortable: false }] : columns;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-canvas-subtle">
            {allColumns.map(col => {
              const sortable = col.sortable !== false && col.key !== '_actions';
              const active = sortKey === col.key;
              return (
                <th key={col.key} className={`px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider ${col.className || ''}`}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.header}
                      {active ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </button>
                  ) : col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border-subtle">
                {allColumns.map(col => (
                  <td key={col.key} className="px-4 py-3"><div className="h-4 bg-border rounded animate-shimmer" /></td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={allColumns.length} className="px-4 py-16 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, i) => (
              <tr
                key={getKey(row, i)}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-border-subtle transition-colors ${onRowClick ? 'cursor-pointer hover:bg-canvas-subtle' : 'hover:bg-canvas-subtle/50'}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3.5 text-foreground ${col.className || ''}`}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type { Column as DataTableColumn };
