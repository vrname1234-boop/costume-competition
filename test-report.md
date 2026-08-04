# Costume Competition Platform — End-to-End Test Report

**PR:** https://github.com/vrname1234-boop/costume-competition/pull/1
**Branch:** `devin/1785663352-costume-competition-platform`
**Environment:** local PostgreSQL 14 (`costume` db, migrations `001_init.sql` + `002_defaults.sql`; `003_app_role.sql` skipped as permitted), backend on `:4000` (local-disk storage fallback + `DEV_EMAIL_TO_CONSOLE`), frontend on `:5173`, Chrome.

**Verdict:** The three golden paths and all security probes worked. **Three real bugs were found**, all in the Owner competition-settings area. Nothing was fixed.

---

## Bugs found

### BUG 1 (blocking) — The Owner cannot pause submissions from the UI

Once submissions have opened, the settings form disables the locked fields but the frontend still **sends them back** in the PUT body. The backend compares every locked field and rejects the whole request, so simply un-ticking "Submissions enabled" and pressing Save fails with 403. Pausing is the one emergency control the Owner has, and it is unreachable through the UI.

```
PUT /api/owner/competition-settings   (from the browser, only the enabled checkbox changed)
403 {"error":{"code":"forbidden","message":"Submissions have opened, so these cannot be changed: submission_opens_at, submission_closes_at. Pause submissions first if this is an emergency."}}
```

Backend lock check: `backend/src/routes/owner.ts:403-412`. The frontend should omit locked fields from the payload (owner competition settings page).

![Owner cannot pause: Save returns 403](https://app.devin.ai/attachments/aedcae1c-3ceb-411a-9f95-f86b8b5d3a72/ss_a2f0533f.png)

Note the self-contradiction: the red error and the yellow banner both say *"Pause submissions first"*, but the checkbox that pauses submissions is the very thing being rejected.

### BUG 2 (logic) — Pausing submissions does not unlock the locked fields

Even when pausing succeeds via a direct API call, the fields stay locked, so the advice in the error message is impossible to follow by any route.

```
PUT /api/owner/competition-settings {"submissions_enabled": false}   -> 200
GET /api/owner/competition-settings
   -> "locked": true, "lockedFields": ["competition_name","submission_opens_at","submission_closes_at","number_of_winners","requirements"]
PUT /api/owner/competition-settings {"submission_closes_at": null}   -> 403 (still locked)
```

Fault: `backend/src/services/settings.ts:59-62` — `isCompetitionLocked()` only looks at `settings.locked` and `submission_opens_at <= now`; it never considers `submissions_enabled`.

### BUG 3 (silent data bug) — `submission_closes_at: null` returns 200 but is silently ignored

With the competition unlocked (verified by moving `submission_opens_at` into the future directly in the DB purely to reach this code path):

```
PUT /api/owner/competition-settings {"submission_closes_at": null}
200 {"settings":{... "submission_closes_at":"2026-08-09T09:00:00.000Z" ...}}   <- unchanged
GET /api/owner/competition-settings  -> closes = 2026-08-09T09:00:00.000Z      <- still unchanged
```

The API accepts `null` (the Zod schema is `.nullish()`, `backend/src/routes/owner.ts:370-371`) and reports success, but `COALESCE($3::timestamptz, submission_closes_at)` at `backend/src/routes/owner.ts:424` keeps the old value. A date can never be cleared, and the caller is told the change succeeded. Same applies to `submission_opens_at` (`owner.ts:423`) and every other COALESCE'd column.

---

## Test results

### Owner golden path
| Check | Result |
|---|---|
| Sign in with seeded temp password → forced `/change-password` → new password | passed |
| Add category "Best Group Costume" + house "Test House", set open/close dates, submissions open | passed |
| Website content: rules changed to `RULES-CHECK-7742…` and visible on public homepage | passed |
| Admin accounts: create `teacher1`, one-time temp password shown once | passed |
| Pause submissions from the UI | **FAILED (BUG 1)** |
| Clear a date (`null`) | **FAILED (BUG 3)** |

### Student golden path
| Check | Result |
|---|---|
| Register with `@education.nsw.gov.au`, read 6-digit code from backend log, verify, set password | passed |
| Non-school email (`someone@gmail.com`) rejected | passed (API returns the precise field message; the UI only shows the generic "Please check the highlighted fields." banner — minor UX nit) |
| Submit entry (name, year, class, category, house, costume + description, JPG, 4 checkboxes) | passed |
| Photo renders on the dashboard via the signed `/api/images/<token>` route (local-disk fallback) | passed |

![Student dashboard with rendered photo](https://app.devin.ai/attachments/2f3f8699-29f5-4251-878a-db431ef79051/ss_79a25a52.png)

### Admin golden path
| Check | Result |
|---|---|
| Sign in as `teacher1`, forced password change | passed |
| Reject entry with reason "Photo is too dark, please retake." | passed |
| Student sees the exact reason and can edit/resubmit before the deadline | passed |
| Resubmission returns entry to "Pending review" | passed |
| Photo replacement history shows the previous photo, and it renders | passed |
| Approve entry | passed |
| CSV export contains the student's email, costume name, status and reviewer | passed |

| 🔴 Student sees rejection reason | 🟢 Admin sees photo history after resubmit |
|---|---|
| ![Rejection reason on student dashboard](https://app.devin.ai/attachments/61ec4909-7b5b-4014-b7eb-e312c0238893/ss_136833d0.png) | ![Previous photos section](https://app.devin.ai/attachments/bfcec815-f4af-4025-8de0-5bc8d5461c02/ss_cc247bad.png) |

CSV downloaded from the UI:

```
Full name,School email,Year,Class/Roll group,House,Category,Costume name,Costume description,Status,Review note,Reviewed by,Submitted at
"Sam Student","sam.student@education.nsw.gov.au","Year 9","9A","Test House","Best Group Costume","Space Pirate v2 (retaken)","A homemade space pirate outfit…","approved","","teacher1","2026-08-02T13:19:12.702Z"
```

![Staff list showing Approved + CSV downloaded](https://app.devin.ai/attachments/0c939233-9f82-48c4-af49-6c223a70d0db/ss_731ee02a.png)

### Security probes
All exact statuses recorded.

| Probe | Result |
|---|---|
| Student token → `GET /api/admin/submissions`, `/api/admin/stats`, `/api/owner/stats`, `/api/owner/admins`, `/api/owner/audit-logs` | all **403** — passed |
| Student token → `POST /api/owner/admins` | **403** — passed |
| Admin (teacher) token → `GET /api/owner/stats`, `/api/owner/admins`, `/api/owner/competition-settings`, `/api/owner/audit-logs`, `POST /api/owner/admins` | all **403**, while `GET /api/admin/submissions` still 200 — passed |
| Unauthenticated → `/api/me/submission`, `/api/admin/submissions`, `/api/owner/stats` | all **401** — passed |
| Student browsing to `/staff` and `/owner` | "No access" page, no staff/owner data rendered — passed |
| Second `POST /api/me/submission` by same student | **409** "You already have an entry." — passed |
| `.txt` renamed `fake.jpg` (UI **and** direct API) | **400** "That file is not a supported image. Allowed types: JPEG, PNG, WEBP." — passed |
| 38.2 MB JPG (UI **and** direct API, never a 500) | UI blocks with size message; API **400** "That image is larger than the maximum allowed size." — passed |
| Submissions paused → student `POST`, `PATCH /api/me/submission`, `PUT /api/me/submission/photo` | all **403** "Submissions are currently paused by the organisers." — passed |

| 🟢 Student blocked from /staff | 🟢 Magic-byte rejection |
|---|---|
| ![No access page](https://app.devin.ai/attachments/72ab6bea-fe74-4813-8f6a-d042b5821072/ss_c3304c18.png) | ![Unsupported image error](https://app.devin.ai/attachments/ebdeca6f-f557-428d-8c5d-2ceb27d34770/ss_ad848ca4.png) |

![Oversize upload rejected](https://app.devin.ai/attachments/62dafb4b-7bab-4bda-9833-0a94a9ddbecd/ss_e557afb0.png)

### Risky areas
| Check | Result |
|---|---|
| Signed image route: fresh token → **200 image/jpeg**; tampered token → **404** "That image link has expired."; token reused after 70 s → **404** | passed |
| Refresh rotation: each refresh returns a new token; chained refreshes A→B→C all 200 | passed |
| Refresh reuse detection: replaying a consumed refresh token → **401**, and the whole family is revoked afterwards | passed |
| Browser session survives a hard reload (access token is memory-only) without re-login | passed |
| Photo replacement history renders the previous photo | passed |
| Nullable date clearing / COALESCE | **FAILED (BUG 3)** |
| Locked-field enforcement while open | passed (correctly 403s date edits) |

### Owner audit log
Every privileged action appears with actor + role, before/after values, timestamp and IP (`::1`): owner password changed, competition settings changed (with old `(empty)` → new ISO dates), category changed, house changed, website content changed (full old rules text → new text), admin account created, entry submitted, entry rejected (with reason), entry approved. — passed

![Owner audit log](https://app.devin.ai/attachments/f800a88c-2ce0-4911-92f2-3863931f357e/ss_2109c5f8.png)

Minor observation: the student's own photo replacement during resubmission does not produce a `submission.photo_replaced` audit row (only staff replacements appear to be logged).

---

## Environment notes / setup gotchas

- Postgres was not installed on the box; `sudo apt-get update && sudo apt-get install -y postgresql` then `sudo pg_ctlcluster 14 main start`.
- `backend/.env` must **omit** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` and `RESEND_API_KEY` entirely. Leaving them present-but-empty (as in `.env.example`) fails Zod validation with `Invalid url` / `String must contain at least 1 character(s)` and the server refuses to boot.
- Verification codes are printed in `/tmp/backend.log` as `DEV EMAIL (not delivered …)`.

## Deviations from a pure black-box run

- To reach the COALESCE code path for BUG 3 I moved `submission_opens_at` into the future with a direct SQL `UPDATE` (the only way to unlock, given BUG 2). It was restored afterwards. Everything else was exercised through the UI or the public API.
