import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv } from '../../api/client';
import type { AdminStats, AdminSubmission, SubmissionStatus } from '../../api/types';
import { Banner, Button, Card, Field, Loading, PageHeader, Stat, StatusBadge } from '../../components/ui';
import { countdown, formatDateTime } from '../../lib/format';

const YEAR_GROUPS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'];
const PAGE_SIZE = 25;

interface ListResponse {
  submissions: AdminSubmission[];
  page: number;
  total: number;
}

export function StaffSubmissions() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [list, setList] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | ''>('');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<AdminStats>('/api/admin/stats')
      .then(setStats)
      .catch(() => setError('Statistics could not be loaded.'));
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (year) params.set('year', year);
    if (appliedSearch) params.set('q', appliedSearch);
    try {
      setList(await api.get<ListResponse>(`/api/admin/submissions?${params.toString()}`));
      setError(null);
    } catch {
      setError('Submissions could not be loaded.');
    }
  }, [page, status, year, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Submissions"
        lead={stats ? `${stats.competition.name} · ${stats.submissionWindow.open ? 'Open' : 'Closed'}` : undefined}
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      {stats ? (
        <div className="grid grid--stats" style={{ marginBottom: '1.25rem' }}>
          <Stat label="Total entries" value={stats.totals.total} />
          <Stat label="Pending review" value={stats.totals.pending} />
          <Stat label="Approved" value={stats.totals.approved} />
          <Stat label="Needs changes" value={stats.totals.rejected} />
          <Stat label="Closes in" value={countdown(stats.competition.closesAt)} />
        </div>
      ) : null}

      <Card>
        <div className="toolbar">
          <Field label="Status" htmlFor="filter-status">
            <select
              id="filter-status"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as SubmissionStatus | '');
              }}
            >
              <option value="">All</option>
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Needs changes</option>
            </select>
          </Field>

          <Field label="Year group" htmlFor="filter-year">
            <select
              id="filter-year"
              value={year}
              onChange={(event) => {
                setPage(1);
                setYear(event.target.value);
              }}
            >
              <option value="">All</option>
              {YEAR_GROUPS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Search" htmlFor="filter-search">
            <input
              id="filter-search"
              placeholder="Name, costume, roll group or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setAppliedSearch(search.trim());
                }
              }}
            />
          </Field>

          <Button
            onClick={() => {
              setPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            Search
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              void downloadCsv('/api/admin/export.csv', 'submissions.csv');
            }}
          >
            Export CSV
          </Button>
        </div>

        {!list ? (
          <Loading />
        ) : list.submissions.length === 0 ? (
          <div className="table-empty">No submissions match those filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Year</th>
                  <th>Class</th>
                  <th>Costume</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      {submission.fullName}
                      <div className="small muted">{submission.studentEmail}</div>
                    </td>
                    <td className="nowrap">{submission.yearGrade}</td>
                    <td>{submission.classRollGroup}</td>
                    <td>{submission.costumeName}</td>
                    <td>
                      <StatusBadge status={submission.status} />
                    </td>
                    <td className="nowrap small">{formatDateTime(submission.submittedAt)}</td>
                    <td className="right">
                      <Link to={`/staff/submissions/${submission.id}`}>Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list && list.total > PAGE_SIZE ? (
          <div className="pagination">
            <span>
              Page {list.page} of {totalPages} · {list.total} entries
            </span>
            <div className="button-row">
              <Button
                variant="secondary"
                small
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                small
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
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
