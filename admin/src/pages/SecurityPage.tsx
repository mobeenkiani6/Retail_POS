import { useEffect } from 'react';
import { useSecurityStore } from '../stores/security';
import { NumberField } from '../components/NumberField';

export function SecurityPage() {
  const {
    history,
    sessions,
    matrix,
    policy,
    minLength,
    load,
    setPolicyField,
    setMinLength,
    savePolicy,
    revokeSession,
  } = useSecurityStore();

  useEffect(() => {
    void load();
  }, [load]);

  const roles = (matrix?.roles || {}) as Record<string, Record<string, boolean>>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Security</h1>
        <p className="text-sm text-muted mt-1">Login history, sessions, permissions, password policy</p>
      </div>
      <div className="panel p-4 space-y-3">
        <div className="section-label">Password policy</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted">Min length</label>
            <NumberField
              className="input mt-1 w-24"
              value={minLength}
              onValueChange={setMinLength}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!policy.require_number}
              onChange={(e) => setPolicyField('require_number', e.target.checked)}
            />
            Require number
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void savePolicy()}
          >
            Save
          </button>
        </div>
      </div>
      <div className="panel p-4 overflow-x-auto">
        <div className="section-label mb-3">Role permission matrix</div>
        <table className="text-xs w-full">
          <thead>
            <tr>
              <th className="text-left p-2">Permission</th>
              {Object.keys(roles).map((r) => <th key={r} className="p-2">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {((matrix?.permissions || []) as string[]).map((p) => (
              <tr key={p} className="border-t border-border">
                <td className="p-2 font-mono">{p}</td>
                {Object.keys(roles).map((r) => (
                  <td key={r} className="p-2 text-center">{roles[r]?.[p] ? '✓' : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="section-label mb-2">Login history</div>
          <ul className="space-y-2 text-sm max-h-72 overflow-y-auto">
            {history.slice(0, 40).map((h) => (
              <li key={String(h.id)} className="flex justify-between gap-2 border-b border-border py-1">
                <span>{String(h.username || h.user_id)} · {h.success ? 'ok' : 'fail'}</span>
                <span className="text-xs text-muted">{h.created_at ? new Date(String(h.created_at)).toLocaleString() : ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="section-label mb-2">Active sessions</div>
          <ul className="space-y-2 text-sm max-h-72 overflow-y-auto">
            {sessions.map((s) => (
              <li key={String(s.id)} className="flex justify-between gap-2 border-b border-border py-1">
                <span>User {String(s.user_id)} · {String(s.ip_address || '')}</span>
                <button type="button" className="btn-ghost text-danger text-xs" onClick={() => void revokeSession(Number(s.id))}>Revoke</button>
              </li>
            ))}
            {!sessions.length && <li className="text-muted">No tracked sessions</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
