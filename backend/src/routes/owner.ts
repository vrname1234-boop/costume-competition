import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { AuditAction, diff, recordAudit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import {
  MIN_STAFF_PASSWORD,
  generateTemporaryPassword,
  hashPassword,
} from "../lib/passwords";
import { broadcast } from "../lib/siteEvents";
import { revokeAllUserTokens } from "../lib/tokens";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  blockUntilPasswordChanged,
  requireAuth,
  requireRole,
} from "../middleware/auth";
import {
  LOCKED_SETTING_FIELDS,
  getSettings,
  getSiteContent,
  isCompetitionLocked,
  listCategories,
  listHouses,
} from "../services/settings";
import type { CategoryRow, HouseRow, UserRow } from "../types";

export const ownerRouter = Router();

ownerRouter.use(requireAuth, blockUntilPasswordChanged, requireRole("owner"));

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

ownerRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [users] = await query<{
      students: string;
      admins: string;
      disabled_admins: string;
    }>(
      `SELECT count(*) FILTER (WHERE role = 'student' AND status = 'active')  AS students,
              count(*) FILTER (WHERE role = 'admin'   AND status = 'active')  AS admins,
              count(*) FILTER (WHERE role = 'admin'   AND status = 'disabled') AS disabled_admins
         FROM users WHERE deleted_at IS NULL`,
    );
    const [subs] = await query<{ total: string; pending: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'pending') AS pending
         FROM submissions`,
    );
    const recent = await query<{
      id: string;
      actor_label: string;
      action: string;
      created_at: Date;
    }>(
      `SELECT id, actor_label, action, created_at FROM audit_logs
        ORDER BY created_at DESC LIMIT 10`,
    );
    const settings = await getSettings();
    const content = await getSiteContent();

    res.json({
      students: Number(users?.students ?? 0),
      admins: Number(users?.admins ?? 0),
      disabledAdmins: Number(users?.disabled_admins ?? 0),
      submissions: Number(subs?.total ?? 0),
      pendingSubmissions: Number(subs?.pending ?? 0),
      maintenanceMode: content.maintenance_mode === true,
      submissionsEnabled: settings.submissions_enabled,
      competitionLocked: isCompetitionLocked(settings),
      recentActivity: recent,
    });
  }),
);

// ---------------------------------------------------------------------------
// Admin accounts
// ---------------------------------------------------------------------------

const adminShape = (row: UserRow) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  status: row.status,
  mustChangePassword: row.must_change_password,
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
});

ownerRouter.get(
  "/admins",
  asyncHandler(async (_req, res) => {
    const rows = await query<UserRow>(
      `SELECT * FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY lower(username)`,
    );
    res.json({ admins: rows.map(adminShape) });
  }),
);

ownerRouter.post(
  "/admins",
  asyncHandler(async (req, res) => {
    const { username, displayName } = z
      .object({
        username: z
          .string()
          .trim()
          .toLowerCase()
          .min(3, "Username must be at least 3 characters.")
          .max(40)
          .regex(
            /^[a-z0-9._-]+$/,
            "Use letters, numbers, dots, dashes and underscores only.",
          ),
        displayName: z
          .string()
          .trim()
          .min(2, "Enter the teacher\u2019s name.")
          .max(120),
      })
      .parse(req.body);

    const existing = await queryOne(
      `SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [username],
    );
    if (existing) throw conflict("That username is already taken.");

    // The Owner sees this password once and hands it to the teacher; the
    // teacher must replace it at first sign in.
    const temporaryPassword = generateTemporaryPassword();

    const created = await queryOne<UserRow>(
      `INSERT INTO users (role, status, username, display_name, password_hash,
                          must_change_password, created_by)
       VALUES ('admin', 'active', $1, $2, $3, true, $4)
       RETURNING *`,
      [
        username,
        displayName,
        await hashPassword(temporaryPassword),
        req.user!.id,
      ],
    );

    await recordAudit(req, {
      action: AuditAction.ADMIN_CREATED,
      entityType: "user",
      entityId: created!.id,
      newValue: { username, displayName },
    });

    res.status(201).json({ admin: adminShape(created!), temporaryPassword });
  }),
);

async function loadAdmin(id: string): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!row) throw notFound("That account no longer exists.");
  if (row.role !== "admin")
    throw forbidden("Only admin accounts can be managed here.");
  return row;
}

ownerRouter.patch(
  "/admins/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({ display_name: z.string().trim().min(2).max(120).optional() })
      .parse(req.body);

    const before = await loadAdmin(id);
    const changes = diff(before as unknown as Record<string, unknown>, body);
    if (!changes) {
      res.json({ admin: adminShape(before) });
      return;
    }

    const updated = await queryOne<UserRow>(
      `UPDATE users SET display_name = COALESCE($2, display_name) WHERE id = $1 RETURNING *`,
      [id, body.display_name ?? null],
    );

    await recordAudit(req, {
      action: AuditAction.ADMIN_UPDATED,
      entityType: "user",
      entityId: id,
      oldValue: changes.old,
      newValue: changes.new,
    });

    res.json({ admin: adminShape(updated!) });
  }),
);

ownerRouter.post(
  "/admins/:id/disable",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const before = await loadAdmin(id);
    const updated = await queryOne<UserRow>(
      `UPDATE users SET status = 'disabled' WHERE id = $1 RETURNING *`,
      [id],
    );
    // Disabling takes effect immediately: existing sessions are cut off.
    await revokeAllUserTokens(id);
    await recordAudit(req, {
      action: AuditAction.ADMIN_DISABLED,
      entityType: "user",
      entityId: id,
      oldValue: { status: before.status },
      newValue: { status: "disabled" },
    });
    res.json({ admin: adminShape(updated!) });
  }),
);

ownerRouter.post(
  "/admins/:id/restore",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const before = await loadAdmin(id);
    const updated = await queryOne<UserRow>(
      `UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`,
      [id],
    );
    await recordAudit(req, {
      action: AuditAction.ADMIN_RESTORED,
      entityType: "user",
      entityId: id,
      oldValue: { status: before.status },
      newValue: { status: "active" },
    });
    res.json({ admin: adminShape(updated!) });
  }),
);

ownerRouter.post(
  "/admins/:id/reset-password",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await loadAdmin(id);
    const temporaryPassword = generateTemporaryPassword();
    await query(
      `UPDATE users
          SET password_hash = $2, must_change_password = true,
              failed_login_count = 0, locked_until = NULL
        WHERE id = $1`,
      [id, await hashPassword(temporaryPassword)],
    );
    await revokeAllUserTokens(id);
    await recordAudit(req, {
      action: AuditAction.ADMIN_PASSWORD_RESET,
      entityType: "user",
      entityId: id,
    });
    res.json({ temporaryPassword, minimumLength: MIN_STAFF_PASSWORD });
  }),
);

ownerRouter.delete(
  "/admins/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const before = await loadAdmin(id);
    // Soft delete: audit entries must keep pointing at a real row.
    await query(
      `UPDATE users SET deleted_at = now(), status = 'disabled', password_hash = NULL WHERE id = $1`,
      [id],
    );
    await revokeAllUserTokens(id);
    await recordAudit(req, {
      action: AuditAction.ADMIN_DELETED,
      entityType: "user",
      entityId: id,
      oldValue: { username: before.username, displayName: before.display_name },
    });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Site content
// ---------------------------------------------------------------------------

const EDITABLE_KEYS = [
  "competition_title",
  "homepage_intro",
  "description",
  "rules",
  "dress_code",
  "instructions",
  "photo_requirements",
  "announcement",
  "contact_note",
  "locked_entry_message",
  "maintenance_message",
] as const;

ownerRouter.get(
  "/site-content",
  asyncHandler(async (_req, res) => {
    res.json({ content: await getSiteContent(), editableKeys: EDITABLE_KEYS });
  }),
);

ownerRouter.put(
  "/site-content",
  asyncHandler(async (req, res) => {
    const body = z.record(z.string().max(20_000)).parse(req.body);

    const unknownKeys = Object.keys(body).filter(
      (k) => !(EDITABLE_KEYS as readonly string[]).includes(k),
    );
    if (unknownKeys.length)
      throw badRequest(`Unknown content key: ${unknownKeys.join(", ")}`);

    const before = await getSiteContent();
    const changedOld: Record<string, unknown> = {};
    const changedNew: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (before[key] === value) continue;
      changedOld[key] = before[key];
      changedNew[key] = value;
      await query(
        `INSERT INTO site_content (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), req.user!.id],
      );
    }

    if (Object.keys(changedNew).length) {
      await recordAudit(req, {
        action: AuditAction.SITE_CONTENT_CHANGED,
        entityType: "site_content",
        oldValue: changedOld,
        newValue: changedNew,
      });
    }

    res.json({ content: await getSiteContent() });
  }),
);

ownerRouter.put(
  "/maintenance",
  asyncHandler(async (req, res) => {
    const { enabled, message } = z
      .object({
        enabled: z.boolean(),
        message: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const before = await getSiteContent();
    await query(
      `INSERT INTO site_content (key, value, updated_by, updated_at)
       VALUES ('maintenance_mode', $1::jsonb, $2, now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(enabled), req.user!.id],
    );
    if (message !== undefined) {
      await query(
        `INSERT INTO site_content (key, value, updated_by, updated_at)
         VALUES ('maintenance_message', $1::jsonb, $2, now())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(message), req.user!.id],
      );
    }

    await recordAudit(req, {
      action: AuditAction.MAINTENANCE_TOGGLED,
      entityType: "site_content",
      oldValue: { maintenance_mode: before.maintenance_mode },
      newValue: { maintenance_mode: enabled },
    });

    // Tell every open page to reload so none of them keeps running in the
    // state that has just been switched away from.
    broadcast("maintenance");

    res.json({ maintenanceMode: enabled });
  }),
);

// ---------------------------------------------------------------------------
// Competition settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  competition_name: z.string().trim().min(3).max(120).optional(),
  submission_opens_at: z.string().datetime({ offset: true }).nullish(),
  submission_closes_at: z.string().datetime({ offset: true }).nullish(),
  submissions_enabled: z.boolean().optional(),
  number_of_winners: z.number().int().min(0).max(100).optional(),
  prize_info: z.string().max(4000).optional(),
  judging_method: z.string().max(4000).optional(),
  requirements: z.string().max(4000).optional(),
  max_file_size_mb: z.number().int().min(1).max(25).optional(),
  allowed_file_types: z
    .array(z.enum(["image/jpeg", "image/png", "image/webp"]))
    .min(1, "Allow at least one image type.")
    .optional(),
  locked: z.boolean().optional(),
});

/**
 * Compares an incoming JSON value with the stored one. Dates arrive as ISO
 * strings but come back from Postgres as Date objects, so a naive comparison
 * reports every resend of an unchanged date as an attempted change.
 */
function sameValue(incoming: unknown, stored: unknown): boolean {
  if (stored instanceof Date) {
    return (
      typeof incoming === "string" &&
      new Date(incoming).getTime() === stored.getTime()
    );
  }
  if (incoming === null || stored === null) return incoming === stored;
  return String(incoming) === String(stored);
}

ownerRouter.get(
  "/competition-settings",
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      settings,
      locked: isCompetitionLocked(settings),
      lockedFields: LOCKED_SETTING_FIELDS,
    });
  }),
);

ownerRouter.put(
  "/competition-settings",
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const before = await getSettings();

    if (isCompetitionLocked(before)) {
      const attempted = LOCKED_SETTING_FIELDS.filter(
        (field) => field in body && !sameValue(body[field], before[field]),
      );
      if (attempted.length) {
        throw forbidden(
          `Submissions have opened, so these cannot be changed: ${attempted.join(", ")}. Pause submissions first if this is an emergency.`,
        );
      }
    }

    // A date can be cleared by sending null, so "absent" and "null" must stay
    // distinguishable all the way into the UPDATE.
    const setsOpens = "submission_opens_at" in body;
    const setsCloses = "submission_closes_at" in body;
    const opensAt = setsOpens
      ? (body.submission_opens_at ?? null)
      : before.submission_opens_at;
    const closesAt = setsCloses
      ? (body.submission_closes_at ?? null)
      : before.submission_closes_at;

    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      throw badRequest("The closing date must be after the opening date.");
    }

    const updated = await queryOne(
      `UPDATE competition_settings SET
         competition_name     = COALESCE($1, competition_name),
         submission_opens_at  = CASE WHEN $13 THEN $2::timestamptz ELSE submission_opens_at END,
         submission_closes_at = CASE WHEN $14 THEN $3::timestamptz ELSE submission_closes_at END,
         submissions_enabled  = COALESCE($4, submissions_enabled),
         number_of_winners    = COALESCE($5, number_of_winners),
         prize_info           = COALESCE($6, prize_info),
         judging_method       = COALESCE($7, judging_method),
         requirements         = COALESCE($8, requirements),
         max_file_size_mb     = COALESCE($9, max_file_size_mb),
         allowed_file_types   = COALESCE($10::text[], allowed_file_types),
         locked               = COALESCE($11, locked),
         updated_by           = $12,
         updated_at           = now()
       WHERE id = true
       RETURNING *`,
      [
        body.competition_name ?? null,
        body.submission_opens_at ?? null,
        body.submission_closes_at ?? null,
        body.submissions_enabled ?? null,
        body.number_of_winners ?? null,
        body.prize_info ?? null,
        body.judging_method ?? null,
        body.requirements ?? null,
        body.max_file_size_mb ?? null,
        body.allowed_file_types ?? null,
        body.locked ?? null,
        req.user!.id,
        setsOpens,
        setsCloses,
      ],
    );

    const changes = diff(
      before as unknown as Record<string, unknown>,
      body as Record<string, unknown>,
    );
    if (changes) {
      await recordAudit(req, {
        action: AuditAction.COMPETITION_SETTINGS_CHANGED,
        entityType: "competition_settings",
        oldValue: changes.old,
        newValue: changes.new,
      });
    }

    res.json({ settings: updated });
  }),
);

// ---------------------------------------------------------------------------
// Houses and categories
// ---------------------------------------------------------------------------

ownerRouter.get(
  "/houses",
  asyncHandler(async (_req, res) => {
    res.json({ houses: await listHouses(false) });
  }),
);

ownerRouter.post(
  "/houses",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1, "Enter a house name.").max(60),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(req.body);

    const existing = await queryOne(
      `SELECT id FROM houses WHERE lower(name) = lower($1)`,
      [body.name],
    );
    if (existing) throw conflict("A house with that name already exists.");

    const created = await queryOne<HouseRow>(
      `INSERT INTO houses (name, sort_order) VALUES ($1, $2)
       RETURNING id, name, active, sort_order`,
      [body.name, body.sortOrder],
    );
    await recordAudit(req, {
      action: AuditAction.HOUSE_CHANGED,
      entityType: "house",
      entityId: created!.id,
      newValue: { name: body.name, created: true },
    });
    res.status(201).json({ house: created });
  }),
);

ownerRouter.patch(
  "/houses/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(req.body);

    const before = await queryOne<HouseRow>(
      `SELECT id, name, active, sort_order FROM houses WHERE id = $1`,
      [id],
    );
    if (!before) throw notFound("That house no longer exists.");

    const updated = await queryOne<HouseRow>(
      `UPDATE houses SET name = COALESCE($2, name), active = COALESCE($3, active),
                         sort_order = COALESCE($4, sort_order)
        WHERE id = $1 RETURNING id, name, active, sort_order`,
      [id, body.name ?? null, body.active ?? null, body.sortOrder ?? null],
    );

    await recordAudit(req, {
      action: AuditAction.HOUSE_CHANGED,
      entityType: "house",
      entityId: id,
      oldValue: before,
      newValue: updated,
    });
    res.json({ house: updated });
  }),
);

ownerRouter.delete(
  "/houses/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const inUse = await queryOne<{ count: string }>(
      `SELECT count(*) FROM submissions WHERE house_id = $1`,
      [id],
    );
    if (Number(inUse?.count ?? 0) > 0) {
      throw conflict(
        "Entries already use this house. Turn it off instead of deleting so existing entries keep their house.",
      );
    }
    const before = await queryOne<HouseRow>(
      `SELECT id, name FROM houses WHERE id = $1`,
      [id],
    );
    if (!before) throw notFound("That house no longer exists.");

    await query(`DELETE FROM houses WHERE id = $1`, [id]);
    await recordAudit(req, {
      action: AuditAction.HOUSE_CHANGED,
      entityType: "house",
      entityId: id,
      oldValue: before,
      newValue: { deleted: true },
    });
    res.json({ ok: true });
  }),
);

ownerRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories(false) });
  }),
);

ownerRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1, "Enter a category name.").max(80),
        description: z.string().trim().max(1000).default(""),
        requirements: z.string().trim().max(2000).default(""),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(req.body);

    const existing = await queryOne(
      `SELECT id FROM categories WHERE lower(name) = lower($1)`,
      [body.name],
    );
    if (existing) throw conflict("A category with that name already exists.");

    const created = await queryOne<CategoryRow>(
      `INSERT INTO categories (name, description, requirements, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, requirements, active, sort_order`,
      [body.name, body.description, body.requirements, body.sortOrder],
    );
    await recordAudit(req, {
      action: AuditAction.CATEGORY_CHANGED,
      entityType: "category",
      entityId: created!.id,
      newValue: { name: body.name, created: true },
    });
    res.status(201).json({ category: created });
  }),
);

ownerRouter.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(1000).optional(),
        requirements: z.string().trim().max(2000).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(req.body);

    const before = await queryOne<CategoryRow>(
      `SELECT id, name, description, requirements, active, sort_order FROM categories WHERE id = $1`,
      [id],
    );
    if (!before) throw notFound("That category no longer exists.");

    const updated = await queryOne<CategoryRow>(
      `UPDATE categories SET name = COALESCE($2, name),
                             description = COALESCE($3, description),
                             requirements = COALESCE($4, requirements),
                             active = COALESCE($5, active),
                             sort_order = COALESCE($6, sort_order)
        WHERE id = $1
        RETURNING id, name, description, requirements, active, sort_order`,
      [
        id,
        body.name ?? null,
        body.description ?? null,
        body.requirements ?? null,
        body.active ?? null,
        body.sortOrder ?? null,
      ],
    );

    await recordAudit(req, {
      action: AuditAction.CATEGORY_CHANGED,
      entityType: "category",
      entityId: id,
      oldValue: before,
      newValue: updated,
    });
    res.json({ category: updated });
  }),
);

ownerRouter.delete(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const inUse = await queryOne<{ count: string }>(
      `SELECT count(*) FROM submissions WHERE category_id = $1`,
      [id],
    );
    if (Number(inUse?.count ?? 0) > 0) {
      throw conflict(
        "Entries already use this category. Turn it off instead of deleting it.",
      );
    }
    const before = await queryOne<CategoryRow>(
      `SELECT id, name FROM categories WHERE id = $1`,
      [id],
    );
    if (!before) throw notFound("That category no longer exists.");

    await query(`DELETE FROM categories WHERE id = $1`, [id]);
    await recordAudit(req, {
      action: AuditAction.CATEGORY_CHANGED,
      entityType: "category",
      entityId: id,
      oldValue: before,
      newValue: { deleted: true },
    });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

ownerRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const { actor, action, from, to, page, pageSize } = z
      .object({
        actor: z.string().trim().max(120).optional(),
        action: z.string().trim().max(60).optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (actor) {
      params.push(`%${actor}%`);
      conditions.push(`actor_label ILIKE $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}::timestamptz`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [countRow] = await query<{ count: string }>(
      `SELECT count(*) FROM audit_logs ${where}`,
      params,
    );

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await query(
      `SELECT id, actor_label, actor_role, action, entity_type, entity_id,
              old_value, new_value, host(ip) AS ip, created_at
         FROM audit_logs ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      logs: rows,
      page,
      pageSize,
      total: Number(countRow?.count ?? 0),
    });
  }),
);
