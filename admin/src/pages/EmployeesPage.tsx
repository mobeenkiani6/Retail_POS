import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { useBranchFilter } from '../stores/branch';
import { useEmployeesStore } from '../stores/employees';
import { TableSearch, SortableTh, useTableSort } from '../components/TableTools';

const ROLES = ['cashier', 'manager', 'inventory_manager', 'admin', 'owner'] as const;

function roleLabel(role: string) {
  return role.replace(/_/g, ' ');
}

export function EmployeesPage() {
  const { user: me } = useAuth();
  const { branches } = useBranchFilter();
  const { employees: rows, message, load, create, update, remove, clearMessage } = useEmployeesStore();
  const [q, setQ] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [localMsg, setLocalMsg] = useState('');
  const [edit, setEdit] = useState<{
    id: number;
    username: string;
    role: string;
    branch_id: string;
    password: string;
  } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (u) =>
        u.username.toLowerCase().includes(t) ||
        u.role.toLowerCase().includes(t) ||
        (u.branch_name || '').toLowerCase().includes(t) ||
        (u.branch_id || '').toLowerCase().includes(t),
    );
  }, [rows, q]);

  const withSortKey = useMemo(
    () =>
      filtered.map((u) => ({
        ...u,
        last_login_sort: u.last_login_at ? new Date(u.last_login_at).getTime() : 0,
      })),
    [filtered],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(withSortKey, 'username');

  const displayMsg = localMsg || message;

  const saveEdit = async () => {
    if (!edit) return;
    setLocalMsg('');
    clearMessage();
    try {
      const body: Record<string, unknown> = {
        username: edit.username.trim(),
        role: edit.role,
      };
      if (edit.branch_id) body.branch_id = edit.branch_id;
      if (edit.password.trim()) body.password = edit.password.trim();
      await update(edit.id, body);
      setEdit(null);
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleDelete = async (id: number) => {
    setLocalMsg('');
    clearMessage();
    try {
      await remove(id);
      if (edit?.id === id) setEdit(null);
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="text-sm text-muted mt-1">Staff accounts, roles, and login activity</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search employees…" />
      </div>
      <form
        className="panel p-4 grid md:grid-cols-4 gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setLocalMsg('');
          clearMessage();
          try {
            await create({ username, password, role });
            setUsername('');
            setPassword('');
          } catch (err) {
            setLocalMsg(err instanceof Error ? err.message : 'Create failed');
          }
        }}
      >
        <div>
          <label className="section-label">Username</label>
          <input className="input mt-1 h-10" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="section-label">Password</label>
          <input className="input mt-1 h-10" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <label className="section-label">Role</label>
          <select className="input mt-1 h-10" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary h-10" type="submit">Create</button>
      </form>
      {displayMsg && <div className="text-sm text-muted">{displayMsg}</div>}
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-canvas-subtle">
            <tr>
              <SortableTh label="User" sortKey="username" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Branch" sortKey="branch_name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <SortableTh label="Last login" sortKey="last_login_sort" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} className="border-t border-border">
                {edit?.id === u.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        className="input h-9"
                        value={edit.username}
                        onChange={(e) => setEdit({ ...edit, username: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="input h-9"
                        value={edit.role}
                        onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="input h-9"
                        value={edit.branch_id}
                        onChange={(e) => setEdit({ ...edit, branch_id: e.target.value })}
                      >
                        <option value="">—</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <input
                        className="input h-9 mt-1"
                        type="password"
                        placeholder="New password (optional)"
                        value={edit.password}
                        onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button type="button" className="btn-ghost p-1 text-success" title="Save" onClick={saveEdit}>
                        <Check size={14} />
                      </button>
                      <button type="button" className="btn-ghost p-1" title="Cancel" onClick={() => setEdit(null)}>
                        <X size={14} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 capitalize">{roleLabel(u.role)}</td>
                    <td className="px-4 py-3 text-sm">{u.branch_name || u.branch_id || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-ghost p-1"
                        title="Edit user"
                        onClick={() =>
                          setEdit({
                            id: u.id,
                            username: u.username,
                            role: u.role,
                            branch_id: u.branch_id || '',
                            password: '',
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      {me?.id !== u.id && (
                        <button
                          type="button"
                          className="btn-ghost p-1 text-danger"
                          title="Delete user"
                          onClick={() => void handleDelete(u.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-muted text-sm">No employees</div>}
      </div>
    </div>
  );
}
