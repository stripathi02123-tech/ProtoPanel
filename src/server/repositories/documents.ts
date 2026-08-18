import { pool } from "../services/postgres.js";

export async function getDocument<T = any>(key: string): Promise<T | null> {
  const { rows } = await pool.query("SELECT value FROM documents WHERE key = $1", [key]);
  return rows[0] ? (rows[0].value as T) : null;
}

export async function setDocument(key: string, value: any): Promise<void> {
  await pool.query(
    `INSERT INTO documents (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}
