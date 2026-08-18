import { Pool, PoolClient } from "pg";
import { pool, withTransaction } from "../services/postgres.js";

type Queryable = Pool | PoolClient;

const KNOWN_COLUMNS = new Set([
  "id", "name", "owner", "nodeId", "runtimeType", "containerId", "status", "suspended", "createdAt", "updatedAt",
]);

function rowToServer(row: any): any {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner_id || undefined,
    nodeId: row.node_id || undefined,
    runtimeType: row.runtime_type || undefined,
    containerId: row.container_id || undefined,
    status: row.status,
    suspended: row.suspended,
    createdAt: row.created_at,
    ...row.data,
  };
}

function serverToRow(server: any) {
  const data: Record<string, any> = {};
  for (const key of Object.keys(server)) {
    if (!KNOWN_COLUMNS.has(key)) data[key] = server[key];
  }
  return {
    id: String(server.id),
    name: server.name || "",
    owner_id: server.owner ?? null,
    node_id: server.nodeId ?? null,
    runtime_type: server.runtimeType ?? null,
    container_id: server.containerId ?? null,
    status: server.status || "stopped",
    suspended: !!server.suspended,
    data,
  };
}

export async function getAllServers(db: Queryable = pool): Promise<any[]> {
  const { rows } = await db.query("SELECT * FROM servers ORDER BY created_at ASC");
  return rows.map(rowToServer);
}

export async function getServerById(id: string, db: Queryable = pool): Promise<any | null> {
  const { rows } = await db.query("SELECT * FROM servers WHERE id = $1", [id]);
  return rows[0] ? rowToServer(rows[0]) : null;
}

async function saveAllWith(client: PoolClient, servers: any[]): Promise<void> {
  const ids = servers.map((s) => String(s.id));
  if (ids.length > 0) {
    await client.query("DELETE FROM servers WHERE NOT (id = ANY($1::text[]))", [ids]);
  } else {
    await client.query("DELETE FROM servers");
  }
  for (const server of servers) {
    const row = serverToRow(server);
    await client.query(
      `INSERT INTO servers (id, name, owner_id, node_id, runtime_type, container_id, status, suspended, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         owner_id = EXCLUDED.owner_id,
         node_id = EXCLUDED.node_id,
         runtime_type = EXCLUDED.runtime_type,
         container_id = EXCLUDED.container_id,
         status = EXCLUDED.status,
         suspended = EXCLUDED.suspended,
         data = EXCLUDED.data,
         updated_at = now()`,
      [row.id, row.name, row.owner_id, row.node_id, row.runtime_type, row.container_id, row.status, row.suspended, row.data]
    );
  }
}

/** Full-array replace, matching writeJSON("servers.json", array) semantics. */
export async function saveAllServers(servers: any[], db?: PoolClient): Promise<void> {
  if (db) return saveAllWith(db, servers);
  return withTransaction((client) => saveAllWith(client, servers));
}
