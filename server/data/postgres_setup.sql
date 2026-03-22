-- Run these commands connected as a superuser (for example: postgres).

-- 1) Create application role (skip if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arb_app') THEN
    CREATE ROLE arb_app LOGIN PASSWORD 'arb_app_password';
  END IF;
END
$$;

-- 2) Create database (run this once; CREATE DATABASE cannot run inside a transaction block)
-- CREATE DATABASE anime_roommate_battle OWNER arb_app;

-- 3) Connect to the new database, then run below grants + schema.
-- \c anime_roommate_battle

GRANT ALL PRIVILEGES ON DATABASE anime_roommate_battle TO arb_app;

CREATE TABLE IF NOT EXISTS arb_characters (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS arb_matches (
  id BIGSERIAL PRIMARY KEY,
  mode TEXT NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  team_a_name TEXT NOT NULL,
  team_b_name TEXT NOT NULL,
  winner TEXT NOT NULL,
  score_a DOUBLE PRECISION NOT NULL,
  score_b DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS arb_matches_played_at_idx ON arb_matches (played_at DESC);
CREATE INDEX IF NOT EXISTS arb_matches_mode_played_at_idx ON arb_matches (mode, played_at DESC);
