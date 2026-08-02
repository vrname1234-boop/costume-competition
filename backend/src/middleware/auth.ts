import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { queryOne } from '../db';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import type { UserRole, UserRow } from '../types';

/**
 * Authorisation is enforced here, on the server, for every non-public route.
 * The user record is re-read on each request so that disabling or deleting an
 * account takes effect immediately rather than when the access token expires.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  void (async () => {
    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
      const user = await queryOne<UserRow>(
        `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [payload.sub],
      );

      if (!user) throw unauthorized('Your account no longer exists.');
      if (user.status === 'disabled') throw forbidden('This account has been disabled.');
      if (user.status !== 'active') throw forbidden('This account is not active yet.');
      if (user.role !== payload.role) throw unauthorized('Please sign in again.');

      req.user = {
        id: user.id,
        role: user.role,
        status: user.status,
        displayName: user.display_name,
        mustChangePassword: user.must_change_password,
        label: user.username ?? user.email ?? user.id,
      };
      next();
    } catch (error) {
      next(error);
    }
  })();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/**
 * A user with must_change_password can only reach /auth/change-password and
 * /me. Everything else is blocked until the temporary password is replaced.
 */
export const blockUntilPasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword) {
    next(forbidden('You must change your password before continuing.'));
    return;
  }
  next();
};
