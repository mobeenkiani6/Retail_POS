import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api/client';
import { Search, X } from 'lucide-react';

type Result = {
  type: string;
  id: string | number;
  title: string;
  subtitle?: string;
  href: string;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await get<{ results: Result[] }>(`/v1/admin/search?q=${encodeURIComponent(q)}`);
        setResults(res.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl panel overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} className="text-muted shrink-0" aria-hidden />
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm min-w-0"
            placeholder="Search products, orders, customers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && results[0]) {
                navigate(results[0].href);
                onClose();
              }
            }}
          />
          <button type="button" className="btn-ghost p-1 shrink-0" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {loading && <div className="px-4 py-3 text-sm text-muted">Searching…</div>}
          {!loading && q && results.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted text-center">No results</div>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-3"
              onClick={() => {
                navigate(r.href);
                onClose();
              }}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">{r.type}</span>
              <span className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.title}</div>
                {r.subtitle && <div className="text-xs text-muted truncate">{r.subtitle}</div>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
