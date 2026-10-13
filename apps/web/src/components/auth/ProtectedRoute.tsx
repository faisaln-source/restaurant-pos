import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface Props { children: React.ReactNode; }

export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuthStore();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-base)',
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48,
            border: '3px solid var(--border)',
            borderTopColor: 'var(--brand-500)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading POS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
