import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query, queryOne } from '../db';
import type { UserRole } from '../types';
import { unauthorized } from './errors';
import { logger } from './logger';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  mcp: boolean; // must change password
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: `${config.jwt.accessTtlMinutes}m`,
    issuer: 'costume-competition',
    audience: 'costume-competition-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'costume-competition',
      audience: 'costume-competition-api',
    });
    if (typeof decoded === 'string') throw new Error('unexpected token payload');
    return decoded as unknown as AccessTokenPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

interface RefreshRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export async function issueRefreshToken(
  userId: string,
  familyId: string | null,
  meta: { ip: string | null; userAgent: string | null },
): Promise<IssuedRefreshToken> {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, COALESCE($2::uuid, gen_random_uuid()), $3, $4, $5, $6)`,
    [userId, familyId, sha256(token), expiresAt, meta.ip, meta.userAgent],
  );
  return { token, expiresAt };
}

/**
 * Rotates a refresh token. If a token that has already been used is presented
 * again, the whole family is revoked: that pattern means a token was stolen.
 */
export async function rotateRefreshToken(
  presented: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ userId: string; token: string }> {
  const row = await queryOne<RefreshRow>(
    `SELECT id, user_id, family_id, expires_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1`,
    [sha256(presented)],
  );

  if (!row) throw unauthorized('Your session has expired. Please sign in again.');

  if (row.revoked_at || row.expires_at.getTime() < Date.now()) {
    await query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE family_id = $1 AND revoked_at IS NULL`,
      [row.family_id],
    );
    logger.warn({ userId: row.user_id, familyId: row.family_id }, 'refresh token reuse detected');
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const issued = await issueRefreshToken(row.user_id, row.family_id, meta);
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = now(),
            replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $2)
      WHERE id = $1`,
    [row.id, sha256(issued.token)],
  );

  return { userId: row.user_id, token: issued.token };
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(presented)],
  );
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/** Six digit codes for email verification and password reset. */
export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export const hashVerificationCode = sha256;

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
