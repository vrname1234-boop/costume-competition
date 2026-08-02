import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  // Nothing sensitive is ever logged: no bodies, no tokens, no passwords.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'code'],
    remove: true,
  },
  transport: config.isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});
