import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { SessionResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button, Card, Field, PageHeader } from '../components/ui';

const HOME_FOR_ROLE = { student: '/dashboard', admin: '/staff', owner: '/owner' } as const;

export function ChangePassword() {
  const { user, applySession } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const required = user?.mustChangePassword ?? false;
  const minimum = user?.role === 'student' ? 10 : 12;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    void api
      .post<SessionResponse>('/api/auth/change-password', { currentPassword, newPassword })
      .then((session) => {
        applySession(session);
        setDone(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirm('');
        if (required) navigate(HOME_FOR_ROLE[session.user.role], { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not change your password.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title={required ? 'Set a new password' : 'Change your password'}
        lead={
          required
            ? 'Your account was created with a temporary password. Choose your own before continuing.'
            : undefined
        }
      />

      <Card narrow>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {done && !required ? <Banner tone="ok">Your password has been changed.</Banner> : null}

        <form onSubmit={submit} noValidate>
          <Field label={required ? 'Temporary password' : 'Current password'} htmlFor="current">
            <input
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>

          <Field
            label="New password"
            htmlFor="new"
            hint={`At least ${minimum} characters, using a mix of letters, numbers or symbols.`}
          >
            <input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
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
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </Card>
    </>
  );
}
