import { Pool, PoolClient } from "pg";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // eslint-disable-next-line no-console
    console.error(
      "\n[FATAL] DATABASE_URL is not set.\n" +
      "Proto Panel requires PostgreSQL as of this version. Set DATABASE_URL\n" +
      "in your .env, e.g.\n" +
      "  DATABASE_URL=postgresql://protopanel:password@localhost:5432/protopanel\n"
    );
    process.exit(1);
  }
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: parseInt(process.env.DATABASE_POOL_SIZE || "10", 10),
  });
}

export const pool = buildPool();

pool.on("error", (err) => {
  // Errors on idle clients (e.g. connection dropped) shouldn't crash the
  // process — the pool will create a new client on next use.
  console.error("[postgres] unexpected error on idle client", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

/** Runs `fn` inside a transaction, committing on success and rolling back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Minimal, dependency-free migration runner: applies every .sql file in
 * ./migrations, in filename order, that isn't already recorded in
 * schema_migrations. Each file runs inside its own transaction.
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = path.join(__dirname, "..", "..", "..", "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await pool.query<{ id: string }>("SELECT id FROM schema_migrations");
  const appliedIds = new Set(applied.map((r) => r.id));

  for (const file of files) {
    if (appliedIds.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
    });
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
