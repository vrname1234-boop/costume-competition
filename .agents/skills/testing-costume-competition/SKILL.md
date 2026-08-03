---
name: testing-costume-competition
description: How to stand up and end-to-end test the school costume competition monorepo (Postgres + Express backend :4000 + Vite frontend :5173) locally, including owner/student/admin credentials, dev email codes and local-disk image storage.
---

# Testing the costume competition platform locally

## Bring up the stack

1. **Postgres** may be missing on a fresh box:
   ```bash
   sudo apt-get update && sudo apt-get install -y postgresql
   sudo pg_ctlcluster 14 main start
   sudo -u postgres psql -c "CREATE USER costume WITH PASSWORD 'costume' SUPERUSER;" \
                         -c "CREATE DATABASE costume OWNER costume;"
   PGPASSWORD=costume psql -h localhost -U costume -d costume -f database/migrations/001_init.sql
   PGPASSWORD=costume psql -h localhost -U costume -d costume -f database/migrations/002_defaults.sql
   ```
   `003_app_role.sql` (restricted role) is optional locally and can be skipped.

2. **backend/.env** — the biggest gotcha: config is validated by Zod (`backend/src/config.ts`) and
   *present-but-empty* optional variables fail validation (`SUPABASE_URL: Invalid url`,
   `SUPABASE_SERVICE_KEY: String must contain at least 1 character(s)`, `RESEND_API_KEY: …`).
   **Delete those lines entirely** rather than leaving them blank; only then do the non-production
   fallbacks (local-disk storage + console email) activate.
   Minimum working set:
   ```
   NODE_ENV=development
   DATABASE_URL=postgresql://costume:costume@localhost:5432/costume
   DATABASE_SSL=false
   JWT_SECRET=<64+ chars>
   CORS_ORIGINS=http://localhost:5173
   DEV_EMAIL_TO_CONSOLE=true
   LOCAL_STORAGE_DIR=.local-storage
   ```
   `frontend/.env.local`: `VITE_API_BASE_URL=http://localhost:4000`.

3. `cd backend && npm run seed:owner` prints a one-time temp password for username `owner`
   (forced password change at first sign-in). Then `npm run dev` in backend and frontend.

## Getting through the flows

- **Verification codes / temp passwords**: student six-digit codes are printed to the backend log
  (`grep 'DEV EMAIL' /tmp/backend.log`), not emailed. Staff temp passwords are shown once in the
  Owner → Admin accounts UI — capture them immediately.
- **Order matters**: create a category and a house *before* testing student submission, otherwise the
  submit form dropdowns are empty. Set the submission window open (opens in the past, closes in the
  future) before students can submit.
- **Competition settings lock**: once `submission_opens_at <= now`, core fields lock permanently
  (`backend/src/services/settings.ts`, `isCompetitionLocked`). Pausing submissions does **not** unlock
  them, and the settings form may 403 because it resends disabled fields. If you need an unlocked
  state for testing, update `competition_settings.submission_opens_at` directly via psql, and restore
  it afterwards.
- **Nullable settings**: the settings PUT uses `COALESCE`, so sending `null` for a date returns 200
  but silently keeps the old value. Always re-read after a write instead of trusting the response.
- **Images**: in local mode photos are served via short-lived signed JWTs at
  `GET /api/images/<token>` with a ~60 s TTL. Grab a fresh token from `GET /api/me/submission`
  right before asserting on it; an old token legitimately 404s with "That image link has expired."
- **Auth for API probes**: `POST /api/auth/login` with `{"identifier": …, "password": …}` returns
  `accessToken` and `refreshToken` **in the JSON body** (not cookies). `POST /api/auth/refresh`
  takes `{"refreshToken": …}`. Refresh tokens rotate and replaying a consumed one revokes the whole
  family — expect subsequent 401s, which is intended, not a bug.
- **File-upload probes**: student photo endpoints are `POST /api/me/submission` (multipart with a
  `details` JSON part + `photo`), `PATCH /api/me/submission` (JSON) and
  `PUT /api/me/submission/photo` (multipart). Test both the UI and the direct API — the UI does its
  own client-side size check, so server-side limits need a curl call to prove.

## Browser tips

- HTML `datetime-local` inputs are awkward with computer-use; click the field and type the date and
  time segments, then verify the value in the DOM before saving.
- To attach a file, click the file input, then use `ctrl+l` in the GTK dialog and type the absolute
  path followed by Enter.

## Devin Secrets Needed

None — everything runs locally with a self-chosen `JWT_SECRET`; Supabase and Resend keys are
deliberately absent and must stay absent for the local fallbacks to work.
