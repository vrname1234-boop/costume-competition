import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Banner, Button, Card, Field, PageHeader } from "../../components/ui";
import { useSite } from "../../lib/useSite";

const HOME_FOR_ROLE = {
  student: "/dashboard",
  admin: "/staff",
  owner: "/owner",
} as const;

export function SignIn() {
  const { signIn } = useAuth();
  const { site } = useSite();
  const maintenance = site?.content.maintenance_mode === true;
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void signIn(identifier.trim(), password)
      .then((user) => {
        navigate(
          user.mustChangePassword
            ? "/change-password"
            : HOME_FOR_ROLE[user.role],
          {
            replace: true,
          },
        );
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not sign in. Please try again.",
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title="Sign in"
        lead="Students sign in with their school email. Staff sign in with the username they were given."
      />

      {maintenance ? (
        <Banner tone="warn">
          The site is closed for maintenance. Student sign in is unavailable
          until it reopens. Staff and Owner accounts can still sign in.
        </Banner>
      ) : null}

      <Card narrow>
        <form onSubmit={submit} noValidate>
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Field label="School email or staff username" htmlFor="identifier">
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          <div className="button-row">
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <Link to="/forgot-password" className="small">
              Forgot your password?
            </Link>
          </div>
        </form>

        <p className="small muted" style={{ marginTop: "1rem" }}>
          New student? <Link to="/register">Create your account</Link>.
        </p>
      </Card>
    </>
  );
}
