import { Pool, PoolClient } from "pg";
import { pool, withTransaction } from "../services/postgres.js";

type Queryable = Pool | PoolClient;

const KNOWN_COLUMNS = new Set(["id", "name", "ip", "port", "status", "key", "lastCheckin", "createdAt", "updatedAt"]);

function rowToNode(row: any): any {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip || undefined,
    port: row.port ?? undefined,
    status: row.status,
    key: row.node_key || undefined,
    lastCheckin: row.last_checkin || undefined,
    createdAt: row.created_at,
    ...row.data,
  };
}

function nodeToRow(node: any) {
  const data: Record<string, any> = {};
  for (const key of Object.keys(node)) {
    if (!KNOWN_COLUMNS.has(key)) data[key] = node[key];
  }
  return {
    id: String(node.id),
    name: node.name || "",
    ip: node.ip ?? null,
    port: node.port ?? null,
    status: node.status || "offline",
    node_key: node.key ?? null,
    last_checkin: node.lastCheckin ?? null,
    data,
  };
}

export async function getAllNodes(db: Queryable = pool): Promise<any[]> {
  const { rows } = await db.query("SELECT * FROM nodes ORDER BY created_at ASC");
  return rows.map(rowToNode);
}

async function saveAllWith(client: PoolClient, nodes: any[]): Promise<void> {
  const ids = nodes.map((n) => String(n.id));
  if (ids.length > 0) {
    await client.query("DELETE FROM nodes WHERE NOT (id = ANY($1::text[]))", [ids]);
  } else {
    await client.query("DELETE FROM nodes");
  }
  for (const node of nodes) {
    const row = nodeToRow(node);
    await client.query(
      `INSERT INTO nodes (id, name, ip, port, status, node_key, last_checkin, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         ip = EXCLUDED.ip,
         port = EXCLUDED.port,
         status = EXCLUDED.status,
         node_key = EXCLUDED.node_key,
         last_checkin = EXCLUDED.last_checkin,
         data = EXCLUDED.data,
         updated_at = now()`,
      [row.id, row.name, row.ip, row.port, row.status, row.node_key, row.last_checkin, row.data]
    );
  }
}

export async function saveAllNodes(nodes: any[], db?: PoolClient): Promise<void> {
  if (db) return saveAllWith(db, nodes);
  return withTransaction((client) => saveAllWith(client, nodes));
}
