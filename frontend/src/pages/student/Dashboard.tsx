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

  const { submission, submissionWindow, canEdit } = data;

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
              Reason: {submission.reviewNote ?? 'No reason was recorded.'}
              {canEdit
                ? ' You can fix it and resubmit before the deadline.'
                : ' Submissions are now closed, so it can no longer be changed.'}
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
