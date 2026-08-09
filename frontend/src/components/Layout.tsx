import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "is-active" : undefined;
}

export function Layout({
  competitionName,
  environment,
  maintenance,
}: {
  competitionName: string;
  environment: "development" | "staging" | "production" | null;
  maintenance: boolean;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  /**
   * With maintenance on, the student side is reduced to the maintenance page:
   * no entry link, no account page, nothing suggesting the competition is
   * still usable. Sign in and sign out stay, so staff can get in and a
   * signed-in student is not trapped. Staff sessions are untouched.
   */
  const studentLockdown = maintenance && (!user || user.role === "student");

  const handleSignOut = () => {
    void signOut().then(() => navigate("/"));
  };

  return (
    <div className="app">
      {environment && environment !== "production" ? (
        <div className="env-bar" role="status">
          {environment === "staging" ? "PRACTICE SITE" : "LOCAL DEVELOPMENT"} —
          not the real competition. Entries here are test data and will not be
          judged.
        </div>
      ) : null}

      <header className="site-header">
        <div className="site-header__inner">
          <Link className="site-header__title" to="/">
            {competitionName}
            <span>Student costume entries</span>
          </Link>

          <nav className="site-nav" aria-label="Main">
            {studentLockdown ? null : (
              <NavLink to="/" className={navClass} end>
                Information
              </NavLink>
            )}

            {user?.role === "student" && !studentLockdown && (
              <NavLink to="/dashboard" className={navClass}>
                My entry
              </NavLink>
            )}

            {(user?.role === "admin" || user?.role === "owner") && (
              <NavLink to="/staff" className={navClass}>
                Submissions
              </NavLink>
            )}

            {user?.role === "owner" && (
              <NavLink to="/owner" className={navClass}>
                Owner console
              </NavLink>
            )}

            {user ? (
              <>
                {studentLockdown ? null : (
                  <NavLink to="/change-password" className={navClass}>
                    Account
                  </NavLink>
                )}
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
          {studentLockdown
            ? "Maintenance in progress."
            : user
              ? `Signed in as ${user.displayName}`
              : "Sign in with your school account to enter."}
        </div>
      </footer>
    </div>
  );
}
