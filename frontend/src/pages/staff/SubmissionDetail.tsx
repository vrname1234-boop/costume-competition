import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { AdminSubmissionDetail, RejectionReason } from '../../api/types';
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

  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [rejectCode, setRejectCode] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [unlockNote, setUnlockNote] = useState('');
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

  useEffect(() => {
    void api
      .get<{ reasons: RejectionReason[] }>('/api/admin/rejection-reasons')
      .then((response) => setReasons(response.reasons))
      .catch(() => setReasons([]));
  }, []);

  const selectedReason = reasons.find((reason) => reason.code === rejectCode) ?? null;

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
      {submission.locked ? (
        <Banner tone="error">
          This entry is locked after a serious rejection. The student cannot resubmit until a staff
          member unlocks it below, after speaking with them.
        </Banner>
      ) : null}

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
                    <dt>Message sent to student</dt>
                    <dd>{submission.reviewNote}</dd>
                  </>
                ) : null}
                {submission.rejectionReason ? (
                  <>
                    <dt>Staff reason (not shown to student)</dt>
                    <dd>{submission.rejectionReason}</dd>
                  </>
                ) : null}
                {submission.internalNote ? (
                  <>
                    <dt>Staff note (not shown to student)</dt>
                    <dd className="prose">{submission.internalNote}</dd>
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
          label="Staff reason for rejecting"
          htmlFor="reject-code"
          hint="Not shown to the student. Recorded in the audit log. Serious reasons lock the entry so it cannot be resubmitted online."
        >
          <select
            id="reject-code"
            value={rejectCode}
            onChange={(event) => {
              const code = event.target.value;
              setRejectCode(code);
              const chosen = reasons.find((reason) => reason.code === code);
              if (chosen && !rejectReason.trim()) setRejectReason(chosen.suggestedMessage);
            }}
          >
            <option value="">Choose a reason</option>
            <optgroup label="Student can fix and resubmit">
              {reasons
                .filter((reason) => reason.severity === 'minor')
                .map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Serious — locks the entry">
              {reasons
                .filter((reason) => reason.severity === 'serious')
                .map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
            </optgroup>
          </select>
        </Field>

        {selectedReason?.severity === 'serious' ? (
          <Banner tone="error">
            This locks the entry. The student will be told to speak to a teacher and cannot resubmit
            until staff unlock it.
          </Banner>
        ) : null}

        <Field
          label="Message to the student"
          htmlFor="reject-reason"
          hint="The student reads this on their dashboard. Keep it factual."
        >
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
        </Field>

        <Field
          label={
            selectedReason?.severity === 'serious'
              ? 'Staff note (required)'
              : 'Staff note (optional)'
          }
          htmlFor="internal-note"
          hint="Staff and the audit log only. What happened, and anything the next teacher needs to know."
        >
          <textarea
            id="internal-note"
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
          />
        </Field>

        <Button
          variant="danger"
          disabled={
            busy ||
            !rejectCode ||
            rejectReason.trim().length < 5 ||
            (selectedReason?.severity === 'serious' && internalNote.trim().length < 5)
          }
          onClick={() =>
            run(async () => {
              await api.post(`/api/admin/submissions/${submission.id}/reject`, {
                reason: rejectReason.trim(),
                code: rejectCode,
                internalNote: internalNote.trim() || undefined,
              });
              setRejectReason('');
              setInternalNote('');
              setRejectCode('');
            }, 'Entry rejected. The student has been notified.')
          }
        >
          Reject entry
        </Button>
      </Card>

      {submission.locked ? (
        <Card title="Unlock entry">
          <p className="muted small">
            Unlock only after speaking with the student. The note below is recorded in the audit log.
          </p>
          <Field label="What was agreed" htmlFor="unlock-note">
            <textarea
              id="unlock-note"
              value={unlockNote}
              onChange={(event) => setUnlockNote(event.target.value)}
            />
          </Field>
          <Button
            disabled={busy || unlockNote.trim().length < 5}
            onClick={() =>
              run(async () => {
                await api.post(`/api/admin/submissions/${submission.id}/unlock`, {
                  note: unlockNote.trim(),
                });
                setUnlockNote('');
              }, 'Entry unlocked. The student can resubmit before the deadline.')
            }
          >
            Unlock entry
          </Button>
        </Card>
      ) : null}

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
