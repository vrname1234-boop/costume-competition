import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'is-active' : undefined;
}

export function Layout({
  competitionName,
  environment,
}: {
  competitionName: string;
  environment: 'development' | 'staging' | 'production' | null;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    void signOut().then(() => navigate('/'));
  };

  return (
    <div className="app">
      {environment && environment !== 'production' ? (
        <div className="env-bar" role="status">
          {environment === 'staging' ? 'PRACTICE SITE' : 'LOCAL DEVELOPMENT'} — not the real
          competition. Entries here are test data and will not be judged.
        </div>
      ) : null}

      <header className="site-header">
        <div className="site-header__inner">
          <Link className="site-header__title" to="/">
            {competitionName}
            <span>Student costume entries</span>
          </Link>

          <nav className="site-nav" aria-label="Main">
            <NavLink to="/" className={navClass} end>
              Information
            </NavLink>

            {user?.role === 'student' && (
              <NavLink to="/dashboard" className={navClass}>
                My entry
              </NavLink>
            )}

            {(user?.role === 'admin' || user?.role === 'owner') && (
              <NavLink to="/staff" className={navClass}>
                Submissions
              </NavLink>
            )}

            {user?.role === 'owner' && (
              <NavLink to="/owner" className={navClass}>
                Owner console
              </NavLink>
            )}

            {user ? (
              <>
                <NavLink to="/change-password" className={navClass}>
                  Account
                </NavLink>
                <Button variant="secondary" small onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <NavLink to="/sign-in" className={navClass}>
                Sign in
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="site-main">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          {user ? `Signed in as ${user.displayName}` : 'Sign in with your school account to enter.'}
        </div>
      </footer>
    </div>
  );
}
