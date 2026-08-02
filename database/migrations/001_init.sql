-- 001_init.sql
-- School Costume Competition Platform - initial schema
-- Target: PostgreSQL 14+ (Supabase)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role         AS ENUM ('student', 'admin', 'owner');
CREATE TYPE user_status       AS ENUM ('pending', 'active', 'disabled');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE verification_purpose AS ENUM ('register', 'reset');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                 user_role   NOT NULL,
  status               user_status NOT NULL DEFAULT 'pending',
  email                citext,
  username             citext,
  password_hash        text,
  must_change_password boolean     NOT NULL DEFAULT false,
  display_name         text        NOT NULL,
  failed_login_count   integer     NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Students authenticate with a school email, staff with a username.
  CONSTRAINT users_identity_matches_role CHECK (
    (role = 'student' AND email IS NOT NULL AND username IS NULL)
    OR (role <> 'student' AND username IS NOT NULL AND email IS NULL)
  ),
  -- Defence in depth: the application checks this too.
  CONSTRAINT users_student_email_domain CHECK (
    email IS NULL OR email ~* '^[a-z0-9._%+-]+@education\.nsw\.gov\.au$'
  )
);

CREATE UNIQUE INDEX users_email_key    ON users (email)    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_username_key ON users (username) WHERE deleted_at IS NULL;
-- There can only ever be one Owner.
CREATE UNIQUE INDEX users_single_owner ON users ((role)) WHERE role = 'owner' AND deleted_at IS NULL;
CREATE INDEX users_role_idx ON users (role) WHERE deleted_at IS NULL;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- email_verifications  (6-digit codes for registration and password reset)
-- Codes are stored hashed; the plaintext only ever exists in the email.
-- ---------------------------------------------------------------------------

CREATE TABLE email_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext      NOT NULL,
  code_hash   text        NOT NULL,
  purpose     verification_purpose NOT NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_verifications_lookup_idx
  ON email_verifications (email, purpose, consumed_at, expires_at DESC);

-- ---------------------------------------------------------------------------
-- refresh_tokens  (rotating, with reuse detection per family)
-- ---------------------------------------------------------------------------

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  user_agent  text,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx   ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ---------------------------------------------------------------------------
-- Owner-managed reference data: houses and categories
-- ---------------------------------------------------------------------------

CREATE TABLE houses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX houses_name_key ON houses (lower(name));
CREATE TRIGGER houses_set_updated_at BEFORE UPDATE ON houses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_key ON categories (lower(name));
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- submissions  (exactly one per student)
-- ---------------------------------------------------------------------------

CREATE TABLE submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  full_name           text NOT NULL,
  year_grade          text NOT NULL,
  class_roll_group    text NOT NULL,
  house_id            uuid REFERENCES houses (id) ON DELETE SET NULL,
  category_id         uuid REFERENCES categories (id) ON DELETE SET NULL,
  costume_name        text NOT NULL,
  costume_description text NOT NULL,
  status              submission_status NOT NULL DEFAULT 'pending',
  review_note         text,
  reviewed_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  image_path          text NOT NULL,
  image_mime          text NOT NULL,
  image_bytes         integer NOT NULL,
  image_width         integer NOT NULL,
  image_height        integer NOT NULL,
  image_sha256        text NOT NULL,
  rules_accepted_at   timestamptz NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submissions_status_idx      ON submissions (status);
CREATE INDEX submissions_year_idx        ON submissions (year_grade);
CREATE INDEX submissions_submitted_idx   ON submissions (submitted_at DESC);
CREATE INDEX submissions_search_idx      ON submissions
  USING gin ((full_name || ' ' || costume_name || ' ' || class_roll_group) gin_trgm_ops);

CREATE TRIGGER submissions_set_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every replaced photo is retained so a mistake can be undone.
CREATE TABLE submission_photo_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  image_path    text NOT NULL,
  image_mime    text NOT NULL,
  image_bytes   integer NOT NULL,
  replaced_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  replaced_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submission_photo_versions_submission_idx
  ON submission_photo_versions (submission_id, replaced_at DESC);

-- ---------------------------------------------------------------------------
-- site_content  (Owner-editable copy, key/value)
-- ---------------------------------------------------------------------------

CREATE TABLE site_content (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- competition_settings  (single row, enforced)
-- ---------------------------------------------------------------------------

CREATE TABLE competition_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  competition_name    text NOT NULL DEFAULT 'School Costume Competition',
  submission_opens_at timestamptz,
  submission_closes_at timestamptz,
  timezone            text NOT NULL DEFAULT 'Australia/Sydney',
  submissions_enabled boolean NOT NULL DEFAULT true,
  number_of_winners   integer NOT NULL DEFAULT 0,
  prize_info          text NOT NULL DEFAULT '',
  judging_method      text NOT NULL DEFAULT '',
  requirements        text NOT NULL DEFAULT '',
  max_file_size_mb    integer NOT NULL DEFAULT 10 CHECK (max_file_size_mb BETWEEN 1 AND 25),
  allowed_file_types  text[] NOT NULL DEFAULT ARRAY['image/jpeg', 'image/png', 'image/webp'],
  locked              boolean NOT NULL DEFAULT false,
  updated_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- audit_logs  (append only - see 002_grants.sql)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_label text NOT NULL,
  actor_role  user_role,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx   ON audit_logs (actor_id);
CREATE INDEX audit_logs_action_idx  ON audit_logs (action);

-- ---------------------------------------------------------------------------
-- rate_limits  (persistent, survives backend restarts on Render free tier)
-- ---------------------------------------------------------------------------

CREATE TABLE rate_limits (
  bucket     text PRIMARY KEY,
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX rate_limits_expiry_idx ON rate_limits (expires_at);

COMMIT;
