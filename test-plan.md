# Costume Competition — E2E test plan

Env (done): Postgres 14 local db `costume`, migrations 001+002 applied, backend :4000 (`/tmp/backend.log`),
frontend :5173, owner seeded (username `owner`, temp password captured), local-disk storage fallback.

## A. Owner golden path (browser, recorded)
1. Sign in as `owner` with temp password → expect forced redirect to `/change-password`; set new password;
   expect landing on owner console (not an error).
2. `/owner/competition`: add category "Best Group Costume" and house "Test House"; set submissions open
   = yesterday, close = +7 days, submissions_enabled on; Save. Pass: green "Competition settings saved."
   banner AND after reload the dates/lists persist; category+house appear in student form dropdowns later.
   Adversarial: after opening, re-open page — expect the "locked fields" warning; then try changing the
   close date and confirm the server's 403 message is surfaced (evidence for COALESCE/lock behaviour).
3. `/owner/content`: change `rules` text to a unique string "RULES-CHECK-<n>"; Save; open `/` in the same
   browser → the exact string must be visible on the homepage.
4. `/owner/admins`: create teacher `teacher1` → a one-time temporary password must be displayed once.

## B. Student golden path (browser, recorded)
5. `/register` with `student.test@education.nsw.gov.au`; read 6-digit code from `/tmp/backend.log`;
   verify + set password. Pass: signed in and redirected to `/dashboard`.
6. Reject check first: register with `someone@gmail.com` → inline error mentioning
   "@education.nsw.gov.au"; no code appears in backend log for that address.
7. `/submit`: fill full name, Year 9, class 9A, category from step 2, house from step 2, costume name +
   description, upload a real 800x600 JPG generated on disk, tick all four boxes, submit.
   Pass: dashboard shows status "pending" AND the photo actually renders (screenshot must show pixels,
   and the request to `/api/images/<token>` returns 200 image/jpeg).
8. Upload rejection: replace-photo with a .txt renamed `fake.jpg` → expect visible error naming allowed
   types, HTTP 400, no DB/state change (status stays as before).

## C. Admin golden path (browser, recorded)
9. Sign in as `teacher1` with temp password → forced `/change-password`; set new password.
10. `/staff` → open the entry → Reject with reason "Photo is too dark, please retake." Pass: staff list
    shows rejected; student tab (re-sign-in as student) shows the exact reason text.
11. Student edits (changes costume name) and resubmits → status returns to pending; staff sees new name.
12. Admin approves → student dashboard shows approved.
13. Click CSV export → downloaded file contains a row with the student's email and costume name.

## D. Security probes (curl, tokens obtained via /api/auth/login as the respective users)
For each: record exact status + body.
- Student token → GET /api/admin/submissions, GET /api/owner/stats, POST /api/owner/admins → all 403.
- Admin (teacher) token → GET /api/owner/stats, POST /api/owner/admins → 403.
- No token → GET /api/me/submission, /api/admin/submissions, /api/owner/stats → 401.
- Student browser navigation to `/staff` and `/owner` → must not render staff/owner data.
- Second POST /api/me/submission as the same student → 409 "already have an entry".
- Oversize upload (30MB JPG) → 413/400, never 500.
- Owner pauses submissions (submissions_enabled=false) → student PATCH /api/me/submission and
  POST /api/me/submission must be 403 with "paused" message even though it is a direct API call.

## E. Risky areas
- Competition-settings PUT: send `submission_closes_at: null` explicitly → observe whether the date is
  actually cleared or silently kept (COALESCE suspicion, owner.ts:420-451). Report actual behaviour.
- Signed image route: reuse a photo token after ~70s → expect 404 "expired"; tamper one char → 404.
- Refresh rotation: in the student browser tab, reload the page (access token is memory-only) → session
  must survive via refresh token; then reuse an old refresh token via curl → must fail.
- Photo history: student replaces photo → admin detail page shows a "previous photo" entry that renders.
