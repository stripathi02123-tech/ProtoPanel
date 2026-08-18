import { Pool, PoolClient } from "pg";
import { pool, withTransaction } from "../services/postgres.js";

type Queryable = Pool | PoolClient;

// The rest of the app was built around `readJSON("users.json")` /
// `writeJSON("users.json", array)` returning/accepting a full array of
// user objects shaped like:
//   { id, username, password, role, email, googleId, createdAt, ...anythingElse }
// getAllUsers/saveAllUsers preserve exactly that shape so controllers
// didn't need to change — only the storage backend did. Indexed columns
// (username, email, google_id, role) exist for constraints/lookups;
// everything else round-trips through the `data` jsonb column.
//
// Every function optionally accepts a `db` (a transaction client) so
// callers doing a read-modify-write (see updateJSON in services/db.ts)
// can run the whole thing inside one transaction instead of each call
// opening its own.

const KNOWN_COLUMNS = new Set(["id", "username", "password", "role", "email", "googleId", "createdAt", "updatedAt"]);

function rowToUser(row: any): any {
  return {
    id: row.id,
    username: row.username,
    password: row.password_hash,
    role: row.role,
    email: row.email || undefined,
    googleId: row.google_id || undefined,
    createdAt: row.created_at,
    ...row.data,
  };
}

function userToRow(user: any) {
  const data: Record<string, any> = {};
  for (const key of Object.keys(user)) {
    if (!KNOWN_COLUMNS.has(key)) data[key] = user[key];
  }
  return {
    id: String(user.id),
    username: user.username,
    password_hash: user.password ?? null,
    role: user.role || "user",
    email: user.email ?? null,
    google_id: user.googleId ?? null,
    data,
  };
}

export async function getAllUsers(db: Queryable = pool): Promise<any[]> {
  const { rows } = await db.query("SELECT * FROM users ORDER BY created_at ASC");
  return rows.map(rowToUser);
}

export async function getUserById(id: string, db: Queryable = pool): Promise<any | null> {
  const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByUsername(username: string, db: Queryable = pool): Promise<any | null> {
  const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

async function saveAllWith(client: PoolClient, users: any[]): Promise<void> {
  const ids = users.map((u) => String(u.id));
  if (ids.length > 0) {
    await client.query("DELETE FROM users WHERE NOT (id = ANY($1::text[]))", [ids]);
  } else {
    await client.query("DELETE FROM users");
  }
  for (const user of users) {
    const row = userToRow(user);
    await client.query(
      `INSERT INTO users (id, username, email, password_hash, role, google_id, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         google_id = EXCLUDED.google_id,
         data = EXCLUDED.data,
         updated_at = now()`,
      [row.id, row.username, row.email, row.password_hash, row.role, row.google_id, row.data]
    );
  }
}

/**
 * Full-array replace, matching writeJSON("users.json", array) semantics
 * (including deletions). Pass `db` when this needs to run inside an
 * already-open transaction; otherwise it opens its own.
 */
export async function saveAllUsers(users: any[], db?: PoolClient): Promise<void> {
  if (db) return saveAllWith(db, users);
  return withTransaction((client) => saveAllWith(client, users));
}
