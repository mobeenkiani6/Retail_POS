import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './stores/auth';
import { useTheme } from './stores/theme';
import { AdminShell } from './layouts/AdminShell';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BranchesPage } from './pages/BranchesPage';
import { CatalogPage, CatalogDetailPage } from './pages/CatalogPage';
import { InventoryPage } from './pages/InventoryPage';
import { SalesPage, SaleDetailPage } from './pages/SalesPage';
import { CustomersPage, CustomerDetailPage } from './pages/CustomersPage';
import { SuppliersPage, SupplierDetailPage } from './pages/SuppliersPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { FinancePage } from './pages/FinancePage';
import { MarketingPage } from './pages/MarketingPage';
import { BiPage } from './pages/BiPage';
import { ReportsPage } from './pages/ReportsPage';
import { SecurityPage } from './pages/SecurityPage';
import { SettingsPage } from './pages/SettingsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { hydrated, token, canAccessAdmin, hydrate } = useAuth();
  useEffect(() => { hydrate(); }, [hydrate]);
  if (!hydrated) return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  if (!token || !canAccessAdmin()) return <Navigate to="/login" replace />;
  return children;
}

function CatalogDetailRoute() {
  const { id } = useParams();
  return <CatalogDetailPage id={id || ''} />;
}
function SaleDetailRoute() {
  const { id } = useParams();
  return <SaleDetailPage id={id || ''} />;
}
function SupplierDetailRoute() {
  const { id } = useParams();
  return <SupplierDetailPage id={id || ''} />;
}

export default function App() {
  const { hydrate: hydrateTheme } = useTheme();
  useEffect(() => { hydrateTheme(); }, [hydrateTheme]);

  // Fallback: select lone "0" in any number field so typing replaces it immediately
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
      if (el.value === '0') el.select();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AdminShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="bi" element={<BiPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="catalog/:id" element={<CatalogDetailRoute />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="sales/:id" element={<SaleDetailRoute />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="suppliers/:id" element={<SupplierDetailRoute />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
