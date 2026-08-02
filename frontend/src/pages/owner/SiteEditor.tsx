import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import { Banner, Button, Card, Field, Loading, PageHeader } from '../../components/ui';

const FIELDS: { key: string; label: string; hint?: string; multiline: boolean }[] = [
  { key: 'competition_title', label: 'Competition title', multiline: false },
  { key: 'homepage_intro', label: 'Homepage introduction', multiline: false },
  { key: 'description', label: 'About the competition', multiline: true },
  {
    key: 'announcement',
    label: 'Announcement banner',
    hint: 'Shown at the top of the homepage. Leave empty to hide it.',
    multiline: true,
  },
  { key: 'rules', label: 'Costume rules', multiline: true },
  { key: 'dress_code', label: 'Dress code', multiline: true },
  { key: 'instructions', label: 'Student instructions', multiline: true },
  {
    key: 'photo_requirements',
    label: 'Photo requirements',
    hint: 'Shown on the homepage and again on the upload form.',
    multiline: true,
  },
  { key: 'contact_note', label: 'Who to contact for help', multiline: false },
  { key: 'maintenance_message', label: 'Maintenance mode message', multiline: true },
];

export function OwnerSiteEditor() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ content: Record<string, unknown> }>('/api/owner/site-content');
      const next: Record<string, string> = {};
      for (const field of FIELDS) {
        const value = response.content[field.key];
        next[field.key] = typeof value === 'string' ? value : '';
      }
      setValues(next);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'The website content could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !values) return <Banner tone="error">{error}</Banner>;
  if (!values) return <Loading />;

  const save = () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    void api
      .put('/api/owner/site-content', values)
      .then(() => setSaved(true))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Your changes could not be saved.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title="Website content"
        lead="Text shown to students on the public site. Changes appear immediately, and every change is recorded in the audit log."
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {saved ? <Banner tone="ok">Saved. The public site now shows the updated text.</Banner> : null}

      <Card>
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={field.key} hint={field.hint}>
            {field.multiline ? (
              <textarea
                id={field.key}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            ) : (
              <input
                id={field.key}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            )}
          </Field>
        ))}

        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save website content'}
        </Button>
      </Card>
    </>
  );
}
