import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShoppingCart, Package, ClipboardList,
  BarChart3, Truck, Settings, LogOut, Bell, Moon, Sun,
  Users, FileBarChart, ChevronRight, Warehouse, History,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { get, patch } from '../api';

const navItems = [
  { icon: LayoutDashboard, path: '/operations', label: 'Dashboard', roles: ['owner', 'manager', 'cashier', 'inventory_manager'] },
  { icon: ShoppingCart, path: '/checkout', label: 'New Sale', roles: ['owner', 'manager', 'cashier'] },
  { icon: History, path: '/previous-orders', label: 'Previous Orders', roles: ['owner', 'manager', 'cashier'] },
  { icon: Package, path: '/grocery-products', label: 'Products', roles: ['owner', 'manager', 'inventory_manager'] },
  { icon: Warehouse, path: '/inventory', label: 'Inventory', roles: ['owner', 'manager', 'inventory_manager', 'cashier'] },
  { icon: ClipboardList, path: '/grn', label: 'Receiving', roles: ['owner', 'manager', 'inventory_manager'] },
  { icon: Users, path: '/customers', label: 'Customers', roles: ['owner', 'manager', 'cashier'] },
  { icon: BarChart3, path: '/business-intelligence', label: 'Analytics', roles: ['owner', 'manager'] },
  { icon: FileBarChart, path: '/reports', label: 'Reports', roles: ['owner', 'manager'] },
  { icon: Truck, path: '/supply-chain', label: 'Supply Chain', roles: ['owner', 'manager', 'inventory_manager'] },
  { icon: Settings, path: '/settings', label: 'Settings', roles: ['owner', 'manager'] },
];

type Notification = { id: number; title: string; message: string; severity: string; read: boolean };

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();
  const isAuthPage = ['/login', '/setup'].includes(location.pathname);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const userStr = localStorage.getItem('user');
  let user: { username?: string; role?: string } | null = null;
  try {
    user = userStr ? JSON.parse(userStr) : null;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
  }
  const userRole = user?.role || 'cashier';

  useEffect(() => {
    if (isAuthPage || !localStorage.getItem('auth_token')) return;
    get<{ notifications?: Notification[]; unread_count?: number }>('/v1/notifications/')
      .then(d => {
        setNotifications(d?.notifications ?? []);
        setUnreadCount(d?.unread_count ?? 0);
      })
      .catch(() => {});
  }, [isAuthPage, location.pathname]);

  const markAllRead = async () => {
    await patch('/v1/notifications/read-all', {});
    setNotifications(n => n.map(x => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-canvas text-foreground font-sans">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-canvas text-foreground font-sans overflow-hidden">
      <aside className="w-[260px] bg-surface flex flex-col shrink-0 border-r border-border">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-glow">
              <img src="/logo-removebg-preview.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <p className="font-semibold text-sm tracking-tight">Nycto Retail</p>
              <p className="text-xs text-muted">Enterprise POS</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-thin">
          {filteredNav.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div
                  whileHover={{ x: 2 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-accent-600 text-white shadow-sm'
                      : 'text-muted hover:text-foreground hover:bg-canvas-subtle'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/40 flex items-center justify-center text-accent-600 dark:text-accent-400 text-xs font-bold">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.username || 'Operator'}</p>
              <p className="text-xs text-muted capitalize">{userRole.replace('_', ' ')}</p>
            </div>
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-canvas-subtle text-muted transition-colors" aria-label="Toggle theme">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted hover:text-foreground hover:bg-canvas-subtle transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with notifications */}
        <header className="h-12 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center justify-end px-5 gap-2 shrink-0">
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 rounded-xl hover:bg-canvas-subtle text-muted hover:text-foreground transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 top-full mt-2 w-80 z-50 bg-surface rounded-2xl border border-border shadow-premium overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <span className="text-sm font-semibold">Notifications</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-xs text-accent-600 hover:underline">Mark all read</button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-sm text-muted text-center py-8">No notifications</p>
                      ) : notifications.slice(0, 20).map(n => (
                        <div key={n.id} className={`px-4 py-3 border-b border-border-subtle ${!n.read ? 'bg-accent-50/50 dark:bg-accent-900/10' : ''}`}>
                          <p className="text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-muted mt-0.5">{n.message}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
