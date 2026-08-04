import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { AuditAction, diff, recordAudit } from '../lib/audit';
import { sendSubmissionDecision } from '../lib/email';
import { badRequest, notFound } from '../lib/errors';
import { processUpload } from '../lib/images';
import { logger } from '../lib/logger';
import {
  REJECTION_REASONS,
  REJECTION_REASON_CODES,
  findRejectionReason,
} from '../lib/rejectionReasons';
import { buildObjectKey, deleteObject, putObject } from '../lib/storage';
import { asyncHandler } from '../middleware/asyncHandler';
import { blockUntilPasswordChanged, requireAuth, requireRole } from '../middleware/auth';
import { photoUrl } from '../services/photos';
import { evaluateWindow, getSettings } from '../services/settings';
import type { SubmissionRow, SubmissionStatus } from '../types';

export const adminRouter = Router();

// Admins and the Owner share the competition management surface.
adminRouter.use(requireAuth, blockUntilPasswordChanged, requireRole('admin', 'owner'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

interface SubmissionListRow extends SubmissionRow {
  student_email: string | null;
  house_name: string | null;
  category_name: string | null;
  reviewer_label: string | null;
}

const SELECT_SUBMISSION = `
  SELECT s.*,
         u.email        AS student_email,
         h.name         AS house_name,
         c.name         AS category_name,
         r.username     AS reviewer_label
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    LEFT JOIN houses h ON h.id = s.house_id
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN users r ON r.id = s.reviewed_by
`;

const shape = (row: SubmissionListRow) => ({
  id: row.id,
  studentId: row.student_id,
  studentEmail: row.student_email,
  fullName: row.full_name,
  yearGrade: row.year_grade,
  classRollGroup: row.class_roll_group,
  house: row.house_name,
  category: row.category_name,
  costumeName: row.costume_name,
  costumeDescription: row.costume_description,
  status: row.status,
  reviewNote: row.review_note,
  // Staff-only. The student is served by a separate presenter in student.ts,
  // which never reads these columns.
  rejectionCode: row.rejection_code,
  rejectionReason: row.rejection_code ? (findRejectionReason(row.rejection_code)?.label ?? null) : null,
  internalNote: row.internal_note,
  locked: row.locked,
  lockedAt: row.locked_at,
  reviewedBy: row.reviewer_label,
  reviewedAt: row.reviewed_at,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
});

const baseUrl = (req: { protocol: string; get: (h: string) => string | undefined }) =>
  `${req.protocol}://${req.get('host') ?? ''}`;

// ---------------------------------------------------------------------------

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [counts] = await query<{
      total: string;
      pending: string;
      approved: string;
      rejected: string;
    }>(
      `SELECT count(*)                                        AS total,
              count(*) FILTER (WHERE status = 'pending')      AS pending,
              count(*) FILTER (WHERE status = 'approved')     AS approved,
              count(*) FILTER (WHERE status = 'rejected')     AS rejected
         FROM submissions`,
    );

    const settings = await getSettings();
    res.json({
      totals: {
        total: Number(counts?.total ?? 0),
        pending: Number(counts?.pending ?? 0),
        approved: Number(counts?.approved ?? 0),
        rejected: Number(counts?.rejected ?? 0),
      },
      competition: {
        name: settings.competition_name,
        closesAt: settings.submission_closes_at,
        timezone: settings.timezone,
      },
      submissionWindow: evaluateWindow(settings),
    });
  }),
);

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  year: z.string().trim().max(20).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

adminRouter.get(
  '/submissions',
  asyncHandler(async (req, res) => {
    const { status, year, q, page, pageSize } = listQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (year) {
      params.push(year);
      conditions.push(`s.year_grade = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(s.full_name ILIKE ${p} OR s.costume_name ILIKE ${p} OR s.class_roll_group ILIKE ${p} OR u.email ILIKE ${p})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRow] = await query<{ count: string }>(
      `SELECT count(*) FROM submissions s JOIN users u ON u.id = s.student_id ${where}`,
      params,
    );

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await query<SubmissionListRow>(
      `${SELECT_SUBMISSION} ${where}
        ORDER BY s.submitted_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      submissions: rows.map(shape),
      page,
      pageSize,
      total: Number(countRow?.count ?? 0),
    });
  }),
);

adminRouter.get(
  '/submissions/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const row = await queryOne<SubmissionListRow>(`${SELECT_SUBMISSION} WHERE s.id = $1`, [id]);
    if (!row) throw notFound('That submission no longer exists.');

    const history = await query<{ replaced_at: Date; image_path: string }>(
      `SELECT replaced_at, image_path FROM submission_photo_versions
        WHERE submission_id = $1 ORDER BY replaced_at DESC`,
      [id],
    );

    res.json({
      submission: {
        ...shape(row),
        photoUrl: await photoUrl(row.image_path, baseUrl(req)),
        image: { mime: row.image_mime, bytes: row.image_bytes, width: row.image_width, height: row.image_height },
        previousPhotos: await Promise.all(
          history.map(async (h) => ({
            replacedAt: h.replaced_at,
            photoUrl: await photoUrl(h.image_path, baseUrl(req)),
          })),
        ),
      },
    });
  }),
);

interface DecisionExtras {
  rejectionCode?: string | null;
  internalNote?: string | null;
  lock?: boolean;
}

async function decide(
  req: Request,
  status: Extract<SubmissionStatus, 'approved' | 'rejected'>,
  note: string | null,
  extras: DecisionExtras = {},
) {
  const id = z.string().uuid().parse(req.params.id);
  const before = await queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
  if (!before) throw notFound('That submission no longer exists.');

  const lock = extras.lock ?? false;

  const updated = await queryOne<SubmissionRow>(
    `UPDATE submissions
        SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
            rejection_code = $5, internal_note = $6,
            locked = $7,
            locked_at = CASE WHEN $7 THEN now() ELSE locked_at END,
            locked_by = CASE WHEN $7 THEN $4::uuid ELSE locked_by END
      WHERE id = $1 RETURNING *`,
    [
      id,
      status,
      note,
      req.user!.id,
      extras.rejectionCode ?? null,
      extras.internalNote ?? null,
      lock,
    ],
  );

  await recordAudit(req, {
    action: status === 'approved' ? AuditAction.SUBMISSION_APPROVED : AuditAction.SUBMISSION_REJECTED,
    entityType: 'submission',
    entityId: id,
    oldValue: { status: before.status, reviewNote: before.review_note },
    // The staff-only reason and note are recorded here deliberately: the audit
    // log is where the school's record of a serious rejection lives.
    newValue: {
      status,
      reviewNote: note,
      rejectionCode: extras.rejectionCode ?? null,
      internalNote: extras.internalNote ?? null,
      locked: lock,
    },
  });

  if (lock) {
    await recordAudit(req, {
      action: AuditAction.SUBMISSION_LOCKED,
      entityType: 'submission',
      entityId: id,
      newValue: { rejectionCode: extras.rejectionCode ?? null, internalNote: extras.internalNote ?? null },
    });
  }

  const student = await queryOne<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [
    before.student_id,
  ]);
  if (student?.email) {
    const settings = await getSettings();
    sendSubmissionDecision(student.email, status === 'approved', note, settings.competition_name).catch(
      (error: unknown) => logger.warn({ err: error }, 'decision email failed'),
    );
  }

  return updated!;
}

adminRouter.post(
  '/submissions/:id/approve',
  asyncHandler(async (req, res) => {
    const updated = await decide(req, 'approved', null);
    res.json({ status: updated.status });
  }),
);

// The dropdown that staff choose from. Severity is decided here, not in the
// browser, so a locking code cannot be sent as a minor one.
adminRouter.get('/rejection-reasons', (_req, res) => {
  res.json({ reasons: REJECTION_REASONS });
});

adminRouter.post(
  '/submissions/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason, code, internalNote } = z
      .object({
        reason: z
          .string()
          .trim()
          .min(5, 'Give the student a reason so they can fix it.')
          .max(500),
        code: z.enum(REJECTION_REASON_CODES, {
          errorMap: () => ({ message: 'Choose a staff reason for this rejection.' }),
        }),
        internalNote: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);

    const detail = findRejectionReason(code)!;
    if (detail.severity === 'serious' && !internalNote) {
      throw badRequest('A serious rejection needs a staff note explaining what happened.');
    }

    const updated = await decide(req, 'rejected', reason, {
      rejectionCode: code,
      internalNote: internalNote ?? null,
      lock: detail.severity === 'serious',
    });

    res.json({
      status: updated.status,
      reviewNote: updated.review_note,
      locked: updated.locked,
      severity: detail.severity,
    });
  }),
);

/**
 * Unlocking is the end of the conversation the student had to have in person,
 * so any staff member who can review entries can record it. It is audited with
 * the note explaining why.
 */
adminRouter.post(
  '/submissions/:id/unlock',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { note } = z
      .object({
        note: z
          .string()
          .trim()
          .min(5, 'Record what was agreed with the student before unlocking.')
          .max(1000),
      })
      .parse(req.body);

    const before = await queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
    if (!before) throw notFound('That submission no longer exists.');
    if (!before.locked) throw badRequest('That entry is not locked.');

    const updated = await queryOne<SubmissionRow>(
      `UPDATE submissions
          SET locked = false, unlocked_at = now(), unlocked_by = $2,
              internal_note = CASE
                WHEN internal_note IS NULL THEN $3::text
                ELSE internal_note || E'\\n\\nUnlocked: ' || $3::text
              END
        WHERE id = $1 RETURNING *`,
      [id, req.user!.id, note],
    );

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_UNLOCKED,
      entityType: 'submission',
      entityId: id,
      oldValue: { locked: true, rejectionCode: before.rejection_code },
      newValue: { locked: false, note },
    });

    res.json({ locked: updated!.locked });
  }),
);

adminRouter.patch(
  '/submissions/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        full_name: z.string().trim().min(2).max(120).optional(),
        year_grade: z.enum(['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12']).optional(),
        class_roll_group: z.string().trim().min(1).max(60).optional(),
        costume_name: z.string().trim().min(2).max(120).optional(),
        costume_description: z.string().trim().min(10).max(2000).optional(),
        house_id: z.string().uuid().nullish(),
        category_id: z.string().uuid().nullish(),
      })
      .parse(req.body);

    const before = await queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
    if (!before) throw notFound('That submission no longer exists.');

    const changes = diff(before as unknown as Record<string, unknown>, body);
    if (!changes) {
      res.json({ submission: shape(before as SubmissionListRow), changed: false });
      return;
    }

    const updated = await queryOne<SubmissionRow>(
      `UPDATE submissions SET
         full_name           = COALESCE($2, full_name),
         year_grade          = COALESCE($3, year_grade),
         class_roll_group    = COALESCE($4, class_roll_group),
         costume_name        = COALESCE($5, costume_name),
         costume_description = COALESCE($6, costume_description),
         house_id            = COALESCE($7, house_id),
         category_id         = COALESCE($8, category_id)
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.full_name ?? null,
        body.year_grade ?? null,
        body.class_roll_group ?? null,
        body.costume_name ?? null,
        body.costume_description ?? null,
        body.house_id ?? null,
        body.category_id ?? null,
      ],
    );

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_EDITED_BY_STAFF,
      entityType: 'submission',
      entityId: id,
      oldValue: changes.old,
      newValue: changes.new,
    });

    res.json({ submission: shape(updated as SubmissionListRow), changed: true });
  }),
);

adminRouter.put(
  '/submissions/:id/photo',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    if (!req.file) throw badRequest('Choose a photo to upload.');

    const before = await queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
    if (!before) throw notFound('That submission no longer exists.');

    const settings = await getSettings();
    const image = await processUpload(
      req.file.buffer,
      settings.allowed_file_types,
      settings.max_file_size_mb * 1024 * 1024,
    );
    const key = buildObjectKey(before.student_id, image.extension);
    await putObject(key, image.buffer, image.mime);

    await query(
      `INSERT INTO submission_photo_versions
         (submission_id, image_path, image_mime, image_bytes, replaced_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, before.image_path, before.image_mime, before.image_bytes, req.user!.id],
    );

    await query(
      `UPDATE submissions
          SET image_path = $2, image_mime = $3, image_bytes = $4,
              image_width = $5, image_height = $6, image_sha256 = $7
        WHERE id = $1`,
      [id, key, image.mime, image.bytes, image.width, image.height, image.sha256],
    );

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_PHOTO_REPLACED,
      entityType: 'submission',
      entityId: id,
      oldValue: { bytes: before.image_bytes, sha256: before.image_sha256 },
      newValue: { bytes: image.bytes, sha256: image.sha256 },
    });

    res.json({ photoUrl: await photoUrl(key, baseUrl(req)) });
  }),
);

adminRouter.delete(
  '/submissions/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { reason } = z
      .object({ reason: z.string().trim().min(5, 'Record why this entry was removed.').max(500) })
      .parse(req.body ?? {});

    const before = await queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
    if (!before) throw notFound('That submission no longer exists.');

    const versions = await query<{ image_path: string }>(
      `SELECT image_path FROM submission_photo_versions WHERE submission_id = $1`,
      [id],
    );
    await query(`DELETE FROM submissions WHERE id = $1`, [id]);
    await Promise.all([before.image_path, ...versions.map((v) => v.image_path)].map(deleteObject));

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_DELETED,
      entityType: 'submission',
      entityId: id,
      oldValue: {
        fullName: before.full_name,
        costumeName: before.costume_name,
        status: before.status,
      },
      newValue: { reason },
    });

    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/export.csv',
  asyncHandler(async (_req, res) => {
    const rows = await query<SubmissionListRow>(`${SELECT_SUBMISSION} ORDER BY s.submitted_at DESC`);

    const headers = [
      'Full name', 'School email', 'Year', 'Class/Roll group', 'House', 'Category',
      'Costume name', 'Costume description', 'Status', 'Message to student',
      'Staff reason', 'Staff note', 'Locked', 'Reviewed by', 'Submitted at',
    ];

    // Prefixing a cell that starts with a formula character stops spreadsheet
    // software from executing submitted text.
    const cell = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.full_name, r.student_email, r.year_grade, r.class_roll_group, r.house_name,
          r.category_name, r.costume_name, r.costume_description, r.status, r.review_note,
          r.rejection_code ? (findRejectionReason(r.rejection_code)?.label ?? r.rejection_code) : '',
          r.internal_note, r.locked ? 'Yes' : 'No',
          r.reviewer_label, r.submitted_at.toISOString(),
        ]
          .map(cell)
          .join(','),
      ),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"');
    res.send(`\uFEFF${csv}`);
  }),
);
