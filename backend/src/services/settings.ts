import { query, queryOne } from '../db';
import { serverError } from '../lib/errors';
import type { CategoryRow, CompetitionSettingsRow, HouseRow } from '../types';

export async function getSettings(): Promise<CompetitionSettingsRow> {
  const row = await queryOne<CompetitionSettingsRow>(
    `SELECT * FROM competition_settings WHERE id = true`,
  );
  if (!row) throw serverError('Competition settings row is missing. Run migration 002.');
  return row;
}

export async function getSiteContent(): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(`SELECT key, value FROM site_content`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface SubmissionWindow {
  open: boolean;
  reason: 'open' | 'not_yet_open' | 'closed' | 'disabled';
  opensAt: Date | null;
  closesAt: Date | null;
}

/**
 * The single source of truth for whether students may write. Every student
 * write route calls this on the server; the frontend hiding a button is only
 * a convenience.
 */
export function evaluateWindow(settings: CompetitionSettingsRow, now = new Date()): SubmissionWindow {
  const base = { opensAt: settings.submission_opens_at, closesAt: settings.submission_closes_at };
  if (!settings.submissions_enabled) return { open: false, reason: 'disabled', ...base };
  if (settings.submission_opens_at && now < settings.submission_opens_at) {
    return { open: false, reason: 'not_yet_open', ...base };
  }
  if (settings.submission_closes_at && now > settings.submission_closes_at) {
    return { open: false, reason: 'closed', ...base };
  }
  return { open: true, reason: 'open', ...base };
}

export const windowMessage = (w: SubmissionWindow): string => {
  switch (w.reason) {
    case 'not_yet_open':
      return 'Submissions have not opened yet.';
    case 'closed':
      return 'Submissions are now closed. Editing is disabled.';
    case 'disabled':
      return 'Submissions are currently paused by the organisers.';
    default:
      return 'Submissions are open.';
  }
};

/**
 * Core competition fields lock once submissions are open, so the rules cannot
 * change underneath students who have already entered.
 */
export function isCompetitionLocked(settings: CompetitionSettingsRow, now = new Date()): boolean {
  if (settings.locked) return true;
  return Boolean(settings.submission_opens_at && now >= settings.submission_opens_at);
}

export const LOCKED_SETTING_FIELDS = [
  'competition_name',
  'submission_opens_at',
  'submission_closes_at',
  'number_of_winners',
  'requirements',
] as const;

export async function listHouses(activeOnly: boolean): Promise<HouseRow[]> {
  return query<HouseRow>(
    `SELECT id, name, active, sort_order FROM houses
      ${activeOnly ? 'WHERE active = true' : ''}
      ORDER BY sort_order, lower(name)`,
  );
}

export async function listCategories(activeOnly: boolean): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT id, name, description, requirements, active, sort_order FROM categories
      ${activeOnly ? 'WHERE active = true' : ''}
      ORDER BY sort_order, lower(name)`,
  );
}

export async function isMaintenanceMode(): Promise<boolean> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM site_content WHERE key = 'maintenance_mode'`,
  );
  return row?.value === true;
}
