-- Initial relational schema. Core, frequently-queried fields get real
-- columns (with constraints/FKs); everything else stays in a `data`
-- jsonb column rather than being fully normalized right now — this is
-- the pragmatic middle ground between "flat JSON files" and "fully
-- normalized schema for every nested field", and it's easy to promote a
-- field out of `data` into its own column later without touching every
-- call site.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  google_id     TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  ip            TEXT,
  port          INTEGER,
  status        TEXT NOT NULL DEFAULT 'offline',
  node_key      TEXT,
  last_checkin  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS servers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_id      TEXT,
  node_id       TEXT,
  runtime_type  TEXT,
  container_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'stopped',
  suspended     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_node_id ON servers(node_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  key_hash      TEXT NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Generic document store for collections not yet promoted to their own
-- table (settings.json, wings_nodes.json, and anything added later).
-- This is what readJSON/writeJSON/updateJSON in services/db.ts now read
-- and write, so most call sites for those files didn't need to change.
CREATE TABLE IF NOT EXISTS documents (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
