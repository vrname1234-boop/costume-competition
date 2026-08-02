import argon2 from 'argon2';
import crypto from 'node:crypto';
import { badRequest } from './errors';

// OWASP 2024 baseline for argon2id.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'letmein123', 'iloveyou1', 'admin1234', 'welcome123', 'abc123456',
  'passw0rd', 'p@ssw0rd', 'football123', 'monkey1234', 'sunshine1', 'princess1',
  'qwerty12345', 'schoolpassword', 'changeme123',
]);

export const MIN_STUDENT_PASSWORD = 10;
export const MIN_STAFF_PASSWORD = 12;

export function assertPasswordStrength(password: string, minLength: number): void {
  if (password.length < minLength) {
    throw badRequest(`Password must be at least ${minLength} characters long.`);
  }
  if (password.length > 200) {
    throw badRequest('Password must be 200 characters or fewer.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw badRequest('That password is too common. Please choose a different one.');
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) {
    throw badRequest(
      'Password must include at least three of: lowercase letters, uppercase letters, numbers, symbols.',
    );
  }
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Used when seeding the Owner and when the Owner creates or resets an admin. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  // Guarantee it satisfies the strength rules regardless of the random draw.
  return `${out.slice(0, 6)}-${out.slice(6, 13)}-${out.slice(13)}9Aa`;
}
