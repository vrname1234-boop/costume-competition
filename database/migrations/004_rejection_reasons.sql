-- 004_rejection_reasons.sql
-- Two-part rejections.
--
-- A rejection now carries a free-text message the student reads, plus a staff
-- only reason code. Serious codes lock the entry: the student cannot resubmit
-- until a teacher unlocks it in person, which keeps a deliberately offensive
-- entry from simply being re-uploaded.
--
-- Run after 001-003.

BEGIN;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS rejection_code text,
  ADD COLUMN IF NOT EXISTS internal_note  text,
  ADD COLUMN IF NOT EXISTS locked         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS unlocked_by    uuid REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN submissions.rejection_code IS
  'Staff-only reason code. Never sent to the student.';
COMMENT ON COLUMN submissions.internal_note IS
  'Staff-only note about the rejection. Never sent to the student.';
COMMENT ON COLUMN submissions.locked IS
  'True when a serious rejection blocks the student from resubmitting.';

CREATE INDEX IF NOT EXISTS submissions_locked_idx ON submissions (locked) WHERE locked;

-- What a locked-out student is told to do. Owner-editable like the rest of the
-- public copy, because the right person to see differs by school.
INSERT INTO site_content (key, value)
VALUES (
  'locked_entry_message',
  to_jsonb(
    'Your entry has been referred to staff and cannot be resubmitted online. Speak to your year adviser or the teacher running the competition. They can unlock your entry once you have spoken with them.'::text
  )
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
