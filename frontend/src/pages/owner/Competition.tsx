import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type { Category, CompetitionSettings, House } from '../../api/types';
import { Banner, Button, Card, Field, Loading, PageHeader } from '../../components/ui';
import { fromLocalInput, toLocalInput } from '../../lib/format';

const FILE_TYPES = [
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WEBP' },
];

export function OwnerCompetition() {
  const [settings, setSettings] = useState<CompetitionSettings | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockedFields, setLockedFields] = useState<string[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newHouse, setNewHouse] = useState('');
  const [newCategory, setNewCategory] = useState({ name: '', description: '', requirements: '' });

  const load = useCallback(async () => {
    try {
      const [settingsResponse, housesResponse, categoriesResponse] = await Promise.all([
        api.get<{ settings: CompetitionSettings; locked: boolean; lockedFields: string[] }>(
          '/api/owner/competition-settings',
        ),
        api.get<{ houses: House[] }>('/api/owner/houses'),
        api.get<{ categories: Category[] }>('/api/owner/categories'),
      ]);
      setSettings(settingsResponse.settings);
      setLocked(settingsResponse.locked);
      setLockedFields(settingsResponse.lockedFields);
      setHouses(housesResponse.houses);
      setCategories(categoriesResponse.categories);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Competition settings could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = (work: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void work()
      .then(async () => {
        if (message) setNotice(message);
        await load();
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'That change could not be saved.');
      })
      .finally(() => setBusy(false));
  };

  if (error && !settings) return <Banner tone="error">{error}</Banner>;
  if (!settings) return <Loading />;

  const isFieldLocked = (field: string) => locked && lockedFields.includes(field);

  const saveSettings = () => {
    const payload: Record<string, unknown> = {
      submissions_enabled: settings.submissions_enabled,
      prize_info: settings.prize_info,
      judging_method: settings.judging_method,
      max_file_size_mb: settings.max_file_size_mb,
      allowed_file_types: settings.allowed_file_types,
      competition_name: settings.competition_name,
      submission_opens_at: settings.submission_opens_at,
      submission_closes_at: settings.submission_closes_at,
      number_of_winners: settings.number_of_winners,
      requirements: settings.requirements,
    };
    // Locked fields are disabled in the form, so sending them back would only
    // ever be a no-op the server has to reject. Pausing must stay reachable.
    for (const field of lockedFields) if (locked) delete payload[field];

    return run(() => api.put('/api/owner/competition-settings', payload), 'Competition settings saved.');
  };

  return (
    <>
      <PageHeader
        title="Competition settings"
        lead="Dates, upload limits, categories and houses. Judging is not part of this version."
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}

      {locked ? (
        <Banner tone="warn">
          Submissions have opened, so the core competition fields are locked to keep the rules fair:{' '}
          {lockedFields.join(', ')}. Pause submissions first if something genuinely has to change.
        </Banner>
      ) : null}

      <Card title="Competition">
        <Field label="Competition name" htmlFor="name">
          <input
            id="name"
            value={settings.competition_name}
            disabled={isFieldLocked('competition_name')}
            onChange={(event) => setSettings({ ...settings, competition_name: event.target.value })}
          />
        </Field>

        <div className="grid grid--two">
          <Field
            label="Submissions open"
            htmlFor="opens"
            hint={`Times use ${settings.timezone}.`}
          >
            <input
              id="opens"
              type="datetime-local"
              value={toLocalInput(settings.submission_opens_at)}
              disabled={isFieldLocked('submission_opens_at')}
              onChange={(event) =>
                setSettings({ ...settings, submission_opens_at: fromLocalInput(event.target.value) })
              }
            />
          </Field>

          <Field label="Submissions close" htmlFor="closes">
            <input
              id="closes"
              type="datetime-local"
              value={toLocalInput(settings.submission_closes_at)}
              disabled={isFieldLocked('submission_closes_at')}
              onChange={(event) =>
                setSettings({ ...settings, submission_closes_at: fromLocalInput(event.target.value) })
              }
            />
          </Field>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.submissions_enabled}
            onChange={(event) =>
              setSettings({ ...settings, submissions_enabled: event.target.checked })
            }
          />
          <span>Submissions enabled. Unticking this stops new entries and edits immediately.</span>
        </label>

        <div className="grid grid--two">
          <Field label="Number of winners" htmlFor="winners">
            <input
              id="winners"
              type="number"
              min={0}
              value={settings.number_of_winners}
              disabled={isFieldLocked('number_of_winners')}
              onChange={(event) =>
                setSettings({ ...settings, number_of_winners: Number(event.target.value) })
              }
            />
          </Field>

          <Field label="Maximum upload size (MB)" htmlFor="size">
            <input
              id="size"
              type="number"
              min={1}
              max={25}
              value={settings.max_file_size_mb}
              onChange={(event) =>
                setSettings({ ...settings, max_file_size_mb: Number(event.target.value) })
              }
            />
          </Field>
        </div>

        <Field label="Allowed image types" htmlFor="types">
          <div className="button-row" id="types">
            {FILE_TYPES.map((type) => (
              <label className="checkbox" key={type.value} style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={settings.allowed_file_types.includes(type.value)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...settings.allowed_file_types, type.value]
                      : settings.allowed_file_types.filter((value) => value !== type.value);
                    setSettings({ ...settings, allowed_file_types: next });
                  }}
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Entry requirements" htmlFor="requirements">
          <textarea
            id="requirements"
            value={settings.requirements}
            disabled={isFieldLocked('requirements')}
            onChange={(event) => setSettings({ ...settings, requirements: event.target.value })}
          />
        </Field>

        <Field label="Prize information" htmlFor="prizes">
          <textarea
            id="prizes"
            value={settings.prize_info}
            onChange={(event) => setSettings({ ...settings, prize_info: event.target.value })}
          />
        </Field>

        <Field
          label="Judging method"
          htmlFor="judging"
          hint="Recorded for later. Judging itself is not built yet."
        >
          <textarea
            id="judging"
            value={settings.judging_method}
            onChange={(event) => setSettings({ ...settings, judging_method: event.target.value })}
          />
        </Field>

        <Button onClick={saveSettings} disabled={busy}>
          {busy ? 'Saving…' : 'Save competition settings'}
        </Button>
      </Card>

      <Card title="Categories">
        <p className="muted small">
          Students choose from the active categories when they submit. Turn a category off instead of
          deleting it once entries exist.
        </p>

        {categories.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Requirements</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td className="small">{category.description || '—'}</td>
                    <td className="small">{category.requirements || '—'}</td>
                    <td>{category.active ? 'Active' : 'Hidden'}</td>
                    <td className="right">
                      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          small
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              api.patch(`/api/owner/categories/${category.id}`, {
                                active: !category.active,
                              }),
                            )
                          }
                        >
                          {category.active ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          variant="danger"
                          small
                          disabled={busy}
                          onClick={() => run(() => api.delete(`/api/owner/categories/${category.id}`))}
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

        <div className="grid grid--two">
          <Field label="New category name" htmlFor="category-name">
            <input
              id="category-name"
              value={newCategory.name}
              onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })}
            />
          </Field>
          <Field label="Description" htmlFor="category-description">
            <input
              id="category-description"
              value={newCategory.description}
              onChange={(event) => setNewCategory({ ...newCategory, description: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Category requirements" htmlFor="category-requirements">
          <input
            id="category-requirements"
            value={newCategory.requirements}
            onChange={(event) => setNewCategory({ ...newCategory, requirements: event.target.value })}
          />
        </Field>
        <Button
          disabled={busy || newCategory.name.trim().length === 0}
          onClick={() =>
            run(async () => {
              await api.post('/api/owner/categories', {
                name: newCategory.name.trim(),
                description: newCategory.description.trim(),
                requirements: newCategory.requirements.trim(),
              });
              setNewCategory({ name: '', description: '', requirements: '' });
            }, 'Category added.')
          }
        >
          Add category
        </Button>
      </Card>

      <Card title="Houses">
        <p className="muted small">
          Optional. If your school does not use houses, leave this empty and the field disappears from
          the student form.
        </p>

        {houses.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {houses.map((house) => (
                  <tr key={house.id}>
                    <td>{house.name}</td>
                    <td>{house.active ? 'Active' : 'Hidden'}</td>
                    <td className="right">
                      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          small
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              api.patch(`/api/owner/houses/${house.id}`, { active: !house.active }),
                            )
                          }
                        >
                          {house.active ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          variant="danger"
                          small
                          disabled={busy}
                          onClick={() => run(() => api.delete(`/api/owner/houses/${house.id}`))}
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

        <Field label="New house name" htmlFor="house-name">
          <input
            id="house-name"
            value={newHouse}
            onChange={(event) => setNewHouse(event.target.value)}
          />
        </Field>
        <Button
          disabled={busy || newHouse.trim().length === 0}
          onClick={() =>
            run(async () => {
              await api.post('/api/owner/houses', { name: newHouse.trim() });
              setNewHouse('');
            }, 'House added.')
          }
        >
          Add house
        </Button>
      </Card>
    </>
  );
}
