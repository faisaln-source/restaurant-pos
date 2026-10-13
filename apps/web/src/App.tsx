import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { tryRestoreSession } from './services/auth.service';
import { connectSocket, disconnectSocket } from './lib/socket';

// Pages
import LoginPage from './pages/LoginPage';
import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import TablesPage from './pages/TablesPage';
import StaffPage from './pages/StaffPage';
import ReportsPage from './pages/ReportsPage';
import KDSPage from './pages/KDSPage';
import SettingsPage from './pages/SettingsPage';
import KioskPage from './pages/KioskPage';

// Guards
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleGuard from './components/auth/RoleGuard';

function App() {
  const { setProfile, setLoading, setAuthenticated, reset } = useAuthStore();
  const navigate = useNavigate();

  // Listen for session expiry events fired by the API client
  useEffect(() => {
    const handleAuthLogout = () => {
      reset();
      disconnectSocket();
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [reset, navigate]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const result = await tryRestoreSession();
        if (result && mounted) {
          setProfile({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            isActive: true,
            createdAt: '',
            updatedAt: '',
          });
          setAuthenticated(true);
          connectSocket();
        }
      } catch {
        // No valid session
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      disconnectSocket();
    };
  }, [setProfile, setLoading, setAuthenticated]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public Customer Self-Ordering Kiosk (KFC / McDonald's style) */}
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/customer" element={<KioskPage />} />
      <Route path="/order" element={<KioskPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER', 'CASHIER', 'WAITER']}>
            <DashboardPage />
          </RoleGuard>
        } />
        <Route path="orders" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER', 'CASHIER', 'WAITER']}>
            <OrdersPage />
          </RoleGuard>
        } />
        <Route path="orders/new" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER', 'CASHIER', 'WAITER']}>
            <OrdersPage />
          </RoleGuard>
        } />
        <Route path="menu" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER']}>
            <MenuPage />
          </RoleGuard>
        } />
        <Route path="tables" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER', 'CASHIER', 'WAITER']}>
            <TablesPage />
          </RoleGuard>
        } />
        <Route path="kds" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER', 'KITCHEN']}>
            <KDSPage />
          </RoleGuard>
        } />
        <Route path="staff" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER']}>
            <StaffPage />
          </RoleGuard>
        } />
        <Route path="reports" element={
          <RoleGuard allowed={['ADMIN', 'MANAGER']}>
            <ReportsPage />
          </RoleGuard>
        } />
        <Route path="kiosk" element={<KioskPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
