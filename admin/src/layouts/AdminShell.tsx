import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, Users, Truck,
  UserCog, FileBarChart, Bell, Settings, Building2, LineChart,
  Wallet, Megaphone, Shield, Search, Moon, Sun, LogOut, Command, Menu, X,
} from 'lucide-react';
import { useAuth } from '../stores/auth';
import { useTheme } from '../stores/theme';
import { useBranchFilter } from '../stores/branch';
import { useNotificationsStore } from '../stores/notifications';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationDrawer } from '../components/NotificationDrawer';
import { useAdminRealtimeSync } from '../realtime/useAdminRealtimeSync';

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
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useAdminRealtimeSync(true);

  useEffect(() => {
    void load();
    void loadNotifications();
  }, [load, loadNotifications]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [navOpen]);

  const sidebar = (
    <>
      <div className="shrink-0 px-5 py-5 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold tracking-tight">Nycto Retail</div>
          <div className="text-xs text-muted mt-0.5">Admin Panel</div>
        </div>
        <button
          type="button"
          className="md:hidden btn-ghost touch-target shrink-0 -mr-1 -mt-1"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-2 space-y-0.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 min-h-11 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
                  : 'text-foreground-secondary hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`
            }
          >
            <Icon size={18} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 p-3 border-t border-border text-xs text-muted truncate">
        {user?.username} · {user?.role}
      </div>
    </>
  );

  return (
    <div className="h-dvh max-h-dvh flex overflow-hidden bg-canvas">
      {/* Mobile backdrop */}
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile; fixed-height column on md+ so only nav scrolls */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[min(16.5rem,85vw)] h-dvh flex flex-col overflow-hidden
          border-r border-border bg-surface shadow-soft
          transition-transform duration-200 ease-out
          md:static md:z-auto md:w-60 md:shrink-0 md:h-full md:max-h-full md:translate-x-0 md:shadow-none
          ${navOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {sidebar}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full overflow-hidden">
        <header className="shrink-0 z-30 h-14 border-b border-border bg-surface/90 backdrop-blur flex items-center gap-2 sm:gap-3 px-3 sm:px-5">
          <button
            type="button"
            className="md:hidden btn-ghost touch-target shrink-0"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-border h-10 pl-3 pr-2.5 sm:pr-3 text-sm text-muted hover:bg-neutral-50 dark:hover:bg-neutral-800 flex-1 min-w-0 max-w-xs sm:max-w-none sm:flex-none md:min-w-[200px]"
          >
            <Search size={15} className="shrink-0 opacity-70" aria-hidden />
            <span className="flex-1 text-left leading-none truncate hidden sm:inline">Search…</span>
            <kbd className="hidden sm:flex text-[10px] font-mono items-center gap-0.5 opacity-70 shrink-0">
              <Command size={10} />K
            </kbd>
          </button>

          <select
            className="input h-10 w-auto max-w-[7.5rem] sm:max-w-[11rem] md:max-w-[200px] shrink min-w-0 text-xs sm:text-sm"
            value={selectedBranchId || ''}
            onChange={(e) => select(e.target.value || null)}
            aria-label="Branch filter"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <div className="hidden sm:block flex-1" />

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              className="btn-ghost relative touch-target"
              onClick={() => setNotifOpen(true)}
              title="Notifications"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-danger text-[10px] text-white flex items-center justify-center px-1">
                  {unread}
                </span>
              )}
            </button>
            <button type="button" className="btn-ghost touch-target" onClick={toggle} title="Theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="btn-ghost touch-target"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 md:p-6">
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
