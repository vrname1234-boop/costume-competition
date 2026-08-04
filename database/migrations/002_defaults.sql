-- 002_defaults.sql
-- Default editable content and the single competition settings row.
-- Safe to re-run.

BEGIN;

INSERT INTO competition_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

INSERT INTO site_content (key, value) VALUES
  ('competition_title',  '"School Costume Competition"'::jsonb),
  ('homepage_intro',     '"Submit your costume photo online before the event. Entries are reviewed by staff."'::jsonb),
  ('description',        '"This year''s costume competition is open to all students. Read the rules and dress code below, then sign in with your school account to submit your entry."'::jsonb),
  ('rules',              '"Wear a costume that follows school rules.\nSubmit a clear full-body photo.\nMake sure the whole costume is visible.\nUpload your photo before the deadline.\nSubmit only your own costume."'::jsonb),
  ('dress_code',         '"Costumes must be appropriate for school. No masks that fully cover the face, no realistic weapons or props, no offensive imagery or slogans, and footwear must be safe for a normal school day."'::jsonb),
  ('instructions',       '"1. Create an account with your school email address.\n2. Enter the six digit code sent to your inbox.\n3. Choose a password.\n4. Upload a full-body photo of your costume and fill in your details.\n5. Check your dashboard for the review outcome."'::jsonb),
  ('photo_requirements', '"Full-body photo showing the entire costume.\nGood lighting, in focus, taken against a plain background where possible.\nOnly the student entering the competition should appear in the photo.\nJPG, PNG or WEBP, up to 10MB."'::jsonb),
  ('announcement',       '""'::jsonb),
  ('maintenance_mode',   'false'::jsonb),
  ('maintenance_message','"The site is temporarily unavailable while we make updates. Please check back soon."'::jsonb),
  ('contact_note',       '"If you have a problem with your submission, speak to your roll call teacher."'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
