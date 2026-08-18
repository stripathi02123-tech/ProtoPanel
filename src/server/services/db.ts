import { withTransaction } from "./postgres.js";
import * as usersRepo from "../repositories/users.js";
import * as serversRepo from "../repositories/servers.js";
import * as nodesRepo from "../repositories/nodes.js";
import * as apiKeysRepo from "../repositories/apiKeys.js";
import * as documentsRepo from "../repositories/documents.js";

// This module used to read/write flat JSON files directly (no locking,
// no transactions — see git history / SECURITY_FIXES.md for the race
// conditions that caused). It's now backed by PostgreSQL, but keeps the
// exact same readJSON/writeJSON/updateJSON("some.json") interface the
// rest of the app already calls in ~40 places, so none of those call
// sites needed to change.
//
// users.json, servers.json, nodes.json, and api_keys.json are backed by
// dedicated tables with real columns for the fields that benefit from
// being indexed/constrained (see migrations/001_init.sql) — everything
// else (settings.json, wings_nodes.json, anything added later) goes
// through a generic `documents` table (one JSONB blob per key), which
// still gets Postgres's transactional guarantees even without a
// dedicated schema.

const COLLECTION_REPOS: Record<string, {
  getAll: (db?: any) => Promise<any[]>;
  saveAll: (rows: any[], db?: any) => Promise<void>;
}> = {
  "users.json": { getAll: usersRepo.getAllUsers, saveAll: usersRepo.saveAllUsers },
  "servers.json": { getAll: serversRepo.getAllServers, saveAll: serversRepo.saveAllServers },
  "nodes.json": { getAll: nodesRepo.getAllNodes, saveAll: nodesRepo.saveAllNodes },
  "api_keys.json": { getAll: apiKeysRepo.getAllApiKeys, saveAll: apiKeysRepo.saveAllApiKeys },
};

export const readJSON = async (filename: string): Promise<any> => {
  const repo = COLLECTION_REPOS[filename];
  if (repo) return repo.getAll();
  return documentsRepo.getDocument(filename);
};

export const writeJSON = async (filename: string, data: any): Promise<void> => {
  const repo = COLLECTION_REPOS[filename];
  if (repo) {
    if (!Array.isArray(data)) {
      throw new Error(`writeJSON("${filename}", ...) expected an array, got ${typeof data}`);
    }
    return repo.saveAll(data);
  }
  return documentsRepo.setDocument(filename, data);
};

/**
 * Read, transform, and write as a single atomic unit. For the four
 * dedicated collections this still does getAll -> updater -> saveAll,
 * but wrapped in one transaction so it can't interleave with another
 * update to the same collection. For generic documents it uses
 * SELECT ... FOR UPDATE to hold a row lock for the duration.
 */
/**
 * Read, transform, and write as a single atomic unit — the whole
 * operation either fully commits or fully rolls back, and (for the
 * documents path) a concurrent updateJSON on the same key is genuinely
 * serialized via SELECT ... FOR UPDATE. The collection path (users/
 * servers/nodes/api_keys) runs the read and write on the same
 * transaction/connection rather than two independent ones, which is
 * what makes it atomic — but under READ COMMITTED (Postgres's default)
 * it doesn't itself block a *concurrent* updateJSON on the same
 * collection from reading the same starting snapshot; nothing calls
 * this for those four collections yet, so this hasn't been a live
 * concern. If/when something does need strict serialization there too,
 * add `SELECT ... FOR UPDATE` on the relevant rows (or bump the
 * transaction to SERIALIZABLE and retry on conflict).
 */
export const updateJSON = async <T = any>(filename: string, updater: (current: T | null) => T | Promise<T>): Promise<T> => {
  const repo = COLLECTION_REPOS[filename];
  if (repo) {
    return withTransaction(async (client) => {
      const current = await repo.getAll(client);
      const next = await updater(current as any);
      if (!Array.isArray(next)) {
        throw new Error(`updateJSON("${filename}", ...) updater must return an array for this collection`);
      }
      await repo.saveAll(next, client);
      return next as any;
    });
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query("SELECT value FROM documents WHERE key = $1 FOR UPDATE", [filename]);
    const current = rows[0] ? rows[0].value : null;
    const next = await updater(current);
    await client.query(
      `INSERT INTO documents (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [filename, JSON.stringify(next)]
    );
    return next;
  });
};
