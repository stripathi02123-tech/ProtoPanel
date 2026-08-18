// Run once when upgrading an existing install from flat-file storage to
// PostgreSQL:
//   npx tsx scripts/migrate-json-to-postgres.ts
//
// Reads .data/*.json (the old storage) and imports it into the tables
// created by migrations/001_init.sql. Safe to re-run — it's an upsert,
// not an append, and skips files that don't exist. Does NOT delete the
// old .data/*.json files; move them aside yourself once you've verified
// the import (e.g. `mv .data .data.pre-postgres-backup`).

import "dotenv/config";
import fs from "fs-extra";
import path from "path";
import { runMigrations, closePool } from "../src/server/services/postgres.js";
import { saveAllUsers } from "../src/server/repositories/users.js";
import { saveAllServers } from "../src/server/repositories/servers.js";
import { saveAllNodes } from "../src/server/repositories/nodes.js";
import { saveAllApiKeys } from "../src/server/repositories/apiKeys.js";
import { setDocument } from "../src/server/repositories/documents.js";

const DATA_DIR = path.join(process.cwd(), ".data");

async function readJsonIfExists(filename: string): Promise<any | null> {
  const filePath = path.join(DATA_DIR, filename);
  if (!(await fs.pathExists(filePath))) return null;
  try {
    return await fs.readJson(filePath);
  } catch (err) {
    console.error(`  ! Failed to parse ${filename}, skipping:`, (err as Error).message);
    return null;
  }
}

async function main() {
  console.log("Running schema migrations...");
  await runMigrations();

  console.log(`\nImporting from ${DATA_DIR} ...`);

  // Import order matters for referential sanity even without hard FKs:
  // users and nodes first, so servers' owner/nodeId make sense once you
  // do query against them later.
  const users = await readJsonIfExists("users.json");
  if (Array.isArray(users)) {
    await saveAllUsers(users);
    console.log(`  users.json      -> ${users.length} row(s)`);
  } else {
    console.log("  users.json      -> not found, skipped");
  }

  const nodes = await readJsonIfExists("nodes.json");
  if (Array.isArray(nodes)) {
    await saveAllNodes(nodes);
    console.log(`  nodes.json      -> ${nodes.length} row(s)`);
  } else {
    console.log("  nodes.json      -> not found, skipped");
  }

  const servers = await readJsonIfExists("servers.json");
  if (Array.isArray(servers)) {
    await saveAllServers(servers);
    console.log(`  servers.json    -> ${servers.length} row(s)`);
  } else {
    console.log("  servers.json    -> not found, skipped");
  }

  const apiKeys = await readJsonIfExists("api_keys.json");
  if (Array.isArray(apiKeys)) {
    await saveAllApiKeys(apiKeys);
    console.log(`  api_keys.json   -> ${apiKeys.length} row(s)`);
  } else {
    console.log("  api_keys.json   -> not found, skipped");
  }

  // Everything else in .data/*.json that isn't one of the four
  // dedicated collections above goes into the generic documents table
  // verbatim (settings.json, wings_nodes.json, and anything custom).
  const promoted = new Set(["users.json", "nodes.json", "servers.json", "api_keys.json"]);
  if (await fs.pathExists(DATA_DIR)) {
    const entries = await fs.readdir(DATA_DIR);
    for (const entry of entries) {
      if (!entry.endsWith(".json") || promoted.has(entry)) continue;
      const value = await readJsonIfExists(entry);
      if (value === null) continue;
      await setDocument(entry, value);
      console.log(`  ${entry.padEnd(15)} -> stored as document`);
    }
  }

  console.log("\nDone. Verify the data looks right, then set DATABASE_URL as the");
  console.log("permanent source of truth. The .data/*.json files are left in");
  console.log("place — move them aside once you've confirmed the import.");

  await closePool();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
