import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import AuthGuard from './components/AuthGuard';
import ThemeProvider from './components/ThemeProvider';
import Setup from './pages/Setup';
import Login from './pages/Login';
import OperationsDashboard from './pages/OperationsDashboard';
import Checkout from './pages/Checkout';
import PreviousOrders from './pages/PreviousOrders';
import GroceryProducts from './pages/GroceryProducts';
import InventoryPage from './pages/InventoryPage';
import GRN from './pages/GRN';
import BusinessIntelligence from './pages/BusinessIntelligence';
import SupplyChain from './pages/SupplyChain';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { ScannerProvider } from './hooks/useScanner';
import ToastContainer from './components/Toast';
import ConfirmDialogProvider from './components/ConfirmDialog';

export default function App() {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    document.addEventListener('focusin', handleFocus, true);
    return () => document.removeEventListener('focusin', handleFocus, true);
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider>
      <ScannerProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route element={<AuthGuard />}>
              <Route path="/" element={<Navigate to="/operations" replace />} />
              <Route path="/operations" element={<OperationsDashboard />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/previous-orders" element={<PreviousOrders />} />
              <Route path="/grocery-products" element={<GroceryProducts />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/grn" element={<GRN />} />
              <Route path="/business-intelligence" element={<BusinessIntelligence />} />
              <Route path="/supply-chain" element={<SupplyChain />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/dashboard" element={<Navigate to="/checkout" replace />} />
              <Route path="/batch-inventory" element={<Navigate to="/inventory" replace />} />
              <Route path="/batch-explorer" element={<Navigate to="/inventory" replace />} />
              <Route path="/inventory-health" element={<Navigate to="/inventory" replace />} />
              <Route path="*" element={<Navigate to="/operations" replace />} />
            </Route>
          </Route>
        </Routes>
        <ToastContainer />
        <ConfirmDialogProvider />
      </ScannerProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
