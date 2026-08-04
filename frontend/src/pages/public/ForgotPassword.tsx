import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { SessionResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Banner, Button, Card, Field, PageHeader } from '../../components/ui';

export function ForgotPassword() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void api
      .post<{ message: string }>('/api/auth/forgot-password', { email: email.trim().toLowerCase() })
      .then((response) => {
        setNotice(response.message);
        setStep('reset');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not send the code.');
      })
      .finally(() => setBusy(false));
  };

  const reset = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    void api
      .post<SessionResponse>('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
      })
      .then((session) => {
        applySession(session);
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader title="Reset your password" lead="We send a 6-digit code to your school email." />

      <Card narrow>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice && step === 'reset' ? <Banner tone="ok">{notice}</Banner> : null}

        {step === 'request' ? (
          <form onSubmit={request} noValidate>
            <Field label="School email" htmlFor="email">
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
              {busy ? 'Sending…' : 'Send reset code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={reset} noValidate>
            <Field label="6-digit code" htmlFor="code">
              <input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>
            <Field label="New password" htmlFor="password" hint="At least 10 characters.">
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm">
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        )}

        <p className="small muted" style={{ marginTop: '1rem' }}>
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </Card>
    </>
  );
}
