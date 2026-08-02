/**
 * Creates the single Owner account.
 *
 * The password is generated here and printed once. It is never committed,
 * never stored in plain text, and the account is flagged so the first sign in
 * must replace it.
 *
 *   npm run seed:owner
 *   npm run seed:owner -- --reset-password
 */
import { pool, query, queryOne } from '../src/db';
import { generateTemporaryPassword, hashPassword } from '../src/lib/passwords';

const USERNAME = process.env.OWNER_USERNAME?.trim().toLowerCase() || 'owner';
const DISPLAY_NAME = process.env.OWNER_DISPLAY_NAME?.trim() || 'Site Owner';

function banner(password: string, existing: boolean) {
  const line = '='.repeat(64);
  process.stdout.write(
    [
      '',
      line,
      existing ? '  OWNER PASSWORD RESET' : '  OWNER ACCOUNT CREATED',
      line,
      `  Username: ${USERNAME}`,
      `  Password: ${password}`,
      line,
      '  This password is shown once and cannot be recovered.',
      '  You will be required to change it at first sign in.',
      line,
      '',
    ].join('\n'),
  );
}

async function main() {
  const resetRequested = process.argv.includes('--reset-password');

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL`,
  );

  if (existing && !resetRequested) {
    process.stdout.write(
      '\nAn Owner account already exists. Nothing changed.\n' +
        'Use "npm run seed:owner -- --reset-password" if the password was lost.\n\n',
    );
    return;
  }

  const password = generateTemporaryPassword();
  const passwordHash = await hashPassword(password);

  if (existing) {
    await query(
      `UPDATE users
          SET password_hash = $2, must_change_password = true, status = 'active',
              failed_login_count = 0, locked_until = NULL
        WHERE id = $1`,
      [existing.id, passwordHash],
    );
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1`, [existing.id]);
  } else {
    await query(
      `INSERT INTO users (role, status, username, display_name, password_hash, must_change_password)
       VALUES ('owner', 'active', $1, $2, $3, true)`,
      [USERNAME, DISPLAY_NAME, passwordHash],
    );
  }

  banner(password, Boolean(existing));
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nSeeding failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
