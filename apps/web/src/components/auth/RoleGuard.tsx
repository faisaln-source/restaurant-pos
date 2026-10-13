import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { UserProfile } from '../../lib/types';

interface Props {
  children: React.ReactNode;
  allowed: UserProfile['role'][];
}

/**
 * Restricts page access by role. Redirects unauthorized users to their
 * default landing page.
 */
export default function RoleGuard({ children, allowed }: Props) {
  const { profile } = useAuthStore();

  if (!profile) return <Navigate to="/login" replace />;

  if (!allowed.includes(profile.role)) {
    // Kitchen staff → KDS, everyone else → dashboard
    const fallback = profile.role === 'KITCHEN' ? '/kds' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
