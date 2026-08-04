import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { queryOne } from '../db';
import { clientIp } from './audit';
import { tooManyRequests } from './errors';
import { logger } from './logger';

/**
 * Counters live in Postgres rather than in memory because Render's free tier
 * restarts and sleeps containers, which would otherwise reset every limit.
 */
export async function consume(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (bucket, count, expires_at)
     VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (bucket) DO UPDATE
       SET count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
           expires_at = CASE WHEN rate_limits.expires_at < now()
                             THEN now() + make_interval(secs => $2)
                             ELSE rate_limits.expires_at END
     RETURNING count`,
    [bucket, windowSeconds],
  );
  return (row?.count ?? 0) <= limit;
}

interface LimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  /** Defaults to the client IP. Return null to skip the limit for a request. */
  key?: (req: Request) => string | null;
  message?: string;
}

export function rateLimit(options: LimitOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const keyPart = options.key ? options.key(req) : clientIp(req);
    if (!keyPart) {
      next();
      return;
    }
    consume(`${options.name}:${keyPart}`, options.limit, options.windowSeconds)
      .then((allowed) => {
        if (allowed) {
          next();
          return;
        }
        next(tooManyRequests(options.message));
      })
      .catch((error: unknown) => {
        // Fail closed would lock everyone out if the DB hiccups; fail open but
        // record it, since the per-account lockouts still apply.
        logger.error({ err: error, bucket: options.name }, 'rate limit check failed');
        next();
      });
  };
}
