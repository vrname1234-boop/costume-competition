import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Which copy of the platform this is. Staging drives the "practice site"
  // warning in the UI; it does not change any behaviour.
  APP_ENVIRONMENT: z.enum(['development', 'staging', 'production']).optional(),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.enum(['true', 'false']).default('true'),
  // PEM of the database provider's CA. When set, the certificate chain is
  // verified instead of merely encrypted.
  DATABASE_CA_CERT: z.string().optional(),

  // Comma separated list of exact origins allowed to call the API.
  CORS_ORIGINS: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SUPABASE_BUCKET: z.string().default('costume-photos'),

  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().default('Costume Competition <onboarding@resend.dev>'),

  // When true, verification codes are written to the server log instead of
  // being emailed. Refused in production.
  DEV_EMAIL_TO_CONSOLE: z.enum(['true', 'false']).default('false'),

  // Local filesystem storage instead of Supabase, for local development only.
  LOCAL_STORAGE_DIR: z.string().optional(),

  STUDENT_EMAIL_DOMAIN: z.string().default('education.nsw.gov.au'),
  LOG_LEVEL: z.string().default('info'),
});

// An empty value in a .env file means "not configured", not "configured as
// an empty string" — otherwise commenting out a key by blanking it fails
// validation instead of falling back to the development defaults.
const provided = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
);

const parsed = schema.safeParse(provided);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

const isProduction = env.NODE_ENV === 'production';
const emailToConsole = env.DEV_EMAIL_TO_CONSOLE === 'true';
const appEnvironment = env.APP_ENVIRONMENT ?? (isProduction ? 'production' : 'development');

// These two rules protect real students, so they follow APP_ENVIRONMENT rather
// than NODE_ENV: the staging copy runs a production build but is allowed to
// print verification codes to its log and to have no mail account at all.
const isLive = appEnvironment === 'production';

if (isLive && emailToConsole) {
  // eslint-disable-next-line no-console
  console.error('DEV_EMAIL_TO_CONSOLE cannot be enabled on the live site.');
  process.exit(1);
}

if (isLive && !env.RESEND_API_KEY) {
  // eslint-disable-next-line no-console
  console.error('RESEND_API_KEY is required on the live site.');
  process.exit(1);
}

const useSupabaseStorage = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

if (isProduction && !useSupabaseStorage) {
  // eslint-disable-next-line no-console
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in production.');
  process.exit(1);
}

export const config = {
  env: env.NODE_ENV,
  appEnvironment,
  isLive,
  isProduction,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  database: {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true',
    caCert: env.DATABASE_CA_CERT,
  },
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwt: {
    secret: env.JWT_SECRET,
    accessTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  },
  storage: {
    useSupabase: useSupabaseStorage,
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY ?? '',
    bucket: env.SUPABASE_BUCKET,
    localDir: env.LOCAL_STORAGE_DIR ?? '.local-storage',
  },
  mail: {
    resendApiKey: env.RESEND_API_KEY ?? '',
    from: env.MAIL_FROM,
    toConsole: emailToConsole,
  },
  studentEmailDomain: env.STUDENT_EMAIL_DOMAIN.toLowerCase(),
} as const;

export type Config = typeof config;
