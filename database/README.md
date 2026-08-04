# Database

PostgreSQL 14+ (developed against Supabase). Everything the API needs is created by the SQL files, run in order.

```
migrations/001_init.sql      tables, enums, indexes, constraints
migrations/002_defaults.sql  default editable site content + settings row
migrations/003_app_role.sql  restricted database role for the API
migrations/004_rejection_reasons.sql  staff-only rejection reasons and entry locking
```

## 1. Create the Supabase project

1. Create a project at https://supabase.com. Choose a region close to your users (Sydney).
2. Save the database password Supabase shows you — it is only shown once.

## 2. Run the migrations

In the Supabase dashboard: **SQL Editor → New query**, paste the contents of each file and run them **in order**.

`003_app_role.sql` uses a `psql` variable for the password, which the web SQL editor does not support. In the web editor, delete the `\set` line and replace `:'app_password'` with a quoted strong password of your own.

Or with `psql` locally:

```bash
export PGURI="postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
psql "$PGURI" -f migrations/001_init.sql
psql "$PGURI" -f migrations/002_defaults.sql
psql "$PGURI" -v app_password="$(openssl rand -base64 24)" -f migrations/003_app_role.sql
```

The backend should connect as `costume_app`, not as `postgres`:

```
DATABASE_URL=postgresql://costume_app:THAT_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require
```

## 3. Create the storage bucket

**Storage → New bucket**

- Name: `costume-photos`
- Public bucket: **off**. This matters. Photos of students must never be publicly listable or guessable. The API mints 60-second signed URLs after checking who is asking.
- File size limit: 10 MB (the API enforces this too, and enforces the Owner-configured limit).

Do not add any RLS policies granting `anon` or `authenticated` access to the bucket. The backend uses the service role key, server-side only.

## 4. Seed the Owner account

The Owner is not created by SQL, because the password must be hashed with argon2id by the application. From the `backend/` folder, with `DATABASE_URL` set:

```bash
npm run seed:owner
```

It prints a randomly generated password **once**. Copy it, log in, and the system forces you to change it before you can do anything else. Re-running the command does not overwrite an existing Owner (use `npm run seed:owner -- --reset-password` if the password is lost).

## 5. Resetting during development

`reset.sql` drops everything the migrations create. It destroys all data — never run it against production.

```bash
psql "$PGURI" -f reset.sql && psql "$PGURI" -f migrations/001_init.sql && psql "$PGURI" -f migrations/002_defaults.sql
```

## Schema overview

| Table | Purpose |
|---|---|
| `users` | students, admins, and the single owner. Partial unique index guarantees one owner. Soft-deleted so audit logs stay readable. |
| `email_verifications` | 6-digit codes, stored hashed, 10 minute expiry, attempt counter |
| `refresh_tokens` | rotating refresh tokens grouped into families for theft detection |
| `houses`, `categories` | Owner-managed lists; students only see active rows |
| `submissions` | one row per student, with image metadata (the file lives in Supabase Storage) |
| `submission_photo_versions` | history of replaced photos |
| `site_content` | key/value editable copy shown on the public site |
| `competition_settings` | single row; locks core fields once submissions open |
| `audit_logs` | append-only record of important actions |
| `rate_limits` | persistent rate limiting counters |
