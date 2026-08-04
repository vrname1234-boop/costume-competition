import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { StudentSubmission, SubmissionWindow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Banner, Button, Card, Loading, PageHeader, StatusBadge } from '../../components/ui';
import { countdown, formatDateTime } from '../../lib/format';
import { EntryForm } from './EntryForm';

interface Payload {
  submission: StudentSubmission | null;
  submissionWindow: SubmissionWindow;
  canEdit: boolean;
  lockedMessage: string | null;
}

function useMySubmission() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.get<Payload>('/api/me/submission'));
      setError(null);
    } catch {
      setError('Your entry could not be loaded. Please refresh the page.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

export function StudentDashboard() {
  const { user } = useAuth();
  const { data, error } = useMySubmission();

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <Loading />;

  const { submission, submissionWindow, canEdit, lockedMessage } = data;

  return (
    <>
      <PageHeader title="Your entry" lead={`Signed in as ${user?.email ?? user?.displayName ?? ''}`} />

      <Banner tone={submissionWindow.open ? 'ok' : 'warn'}>
        {submissionWindow.message}
        {submissionWindow.open && submissionWindow.closesAt
          ? ` Closes ${formatDateTime(submissionWindow.closesAt)} (${countdown(
              submissionWindow.closesAt,
            )} left).`
          : ''}
      </Banner>

      {!submission ? (
        <Card title="No entry yet">
          {canEdit ? (
            <>
              <p>You have not submitted a costume photo yet.</p>
              <Link to="/submit">
                <Button>Start your entry</Button>
              </Link>
            </>
          ) : (
            <p className="muted">Submissions are not open, so no entry can be created.</p>
          )}
        </Card>
      ) : (
        <>
          {submission.status === 'rejected' && (
            <Banner tone="error">
              <strong>Your entry was not approved.</strong>
              <br />
              What staff wrote: {submission.reviewNote ?? 'No message was recorded.'}
              {submission.rejectionReason ? (
                <>
                  <br />
                  Reason: {submission.rejectionReason}
                  {submission.rejectionSeverity
                    ? ` (${submission.rejectionSeverity === 'serious' ? 'Red' : 'Yellow'})`
                    : ''}
                </>
              ) : null}
              <br />
              {submission.locked
                ? 'This is a red reason, so your entry is locked. See below.'
                : submission.rejectionSeverity === 'serious'
                  ? 'This was a red reason. Staff have reopened your entry.'
                  : canEdit
                    ? 'This is a yellow reason: fix it yourself and resubmit before the deadline.'
                    : 'Submissions are now closed, so it can no longer be changed.'}
            </Banner>
          )}

          {submission.locked && (
            <Banner tone="error">
              <strong>Your entry is locked.</strong>
              <br />
              {lockedMessage ??
                'Your entry has been referred to staff and cannot be resubmitted online. Speak to your year adviser or the teacher running the competition.'}
            </Banner>
          )}

          {submission.reopened && !submission.locked && (
            <Banner tone="ok">
              <strong>Your entry has been reopened.</strong>
              <br />
              Staff have unlocked it. Fix the problem you discussed with them, follow the rules and
              dress code, and resubmit before the deadline.
            </Banner>
          )}

          <Card
            title="Submission status"
            actions={<StatusBadge status={submission.status} />}
          >
            <div className="grid grid--two">
              <div>
                <dl className="definition">
                  <dt>Full name</dt>
                  <dd>{submission.fullName}</dd>
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
                </dl>
              </div>
              <div>
                <img className="photo photo--preview" src={submission.photoUrl} alt="Your costume" />
              </div>
            </div>

            <div className="button-row" style={{ marginTop: '1rem' }}>
              {canEdit ? (
                <Link to="/submit">
                  <Button>Edit submission</Button>
                </Link>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  Submissions are now closed. Editing is disabled.
                </p>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export function StudentEntryPage() {
  const { data, error } = useMySubmission();
  const navigate = useNavigate();

  useEffect(() => {
    if (data && !data.canEdit) navigate('/dashboard', { replace: true });
  }, [data, navigate]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <Loading />;

  return <EntryForm existing={data.submission} />;
}
