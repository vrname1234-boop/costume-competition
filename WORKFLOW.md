# Practice site and real site

There are two complete copies of this platform. They share nothing — no
database, no photos, no accounts. That is the whole point: you can do anything
you like on the practice copy and the real competition cannot notice.

|  | Practice ("staging") | Real ("production") |
| --- | --- | --- |
| Purpose | Try things. Fake students, fake entries, break it on purpose. | The competition students actually use. |
| Supabase project | `costume-staging` | `costume-live` |
| Database | Fake data. Wipe it whenever. | Real student data. Never test here. |
| Photo storage bucket | `costume-photos` in the staging project | `costume-photos` in the live project |
| Backend (Render) | `costume-api-staging` | `costume-api` |
| Frontend (Vercel) | Preview URL, built from the `develop` branch | Your real domain, built from `main` |
| Emails | Codes printed in the Render log, not emailed | Real emails through Resend |
| Top of every page | Orange bar: PRACTICE SITE | Nothing |

A fake student created on the practice site cannot appear on the real site,
because the row is in a different database on different servers. Deleting the
entire practice database does not touch the real one.

## The routine, once set up

1. I put changes on a branch and open a pull request.
2. Vercel automatically builds a practice URL for that branch, wired to the
   staging backend and staging database.
3. You open that URL and try it: fake students, fake entries, change rules,
   categories, houses, dates — whatever you want. Nothing here is real.
4. When you are happy, you press **Merge pull request** on GitHub.
5. Merging into `main` is what publishes. Vercel and Render redeploy the real
   site from `main` within a couple of minutes.

Publishing is that merge and nothing else. If you never merge, the real site
never changes.

### If something goes wrong after publishing

GitHub → the merged pull request → **Revert**. That creates a pull request
putting the code back as it was; merge it and the real site returns to the
previous version in a couple of minutes. Code is reversible.

**Data is not.** Reverting code does not bring back a deleted entry. That is
why deletions live behind a typed reason and an audit log entry.

## One-time setup

### 1. Two Supabase projects

Create **both** projects, Sydney region:

- `costume-staging`
- `costume-live`

In **each** project, separately:

1. SQL Editor → run `database/migrations/001_init.sql`, then
   `002_defaults.sql`, then `003_app_role.sql`.
2. Storage → New bucket → `costume-photos`, **Public: off**.
3. Copy for me: the database connection string, the Project URL, and the
   `service_role` key. Label which project each one came from — mixing these
   two up is the one mistake that actually matters, because it would point the
   practice site at real student data.

Send them as chat messages, not in the repository. The repository is public.

### 2. Two Render services

Both use root directory `backend`, build `npm ci && npm run build`, start
`npm run start`, health check `/health`.

`costume-api-staging`:

```
NODE_ENV=production
APP_ENVIRONMENT=staging          <- shows the orange PRACTICE bar
DATABASE_URL=<staging>
SUPABASE_URL=<staging>
SUPABASE_SERVICE_KEY=<staging>
CORS_ORIGINS=https://<your-vercel-preview-domain>
DEV_EMAIL_TO_CONSOLE=true         <- codes appear in the Render log
JWT_SECRET=<its own random value>
```

`costume-api`:

```
NODE_ENV=production
APP_ENVIRONMENT=production
DATABASE_URL=<live>
SUPABASE_URL=<live>
SUPABASE_SERVICE_KEY=<live>
CORS_ORIGINS=https://<your real domain>
RESEND_API_KEY=<real key>
JWT_SECRET=<a different random value>
```

Use a **different** `JWT_SECRET` for each. Then a login token from the practice
site is meaningless to the real site.

On staging, verification codes appear in the Render logs (Render → service →
Logs) instead of being emailed, so you can register as many fake students as
you want without a mail account.

### 3. One Vercel project, two environments

Root directory `frontend`, framework Vite.

- Production environment variables (used for `main`):
  `VITE_API_BASE_URL=https://costume-api.onrender.com`
  `VITE_APP_ENVIRONMENT=production`
- Preview environment variables (used for every other branch):
  `VITE_API_BASE_URL=https://costume-api-staging.onrender.com`
  `VITE_APP_ENVIRONMENT=staging`

Vercel keeps these separate by design, so a branch build can never talk to the
real backend.

### 4. Branch protection (recommended)

GitHub → Settings → Branches → add a rule for `main` requiring a pull request
before merging. Then nothing reaches the real site without an explicit merge —
including by me.

## Rules worth keeping

- Never create a fake student on the real site. Use the practice site.
- The Owner account exists separately in each copy, with its own password. Run
  `npm run seed:owner` once per backend.
- Before the competition opens, wipe the practice database and start it fresh so
  old test data cannot confuse you: run `database/reset.sql` then the migrations
  again — **only ever against the staging project**.
- Never paste a `service_role` key or database URL into the repository, an
  issue, or a screenshot. The repository is public.

## Recovering the real site's Owner password

In the Render shell for `costume-api`:

```bash
npm run seed:owner -- --reset-password
```

This prints a new temporary password once and signs the Owner out everywhere.
