import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

const isMulterError = (err: unknown): err is MulterError => err instanceof MulterError;

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
};

// Express identifies error middleware by arity, so the fourth argument must
// stay in the signature even though it is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Please check the highlighted fields.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (isMulterError(err)) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is larger than the maximum allowed size.'
        : 'The file upload could not be processed.';
    res.status(400).json({ error: { code: 'upload_failed', message } });
    return;
  }

  logger.error({ err }, 'unhandled error');
  // Never leak stack traces or internal messages to the browser.
  res.status(500).json({
    error: { code: 'server_error', message: 'Something went wrong. Please try again.' },
  });
};
