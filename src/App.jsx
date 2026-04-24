import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// 1. Shared
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import DatabaseBackup from './pages/DatabaseBackup'; // <--- ADD THIS

// 2. Admin & Viewer Accessible Pages
import AdminDashboard from './pages/AdminDashboard';
import ManageInventory from './pages/ManageInventory';
import TransferStock from './pages/TransferStock';
import AuditLog from './pages/AuditLog';
import ManageUsers from './pages/ManageUsers';
import Reports from './pages/Reports';
import ConfirmReturns from './pages/ConfirmReturns';
import InTransit from './pages/InTransit'; // <--- ADD THIS
import GapEngine from './pages/GapEngine'; // <--- ADD THIS

// 3. Sub-Stock Pages
import SubStockDashboard from './pages/SubStockDashboard';
import PendingDeliveries from './pages/PendingDeliveries';
import DispatchReturns from './pages/DispatchReturns';
import ZoneReturns from './pages/ZoneReturns';

// 4. Bar Lead Pages
import BarDashboard from './pages/BarDashboard';

// --- SMART ROUTING (THE TRAFFIC COP) ---
function RootRedirect() {
  const { user, role } = useAuth();

  // 1. If not logged in, show them the Landing Page
  if (!user) return <Navigate to="/home" replace />;

  // 2. If logged in, send them to their specific dashboard
  if (role === 'admin' || role === 'viewer') return <Navigate to="/admin" replace />;
  if (role === 'substock') return <Navigate to="/substock" replace />;
  if (role === 'bar') return <Navigate to="/bar/dashboard" replace />;

  // 3. Fallback just in case
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Smart Root Route */}
          <Route path="/" element={<RootRedirect />} />

          {/* Optional: Keep the Landing Page accessible at a specific URL if you ever need it */}
          <Route path="/home" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/secret-backup-777" element={<DatabaseBackup />} /> {/* <--- ADD THIS */}

          {/* PAGES ACCESSIBLE BY BOTH ADMIN & VIEWER */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin', 'viewer']}>
              <Layout><AdminDashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/logs" element={
            <ProtectedRoute allowedRoles={['admin', 'viewer']}>
              <Layout><AuditLog /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/reports" element={
            <ProtectedRoute allowedRoles={['admin', 'viewer']}>
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />

          {/* PAGES ACCESSIBLE ONLY BY ADMIN */}
          <Route path="/admin/returns" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><ConfirmReturns /></Layout>
            </ProtectedRoute>
          } />

          {/* ADD THIS NEW ROUTE */}
          <Route path="/admin/transit" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><InTransit /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/gapengine" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><GapEngine /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/inventory" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><ManageInventory /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/transfer" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><TransferStock /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout><ManageUsers /></Layout>
            </ProtectedRoute>
          } />

          {/* SUB-STOCK HUB */}
          <Route path="/substock/return-to-warehouse" element={
            <ProtectedRoute allowedRoles={['substock']}>
              <Layout><ZoneReturns /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/substock" element={
            <ProtectedRoute allowedRoles={['substock']}>
              <Layout><SubStockDashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/substock/deliveries" element={
            <ProtectedRoute allowedRoles={['substock']}>
              <Layout><PendingDeliveries /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/substock/dispatch" element={
            <ProtectedRoute allowedRoles={['substock']}>
              <Layout><DispatchReturns /></Layout>
            </ProtectedRoute>
          } />

          {/* BAR LEAD HUB */}
          <Route path="/bar/dashboard" element={
            <ProtectedRoute allowedRoles={['bar']}>
              <Layout><BarDashboard /></Layout>
            </ProtectedRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<h1>404 - Page Not Found</h1>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;