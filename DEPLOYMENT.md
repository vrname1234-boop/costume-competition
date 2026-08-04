# Deployment

Order matters: database first, then backend, then frontend. Do the Resend
domain verification early — it is the slowest step and nothing can email
students until it finishes.

## 1. Supabase (database + image storage)

1. Create a project at supabase.com. Choose the Sydney region.
2. SQL Editor → run, in order:
   - `database/migrations/001_init.sql`
   - `database/migrations/002_defaults.sql`
   - `database/migrations/003_app_role.sql` (see the note in
     `database/README.md` — on Supabase you supply the role password)
   - `database/migrations/004_rejection_reasons.sql`
3. Storage → New bucket → name `costume-photos`, **Public: off**. Photos must
   never be publicly listable; the backend hands out signed URLs that expire.
4. Copy these values:
   - Settings → Database → Connection string (URI). Use the `costume_app`
     role from step 3 rather than the `postgres` superuser.
   - Settings → API → Project URL and the **service_role** key.

The service role key is a master key for storage. It belongs only in the
backend environment. Never put it in the frontend, a commit, or a screenshot.

## 2. Resend (verification emails)

1. Create a Resend account and add your sending domain.
2. Add the DNS records Resend gives you and wait for verification.
3. Create an API key.

Until the domain is verified, Resend will not deliver to real
`@education.nsw.gov.au` inboxes. If the school controls its own DNS, ask them
for these records early.

## 3. Backend — Render (or Railway)

New Web Service → connect this repository.

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Health check path | `/health` |

Environment variables:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Render sets this itself) |
| `DATABASE_URL` | Supabase connection string for `costume_app` |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | 64+ random characters — `openssl rand -base64 48` |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` |
| `REFRESH_TOKEN_TTL_DAYS` | `30` |
| `CORS_ORIGINS` | Your exact Vercel URL, e.g. `https://costumes.school.nsw.edu.au` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `SUPABASE_BUCKET` | `costume-photos` |
| `RESEND_API_KEY` | Resend API key |
| `MAIL_FROM` | `Costume Competition <noreply@yourdomain>` |
| `STUDENT_EMAIL_DOMAIN` | `education.nsw.gov.au` |

Do **not** set `DEV_EMAIL_TO_CONSOLE` in production — the backend refuses to
start if it is true, because it would print verification codes into logs.

`CORS_ORIGINS` is an exact-match allowlist, not a wildcard. Add the custom
domain to it the day you switch domains, or the frontend stops working.

### Seed the Owner account

After the first successful deploy, run once in the Render shell:

```bash
npm run seed:owner
```

It prints a temporary password for the `owner` username **once**. Sign in
immediately and change it — the account is forced to change it anyway.

To recover a lost Owner password later:

```bash
npm run seed:owner -- --reset-password
```

This also revokes existing Owner sessions.

## 4. Frontend — Vercel

Import the repository.

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

Environment variable:

| Name | Value |
| --- | --- |
| `VITE_API_BASE_URL` | Your backend URL, e.g. `https://costume-api.onrender.com` |

Anything prefixed `VITE_` is compiled into the public JavaScript bundle. The
API base URL is the only value that belongs there. Never add a database URL,
service key or JWT secret.

`frontend/vercel.json` already handles SPA routing (so `/owner/audit` loads on
refresh) and sets the security headers.

## 5. First run checklist

1. Sign in as `owner` and change the password.
2. Owner console → Website content: rules, dress code, instructions, photo
   requirements, contact.
3. Owner console → Competition settings: name, open/close dates, at least one
   category, houses if the school uses them.
4. Owner console → Admin accounts: create one per teacher and hand over each
   temporary password in person.
5. Register a test student account on a school address and submit one entry end
   to end before telling students the site is live.

## Notes and known limits

- Render's free tier sleeps after inactivity, so the first request of the day
  takes ~30 seconds. Fine for a school event; upgrade if that looks broken to
  students.
- Local disk storage exists only as a development fallback. On Render the disk
  is ephemeral, so `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are required in
  production and the backend enforces that at startup.
- No virus scanning, as agreed. Uploads are size-limited, magic-byte checked and
  fully re-encoded, which removes embedded payloads and metadata.
