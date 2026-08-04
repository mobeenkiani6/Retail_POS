import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Loader2, X, Building2, Archive, ArchiveRestore } from 'lucide-react';
import { showToast } from '../Toast';
import { showConfirm } from '../ConfirmDialog';
import { get, post, put, patch, del, getUserMessage } from '../../api';
import { getBranchId } from '../../branch';

type User = {
  id: number;
  username: string;
  role: string;
  branch_id: string | null;
  branch_name: string;
  created_at: string;
  archived_at?: string | null;
};

export default function UsersSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [saving, setSaving] = useState(false);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const branchId = getBranchId();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [includeArchived]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const query = includeArchived ? '?include_archived=1' : '';
      const data = await get<User[]>(`/users/${query}`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUsername(user.username);
      setPassword('');
      setRole(user.role);
    } else {
      setEditingUser(null);
      setUsername('');
      setPassword('');
      setRole('cashier');
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
  };

  const handleSaveUser = async () => {
    if (!username.trim() || (!editingUser && !password)) {
      showToast('Username and password are required for new users.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: { username: string; role: string; branch_id: string | null; password?: string } = {
        username: username.trim(),
        role,
        branch_id: branchId || null,
      };
      if (password) payload.password = password;

      if (editingUser) {
        await put(`/users/${editingUser.id}`, payload);
      } else {
        await post('/users/', payload);
      }
      showToast(editingUser ? 'User updated successfully' : 'User created successfully', 'success');
      closeModal();
      fetchUsers();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveUser = async (user: User) => {
    const confirmed = await showConfirm({
      title: 'Archive user?',
      message: `${user.username} will be archived and cannot sign in.`,
      confirmLabel: 'Archive',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await patch(`/users/${user.id}/archive`, {});
      showToast('User archived', 'success');
      fetchUsers();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleRestoreUser = async (user: User) => {
    try {
      await patch(`/users/${user.id}/unarchive`, {});
      showToast('User restored', 'success');
      fetchUsers();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = await showConfirm({
      title: 'Delete user permanently?',
      message: `${user.username} will be removed. They will no longer be able to sign in.`,
      relatedEffects: ['Cannot delete a user who has transactions. Archive them instead if needed.'],
      confirmLabel: 'Delete permanently',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await del(`/users/${user.id}`);
      showToast('User deleted permanently', 'success');
      fetchUsers();
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-bold text-foreground">User Management</h3>
          <p className="text-sm text-muted mt-1">Staff for this branch. All users are scoped to the POS branch id.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-foreground-secondary">
            <input type="checkbox" checked={includeArchived} onChange={() => setIncludeArchived(v => !v)} className="rounded border-border text-accent-600 focus:ring-accent-500" />
            Include archived
          </label>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 bg-accent-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-accent-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted border border-dashed border-border m-4 rounded-xl">
            No users found.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-canvas-subtle border-b border-border">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Branch</th>
                <th className="px-6 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-canvas-subtle transition-colors ${user.archived_at ? 'bg-canvas-subtle/70 opacity-90' : ''}`}>
                  <td className="px-6 py-4 font-medium text-foreground">
                    {user.username}
                    {user.archived_at && <span className="ml-2 text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200">Archived</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Building2 className="w-3.5 h-3.5" />
                      {user.branch_name || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${
                      user.role === 'owner'
                        ? 'bg-accent-500/10 text-accent-600 border-accent-500/30'
                        : 'bg-canvas-subtle text-foreground-secondary border-border'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!user.archived_at && (
                        <button onClick={() => openModal(user)} className="p-1.5 text-muted hover:text-accent-600 hover:bg-accent-500/10 rounded transition-colors" title="Edit User">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {user.archived_at ? (
                        <>
                          <button onClick={() => handleRestoreUser(user)} className="p-1.5 text-muted hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Restore">
                            <ArchiveRestore className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteUser(user)} className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete permanently">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        currentUser?.id !== user.id && (
                          <>
                            <button onClick={() => handleArchiveUser(user)} className="p-1.5 text-muted hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Archive">
                              <Archive className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteUser(user)} className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete permanently">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              <button onClick={closeModal} className="text-muted hover:text-muted p-1 rounded-lg hover:bg-canvas-subtle">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-canvas-subtle border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none"
                  placeholder="e.g. jsmith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">Password {editingUser && '(Leave blank to keep)'}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-canvas-subtle border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">Role</label>
                {editingUser?.role === 'owner' ? (
                  <>
                    <input type="text" value="Owner" disabled className="w-full px-4 py-2 bg-canvas-subtle border border-border rounded-lg text-muted cursor-not-allowed" />
                    <p className="mt-1 text-xs text-muted">Owner role cannot be changed.</p>
                  </>
                ) : (
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-2 bg-canvas-subtle border border-border rounded-lg focus:ring-2 focus:ring-accent-500 focus:outline-none"
                  >
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory_manager">Inventory Manager</option>
                  </select>
                )}
              </div>

              <p className="text-xs text-muted">
                Users are assigned to this POS branch automatically{branchId ? ` (${branchId.slice(0, 8)}…)` : ''}.
              </p>
            </div>

            <div className="px-6 py-4 bg-canvas-subtle border-t border-border flex justify-end gap-3 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 text-foreground-secondary font-medium hover:bg-neutral-200 dark:bg-neutral-700 rounded-lg transition-colors" disabled={saving}>
                Cancel
              </button>
              <button
                onClick={handleSaveUser}
                disabled={saving || !username.trim()}
                className="flex items-center gap-2 bg-accent-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-accent-700 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
