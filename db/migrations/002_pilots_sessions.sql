-- citext gives case-insensitive unique email addresses without functional indexes.
CREATE EXTENSION IF NOT EXISTS citext;

-- Standard updated-at trigger, used by every table carrying the standard
-- columns convention (uuid pk, created_at, updated_at).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pilots: the pilot-owned-account table. Email is a unique, case-insensitive
-- citext; password_hash holds the memory-hard verifier (never the plaintext).
CREATE TABLE pilots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'es',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER pilots_set_updated_at
  BEFORE UPDATE ON pilots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Server-side sessions referenced by an opaque cookie. The cookie value's hash
-- is stored here, never the raw session identifier.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_pilot_id_idx ON sessions (pilot_id);
CREATE INDEX sessions_token_hash_idx ON sessions (token_hash);