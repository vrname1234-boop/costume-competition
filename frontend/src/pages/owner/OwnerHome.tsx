import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { OwnerStats } from '../../api/types';
import { Banner, Button, Card, Loading, PageHeader, Stat } from '../../components/ui';
import { actionLabel, formatDateTime } from '../../lib/format';

export function OwnerHome() {
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api.get<OwnerStats>('/api/owner/stats'));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'The dashboard could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !stats) return <Banner tone="error">{error}</Banner>;
  if (!stats) return <Loading />;

  const toggleMaintenance = () => {
    setBusy(true);
    void api
      .put('/api/owner/maintenance', { enabled: !stats.maintenanceMode })
      .then(load)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Maintenance mode could not be changed.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader title="Owner console" lead="Everything about the competition can be changed here without a developer." />

      {error ? <Banner tone="error">{error}</Banner> : null}

      {stats.maintenanceMode ? (
        <Banner tone="warn">
          Maintenance mode is on. Students cannot submit or edit entries. Staff can still sign in.
        </Banner>
      ) : null}

      <div className="grid grid--stats" style={{ marginBottom: '1.25rem' }}>
        <Stat label="Students registered" value={stats.students} />
        <Stat label="Entries" value={stats.submissions} />
        <Stat label="Pending review" value={stats.pendingSubmissions} />
        <Stat label="Admin accounts" value={stats.admins} />
        <Stat label="Disabled admins" value={stats.disabledAdmins} />
      </div>

      <div className="grid grid--two">
        <Card title="System status">
          <dl className="definition">
            <dt>Submissions</dt>
            <dd>{stats.submissionsEnabled ? 'Enabled' : 'Paused'}</dd>
            <dt>Competition settings</dt>
            <dd>{stats.competitionLocked ? 'Locked (submissions have opened)' : 'Editable'}</dd>
            <dt>Maintenance mode</dt>
            <dd>{stats.maintenanceMode ? 'On' : 'Off'}</dd>
          </dl>
          <div className="button-row">
            <Button variant={stats.maintenanceMode ? 'primary' : 'secondary'} onClick={toggleMaintenance} disabled={busy}>
              {stats.maintenanceMode ? 'Turn maintenance mode off' : 'Turn maintenance mode on'}
            </Button>
          </div>
        </Card>

        <Card title="Manage">
          <ul className="stack" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            <li>
              <Link to="/owner/content">Website content</Link> — rules, dress code, instructions,
              announcements
            </li>
            <li>
              <Link to="/owner/competition">Competition settings</Link> — dates, categories, houses,
              upload limits
            </li>
            <li>
              <Link to="/owner/admins">Admin accounts</Link> — create, disable, reset passwords
            </li>
            <li>
              <Link to="/owner/audit">Audit log</Link> — every important change
            </li>
            <li>
              <Link to="/staff">Submissions</Link> — review entries
            </li>
          </ul>
        </Card>
      </div>

      <Card title="Recent important activity">
        {stats.recentActivity.length === 0 ? (
          <p className="muted">Nothing has been recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentActivity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap small">{formatDateTime(entry.created_at)}</td>
                    <td>{entry.actor_label}</td>
                    <td>{actionLabel(entry.action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small" style={{ marginTop: '0.75rem' }}>
          <Link to="/owner/audit">View the full audit log</Link>
        </p>
      </Card>
    </>
  );
}
