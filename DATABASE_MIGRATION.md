# PostgreSQL migration

`services/db.ts` no longer touches the filesystem. `readJSON`/`writeJSON`/
`updateJSON("some.json")` keep the exact same call signature the rest of
the app already used in ~80 places, but are now backed by PostgreSQL —
so almost no call sites needed to change.

## What's real vs. what's a JSON blob

- **users, servers, nodes, api_keys** — dedicated tables
  (`migrations/001_init.sql`) with real columns for the fields worth
  indexing/constraining (username, owner, node_id, status, etc.), plus a
  `data jsonb` column for everything else. Writes go through
  `repositories/{users,servers,nodes,apiKeys}.ts`, each wrapped in a
  transaction — a "write the whole array" call either fully commits or
  fully rolls back, and a `saveAll` that omits a previously-present id
  deletes it (matching the old `writeJSON` overwrite semantics).
- **settings.json, wings_nodes.json, anything else** — a generic
  `documents` table (one JSONB blob per key). Still gets real
  transactions and `SELECT ... FOR UPDATE` locking via `updateJSON`,
  just no dedicated schema.

`node_id` and `owner_id` are plain indexed text columns, **not** foreign
keys — `nodeId: "local"` is a sentinel for "no remote node" rather than
a real `nodes` row, and I couldn't verify live that every historical
`owner` value points at an extant user (bootstrap flows, deleted users).
A hard FK I can't test against felt riskier than losing referential
integrity on those two columns for now.

## Upgrading an existing install

```
# 1. stand up Postgres, then in .env:
DATABASE_URL=postgresql://protopanel:password@localhost:5432/protopanel

# 2. one-time import of your existing .data/*.json into Postgres
#    (creates the schema too; safe to re-run)
npm run migrate:postgres

# 3. verify the data, then move the old files aside
mv .data .data.pre-postgres-backup
```

Fresh installs don't need step 2 — `npm start` runs pending migrations
automatically before accepting requests (see `runMigrations()` in
`server.ts`).

`scripts/createuser.ts` (the primary-owner bootstrap script) was reading
and writing `.data/users.json` directly, completely bypassing
`services/db.ts` — meaning it would've kept editing a file the app no
longer reads once this shipped. Rewired to go through the same
`repositories/users.ts` as everything else.

## Known limitations of this pass

- Every call site still does "load the full collection, filter/mutate
  in JS, write the whole thing back" — same pattern as the JSON-file
  version, just against Postgres now. None of the ~80 call sites were
  rewritten to use targeted `WHERE` queries. That's a real, valuable
  follow-up (especially for `servers.json` as the number of servers
  grows) but is a much larger, higher-risk change to make without being
  able to run this live — the win here is the storage layer itself
  (real transactions, no more file corruption, indexed columns
  available for future targeted queries), not query efficiency yet.
- `updateJSON` on the four dedicated collections is atomic (commits or
  rolls back as a unit, read and write share one connection) but isn't
  serialized against a *concurrent* `updateJSON` call on the same
  collection under Postgres's default READ COMMITTED isolation — see
  the comment above it in `db.ts`. Nothing calls `updateJSON` for those
  four yet, so this hasn't been a live concern; the documents-table path
  (used by anything not yet promoted to its own table) already uses
  `SELECT ... FOR UPDATE` and is fully serialized.
- Backup *files* still live on local disk (`.data/backups/`), not object
  storage (S3/R2/MinIO) — that's the roadmap's separate P4 item, not
  part of "the database."
- I don't have a live Postgres instance or network access in this
  sandbox, so none of this has run against a real database. Every file
  passed a syntax-only TypeScript parse check, and I traced the
  transaction/connection flow by hand, but please run
  `npm run migrate:postgres` against a real dev database and exercise
  login/server-create/server-delete before trusting this in production.
