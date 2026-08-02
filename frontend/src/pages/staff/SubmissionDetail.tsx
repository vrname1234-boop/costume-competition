import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { AdminSubmissionDetail } from '../../api/types';
import { Banner, Button, Card, Field, Loading, PageHeader, StatusBadge } from '../../components/ui';
import { fileSize, formatDateTime } from '../../lib/format';

const YEAR_GROUPS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'];

export function StaffSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<AdminSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    year_grade: '',
    class_roll_group: '',
    costume_name: '',
    costume_description: '',
  });

  const [rejectReason, setRejectReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [replacement, setReplacement] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ submission: AdminSubmissionDetail }>(
        `/api/admin/submissions/${id ?? ''}`,
      );
      setSubmission(response.submission);
      setForm({
        full_name: response.submission.fullName,
        year_grade: response.submission.yearGrade,
        class_roll_group: response.submission.classRollGroup,
        costume_name: response.submission.costumeName,
        costume_description: response.submission.costumeDescription,
      });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'That submission could not be loaded.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = (work: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void work()
      .then(async () => {
        setNotice(successMessage);
        await load();
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'That action could not be completed.');
      })
      .finally(() => setBusy(false));
  };

  if (error && !submission) return <Banner tone="error">{error}</Banner>;
  if (!submission) return <Loading />;

  return (
    <>
      <PageHeader title={submission.fullName} lead={submission.studentEmail ?? undefined} />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}

      <div className="grid grid--two">
        <Card title="Entry" actions={<StatusBadge status={submission.status} />}>
          {editing ? (
            <>
              <Field label="Full name" htmlFor="full_name">
                <input
                  id="full_name"
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                />
              </Field>
              <Field label="Year group" htmlFor="year_grade">
                <select
                  id="year_grade"
                  value={form.year_grade}
                  onChange={(event) => setForm({ ...form, year_grade: event.target.value })}
                >
                  {YEAR_GROUPS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Class or roll group" htmlFor="class_roll_group">
                <input
                  id="class_roll_group"
                  value={form.class_roll_group}
                  onChange={(event) => setForm({ ...form, class_roll_group: event.target.value })}
                />
              </Field>
              <Field label="Costume name" htmlFor="costume_name">
                <input
                  id="costume_name"
                  value={form.costume_name}
                  onChange={(event) => setForm({ ...form, costume_name: event.target.value })}
                />
              </Field>
              <Field label="Costume description" htmlFor="costume_description">
                <textarea
                  id="costume_description"
                  value={form.costume_description}
                  onChange={(event) => setForm({ ...form, costume_description: event.target.value })}
                />
              </Field>
              <div className="button-row">
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.patch(`/api/admin/submissions/${submission.id}`, form);
                      setEditing(false);
                    }, 'Details updated. The change has been recorded in the audit log.')
                  }
                >
                  Save changes
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <dl className="definition">
                <dt>Year group</dt>
                <dd>{submission.yearGrade}</dd>
                <dt>Class / roll group</dt>
                <dd>{submission.classRollGroup}</dd>
                {submission.house ? (
                  <>
                    <dt>House</dt>
                    <dd>{submission.house}</dd>
                  </>
                ) : null}
                {submission.category ? (
                  <>
                    <dt>Category</dt>
                    <dd>{submission.category}</dd>
                  </>
                ) : null}
                <dt>Costume</dt>
                <dd>{submission.costumeName}</dd>
                <dt>Description</dt>
                <dd className="prose">{submission.costumeDescription}</dd>
                <dt>Submitted</dt>
                <dd>{formatDateTime(submission.submittedAt)}</dd>
                <dt>Last updated</dt>
                <dd>{formatDateTime(submission.updatedAt)}</dd>
                {submission.reviewedBy ? (
                  <>
                    <dt>Reviewed by</dt>
                    <dd>
                      {submission.reviewedBy} · {formatDateTime(submission.reviewedAt)}
                    </dd>
                  </>
                ) : null}
                {submission.reviewNote ? (
                  <>
                    <dt>Reason given</dt>
                    <dd>{submission.reviewNote}</dd>
                  </>
                ) : null}
              </dl>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit details
              </Button>
            </>
          )}
        </Card>

        <Card title="Photo">
          <img className="photo photo--preview" src={submission.photoUrl} alt="Costume submission" />
          <p className="small muted">
            {submission.image.width} × {submission.image.height} · {fileSize(submission.image.bytes)}
          </p>

          <Field label="Replace photo" htmlFor="replacement" hint="Use only to fix an unusable image.">
            <input
              id="replacement"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setReplacement(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!replacement || busy}
            onClick={() =>
              run(async () => {
                const form = new FormData();
                form.append('photo', replacement as File);
                await api.upload(`/api/admin/submissions/${submission.id}/photo`, form, 'PUT');
                setReplacement(null);
              }, 'Photo replaced. The previous photo is kept in the history.')
            }
          >
            Replace photo
          </Button>

          {submission.previousPhotos.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h3>Previous photos</h3>
              <div className="button-row">
                {submission.previousPhotos.map((photo) => (
                  <figure key={photo.replacedAt} style={{ margin: 0 }}>
                    <img className="photo photo--thumb" src={photo.photoUrl} alt="Previous version" />
                    <figcaption className="small muted">{formatDateTime(photo.replacedAt)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="Review decision">
        <div className="button-row" style={{ marginBottom: '1rem' }}>
          <Button
            disabled={busy || submission.status === 'approved'}
            onClick={() =>
              run(
                () => api.post(`/api/admin/submissions/${submission.id}/approve`),
                'Entry approved. The student has been notified.',
              )
            }
          >
            Approve entry
          </Button>
        </div>

        <Field
          label="Reject with a reason"
          htmlFor="reject-reason"
          hint="The student sees this reason and can resubmit before the deadline."
        >
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
        </Field>
        <Button
          variant="danger"
          disabled={busy || rejectReason.trim().length < 5}
          onClick={() =>
            run(async () => {
              await api.post(`/api/admin/submissions/${submission.id}/reject`, {
                reason: rejectReason.trim(),
              });
              setRejectReason('');
            }, 'Entry rejected. The student has been notified.')
          }
        >
          Reject entry
        </Button>
      </Card>

      <Card title="Remove entry">
        <p className="muted small">
          Deleting removes the entry and its photos permanently. Record why, so the action makes
          sense in the audit log later.
        </p>
        <Field label="Reason for removal" htmlFor="delete-reason">
          <input
            id="delete-reason"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
          />
        </Field>
        <Button
          variant="danger"
          disabled={busy || deleteReason.trim().length < 5}
          onClick={() => {
            if (!window.confirm('Delete this entry and its photos? This cannot be undone.')) return;
            setBusy(true);
            void api
              .delete(`/api/admin/submissions/${submission.id}`, { reason: deleteReason.trim() })
              .then(() => navigate('/staff', { replace: true }))
              .catch((err: unknown) => {
                setError(err instanceof ApiError ? err.message : 'The entry could not be deleted.');
              })
              .finally(() => setBusy(false));
          }}
        >
          Delete entry
        </Button>
      </Card>
    </>
  );
}
