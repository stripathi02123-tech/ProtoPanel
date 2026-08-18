// Safe path resolution for anything under .data/servers/<id>/.
//
// Every file-manager handler used to build its own path with
// `path.join(cwd, ".data", "servers", id, userSuppliedPath)` and guard it
// with `targetPath.startsWith(serverBaseDir)`. That has two problems:
//
// 1. `id` itself was never validated. Since Express route params can
//    contain anything (including "..", encoded), a request with
//    `id = ".."` collapses serverBaseDir up to `.data` itself — meaning
//    the "stay inside your own server" check was checking against the
//    wrong (much bigger) base directory, exposing users.json,
//    settings.json, api_keys.json, etc. to the file manager.
// 2. `startsWith(serverBaseDir)` is a naive string check with no
//    separator boundary, so a sibling directory like
//    ".data/servers/<id>-evil" would also incorrectly pass.
//
// getServerRootDir() closes #1 by validating `id` against a strict
// charset before it ever touches path.join, which makes traversal via
// the id structurally impossible. resolveServerPath() closes #2 by
// using path.relative() to check the real path relationship instead of
// a string prefix.

import path from "path";

const SERVERS_ROOT = path.resolve(process.cwd(), ".data", "servers");

// Server ids are crypto.randomUUID() in this codebase, but we allow a
// little more than strict UUID shape (underscores, mixed length) so we
// don't break any ids created a different way historically. The key
// property is what's excluded: no "/", no ".", no null bytes — nothing
// that path.join could interpret as a traversal segment.
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export class InvalidServerPathError extends Error {
  status: number;
  constructor(message: string) {
    super(message);
    this.name = "InvalidServerPathError";
    this.status = 403;
  }
}

export function isSafeServerId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id);
}

/** Root directory for a given server id. Throws if the id isn't safe. */
export function getServerRootDir(id: string): string {
  if (!isSafeServerId(id)) {
    throw new InvalidServerPathError("Invalid server id");
  }
  return path.join(SERVERS_ROOT, id);
}

/**
 * Resolves a user-supplied relative path against a server's root
 * directory. Guarantees the result is inside that directory — throws
 * InvalidServerPathError otherwise. Use this instead of hand-rolled
 * path.join + startsWith checks.
 */
export function resolveServerPath(id: string, relativePath: string | undefined | null = "/"): string {
  const root = getServerRootDir(id);
  const target = path.normalize(path.join(root, String(relativePath ?? "/")));
  const rel = path.relative(root, target);

  const escapes = rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (escapes) {
    throw new InvalidServerPathError("Path escapes server directory");
  }
  return target;
}

const BACKUPS_ROOT = path.resolve(process.cwd(), ".data", "backups");

/**
 * Same idea as resolveServerPath, for a single filename inside a
 * server's backups directory (.data/backups/<id>/<filename>). Backup
 * filenames are server-generated (`backup-<timestamp>.zip`), but the
 * route parameter is still client-supplied on download/delete, so it
 * gets the same treatment.
 */
export function resolveBackupPath(id: string, filename: string): string {
  if (!isSafeServerId(id)) {
    throw new InvalidServerPathError("Invalid server id");
  }
  const root = path.join(BACKUPS_ROOT, id);
  const target = path.normalize(path.join(root, String(filename ?? "")));
  const rel = path.relative(root, target);

  const escapes = rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || rel.includes(path.sep);
  if (escapes) {
    throw new InvalidServerPathError("Invalid backup filename");
  }
  return target;
}
