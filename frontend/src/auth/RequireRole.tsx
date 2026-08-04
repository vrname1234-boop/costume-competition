import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../api/types';
import { useAuth } from './AuthContext';

/**
 * A convenience only. Every protected endpoint is enforced on the server, so
 * bypassing this component in the browser gains nothing.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="skeleton container">Loading…</p>;

  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="container">
        <div className="card card--narrow">
          <h1>No access</h1>
          <p className="muted">
            Your account does not have permission to view this page. If you think that is wrong,
            speak to the competition organiser.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
