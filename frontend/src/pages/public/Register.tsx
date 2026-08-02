import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { SessionResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Banner, Button, Card, Field, PageHeader } from '../../components/ui';

type Step = 'details' | 'verify';

export function Register() {
  const { applySession } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('details');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void api
      .post<{ message: string }>('/api/auth/student/register', {
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
      })
      .then((response) => {
        setNotice(response.message);
        setStep('verify');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not send the code. Try again.');
      })
      .finally(() => setBusy(false));
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    void api
      .post<SessionResponse>('/api/auth/student/verify', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
      })
      .then((session) => {
        applySession(session);
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not verify that code.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title="Create your account"
        lead="Only school email addresses can enter. We email you a 6-digit code to confirm the address belongs to you."
      />

      <Card narrow>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice && step === 'verify' ? <Banner tone="ok">{notice}</Banner> : null}

        {step === 'details' ? (
          <form onSubmit={requestCode} noValidate>
            <Field label="Your full name" htmlFor="name">
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </Field>

            <Field
              label="School email"
              htmlFor="email"
              hint="For example: student.name123@education.nsw.gov.au"
            >
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>

            <Button type="submit" disabled={busy}>
              {busy ? 'Sending code…' : 'Send verification code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <Field label="6-digit code" htmlFor="code" hint="Check your school inbox. The code expires in 10 minutes.">
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>

            <Field
              label="Create a password"
              htmlFor="password"
              hint="At least 10 characters, using a mix of letters, numbers or symbols."
            >
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>

            <Field label="Confirm password" htmlFor="confirm">
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </Field>

            <div className="button-row">
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account'}
              </Button>
              <Button variant="secondary" onClick={() => setStep('details')} disabled={busy}>
                Change email
              </Button>
            </div>
          </form>
        )}

        <p className="small muted" style={{ marginTop: '1rem' }}>
          Already have an account? <Link to="/sign-in">Sign in</Link>.
        </p>
      </Card>
    </>
  );
}
