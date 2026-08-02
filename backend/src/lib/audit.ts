import type { Request } from 'express';
import { query } from '../db';
import { logger } from './logger';

/**
 * Only meaningful actions are recorded. Navigation, reads, and button clicks
 * are deliberately not logged.
 */
export const AuditAction = {
  ADMIN_CREATED: 'admin.created',
  ADMIN_UPDATED: 'admin.updated',
  ADMIN_DISABLED: 'admin.disabled',
  ADMIN_RESTORED: 'admin.restored',
  ADMIN_DELETED: 'admin.deleted',
  ADMIN_PASSWORD_RESET: 'admin.password_reset',
  OWNER_PASSWORD_CHANGED: 'owner.password_changed',
  SUBMISSION_CREATED: 'submission.created',
  SUBMISSION_APPROVED: 'submission.approved',
  SUBMISSION_REJECTED: 'submission.rejected',
  SUBMISSION_EDITED_BY_STAFF: 'submission.edited_by_staff',
  SUBMISSION_PHOTO_REPLACED: 'submission.photo_replaced',
  SUBMISSION_DELETED: 'submission.deleted',
  SITE_CONTENT_CHANGED: 'site_content.changed',
  COMPETITION_SETTINGS_CHANGED: 'competition_settings.changed',
  COMPETITION_LOCKED: 'competition_settings.locked',
  MAINTENANCE_TOGGLED: 'maintenance.toggled',
  HOUSE_CHANGED: 'house.changed',
  CATEGORY_CHANGED: 'category.changed',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export function clientIp(req: Request): string | null {
  // Render and Vercel sit behind proxies; `trust proxy` is enabled in app.ts,
  // so req.ip already resolves the left-most forwarded address.
  return req.ip ?? null;
}

export interface AuditEntry {
  action: AuditActionValue;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  const actor = req.user;
  try {
    await query(
      `INSERT INTO audit_logs
         (actor_id, actor_label, actor_role, action, entity_type, entity_id,
          old_value, new_value, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        actor?.id ?? null,
        actor?.label ?? 'system',
        actor?.role ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
        entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
        clientIp(req),
        req.get('user-agent')?.slice(0, 500) ?? null,
      ],
    );
  } catch (error) {
    // An audit write must never take down the request that triggered it, but
    // it must be loud in the logs.
    logger.error({ err: error, action: entry.action }, 'failed to write audit log');
  }
}

/** Returns only the fields that actually changed, for a compact audit diff. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { old: Partial<T>; new: Partial<T> } | null {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  let changed = false;
  for (const [key, value] of Object.entries(after) as [keyof T, T[keyof T]][]) {
    if (value === undefined) continue;
    if (before[key] !== value) {
      oldValues[key] = before[key];
      newValues[key] = value;
      changed = true;
    }
  }
  return changed ? { old: oldValues, new: newValues } : null;
}
