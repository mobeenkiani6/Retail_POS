import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, Users, Truck,
  UserCog, FileBarChart, Bell, Settings, Building2, LineChart,
  Wallet, Megaphone, Shield, Search, Moon, Sun, LogOut, Command,
} from 'lucide-react';
import { useAuth } from '../stores/auth';
import { useTheme } from '../stores/theme';
import { useBranchFilter } from '../stores/branch';
import { useNotificationsStore } from '../stores/notifications';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationDrawer } from '../components/NotificationDrawer';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bi', label: 'Intelligence', icon: LineChart },
  { to: '/branches', label: 'Branches', icon: Building2 },
  { to: '/catalog', label: 'Catalog', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/sales', label: 'Sales', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/employees', label: 'Employees', icon: UserCog },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AdminShell() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { branches, selectedBranchId, load, select } = useBranchFilter();
  const { unread, load: loadNotifications } = useNotificationsStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void load();
    void loadNotifications();
  }, [load, loadNotifications]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="text-lg font-bold tracking-tight">Nycto Retail</div>
          <div className="text-xs text-muted mt-0.5">Admin Panel</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
                    : 'text-foreground-secondary hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border text-xs text-muted">
          {user?.username} · {user?.role}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface/80 backdrop-blur flex items-center gap-3 px-5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2.5 rounded-xl border border-border h-10 pl-3.5 pr-3 text-sm text-muted hover:bg-neutral-50 dark:hover:bg-neutral-800 min-w-[220px]"
          >
            <Search size={15} className="shrink-0 opacity-70" aria-hidden />
            <span className="flex-1 text-left leading-none">Search…</span>
            <kbd className="text-[10px] font-mono flex items-center gap-0.5 opacity-70 shrink-0">
              <Command size={10} />K
            </kbd>
          </button>

          <select
            className="input max-w-[200px] h-10"
            value={selectedBranchId || ''}
            onChange={(e) => select(e.target.value || null)}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            type="button"
            className="btn-ghost relative"
            onClick={() => setNotifOpen(true)}
            title="Notifications"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-danger text-[10px] text-white flex items-center justify-center px-1">
                {unread}
              </span>
            )}
          </button>
          <button type="button" className="btn-ghost" onClick={toggle} title="Theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationDrawer
        open={notifOpen}
        onClose={() => {
          setNotifOpen(false);
          void loadNotifications();
        }}
      />
    </div>
  );
}
