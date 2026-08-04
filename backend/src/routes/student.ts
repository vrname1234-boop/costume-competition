import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { AuditAction, recordAudit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { processUpload } from '../lib/images';
import { rateLimit } from '../lib/rateLimit';
import { buildObjectKey, deleteObject, putObject } from '../lib/storage';
import { asyncHandler } from '../middleware/asyncHandler';
import { blockUntilPasswordChanged, requireAuth, requireRole } from '../middleware/auth';
import { photoUrl } from '../services/photos';
import { evaluateWindow, getSettings, getSiteContent, windowMessage } from '../services/settings';
import type { CompetitionSettingsRow, SubmissionRow } from '../types';

export const studentRouter = Router();

// Route-level guards: a handler cannot be added to this router without them.
studentRouter.use(requireAuth, blockUntilPasswordChanged, requireRole('student'));

const HARD_UPLOAD_CAP_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_UPLOAD_CAP_BYTES, files: 1 },
});

const YEAR_GROUPS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'] as const;

const detailsSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  yearGrade: z.enum(YEAR_GROUPS, { errorMap: () => ({ message: 'Choose your year group.' }) }),
  classRollGroup: z.string().trim().min(1, 'Enter your class or roll group.').max(60),
  houseId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  costumeName: z.string().trim().min(2, 'Give your costume a name.').max(120),
  costumeDescription: z.string().trim().min(10, 'Describe your costume in a sentence or two.').max(2000),
  confirmations: z
    .object({
      ownCostume: z.literal(true),
      followsRules: z.literal(true),
      clearFullBody: z.literal(true),
      understandsDeadline: z.literal(true),
    })
    .optional(),
});

/** Parsed from a multipart field, which arrives as a JSON string. */
function parseDetails(raw: unknown) {
  if (typeof raw !== 'string') return detailsSchema.parse(raw);
  try {
    return detailsSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) throw badRequest('Submission details were not readable.');
    throw error;
  }
}

/**
 * The authoritative deadline check. Every student write calls this; the UI
 * hiding the edit button is cosmetic only.
 */
async function assertWindowOpen(): Promise<CompetitionSettingsRow> {
  const settings = await getSettings();
  const window = evaluateWindow(settings);
  if (!window.open) throw forbidden(windowMessage(window));
  return settings;
}

/**
 * A locked entry is one a teacher has to unlock in person after a serious
 * rejection, so every write path checks it — the student's own dashboard hides
 * the buttons, but the block has to hold against a direct API call.
 */
async function assertNotLocked(submission: SubmissionRow): Promise<void> {
  if (!submission.locked) return;
  const content = await getSiteContent();
  const message = content.locked_entry_message;
  throw forbidden(
    typeof message === 'string' && message.trim()
      ? message
      : 'Your entry has been referred to staff and cannot be changed online.',
  );
}

async function validateReferences(houseId?: string | null, categoryId?: string | null) {
  if (houseId) {
    const house = await queryOne(`SELECT id FROM houses WHERE id = $1 AND active = true`, [houseId]);
    if (!house) throw badRequest('That house is not available. Choose another.');
  }
  if (categoryId) {
    const category = await queryOne(`SELECT id FROM categories WHERE id = $1 AND active = true`, [
      categoryId,
    ]);
    if (!category) throw badRequest('That category is not available. Choose another.');
  }
}

async function present(submission: SubmissionRow, apiBaseUrl: string) {
  const [house, category] = await Promise.all([
    submission.house_id
      ? queryOne<{ name: string }>(`SELECT name FROM houses WHERE id = $1`, [submission.house_id])
      : null,
    submission.category_id
      ? queryOne<{ name: string }>(`SELECT name FROM categories WHERE id = $1`, [submission.category_id])
      : null,
  ]);

  return {
    id: submission.id,
    fullName: submission.full_name,
    yearGrade: submission.year_grade,
    classRollGroup: submission.class_roll_group,
    house: house?.name ?? null,
    houseId: submission.house_id,
    category: category?.name ?? null,
    categoryId: submission.category_id,
    costumeName: submission.costume_name,
    costumeDescription: submission.costume_description,
    status: submission.status,
    reviewNote: submission.review_note,
    // Only the outcome and the message written for the student. The staff
    // reason code and internal note are never included here.
    locked: submission.locked,
    reviewedAt: submission.reviewed_at,
    submittedAt: submission.submitted_at,
    updatedAt: submission.updated_at,
    photoUrl: await photoUrl(submission.image_path, apiBaseUrl),
  };
}

const baseUrl = (req: { protocol: string; get: (h: string) => string | undefined }) =>
  `${req.protocol}://${req.get('host') ?? ''}`;

studentRouter.get(
  '/submission',
  asyncHandler(async (req, res) => {
    const submission = await queryOne<SubmissionRow>(
      `SELECT * FROM submissions WHERE student_id = $1`,
      [req.user!.id],
    );
    const settings = await getSettings();
    const window = evaluateWindow(settings);
    const content = await getSiteContent();
    const locked = submission?.locked ?? false;

    res.json({
      submission: submission ? await present(submission, baseUrl(req)) : null,
      submissionWindow: { ...window, message: windowMessage(window) },
      canEdit: window.open && !locked,
      lockedMessage:
        locked && typeof content.locked_entry_message === 'string'
          ? content.locked_entry_message
          : null,
    });
  }),
);

studentRouter.post(
  '/submission',
  rateLimit({ name: 'submit', limit: 10, windowSeconds: 3600, key: (req) => req.user?.id ?? null }),
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const settings = await assertWindowOpen();
    const details = parseDetails((req.body as { details?: unknown } | undefined)?.details);

    if (!details.confirmations) {
      throw badRequest('Please tick all of the confirmation boxes before submitting.');
    }
    if (!req.file) throw badRequest('Choose a photo of your costume to upload.');

    const existing = await queryOne<SubmissionRow>(
      `SELECT id FROM submissions WHERE student_id = $1`,
      [req.user!.id],
    );
    if (existing) throw conflict('You already have an entry. Edit it instead of creating a new one.');

    await validateReferences(details.houseId, details.categoryId);

    const image = await processUpload(
      req.file.buffer,
      settings.allowed_file_types,
      settings.max_file_size_mb * 1024 * 1024,
    );
    const key = buildObjectKey(req.user!.id, image.extension);
    await putObject(key, image.buffer, image.mime);

    const created = await queryOne<SubmissionRow>(
      `INSERT INTO submissions
         (student_id, full_name, year_grade, class_roll_group, house_id, category_id,
          costume_name, costume_description, image_path, image_mime, image_bytes,
          image_width, image_height, image_sha256, rules_accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       RETURNING *`,
      [
        req.user!.id,
        details.fullName,
        details.yearGrade,
        details.classRollGroup,
        details.houseId ?? null,
        details.categoryId ?? null,
        details.costumeName,
        details.costumeDescription,
        key,
        image.mime,
        image.bytes,
        image.width,
        image.height,
        image.sha256,
      ],
    );

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_CREATED,
      entityType: 'submission',
      entityId: created!.id,
      newValue: { costumeName: details.costumeName, yearGrade: details.yearGrade },
    });

    res.status(201).json({ submission: await present(created!, baseUrl(req)) });
  }),
);

studentRouter.patch(
  '/submission',
  asyncHandler(async (req, res) => {
    await assertWindowOpen();
    const details = parseDetails(req.body);

    const existing = await queryOne<SubmissionRow>(
      `SELECT * FROM submissions WHERE student_id = $1`,
      [req.user!.id],
    );
    if (!existing) throw notFound('You do not have an entry yet.');
    await assertNotLocked(existing);

    await validateReferences(details.houseId, details.categoryId);

    const updated = await queryOne<SubmissionRow>(
      `UPDATE submissions
          SET full_name = $2, year_grade = $3, class_roll_group = $4, house_id = $5,
              category_id = $6, costume_name = $7, costume_description = $8,
              status = 'pending', review_note = NULL, reviewed_by = NULL, reviewed_at = NULL
        WHERE student_id = $1
        RETURNING *`,
      [
        req.user!.id,
        details.fullName,
        details.yearGrade,
        details.classRollGroup,
        details.houseId ?? null,
        details.categoryId ?? null,
        details.costumeName,
        details.costumeDescription,
      ],
    );

    res.json({ submission: await present(updated!, baseUrl(req)) });
  }),
);

studentRouter.put(
  '/submission/photo',
  rateLimit({ name: 'replace-photo', limit: 10, windowSeconds: 3600, key: (req) => req.user?.id ?? null }),
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const settings = await assertWindowOpen();
    if (!req.file) throw badRequest('Choose a photo to upload.');

    const existing = await queryOne<SubmissionRow>(
      `SELECT * FROM submissions WHERE student_id = $1`,
      [req.user!.id],
    );
    if (!existing) throw notFound('You do not have an entry yet.');
    await assertNotLocked(existing);

    const image = await processUpload(
      req.file.buffer,
      settings.allowed_file_types,
      settings.max_file_size_mb * 1024 * 1024,
    );
    const key = buildObjectKey(req.user!.id, image.extension);
    await putObject(key, image.buffer, image.mime);

    await query(
      `INSERT INTO submission_photo_versions
         (submission_id, image_path, image_mime, image_bytes, replaced_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [existing.id, existing.image_path, existing.image_mime, existing.image_bytes, req.user!.id],
    );

    const updated = await queryOne<SubmissionRow>(
      `UPDATE submissions
          SET image_path = $2, image_mime = $3, image_bytes = $4, image_width = $5,
              image_height = $6, image_sha256 = $7,
              status = 'pending', review_note = NULL, reviewed_by = NULL, reviewed_at = NULL
        WHERE id = $1 RETURNING *`,
      [existing.id, key, image.mime, image.bytes, image.width, image.height, image.sha256],
    );

    // The previous file stays in storage as recoverable history; only the
    // superseded object of an already-replaced version is cleaned up.
    const stale = await query<{ image_path: string }>(
      `DELETE FROM submission_photo_versions
        WHERE id IN (
          SELECT id FROM submission_photo_versions
           WHERE submission_id = $1
           ORDER BY replaced_at DESC OFFSET 5
        )
        RETURNING image_path`,
      [existing.id],
    );
    await Promise.all(stale.map((s) => deleteObject(s.image_path)));

    await recordAudit(req, {
      action: AuditAction.SUBMISSION_PHOTO_REPLACED,
      entityType: 'submission',
      entityId: existing.id,
      oldValue: { imageBytes: existing.image_bytes, imageMime: existing.image_mime },
      newValue: { imageBytes: image.bytes, imageMime: image.mime },
    });

    res.json({ submission: await present(updated!, baseUrl(req)) });
  }),
);
