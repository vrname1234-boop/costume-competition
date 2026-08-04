import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type { AdminAccount } from '../../api/types';
import { Banner, Button, Card, Field, Loading, PageHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

export function OwnerAdmins() {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ admins: AdminAccount[] }>('/api/owner/admins');
      setAdmins(response.admins);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Admin accounts could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .then(load)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'That action could not be completed.');
      })
      .finally(() => setBusy(false));
  };

  const create = () =>
    run(async () => {
      const response = await api.post<{ admin: AdminAccount; temporaryPassword: string }>(
        '/api/owner/admins',
        { username: username.trim().toLowerCase(), displayName: displayName.trim() },
      );
      setIssued({ username: response.admin.username, password: response.temporaryPassword });
      setUsername('');
      setDisplayName('');
    });

  return (
    <>
      <PageHeader
        title="Admin accounts"
        lead="Teachers sign in with a username. There is no public admin registration, and admins cannot create other admins."
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      {issued ? (
        <Banner tone="ok">
          <strong>Temporary password for {issued.username}</strong>
          <div className="mono" style={{ margin: '0.35rem 0' }}>
            {issued.password}
          </div>
          Give this to the teacher in person. It is shown once, and they must change it at first sign
          in.
          <div style={{ marginTop: '0.5rem' }}>
            <Button variant="secondary" small onClick={() => setIssued(null)}>
              Hide
            </Button>
          </div>
        </Banner>
      ) : null}

      <Card title="Create an admin account">
        <div className="grid grid--two">
          <Field label="Username" htmlFor="username" hint="Letters, numbers, dots, dashes and underscores.">
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="teacher.smith"
            />
          </Field>
          <Field label="Teacher name" htmlFor="displayName">
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ms Smith"
            />
          </Field>
        </div>
        <Button onClick={create} disabled={busy || username.trim().length < 3 || displayName.trim().length < 2}>
          Create account
        </Button>
      </Card>

      <Card title="Existing accounts">
        {!admins ? (
          <Loading />
        ) : admins.length === 0 ? (
          <p className="muted">No admin accounts yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last sign in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="mono">{admin.username}</td>
                    <td>{admin.displayName}</td>
                    <td>
                      {admin.status === 'active' ? 'Active' : 'Disabled'}
                      {admin.mustChangePassword ? (
                        <div className="small muted">Password change pending</div>
                      ) : null}
                    </td>
                    <td className="small nowrap">
                      {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'Never'}
                    </td>
                    <td className="right">
                      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          small
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const response = await api.post<{ temporaryPassword: string }>(
                                `/api/owner/admins/${admin.id}/reset-password`,
                              );
                              setIssued({
                                username: admin.username,
                                password: response.temporaryPassword,
                              });
                            })
                          }
                        >
                          Reset password
                        </Button>

                        {admin.status === 'active' ? (
                          <Button
                            variant="secondary"
                            small
                            disabled={busy}
                            onClick={() => run(() => api.post(`/api/owner/admins/${admin.id}/disable`))}
                          >
                            Disable
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            small
                            disabled={busy}
                            onClick={() => run(() => api.post(`/api/owner/admins/${admin.id}/restore`))}
                          >
                            Restore
                          </Button>
                        )}

                        <Button
                          variant="danger"
                          small
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`Delete the account ${admin.username}?`)) return;
                            run(() => api.delete(`/api/owner/admins/${admin.id}`));
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
