import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Banner, Card, Loading, PageHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { text, useSite } from '../../lib/useSite';

export function Landing() {
  const { site, loading, error } = useSite();
  const { user } = useAuth();

  if (loading) return <Loading />;
  if (error || !site) return <Banner tone="error">{error}</Banner>;

  const announcement = text(site.content, 'announcement');
  const window = site.submissionWindow;

  return (
    <>
      <PageHeader
        title={text(site.content, 'competition_title') || site.competition.name}
        lead={text(site.content, 'homepage_intro')}
      />

      {announcement ? <Banner tone="info">{announcement}</Banner> : null}

      <Banner tone={window.open ? 'ok' : 'warn'}>
        {window.message}
        {window.closesAt ? ` Entries close ${formatDateTime(window.closesAt)}.` : ''}
      </Banner>

      <div className="grid grid--two">
        <Card title="About the competition">
          <p className="prose">{text(site.content, 'description')}</p>
          <dl className="definition">
            <dt>Opens</dt>
            <dd>{formatDateTime(site.competition.opensAt)}</dd>
            <dt>Closes</dt>
            <dd>{formatDateTime(site.competition.closesAt)}</dd>
            {site.competition.numberOfWinners > 0 && (
              <>
                <dt>Winners</dt>
                <dd>{site.competition.numberOfWinners}</dd>
              </>
            )}
            {site.competition.prizeInfo && (
              <>
                <dt>Prizes</dt>
                <dd className="prose">{site.competition.prizeInfo}</dd>
              </>
            )}
          </dl>
        </Card>

        <Card title="How to enter">
          <p className="prose">{text(site.content, 'instructions')}</p>
          <p>
            {user ? (
              <Link to={user.role === 'student' ? '/dashboard' : '/staff'}>Go to your dashboard</Link>
            ) : (
              <>
                <Link to="/register">Create your account</Link> or{' '}
                <Link to="/sign-in">sign in</Link> to submit your entry.
              </>
            )}
          </p>
        </Card>
      </div>

      <Card title="Costume rules">
        <p className="prose">{text(site.content, 'rules')}</p>
      </Card>

      <Card title="Dress code">
        <p className="prose">{text(site.content, 'dress_code')}</p>
      </Card>

      <Card title="Photo requirements">
        <p className="prose">{text(site.content, 'photo_requirements')}</p>
        <dl className="definition">
          <dt>Accepted formats</dt>
          <dd>
            {site.competition.allowedFileTypes
              .map((type) => type.replace('image/', '').toUpperCase())
              .join(', ')}
          </dd>
          <dt>Maximum size</dt>
          <dd>{site.competition.maxFileSizeMb} MB</dd>
        </dl>
      </Card>

      {site.categories.length > 0 && (
        <Card title="Categories">
          <div className="stack">
            {site.categories.map((category) => (
              <div key={category.id}>
                <h3>{category.name}</h3>
                {category.description ? <p className="prose">{category.description}</p> : null}
                {category.requirements ? (
                  <p className="prose small">Requirements: {category.requirements}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="muted small">{text(site.content, 'contact_note')}</p>
    </>
  );
}
