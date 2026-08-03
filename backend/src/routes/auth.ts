import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { query, queryOne } from '../db';
import { AuditAction, clientIp, recordAudit } from '../lib/audit';
import { sendPasswordResetCode, sendVerificationCode } from '../lib/email';
import { badRequest, forbidden, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import {
  MIN_STAFF_PASSWORD,
  MIN_STUDENT_PASSWORD,
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
} from '../lib/passwords';
import { rateLimit } from '../lib/rateLimit';
import {
  generateVerificationCode,
  hashVerificationCode,
  issueRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../lib/tokens';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { getSettings } from '../services/settings';
import type { UserRow } from '../types';

export const authRouter = Router();

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254)
  .refine(
    (value) => value.endsWith(`@${config.studentEmailDomain}`),
    `Use your school email address ending in @${config.studentEmailDomain}.`,
  );

/**
 * Registration, login and reset all return the same shape whether or not the
 * account exists, so the API cannot be used to discover who has registered.
 */
const GENERIC_SENT = {
  message: 'If that school email is valid, a 6-digit code has been sent to it.',
};

function emailKey(req: Request): string | null {
  const body: unknown = req.body;
  if (typeof body === 'object' && body !== null && 'email' in body) {
    const email = (body as { email: unknown }).email;
    if (typeof email === 'string') return email.toLowerCase();
  }
  return null;
}

function meta(req: { ip?: string; get: (h: string) => string | undefined }) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 500) ?? null };
}

function sessionResponse(user: UserRow, refreshToken: string) {
  return {
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      mcp: user.must_change_password,
    }),
    refreshToken,
    user: {
      id: user.id,
      role: user.role,
      displayName: user.display_name,
      email: user.email,
      username: user.username,
      mustChangePassword: user.must_change_password,
    },
  };
}

async function createCode(email: string, purpose: 'register' | 'reset', ip: string | null) {
  const code = generateVerificationCode();
  await query(
    `UPDATE email_verifications SET consumed_at = now()
      WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [email, purpose],
  );
  await query(
    `INSERT INTO email_verifications (email, code_hash, purpose, expires_at, ip)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5)`,
    [email, hashVerificationCode(code), purpose, CODE_TTL_MINUTES, ip],
  );
  return code;
}

async function consumeCode(email: string, purpose: 'register' | 'reset', code: string) {
  const row = await queryOne<{ id: string; attempts: number; code_hash: string }>(
    `SELECT id, attempts, code_hash FROM email_verifications
      WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email, purpose],
  );

  if (!row) throw badRequest('That code has expired or is not valid. Request a new one.');

  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await query(`UPDATE email_verifications SET consumed_at = now() WHERE id = $1`, [row.id]);
    throw badRequest('Too many incorrect attempts. Request a new code.');
  }

  if (row.code_hash !== hashVerificationCode(code)) {
    await query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    throw badRequest('That code is not correct.');
  }

  await query(`UPDATE email_verifications SET consumed_at = now() WHERE id = $1`, [row.id]);
}

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

authRouter.post(
  '/student/register',
  rateLimit({ name: 'register-ip', limit: 10, windowSeconds: 3600 }),
  rateLimit({
    name: 'register-email',
    limit: 3,
    windowSeconds: 3600,
    key: emailKey,
    message: 'A code was already sent to that address. Please wait before requesting another.',
  }),
  asyncHandler(async (req, res) => {
    const { email, displayName } = z
      .object({ email: emailSchema, displayName: z.string().trim().min(2).max(120) })
      .parse(req.body);

    const existing = await queryOne<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );

    if (existing && existing.status === 'active') {
      // Already registered: say nothing different, but do not send a code.
      res.json(GENERIC_SENT);
      return;
    }

    if (!existing) {
      await query(
        `INSERT INTO users (role, status, email, display_name) VALUES ('student', 'pending', $1, $2)`,
        [email, displayName],
      );
    }

    const settings = await getSettings();
    const code = await createCode(email, 'register', clientIp(req));
    try {
      await sendVerificationCode(email, code, settings.competition_name);
    } catch {
      throw badRequest('We could not send the verification email. Please try again shortly.');
    }
    res.json(GENERIC_SENT);
  }),
);

authRouter.post(
  '/student/verify',
  rateLimit({ name: 'verify-ip', limit: 20, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const { email, code, password } = z
      .object({
        email: emailSchema,
        code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
        password: z.string().min(1),
      })
      .parse(req.body);

    assertPasswordStrength(password, MIN_STUDENT_PASSWORD);
    await consumeCode(email, 'register', code);

    const user = await queryOne<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    if (!user) throw badRequest('Start again by requesting a new code.');
    if (user.status === 'active') throw badRequest('That account is already set up. Please sign in.');

    const updated = await queryOne<UserRow>(
      `UPDATE users SET status = 'active', password_hash = $2, must_change_password = false
        WHERE id = $1 RETURNING *`,
      [user.id, await hashPassword(password)],
    );
    if (!updated) throw badRequest('Start again by requesting a new code.');

    const refresh = await issueRefreshToken(updated.id, null, meta(req));
    res.json(sessionResponse(updated, refresh.token));
  }),
);

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

authRouter.post(
  '/login',
  rateLimit({ name: 'login-ip', limit: 20, windowSeconds: 900 }),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        identifier: z.string().trim().min(1, 'Enter your email or username.').max(254),
        password: z.string().min(1, 'Enter your password.'),
      })
      .parse(req.body);

    const identifier = body.identifier.toLowerCase();
    const user = await queryOne<UserRow>(
      `SELECT * FROM users
        WHERE deleted_at IS NULL AND (email = $1 OR username = $1)`,
      [identifier],
    );

    const failure = unauthorized('Those sign in details are not correct.');

    if (!user || !user.password_hash) {
      // Burn comparable time so a missing account is not detectable by timing.
      await hashPassword(body.password);
      throw failure;
    }

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw forbidden('Too many failed attempts. Try again in a few minutes.');
    }
    if (user.status === 'disabled') throw forbidden('This account has been disabled.');
    if (user.status === 'pending') {
      throw forbidden('Finish setting up your account using the code sent to your school email.');
    }

    if (!(await verifyPassword(user.password_hash, body.password))) {
      const attempts = user.failed_login_count + 1;
      await query(
        `UPDATE users
            SET failed_login_count = $2::int,
                locked_until = CASE WHEN $2::int >= $3::int
                                    THEN now() + make_interval(mins => $4::int)
                                    ELSE locked_until END
          WHERE id = $1`,
        [user.id, attempts, MAX_FAILED_LOGINS, LOCKOUT_MINUTES],
      );
      throw failure;
    }

    await query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );

    const refresh = await issueRefreshToken(user.id, null, meta(req));
    res.json(sessionResponse(user, refresh.token));
  }),
);

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

authRouter.post(
  '/refresh',
  rateLimit({ name: 'refresh-ip', limit: 120, windowSeconds: 900 }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    const rotated = await rotateRefreshToken(refreshToken, meta(req));
    const user = await queryOne<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [rotated.userId],
    );
    if (!user || user.status !== 'active') {
      throw unauthorized('Your session has ended. Please sign in again.');
    }
    res.json(sessionResponse(user, rotated.token));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Password reset (students) and change (everyone)
// ---------------------------------------------------------------------------

authRouter.post(
  '/forgot-password',
  rateLimit({ name: 'forgot-ip', limit: 10, windowSeconds: 3600 }),
  rateLimit({
    name: 'forgot-email',
    limit: 3,
    windowSeconds: 3600,
    key: emailKey,
  }),
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = await queryOne<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL AND status = 'active'`,
      [email],
    );
    if (user) {
      const settings = await getSettings();
      const code = await createCode(email, 'reset', clientIp(req));
      try {
        await sendPasswordResetCode(email, code, settings.competition_name);
      } catch (error) {
        logger.error({ err: error }, 'reset email failed');
      }
    }
    res.json(GENERIC_SENT);
  }),
);

authRouter.post(
  '/reset-password',
  rateLimit({ name: 'reset-ip', limit: 20, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const { email, code, password } = z
      .object({
        email: emailSchema,
        code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
        password: z.string().min(1),
      })
      .parse(req.body);

    assertPasswordStrength(password, MIN_STUDENT_PASSWORD);
    await consumeCode(email, 'reset', code);

    const user = await queryOne<UserRow>(
      `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL
        WHERE email = $1 AND deleted_at IS NULL AND status = 'active'
        RETURNING *`,
      [email, await hashPassword(password)],
    );
    if (!user) throw badRequest('Request a new code and try again.');

    // Any session opened with the old password is invalidated.
    await revokeAllUserTokens(user.id);
    const refresh = await issueRefreshToken(user.id, null, meta(req));
    res.json(sessionResponse(user, refresh.token));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  rateLimit({ name: 'change-pw', limit: 10, windowSeconds: 3600, key: (req) => req.user?.id ?? null }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) })
      .parse(req.body);

    const user = await queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
    if (!user?.password_hash) throw unauthorized();

    if (!(await verifyPassword(user.password_hash, currentPassword))) {
      throw badRequest('Your current password is not correct.');
    }
    if (currentPassword === newPassword) {
      throw badRequest('Your new password must be different from your current password.');
    }

    assertPasswordStrength(
      newPassword,
      user.role === 'student' ? MIN_STUDENT_PASSWORD : MIN_STAFF_PASSWORD,
    );

    const updated = await queryOne<UserRow>(
      `UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1 RETURNING *`,
      [user.id, await hashPassword(newPassword)],
    );

    await revokeAllUserTokens(user.id);

    if (user.role === 'owner') {
      await recordAudit(req, {
        action: AuditAction.OWNER_PASSWORD_CHANGED,
        entityType: 'user',
        entityId: user.id,
      });
    }

    const refresh = await issueRefreshToken(user.id, null, meta(req));
    res.json(sessionResponse(updated!, refresh.token));
  }),
);
