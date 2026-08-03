# Costume Competition Platform

A school costume competition entry system. Students register with their school
email, submit one costume photo with their details, and see the outcome.
Teachers review entries. One Owner account runs the whole competition from the
browser — dates, rules, categories, houses, upload limits and staff accounts —
without a developer or a redeploy.

The three parts deploy independently:

```
costume-competition/
  frontend/    React + Vite + TypeScript      -> Vercel
  backend/     Node + Express + TypeScript    -> Render or Railway
  database/    PostgreSQL schema + migrations -> Supabase
```

Judging, scoring and winner selection are deliberately not built in this
version.

There are two copies of the deployed platform — a practice one for testing with
fake students and a real one for the competition. `WORKFLOW.md` explains how
they are kept apart and how a tested change is published to the real site.

## Roles

| | Student | Admin (teacher) | Owner |
| --- | --- | --- | --- |
| Submit one entry | Yes | No | No |
| Edit own entry before the deadline | Yes | No | No |
| See all entries, search, filter, export CSV | No | Yes | Yes |
| Approve / reject with a reason | No | Yes | Yes |
| Edit entry details, replace or delete a photo | No | Yes | Yes |
| Edit website text, rules, dress code, announcements | No | No | Yes |
| Competition dates, categories, houses, upload limits | No | No | Yes |
| Create / disable / delete admin accounts | No | No | Yes |
| Read the audit log | No | No | Yes |

Every one of those rules is enforced in the backend on each request. Hidden
buttons are not a security boundary: a student who edits the URL or calls the
API directly receives 403.

## Security model, briefly

- Passwords hashed with Argon2id. Nothing is stored in reversible form.
- Short-lived JWT access token kept in memory only, plus a rotating refresh
  token. Reusing a revoked refresh token kills the whole token family. No auth
  cookies, so cross-site request forgery does not apply to the API.
- Student sign-up is restricted to `@education.nsw.gov.au` in the frontend, the
  API, *and* a database CHECK constraint. A 6-digit emailed code proves the
  address belongs to them.
- Admin accounts exist only because the Owner created them, with a one-time
  temporary password that must be changed at first sign in. Exactly one Owner
  can exist — enforced by a unique index.
- Uploads are checked for size, sniffed for real magic bytes (not the file
  extension), re-encoded through Sharp — which strips EXIF and GPS data — and
  written to private storage under a random key. Images are served through
  short-lived signed URLs.
- Rate limiting on registration, verification, sign in, refresh, password reset
  and uploads, stored in Postgres so it survives a restart and works across
  instances.
- Every meaningful action is written to an append-only audit log with the actor,
  the old value, the new value, the time and the IP address.

## Local development

Prerequisites: Node 20+, a PostgreSQL database (Supabase or local).

```bash
# 1. Database — run the SQL files in order, see database/README.md
psql "$DATABASE_URL" -f database/migrations/001_init.sql
psql "$DATABASE_URL" -f database/migrations/002_defaults.sql

# 2. Backend
cd backend
cp .env.example .env          # fill in DATABASE_URL and JWT_SECRET
npm install
npm run seed:owner            # prints the one-time Owner password
npm run dev                   # http://localhost:4000

# 3. Frontend
cd ../frontend
cp .env.example .env.local    # VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

In development, set `DEV_EMAIL_TO_CONSOLE=true` and verification codes are
printed to the backend log instead of being emailed. The backend refuses to
start with that setting in production.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Supabase, Render/Railway and Vercel,
including every environment variable and the order to do things in.

## Checks

```bash
cd backend  && npm run lint && npm run typecheck && npm run build
cd frontend && npm run lint && npm run typecheck && npm run build
```
