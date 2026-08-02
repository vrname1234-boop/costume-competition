-- 003_app_role.sql
-- Creates a restricted database role for the API.
--
-- The point: audit_logs is append-only. The API role is granted INSERT and
-- SELECT on it and nothing else, so even a fully compromised backend cannot
-- rewrite or erase history.
--
-- Run this AFTER 001 and 002, as a superuser / the Supabase `postgres` role.
-- Replace the password before running, then use this role in DATABASE_URL.

\set app_password 'CHANGE_ME_BEFORE_RUNNING'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costume_app') THEN
    CREATE ROLE costume_app LOGIN;
  END IF;
END
$$;

ALTER ROLE costume_app WITH PASSWORD :'app_password';

GRANT USAGE ON SCHEMA public TO costume_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  email_verifications,
  refresh_tokens,
  houses,
  categories,
  submissions,
  submission_photo_versions,
  site_content,
  competition_settings,
  rate_limits
TO costume_app;

-- Append only. No UPDATE, no DELETE, no TRUNCATE.
GRANT SELECT, INSERT ON audit_logs TO costume_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM costume_app;
