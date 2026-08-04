import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { logger } from './lib/logger';

async function main() {
  // Fail fast on a bad DATABASE_URL rather than on the first request.
  await pool.query('SELECT 1');

  const server = createApp().listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'API listening');
    if (config.mail.toConsole) {
      logger.warn('DEV_EMAIL_TO_CONSOLE is on: verification codes are printed here, not emailed.');
    }
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'failed to start');
  process.exit(1);
});
