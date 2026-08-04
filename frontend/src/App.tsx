import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireRole } from "./auth/RequireRole";
import { Layout } from "./components/Layout";
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
import { text, useSite } from "./lib/useSite";

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
    <div className="container" style={{ paddingTop: "3rem" }}>
      <Card narrow>
        <h1>Temporarily unavailable</h1>
        <Banner tone="warn">{message}</Banner>
      </Card>
    </div>
  );
}

export default function App() {
  const { site } = useSite();

  const competitionName =
    (site && text(site.content, "competition_title")) ||
    site?.competition.name ||
    "Costume Competition";

  const maintenance = site?.content.maintenance_mode === true;

  return (
    <AuthProvider>
      <Routes>
        <Route
          element={
            <Layout
              competitionName={competitionName}
              environment={site?.environment ?? null}
            />
          }
        >
          <Route
            index
            element={
              maintenance && site ? (
                <Maintenance
                  message={text(site.content, "maintenance_message")}
                />
              ) : (
                <Landing />
              )
            }
          />
          <Route path="sign-in" element={<SignIn />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />

          <Route
            path="change-password"
            element={
              <RequireRole roles={["student", "admin", "owner"]}>
                <ChangePassword />
              </RequireRole>
            }
          />

          <Route
            path="dashboard"
            element={
              <RequireRole roles={["student"]}>
                <StudentDashboard />
              </RequireRole>
            }
          />
          <Route
            path="submit"
            element={
              <RequireRole roles={["student"]}>
                <StudentEntryPage />
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
      </Routes>
    </AuthProvider>
  );
}
