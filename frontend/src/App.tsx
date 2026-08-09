import type { ReactElement } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireRole } from "./auth/RequireRole";
import { Layout } from "./components/Layout";
import { MaintenanceNotice } from "./components/MaintenanceNotice";
import { Banner, Card } from "./components/ui";
import { ChangePassword } from "./pages/ChangePassword";
import { OwnerAdmins } from "./pages/owner/Admins";
import { OwnerAuditLog } from "./pages/owner/AuditLog";
import { OwnerCompetition } from "./pages/owner/Competition";
import { OwnerHome } from "./pages/owner/OwnerHome";
import { OwnerSiteEditor } from "./pages/owner/SiteEditor";
import { ForgotPassword } from "./pages/public/ForgotPassword";
import { Landing } from "./pages/public/Landing";
import { Register } from "./pages/public/Register";
import { SignIn } from "./pages/public/SignIn";
import { StaffSubmissionDetail } from "./pages/staff/SubmissionDetail";
import { StaffSubmissions } from "./pages/staff/Submissions";
import { StudentDashboard, StudentEntryPage } from "./pages/student/Dashboard";
import { text, useMaintenanceWatch, useSite } from "./lib/useSite";

function NotFound() {
  return (
    <Card narrow>
      <h1>Page not found</h1>
      <p className="muted">
        That page does not exist. Use the menu above to get back on track.
      </p>
    </Card>
  );
}

function Maintenance({ message }: { message: string }) {
  return (
    <Card narrow>
      <h1>Temporarily unavailable</h1>
      <Banner tone="warn">
        {message ||
          "The competition is temporarily unavailable while maintenance is in progress."}
      </Banner>
      <p className="muted">
        Student access will return as soon as maintenance is finished. Anything
        you have already submitted is safe.
      </p>
    </Card>
  );
}

/**
 * Pages that staff also use: only a student session is replaced with the
 * maintenance notice, so the Owner can still change their own password while
 * working on the site.
 */
function StudentLocked({
  maintenance,
  message,
  children,
}: {
  maintenance: boolean;
  message: string;
  children: ReactElement;
}) {
  const { user } = useAuth();
  return maintenance && user?.role === "student" ? (
    <Maintenance message={message} />
  ) : (
    children
  );
}

/**
 * Students are moved into and out of maintenance without touching anything.
 * Staff are left alone: they are the people working on the site, so their
 * page must not disappear from under them when the switch is thrown.
 */
function MaintenanceWatcher() {
  const { user } = useAuth();
  const seconds = useMaintenanceWatch(user === null || user.role === "student");

  return (
    <>
      {seconds === null ? null : <MaintenanceNotice seconds={seconds} />}
      <Outlet />
    </>
  );
}

export default function App() {
  const { site } = useSite();

  const competitionName =
    (site && text(site.content, "competition_title")) ||
    site?.competition.name ||
    "Costume Competition";

  const maintenance = site?.content.maintenance_mode === true;
  const maintenanceMessage = site
    ? text(site.content, "maintenance_message")
    : "";

  /**
   * While maintenance is on, every student-facing page becomes the maintenance
   * notice. Staff sign in and the staff and owner screens stay reachable so
   * the site can be worked on and the switch turned back off.
   */
  const studentPage = (element: ReactElement) =>
    maintenance && site ? (
      <Maintenance message={maintenanceMessage} />
    ) : (
      element
    );

  return (
    <AuthProvider>
      <Routes>
        <Route
          element={
            <Layout
              competitionName={competitionName}
              environment={site?.environment ?? null}
              maintenance={maintenance}
            />
          }
        >
          <Route element={<MaintenanceWatcher />}>
            <Route index element={studentPage(<Landing />)} />
            <Route path="sign-in" element={<SignIn />} />
            <Route path="register" element={studentPage(<Register />)} />
            <Route path="forgot-password" element={<ForgotPassword />} />

            <Route
              path="change-password"
              element={
                <RequireRole roles={["student", "admin", "owner"]}>
                  <StudentLocked
                    maintenance={maintenance}
                    message={maintenanceMessage}
                  >
                    <ChangePassword />
                  </StudentLocked>
                </RequireRole>
              }
            />

            <Route
              path="dashboard"
              element={
                <RequireRole roles={["student"]}>
                  {studentPage(<StudentDashboard />)}
                </RequireRole>
              }
            />
            <Route
              path="submit"
              element={
                <RequireRole roles={["student"]}>
                  {studentPage(<StudentEntryPage />)}
                </RequireRole>
              }
            />

            <Route
              path="staff"
              element={
                <RequireRole roles={["admin", "owner"]}>
                  <StaffSubmissions />
                </RequireRole>
              }
            />
            <Route
              path="staff/submissions/:id"
              element={
                <RequireRole roles={["admin", "owner"]}>
                  <StaffSubmissionDetail />
                </RequireRole>
              }
            />

            <Route
              path="owner"
              element={
                <RequireRole roles={["owner"]}>
                  <OwnerHome />
                </RequireRole>
              }
            />
            <Route
              path="owner/content"
              element={
                <RequireRole roles={["owner"]}>
                  <OwnerSiteEditor />
                </RequireRole>
              }
            />
            <Route
              path="owner/competition"
              element={
                <RequireRole roles={["owner"]}>
                  <OwnerCompetition />
                </RequireRole>
              }
            />
            <Route
              path="owner/admins"
              element={
                <RequireRole roles={["owner"]}>
                  <OwnerAdmins />
                </RequireRole>
              }
            />
            <Route
              path="owner/audit"
              element={
                <RequireRole roles={["owner"]}>
                  <OwnerAuditLog />
                </RequireRole>
              }
            />

            <Route path="admin" element={<Navigate to="/staff" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
