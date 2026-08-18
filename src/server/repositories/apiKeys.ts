import { Pool, PoolClient } from "pg";
import { pool, withTransaction } from "../services/postgres.js";

type Queryable = Pool | PoolClient;

const KNOWN_COLUMNS = new Set(["id", "key_hash", "created_by", "revoked", "created_at"]);

function rowToApiKey(row: any): any {
  return {
    id: row.id,
    key_hash: row.key_hash,
    created_by: row.user_id || undefined,
    revoked: row.revoked,
    created_at: row.created_at,
    ...row.data,
  };
}

function apiKeyToRow(key: any) {
  const data: Record<string, any> = {};
  for (const k of Object.keys(key)) {
    if (!KNOWN_COLUMNS.has(k)) data[k] = key[k];
  }
  return {
    id: String(key.id),
    user_id: key.created_by ?? null,
    key_hash: key.key_hash,
    revoked: !!key.revoked,
    data,
  };
}

export async function getAllApiKeys(db: Queryable = pool): Promise<any[]> {
  const { rows } = await db.query("SELECT * FROM api_keys ORDER BY created_at ASC");
  return rows.map(rowToApiKey);
}

async function saveAllWith(client: PoolClient, keys: any[]): Promise<void> {
  const ids = keys.map((k) => String(k.id));
  if (ids.length > 0) {
    await client.query("DELETE FROM api_keys WHERE NOT (id = ANY($1::text[]))", [ids]);
  } else {
    await client.query("DELETE FROM api_keys");
  }
  for (const key of keys) {
    const row = apiKeyToRow(key);
    await client.query(
      `INSERT INTO api_keys (id, user_id, key_hash, revoked, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         key_hash = EXCLUDED.key_hash,
         revoked = EXCLUDED.revoked,
         data = EXCLUDED.data`,
      [row.id, row.user_id, row.key_hash, row.revoked, row.data]
    );
  }
}

export async function saveAllApiKeys(keys: any[], db?: PoolClient): Promise<void> {
  if (db) return saveAllWith(db, keys);
  return withTransaction((client) => saveAllWith(client, keys));
}
