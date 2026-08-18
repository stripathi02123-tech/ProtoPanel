# ProtoPanel — P0 security pass

Scope: the roadmap's P0 list ("fix these first"), plus several more severe
issues found while auditing that weren't in the original doc. Full
Postgres migration is intentionally **not** included — the roadmap itself
places that in phase 0.10, and it needs a real database to build/test
against.

## Critical bugs found during the audit (not in the original roadmap doc)

- **`login()` dev-mode bypass** (`controllers/auth.ts`): the old condition
  `NODE_ENV !== "production" || PORT === "3000" || PORT !== "6767"` was
  true for almost any real deployment. Any POST to `/login` with an
  unrecognized username silently created a new account with that
  password, no verification — and granted **owner** role if it was the
  first user or named "admin". Fixed to require an explicit opt-in env
  var, off by default.
- **`googleLogin()` full auth bypass** (`controllers/auth.ts`): trusted
  client-submitted `email`/`googleId` with no signature check. Anyone
  could POST `{ email: "victim@gmail.com", googleId: "x" }` and be logged
  in as that user with no password. Now verifies a real Firebase ID
  token server-side (new `services/googleAuth.ts`, zero new
  dependencies — built-in `crypto`/`fetch` + existing `jsonwebtoken`).
  Frontend (`Login.tsx`) now sends the signed ID token instead of raw
  claims.
- **File manager path traversal via unvalidated `id`**: every file-manager
  route built its base directory from the raw URL `:id` with no
  validation. `id=".."` collapsed the "server directory" up to `.data/`
  itself, exposing `users.json`, `settings.json`, `api_keys.json` to the
  file manager. Combined with no ownership check on these routes, **any**
  logged-in user (even a fresh self-registered "user" role account)
  could read/write another user's server files or the panel's own user
  database.
- **`extract.ts` shell injection**: archive extraction shelled out via
  `exec()` using `JSON.stringify()` for "escaping" — that doesn't
  neutralize `$(...)` command substitution inside double quotes. A
  crafted uploaded filename could achieve arbitrary command execution on
  the host when a user clicked "unzip". Rewritten to `execFile` with argv
  arrays (no shell involved at all), plus a zip-slip guard added to the
  AdmZip fallback path.
- **GitHub webhook auth bypass** (`routes/api.ts`): `if (configuredSecret
  && secretHeader !== configuredSecret)` skipped the check entirely when
  `GITHUB_WEBHOOK_SECRET` wasn't set — the default for most installs,
  since `.env.example` never mentioned it. That left an unauthenticated
  public endpoint that ran `update.sh` for anyone. Now fails closed with
  a 503 if unconfigured, and uses `crypto.timingSafeEqual`.

## Roadmap P0 items addressed

1. **Remove default secrets** — `config/secrets.ts` is now the single
   source for `JWT_SECRET`; the app refuses to start without it instead
   of falling back to a hardcoded (public, in this source) string.
   `install.sh` already auto-generates one on install.
2. **Concurrent-write safety** — `services/db.ts` now serializes
   read/write per JSON file and writes atomically (temp file + rename),
   closing the "two requests corrupt the same file" risk. A full
   Postgres migration (real transactions, no more read-modify-write
   races at the call-site level) remains separate future work, matching
   the roadmap's own phase 0.10.
3. **Secure WebSockets** — `joinServer` now checks the connected user
   actually owns/has access to the server before joining its log room.
4. **Secure file manager** — new `utils/serverPath.ts`
   (`resolveServerPath` / `resolveBackupPath`) replaces 15+ ad hoc
   `path.join` + `startsWith` checks with one audited helper; every
   file-manager and backup handler now uses it. Also fixed: uploaded
   filenames (`multer`'s `originalname`, and explicit `fileName` fields)
   could themselves contain `../` and were joined in without checking —
   now stripped to a bare basename / validated before use.
5. **Audit shell commands** — Playit tunnel routes and archive extraction
   both moved from `exec()` with interpolated strings to `execFile` with
   argv arrays.
6. **Rate limiting** — new dependency-free `middleware/rateLimit.ts`
   (in-memory sliding window; no `npm install`/network needed to work)
   with different limits for auth, general API, file ops, console
   commands, and node check-ins, matching the roadmap's grouping.

## New/changed files

```
src/server/config/secrets.ts          (new)
src/server/services/googleAuth.ts     (new)
src/server/utils/authz.ts             (new)
src/server/utils/serverPath.ts        (new)
src/server/middleware/rateLimit.ts    (new)
src/server/middleware/auth.ts
src/server/controllers/auth.ts
src/server/controllers/servers.ts
src/server/routes/servers.ts
src/server/routes/api.ts
src/server/routes/system.ts
src/server/routes/auth.ts
src/server/routes/nodes.ts
src/server/services/db.ts
src/server/utils/extract.ts
src/pages/Login.tsx
server.ts
.env.example
```

## Before you deploy this

- `googleAuth.ts` needs `settings.firebaseProjectId` configured (same
  value already used to serve Firebase config to the frontend) — Google
  login will 500 with a clear error if it's missing rather than silently
  trusting the client, so this should be obvious immediately if unset.
- Set `GITHUB_WEBHOOK_SECRET` in `.env` if you use the GitHub
  auto-update webhook — it's now disabled until you do.
- Every file I touched passed a syntax-only TypeScript parse check
  (I don't have `node_modules` or a database in this sandbox, so I
  couldn't run the app live — please run your normal build/test/`npm
  install` before deploying).

## Known follow-ups (not fixed in this pass — scoped out deliberately)

- **Sub-user granular permissions** — the new authorization gate
  (`utils/authz.ts`) treats any listed sub-user as having full access to
  a server. Per-action permission scopes (console vs files vs backups)
  are the roadmap's own P3 item #14, not P0.
- **Full Postgres migration** — roadmap phase 0.10, needs a real DB to
  build against.
- Two static `exec("df -m ...")` calls in `routes/nodes.ts` are
  low-priority (no user input involved) — left as-is.
