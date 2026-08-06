import { useEffect, useState } from 'react';
import { get, put } from '../api/client';

export function IntegrationsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null);

  const load = () => get('/v1/admin/integrations').then((r) => setRows(r as Record<string, unknown>[]));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Integrations</h1>
        <p className="text-sm text-muted mt-1">Email, SMS, WhatsApp hooks and backup metadata</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={String(r.provider)} className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold capitalize">{String(r.provider)}</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!r.enabled}
                  onChange={(e) => put(`/v1/admin/integrations/${r.provider}`, { enabled: e.target.checked, config: r.config || {} }).then(load)}
                />
                Enabled
              </label>
            </div>
            <textarea
              className="input font-mono text-xs min-h-[80px]"
              placeholder='{"api_key":"..."}'
              defaultValue={JSON.stringify(r.config || {}, null, 2)}
              onBlur={(e) => {
                try {
                  const config = JSON.parse(e.target.value || '{}');
                  put(`/v1/admin/integrations/${r.provider}`, { config, enabled: !!r.enabled }).then(load);
                } catch {
                  /* ignore invalid json while typing */
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="panel p-4">
        <button
          type="button"
          className="btn-primary"
          onClick={() => get('/v1/admin/backup/export-meta').then((r) => setBackup(r as Record<string, unknown>))}
        >
          Backup integrity check
        </button>
        {backup && (
          <pre className="mt-3 text-xs font-mono bg-canvas-subtle p-3 rounded-xl overflow-auto">
            {JSON.stringify(backup, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
