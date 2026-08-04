const TIMEZONE = 'Australia/Sydney';

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TIMEZONE,
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone: TIMEZONE }).format(
    new Date(value),
  );
}

/** Converts an ISO string into the value a datetime-local input expects. */
export function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function countdown(target: string | null): string {
  if (!target) return 'No deadline set';
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hours} hr`;
  if (hours > 0) return `${hours} hr ${minutes % 60} min`;
  return `${minutes} min`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTION_LABELS: Record<string, string> = {
  'admin.created': 'Admin account created',
  'admin.updated': 'Admin account edited',
  'admin.disabled': 'Admin account disabled',
  'admin.restored': 'Admin account restored',
  'admin.deleted': 'Admin account deleted',
  'admin.password_reset': 'Admin password reset',
  'owner.password_changed': 'Owner password changed',
  'submission.created': 'Entry submitted',
  'submission.approved': 'Entry approved',
  'submission.rejected': 'Entry rejected',
  'submission.edited_by_staff': 'Entry details edited by staff',
  'submission.photo_replaced': 'Entry photo replaced',
  'submission.deleted': 'Entry deleted',
  'site_content.changed': 'Website content changed',
  'competition_settings.changed': 'Competition settings changed',
  'competition_settings.locked': 'Competition settings locked',
  'maintenance.toggled': 'Maintenance mode changed',
  'house.changed': 'House changed',
  'category.changed': 'Category changed',
};

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

export function summariseValues(value: Record<string, unknown> | null): string {
  if (!value) return '—';
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry === null || entry === '' ? '(empty)' : String(entry)}`)
    .join('\n');
}
