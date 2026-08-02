-- reset.sql
-- DESTRUCTIVE. Drops every object created by the migrations.
-- Development only.

BEGIN;

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS submission_photo_versions CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS competition_settings CASCADE;
DROP TABLE IF EXISTS site_content CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS houses CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

DROP TYPE IF EXISTS verification_purpose;
DROP TYPE IF EXISTS submission_status;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;

COMMIT;
