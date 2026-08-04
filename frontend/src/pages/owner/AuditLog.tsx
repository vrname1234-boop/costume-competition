import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type { AuditLogEntry } from '../../api/types';
import { Banner, Button, Card, Field, Loading, PageHeader } from '../../components/ui';
import { actionLabel, formatDateTime, summariseValues } from '../../lib/format';

const PAGE_SIZE = 50;

const ACTIONS = [
  'admin.created',
  'admin.updated',
  'admin.disabled',
  'admin.restored',
  'admin.deleted',
  'admin.password_reset',
  'owner.password_changed',
  'submission.created',
  'submission.approved',
  'submission.rejected',
  'submission.edited_by_staff',
  'submission.photo_replaced',
  'submission.deleted',
  'site_content.changed',
  'competition_settings.changed',
  'maintenance.toggled',
  'house.changed',
  'category.changed',
];

export function OwnerAuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState('');
  const [appliedActor, setAppliedActor] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (appliedActor) params.set('actor', appliedActor);
    if (action) params.set('action', action);
    try {
      const response = await api.get<{ logs: AuditLogEntry[]; total: number }>(
        `/api/owner/audit-logs?${params.toString()}`,
      );
      setLogs(response.logs);
      setTotal(response.total);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'The audit log could not be loaded.');
    }
  }, [page, appliedActor, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit log"
        lead="Every important change: who did it, what changed, the old and new values, when, and from which IP address. Only the Owner can see this."
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <Card>
        <div className="toolbar">
          <Field label="Who" htmlFor="actor">
            <input
              id="actor"
              placeholder="Username or email"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setAppliedActor(actor.trim());
                }
              }}
            />
          </Field>

          <Field label="Action" htmlFor="action">
            <select
              id="action"
              value={action}
              onChange={(event) => {
                setPage(1);
                setAction(event.target.value);
              }}
            >
              <option value="">All actions</option>
              {ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </select>
          </Field>

          <Button
            onClick={() => {
              setPage(1);
              setAppliedActor(actor.trim());
            }}
          >
            Filter
          </Button>
        </div>

        {!logs ? (
          <Loading />
        ) : logs.length === 0 ? (
          <div className="table-empty">Nothing matches those filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap small">{formatDateTime(entry.created_at)}</td>
                    <td>
                      {entry.actor_label}
                      {entry.actor_role ? <div className="small muted">{entry.actor_role}</div> : null}
                    </td>
                    <td>{actionLabel(entry.action)}</td>
                    <td className="prose small">{summariseValues(entry.old_value)}</td>
                    <td className="prose small">{summariseValues(entry.new_value)}</td>
                    <td className="mono small">{entry.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="pagination">
            <span>
              Page {page} of {totalPages} · {total} entries
            </span>
            <div className="button-row">
              <Button variant="secondary" small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="secondary"
                small
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
