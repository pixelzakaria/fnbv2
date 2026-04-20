import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role } = useAuth();

  // 1. If not logged in, kick to login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // 2. If role is not allowed, redirect to their specific home base
  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'admin' || role === 'viewer') return <Navigate to="/admin" />;
    if (role === 'substock') return <Navigate to="/substock" />;
    if (role === 'bar') return <Navigate to="/bar/dashboard" />;
    
    return <Navigate to="/login" />;
  }

  // 3. Authorized
  return children;
}