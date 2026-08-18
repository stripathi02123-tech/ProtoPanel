"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/events.ts
var events_exports = {};
__export(events_exports, {
  panelEvents: () => panelEvents
});
var import_events, panelEvents;
var init_events = __esm({
  "src/server/events.ts"() {
    "use strict";
    import_events = require("events");
    panelEvents = new import_events.EventEmitter();
  }
});

// src/server/services/postgres.ts
var postgres_exports = {};
__export(postgres_exports, {
  closePool: () => closePool,
  pool: () => pool,
  query: () => query,
  runMigrations: () => runMigrations,
  withTransaction: () => withTransaction
});
function buildPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "\n[FATAL] DATABASE_URL is not set.\nProto Panel requires PostgreSQL as of this version. Set DATABASE_URL\nin your .env, e.g.\n  DATABASE_URL=postgresql://protopanel:password@localhost:5432/protopanel\n"
    );
    process.exit(1);
  }
  return new import_pg.Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : void 0,
    max: parseInt(process.env.DATABASE_POOL_SIZE || "10", 10)
  });
}
async function query(text, params) {
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw err;
  } finally {
    client.release();
  }
}
async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const migrationsDir = import_path.default.join(__dirname, "..", "..", "..", "migrations");
  const files = (await import_fs_extra.default.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows: applied } = await pool.query("SELECT id FROM schema_migrations");
  const appliedIds = new Set(applied.map((r) => r.id));
  for (const file of files) {
    if (appliedIds.has(file)) continue;
    const sql = await import_fs_extra.default.readFile(import_path.default.join(migrationsDir, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
    });
  }
}
async function closePool() {
  await pool.end();
}
var import_pg, import_fs_extra, import_path, import_url, import_meta, __dirname, pool;
var init_postgres = __esm({
  "src/server/services/postgres.ts"() {
    "use strict";
    import_pg = require("pg");
    import_fs_extra = __toESM(require("fs-extra"), 1);
    import_path = __toESM(require("path"), 1);
    import_url = require("url");
    import_meta = {};
    __dirname = import_path.default.dirname((0, import_url.fileURLToPath)(import_meta.url));
    pool = buildPool();
    pool.on("error", (err) => {
      console.error("[postgres] unexpected error on idle client", err);
    });
  }
});

// src/server/repositories/users.ts
function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    password: row.password_hash,
    role: row.role,
    email: row.email || void 0,
    googleId: row.google_id || void 0,
    createdAt: row.created_at,
    ...row.data
  };
}
function userToRow(user) {
  const data = {};
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
    data
  };
}
async function getAllUsers(db = pool) {
  const { rows } = await db.query("SELECT * FROM users ORDER BY created_at ASC");
  return rows.map(rowToUser);
}
async function saveAllWith(client, users) {
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
async function saveAllUsers(users, db) {
  if (db) return saveAllWith(db, users);
  return withTransaction((client) => saveAllWith(client, users));
}
var KNOWN_COLUMNS;
var init_users = __esm({
  "src/server/repositories/users.ts"() {
    "use strict";
    init_postgres();
    KNOWN_COLUMNS = /* @__PURE__ */ new Set(["id", "username", "password", "role", "email", "googleId", "createdAt", "updatedAt"]);
  }
});

// src/server/repositories/servers.ts
function rowToServer(row) {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner_id || void 0,
    nodeId: row.node_id || void 0,
    runtimeType: row.runtime_type || void 0,
    containerId: row.container_id || void 0,
    status: row.status,
    suspended: row.suspended,
    createdAt: row.created_at,
    ...row.data
  };
}
function serverToRow(server) {
  const data = {};
  for (const key of Object.keys(server)) {
    if (!KNOWN_COLUMNS2.has(key)) data[key] = server[key];
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
    data
  };
}
async function getAllServers(db = pool) {
  const { rows } = await db.query("SELECT * FROM servers ORDER BY created_at ASC");
  return rows.map(rowToServer);
}
async function saveAllWith2(client, servers) {
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
async function saveAllServers(servers, db) {
  if (db) return saveAllWith2(db, servers);
  return withTransaction((client) => saveAllWith2(client, servers));
}
var KNOWN_COLUMNS2;
var init_servers = __esm({
  "src/server/repositories/servers.ts"() {
    "use strict";
    init_postgres();
    KNOWN_COLUMNS2 = /* @__PURE__ */ new Set([
      "id",
      "name",
      "owner",
      "nodeId",
      "runtimeType",
      "containerId",
      "status",
      "suspended",
      "createdAt",
      "updatedAt"
    ]);
  }
});

// src/server/repositories/nodes.ts
function rowToNode(row) {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip || void 0,
    port: row.port ?? void 0,
    status: row.status,
    key: row.node_key || void 0,
    lastCheckin: row.last_checkin || void 0,
    createdAt: row.created_at,
    ...row.data
  };
}
function nodeToRow(node) {
  const data = {};
  for (const key of Object.keys(node)) {
    if (!KNOWN_COLUMNS3.has(key)) data[key] = node[key];
  }
  return {
    id: String(node.id),
    name: node.name || "",
    ip: node.ip ?? null,
    port: node.port ?? null,
    status: node.status || "offline",
    node_key: node.key ?? null,
    last_checkin: node.lastCheckin ?? null,
    data
  };
}
async function getAllNodes(db = pool) {
  const { rows } = await db.query("SELECT * FROM nodes ORDER BY created_at ASC");
  return rows.map(rowToNode);
}
async function saveAllWith3(client, nodes) {
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
async function saveAllNodes(nodes, db) {
  if (db) return saveAllWith3(db, nodes);
  return withTransaction((client) => saveAllWith3(client, nodes));
}
var KNOWN_COLUMNS3;
var init_nodes = __esm({
  "src/server/repositories/nodes.ts"() {
    "use strict";
    init_postgres();
    KNOWN_COLUMNS3 = /* @__PURE__ */ new Set(["id", "name", "ip", "port", "status", "key", "lastCheckin", "createdAt", "updatedAt"]);
  }
});

// src/server/repositories/apiKeys.ts
function rowToApiKey(row) {
  return {
    id: row.id,
    key_hash: row.key_hash,
    created_by: row.user_id || void 0,
    revoked: row.revoked,
    created_at: row.created_at,
    ...row.data
  };
}
function apiKeyToRow(key) {
  const data = {};
  for (const k of Object.keys(key)) {
    if (!KNOWN_COLUMNS4.has(k)) data[k] = key[k];
  }
  return {
    id: String(key.id),
    user_id: key.created_by ?? null,
    key_hash: key.key_hash,
    revoked: !!key.revoked,
    data
  };
}
async function getAllApiKeys(db = pool) {
  const { rows } = await db.query("SELECT * FROM api_keys ORDER BY created_at ASC");
  return rows.map(rowToApiKey);
}
async function saveAllWith4(client, keys) {
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
async function saveAllApiKeys(keys, db) {
  if (db) return saveAllWith4(db, keys);
  return withTransaction((client) => saveAllWith4(client, keys));
}
var KNOWN_COLUMNS4;
var init_apiKeys = __esm({
  "src/server/repositories/apiKeys.ts"() {
    "use strict";
    init_postgres();
    KNOWN_COLUMNS4 = /* @__PURE__ */ new Set(["id", "key_hash", "created_by", "revoked", "created_at"]);
  }
});

// src/server/repositories/documents.ts
async function getDocument(key) {
  const { rows } = await pool.query("SELECT value FROM documents WHERE key = $1", [key]);
  return rows[0] ? rows[0].value : null;
}
async function setDocument(key, value) {
  await pool.query(
    `INSERT INTO documents (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}
var init_documents = __esm({
  "src/server/repositories/documents.ts"() {
    "use strict";
    init_postgres();
  }
});

// src/server/services/db.ts
var db_exports = {};
__export(db_exports, {
  readJSON: () => readJSON,
  updateJSON: () => updateJSON,
  writeJSON: () => writeJSON
});
var COLLECTION_REPOS, readJSON, writeJSON, updateJSON;
var init_db = __esm({
  "src/server/services/db.ts"() {
    "use strict";
    init_postgres();
    init_users();
    init_servers();
    init_nodes();
    init_apiKeys();
    init_documents();
    COLLECTION_REPOS = {
      "users.json": { getAll: getAllUsers, saveAll: saveAllUsers },
      "servers.json": { getAll: getAllServers, saveAll: saveAllServers },
      "nodes.json": { getAll: getAllNodes, saveAll: saveAllNodes },
      "api_keys.json": { getAll: getAllApiKeys, saveAll: saveAllApiKeys }
    };
    readJSON = async (filename) => {
      const repo = COLLECTION_REPOS[filename];
      if (repo) return repo.getAll();
      return getDocument(filename);
    };
    writeJSON = async (filename, data) => {
      const repo = COLLECTION_REPOS[filename];
      if (repo) {
        if (!Array.isArray(data)) {
          throw new Error(`writeJSON("${filename}", ...) expected an array, got ${typeof data}`);
        }
        return repo.saveAll(data);
      }
      return setDocument(filename, data);
    };
    updateJSON = async (filename, updater) => {
      const repo = COLLECTION_REPOS[filename];
      if (repo) {
        return withTransaction(async (client) => {
          const current = await repo.getAll(client);
          const next = await updater(current);
          if (!Array.isArray(next)) {
            throw new Error(`updateJSON("${filename}", ...) updater must return an array for this collection`);
          }
          await repo.saveAll(next, client);
          return next;
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
  }
});

// server.ts
var server_exports = {};
__export(server_exports, {
  io: () => io
});
module.exports = __toCommonJS(server_exports);
var import_config = require("dotenv/config");
var import_express7 = __toESM(require("express"), 1);
var import_path11 = __toESM(require("path"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_vite = require("vite");
var import_fs_extra10 = __toESM(require("fs-extra"), 1);
var import_jsonwebtoken4 = __toESM(require("jsonwebtoken"), 1);

// src/server/config/secrets.ts
function loadJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (!fromEnv || !fromEnv.trim()) {
    console.error(
      `
[FATAL] JWT_SECRET is not set.
Proto Panel refuses to start without it \u2014 running with a default
secret would let anyone forge admin tokens.

Fix: set JWT_SECRET in your .env file to a long random value, e.g.
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
(install.sh generates this automatically for new installs.)
`
    );
    process.exit(1);
  }
  if (fromEnv.length < 32) {
    console.warn(
      "[WARN] JWT_SECRET is shorter than the recommended 32 characters. Consider regenerating it with a longer random value."
    );
  }
  return fromEnv;
}
var JWT_SECRET = loadJwtSecret();

// src/server/utils/authz.ts
function isPrivilegedRole(user) {
  return !!user && (user.role === "admin" || user.role === "owner");
}
function findSubUserEntry(server, userId) {
  if (!server || !Array.isArray(server.subUsers)) return null;
  return server.subUsers.find((su) => su.userId === userId) || null;
}
function canAccessServer(user, server) {
  if (!user || !server) return false;
  if (isPrivilegedRole(user)) return true;
  if (server.owner === user.id) return true;
  return !!findSubUserEntry(server, user.id);
}

// src/server/services/docker.ts
var import_dockerode = __toESM(require("dockerode"), 1);
var import_fs_extra3 = __toESM(require("fs-extra"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_tar_fs = __toESM(require("tar-fs"), 1);
var import_child_process = require("child_process");
var import_util = require("util");
init_events();
init_db();

// src/server/services/jarDownloader.ts
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_axios = __toESM(require("axios"), 1);
var import_promises = require("stream/promises");
var DEFAULT_HEADERS = {
  "User-Agent": "ProtoPanel/3.0.0 (https://github.com/jishnu; support@protopanel.net)",
  "Accept": "*/*"
};
var pipeDownloadToFile = async (url, tempPath) => {
  try {
    const response = await (0, import_axios.default)({
      method: "GET",
      url,
      responseType: "stream",
      headers: DEFAULT_HEADERS,
      timeout: 6e4,
      maxRedirects: 8
    });
    if (response.status !== 200) {
      return false;
    }
    const writer = import_fs_extra2.default.createWriteStream(tempPath);
    await (0, import_promises.pipeline)(response.data, writer);
    const stat = await import_fs_extra2.default.stat(tempPath);
    if (stat.size > 500 * 1024) {
      return true;
    } else {
      await import_fs_extra2.default.remove(tempPath).catch(() => {
      });
      return false;
    }
  } catch (err) {
    await import_fs_extra2.default.remove(tempPath).catch(() => {
    });
    return false;
  }
};
var downloadJar = async (type, version, destPath) => {
  const normType = (type || "paper").toLowerCase().trim();
  let normVersion = (version || "latest").trim();
  if (normVersion === "latest" || normVersion === "" || normVersion === "default") {
    normVersion = "1.21.1";
  }
  const tempPath = `${destPath}.tmp.${Date.now()}`;
  console.log(`[JarDownloader] Request to download ${normType} (${normVersion}) -> ${destPath}`);
  const urls = [];
  if (normType === "bungeecord" || normType === "waterfall") {
    urls.push(
      "https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar",
      "https://hub.spigotmc.org/jenkins/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar"
    );
  } else if (normType === "velocity") {
    try {
      const veloMeta = await import_axios.default.get(`https://fill.papermc.io/v3/projects/velocity/versions/3.4.0-SNAPSHOT/builds/latest`, {
        headers: DEFAULT_HEADERS,
        timeout: 8e3
      });
      const dlUrl = veloMeta.data?.downloads?.["server:default"]?.url || veloMeta.data?.downloads?.application?.url;
      if (dlUrl) {
        urls.push(dlUrl);
      }
    } catch (e) {
    }
    try {
      const veloMetaOld = await import_axios.default.get(`https://fill.papermc.io/v3/projects/velocity/versions/3.3.0-SNAPSHOT/builds/latest`, {
        headers: DEFAULT_HEADERS,
        timeout: 8e3
      });
      const dlUrl = veloMetaOld.data?.downloads?.["server:default"]?.url || veloMetaOld.data?.downloads?.application?.url;
      if (dlUrl) {
        urls.push(dlUrl);
      }
    } catch (e) {
    }
    urls.push(
      "https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar"
    );
  } else if (normType === "forge") {
    const forgePromoVer = normVersion === "1.20.1" ? "47.3.0" : normVersion === "1.19.2" ? "43.3.0" : normVersion === "1.18.2" ? "40.2.0" : normVersion === "1.16.5" ? "36.2.39" : normVersion === "1.12.2" ? "14.23.5.2860" : "latest";
    urls.push(
      `https://maven.minecraftforge.net/net/minecraftforge/forge/${normVersion}-${forgePromoVer}/forge-${normVersion}-${forgePromoVer}-installer.jar`,
      `https://maven.minecraftforge.net/net/minecraftforge/forge/${normVersion}-${forgePromoVer}/forge-${normVersion}-${forgePromoVer}-universal.jar`
    );
  } else if (normType === "fabric") {
    try {
      const metaRes = await import_axios.default.get(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}`, {
        headers: DEFAULT_HEADERS,
        timeout: 1e4
      });
      if (Array.isArray(metaRes.data) && metaRes.data.length > 0) {
        const loaderVer = metaRes.data[0].loader?.version || "0.16.10";
        const installerVer = "1.0.1";
        urls.push(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}/${loaderVer}/${installerVer}/server/jar`);
      }
    } catch (e) {
      urls.push(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}/0.16.10/1.0.1/server/jar`);
    }
  } else if (normType === "vanilla") {
    try {
      const manifestRes = await import_axios.default.get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
        headers: DEFAULT_HEADERS,
        timeout: 8e3
      });
      const versionsList = manifestRes.data?.versions;
      if (Array.isArray(versionsList)) {
        const targetEntry = versionsList.find((v) => v.id === normVersion) || versionsList.find((v) => v.id === "1.21.1");
        if (targetEntry?.url) {
          const versionPackage = await import_axios.default.get(targetEntry.url, { headers: DEFAULT_HEADERS, timeout: 8e3 });
          const serverUrl = versionPackage.data?.downloads?.server?.url;
          if (serverUrl) {
            urls.push(serverUrl);
          }
        }
      }
    } catch (e) {
    }
  } else if (normType === "spigot") {
    urls.push(
      `https://download.getbukkit.org/spigot/spigot-${normVersion}.jar`
    );
  }
  try {
    const paperMeta = await import_axios.default.get(`https://fill.papermc.io/v3/projects/paper/versions/${normVersion}/builds/latest`, {
      headers: DEFAULT_HEADERS,
      timeout: 8e3
    });
    const dlUrl = paperMeta.data?.downloads?.["server:default"]?.url || paperMeta.data?.downloads?.application?.url;
    if (dlUrl) {
      urls.push(dlUrl);
    }
  } catch (e) {
  }
  try {
    const buildsList = await import_axios.default.get(`https://fill.papermc.io/v3/projects/paper/versions/${normVersion}/builds`, {
      headers: DEFAULT_HEADERS,
      timeout: 8e3
    });
    if (Array.isArray(buildsList.data) && buildsList.data.length > 0) {
      const latestBuild = buildsList.data[0];
      const dlUrl = latestBuild?.downloads?.["server:default"]?.url || latestBuild?.downloads?.application?.url;
      if (dlUrl && !urls.includes(dlUrl)) {
        urls.push(dlUrl);
      }
    }
  } catch (e) {
  }
  if (normVersion !== "1.21.1") {
    try {
      const fallbackMeta = await import_axios.default.get(`https://fill.papermc.io/v3/projects/paper/versions/1.21.1/builds/latest`, {
        headers: DEFAULT_HEADERS,
        timeout: 8e3
      });
      const dlUrl = fallbackMeta.data?.downloads?.["server:default"]?.url || fallbackMeta.data?.downloads?.application?.url;
      if (dlUrl && !urls.includes(dlUrl)) {
        urls.push(dlUrl);
      }
    } catch (e) {
    }
  }
  let success = false;
  let lastErr = "";
  for (const candidateUrl of urls) {
    try {
      console.log(`[JarDownloader] Attempting candidate URL: ${candidateUrl}`);
      const ok = await pipeDownloadToFile(candidateUrl, tempPath);
      if (ok) {
        await import_fs_extra2.default.ensureDir(import_path2.default.dirname(destPath));
        await import_fs_extra2.default.move(tempPath, destPath, { overwrite: true });
        await import_fs_extra2.default.chmod(destPath, 511).catch(() => {
        });
        const finalStat = await import_fs_extra2.default.stat(destPath);
        console.log(`[JarDownloader] Successfully downloaded ${normType} (${(finalStat.size / (1024 * 1024)).toFixed(2)} MB)`);
        success = true;
        break;
      }
    } catch (err) {
      lastErr = err?.message || String(err);
      console.warn(`[JarDownloader] URL failed: ${candidateUrl} - ${lastErr}`);
    }
  }
  if (!success) {
    await import_fs_extra2.default.remove(tempPath).catch(() => {
    });
    throw new Error(`Failed to download server JAR for ${normType} ${normVersion}. ${lastErr || "All download mirrors failed"}`);
  }
};

// src/server/services/docker.ts
var execAsync = (0, import_util.promisify)(import_child_process.exec);
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var getSocketPath = () => {
  if (process.platform === "win32") return "//./pipe/docker_engine";
  if (process.env.DOCKER_SOCKET_PATH && import_fs_extra3.default.existsSync(process.env.DOCKER_SOCKET_PATH)) {
    return process.env.DOCKER_SOCKET_PATH;
  }
  if (import_fs_extra3.default.existsSync("/var/run/docker.sock")) return "/var/run/docker.sock";
  if (import_fs_extra3.default.existsSync("/run/docker.sock")) return "/run/docker.sock";
  return "/var/run/docker.sock";
};
var isDockerEnabled = process.env.ENABLE_DOCKER === "true" || process.env.DEFAULT_RUNTIME === "docker" || process.env.PANEL_RUNTIME_MODE === "docker";
var isSandbox = !isDockerEnabled && (!import_fs_extra3.default.existsSync("/var/run/docker.sock") && !import_fs_extra3.default.existsSync("/run/docker.sock") && !(process.env.DOCKER_SOCKET_PATH && import_fs_extra3.default.existsSync(process.env.DOCKER_SOCKET_PATH)) && process.platform !== "win32");
var isNodeSandbox = (nodeId) => {
  if (!nodeId || nodeId === "local") return isSandbox;
  return false;
};
var defaultDocker = new import_dockerode.default({ socketPath: getSocketPath() });
var getDocker = async (nodeId) => {
  if (!nodeId || nodeId === "local") return defaultDocker;
  const nodes = await readJSON("nodes.json") || [];
  const node = nodes.find((n) => n.id === nodeId);
  if (node) {
    let host = node.ip;
    let protocol = "http";
    let port = node.port;
    if (node.connectionMode === "tunnel") {
      try {
        if (!host.startsWith("http://") && !host.startsWith("https://")) {
          host = "https://" + host;
        }
        const url = new URL(host);
        protocol = url.protocol.replace(":", "") === "https" ? "https" : "http";
        host = url.hostname;
        port = url.port ? parseInt(url.port) : protocol === "https" ? 443 : 80;
      } catch (e) {
        console.error("Invalid URL in Tunnel Mode node", host);
      }
    } else {
      if (!host.startsWith("http://") && !host.startsWith("https://") && port === 443) {
        protocol = "https";
      }
      if (host.startsWith("http://") || host.startsWith("https://")) {
        try {
          const url = new URL(host);
          protocol = url.protocol.replace(":", "") === "https" ? "https" : "http";
          host = url.hostname;
          if (url.port) port = parseInt(url.port);
          else port = protocol === "https" ? 443 : 80;
        } catch (e) {
          console.error("Invalid URL in node IP", host);
        }
      }
    }
    console.log(`[getDocker] Selected Node URL: ${protocol}://${host}:${port}`);
    console.log(`[getDocker] Configured IP was: ${node.ip}, connectionMode: ${node.connectionMode}`);
    const d = new import_dockerode.default({
      protocol,
      host,
      port,
      headers: {
        Authorization: "Bearer " + node.key,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const originalDial = d.modem.dial;
    d.modem.dial = function(options, callback) {
      console.log("[Docker Request] " + options.method + " " + options.path);
      console.log("[Docker Outgoing URL] " + d.modem.protocol + "://" + d.modem.host + ":" + d.modem.port + options.path);
      const originalCb = callback;
      const newCb = (err, data) => {
        if (err) {
          console.log("[Docker Response Error] Status:", err.statusCode, "Body:", err.reason || err.message);
        } else {
          console.log("[Docker Response Success] Body:", JSON.stringify(data));
        }
        return originalCb(err, data);
      };
      return originalDial.call(d.modem, options, newCb);
    };
    return d;
  }
  return defaultDocker;
};
var mockState = {};
var mockStartedAt = {};
var getVersions = async (type = "PAPER") => {
  const normalizedType = type.toUpperCase();
  if (normalizedType === "NODEJS" || normalizedType === "NODE") {
    return ["22", "20", "18"];
  }
  if (normalizedType === "PYTHON" || normalizedType === "PYTHON3") {
    return ["3.12", "3.11", "3.10", "3.9"];
  }
  if (normalizedType === "VELOCITY") {
    return ["latest", "3.3.0-SNAPSHOT"];
  }
  if (normalizedType === "BUNGEECORD" || normalizedType === "WATERFALL") {
    return ["latest"];
  }
  return [
    "latest",
    "1.21.11",
    "1.21.10",
    "1.21.9",
    "1.21.8",
    "1.21.7",
    "1.21.6",
    "1.21.5",
    "1.21.4",
    "1.21.3",
    "1.21.1",
    "1.21",
    "1.20.6",
    "1.20.5",
    "1.20.4",
    "1.20.2",
    "1.20.1",
    "1.20",
    "1.19.4",
    "1.19.3",
    "1.19.2",
    "1.19.1",
    "1.19",
    "1.18.2",
    "1.18.1",
    "1.18",
    "1.17.1",
    "1.17",
    "1.16.5",
    "1.16.4",
    "1.16.3",
    "1.16.2",
    "1.16.1",
    "1.15.2",
    "1.15.1",
    "1.15",
    "1.14.4",
    "1.14.3",
    "1.14.2",
    "1.14.1",
    "1.14",
    "1.13.2",
    "1.13.1",
    "1.13",
    "1.12.2",
    "1.12.1",
    "1.12",
    "1.11.2",
    "1.10.2",
    "1.9.4",
    "1.8.8",
    "1.7.10"
  ];
};
var createServerContainer = async (serverData, nodeId) => {
  const docker = await getDocker(nodeId || serverData.nodeId);
  if (isNodeSandbox(nodeId || serverData.nodeId)) {
    mockState[serverData.id] = false;
    return "mock-container-id-" + serverData.id;
  }
  const serverType = (serverData.type || "PAPER").toUpperCase();
  const isNode = ["NODEJS", "NODE"].includes(serverType);
  const isPython = ["PYTHON", "PYTHON3"].includes(serverType);
  const isGenericApp = isNode || isPython;
  const isProxy = ["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(serverType);
  let javaTag = "java21";
  const verStr = String(serverData.version || "1.21.1").toLowerCase();
  if (serverData.javaVersion && String(serverData.javaVersion).trim() !== "") {
    const rawJv = String(serverData.javaVersion).trim().toLowerCase().replace(/^java-?/, "");
    javaTag = `java${rawJv}`;
  } else if (verStr.startsWith("1.7") || verStr.startsWith("1.8") || verStr.startsWith("1.9") || verStr.startsWith("1.10") || verStr.startsWith("1.11") || verStr.startsWith("1.12") || verStr.startsWith("1.13") || verStr.startsWith("1.14") || verStr.startsWith("1.15")) {
    javaTag = "java8";
  } else if (verStr.startsWith("1.16")) {
    javaTag = "java11";
  } else if (verStr.startsWith("1.17") || verStr.startsWith("1.18") || verStr.startsWith("1.19") || verStr.startsWith("1.20.1") || verStr.startsWith("1.20.2") || verStr.startsWith("1.20.3") || verStr.startsWith("1.20.4")) {
    javaTag = "java17";
  } else {
    javaTag = "java21";
  }
  let shortImage = isProxy ? "itzg/bungeecord:latest" : `itzg/minecraft-server:${javaTag}`;
  let fullImage = isProxy ? "docker.io/itzg/bungeecord:latest" : `docker.io/itzg/minecraft-server:${javaTag}`;
  if (isNode) {
    const nodeVer = serverData.version || "20";
    shortImage = `node:${nodeVer}-alpine`;
    fullImage = `docker.io/library/node:${nodeVer}-alpine`;
  } else if (isPython) {
    const pyVer = serverData.version || "3.11";
    shortImage = `python:${pyVer}-slim`;
    fullImage = `docker.io/library/python:${pyVer}-slim`;
  }
  if (serverData.dockerImage) {
    shortImage = serverData.dockerImage;
    fullImage = serverData.dockerImage;
  }
  const findImageId = async () => {
    try {
      const images = await docker.listImages();
      const matched = images.find(
        (img) => img.RepoTags && img.RepoTags.some((tag) => tag.includes(shortImage) || tag.includes(fullImage))
      );
      if (matched) return matched.Id;
    } catch (e) {
      console.warn("Failed to list images:", e);
    }
    return null;
  };
  const pullImageStream = async (imgTag) => {
    console.log(`Pulling image ${imgTag}...`);
    const engine = "docker";
    try {
      console.log(`Executing: ${engine} pull ${imgTag}`);
      const { stdout, stderr } = await execFileAsync(engine, ["pull", imgTag]);
      console.log(`${engine} pull stdout:`, stdout);
      if (stderr) console.warn(`${engine} pull stderr:`, stderr);
    } catch (cliErr) {
      console.warn(`CLI pull failed for ${imgTag}: ${cliErr}. Trying Docker API fallback...`);
      await new Promise((resolve, reject) => {
        docker.pull(imgTag, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err2, output) => {
            if (err2) return reject(err2);
            resolve(output);
          });
        });
      });
    }
  };
  const ensureImage = async () => {
    let existingId = await findImageId();
    if (existingId) return existingId;
    try {
      await pullImageStream(shortImage);
      let idAfterShort = await findImageId();
      if (idAfterShort) return idAfterShort;
    } catch (e) {
      console.warn(`Failed to pull ${shortImage}...`, e);
    }
    console.warn(`Attempting fallback pull with ${fullImage}...`);
    await pullImageStream(fullImage);
    let idAfterFull = await findImageId();
    if (idAfterFull) return idAfterFull;
    return shortImage;
  };
  const targetImage = await ensureImage();
  const isLocal = !nodeId || nodeId === "local";
  const serverDir = import_path3.default.join(process.cwd(), ".data", "servers", serverData.id);
  const containerBindPath = isLocal ? serverDir : `/opt/protopanel-node/servers/${serverData.id}`;
  await import_fs_extra3.default.ensureDir(serverDir);
  await import_fs_extra3.default.chmod(serverDir, 511).catch(() => {
  });
  if (!isGenericApp && !isProxy) {
    const eulaPath = import_path3.default.join(serverDir, "eula.txt");
    if (!import_fs_extra3.default.existsSync(eulaPath)) {
      await import_fs_extra3.default.writeFile(eulaPath, "eula=true\n");
    }
    const propsPath = import_path3.default.join(serverDir, "server.properties");
    if (!import_fs_extra3.default.existsSync(propsPath)) {
      await import_fs_extra3.default.writeFile(propsPath, `server-port=${serverData.port}
motd=${serverData.name || "A Minecraft Server"}
`);
    }
    await import_fs_extra3.default.chmod(eulaPath, 511).catch(() => {
    });
    await import_fs_extra3.default.chmod(propsPath, 511).catch(() => {
    });
    const jarPath = import_path3.default.join(serverDir, "server.jar");
    if (!import_fs_extra3.default.existsSync(jarPath)) {
      console.log(`[Docker] Initiating background JAR download for ${serverType} (${serverData.version || "latest"})...`);
      downloadJar(serverType, serverData.version || "latest", jarPath).catch((jarErr) => {
        console.warn(`[Docker] Background JAR download notice:`, jarErr?.message || jarErr);
      });
    }
  } else if (isProxy) {
    const jarPath = import_path3.default.join(serverDir, "server.jar");
    if (!import_fs_extra3.default.existsSync(jarPath)) {
      downloadJar(serverType, serverData.version || "latest", jarPath).catch((jarErr) => {
        console.warn(`[Docker] Proxy background JAR download notice:`, jarErr?.message || jarErr);
      });
    }
  }
  let envVars = [];
  if (isNode) {
    envVars = [
      `PORT=${serverData.port}`,
      `SERVER_PORT=${serverData.port}`,
      `NODE_ENV=production`,
      `MEMORY=${serverData.ram}G`
    ];
  } else if (isPython) {
    envVars = [
      `PORT=${serverData.port}`,
      `SERVER_PORT=${serverData.port}`,
      `PYTHONUNBUFFERED=1`,
      `MEMORY=${serverData.ram}G`
    ];
  } else if (isProxy) {
    let proxyType = "VELOCITY";
    if (serverType === "BUNGEECORD" || serverType === "BUNGEE") proxyType = "BUNGEE";
    if (serverType === "WATERFALL") proxyType = "WATERFALL";
    envVars = [
      `TYPE=${proxyType}`,
      `SERVER_PORT=${serverData.port || 25577}`,
      `MEMORY=${serverData.ram || 2}G`,
      `ONLINE_MODE=FALSE`,
      `CUSTOM_SERVER=/server/server.jar`
    ];
  } else {
    let itzgType = "PAPER";
    if (serverType === "SPIGOT") itzgType = "SPIGOT";
    else if (serverType === "FORGE") itzgType = "FORGE";
    else if (serverType === "FABRIC") itzgType = "FABRIC";
    else if (serverType === "PURPUR") itzgType = "PAPER";
    else if (serverType === "VANILLA") itzgType = "VANILLA";
    else if (serverType === "NEOFORGE") itzgType = "NEOFORGE";
    else if (serverType === "BUKKIT" || serverType === "CRAFTBUKKIT") itzgType = "BUKKIT";
    else if (serverType === "FOLIA") itzgType = "FOLIA";
    else if (serverType === "MOHIST") itzgType = "MOHIST";
    else if (serverType === "ARCLIGHT") itzgType = "ARCLIGHT";
    else if (serverType === "CUSTOM") itzgType = "CUSTOM";
    envVars = [
      `TYPE=${itzgType}`,
      `VERSION=${serverData.version || "latest"}`,
      `MEMORY=${serverData.ram || 2}G`,
      `INIT_MEMORY=256M`,
      `SERVER_PORT=${serverData.port || 25565}`,
      `UID=0`,
      `GID=0`,
      `EULA=TRUE`,
      `ONLINE_MODE=FALSE`,
      `USE_AIKAR_FLAGS=true`,
      `ENABLE_RCON=true`,
      `RCON_PASSWORD=admin`,
      `RCON_PORT=25575`,
      `OVERRIDE_SERVER_PROPERTIES=true`,
      `FORCE_REDOWNLOAD=false`,
      `CUSTOM_SERVER=/data/server.jar`,
      `JVM_OPTS=-DPaper.IgnoreWorldDataVersion=true`,
      `JVM_DD_OPTS=Paper.IgnoreWorldDataVersion=true,paper.ignoreWorldDataVersion=true`
    ];
  }
  const buildContainerOptions = (img) => {
    let mountPath = isGenericApp ? "/app" : isProxy ? "/server" : "/data";
    let binds = [`${containerBindPath}:${mountPath}`];
    let workingDir = isGenericApp ? "/app" : void 0;
    let cmd = void 0;
    if (isNode) {
      cmd = ["/bin/sh", "-c", serverData.startupCommand || "if [ -f package.json ]; then npm install --omit=dev && npm start; elif [ -f index.js ]; then node index.js; elif [ -f app.js ]; then node app.js; elif [ -f server.js ]; then node server.js; elif [ -f main.js ]; then node main.js; elif [ -f bot.js ]; then node bot.js; elif [ -f test.js ]; then node test.js; else node $(ls *.js *.mjs 2>/dev/null | head -n 1 || echo index.js); fi"];
    } else if (isPython) {
      cmd = ["/bin/sh", "-c", serverData.startupCommand || "if [ -f requirements.txt ]; then pip install -r requirements.txt; fi; if [ -f main.py ]; then python3 -u main.py; elif [ -f app.py ]; then python3 -u app.py; elif [ -f bot.py ]; then python3 -u bot.py; elif [ -f python.py ]; then python3 -u python.py; elif [ -f test.py ]; then python3 -u test.py; elif [ -f index.py ]; then python3 -u index.py; elif [ -f server.py ]; then python3 -u server.py; else python3 -u $(ls *.py 2>/dev/null | head -n 1 || echo main.py); fi"];
    }
    if (serverData.dockerImage && serverData.dockerImage.includes("pterodactyl")) {
      mountPath = "/home/container";
      binds = [`${containerBindPath}:/home/container`];
      workingDir = "/home/container";
      if (serverData.startupCommand) {
        cmd = ["/bin/sh", "-c", serverData.startupCommand];
      }
    }
    return {
      options: {
        Image: img,
        name: `jtg-server-${serverData.id}`,
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        Env: envVars,
        WorkingDir: workingDir,
        Cmd: cmd,
        ExposedPorts: {
          [`${serverData.port}/tcp`]: {},
          [`${serverData.port}/udp`]: {}
        },
        HostConfig: {
          PortBindings: {
            [`${serverData.port}/tcp`]: [
              {
                HostPort: `${serverData.port}`
              }
            ],
            [`${serverData.port}/udp`]: [
              {
                HostPort: `${serverData.port}`
              }
            ]
          },
          Binds: binds
        }
      },
      mountPath
    };
  };
  let container;
  let resolvedMountPath = isGenericApp ? "/app" : isProxy ? "/server" : "/data";
  try {
    const built = buildContainerOptions(targetImage);
    resolvedMountPath = built.mountPath;
    container = await docker.createContainer(built.options);
  } catch (err) {
    const errStr = String(err?.message || err);
    if (err?.statusCode === 409 || errStr.includes("409") || errStr.includes("Conflict") || errStr.includes("already in use")) {
      console.log(`Container name collision for jtg-server-${serverData.id}. Removing stale container...`);
      try {
        const oldCont = docker.getContainer(`jtg-server-${serverData.id}`);
        await oldCont.remove({ force: true }).catch(() => {
        });
        const built = buildContainerOptions(targetImage);
        resolvedMountPath = built.mountPath;
        container = await docker.createContainer(built.options);
      } catch (removeErr) {
        console.warn("Error recreating conflicting container:", removeErr);
        throw removeErr;
      }
    } else if (err?.statusCode === 404 || errStr.includes("404") || errStr.includes("no such image")) {
      const altImage = targetImage === shortImage ? fullImage : shortImage;
      console.log(`404 image error with ${targetImage}. Attempting fallback with ${altImage}...`);
      try {
        await pullImageStream(altImage);
        const built = buildContainerOptions(altImage);
        resolvedMountPath = built.mountPath;
        container = await docker.createContainer(built.options);
      } catch (fallbackErr) {
        console.log(`Pulling ${targetImage} directly and retrying...`);
        await pullImageStream(targetImage);
        const built = buildContainerOptions(targetImage);
        resolvedMountPath = built.mountPath;
        container = await docker.createContainer(built.options);
      }
    } else {
      throw err;
    }
  }
  if (!isLocal) {
    try {
      await pushDirToContainer(docker, container.id, serverDir, resolvedMountPath);
    } catch (syncErr) {
      console.warn(`[createServerContainer] Failed to sync seed files to remote node for ${serverData.id}:`, syncErr);
    }
  }
  return container.id;
};
var pushDirToContainer = async (docker, containerId, localDir, containerPath) => {
  await import_fs_extra3.default.ensureDir(localDir);
  const container = docker.getContainer(containerId);
  const tarStream = import_tar_fs.default.pack(localDir);
  await container.putArchive(tarStream, { path: containerPath });
};
var startContainer = async (containerId, nodeId) => {
  console.log(`[startContainer] id=${containerId}, nodeId=${nodeId}`);
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = true;
    mockStartedAt[id] = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const servers = await readJSON("servers.json") || [];
      const server = servers.find((s) => s.id === id);
      if (server) {
        const serverDir = import_path3.default.join(process.cwd(), ".data", "servers", id);
        await import_fs_extra3.default.ensureDir(serverDir);
        const type = (server.type || "PAPER").toUpperCase();
        if (["NODEJS", "NODE"].includes(type)) {
          const indexPath = import_path3.default.join(serverDir, "index.js");
          const pkgPath = import_path3.default.join(serverDir, "package.json");
          if (!import_fs_extra3.default.existsSync(indexPath)) {
            await import_fs_extra3.default.writeFile(indexPath, `// Node.js Application on Proto Panel
const http = require('http');
const port = process.env.PORT || process.env.SERVER_PORT || ${server.port || 3e3};

console.log('==============================================');
console.log('\u{1F680} Node.js Application Running on port ' + port);
console.log('Node Version: ' + process.version);
console.log('Upload your files in File Manager to customize!');
console.log('==============================================');

const app = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'online', runtime: 'node.js', time: new Date().toISOString() }));
});

app.listen(port, '0.0.0.0', () => {
  console.log(\`[Server] Listening on http://0.0.0.0:\${port}\`);
});
`);
          }
          if (!import_fs_extra3.default.existsSync(pkgPath)) {
            await import_fs_extra3.default.writeFile(pkgPath, JSON.stringify({
              name: (server.name || "node-app").toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
              version: "1.0.0",
              description: "Node.js app on Proto Panel",
              main: "index.js",
              scripts: { "start": "node index.js" }
            }, null, 2));
          }
          panelEvents.emit("log", id, `[Node.js] Starting node index.js on port ${server.port}...\r
[Node.js] Node.js Application active\r
`);
          return;
        } else if (["PYTHON", "PYTHON3"].includes(type)) {
          const mainPath = import_path3.default.join(serverDir, "main.py");
          const reqPath = import_path3.default.join(serverDir, "requirements.txt");
          if (!import_fs_extra3.default.existsSync(mainPath)) {
            await import_fs_extra3.default.writeFile(mainPath, `# Python Application on Proto Panel
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get("SERVER_PORT", os.environ.get("PORT", ${server.port || 8e3})))
print("==============================================", flush=True)
print("\u{1F40D} Python Application Running", flush=True)
print(f"Python Version: {sys.version}", flush=True)
print(f"Listening Port: {port}", flush=True)
print("Upload your files in File Manager to customize!", flush=True)
print("==============================================", flush=True)

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status": "online", "runtime": "python"}')

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)

server = HTTPServer(('0.0.0.0', port), RequestHandler)
print(f"[Server] Listening on http://0.0.0.0:{port}", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\\nStopping server...", flush=True)
    server.server_close()
`);
          }
          if (!import_fs_extra3.default.existsSync(reqPath)) {
            await import_fs_extra3.default.writeFile(reqPath, "# Python dependencies\n");
          }
          panelEvents.emit("log", id, `[Python] Starting python3 -u main.py on port ${server.port}...\r
[Python] Python Application active\r
`);
          return;
        } else if (["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(type)) {
          const configName = type === "VELOCITY" ? "velocity.toml" : "config.yml";
          const configPath = import_path3.default.join(serverDir, configName);
          if (!import_fs_extra3.default.existsSync(configPath)) {
            await import_fs_extra3.default.writeFile(configPath, "# Autogenerated proxy config in sandbox mode\n# Port: " + server.port + "\n");
          }
        } else {
          const propsPath = import_path3.default.join(serverDir, "server.properties");
          if (!import_fs_extra3.default.existsSync(propsPath)) {
            await import_fs_extra3.default.writeFile(propsPath, "server-port=" + server.port + "\nmotd=A Minecraft Server\n");
          }
        }
      }
    } catch (e) {
    }
    panelEvents.emit("log", id, `[System] Server started (Sandbox Mode).\r
`);
    return;
  }
  const container = docker.getContainer(containerId);
  try {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.containerId === containerId);
    if (server) {
      const serverDir = import_path3.default.join(process.cwd(), ".data", "servers", server.id);
      await import_fs_extra3.default.ensureDir(serverDir);
      await import_fs_extra3.default.chmod(serverDir, 511).catch(() => {
      });
      const type = (server.type || "PAPER").toUpperCase();
      const isGeneric = ["NODEJS", "NODE", "PYTHON", "PYTHON3"].includes(type);
      if (!isGeneric) {
        const jarPath = import_path3.default.join(serverDir, "server.jar");
        if (!import_fs_extra3.default.existsSync(jarPath)) {
          panelEvents.emit("log", server.id, `[Proto System] Downloading ${server.type} (${server.version || "latest"}) server JAR...\r
`);
          try {
            await downloadJar(server.type, server.version || "latest", jarPath);
            panelEvents.emit("log", server.id, `[Proto System] Server JAR downloaded successfully.\r
`);
          } catch (err) {
            panelEvents.emit("log", server.id, `[Proto System] Warning: JAR download error: ${err?.message || err}\r
`);
          }
        }
        const eulaPath = import_path3.default.join(serverDir, "eula.txt");
        if (!import_fs_extra3.default.existsSync(eulaPath)) {
          await import_fs_extra3.default.writeFile(eulaPath, "eula=true\n");
        }
        const propsPath = import_path3.default.join(serverDir, "server.properties");
        if (!import_fs_extra3.default.existsSync(propsPath)) {
          await import_fs_extra3.default.writeFile(propsPath, `server-port=${server.port}
motd=${server.name || "A Minecraft Server"}
`);
        }
        await import_fs_extra3.default.chmod(eulaPath, 511).catch(() => {
        });
        await import_fs_extra3.default.chmod(propsPath, 511).catch(() => {
        });
        if (import_fs_extra3.default.existsSync(jarPath)) {
          await import_fs_extra3.default.chmod(jarPath, 511).catch(() => {
          });
        }
      }
      attachContainerSocket(containerId, server.id, nodeId).catch(() => {
      });
    }
  } catch (e) {
  }
  await container.start();
};
var stopContainer = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = false;
    delete mockStartedAt[id];
    panelEvents.emit("log", id, `[System] Server stopped (Sandbox Mode).\r
`);
    return;
  }
  const container = docker.getContainer(containerId);
  await container.stop();
};
var restartContainer = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = true;
    mockStartedAt[id] = (/* @__PURE__ */ new Date()).toISOString();
    panelEvents.emit("log", id, `[System] Server restarted (Sandbox Mode).\r
`);
    return;
  }
  const container = docker.getContainer(containerId);
  await container.restart();
};
var deleteContainer = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    delete mockState[id];
    delete mockStartedAt[id];
    return;
  }
  const container = docker.getContainer(containerId);
  try {
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
    await container.remove({ force: true });
  } catch (err) {
    console.error("Error deleting container", err);
  }
};
var getContainerStatus = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    const isRunning = mockState[id] || false;
    return { State: { Running: isRunning, Status: isRunning ? "running" : "exited", StartedAt: isRunning ? mockStartedAt[id] || (/* @__PURE__ */ new Date()).toISOString() : null } };
  }
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info;
  } catch (e) {
    return null;
  }
};
var getContainerStats = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    const id = containerId.replace("mock-container-id-", "");
    if (!mockState[id]) return { cpu: 0, ram: 0, disk: 0 };
    const timeSec = Math.floor(Date.now() / 5e3);
    const floatPseudo = (Math.sin(timeSec + id.charCodeAt(0)) + 1) / 2;
    return {
      cpu: floatPseudo * 10 + 2,
      // 2% to 12%
      ram: 600 + (floatPseudo * 50 - 25),
      // ~600 MB
      disk: 2.1
    };
  }
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    if (!info.State.Running) {
      return { cpu: 0, ram: 0, disk: 0 };
    }
    const statsResult = await container.stats({ stream: false });
    let cpuPercent = 0;
    try {
      const cpuDelta = statsResult.cpu_stats.cpu_usage.total_usage - statsResult.precpu_stats.cpu_usage.total_usage;
      const systemDelta = statsResult.cpu_stats.system_cpu_usage - statsResult.precpu_stats.system_cpu_usage;
      if (systemDelta > 0 && cpuDelta > 0) {
        const cpus = statsResult.cpu_stats.online_cpus || statsResult.cpu_stats.cpu_usage.percpu_usage?.length || 1;
        cpuPercent = cpuDelta / systemDelta * cpus * 100;
      }
    } catch (e) {
    }
    let ramMB = 0;
    try {
      const stats = statsResult.memory_stats.stats || {};
      const cache = stats.cache || stats.inactive_file || stats.total_inactive_file || 0;
      const usedMemory = statsResult.memory_stats.usage - cache;
      ramMB = usedMemory / 1024 / 1024;
    } catch (e) {
    }
    return {
      cpu: cpuPercent,
      ram: ramMB,
      disk: 2.1
    };
  } catch (e) {
    return { cpu: 0, ram: 0, disk: 0 };
  }
};
var getContainerLogs = async (containerId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) return "[System] Sandbox mode. No historical logs available.\r\n";
  try {
    const container = docker.getContainer(containerId);
    const logsBuffer = await container.logs({ stdout: true, stderr: true, tail: 100 });
    return logsBuffer.toString("utf8");
  } catch (e) {
    return "";
  }
};
var activeStreams = {};
var attachContainerSocket = async (containerId, serverId, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    return;
  }
  try {
    const container = docker.getContainer(containerId);
    if (!activeStreams[containerId]) {
      const stream = await container.attach({ stream: true, stdout: true, stderr: true, stdin: true });
      activeStreams[containerId] = stream;
      stream.on("data", (chunk) => {
        panelEvents.emit("log", serverId, chunk.toString());
      });
      stream.on("end", () => {
        delete activeStreams[containerId];
      });
    }
  } catch (e) {
    console.error("Attach error", e);
  }
};
var sendContainerCommand = async (containerId, command, nodeId) => {
  const docker = await getDocker(nodeId);
  if (isNodeSandbox(nodeId)) {
    return;
  }
  if (activeStreams[containerId]) {
    activeStreams[containerId].write(command + "\n");
  } else {
    try {
      const container = docker.getContainer(containerId);
      const stream = await container.attach({ stream: true, stdout: true, stderr: true, stdin: true });
      activeStreams[containerId] = stream;
      stream.write(command + "\n");
      stream.on("data", (chunk) => {
      });
    } catch (e) {
      console.error("Command error", e);
    }
  }
};

// src/server/services/local.ts
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var import_path4 = __toESM(require("path"), 1);
var import_child_process2 = require("child_process");
var import_util2 = require("util");
var import_child_process3 = require("child_process");
var import_axios2 = __toESM(require("axios"), 1);
init_events();
var execAsync2 = (0, import_util2.promisify)(import_child_process3.exec);
var execFileAsync2 = (0, import_util2.promisify)(import_child_process2.execFile);
var processes = /* @__PURE__ */ new Map();
var localStartedAt = /* @__PURE__ */ new Map();
var activeStreams2 = /* @__PURE__ */ new Set();
var resolveJavaBinary = async (serverData, onLog) => {
  if (process.env.JAVA_BIN && await import_fs_extra4.default.pathExists(process.env.JAVA_BIN)) {
    return process.env.JAVA_BIN;
  }
  let targetVer = "21";
  if (serverData?.javaVersion && String(serverData.javaVersion).trim() !== "") {
    const requested = String(serverData.javaVersion).trim().toLowerCase().replace(/^java/, "");
    targetVer = /^(8|11|17|21)$/.test(requested) ? requested : "21";
  } else if (serverData?.version) {
    const verStr = String(serverData.version).toLowerCase();
    if (verStr.startsWith("1.7") || verStr.startsWith("1.8") || verStr.startsWith("1.9") || verStr.startsWith("1.10") || verStr.startsWith("1.11") || verStr.startsWith("1.12") || verStr.startsWith("1.13") || verStr.startsWith("1.14") || verStr.startsWith("1.15")) {
      targetVer = "8";
    } else if (verStr.startsWith("1.16")) {
      targetVer = "11";
    } else if (verStr.startsWith("1.17") || verStr.startsWith("1.18") || verStr.startsWith("1.19") || verStr.startsWith("1.20.1") || verStr.startsWith("1.20.2") || verStr.startsWith("1.20.3") || verStr.startsWith("1.20.4")) {
      targetVer = "17";
    } else {
      targetVer = "21";
    }
  }
  const localPortableJava = import_path4.default.join(process.cwd(), ".data", "bin", `jre-${targetVer}`, "bin", "java");
  if (await import_fs_extra4.default.pathExists(localPortableJava)) {
    return localPortableJava;
  }
  const candidates = [
    `/usr/lib/jvm/java-${targetVer}-openjdk-amd64/bin/java`,
    `/usr/lib/jvm/java-${targetVer}-openjdk-arm64/bin/java`,
    `/usr/lib/jvm/java-${targetVer}-openjdk/bin/java`,
    `/usr/lib/jvm/java-${targetVer}/bin/java`,
    `/usr/lib/jvm/temurin-${targetVer}-jdk-amd64/bin/java`,
    `/opt/java/openjdk-${targetVer}/bin/java`,
    `/usr/lib/jvm/java-21-openjdk-amd64/bin/java`,
    `/usr/lib/jvm/java-17-openjdk-amd64/bin/java`,
    `/usr/lib/jvm/default-java/bin/java`,
    "/usr/bin/java",
    "/usr/local/bin/java",
    "java"
  ];
  for (const cand of candidates) {
    if (cand === "java") {
      try {
        await execAsync2("which java");
        return "java";
      } catch (e) {
      }
    } else if (await import_fs_extra4.default.pathExists(cand)) {
      return cand;
    }
  }
  try {
    const binDir = import_path4.default.join(process.cwd(), ".data", "bin");
    const jreDir = import_path4.default.join(binDir, `jre-${targetVer}`);
    const tarPath = import_path4.default.join(binDir, `jre-${targetVer}.tar.gz`);
    if (onLog) onLog(`Java ${targetVer} runtime not found on host. Automatically provisioning OpenJDK ${targetVer} LTS runtime...`);
    await import_fs_extra4.default.ensureDir(binDir);
    const res = await (0, import_axios2.default)({
      method: "GET",
      url: `https://api.adoptium.net/v3/binary/latest/${targetVer}/ga/linux/x64/jre/hotspot/normal/eclipse`,
      responseType: "stream",
      maxRedirects: 5,
      timeout: 6e4
    });
    const writer = import_fs_extra4.default.createWriteStream(tarPath);
    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    await import_fs_extra4.default.ensureDir(jreDir);
    await execFileAsync2("tar", ["-xzf", tarPath, "-C", jreDir, "--strip-components=1"]);
    await import_fs_extra4.default.remove(tarPath).catch(() => {
    });
    await execFileAsync2("chmod", ["+x", localPortableJava]);
    if (onLog) onLog(`OpenJDK ${targetVer} runtime provisioned successfully.`);
    return localPortableJava;
  } catch (err) {
    if (onLog) onLog(`Auto-provisioning JRE ${targetVer} encountered: ${err.message}. Defaulting to 'java'.`);
  }
  return process.env.JAVA_BIN || "java";
};
var resolvePythonBinary = async () => {
  if (process.env.PYTHON_BIN && await import_fs_extra4.default.pathExists(process.env.PYTHON_BIN)) {
    return process.env.PYTHON_BIN;
  }
  const candidates = ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3", "/usr/bin/python"];
  for (const cand of candidates) {
    try {
      await execAsync2(`which ${cand}`);
      return cand;
    } catch (e) {
    }
  }
  return "python3";
};
var resolveNodeBinary = async () => {
  if (process.env.NODE_BIN && await import_fs_extra4.default.pathExists(process.env.NODE_BIN)) {
    return process.env.NODE_BIN;
  }
  const candidates = ["node", "/usr/bin/node", "/usr/local/bin/node"];
  for (const cand of candidates) {
    try {
      await execAsync2(`which ${cand}`);
      return cand;
    } catch (e) {
    }
  }
  return "node";
};
var createLocalServer = async (serverData) => {
  const serverPath = import_path4.default.join(process.cwd(), ".data", "servers", serverData.id);
  await import_fs_extra4.default.ensureDir(serverPath);
  const type = (serverData.type || "paper").toLowerCase();
  if (type === "nodejs" || type === "node") {
    const indexPath = import_path4.default.join(serverPath, "index.js");
    const pkgPath = import_path4.default.join(serverPath, "package.json");
    if (!await import_fs_extra4.default.pathExists(indexPath)) {
      await import_fs_extra4.default.writeFile(indexPath, `// Node.js Application on Proto Panel
const http = require('http');
const port = process.env.PORT || process.env.SERVER_PORT || ${serverData.port || 3e3};

console.log('==============================================');
console.log('\u{1F680} Node.js Application Running on port ' + port);
console.log('Node Version: ' + process.version);
console.log('Upload your files in File Manager to customize!');
console.log('==============================================');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'online', runtime: 'node.js', time: new Date().toISOString() }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(\`[Server] Listening on http://0.0.0.0:\${port}\`);
});
`);
    }
    if (!await import_fs_extra4.default.pathExists(pkgPath)) {
      await import_fs_extra4.default.writeFile(pkgPath, JSON.stringify({
        name: (serverData.name || "node-app").toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        version: "1.0.0",
        description: "Node.js application hosted on Proto Panel",
        main: "index.js",
        scripts: { "start": "node index.js" }
      }, null, 2));
    }
    return `local-${serverData.id}`;
  } else if (type === "python" || type === "python3") {
    const mainPath = import_path4.default.join(serverPath, "main.py");
    const reqPath = import_path4.default.join(serverPath, "requirements.txt");
    if (!await import_fs_extra4.default.pathExists(mainPath)) {
      await import_fs_extra4.default.writeFile(mainPath, `# Python Application on Proto Panel
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get("SERVER_PORT", os.environ.get("PORT", ${serverData.port || 8e3})))
print("==============================================", flush=True)
print("\u{1F40D} Python Application Running", flush=True)
print(f"Python Version: {sys.version}", flush=True)
print(f"Listening Port: {port}", flush=True)
print("Upload your files in File Manager to customize!", flush=True)
print("==============================================", flush=True)

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status": "online", "runtime": "python"}')

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)

server = HTTPServer(('0.0.0.0', port), RequestHandler)
print(f"[Server] Listening on http://0.0.0.0:{port}", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\\nStopping server...", flush=True)
    server.server_close()
`);
    }
    if (!await import_fs_extra4.default.pathExists(reqPath)) {
      await import_fs_extra4.default.writeFile(reqPath, "# Add python dependencies here\n");
    }
    return `local-${serverData.id}`;
  } else if (type === "velocity") {
    const configPath = import_path4.default.join(serverPath, "velocity.toml");
    if (!await import_fs_extra4.default.pathExists(configPath)) {
      await import_fs_extra4.default.writeFile(configPath, `bind = "0.0.0.0:${serverData.port || 25577}"
motd = "&#09add3A Velocity Server"
`);
    }
  } else if (type === "bungeecord" || type === "waterfall") {
    const configPath = import_path4.default.join(serverPath, "config.yml");
    if (!await import_fs_extra4.default.pathExists(configPath)) {
      await import_fs_extra4.default.writeFile(configPath, `listeners:
- query_port: ${serverData.port || 25577}
  host: 0.0.0.0:${serverData.port || 25577}
  max_players: 1000
`);
    }
  } else {
    const eulaPath = import_path4.default.join(serverPath, "eula.txt");
    await import_fs_extra4.default.writeFile(eulaPath, "eula=true\n");
    const propsPath = import_path4.default.join(serverPath, "server.properties");
    if (!await import_fs_extra4.default.pathExists(propsPath)) {
      await import_fs_extra4.default.writeFile(propsPath, `server-port=${serverData.port || 25565}
`);
    }
  }
  const jarPath = import_path4.default.join(serverPath, "server.jar");
  let needDownload = false;
  if (!await import_fs_extra4.default.pathExists(jarPath)) {
    needDownload = true;
  } else {
    const stat = await import_fs_extra4.default.stat(jarPath);
    if (stat.size < 500 * 1024) {
      needDownload = true;
    }
  }
  if (needDownload) {
    try {
      await downloadJar(type, serverData.version || "latest", jarPath);
    } catch (e) {
      console.warn(`[Local Server] Deferred JAR download: ${e.message}`);
    }
  }
  return `local-${serverData.id}`;
};
var startLocalServer = async (id, serverData) => {
  const serverPath = import_path4.default.join(process.cwd(), ".data", "servers", id);
  await import_fs_extra4.default.ensureDir(serverPath);
  const type = (serverData.type || "paper").toLowerCase();
  const logPath = import_path4.default.join(serverPath, "panel.log");
  const logStream = import_fs_extra4.default.createWriteStream(logPath, { flags: "a" });
  const emitLog = (msg) => {
    panelEvents.emit("log", id, msg);
  };
  const logMessage = (msg) => {
    const formatted = `[Panel] ${msg}
`;
    if (logStream.writable) {
      logStream.write(formatted);
    }
    emitLog(formatted);
  };
  let child;
  if (type === "nodejs" || type === "node") {
    const nodeBin = await resolveNodeBinary();
    if (serverData.startupCommand && serverData.startupCommand.trim()) {
      const parts = serverData.startupCommand.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      logMessage(`Executing custom startup command: ${serverData.startupCommand.trim()}`);
      child = (0, import_child_process2.spawn)(bin, args, {
        cwd: serverPath,
        env: {
          ...process.env,
          PORT: String(serverData.port || 3e3),
          SERVER_PORT: String(serverData.port || 3e3),
          NODE_ENV: "production"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
    } else {
      let entry = "index.js";
      let found = false;
      const pkgPath = import_path4.default.join(serverPath, "package.json");
      if (await import_fs_extra4.default.pathExists(pkgPath)) {
        try {
          const pkg = await import_fs_extra4.default.readJSON(pkgPath);
          if (pkg.main && await import_fs_extra4.default.pathExists(import_path4.default.join(serverPath, pkg.main))) {
            entry = pkg.main;
            found = true;
          }
        } catch (e) {
        }
      }
      if (!found) {
        for (const testFile of ["index.js", "app.js", "server.js", "main.js", "bot.js", "run.js", "test.js", "index.mjs", "app.mjs"]) {
          if (await import_fs_extra4.default.pathExists(import_path4.default.join(serverPath, testFile))) {
            entry = testFile;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        try {
          const files = await import_fs_extra4.default.readdir(serverPath);
          const anyJs = files.find((f) => f.endsWith(".js") || f.endsWith(".mjs"));
          if (anyJs) {
            entry = anyJs;
            found = true;
          }
        } catch (e) {
        }
      }
      if (!found && !await import_fs_extra4.default.pathExists(import_path4.default.join(serverPath, entry))) {
        await import_fs_extra4.default.writeFile(import_path4.default.join(serverPath, "index.js"), `// Node.js Application on Proto Panel
const http = require('http');
const port = process.env.PORT || ${serverData.port || 3e3};
const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({status:'online'})); });
server.listen(port, () => console.log('Node.js server listening on port ' + port));
`);
        entry = "index.js";
      }
      logMessage(`Starting Node.js application (${entry}) on port ${serverData.port || 3e3}...`);
      child = (0, import_child_process2.spawn)(nodeBin, [entry], {
        cwd: serverPath,
        env: {
          ...process.env,
          PORT: String(serverData.port || 3e3),
          SERVER_PORT: String(serverData.port || 3e3),
          NODE_ENV: "production"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
    }
  } else if (type === "python" || type === "python3") {
    const pythonBin = await resolvePythonBinary();
    if (serverData.startupCommand && serverData.startupCommand.trim()) {
      const parts = serverData.startupCommand.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      logMessage(`Executing custom startup command: ${serverData.startupCommand.trim()}`);
      child = (0, import_child_process2.spawn)(bin, args, {
        cwd: serverPath,
        env: {
          ...process.env,
          PORT: String(serverData.port || 8e3),
          SERVER_PORT: String(serverData.port || 8e3),
          PYTHONUNBUFFERED: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
    } else {
      let entry = "main.py";
      let found = false;
      for (const testFile of ["main.py", "app.py", "bot.py", "python.py", "index.py", "server.py", "run.py", "test.py"]) {
        if (await import_fs_extra4.default.pathExists(import_path4.default.join(serverPath, testFile))) {
          entry = testFile;
          found = true;
          break;
        }
      }
      if (!found) {
        try {
          const files = await import_fs_extra4.default.readdir(serverPath);
          const anyPy = files.find((f) => f.endsWith(".py"));
          if (anyPy) {
            entry = anyPy;
            found = true;
          }
        } catch (e) {
        }
      }
      if (!found && !await import_fs_extra4.default.pathExists(import_path4.default.join(serverPath, entry))) {
        await import_fs_extra4.default.writeFile(import_path4.default.join(serverPath, "main.py"), `# Python Application on Proto Panel
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
port = int(os.environ.get("SERVER_PORT", ${serverData.port || 8e3}))
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"online","runtime":"python"}')
server = HTTPServer(('0.0.0.0', port), Handler)
print(f"Python server listening on port {port}", flush=True)
server.serve_forever()
`);
        entry = "main.py";
      }
      logMessage(`Starting Python application (${entry}) on port ${serverData.port || 8e3}...`);
      child = (0, import_child_process2.spawn)(pythonBin, ["-u", entry], {
        cwd: serverPath,
        env: {
          ...process.env,
          PORT: String(serverData.port || 8e3),
          SERVER_PORT: String(serverData.port || 8e3),
          PYTHONUNBUFFERED: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
    }
  } else {
    const jarPath = import_path4.default.join(serverPath, "server.jar");
    let needDownload = false;
    if (!await import_fs_extra4.default.pathExists(jarPath)) {
      needDownload = true;
    } else {
      const stat = await import_fs_extra4.default.stat(jarPath);
      if (stat.size < 500 * 1024) {
        needDownload = true;
      }
    }
    if (needDownload) {
      logMessage(`Server JAR missing or incomplete. Downloading ${type} (${serverData.version || "latest"})...`);
      try {
        await downloadJar(type, serverData.version || "latest", jarPath);
        logMessage("Server JAR downloaded successfully.");
      } catch (dlErr) {
        logMessage(`Failed to download JAR: ${dlErr.message}`);
        throw new Error(`Failed to download server.jar: ${dlErr.message}`);
      }
    }
    const eulaPath = import_path4.default.join(serverPath, "eula.txt");
    await import_fs_extra4.default.writeFile(eulaPath, "eula=true\n");
    const memoryMb = Math.round((serverData.ram || 2) * 1024);
    const javaBin = await resolveJavaBinary(serverData, logMessage);
    if (serverData.startupCommand && serverData.startupCommand.trim()) {
      const parts = serverData.startupCommand.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      child = (0, import_child_process2.spawn)(bin, args, {
        cwd: serverPath,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } else {
      child = (0, import_child_process2.spawn)(javaBin, [
        "-Xms128M",
        `-Xmx${memoryMb}M`,
        "-Dterminal.jline=false",
        "-Dterminal.ansi=true",
        "-Dfile.encoding=UTF-8",
        "-jar",
        "server.jar",
        "--nogui"
      ], {
        cwd: serverPath,
        stdio: ["pipe", "pipe", "pipe"]
      });
    }
  }
  processes.set(id, child);
  child.on("spawn", () => {
    localStartedAt.set(id, (/* @__PURE__ */ new Date()).toISOString());
    logMessage(`Server process started with PID ${child.pid} for ${serverData.name || id} (${type})`);
  });
  child.on("error", (err) => {
    localStartedAt.delete(id);
    logMessage(`Failed to start server process: ${err.message}`);
    if (err.message.includes("ENOENT")) {
      logMessage("---- RUNTIME NOTICE ----");
      logMessage(`Required executable or binary is missing or not in PATH for runtime (${type})!`);
      logMessage("If running Minecraft with the Node.js / Local Process runtime on a Linux VPS, ensure OpenJDK 21 is installed:");
      logMessage("  sudo apt update && sudo apt install -y openjdk-21-jre-headless");
      logMessage("Alternatively, you can switch to the Docker Container runtime in Settings.");
      logMessage("------------------------");
    }
  });
  child.on("close", (code) => {
    logMessage(`Server process exited with code ${code}`);
    processes.delete(id);
    localStartedAt.delete(id);
    activeStreams2.delete(id);
  });
  child.stdout?.on("data", (data) => {
    const text = data.toString();
    if (logStream.writable) logStream.write(text);
    emitLog(text);
  });
  child.stderr?.on("data", (data) => {
    const text = data.toString();
    if (logStream.writable) logStream.write(text);
    emitLog(text);
  });
};
var stopLocalServer = async (id) => {
  localStartedAt.delete(id);
  const child = processes.get(id);
  if (child) {
    if (child.stdin && child.stdin.writable) {
      try {
        child.stdin.write("stop\nend\nexit\n");
      } catch (e) {
      }
    }
    setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch (e) {
      }
    }, 500);
  }
};
var restartLocalServer = async (id, serverData) => {
  await stopLocalServer(id);
  setTimeout(() => {
    startLocalServer(id, serverData).catch(console.error);
  }, 2e3);
};
var deleteLocalServer = async (id) => {
  await stopLocalServer(id);
  localStartedAt.delete(id);
  const serverPath = import_path4.default.join(process.cwd(), ".data", "servers", id);
  await import_fs_extra4.default.remove(serverPath);
};
var getLocalServerStatus = async (id) => {
  const isRunning = processes.has(id);
  return {
    State: {
      Running: isRunning,
      Status: isRunning ? "running" : "exited",
      StartedAt: isRunning ? localStartedAt.get(id) || null : null
    }
  };
};
var getLocalServerStats = async (id) => {
  const child = processes.get(id);
  if (!child || !child.pid) return null;
  try {
    const { stdout } = await execAsync2(`ps -p ${child.pid} -o %cpu,rss`);
    const lines = stdout.trim().split("\n");
    if (lines.length > 1) {
      const parts = lines[1].trim().split(/\s+/);
      const cpu = parseFloat(parts[0]);
      const rss = parseInt(parts[1]) * 1024;
      return {
        cpu_stats: { cpu_usage: { total_usage: cpu }, system_cpu_usage: 100 },
        precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 100 },
        memory_stats: { usage: rss, limit: 1024 * 1024 * 1024 * 4 }
      };
    }
  } catch (e) {
  }
  return {
    cpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 100 },
    precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 100 },
    memory_stats: { usage: 0, limit: 1024 * 1024 * 1024 }
  };
};
var getLocalServerLogs = async (id) => {
  const logPath = import_path4.default.join(process.cwd(), ".data", "servers", id, "panel.log");
  if (await import_fs_extra4.default.pathExists(logPath)) {
    const logs = await import_fs_extra4.default.readFile(logPath, "utf8");
    return logs.split("\n").slice(-100).join("\n");
  }
  return "";
};
var attachLocalServerSocket = (id, serverId) => {
};
var sendLocalServerCommand = async (id, command) => {
  const child = processes.get(id);
  if (child && child.stdin) {
    child.stdin.write(command + "\n");
    const serverPath = import_path4.default.join(process.cwd(), ".data", "servers", id);
    const logPath = import_path4.default.join(serverPath, "panel.log");
    const formatted = `> ${command}
`;
    try {
      await import_fs_extra4.default.appendFile(logPath, formatted);
    } catch (e) {
    }
    panelEvents.emit("log", id, formatted);
  }
};
var getLocalProcessInfo = (id) => {
  const child = processes.get(id);
  const serverPath = import_path4.default.join(process.cwd(), ".data", "servers", id);
  if (child) {
    return {
      pid: child.pid,
      jarPath: import_path4.default.join(serverPath, "server.jar"),
      logPath: import_path4.default.join(serverPath, "panel.log")
    };
  }
  return null;
};

// src/server/services/runtime.ts
var createServerRuntime = async (serverData, nodeId) => {
  if (serverData.runtimeType === "local") {
    return await createLocalServer(serverData);
  }
  return await createServerContainer(serverData, nodeId);
};
var startServerRuntime = async (server) => {
  if (server.runtimeType === "local") {
    return await startLocalServer(server.id, server);
  }
  return await startContainer(server.containerId, server.nodeId);
};
var stopServerRuntime = async (server) => {
  if (server.runtimeType === "local") {
    return await stopLocalServer(server.id);
  }
  return await stopContainer(server.containerId, server.nodeId);
};
var restartServerRuntime = async (server) => {
  if (server.runtimeType === "local") {
    return await restartLocalServer(server.id, server);
  }
  return await restartContainer(server.containerId, server.nodeId);
};
var deleteServerRuntime = async (server) => {
  if (server.runtimeType === "local") {
    return await deleteLocalServer(server.id);
  }
  return await deleteContainer(server.containerId, server.nodeId);
};
var getServerRuntimeStatus = async (server) => {
  if (server.runtimeType === "local") {
    return await getLocalServerStatus(server.id);
  }
  return await getContainerStatus(server.containerId, server.nodeId);
};
var getServerRuntimeStats = async (server) => {
  if (server.runtimeType === "local") {
    return await getLocalServerStats(server.id);
  }
  return await getContainerStats(server.containerId, server.nodeId);
};
var getServerRuntimeLogs = async (server) => {
  if (server.runtimeType === "local") {
    return await getLocalServerLogs(server.id);
  }
  return await getContainerLogs(server.containerId, server.nodeId);
};
var attachServerRuntimeSocket = async (server, serverId) => {
  if (server.runtimeType === "local") {
    return attachLocalServerSocket(server.id, serverId);
  }
  return await attachContainerSocket(server.containerId, serverId, server.nodeId);
};
var sendServerRuntimeCommand = async (server, command) => {
  if (server.runtimeType === "local") {
    return await sendLocalServerCommand(server.id, command);
  }
  return await sendContainerCommand(server.containerId, command, server.nodeId);
};

// server.ts
init_events();

// src/server/routes/api.ts
var import_express6 = __toESM(require("express"), 1);
init_db();
var import_child_process8 = require("child_process");
var import_crypto6 = __toESM(require("crypto"), 1);

// src/server/routes/auth.ts
var import_express = __toESM(require("express"), 1);

// src/server/controllers/auth.ts
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"), 1);
init_db();

// src/server/services/googleAuth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var CERTS_TTL_MS = 60 * 60 * 1e3;
var certsCache = null;
async function getFirebaseCerts() {
  if (certsCache && Date.now() < certsCache.expiresAt) {
    return certsCache.certs;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase signing certs (HTTP ${res.status})`);
  }
  const certs = await res.json();
  certsCache = { certs, expiresAt: Date.now() + CERTS_TTL_MS };
  return certs;
}
async function verifyFirebaseIdToken(idToken, projectId) {
  if (!projectId) {
    throw new Error("Server is missing a configured Firebase project id");
  }
  const decodedHeader = import_jsonwebtoken.default.decode(idToken, { complete: true });
  if (!decodedHeader || typeof decodedHeader === "string" || !decodedHeader.header?.kid) {
    throw new Error("Malformed ID token");
  }
  const certs = await getFirebaseCerts();
  const cert = certs[decodedHeader.header.kid];
  if (!cert) {
    throw new Error("Token was signed with an unrecognized key");
  }
  let payload;
  try {
    payload = import_jsonwebtoken.default.verify(idToken, cert, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`
    });
  } catch (err) {
    throw new Error("Signature verification failed: " + (err?.message || "invalid token"));
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token missing subject claim");
  }
  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Token has no email claim");
  }
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  if (typeof payload.auth_time === "number" && payload.auth_time > Date.now() / 1e3 + 60) {
    throw new Error("Token auth_time is in the future");
  }
  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : void 0,
    picture: typeof payload.picture === "string" ? payload.picture : void 0
  };
}

// src/server/controllers/auth.ts
var register = async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  if (settings.enableRegistration === false) {
    res.status(403).json({ error: "User registration is currently disabled by administrator." });
    return;
  }
  const { username, password, confirmPassword } = req.body;
  if (!username || !password || !confirmPassword) {
    res.status(400).json({ error: "Username, password, and confirm password are required" });
    return;
  }
  const cleanUsername = username.trim();
  if (cleanUsername.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }
  const users = await readJSON("users.json") || [];
  const existingUser = users.find((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser) {
    res.status(400).json({ error: "Username is already taken" });
    return;
  }
  const { writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const hashedPassword = await import_bcryptjs.default.hash(password, 10);
  const newUser = {
    id: "user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    username: cleanUsername,
    password: hashedPassword,
    role: "user",
    passwordVersion: 0
  };
  users.push(newUser);
  await writeJSON3("users.json", users);
  res.status(201).json({
    message: "User registered successfully",
    user: { id: newUser.id, username: newUser.username, role: newUser.role }
  });
};
var login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }
  const isDevMode = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTO_LOGIN === "true";
  if (isDevMode) {
    const users2 = await readJSON("users.json") || [];
    let user2 = users2.find((u) => u.username === username);
    if (!user2) {
      const { writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const hashedPassword = await import_bcryptjs.default.hash(password, 10);
      const isFirstUser = users2.length === 0;
      user2 = {
        id: "dev-user-" + Math.random().toString(36).substr(2, 9),
        username,
        password: hashedPassword,
        role: isFirstUser || username === "admin" ? "owner" : "user",
        passwordVersion: 0
      };
      users2.push(user2);
      await writeJSON3("users.json", users2);
    }
    const role2 = user2.role || "owner";
    const token2 = import_jsonwebtoken2.default.sign(
      { id: user2.id, username: user2.username, role: role2, passwordVersion: user2.passwordVersion || 0 },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token: token2, user: { id: user2.id, username: user2.username, role: role2 } });
    return;
  }
  const users = await readJSON("users.json") || [];
  const user = users.find((u) => u.username === username);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const isMatch = await import_bcryptjs.default.compare(password, user.password);
  if (!isMatch) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const role = user.role || "admin";
  const token = import_jsonwebtoken2.default.sign({ id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, username: user.username, role } });
};
var logout = (req, res) => {
  res.json({ message: "Logged out" });
};
var getMe = async (req, res) => {
  const reqUser = req.user;
  if (reqUser && reqUser.id !== "temp-admin") {
    const users = await readJSON("users.json") || [];
    const dbUser = users.find((u) => u.id === reqUser.id);
    if (dbUser) {
      return res.json({
        user: {
          ...reqUser,
          googleId: dbUser.googleId || null,
          isGoogleUser: !!(dbUser.googleId || !dbUser.password)
        }
      });
    }
  }
  res.json({ user: reqUser });
};
var getUsers = async (req, res) => {
  const users = await readJSON("users.json") || [];
  res.json(users.map((u) => ({ id: u.id, username: u.username, role: u.role, isGoogleUser: !!u.googleId })));
};
var changeUsername = async (req, res) => {
  const reqUser = req.user;
  const { newUsername } = req.body;
  if (!newUsername || typeof newUsername !== "string" || newUsername.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters long." });
  }
  const cleanUsername = newUsername.trim();
  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change username of default admin account." });
  }
  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u) => u.id === reqUser.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  if (!users[userIndex].googleId) {
    return res.status(400).json({ error: "Username change is only available for Google authenticated accounts." });
  }
  const existingUser = users.find((u) => u.id !== reqUser.id && u.username && u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: `Username '${cleanUsername}' is already taken.` });
  }
  users[userIndex].username = cleanUsername;
  await writeJSON("users.json", users);
  res.json({ success: true, username: cleanUsername });
};
var changePassword = async (req, res) => {
  const reqUser = req.user;
  const { oldPassword, newPassword } = req.body;
  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change password of default admin account. Create a new admin user instead." });
  }
  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u) => u.id === reqUser.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  if (users[userIndex].googleId || !users[userIndex].password) {
    return res.status(400).json({ error: "Password change is disabled for Google Auth accounts." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  const isMatch = await import_bcryptjs.default.compare(oldPassword || "", users[userIndex].password);
  if (!isMatch) {
    return res.status(401).json({ error: "Incorrect old password" });
  }
  const { writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const hashedPassword = await import_bcryptjs.default.hash(newPassword, 10);
  users[userIndex].password = hashedPassword;
  users[userIndex].passwordVersion = (users[userIndex].passwordVersion || 0) + 1;
  await writeJSON3("users.json", users);
  res.json({ success: true });
};
var googleLogin = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== "string") {
    res.status(400).json({ error: "Google ID token is required" });
    return;
  }
  const settings = await readJSON("settings.json") || {};
  if (settings.enableGoogleLogin === false) {
    res.status(403).json({ error: "Google Login is disabled on this panel." });
    return;
  }
  const projectId = settings.firebaseProjectId;
  if (!projectId) {
    res.status(500).json({ error: "Google Login is not fully configured on this panel (missing Firebase project id)." });
    return;
  }
  let verified;
  try {
    verified = await verifyFirebaseIdToken(idToken, projectId);
  } catch (err) {
    res.status(401).json({ error: "Could not verify Google credentials: " + (err?.message || "invalid token") });
    return;
  }
  const email = verified.email;
  const googleId = verified.uid;
  const name = verified.name || "";
  const photoURL = verified.picture || "";
  const emailPrefix = email.split("@")[0].replace(/[^a-zA-Z0-9_.]/g, "");
  const baseUsername = emailPrefix || "user";
  const users = await readJSON("users.json") || [];
  let user = users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase() || u.googleId && u.googleId === googleId || u.username && u.username.toLowerCase() === baseUsername.toLowerCase());
  if (!user) {
    const isFirstUser = users.length === 0;
    const role2 = isFirstUser ? "owner" : "user";
    const { writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
    user = {
      id: "google-user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      username: baseUsername,
      email,
      googleId,
      role: role2,
      avatar: photoURL || "",
      passwordVersion: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    users.push(user);
    await writeJSON3("users.json", users);
  } else {
    let updated = false;
    if (!user.email) {
      user.email = email;
      updated = true;
    }
    if (!user.googleId) {
      user.googleId = googleId;
      updated = true;
    }
    if (photoURL && !user.avatar) {
      user.avatar = photoURL;
      updated = true;
    }
    if (updated) {
      const { writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await writeJSON3("users.json", users);
    }
  }
  const role = user.role || "admin";
  const token = import_jsonwebtoken2.default.sign(
    { id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role,
      email: user.email,
      avatar: user.avatar,
      googleId: user.googleId,
      isGoogleUser: true
    }
  });
};

// src/server/middleware/auth.ts
var import_jsonwebtoken3 = __toESM(require("jsonwebtoken"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.split(" ")[1];
  if (token.startsWith("jtg-") || token.startsWith("jtg_")) {
    try {
      const { readJSON: readJSON2, writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const apiKeys = await readJSON2("api_keys.json") || [];
      const keyHash = import_crypto.default.createHash("sha256").update(token).digest("hex");
      const apiKey = apiKeys.find((k) => k.key_hash === keyHash);
      if (!apiKey || apiKey.revoked) {
        res.status(401).json({ error: "Invalid or revoked API key" });
        return;
      }
      if (apiKey.expires_at && new Date(apiKey.expires_at) < /* @__PURE__ */ new Date()) {
        res.status(401).json({ error: "API key expired" });
        return;
      }
      apiKey.last_used_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJSON3("api_keys.json", apiKeys);
      const users = await readJSON2("users.json") || [];
      let adminRole = "admin";
      if (apiKey.created_by !== "temp-admin") {
        const creator = users.find((u) => u.id === apiKey.created_by);
        if (!creator || creator.role !== "admin" && creator.role !== "owner") {
          res.status(403).json({ error: "Forbidden: API Key creator is no longer an admin" });
          return;
        }
        adminRole = creator.role;
      }
      req.user = { id: apiKey.created_by, role: adminRole, isApiKey: true, scopes: apiKey.scopes };
      next();
      return;
    } catch (err) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  }
  try {
    const decoded = import_jsonwebtoken3.default.verify(token, JWT_SECRET);
    if (decoded.role !== "admin" && decoded.role !== "owner") {
      res.status(403).json({ error: "Forbidden: Admin access only" });
      return;
    }
    if (decoded.id !== "temp-admin") {
      const { readJSON: readJSON2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const users = await readJSON2("users.json") || [];
      const user = users.find((u) => u.id === decoded.id);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      if ((user.passwordVersion || 0) !== (decoded.passwordVersion || 0)) {
        res.status(401).json({ error: "Session expired" });
        return;
      }
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};
var requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.split(" ")[1];
  if (token.startsWith("jtg-") || token.startsWith("jtg_")) {
    try {
      const { readJSON: readJSON2, writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const apiKeys = await readJSON2("api_keys.json") || [];
      const keyHash = import_crypto.default.createHash("sha256").update(token).digest("hex");
      const apiKey = apiKeys.find((k) => k.key_hash === keyHash);
      if (!apiKey || apiKey.revoked) {
        res.status(401).json({ error: "Invalid or revoked API key" });
        return;
      }
      if (apiKey.expires_at && new Date(apiKey.expires_at) < /* @__PURE__ */ new Date()) {
        res.status(401).json({ error: "API key expired" });
        return;
      }
      apiKey.last_used_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJSON3("api_keys.json", apiKeys);
      const users = await readJSON2("users.json") || [];
      let role = "admin";
      if (apiKey.created_by !== "temp-admin") {
        const creator = users.find((u) => u.id === apiKey.created_by);
        if (creator) {
          role = creator.role;
        }
      }
      req.user = { id: apiKey.created_by, role, isApiKey: true, scopes: apiKey.scopes };
      next();
      return;
    } catch (err) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  }
  try {
    const decoded = import_jsonwebtoken3.default.verify(token, JWT_SECRET);
    if (decoded.id !== "temp-admin") {
      const { readJSON: readJSON2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const users = await readJSON2("users.json") || [];
      const user = users.find((u) => u.id === decoded.id);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      if ((user.passwordVersion || 0) !== (decoded.passwordVersion || 0)) {
        res.status(401).json({ error: "Session expired" });
        return;
      }
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// src/server/middleware/rateLimit.ts
var buckets = /* @__PURE__ */ new Map();
var SWEEP_INTERVAL_MS = 5 * 60 * 1e3;
setInterval(() => {
  const cutoff = Date.now() - SWEEP_INTERVAL_MS;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
      buckets.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS).unref();
function keyFor(req, name) {
  const user = req.user;
  const identity = user?.id ? `u:${user.id}` : `ip:${req.ip}`;
  return `${name}|${identity}`;
}
function createRateLimiter(options) {
  const { windowMs, max, name } = options;
  const message = options.message || "Too many requests, please slow down.";
  return function rateLimit(req, res, next) {
    const key = keyFor(req, name);
    const now = Date.now();
    const windowStart = now - windowMs;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      buckets.set(key, bucket);
    }
    while (bucket.hits.length > 0 && bucket.hits[0] < windowStart) {
      bucket.hits.shift();
    }
    if (bucket.hits.length >= max) {
      const retryAfterMs = bucket.hits[0] + windowMs - now;
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1e3).toString());
      res.status(429).json({ error: message });
      return;
    }
    bucket.hits.push(now);
    next();
  };
}
var authRateLimit = createRateLimiter({
  name: "auth",
  windowMs: 60 * 1e3,
  max: 20,
  message: "Too many auth requests. Please wait a minute and try again."
});
var generalApiRateLimit = createRateLimiter({
  name: "api",
  windowMs: 60 * 1e3,
  max: 300
});
var commandRateLimit = createRateLimiter({
  name: "command",
  windowMs: 60 * 1e3,
  max: 120,
  message: "Too many console commands sent. Please slow down."
});
var fileOpsRateLimit = createRateLimiter({
  name: "files",
  windowMs: 60 * 1e3,
  max: 180
});
var nodeOpsRateLimit = createRateLimiter({
  name: "nodes",
  windowMs: 60 * 1e3,
  max: 120
});

// src/server/routes/auth.ts
var router = import_express.default.Router();
router.use(authRateLimit);
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
router.get("/users", requireAuth, getUsers);
router.put("/password", requireAuth, changePassword);
router.put("/username", requireAuth, changeUsername);
var auth_default = router;

// src/server/routes/servers.ts
var import_express2 = __toESM(require("express"), 1);
var import_path10 = __toESM(require("path"), 1);

// src/server/controllers/world.ts
var import_path6 = __toESM(require("path"), 1);
var import_fs_extra6 = __toESM(require("fs-extra"), 1);
var import_prismarine_nbt = __toESM(require("prismarine-nbt"), 1);
var import_util4 = require("util");
var archiverPkg = __toESM(require("archiver"), 1);

// src/server/utils/extract.ts
var import_fs_extra5 = __toESM(require("fs-extra"), 1);
var import_path5 = __toESM(require("path"), 1);
var import_extract_zip = __toESM(require("extract-zip"), 1);
var import_adm_zip = __toESM(require("adm-zip"), 1);
var import_child_process4 = require("child_process");
var import_util3 = require("util");
var execFileAsync3 = (0, import_util3.promisify)(import_child_process4.execFile);
async function extractArchive(targetPath, destDir) {
  if (!import_fs_extra5.default.existsSync(targetPath)) {
    throw new Error(`Archive file does not exist: ${import_path5.default.basename(targetPath)}`);
  }
  const stat = await import_fs_extra5.default.stat(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`'${import_path5.default.basename(targetPath)}' is a directory folder, not a zip archive file.`);
  }
  if (stat.size === 0) {
    throw new Error(`'${import_path5.default.basename(targetPath)}' is an empty file (0 bytes).`);
  }
  await import_fs_extra5.default.ensureDir(destDir);
  const lowerPath = targetPath.toLowerCase();
  if (lowerPath.endsWith(".tar.gz") || lowerPath.endsWith(".tgz") || lowerPath.endsWith(".tar")) {
    try {
      const flag = lowerPath.endsWith(".tar") ? "-xf" : "-xzf";
      await execFileAsync3("tar", [flag, targetPath, "-C", destDir]);
      return { success: true, method: "tar" };
    } catch (tarErr) {
      console.error("tar command failed:", tarErr?.message);
      throw new Error(`Failed to extract tar archive: ${tarErr?.message || tarErr}`);
    }
  }
  let lastError = null;
  try {
    await execFileAsync3("unzip", ["-o", "-q", targetPath, "-d", destDir]);
    return { success: true, method: "system-unzip" };
  } catch (unzipCmdErr) {
    console.warn("System unzip command failed, trying Python zipfile...", unzipCmdErr?.message);
    lastError = unzipCmdErr;
  }
  try {
    await execFileAsync3("python3", ["-m", "zipfile", "-e", targetPath, destDir]);
    return { success: true, method: "python-zipfile" };
  } catch (pyErr) {
    console.warn("Python zipfile failed, trying AdmZip...", pyErr?.message);
    lastError = pyErr;
  }
  try {
    const zip = new import_adm_zip.default(targetPath);
    const resolvedDest = import_path5.default.resolve(destDir);
    for (const entry of zip.getEntries()) {
      const entryDest = import_path5.default.resolve(resolvedDest, entry.entryName);
      const rel = import_path5.default.relative(resolvedDest, entryDest);
      if (rel === ".." || rel.startsWith(`..${import_path5.default.sep}`) || import_path5.default.isAbsolute(rel)) {
        throw new Error(`Archive contains an unsafe path outside the destination: ${entry.entryName}`);
      }
    }
    zip.extractAllTo(destDir, true);
    return { success: true, method: "adm-zip" };
  } catch (admZipErr) {
    console.warn("AdmZip failed, trying extract-zip...", admZipErr?.message);
    lastError = admZipErr;
  }
  try {
    await (0, import_extract_zip.default)(targetPath, { dir: import_path5.default.resolve(destDir) });
    return { success: true, method: "extract-zip" };
  } catch (extractZipErr) {
    console.error("extract-zip failed:", extractZipErr?.message);
    lastError = extractZipErr;
  }
  throw new Error(`Failed to extract archive '${import_path5.default.basename(targetPath)}': ${lastError?.message || "Unsupported archive or corrupted file."}`);
}

// src/server/controllers/world.ts
var archiver = archiverPkg.default || archiverPkg;
var parseNbt = (0, import_util4.promisify)(import_prismarine_nbt.default.parse);
async function getLevelName(serverDir) {
  const propsPath = import_path6.default.join(serverDir, "server.properties");
  if (import_fs_extra6.default.existsSync(propsPath)) {
    const props = await import_fs_extra6.default.readFile(propsPath, "utf-8");
    const match = props.match(/^level-name=(.*)$/m);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  return "world";
}
async function setLevelNameInProperties(serverDir, newLevelName) {
  const propsPath = import_path6.default.join(serverDir, "server.properties");
  if (import_fs_extra6.default.existsSync(propsPath)) {
    let props = await import_fs_extra6.default.readFile(propsPath, "utf-8");
    if (/^level-name=.*$/m.test(props)) {
      props = props.replace(/^level-name=.*$/m, `level-name=${newLevelName}`);
    } else {
      props += `
level-name=${newLevelName}
`;
    }
    await import_fs_extra6.default.writeFile(propsPath, props, "utf-8");
  } else {
    await import_fs_extra6.default.writeFile(propsPath, `level-name=${newLevelName}
`, "utf-8");
  }
}
async function locateMinecraftWorldFolder(rootDir) {
  const candidates = [];
  const evaluateDir = async (dir, depth = 0) => {
    if (depth > 8) return;
    try {
      const entries = await import_fs_extra6.default.readdir(dir, { withFileTypes: true });
      const lowerNames = entries.map((e) => e.name.toLowerCase());
      let score = 0;
      let hasLevelDat = false;
      const hasLevelDatFile = lowerNames.includes("level.dat") || lowerNames.includes("level.dat_old") || lowerNames.includes("level.dat_mcr");
      if (hasLevelDatFile) {
        score += 50;
        hasLevelDat = true;
      }
      const hasRegionDir = entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "region");
      if (hasRegionDir) {
        score += 60;
        try {
          const regionEntries = await import_fs_extra6.default.readdir(import_path6.default.join(dir, entries.find((e) => e.name.toLowerCase() === "region").name));
          if (regionEntries.some((f) => f.toLowerCase().endsWith(".mca") || f.toLowerCase().endsWith(".mcr"))) {
            score += 40;
          }
        } catch {
        }
      }
      if (entries.some((e) => e.name.toLowerCase().endsWith(".mca") || e.name.toLowerCase().endsWith(".mcr"))) {
        score += 60;
      }
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "data")) score += 25;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "datapacks")) score += 25;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "advancements")) score += 25;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "entities")) score += 25;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "poi")) score += 25;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "playerdata")) score += 20;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "stats")) score += 20;
      if (entries.some((e) => e.isDirectory() && (e.name.toLowerCase() === "dim1" || e.name.toLowerCase() === "dim-1" || e.name.toLowerCase() === "dimensions"))) score += 30;
      if (lowerNames.includes("session.lock")) score += 15;
      if (lowerNames.includes("uid.dat")) score += 10;
      if (lowerNames.includes("icon.png") || lowerNames.includes("world_icon.jpeg")) score += 10;
      if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === "db") && (lowerNames.includes("levelname.txt") || hasLevelDatFile)) {
        score += 70;
      }
      if (score >= 20) {
        let detectedName = import_path6.default.basename(dir);
        if (dir === rootDir || detectedName.startsWith("temp_")) {
          detectedName = "world";
        }
        candidates.push({
          worldDir: dir,
          score,
          hasLevelDat,
          detectedName,
          detectedFiles: entries.map((e) => e.name)
        });
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await evaluateDir(import_path6.default.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
    }
  };
  await evaluateDir(rootDir, 0);
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}
var getWorldInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const serverDir = import_path6.default.join(process.cwd(), ".data", "servers", id);
    const levelName = await getLevelName(serverDir);
    const worldDir = import_path6.default.join(serverDir, levelName);
    const levelDatPath = import_path6.default.join(worldDir, "level.dat");
    let worldVersion = "Unknown";
    let dataVersion = 0;
    let worldName = levelName;
    if (import_fs_extra6.default.existsSync(levelDatPath)) {
      try {
        const buffer = await import_fs_extra6.default.readFile(levelDatPath);
        const { parsed } = await parseNbt(buffer);
        if (parsed?.value?.Data?.value) {
          const data = parsed.value.Data.value;
          if (data.Version?.value?.Name?.value) {
            worldVersion = data.Version.value.Name.value;
          }
          if (data.DataVersion?.value) {
            dataVersion = data.DataVersion.value;
          }
          if (data.LevelName?.value) {
            worldName = data.LevelName.value;
          }
        }
      } catch (nbtErr) {
        console.warn("Could not read level.dat for worldInfo:", nbtErr);
      }
    }
    res.json({
      levelName,
      worldName,
      worldVersion,
      dataVersion,
      exists: import_fs_extra6.default.existsSync(worldDir)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var analyzeWorld = async (req, res) => {
  const { id } = req.params;
  const { zipPath } = req.body;
  const serverDir = import_path6.default.join(process.cwd(), ".data", "servers", id);
  try {
    if (!zipPath) {
      return res.status(400).json({ error: "Missing zipPath parameter" });
    }
    let zipFullPath = import_path6.default.join(serverDir, zipPath);
    if (!import_fs_extra6.default.existsSync(zipFullPath)) {
      return res.status(400).json({ error: "Zip file not found in server directory" });
    }
    if ((await import_fs_extra6.default.stat(zipFullPath)).isDirectory()) {
      const filesInside = await import_fs_extra6.default.readdir(zipFullPath);
      const matched = filesInside.find((f) => /\.(zip|tar|gz|tgz|jar|rar|7z)$/i.test(f));
      if (matched) {
        zipFullPath = import_path6.default.join(zipFullPath, matched);
      } else {
        const directDetect = await locateMinecraftWorldFolder(zipFullPath);
        if (directDetect) {
          return res.json({
            status: "valid",
            worldDataVersion: 0,
            worldName: directDetect.detectedName || "world",
            folderName: directDetect.detectedName || "world",
            hasLevelDat: directDetect.hasLevelDat,
            detectedFiles: directDetect.detectedFiles.slice(0, 12)
          });
        }
        return res.status(400).json({ error: "No archive file found inside folder" });
      }
    }
    const tempExtractDir = import_path6.default.join(serverDir, `temp_analyze_${Date.now()}`);
    await extractArchive(zipFullPath, tempExtractDir);
    const detected = await locateMinecraftWorldFolder(tempExtractDir);
    let worldDataVersion = 0;
    let worldName = detected?.detectedName || "world";
    let detectedFiles = [];
    if (detected) {
      detectedFiles = detected.detectedFiles || [];
      const levelDatPath = import_path6.default.join(detected.worldDir, "level.dat");
      if (import_fs_extra6.default.existsSync(levelDatPath)) {
        try {
          const buffer = await import_fs_extra6.default.readFile(levelDatPath);
          const { parsed } = await parseNbt(buffer);
          if (parsed?.value?.Data?.value?.DataVersion?.value) {
            worldDataVersion = parsed.value.Data.value.DataVersion.value;
          }
          if (parsed?.value?.Data?.value?.LevelName?.value) {
            worldName = parsed.value.Data.value.LevelName.value;
          }
        } catch (err) {
          console.warn("Could not parse level.dat nbt during analyze:", err);
        }
      }
    }
    await import_fs_extra6.default.remove(tempExtractDir);
    if (!detected) {
      return res.json({
        status: "invalid",
        message: "No Minecraft world folder found. The archive must contain world files (such as region, data, datapacks, advancements, or level.dat)."
      });
    }
    res.json({
      status: "valid",
      worldDataVersion,
      worldName: worldName || detected.detectedName,
      folderName: detected.detectedName,
      hasLevelDat: detected.hasLevelDat,
      detectedFiles: detectedFiles.slice(0, 12)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var importWorld = async (req, res) => {
  const { id } = req.params;
  const { zipPath, targetFolderName, autoUpdateProperties = true } = req.body;
  const serverDir = import_path6.default.join(process.cwd(), ".data", "servers", id);
  try {
    const serversJSON = await import_fs_extra6.default.readFile(
      import_path6.default.join(process.cwd(), ".data", "servers.json"),
      "utf8"
    );
    const servers = JSON.parse(serversJSON);
    const server = servers.find((s) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.status === "running" || server.status === "starting" || server.status === "online") {
      return res.status(400).json({ error: "Server is currently running. Please stop it first." });
    }
    let zipFullPath = import_path6.default.join(serverDir, zipPath);
    let origPathToDelete = zipFullPath;
    if (!import_fs_extra6.default.existsSync(zipFullPath)) {
      return res.status(400).json({ error: "Zip file not found" });
    }
    if ((await import_fs_extra6.default.stat(zipFullPath)).isDirectory()) {
      const filesInside = await import_fs_extra6.default.readdir(zipFullPath);
      const matched = filesInside.find((f) => /\.(zip|tar|gz|tgz|jar|rar|7z)$/i.test(f));
      if (matched) {
        zipFullPath = import_path6.default.join(zipFullPath, matched);
      }
    }
    const tempExtractDir = import_path6.default.join(serverDir, `temp_world_${Date.now()}`);
    await extractArchive(zipFullPath, tempExtractDir);
    const detected = await locateMinecraftWorldFolder(tempExtractDir);
    if (!detected) {
      await import_fs_extra6.default.remove(tempExtractDir);
      return res.status(400).json({
        error: "Invalid world archive: No Minecraft world folder structure (advancements, data, datapacks, region, level.dat) found."
      });
    }
    const configuredLevel = await getLevelName(serverDir);
    const chosenFolderName = (targetFolderName || "world").trim().replace(/[/\\?%*:|"<>]/g, "-");
    const finalWorldDestination = import_path6.default.join(serverDir, chosenFolderName);
    const backupDir = import_path6.default.join(process.cwd(), ".data", "backups", id);
    await import_fs_extra6.default.ensureDir(backupDir);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupZipPath = import_path6.default.join(
      backupDir,
      `pre_world_import_${timestamp}.zip`
    );
    try {
      const output = import_fs_extra6.default.createWriteStream(backupZipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(output);
      archive.directory(serverDir, false);
      await archive.finalize();
    } catch (bErr) {
      console.warn("Safety backup warning:", bErr);
    }
    if (import_fs_extra6.default.existsSync(finalWorldDestination)) {
      await import_fs_extra6.default.remove(finalWorldDestination);
    }
    await import_fs_extra6.default.ensureDir(finalWorldDestination);
    await import_fs_extra6.default.copy(detected.worldDir, finalWorldDestination);
    await import_fs_extra6.default.remove(tempExtractDir);
    if (import_fs_extra6.default.existsSync(zipFullPath)) {
      await import_fs_extra6.default.remove(zipFullPath);
    }
    if (origPathToDelete !== zipFullPath && import_fs_extra6.default.existsSync(origPathToDelete)) {
      await import_fs_extra6.default.remove(origPathToDelete);
    }
    const lockFiles = [
      import_path6.default.join(finalWorldDestination, "session.lock"),
      import_path6.default.join(serverDir, `${chosenFolderName}_nether`, "session.lock"),
      import_path6.default.join(serverDir, `${chosenFolderName}_the_end`, "session.lock")
    ];
    for (const lockFile of lockFiles) {
      if (import_fs_extra6.default.existsSync(lockFile)) {
        await import_fs_extra6.default.remove(lockFile);
      }
    }
    if (autoUpdateProperties) {
      await setLevelNameInProperties(serverDir, chosenFolderName);
    }
    res.json({
      success: true,
      message: `World files placed directly into '/${chosenFolderName}' in File Manager, level-name updated, and zip file deleted.`,
      worldFolder: chosenFolderName
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to import world" });
  }
};

// src/server/controllers/servers.ts
init_db();

// src/server/services/sftp.ts
var import_ssh2 = __toESM(require("ssh2"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_fs_extra7 = __toESM(require("fs-extra"), 1);
var import_path7 = __toESM(require("path"), 1);
var import_bcrypt = __toESM(require("bcrypt"), 1);
init_db();
var { Server } = import_ssh2.default;
var SFTP_PORT = process.env.NODE_ENV === "production" ? 6868 : 6869;
var HOST_KEYS_DIR = import_path7.default.join(process.cwd(), ".data", "ssh");
var SFTP_DB_FILE = "sftp_users.json";
async function initSFTPServer() {
  await import_fs_extra7.default.ensureDir(HOST_KEYS_DIR);
  let hostKeyPath = import_path7.default.join(HOST_KEYS_DIR, "host_rsa");
  if (!import_fs_extra7.default.existsSync(hostKeyPath)) {
    const { privateKey } = import_crypto2.default.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" }
    });
    import_fs_extra7.default.writeFileSync(hostKeyPath, privateKey);
  }
  if (!import_fs_extra7.default.existsSync(import_path7.default.join(process.cwd(), ".data", SFTP_DB_FILE))) {
    await writeJSON(SFTP_DB_FILE, []);
  }
  const hostKey = import_fs_extra7.default.readFileSync(hostKeyPath);
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    let sftpUser = null;
    client.on("authentication", async (ctx) => {
      try {
        if (ctx.method !== "password") {
          return ctx.reject();
        }
        const users = await readJSON(SFTP_DB_FILE) || [];
        const user = users.find((u) => u.username === ctx.username);
        if (!user) {
          return ctx.reject();
        }
        const match = await import_bcrypt.default.compare(ctx.password, user.passwordHash);
        if (match) {
          sftpUser = user;
          ctx.accept();
        } else {
          ctx.reject();
        }
      } catch (err) {
        console.error("SFTP auth error:", err);
        ctx.reject();
      }
    });
    client.on("ready", () => {
      client.on("session", (accept, reject) => {
        const session = accept();
        session.on("sftp", (accept2, reject2) => {
          if (!sftpUser) {
            return reject2();
          }
          const sftpStream = accept2();
          const userDir = import_path7.default.join(process.cwd(), ".data", "servers", sftpUser.serverId);
          console.log("SFTP session started for user", sftpUser.username);
          sftpStream.on("OPEN", (reqid, filename, flags, attrs) => {
            sftpStream.status(reqid, 4);
          });
          sftpStream.on("READDIR", (reqid, handle) => {
            sftpStream.status(reqid, 4);
          });
          sftpStream.on("STAT", (reqid, path12) => {
            sftpStream.status(reqid, 4);
          });
        });
      });
    });
    client.on("error", (err) => {
    });
  });
  server.listen(SFTP_PORT, "0.0.0.0", () => {
    console.log(`SFTP server listening on port ${SFTP_PORT}`);
  });
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
async function createSftpUser(serverId) {
  const users = await readJSON(SFTP_DB_FILE) || [];
  if (users.find((u) => u.serverId === serverId)) {
    throw new Error("SFTP user already exists for this server");
  }
  const username = "srv_" + import_crypto2.default.randomBytes(3).toString("hex");
  const password = import_crypto2.default.randomBytes(8).toString("hex") + "!";
  const passwordHash = await import_bcrypt.default.hash(password, 10);
  const newUser = {
    id: import_crypto2.default.randomUUID(),
    serverId,
    username,
    passwordHash,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  users.push(newUser);
  await writeJSON(SFTP_DB_FILE, users);
  return { username, password };
}
async function resetSftpPassword(serverId) {
  const users = await readJSON(SFTP_DB_FILE) || [];
  const userIndex = users.findIndex((u) => u.serverId === serverId);
  if (userIndex === -1) {
    throw new Error("SFTP user not found");
  }
  const password = import_crypto2.default.randomBytes(8).toString("hex") + "!";
  users[userIndex].passwordHash = await import_bcrypt.default.hash(password, 10);
  users[userIndex].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await writeJSON(SFTP_DB_FILE, users);
  return { username: users[userIndex].username, password };
}
async function getSftpUser(serverId) {
  const users = await readJSON(SFTP_DB_FILE) || [];
  return users.find((u) => u.serverId === serverId);
}
async function deleteSftpUser(serverId) {
  const users = await readJSON(SFTP_DB_FILE) || [];
  const filtered = users.filter((u) => u.serverId !== serverId);
  await writeJSON(SFTP_DB_FILE, filtered);
}

// src/server/controllers/servers.ts
var import_crypto3 = __toESM(require("crypto"), 1);
var import_fs_extra8 = __toESM(require("fs-extra"), 1);
var import_path9 = __toESM(require("path"), 1);
var import_archiver = require("archiver");
var import_extract_zip2 = __toESM(require("extract-zip"), 1);

// src/server/utils/serverPath.ts
var import_path8 = __toESM(require("path"), 1);
var SERVERS_ROOT = import_path8.default.resolve(process.cwd(), ".data", "servers");
var SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
var InvalidServerPathError = class extends Error {
  status;
  constructor(message) {
    super(message);
    this.name = "InvalidServerPathError";
    this.status = 403;
  }
};
function isSafeServerId(id) {
  return typeof id === "string" && SAFE_ID.test(id);
}
function getServerRootDir(id) {
  if (!isSafeServerId(id)) {
    throw new InvalidServerPathError("Invalid server id");
  }
  return import_path8.default.join(SERVERS_ROOT, id);
}
function resolveServerPath(id, relativePath = "/") {
  const root = getServerRootDir(id);
  const target = import_path8.default.normalize(import_path8.default.join(root, String(relativePath ?? "/")));
  const rel = import_path8.default.relative(root, target);
  const escapes = rel === ".." || rel.startsWith(`..${import_path8.default.sep}`) || import_path8.default.isAbsolute(rel);
  if (escapes) {
    throw new InvalidServerPathError("Path escapes server directory");
  }
  return target;
}
var BACKUPS_ROOT = import_path8.default.resolve(process.cwd(), ".data", "backups");
function resolveBackupPath(id, filename) {
  if (!isSafeServerId(id)) {
    throw new InvalidServerPathError("Invalid server id");
  }
  const root = import_path8.default.join(BACKUPS_ROOT, id);
  const target = import_path8.default.normalize(import_path8.default.join(root, String(filename ?? "")));
  const rel = import_path8.default.relative(root, target);
  const escapes = rel === "" || rel === ".." || rel.startsWith(`..${import_path8.default.sep}`) || import_path8.default.isAbsolute(rel) || rel.includes(import_path8.default.sep);
  if (escapes) {
    throw new InvalidServerPathError("Invalid backup filename");
  }
  return target;
}

// src/server/controllers/servers.ts
function safePath(res, id, relativePath) {
  try {
    return resolveServerPath(id, relativePath);
  } catch (e) {
    if (e instanceof InvalidServerPathError) {
      res.status(403).json({ error: "Invalid path" });
      return null;
    }
    throw e;
  }
}
function safeBackupPath(res, id, filename) {
  try {
    return resolveBackupPath(id, filename);
  } catch (e) {
    if (e instanceof InvalidServerPathError) {
      res.status(403).json({ error: "Invalid path" });
      return null;
    }
    throw e;
  }
}
var getServers = async (req, res) => {
  const user = req.user;
  const servers = await readJSON("servers.json") || [];
  const userServers = user.role === "admin" || user.role === "owner" ? servers : servers.filter((s) => s.owner === user.id);
  const updatedServers = await Promise.all(userServers.map(async (server) => {
    if (server.containerId) {
      const status = await getServerRuntimeStatus(server);
      const isRunning = !!status?.State?.Running;
      server.status = isRunning ? "online" : "offline";
      server.startedAt = isRunning ? status?.State?.StartedAt || server.startedAt || (/* @__PURE__ */ new Date()).toISOString() : null;
      if (server.runtimeType === "local") {
        const info = getLocalProcessInfo(server.id);
        if (info) {
          server.pid = info.pid;
          server.jarPath = info.jarPath;
          server.logPath = info.logPath;
        }
      }
    }
    return server;
  }));
  res.json(updatedServers);
};
var getServer = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const status = await getServerRuntimeStatus(server);
  const isRunning = !!status?.State?.Running;
  server.status = isRunning ? "online" : "offline";
  server.startedAt = isRunning ? status?.State?.StartedAt || server.startedAt || (/* @__PURE__ */ new Date()).toISOString() : null;
  if (server.runtimeType === "local") {
    const info = getLocalProcessInfo(server.id);
    if (info) {
      server.pid = info.pid;
      server.jarPath = info.jarPath;
      server.logPath = info.logPath;
    }
  }
  res.json(server);
};
var getServerStats = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const status = await getServerRuntimeStatus(server);
  const isRunning = !!status?.State?.Running;
  const startedAt = isRunning ? status?.State?.StartedAt || server.startedAt || null : null;
  let uptimeSeconds = 0;
  if (isRunning && startedAt) {
    const startedMs = new Date(startedAt).getTime();
    if (!isNaN(startedMs) && startedMs > 0) {
      uptimeSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1e3));
    }
  }
  if (server.containerId) {
    const stats = await getServerRuntimeStats(server);
    res.json({
      ...stats,
      isRunning,
      status: isRunning ? "online" : "offline",
      startedAt,
      uptimeSeconds,
      limitRam: server.ram ? server.ram * 1024 : 1024,
      limitCpu: server.cpu || 100,
      limitDisk: server.disk || 10
    });
  } else {
    res.json({
      cpu: 0,
      ram: 0,
      disk: 0,
      isRunning: false,
      status: "offline",
      startedAt: null,
      uptimeSeconds: 0,
      limitRam: server.ram ? server.ram * 1024 : 1024,
      limitCpu: server.cpu || 100,
      limitDisk: server.disk || 10
    });
  }
};
var checkPort = async (req, res) => {
  const { port } = req.query;
  if (!port) return res.status(400).json({ error: "Port is required" });
  const servers = await readJSON("servers.json") || [];
  const inUse = servers.some((s) => s.port == port);
  res.json({ inUse });
};
var isCreatingServer = false;
var createServer = async (req, res) => {
  if (isCreatingServer) {
    return res.status(409).json({ error: "Server creation in progress, please try again in a few seconds." });
  }
  isCreatingServer = true;
  try {
    const user = req.user;
    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can create servers" });
    }
    const { name, ram, port, version, theme, cpu, disk, owner, ownerId, ipAlias, type, nodeId, runtimeType } = req.body;
    if (!name || !ram || !port) {
      res.status(400).json({ error: "Missing required fields (name, ram, port)" });
      return;
    }
    const settings = await readJSON("settings.json") || {};
    const isDev = process.env.NODE_ENV === "development" || process.env.PORT === "30000" || process.env.PANEL_DEV_MODE === "true" || process.env.DEV_MODE === "true";
    const defaultRuntime = settings.defaultRuntime || process.env.DEFAULT_RUNTIME || "docker";
    const finalRuntimeType = isDev && runtimeType ? runtimeType : defaultRuntime;
    const id = import_crypto3.default.randomUUID();
    const serverData = {
      id,
      name,
      owner: owner || ownerId || user.id,
      // Support assigning owner at creation
      ram,
      cpu: cpu || 100,
      disk: disk || 10,
      port,
      ipAlias: ipAlias || "",
      runtimeType: finalRuntimeType,
      nodeId: nodeId || "local",
      type: type || "PAPER",
      version: version || "latest",
      theme: theme || "default",
      status: "installing",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      containerId: null
    };
    const servers = await readJSON("servers.json") || [];
    if (servers.find((s) => s.port == port)) {
      res.status(400).json({ error: "Port is already in use by another server." });
      return;
    }
    servers.push(serverData);
    await writeJSON("servers.json", servers);
    try {
      const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
      await import_fs_extra8.default.ensureDir(serverDir);
      const upperType = (type || "PAPER").toUpperCase();
      if (upperType === "NODEJS" || upperType === "NODE") {
        const indexPath = import_path9.default.join(serverDir, "index.js");
        const pkgPath = import_path9.default.join(serverDir, "package.json");
        if (!import_fs_extra8.default.existsSync(indexPath)) {
          await import_fs_extra8.default.writeFile(indexPath, `// Node.js Application on Proto Panel
const http = require('http');
const port = process.env.PORT || process.env.SERVER_PORT || ${port};

console.log('==============================================');
console.log('\u{1F680} Node.js Application Running on port ' + port);
console.log('Node Version: ' + process.version);
console.log('Upload your files in File Manager to customize!');
console.log('==============================================');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    runtime: 'node.js',
    time: new Date().toISOString()
  }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(\`[Server] Listening on http://0.0.0.0:\${port}\`);
});
`);
        }
        if (!import_fs_extra8.default.existsSync(pkgPath)) {
          await import_fs_extra8.default.writeFile(pkgPath, JSON.stringify({
            name: name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "node-app",
            version: "1.0.0",
            description: "Node.js application hosted on Proto Panel",
            main: "index.js",
            scripts: {
              "start": "node index.js"
            },
            dependencies: {}
          }, null, 2));
        }
      } else if (upperType === "PYTHON" || upperType === "PYTHON3") {
        const mainPath = import_path9.default.join(serverDir, "main.py");
        const reqPath = import_path9.default.join(serverDir, "requirements.txt");
        if (!import_fs_extra8.default.existsSync(mainPath)) {
          await import_fs_extra8.default.writeFile(mainPath, `# Python Application on Proto Panel
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get("SERVER_PORT", os.environ.get("PORT", ${port})))

print("==============================================", flush=True)
print("\u{1F40D} Python Application Running", flush=True)
print(f"Python Version: {sys.version}", flush=True)
print(f"Listening Port: {port}", flush=True)
print("Upload your files in File Manager to customize!", flush=True)
print("==============================================", flush=True)

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status": "online", "runtime": "python"}')

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)

server = HTTPServer(('0.0.0.0', port), RequestHandler)
print(f"[Server] Listening on http://0.0.0.0:{port}", flush=True)

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\\nStopping server...", flush=True)
    server.server_close()
`);
        }
        if (!import_fs_extra8.default.existsSync(reqPath)) {
          await import_fs_extra8.default.writeFile(reqPath, "# Add python dependencies here\n");
        }
      } else {
        const eulaPath = import_path9.default.join(serverDir, "eula.txt");
        if (!import_fs_extra8.default.existsSync(eulaPath)) {
          await import_fs_extra8.default.writeFile(eulaPath, "eula=true\n");
        }
        const propsPath = import_path9.default.join(serverDir, "server.properties");
        if (!import_fs_extra8.default.existsSync(propsPath)) {
          await import_fs_extra8.default.writeFile(propsPath, `server-port=${port}
motd=${name || "A Minecraft Server"}
`);
        }
        const jarPath = import_path9.default.join(serverDir, "server.jar");
        if (!import_fs_extra8.default.existsSync(jarPath)) {
          console.log(`[createServer] Initiating JAR download for ${type || "PAPER"} (${version || "latest"})...`);
          downloadJar(type || "PAPER", version || "latest", jarPath).catch((err) => {
            console.warn("[createServer] Initial JAR download notice:", err?.message || err);
          });
        }
        await import_fs_extra8.default.chmod(serverDir, 511).catch(() => {
        });
      }
    } catch (seedErr) {
      console.warn("Failed to pre-seed starter files:", seedErr);
    }
    try {
      const containerId = await createServerRuntime(serverData);
      serverData.containerId = containerId;
      serverData.status = "offline";
      await writeJSON("servers.json", Object.assign(servers, servers.map((s) => s.id === id ? serverData : s)));
      await createSftpUser(id).catch((e) => console.error("SFTP user creation failed:", e));
      res.json(serverData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  } finally {
    isCreatingServer = false;
  }
};
var updateOwner = async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Only admins can update owner" });
  }
  const { id } = req.params;
  const { owner } = req.body;
  if (!owner) return res.status(400).json({ error: "Owner required" });
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  server.owner = owner;
  await writeJSON("servers.json", servers);
  res.json({ success: true });
};
var updateIpAlias = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { ipAlias } = req.body;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  server.ipAlias = ipAlias;
  await writeJSON("servers.json", servers);
  res.json({ success: true });
};
var getDomainStatus = async (req, res) => {
  const { id } = req.params;
  const domain = String(req.query.domain || "").trim().toLowerCase();
  if (!domain) return res.status(400).json({ error: "domain query param required" });
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    return res.status(400).json({ error: "That doesn't look like a valid domain (e.g. play.example.com)" });
  }
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  const nodes = await readJSON("nodes.json") || [];
  const node = nodes.find((n) => n.id === server.nodeId);
  const targetHost = (server.nodeId && server.nodeId !== "local" ? node?.ip : null) || process.env.PANEL_PUBLIC_IP || null;
  const targetPort = server.port;
  const dns = await import("dns/promises");
  const srvName = `_minecraft._tcp.${domain}`;
  const result = {
    domain,
    srvRecordName: srvName,
    expected: { host: targetHost, port: targetPort },
    verified: false,
    checks: { srv: null, resolvedIp: null },
    instructions: targetHost ? `Create a DNS SRV record:
  Name:     _minecraft._tcp.${domain}
  Priority: 0   Weight: 5   Port: ${targetPort}
  Target:   <a hostname that A-records to ${targetHost}>` : "This server's node has no public IP configured yet \u2014 set one on the node before a domain can be verified."
  };
  try {
    const srvRecords = await dns.resolveSrv(srvName);
    result.checks.srv = srvRecords;
    const match = srvRecords.find((r) => r.port === targetPort);
    if (match) {
      try {
        const addrs = await dns.resolve4(match.name);
        result.checks.resolvedIp = addrs;
        result.verified = !!targetHost && addrs.includes(targetHost);
      } catch {
        result.checks.resolvedIp = [];
      }
    }
  } catch {
    result.checks.srv = [];
  }
  if (!result.verified) {
    result.reason = !result.checks.srv?.length ? "No SRV record found yet (DNS changes can take a few minutes to propagate)." : result.checks.resolvedIp === null || result.checks.resolvedIp.length === 0 ? "SRV record found, but its target hostname doesn't resolve." : "SRV record found, but it points at a different IP/port than this server.";
  }
  res.json(result);
};
var deleteServer = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }
    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can delete servers" });
    }
    if (server.containerId) {
      await deleteServerRuntime(server);
    }
    servers = servers.filter((s) => s.id !== id);
    await writeJSON("servers.json", servers);
    const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
    try {
      await import_fs_extra8.default.remove(serverDir);
    } catch (e) {
      console.error("Failed to remove server directory", e);
    }
    await deleteSftpUser(id).catch((e) => console.error("SFTP user deletion failed:", e));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
var startServer = async (req, res) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!server.containerId) {
      server.containerId = await createServerRuntime(server);
      await writeJSON("servers.json", servers);
    }
    if (server.suspended) {
      return res.status(403).json({ error: "Server is suspended" });
    }
    try {
      const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", server.id);
      await import_fs_extra8.default.ensureDir(serverDir);
      await import_fs_extra8.default.chmod(serverDir, 511).catch(() => {
      });
      const targetType = (server.type || "PAPER").toUpperCase();
      const isGeneric = ["NODEJS", "NODE", "PYTHON", "PYTHON3"].includes(targetType);
      if (!isGeneric) {
        const jarPath = import_path9.default.join(serverDir, "server.jar");
        if (!import_fs_extra8.default.existsSync(jarPath)) {
          const { panelEvents: panelEvents2 } = await Promise.resolve().then(() => (init_events(), events_exports));
          panelEvents2.emit("log", id, `[Proto System] Pre-flight: server.jar not found. Downloading ${server.type} (${server.version || "latest"})...\r
`);
          try {
            await downloadJar(server.type, server.version || "latest", jarPath);
            panelEvents2.emit("log", id, `[Proto System] server.jar downloaded successfully.\r
`);
          } catch (dlErr) {
            panelEvents2.emit("log", id, `[Proto System] Notice: Automatic JAR download error: ${dlErr?.message || dlErr}\r
`);
          }
        }
        const eulaPath = import_path9.default.join(serverDir, "eula.txt");
        if (!import_fs_extra8.default.existsSync(eulaPath)) {
          await import_fs_extra8.default.writeFile(eulaPath, "eula=true\n");
        }
        const propsPath = import_path9.default.join(serverDir, "server.properties");
        if (!import_fs_extra8.default.existsSync(propsPath)) {
          await import_fs_extra8.default.writeFile(propsPath, `server-port=${server.port}
motd=${server.name || "A Minecraft Server"}
`);
        }
        await import_fs_extra8.default.chmod(eulaPath, 511).catch(() => {
        });
        await import_fs_extra8.default.chmod(propsPath, 511).catch(() => {
        });
        if (import_fs_extra8.default.existsSync(jarPath)) {
          await import_fs_extra8.default.chmod(jarPath, 511).catch(() => {
          });
        }
      }
      const lockFiles = [
        import_path9.default.join(serverDir, "world", "session.lock"),
        import_path9.default.join(serverDir, "world_nether", "session.lock"),
        import_path9.default.join(serverDir, "world_the_end", "session.lock")
      ];
      for (const lockFile of lockFiles) {
        if (import_fs_extra8.default.existsSync(lockFile)) {
          try {
            await import_fs_extra8.default.remove(lockFile);
          } catch (e) {
            return res.status(500).json({ error: `Startup Diagnostic Failed: Permission denied when removing stale ${lockFile}` });
          }
        }
      }
      const worldPath = import_path9.default.join(serverDir, "world");
      if (import_fs_extra8.default.existsSync(worldPath)) {
        try {
          await import_fs_extra8.default.access(worldPath, import_fs_extra8.default.constants.R_OK | import_fs_extra8.default.constants.W_OK);
        } catch (e) {
          return res.status(500).json({ error: "Startup Diagnostic Failed: Permission denied on world folder." });
        }
      }
    } catch (preflightErr) {
      console.error(preflightErr);
    }
    try {
      const io2 = req.app.get("io");
      if (io2) io2.to(`server_${id}`).emit("clear_logs");
      await startServerRuntime(server);
      server.status = "online";
      server.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await writeJSON("servers.json", servers);
    } catch (startErr) {
      if (startErr.statusCode === 404 || startErr.message && startErr.message.toLowerCase().includes("no such container")) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        server.containerId = await createServerRuntime(server);
        await startServerRuntime(server);
        server.status = "online";
        server.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        await writeJSON("servers.json", servers);
      } else {
        throw startErr;
      }
    }
    await attachServerRuntimeSocket(server, server.id);
    res.json({ success: true, startedAt: server.startedAt });
  } catch (err) {
    console.error("Start server error:", err);
    res.status(500).json({ error: err.message || "Failed to start server" });
  }
};
var stopServer = async (req, res) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      await stopServerRuntime(server);
    } catch (stopErr) {
      if (stopErr.statusCode === 404 || stopErr.message && stopErr.message.toLowerCase().includes("no such container")) {
        console.log(`Container already missing for server ${server.id}. Assuming stopped.`);
      } else {
        throw stopErr;
      }
    }
    server.status = "offline";
    server.startedAt = null;
    await writeJSON("servers.json", servers);
    res.json({ success: true });
  } catch (err) {
    console.error("Stop server error:", err);
    res.status(500).json({ error: err.message || "Failed to stop server" });
  }
};
var restartServer = async (req, res) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const io2 = req.app.get("io");
      if (io2) io2.to(`server_${id}`).emit("clear_logs");
      await restartServerRuntime(server);
      server.status = "online";
      server.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await writeJSON("servers.json", servers);
    } catch (startErr) {
      if (startErr.statusCode === 404 || startErr.message && startErr.message.toLowerCase().includes("no such container")) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        server.containerId = await createServerRuntime(server);
        await startServerRuntime(server);
        server.status = "online";
        server.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        await writeJSON("servers.json", servers);
      } else {
        throw startErr;
      }
    }
    await attachServerRuntimeSocket(server, server.id);
    res.json({ success: true, startedAt: server.startedAt });
  } catch (err) {
    console.error("Restart server error:", err);
    res.status(500).json({ error: err.message || "Failed to restart server" });
  }
};
var sendCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const { command } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    await sendServerRuntimeCommand(server, command);
    res.json({ success: true });
  } catch (err) {
    console.error("Command error:", err);
    res.status(500).json({ error: err.message || "Failed to send command" });
  }
};
var changeServerVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { version, type, javaVersion, dockerImage, startupCommand, serverJar } = req.body;
    const user = req.user;
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }
    const newVersion = version || server.version;
    if (!newVersion) return res.status(400).json({ error: "Version is required" });
    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Only admins or owners can change version or runtime" });
    }
    if (server.containerId) {
      const status = await getServerRuntimeStatus(server);
      if (status?.State?.Running) {
        return res.status(400).json({ error: "Server must be stopped before changing runtime or version. Please stop the server first." });
      }
      await deleteServerRuntime(server);
    }
    const typeChanged = type && type !== server.type;
    const versionChanged = version && version !== server.version;
    if (typeChanged || versionChanged) {
      const serverDir2 = import_path9.default.join(process.cwd(), ".data", "servers", id);
      const filesToDelete = [
        "paper-global.yml",
        "paper-world-defaults.yml",
        "paper.yml",
        "config/paper-global.yml",
        "config/paper-world-defaults.yml",
        "world/data/random_sequences.dat"
      ];
      for (const file of filesToDelete) {
        const filePath = import_path9.default.join(serverDir2, file);
        try {
          if (await import_fs_extra8.default.pathExists(filePath)) {
            await import_fs_extra8.default.remove(filePath);
          }
        } catch (e) {
          console.error(`Failed to delete ${file}`, e);
        }
      }
    }
    server.version = newVersion;
    if (type) {
      server.type = type;
    }
    if (javaVersion !== void 0) {
      server.javaVersion = javaVersion;
    }
    if (dockerImage !== void 0) {
      server.dockerImage = dockerImage;
    }
    if (startupCommand !== void 0) {
      server.startupCommand = startupCommand;
    }
    if (serverJar !== void 0) {
      server.serverJar = serverJar;
    }
    const targetType = (server.type || "PAPER").toUpperCase();
    const isGeneric = ["NODEJS", "NODE", "PYTHON", "PYTHON3"].includes(targetType);
    const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
    if (!isGeneric && (typeChanged || versionChanged)) {
      const jarPath = import_path9.default.join(serverDir, server.serverJar || "server.jar");
      try {
        await downloadJar(server.type, server.version, jarPath);
      } catch (dlErr) {
        console.warn("[changeServerVersion] Failed to download new jar:", dlErr);
      }
    }
    const newContainerId = await createServerRuntime(server);
    server.containerId = newContainerId;
    await writeJSON("servers.json", servers);
    res.json({
      success: true,
      version: server.version,
      type: server.type,
      javaVersion: server.javaVersion,
      dockerImage: server.dockerImage,
      startupCommand: server.startupCommand,
      serverJar: server.serverJar
    });
  } catch (err) {
    console.error("Change version error", err);
    res.status(500).json({ error: err.message });
  }
};
var getFiles = async (req, res) => {
  const { id } = req.params;
  const dirPath = req.query.path ? String(req.query.path) : "/";
  const targetPath = safePath(res, id, dirPath);
  if (!targetPath) return;
  try {
    const stats = await import_fs_extra8.default.stat(targetPath).catch(() => null);
    if (!stats) {
      return res.json([]);
    }
    if (stats.isFile()) {
      const content = await import_fs_extra8.default.readFile(targetPath, "utf-8");
      return res.json({ isFile: true, content });
    }
    const files = await import_fs_extra8.default.readdir(targetPath, { withFileTypes: true });
    res.json(files.map((f) => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      size: f.isDirectory() ? 0 : import_fs_extra8.default.statSync(import_path9.default.join(targetPath, f.name)).size
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var uploadChunk = async (req, res) => {
  const { id } = req.params;
  const { uploadId, chunkIndex, fileName, path: dirPath } = req.body;
  if (!req.file || !uploadId || chunkIndex === void 0 || !fileName) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  if (typeof fileName !== "string" || fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
    return res.status(400).json({ error: "Invalid file name" });
  }
  const targetPath = safePath(res, id, dirPath || "/");
  if (!targetPath) return;
  const partFilePath = import_path9.default.join(targetPath, fileName + ".part");
  try {
    await import_fs_extra8.default.ensureDir(targetPath);
    if (String(chunkIndex) === "0") {
      if (import_fs_extra8.default.existsSync(partFilePath)) {
        await import_fs_extra8.default.remove(partFilePath);
      }
    }
    const chunkData = await import_fs_extra8.default.readFile(req.file.path);
    await import_fs_extra8.default.appendFile(partFilePath, chunkData);
    await import_fs_extra8.default.remove(req.file.path).catch(() => {
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var redownloadJar = async (req, res) => {
  const { id } = req.params;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  const targetType = (server.type || "PAPER").toUpperCase();
  const isGeneric = ["NODEJS", "NODE", "PYTHON", "PYTHON3"].includes(targetType);
  if (isGeneric) {
    return res.status(400).json({ error: "Reinstall JAR is only applicable for Minecraft and Proxy servers" });
  }
  const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
  await import_fs_extra8.default.ensureDir(serverDir);
  await import_fs_extra8.default.chmod(serverDir, 511).catch(() => {
  });
  const jarPath = import_path9.default.join(serverDir, "server.jar");
  try {
    const { panelEvents: panelEvents2 } = await Promise.resolve().then(() => (init_events(), events_exports));
    panelEvents2.emit("log", id, `[Proto System] Downloading ${server.type} (${server.version || "latest"}) server JAR...\r
`);
    await downloadJar(server.type, server.version || "latest", jarPath);
    await import_fs_extra8.default.chmod(jarPath, 511).catch(() => {
    });
    const eulaPath = import_path9.default.join(serverDir, "eula.txt");
    if (!import_fs_extra8.default.existsSync(eulaPath)) {
      await import_fs_extra8.default.writeFile(eulaPath, "eula=true\n");
    }
    const propsPath = import_path9.default.join(serverDir, "server.properties");
    if (!import_fs_extra8.default.existsSync(propsPath)) {
      await import_fs_extra8.default.writeFile(propsPath, `server-port=${server.port}
motd=${server.name || "A Minecraft Server"}
`);
    }
    await import_fs_extra8.default.chmod(eulaPath, 511).catch(() => {
    });
    await import_fs_extra8.default.chmod(propsPath, 511).catch(() => {
    });
    if (server.nodeId && server.nodeId !== "local" && server.containerId) {
      try {
        const docker = await getDocker(server.nodeId);
        const mountPath = (server.dockerImage || "").includes("pterodactyl") ? "/home/container" : "/data";
        await pushDirToContainer(docker, server.containerId, serverDir, mountPath);
      } catch (syncErr) {
        console.warn("[redownloadJar] Failed to sync files to remote node:", syncErr);
      }
    }
    if (server.runtimeType !== "local" && server.containerId) {
      try {
        const status = await getServerRuntimeStatus(server);
        if (!status?.State?.Running) {
          panelEvents2.emit("log", id, `[Proto System] Refreshing Docker container environment...\r
`);
          await deleteServerRuntime(server);
          server.containerId = await createServerRuntime(server);
          await writeJSON("servers.json", servers);
        }
      } catch (containerErr) {
        console.warn("[redownloadJar] Container refresh notice:", containerErr);
      }
    }
    panelEvents2.emit("log", id, `[Proto System] Server JAR successfully installed and configured!\r
`);
    res.json({ success: true, message: "Server JAR downloaded and configured successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to download JAR" });
  }
};
var completeUpload = async (req, res) => {
  const { id } = req.params;
  const { uploadId, fileName, path: dirPath, totalChunks } = req.body;
  if (!uploadId || !fileName || !totalChunks) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  if (typeof fileName !== "string" || fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
    return res.status(400).json({ error: "Invalid file name" });
  }
  const targetPath = safePath(res, id, dirPath || "/");
  if (!targetPath) return;
  const finalFilePath = import_path9.default.join(targetPath, fileName);
  const partFilePath = import_path9.default.join(targetPath, fileName + ".part");
  try {
    if (import_fs_extra8.default.existsSync(partFilePath)) {
      await import_fs_extra8.default.move(partFilePath, finalFilePath, { overwrite: true });
    } else {
      throw new Error("Part file missing");
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var uploadFile = async (req, res) => {
  const { id } = req.params;
  let dirPath = req.body.path || "/";
  if (req.file) {
    if (dirPath === req.file.originalname || dirPath === `/${req.file.originalname}` || dirPath === `\\${req.file.originalname}`) {
      dirPath = "/";
    } else if (dirPath.endsWith(req.file.originalname)) {
      dirPath = import_path9.default.dirname(dirPath);
    }
  }
  const targetPath = safePath(res, id, dirPath);
  if (!targetPath) return;
  if (req.file) {
    await import_fs_extra8.default.ensureDir(targetPath);
    const safeName = import_path9.default.basename(req.file.originalname);
    const destFile = import_path9.default.join(targetPath, safeName);
    await import_fs_extra8.default.move(req.file.path, destFile, { overwrite: true });
  }
  res.json({ success: true });
};
var deleteFile = async (req, res) => {
  const { id } = req.params;
  const filePaths = req.body.paths || (req.body.path ? [req.body.path] : []);
  try {
    for (const filePath of filePaths) {
      const targetPath = safePath(res, id, filePath);
      if (!targetPath) return;
      await import_fs_extra8.default.remove(targetPath);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var zipFiles = async (req, res) => {
  const { id } = req.params;
  const { dirPath, fileNames, outputName } = req.body;
  const baseDir = safePath(res, id, dirPath);
  if (!baseDir) return;
  const outZipPath = import_path9.default.join(baseDir, outputName || "archive.zip");
  try {
    const output = import_fs_extra8.default.createWriteStream(outZipPath);
    const archive = new import_archiver.ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => {
      res.json({ success: true, filename: outputName || "archive.zip" });
    });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(output);
    for (const name of fileNames) {
      const filePath = safePath(res, id, import_path9.default.join(dirPath || "/", name));
      if (!filePath) return;
      const stat = await import_fs_extra8.default.stat(filePath);
      if (stat.isDirectory()) {
        archive.directory(filePath, name);
      } else {
        archive.file(filePath, { name });
      }
    }
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
var renameFile = async (req, res) => {
  const { id } = req.params;
  const { oldPath, newPath } = req.body;
  const targetOldPath = safePath(res, id, oldPath);
  if (!targetOldPath) return;
  const targetNewPath = safePath(res, id, newPath);
  if (!targetNewPath) return;
  try {
    await import_fs_extra8.default.rename(targetOldPath, targetNewPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var downloadFile = async (req, res) => {
  const { id } = req.params;
  let rawPaths = [];
  if (req.query.paths) {
    rawPaths = Array.isArray(req.query.paths) ? req.query.paths : String(req.query.paths).split(",");
  } else if (req.query.path) {
    rawPaths = [String(req.query.path)];
  }
  if (rawPaths.length === 0) {
    return res.status(400).json({ error: "No path specified" });
  }
  try {
    if (rawPaths.length === 1) {
      const singlePath = rawPaths[0];
      const targetPath = safePath(res, id, singlePath);
      if (!targetPath) return;
      const stat = await import_fs_extra8.default.stat(targetPath);
      if (!stat.isDirectory()) {
        return res.download(targetPath, import_path9.default.basename(targetPath));
      }
    }
    const zipName = rawPaths.length === 1 ? `${import_path9.default.basename(rawPaths[0]) || "folder"}.zip` : `download-${Date.now()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
    const archive = new import_archiver.ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(res);
    for (const relPath of rawPaths) {
      let targetPath;
      try {
        targetPath = resolveServerPath(id, relPath);
      } catch {
        continue;
      }
      const itemName = import_path9.default.basename(targetPath);
      const stat = await import_fs_extra8.default.stat(targetPath).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) {
        archive.directory(targetPath, itemName);
      } else {
        archive.file(targetPath, { name: itemName });
      }
    }
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
var unzipFile = async (req, res) => {
  const { id } = req.params;
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: "Archive file path is required" });
  }
  let targetPath = safePath(res, id, filePath);
  if (!targetPath) return;
  if (!import_fs_extra8.default.existsSync(targetPath)) {
    return res.status(404).json({ error: `File not found: ${filePath}` });
  }
  try {
    const stat = await import_fs_extra8.default.stat(targetPath);
    if (stat.isDirectory()) {
      const baseName = import_path9.default.basename(targetPath);
      const nestedFilePath = import_path9.default.join(targetPath, baseName);
      if (import_fs_extra8.default.existsSync(nestedFilePath) && (await import_fs_extra8.default.stat(nestedFilePath)).isFile()) {
        targetPath = nestedFilePath;
      } else {
        const filesInside = await import_fs_extra8.default.readdir(targetPath);
        const archiveInside = filesInside.find((f) => /\.(zip|tar|gz|tgz|jar|rar|7z)$/i.test(f));
        if (archiveInside) {
          targetPath = import_path9.default.join(targetPath, archiveInside);
        } else {
          return res.status(400).json({ error: `'${filePath}' is a folder directory, not an archive file.` });
        }
      }
    }
    const destDir = import_path9.default.dirname(targetPath);
    const result = await extractArchive(targetPath, destDir);
    res.json({ success: true, method: result.method });
  } catch (e) {
    console.error("Extraction error:", e);
    res.status(500).json({ error: e.message || "Failed to extract archive file" });
  }
};
var createFile = async (req, res) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const targetPath = safePath(res, id, filePath);
  if (!targetPath) return;
  try {
    await import_fs_extra8.default.writeFile(targetPath, "", "utf-8");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var createDirectory = async (req, res) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const targetPath = safePath(res, id, filePath);
  if (!targetPath) return;
  try {
    await import_fs_extra8.default.mkdir(targetPath, { recursive: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var saveFileContent = async (req, res) => {
  const { id } = req.params;
  const { filePath, content } = req.body;
  const targetPath = safePath(res, id, filePath);
  if (!targetPath) return;
  try {
    await import_fs_extra8.default.writeFile(targetPath, content, "utf-8");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var getBackups = async (req, res) => {
  const { id } = req.params;
  const backupsDir = import_path9.default.join(process.cwd(), ".data", "backups", id);
  await import_fs_extra8.default.ensureDir(backupsDir);
  try {
    const files = await import_fs_extra8.default.readdir(backupsDir);
    const backups = [];
    for (const file of files) {
      if (file.endsWith(".zip")) {
        const stats = await import_fs_extra8.default.stat(import_path9.default.join(backupsDir, file));
        backups.push({
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime
        });
      }
    }
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(backups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var createBackup = async (req, res) => {
  const { id } = req.params;
  const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
  const backupsDir = import_path9.default.join(process.cwd(), ".data", "backups", id);
  await import_fs_extra8.default.ensureDir(backupsDir);
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.zip`;
  const backupPath = import_path9.default.join(backupsDir, filename);
  try {
    const serverExists = await import_fs_extra8.default.pathExists(serverDir);
    if (!serverExists) {
      await import_fs_extra8.default.ensureDir(serverDir);
    }
    const output = import_fs_extra8.default.createWriteStream(backupPath);
    const archive = new import_archiver.ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => {
      if (!res.headersSent) res.json({ success: true, filename });
    });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(output);
    archive.directory(serverDir, false);
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
var downloadBackup = async (req, res) => {
  const { id, filename } = req.params;
  const backupPath = safeBackupPath(res, id, filename);
  if (!backupPath) return;
  if (await import_fs_extra8.default.pathExists(backupPath)) {
    res.download(backupPath);
  } else {
    res.status(404).send("Backup not found");
  }
};
var deleteBackup = async (req, res) => {
  const { id, filename } = req.params;
  const backupPath = safeBackupPath(res, id, filename);
  if (!backupPath) return;
  try {
    await import_fs_extra8.default.remove(backupPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
var installPlugin = async (req, res) => {
  const { id } = req.params;
  const serversJSON = await readJSON("servers.json");
  const server = serversJSON?.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  const pluginCompatibleTypes = ["PAPER", "SPIGOT", "BUKKIT", "PURPUR", "WATERFALL", "BUNGEECORD", "VELOCITY"];
  if (!pluginCompatibleTypes.includes((server.type || "").toUpperCase())) {
    return res.status(400).json({ error: `Cannot install Bukkit/Spigot plugins on a ${server.type} server. This software does not support Bukkit plugins.` });
  }
  const { source, pluginId, pluginName } = req.body;
  if (req.body.downloadUrl) {
    try {
      const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
      const pluginsDir = import_path9.default.join(serverDir, "plugins");
      await import_fs_extra8.default.ensureDir(pluginsDir);
      const filePath = import_path9.default.join(pluginsDir, req.body.filename);
      if (req.body.downloadUrl === "dummy") {
        await import_fs_extra8.default.writeFile(filePath, "");
      } else {
        const axios5 = (await import("axios")).default;
        const response = await axios5({ url: req.body.downloadUrl, method: "GET", responseType: "stream" });
        const writer = import_fs_extra8.default.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });
      }
      return res.json({ success: true, message: "Plugin installed successfully" });
    } catch (e) {
      return res.status(500).json({ error: "Failed to install plugin" });
    }
  }
  if (!source || !pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing source, pluginId, or pluginName" });
  }
  try {
    const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
    const pluginsDir = import_path9.default.join(serverDir, "plugins");
    await import_fs_extra8.default.ensureDir(pluginsDir);
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, "_")}.jar`;
    const axios5 = (await import("axios")).default;
    const resolveGithubRelease = async (extUrl) => {
      if (extUrl.includes("github.com") && extUrl.includes("/releases/")) {
        let apiUrl = null;
        const match = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/tag\/([^\/]+)/);
        if (match) {
          apiUrl = `https://api.github.com/repos/${match[1]}/${match[2]}/releases/tags/${match[3]}`;
        } else {
          const matchLatest = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/latest/);
          if (matchLatest) {
            apiUrl = `https://api.github.com/repos/${matchLatest[1]}/${matchLatest[2]}/releases/latest`;
          }
        }
        if (apiUrl) {
          try {
            const ghRes = await axios5.get(apiUrl);
            if (ghRes.data && ghRes.data.assets) {
              const jarAsset = ghRes.data.assets.find((a) => a.name.endsWith(".jar"));
              if (jarAsset) {
                return { url: jarAsset.browser_download_url, filename: jarAsset.name };
              }
            }
          } catch (e) {
            console.error("GitHub API error:", e);
          }
        }
      }
      return null;
    };
    if (source === "modrinth") {
      const verRes = await axios5.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
      if (verRes.data && verRes.data.length > 0) {
        const file = verRes.data[0].files.find((f) => f.primary) || verRes.data[0].files[0];
        if (file) {
          downloadUrl = file.url;
          filename = file.filename || filename;
        }
      }
    } else if (source === "spigot") {
      const apiRes = await axios5.get(`https://api.spiget.org/v2/resources/${pluginId}`);
      if (apiRes.data && apiRes.data.file) {
        if (apiRes.data.file.type === "external" && apiRes.data.file.externalUrl) {
          const extUrl = apiRes.data.file.externalUrl;
          const ghAsset = await resolveGithubRelease(extUrl);
          if (ghAsset) {
            downloadUrl = ghAsset.url;
            filename = ghAsset.filename;
          }
          if (!downloadUrl) {
            return res.status(400).json({ error: "This plugin must be downloaded externally from: " + extUrl });
          }
        } else {
          downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
        }
      } else {
        downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
      }
    } else if (source === "hangar") {
      const [owner, slug] = pluginId.split("/");
      const verRes = await axios5.get(`https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions`);
      if (verRes.data && verRes.data.result && verRes.data.result.length > 0) {
        const version = verRes.data.result[0];
        const download = version.downloads.PAPER || Object.values(version.downloads)[0];
        if (download && download.downloadUrl) {
          downloadUrl = download.downloadUrl;
          if (download.fileInfo && download.fileInfo.name) {
            filename = download.fileInfo.name;
          }
        } else if (download && download.externalUrl) {
          const extUrl = download.externalUrl;
          const ghAsset = await resolveGithubRelease(extUrl);
          if (ghAsset) {
            downloadUrl = ghAsset.url;
            filename = ghAsset.filename;
          } else {
            return res.status(400).json({ error: "This plugin must be downloaded externally from: " + extUrl });
          }
        }
      }
    }
    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this plugin." });
    }
    const filePath = import_path9.default.join(pluginsDir, filename);
    const response = await axios5({
      url: downloadUrl,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "React-Minecraft-Panel/1.0"
      }
    });
    const writer = import_fs_extra8.default.createWriteStream(filePath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    res.json({ success: true, message: "Plugin installed successfully" });
  } catch (error) {
    console.error("Plugin installation failed:", error.message);
    res.status(500).json({ error: "Plugin installation failed: " + error.message });
  }
};
var installMod = async (req, res) => {
  const { id } = req.params;
  const serversJSON = await readJSON("servers.json");
  const server = serversJSON?.find((s) => s.id === id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  const modCompatibleTypes = ["FABRIC", "FORGE", "NEOFORGE", "QUILT"];
  if (!modCompatibleTypes.includes((server.type || "").toUpperCase())) {
    return res.status(400).json({ error: `Cannot install Fabric/Forge mods on a ${server.type} server. This software does not support Fabric/Forge mods.` });
  }
  const { pluginId, pluginName } = req.body;
  if (!pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing pluginId or pluginName" });
  }
  try {
    const serverDir = import_path9.default.join(process.cwd(), ".data", "servers", id);
    const modsDir = import_path9.default.join(serverDir, "mods");
    await import_fs_extra8.default.ensureDir(modsDir);
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, "_")}.jar`;
    const axios5 = (await import("axios")).default;
    const verRes = await axios5.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
    if (verRes.data && verRes.data.length > 0) {
      const file = verRes.data[0].files.find((f) => f.primary) || verRes.data[0].files[0];
      if (file) {
        downloadUrl = file.url;
        filename = file.filename || filename;
      }
    }
    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this mod." });
    }
    const filePath = import_path9.default.join(modsDir, filename);
    const response = await axios5({
      url: downloadUrl,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "React-Minecraft-Panel/1.0"
      }
    });
    const writer = import_fs_extra8.default.createWriteStream(filePath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    res.json({ success: true, message: "Mod installed successfully" });
  } catch (error) {
    console.error("Mod installation failed:", error.message);
    res.status(500).json({ error: "Mod installation failed: " + error.message });
  }
};
var updateResources = async (req, res) => {
  try {
    const { id } = req.params;
    const { ram, cpu, disk } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (req.user.role !== "admin" && req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
    server.ram = Number(ram);
    server.cpu = Number(cpu);
    server.disk = Number(disk);
    await writeJSON("servers.json", servers);
    if (server.containerId) {
      try {
        await stopServerRuntime(server);
      } catch (e) {
      }
    }
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to update resources" });
  }
};
var updateSuspend = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspendDuration } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (req.user.role !== "admin" && req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
    server.suspended = suspendDuration !== null;
    server.suspendDuration = suspendDuration;
    await writeJSON("servers.json", servers);
    if (server.suspended && server.containerId) {
      try {
        await stopServerRuntime(server);
      } catch (e) {
      }
    }
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to suspend server" });
  }
};
var migrateServerRuntime = async (req, res) => {
  const { id } = req.params;
  const { targetRuntime } = req.body;
  const user = req.user;
  try {
    if (!targetRuntime || targetRuntime !== "docker" && targetRuntime !== "local") {
      return res.status(400).json({ error: "Invalid target runtime. Must be 'docker' or 'local'." });
    }
    const servers = await readJSON("servers.json") || [];
    const serverIndex = servers.findIndex((s) => s.id === id);
    if (serverIndex === -1) {
      return res.status(404).json({ error: "Server not found" });
    }
    const server = servers[serverIndex];
    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Only admins or owners can migrate runtime" });
    }
    if (server.containerId) {
      const status = await getServerRuntimeStatus(server);
      if (status?.State?.Running) {
        return res.status(400).json({ error: "Server must be stopped before migrating runtime. Please stop the server first." });
      }
      await deleteServerRuntime(server);
    }
    server.runtimeType = targetRuntime;
    const newContainerId = await createServerRuntime(server);
    server.containerId = newContainerId;
    servers[serverIndex] = server;
    await writeJSON("servers.json", servers);
    res.json({ success: true, server, runtimeType: targetRuntime });
  } catch (err) {
    console.error("Migrate runtime error:", err);
    res.status(500).json({ error: err.message || "Failed to migrate server runtime" });
  }
};
var restoreBackup = async (req, res) => {
  const { id, filename } = req.params;
  const serverDir = getServerRootDir(id);
  const backupPath = safeBackupPath(res, id, filename);
  if (!backupPath) return;
  try {
    if (!await import_fs_extra8.default.pathExists(backupPath)) {
      return res.status(404).json({ error: "Backup not found" });
    }
    const status = await getServerRuntimeStatus({ id });
    if (status?.State?.Running) {
      return res.status(400).json({ error: "Please stop the server before restoring a backup." });
    }
    await import_fs_extra8.default.emptyDir(serverDir);
    await (0, import_extract_zip2.default)(backupPath, { dir: serverDir });
    const configSnapshot = import_path9.default.join(serverDir, "server_config_snapshot.json");
    if (import_fs_extra8.default.existsSync(configSnapshot)) {
      const oldConfig = await readJSON(configSnapshot);
      const servers = await readJSON("servers.json");
      const idx = servers.findIndex((s) => s.id === id);
      if (idx !== -1) {
        servers[idx] = { ...servers[idx], ...oldConfig };
        await writeJSON("servers.json", servers);
      }
      await import_fs_extra8.default.remove(configSnapshot);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// src/server/routes/servers.ts
var import_multer = __toESM(require("multer"), 1);
var import_fs_extra9 = __toESM(require("fs-extra"), 1);
var import_child_process5 = require("child_process");
var import_util5 = require("util");
var import_stream = require("stream");
init_db();
var execFileAsync4 = (0, import_util5.promisify)(import_child_process5.execFile);
var router2 = import_express2.default.Router();
var upload = (0, import_multer.default)({ dest: import_path10.default.join(process.cwd(), ".data/temp/") });
router2.use(requireAuth);
router2.param("id", async (req, res, next, id) => {
  if (!isSafeServerId(id)) {
    return res.status(400).json({ error: "Invalid server id" });
  }
  try {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }
    const user = req.user;
    if (!canAccessServer(user, server)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.server = server;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.use("/:id/files", fileOpsRateLimit);
router2.use("/:id/command", commandRateLimit);
router2.get("/", getServers);
router2.get("/check-port", checkPort);
router2.post("/", createServer);
router2.get("/:id", getServer);
router2.get("/:id/stats", getServerStats);
router2.delete("/:id", deleteServer);
router2.put("/:id/owner", updateOwner);
router2.put("/:id/ipalias", updateIpAlias);
router2.get("/:id/domain/verify", getDomainStatus);
router2.put("/:id/version", changeServerVersion);
router2.put("/:id/migrate-runtime", migrateServerRuntime);
router2.put("/:id/resources", updateResources);
router2.put("/:id/suspend", updateSuspend);
router2.post("/:id/start", startServer);
router2.post("/:id/stop", stopServer);
router2.post("/:id/restart", restartServer);
router2.post("/:id/command", sendCommand);
router2.post("/:id/redownload-jar", redownloadJar);
router2.post("/:id/reinstall", redownloadJar);
router2.get("/:id/files", getFiles);
router2.get("/:id/files/download", downloadFile);
router2.post("/:id/files/upload", upload.single("file"), uploadFile);
router2.post("/:id/files/upload-chunk", upload.single("chunk"), uploadChunk);
router2.post("/:id/files/upload-complete", completeUpload);
router2.post("/:id/files/rename", renameFile);
router2.post("/:id/files/save", saveFileContent);
router2.post("/:id/files/create", createFile);
router2.post("/:id/files/mkdir", createDirectory);
router2.post("/:id/files/unzip", unzipFile);
router2.post("/:id/world/analyze", analyzeWorld);
router2.post("/:id/world/import", importWorld);
router2.get("/:id/world/info", getWorldInfo);
router2.post("/:id/files/zip", zipFiles);
router2.delete("/:id/files", deleteFile);
router2.get("/:id/backups", getBackups);
router2.post("/:id/backups", createBackup);
router2.get("/:id/backups/:filename", downloadBackup);
router2.delete("/:id/backups/:filename", deleteBackup);
router2.post("/:id/backups/:filename/restore", restoreBackup);
async function runPm2(args) {
  return execFileAsync4("npx", ["pm2", ...args]);
}
async function runPm2Ignore(args) {
  try {
    await runPm2(args);
  } catch {
  }
}
async function ensurePlayitBinary(serverDir, playitBin) {
  await import_fs_extra9.default.ensureDir(serverDir);
  if (await import_fs_extra9.default.pathExists(playitBin)) return;
  const url = "https://github.com/playit-cloud/playit-agent/releases/download/v0.15.26/playit-linux-amd64";
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download playit agent (HTTP ${response.status})`);
  }
  await new Promise((resolve, reject) => {
    const out = import_fs_extra9.default.createWriteStream(playitBin);
    const nodeStream = import_stream.Readable.fromWeb(response.body);
    nodeStream.pipe(out);
    out.on("finish", () => resolve());
    out.on("error", reject);
    nodeStream.on("error", reject);
  });
  await import_fs_extra9.default.chmod(playitBin, 493);
}
router2.get("/:id/playit", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const server = req.server;
  if (server.runtimeType === "local") {
    return res.json({ status: "stopped", claimLink: null, logs: "Playit integration is Beta/Coming Soon for Local Process runtime." });
  }
  const serverName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const pm2Name = `playit_${serverName}`;
  try {
    const { stdout } = await runPm2(["jlist"]);
    let status = "stopped";
    try {
      const jsonStart = stdout.indexOf("[");
      const jsonEnd = stdout.lastIndexOf("]");
      const jsonStr = jsonStart !== -1 && jsonEnd !== -1 ? stdout.substring(jsonStart, jsonEnd + 1) : stdout;
      const pm2List = JSON.parse(jsonStr);
      const playitProcess = pm2List.find((p) => p.name === pm2Name);
      if (playitProcess && playitProcess.pm2_env && playitProcess.pm2_env.status === "online") {
        status = "running";
      }
    } catch (e) {
    }
    if (status === "running") {
      const { stdout: logStdout } = await runPm2(["logs", pm2Name, "--nostream", "--lines", "100"]).catch(() => ({ stdout: "" }));
      const logs = (logStdout || "").replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b./g, "");
      const claimLinkMatches = logs.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+/g);
      res.json({
        status,
        claimLink: claimLinkMatches ? claimLinkMatches[claimLinkMatches.length - 1] : null,
        logs: logs.split("\n").slice(-50).join("\n")
      });
    } else {
      res.json({ status: "stopped", claimLink: null, logs: "" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to query Playit status" });
  }
});
router2.post("/:id/playit/start", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const server = req.server;
  if (server.runtimeType === "local") {
    return res.status(400).json({ error: "Playit integration is Beta/Coming Soon for Local Process runtime." });
  }
  const serverName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const pm2Name = `playit_${serverName}`;
  const serverDir = import_path10.default.join(process.cwd(), ".data", "servers", id);
  const playitBin = import_path10.default.join(serverDir, `playit_${serverName}`);
  const secretPath = import_path10.default.join(serverDir, "playit.toml");
  try {
    await runPm2Ignore(["delete", pm2Name]);
    await runPm2Ignore(["flush", pm2Name]);
    await ensurePlayitBinary(serverDir, playitBin);
    await runPm2(["start", playitBin, "--name", pm2Name, "--", "-s", "--secret_path", secretPath]);
    await runPm2(["save"]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to start Playit Tunnel", details: err.message });
  }
});
router2.post("/:id/playit/stop", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const server = req.server;
  if (server.runtimeType === "local") {
    return res.status(400).json({ error: "Playit integration is Beta/Coming Soon for Local Process runtime." });
  }
  const serverName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const pm2Name = `playit_${serverName}`;
  await runPm2Ignore(["delete", pm2Name]);
  await runPm2Ignore(["save"]);
  res.json({ success: true });
});
router2.post("/:id/playit/reset", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const server = req.server;
  if (server.runtimeType === "local") {
    return res.status(400).json({ error: "Playit integration is Beta/Coming Soon for Local Process runtime." });
  }
  const serverName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const pm2Name = `playit_${serverName}`;
  const serverDir = import_path10.default.join(process.cwd(), ".data", "servers", id);
  const secretPath = import_path10.default.join(serverDir, "playit.toml");
  await runPm2Ignore(["delete", pm2Name]);
  await runPm2Ignore(["flush", pm2Name]);
  await import_fs_extra9.default.remove(secretPath).catch(() => {
  });
  await runPm2Ignore(["save"]);
  res.json({ success: true });
});
router2.get("/:id/subusers", async (req, res) => {
  try {
    const { id } = req.params;
    const { readJSON: readJSON2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const servers = await readJSON2("servers.json") || [];
    const server = servers.find((s) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    const users = await readJSON2("users.json") || [];
    res.json({
      subUsers: server.subUsers || [],
      availableUsers: users.map((u) => ({ id: u.id, username: u.username }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/:id/subusers", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, permissions } = req.body;
    const { readJSON: readJSON2, writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const servers = await readJSON2("servers.json") || [];
    const serverIndex = servers.findIndex((s) => s.id === id);
    if (serverIndex === -1) return res.status(404).json({ error: "Server not found" });
    if (!servers[serverIndex].subUsers) servers[serverIndex].subUsers = [];
    const subUserIndex = servers[serverIndex].subUsers.findIndex((su) => su.userId === userId);
    if (subUserIndex !== -1) {
      servers[serverIndex].subUsers[subUserIndex].permissions = permissions;
    } else {
      servers[serverIndex].subUsers.push({ userId, permissions });
    }
    await writeJSON3("servers.json", servers);
    res.json({ success: true, subUsers: servers[serverIndex].subUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.delete("/:id/subusers/:userId", async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { readJSON: readJSON2, writeJSON: writeJSON3 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const servers = await readJSON2("servers.json") || [];
    const serverIndex = servers.findIndex((s) => s.id === id);
    if (serverIndex === -1) return res.status(404).json({ error: "Server not found" });
    if (!servers[serverIndex].subUsers) servers[serverIndex].subUsers = [];
    servers[serverIndex].subUsers = servers[serverIndex].subUsers.filter((su) => su.userId !== userId);
    await writeJSON3("servers.json", servers);
    res.json({ success: true, subUsers: servers[serverIndex].subUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/:id/sftp", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getSftpUser(id);
    if (!user) return res.status(404).json({ error: "SFTP user not found" });
    res.json({
      host: req.headers.host?.split(":")[0] || "127.0.0.1",
      port: 6868,
      username: user.username,
      password: "(Hidden - Reset to reveal)"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/:id/sftp/create", async (req, res) => {
  try {
    const { id } = req.params;
    const creds = await createSftpUser(id);
    res.json({
      host: req.headers.host?.split(":")[0] || "127.0.0.1",
      port: 6868,
      username: creds.username,
      password: creds.password
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/:id/sftp/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const creds = await resetSftpPassword(id);
    res.json({
      host: req.headers.host?.split(":")[0] || "127.0.0.1",
      port: 6868,
      username: creds.username,
      password: creds.password
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.delete("/:id/sftp", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteSftpUser(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/:id/plugins/install", installPlugin);
router2.post("/:id/mods/install", installMod);
var servers_default = router2;

// src/server/routes/system.ts
var import_express3 = __toESM(require("express"), 1);
var import_os = __toESM(require("os"), 1);
var import_child_process6 = require("child_process");
var import_util6 = __toESM(require("util"), 1);
init_db();
var import_bcryptjs2 = __toESM(require("bcryptjs"), 1);
var execPromise = import_util6.default.promisify(import_child_process6.exec);
var router3 = import_express3.default.Router();
router3.use(requireAuth);
router3.get("/versions", async (req, res) => {
  const type = req.query.type || "PAPER";
  const versions = await getVersions(type);
  res.json(versions);
});
router3.get("/paper-versions", async (req, res) => {
  const versions = await getVersions("PAPER");
  res.json(versions);
});
function getCpuUsage() {
  return new Promise((resolve) => {
    const startCpus = import_os.default.cpus();
    setTimeout(() => {
      const endCpus = import_os.default.cpus();
      let totalIdle = 0, totalTick = 0;
      for (let i = 0, len = startCpus.length; i < len; i++) {
        const start = startCpus[i].times;
        const end = endCpus[i].times;
        const startTick = start.user + start.nice + start.sys + start.idle + start.irq;
        const endTick = end.user + end.nice + end.sys + end.idle + end.irq;
        const idle = end.idle - start.idle;
        const total = endTick - startTick;
        totalIdle += idle;
        totalTick += total;
      }
      const usage = 100 - ~~(100 * totalIdle / totalTick);
      resolve(usage);
    }, 100);
  });
}
router3.get("/stats", async (req, res) => {
  let diskSpace = 0;
  try {
    const { stdout } = await execPromise("df -h /home");
    const lines = stdout.split("\n");
    if (lines.length > 1) {
      const parts = lines[1].trim().split(/\s+/);
      if (parts.length >= 5) {
        diskSpace = parseInt(parts[4].replace("%", "")) || 0;
      }
    }
  } catch (err) {
  }
  const totalMemory = import_os.default.totalmem();
  const freeMemory = import_os.default.freemem();
  let cpuUsage = await getCpuUsage();
  let activeContainers = 0;
  let totalContainers = 0;
  try {
    if (isSandbox) {
      totalContainers = Object.keys(mockState).length;
      activeContainers = Object.values(mockState).filter((v) => v).length;
    } else {
      const docker = await getDocker();
      const containers = await docker.listContainers({ all: true });
      totalContainers = containers.length;
      activeContainers = containers.filter((c) => c.State === "running").length;
    }
  } catch (err) {
  }
  res.json({
    cpuUsage,
    totalMemory,
    freeMemory,
    ramUsage: Math.round((totalMemory - freeMemory) / totalMemory * 100),
    diskUsage: diskSpace,
    activeContainers,
    totalContainers
  });
});
router3.get("/users", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const users = await readJSON("users.json") || [];
  res.json(users.map((u) => ({ id: u.id, username: u.username, role: u.role || "user", isGoogleUser: !!u.googleId, createdAt: u.createdAt })));
});
router3.post("/users", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  const targetRole = role.toLowerCase().trim();
  if (!["admin", "user"].includes(targetRole)) {
    return res.status(400).json({ error: "Invalid role. Role must be 'admin' or 'user'." });
  }
  if (user.role === "admin" && targetRole !== "user") {
    return res.status(403).json({ error: "Admins can only create normal member accounts. Only the Owner can create Admins." });
  }
  const users = await readJSON("users.json") || [];
  if (users.find((u) => u.username?.toLowerCase() === username.toLowerCase().trim())) {
    return res.status(400).json({ error: "Username already taken" });
  }
  const hashedPassword = await import_bcryptjs2.default.hash(password, 10);
  const newUserId = Date.now().toString();
  users.push({
    id: newUserId,
    username: username.trim(),
    password: hashedPassword,
    role: targetRole,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writeJSON("users.json", users);
  res.json({ success: true, id: newUserId, username: username.trim(), role: targetRole });
});
router3.put("/users/:id/role", async (req, res) => {
  const user = req.user;
  if (user.role !== "owner") {
    return res.status(403).json({ error: "Forbidden: Only the Owner can change user roles." });
  }
  const { role } = req.body;
  const targetRole = role?.toLowerCase()?.trim();
  if (!["admin", "user"].includes(targetRole)) {
    return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'user'." });
  }
  const users = await readJSON("users.json") || [];
  const targetIndex = users.findIndex((u) => u.id === req.params.id);
  if (targetIndex === -1) return res.status(404).json({ error: "User not found" });
  if (users[targetIndex].role === "owner" && targetIndex === 0) {
    return res.status(400).json({ error: "Cannot change the role of the primary Owner account." });
  }
  users[targetIndex].role = targetRole;
  users[targetIndex].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await writeJSON("users.json", users);
  res.json({ success: true, user: { id: users[targetIndex].id, username: users[targetIndex].username, role: targetRole } });
});
router3.delete("/users/:id", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  let users = await readJSON("users.json") || [];
  const targetUser = users.find((u) => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ error: "User not found" });
  if (targetUser.id === user.id) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }
  if (targetUser.role === "owner") {
    return res.status(403).json({ error: "Owner accounts cannot be deleted." });
  }
  if (user.role === "admin" && targetUser.role === "admin") {
    return res.status(403).json({ error: "Admins cannot delete other Admin accounts." });
  }
  users = users.filter((u) => u.id !== req.params.id);
  await writeJSON("users.json", users);
  res.json({ success: true });
});
router3.put("/users/:id/password", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const users = await readJSON("users.json") || [];
  const targetIndex = users.findIndex((u) => u.id === req.params.id);
  if (targetIndex === -1) return res.status(404).json({ error: "User not found" });
  const targetUser = users[targetIndex];
  if (user.role === "admin" && targetUser.role === "owner") {
    return res.status(403).json({ error: "Admins cannot modify Owner credentials." });
  }
  if (user.role === "admin" && targetUser.role === "admin" && targetUser.id !== user.id) {
    return res.status(403).json({ error: "Admins cannot modify other Admin credentials." });
  }
  if (targetUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change password of default admin account." });
  }
  if (targetUser.googleId || !targetUser.password) {
    return res.status(400).json({ error: "Cannot change password for Google authenticated accounts." });
  }
  const bcrypt4 = await import("bcryptjs");
  const hashedPassword = await bcrypt4.default.hash(newPassword, 10);
  users[targetIndex].password = hashedPassword;
  users[targetIndex].passwordVersion = (users[targetIndex].passwordVersion || 0) + 1;
  await writeJSON("users.json", users);
  res.json({ success: true });
});
router3.put("/settings", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const {
    panelName,
    panelLogo,
    panelBackgroundImage,
    panelBackgroundBlur,
    enablePlayit,
    enableTutorial,
    enableLoginAnimation,
    enableRegistration,
    theme,
    enableGoogleLogin,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseStorageBucket,
    firebaseMessagingSenderId,
    firebaseAppId,
    defaultRuntime
  } = req.body;
  const settings = await readJSON("settings.json") || {};
  if (panelName !== void 0) {
    settings.panelName = panelName || "Proto Panel";
    try {
      const fs11 = await import("fs/promises");
      const path12 = await import("path");
      const targetPaths = [
        path12.join(process.cwd(), "index.html"),
        path12.join(process.cwd(), "dist", "index.html")
      ];
      for (const p of targetPaths) {
        try {
          let html = await fs11.readFile(p, "utf-8");
          html = html.replace(/<title>.*<\/title>/i, `<title>${settings.panelName}</title>`);
          await fs11.writeFile(p, html, "utf-8");
        } catch (e) {
        }
      }
    } catch (err) {
      console.error("Error updating html title:", err);
    }
  }
  if (panelLogo !== void 0) settings.panelLogo = panelLogo;
  if (panelBackgroundImage !== void 0) settings.panelBackgroundImage = panelBackgroundImage;
  if (panelBackgroundBlur !== void 0) settings.panelBackgroundBlur = panelBackgroundBlur;
  if (enablePlayit !== void 0) settings.enablePlayit = enablePlayit;
  if (enableTutorial !== void 0) settings.enableTutorial = enableTutorial;
  if (enableLoginAnimation !== void 0) settings.enableLoginAnimation = enableLoginAnimation;
  if (enableRegistration !== void 0) settings.enableRegistration = enableRegistration;
  if (theme !== void 0) settings.theme = theme;
  if (enableGoogleLogin !== void 0) settings.enableGoogleLogin = enableGoogleLogin;
  if (firebaseApiKey !== void 0) settings.firebaseApiKey = firebaseApiKey;
  if (firebaseAuthDomain !== void 0) settings.firebaseAuthDomain = firebaseAuthDomain;
  if (firebaseProjectId !== void 0) settings.firebaseProjectId = firebaseProjectId;
  if (firebaseStorageBucket !== void 0) settings.firebaseStorageBucket = firebaseStorageBucket;
  if (firebaseMessagingSenderId !== void 0) settings.firebaseMessagingSenderId = firebaseMessagingSenderId;
  if (firebaseAppId !== void 0) settings.firebaseAppId = firebaseAppId;
  if (defaultRuntime !== void 0) {
    settings.defaultRuntime = defaultRuntime;
  }
  await writeJSON("settings.json", settings);
  req.app.get("io")?.emit("settings_updated");
  res.json({ success: true, defaultRuntime: settings.defaultRuntime });
});
router3.post("/update", async (req, res) => {
  const user = req.user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const io2 = req.app.get("io");
  if (io2) {
    io2.emit("system_update_started");
  }
  res.json({ success: true, message: "Update process started" });
  const { execFile: execFile6 } = await import("child_process");
  setTimeout(() => {
    execFile6("bash", ["update.sh"], (error, stdout, stderr) => {
      console.log(`Update stdout: ${stdout}`);
      console.error(`Update stderr: ${stderr}`);
    });
  }, 1e3);
});
var system_default = router3;

// src/server/routes/api-keys.ts
var import_express4 = __toESM(require("express"), 1);
var import_crypto4 = __toESM(require("crypto"), 1);
init_db();
var router4 = import_express4.default.Router();
router4.use(requireAdmin);
router4.get("/", async (req, res) => {
  try {
    const apiKeys = await readJSON("api_keys.json") || [];
    const keysWithoutHash = apiKeys.map((key) => ({
      id: key.id,
      label: key.label,
      scopes: key.scopes,
      created_by: key.created_by,
      created_at: key.created_at,
      expires_at: key.expires_at,
      last_used_at: key.last_used_at,
      revoked: key.revoked
    }));
    res.json(keysWithoutHash);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router4.post("/", async (req, res) => {
  try {
    const { label, scopes, expires_at } = req.body;
    const user = req.user;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomBytes = import_crypto4.default.randomBytes(14);
    let rawKey = "";
    for (let i = 0; i < 14; i++) {
      rawKey += chars[randomBytes[i] % chars.length];
    }
    const keyString = `jtg-${rawKey}`;
    const keyHash = import_crypto4.default.createHash("sha256").update(keyString).digest("hex");
    const apiKeys = await readJSON("api_keys.json") || [];
    const newKey = {
      id: import_crypto4.default.randomUUID(),
      key_hash: keyHash,
      label: label || "Unnamed Key",
      scopes: scopes || ["*"],
      created_by: user.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      expires_at: expires_at || null,
      last_used_at: null,
      revoked: false
    };
    apiKeys.push(newKey);
    await writeJSON("api_keys.json", apiKeys);
    res.json({
      success: true,
      key: keyString,
      // Only show once
      id: newKey.id,
      label: newKey.label,
      scopes: newKey.scopes,
      expires_at: newKey.expires_at
    });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router4.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const apiKeys = await readJSON("api_keys.json") || [];
    const keyIndex = apiKeys.findIndex((k) => k.id === id);
    if (keyIndex === -1) {
      return res.status(404).json({ error: "Key not found" });
    }
    apiKeys.splice(keyIndex, 1);
    await writeJSON("api_keys.json", apiKeys);
    res.json({ success: true, message: "Key deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
var api_keys_default = router4;

// src/server/routes/nodes.ts
var import_express5 = require("express");
init_db();
var import_uuid = require("uuid");
var import_os2 = __toESM(require("os"), 1);
var import_crypto5 = __toESM(require("crypto"), 1);
var import_axios4 = __toESM(require("axios"), 1);
var import_child_process7 = require("child_process");
var import_util7 = __toESM(require("util"), 1);

// src/server/services/wings.ts
var import_axios3 = __toESM(require("axios"), 1);
init_db();
async function getWingsNode(nodeId) {
  const nodes = await readJSON("wings_nodes.json") || [];
  return nodes.find((n) => n.id === nodeId);
}
function getWingsClient(node) {
  let url = node.apiUrl;
  if (!url) {
    const protocol = node.ssl ? "https" : "http";
    url = `${protocol}://${node.hostname}:${node.apiPort || 8080}`;
  }
  return import_axios3.default.create({
    baseURL: url,
    timeout: 5e3,
    headers: {
      "Authorization": `Bearer ${node.token}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    }
  });
}
var WingsRuntimeProvider = class {
  async getNodeHealth(nodeId) {
    const node = await getWingsNode(nodeId);
    if (!node) throw new Error("Node not found");
    const client = getWingsClient(node);
    try {
      const res = await client.get("/api/system");
      return res.data;
    } catch (err) {
      throw new Error(`Wings Health Check Failed: ${err.message}`);
    }
  }
  async getNodeAllocations(nodeId) {
    return [];
  }
  async createServer(server) {
    const node = await getWingsNode(server.nodeId);
    if (!node) throw new Error("Node not found");
    const client = getWingsClient(node);
    let javaVersion = "java_17";
    if (server.version && server.version.startsWith("1.20.") && parseInt(server.version.split(".")[2] || "0") >= 5) {
      javaVersion = "java_21";
    } else if (server.version && server.version.startsWith("1.21")) {
      javaVersion = "java_21";
    }
    const image = server.dockerImage || `ghcr.io/pterodactyl/yolks:${javaVersion}`;
    const payload = {
      uuid: server.id,
      meta: {
        name: server.name || "Minecraft Server",
        description: "Proto Managed Server"
      },
      suspended: false,
      environment: {
        SERVER_JARFILE: server.jarFile || "server.jar"
      },
      invocation: server.startupCommand || "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
      skip_egg_scripts: true,
      build: {
        memory: server.memory || 1024,
        swap: 0,
        io: 500,
        cpu: server.cpu || 100,
        disk: server.disk || 10240,
        threads: null
      },
      container: {
        image
      },
      allocations: {
        default: {
          ip: server.ip || "0.0.0.0",
          port: server.port || 25565
        },
        mappings: {
          [server.ip || "0.0.0.0"]: [server.port || 25565]
        }
      }
    };
    await client.post("/api/servers", payload);
  }
  async deleteServer(serverId) {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === serverId);
    if (!server || !server.nodeId) return;
    const node = await getWingsNode(server.nodeId);
    if (!node) return;
    const client = getWingsClient(node);
    await client.delete(`/api/servers/${serverId}`);
  }
  async startServer(serverId) {
    await this.sendPowerAction(serverId, "start");
  }
  async stopServer(serverId) {
    await this.sendPowerAction(serverId, "stop");
  }
  async restartServer(serverId) {
    await this.sendPowerAction(serverId, "restart");
  }
  async killServer(serverId) {
    await this.sendPowerAction(serverId, "kill");
  }
  async reinstallServer(serverId) {
  }
  async sendPowerAction(serverId, action) {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === serverId);
    if (!server || !server.nodeId) throw new Error("Server not found");
    const node = await getWingsNode(server.nodeId);
    if (!node) throw new Error("Node not found");
    const client = getWingsClient(node);
    await client.post(`/api/servers/${serverId}/power`, { action });
  }
  async getServerStatus(serverId) {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === serverId);
    if (!server || !server.nodeId) return { State: { Running: false, Status: "exited" } };
    const node = await getWingsNode(server.nodeId);
    if (!node) return { State: { Running: false, Status: "exited" } };
    try {
      const client = getWingsClient(node);
      const res = await client.get(`/api/servers/${serverId}`);
      return { State: { Running: res.data.state !== "offline", Status: res.data.state } };
    } catch (e) {
      return { State: { Running: false, Status: "exited" } };
    }
  }
  async getServerStats(serverId) {
    return { cpu: 0, ram: 0, disk: 0 };
  }
  async getConsoleLogs(serverId) {
    return "[Wings] Logs not implemented via HTTP, usually WS.";
  }
  async subscribeToConsole(serverId, onData) {
    return () => {
    };
  }
  async sendConsoleCommand(serverId, command) {
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s) => s.id === serverId);
    if (!server || !server.nodeId) return;
    const node = await getWingsNode(server.nodeId);
    if (!node) return;
    const client = getWingsClient(node);
    await client.post(`/api/servers/${serverId}/commands`, { command });
  }
  async listFiles(serverId, dir) {
    return [];
  }
  async uploadFile(serverId, dir, file) {
  }
  async downloadFile(serverId, filePath) {
    return null;
  }
  async extractArchive(serverId, archivePath, destDir) {
  }
  async createBackup(serverId) {
  }
  async restoreBackup(serverId, backupId) {
  }
  async importWorld(serverId, worldData) {
  }
  async exportWorld(serverId) {
  }
};

// src/server/routes/nodes.ts
var execPromise2 = import_util7.default.promisify(import_child_process7.exec);
var router5 = (0, import_express5.Router)();
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && import_crypto5.default.timingSafeEqual(bufA, bufB);
}
function getCpuUsage2() {
  return new Promise((resolve) => {
    const startCpus = import_os2.default.cpus();
    setTimeout(() => {
      const endCpus = import_os2.default.cpus();
      let totalIdle = 0, totalTick = 0;
      for (let i = 0, len = startCpus.length; i < len; i++) {
        const start = startCpus[i].times;
        const end = endCpus[i].times;
        const startTick = start.user + start.nice + start.sys + start.idle + start.irq;
        const endTick = end.user + end.nice + end.sys + end.idle + end.irq;
        const idle = end.idle - start.idle;
        const total = endTick - startTick;
        totalIdle += idle;
        totalTick += total;
      }
      const usage = totalTick > 0 ? Math.max(0, Math.min(100, Math.round(100 - 100 * totalIdle / totalTick))) : 0;
      resolve(usage);
    }, 120);
  });
}
function agentBaseUrl(node) {
  const host = node.ip || node.hostname;
  const port = node.port || node.apiPort || 6768;
  const protocol = node.ssl ? "https" : "http";
  return `${protocol}://${host}:${port}`;
}
function agentClient(node) {
  return import_axios4.default.create({
    baseURL: agentBaseUrl(node),
    timeout: 5e3,
    headers: { Authorization: `Bearer ${node.key}` }
  });
}
router5.post("/:id/checkin", authRateLimit, async (req, res) => {
  const { id } = req.params;
  const { key, ip, port } = req.body || {};
  try {
    const nodes = await readJSON("nodes.json") || [];
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) return res.status(404).json({ error: "Unknown node id" });
    if (!key || typeof key !== "string" || !nodes[idx].key || !timingSafeStringEqual(nodes[idx].key, key)) {
      return res.status(401).json({ error: "Invalid node key" });
    }
    if (ip) nodes[idx].ip = ip;
    if (port) nodes[idx].port = port;
    nodes[idx].status = "online";
    nodes[idx].lastCheckin = (/* @__PURE__ */ new Date()).toISOString();
    await writeJSON("nodes.json", nodes);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router5.use(requireAuth);
router5.use(nodeOpsRateLimit);
router5.get("/", async (req, res) => {
  try {
    const wingsNodes = await readJSON("wings_nodes.json") || [];
    const agentNodes = await readJSON("nodes.json") || [];
    const servers = await readJSON("servers.json") || [];
    const totalMemMB = Math.round(import_os2.default.totalmem() / (1024 * 1024));
    const freeMemMB = Math.round(import_os2.default.freemem() / (1024 * 1024));
    const usedMemMB = totalMemMB - freeMemMB;
    const ramUsagePercent = Math.round(usedMemMB / totalMemMB * 100);
    let diskTotalMB = 5e4;
    let diskUsedMB = 5e3;
    let diskUsagePercent = 10;
    try {
      const { stdout } = await execPromise2("df -m /home || df -m /");
      const lines = stdout.trim().split("\n");
      if (lines.length > 1) {
        const parts = lines[lines.length - 1].trim().split(/\s+/);
        if (parts.length >= 5) {
          diskTotalMB = parseInt(parts[1]) || 5e4;
          diskUsedMB = parseInt(parts[2]) || 5e3;
          diskUsagePercent = parseInt(parts[4].replace("%", "")) || Math.round(diskUsedMB / diskTotalMB * 100);
        }
      }
    } catch (e) {
    }
    const localServersCount = servers.filter((s) => !s.nodeId || s.nodeId === "local" || s.nodeId === "default").length;
    const localNode = {
      id: "local",
      name: "Built-in Node (Local)",
      ip: "127.0.0.1",
      hostname: import_os2.default.hostname() || "localhost",
      apiPort: process.env.PORT ? parseInt(process.env.PORT) : 3e3,
      memory: totalMemMB,
      usedMemory: usedMemMB,
      ramUsagePercent,
      disk: diskTotalMB,
      usedDisk: diskUsedMB,
      diskUsagePercent,
      cpuCores: import_os2.default.cpus().length,
      cpuModel: import_os2.default.cpus()[0]?.model || "Host CPU",
      serversCount: localServersCount,
      isLocal: true,
      kind: "local",
      status: "online",
      uptime: import_os2.default.uptime()
    };
    const wingsProvider = new WingsRuntimeProvider();
    const safeWings = await Promise.all(wingsNodes.map(async (n) => {
      let status = "offline";
      try {
        await wingsProvider.getNodeHealth(n.id);
        status = "online";
      } catch {
        status = "offline";
      }
      return {
        ...n,
        token: void 0,
        ip: n.hostname || n.ip,
        kind: "wings",
        serversCount: servers.filter((s) => s.nodeId === n.id).length,
        status
      };
    }));
    const safeAgents = agentNodes.map((n) => ({
      ...n,
      key: void 0,
      kind: "agent",
      serversCount: servers.filter((s) => s.nodeId === n.id).length,
      status: n.status || "pending"
    }));
    res.json([localNode, ...safeAgents, ...safeWings]);
  } catch (err) {
    console.error("Error loading nodes:", err);
    res.status(500).json({ error: "Failed to load nodes" });
  }
});
router5.get("/:id/stats", async (req, res) => {
  const { id } = req.params;
  try {
    if (id === "local") {
      const cpuUsage = await getCpuUsage2();
      const totalMemMB = Math.round(import_os2.default.totalmem() / (1024 * 1024));
      const freeMemMB = Math.round(import_os2.default.freemem() / (1024 * 1024));
      const usedMemMB = totalMemMB - freeMemMB;
      const ramUsagePercent = Math.round(usedMemMB / totalMemMB * 100);
      let diskUsagePercent = 15;
      let diskTotalMB = 5e4;
      let diskUsedMB = 7500;
      try {
        const { stdout } = await execPromise2("df -m /home || df -m /");
        const lines = stdout.trim().split("\n");
        if (lines.length > 1) {
          const parts = lines[lines.length - 1].trim().split(/\s+/);
          if (parts.length >= 5) {
            diskTotalMB = parseInt(parts[1]) || 5e4;
            diskUsedMB = parseInt(parts[2]) || 7500;
            diskUsagePercent = parseInt(parts[4].replace("%", "")) || Math.round(diskUsedMB / diskTotalMB * 100);
          }
        }
      } catch (e) {
      }
      return res.json({
        cpuUsage,
        cpuCores: import_os2.default.cpus().length,
        memory: { totalMB: totalMemMB, usedMB: usedMemMB, freeMB: freeMemMB, percent: ramUsagePercent },
        disk: { totalMB: diskTotalMB, usedMB: diskUsedMB, percent: diskUsagePercent },
        uptime: import_os2.default.uptime(),
        timestamp: Date.now()
      });
    }
    const agentNodes = await readJSON("nodes.json") || [];
    const agentNode = agentNodes.find((n) => n.id === id);
    if (agentNode) {
      try {
        const client = agentClient(agentNode);
        const { data } = await client.get("/agent/stats");
        const idx = agentNodes.findIndex((n) => n.id === id);
        if (idx !== -1 && agentNodes[idx].status !== "online") {
          agentNodes[idx].status = "online";
          await writeJSON("nodes.json", agentNodes);
        }
        return res.json(data);
      } catch (err) {
        const idx = agentNodes.findIndex((n) => n.id === id);
        if (idx !== -1 && agentNodes[idx].status !== "offline") {
          agentNodes[idx].status = "offline";
          await writeJSON("nodes.json", agentNodes);
        }
        return res.status(502).json({ error: "Node unreachable", status: "offline" });
      }
    }
    const wingsNodes = await readJSON("wings_nodes.json") || [];
    const wingsNode = wingsNodes.find((n) => n.id === id);
    if (wingsNode) {
      try {
        const health = await new WingsRuntimeProvider().getNodeHealth(id);
        const idx = wingsNodes.findIndex((n) => n.id === id);
        if (idx !== -1 && wingsNodes[idx].status !== "online") {
          wingsNodes[idx].status = "online";
          await writeJSON("wings_nodes.json", wingsNodes);
        }
        const totalMemMB = Math.round((health.memory_total ?? 0) / (1024 * 1024));
        const usedMemMB = Math.round((health.memory_used ?? health.memory ?? 0) / (1024 * 1024));
        const totalDiskMB = Math.round((health.disk_total ?? 0) / (1024 * 1024));
        const usedDiskMB = Math.round((health.disk_used ?? health.disk ?? 0) / (1024 * 1024));
        return res.json({
          cpuUsage: Math.round(health.cpu_used ?? health.cpu ?? 0),
          cpuCores: health.cpu_count ?? void 0,
          memory: {
            totalMB: totalMemMB,
            usedMB: usedMemMB,
            freeMB: Math.max(0, totalMemMB - usedMemMB),
            percent: totalMemMB > 0 ? Math.round(usedMemMB / totalMemMB * 100) : 0
          },
          disk: {
            totalMB: totalDiskMB,
            usedMB: usedDiskMB,
            percent: totalDiskMB > 0 ? Math.round(usedDiskMB / totalDiskMB * 100) : 0
          },
          uptime: health.uptime ?? 0,
          timestamp: Date.now(),
          raw: health
        });
      } catch (err) {
        const idx = wingsNodes.findIndex((n) => n.id === id);
        if (idx !== -1 && wingsNodes[idx].status !== "offline") {
          wingsNodes[idx].status = "offline";
          await writeJSON("wings_nodes.json", wingsNodes);
        }
        return res.status(502).json({ error: "Wings node unreachable", status: "offline" });
      }
    }
    return res.status(404).json({ error: "Node not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router5.post("/", async (req, res) => {
  const user = req.user;
  if (!user || user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  try {
    const nodes = await readJSON("wings_nodes.json") || [];
    const newNode = {
      id: (0, import_uuid.v4)(),
      ...req.body,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    nodes.push(newNode);
    await writeJSON("wings_nodes.json", nodes);
    res.json({ success: true, node: { ...newNode, token: void 0 } });
  } catch (err) {
    console.error("Error creating node:", err);
    res.status(500).json({ error: "Failed to save node" });
  }
});
router5.post("/agent", async (req, res) => {
  const user = req.user;
  if (!user || user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  try {
    const { name, ip, port, memory, disk, location, ssl } = req.body || {};
    if (!name) return res.status(400).json({ error: "Node name is required" });
    const id = (0, import_uuid.v4)();
    const key = import_crypto5.default.randomBytes(24).toString("hex");
    const resolvedPort = port ? parseInt(port) : 6768;
    const nodes = await readJSON("nodes.json") || [];
    const newNode = {
      id,
      name,
      ip: ip || "",
      port: resolvedPort,
      ssl: !!ssl,
      key,
      memory: memory || 8192,
      disk: disk || 5e4,
      location: location || "Default",
      connectionMode: "direct",
      status: "pending",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    nodes.push(newNode);
    await writeJSON("nodes.json", nodes);
    const panelUrl = `${req.protocol}://${req.get("host")}`;
    const installCommand = `curl -fsSL ${panelUrl}/node.sh | sudo bash -s -- --id ${id} --key ${key} --port ${resolvedPort} --panel-url ${panelUrl}`;
    res.json({
      success: true,
      node: { ...newNode, key: void 0 },
      installCommand,
      note: "Run this command as root on the remote VPS. The node will switch from 'pending' to 'online' automatically once the agent starts."
    });
  } catch (err) {
    console.error("Error creating agent node:", err);
    res.status(500).json({ error: "Failed to save node" });
  }
});
router5.delete("/:id", async (req, res) => {
  const user = req.user;
  if (!user || user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  const { id } = req.params;
  if (id === "local") {
    return res.status(400).json({ error: "Cannot delete the built-in local node" });
  }
  try {
    let wingsNodes = await readJSON("wings_nodes.json") || [];
    let agentNodes = await readJSON("nodes.json") || [];
    wingsNodes = wingsNodes.filter((n) => n.id !== id);
    agentNodes = agentNodes.filter((n) => n.id !== id);
    await writeJSON("wings_nodes.json", wingsNodes);
    await writeJSON("nodes.json", agentNodes);
    res.json({ success: true, message: "Node deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router5.get("/:id/health", async (req, res) => {
  const { id } = req.params;
  if (id === "local") return res.json({ status: "healthy", message: "Node online" });
  const agentNodes = await readJSON("nodes.json") || [];
  const agentNode = agentNodes.find((n) => n.id === id);
  if (agentNode) {
    try {
      await import_axios4.default.get(`${agentBaseUrl(agentNode)}/health`, { timeout: 4e3 });
      return res.json({ status: "healthy", message: "Node online" });
    } catch (e) {
      return res.status(502).json({ status: "unreachable", message: "Node did not respond" });
    }
  }
  res.json({ status: "healthy", message: "Node online" });
});
var nodes_default = router5;

// src/server/routes/api.ts
var router6 = import_express6.default.Router();
router6.get("/health", (req, res) => {
  res.json({ status: "ok", panel: "Proto Panel", version: "3.2.0" });
});
router6.post("/webhook/github-update", async (req, res) => {
  const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return res.status(503).json({ error: "Webhook not configured (GITHUB_WEBHOOK_SECRET is not set)" });
  }
  const secretHeader = String(req.headers["x-hub-signature-256"] || req.headers["x-webhook-secret"] || req.query.secret || "");
  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(secretHeader);
  const isValid = expected.length === received.length && import_crypto6.default.timingSafeEqual(expected, received);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  console.log("[Proto Panel] GitHub push webhook triggered! Initiating automatic panel update...");
  res.json({ success: true, message: "Automatic update triggered from GitHub push." });
  setTimeout(() => {
    (0, import_child_process8.execFile)("bash", ["update.sh"], (error, stdout, stderr) => {
      if (error) {
        console.error(`[Proto Panel Auto-Update Error]:`, error);
      }
      console.log(`[Proto Panel Auto-Update Output]:
${stdout}`);
    });
  }, 1e3);
});
router6.use("/auth", auth_default);
router6.use("/servers", servers_default);
router6.use("/system", system_default);
router6.use("/admin/api-keys", api_keys_default);
router6.use("/nodes", nodes_default);
router6.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  res.json({
    panelName: settings.panelName || "Proto Panel",
    panelLogo: settings.panelLogo || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== void 0 ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== void 0 ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== void 0 ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== void 0 ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== void 0 ? settings.enableRegistration : true,
    theme: settings.theme || "red",
    enableGoogleLogin: settings.enableGoogleLogin !== void 0 ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || "",
    defaultRuntime: settings.defaultRuntime || process.env.DEFAULT_RUNTIME || "docker",
    runtimeLocked: settings.runtimeLocked !== void 0 ? settings.runtimeLocked : process.env.PANEL_RUNTIME_LOCKED === "true" || process.env.PANEL_RUNTIME_LOCKED === "1",
    isDev: process.env.NODE_ENV === "development" || process.env.PORT === "30000" || process.env.PANEL_DEV_MODE === "true" || process.env.DEV_MODE === "true"
  });
});
var api_default = router6;

// server.ts
var app = (0, import_express7.default)();
app.set("trust proxy", true);
var httpServer = (0, import_http.createServer)(app);
var io = new import_socket.Server(httpServer, {
  cors: { origin: "*" }
});
app.set("io", io);
var DATA_DIR = import_path11.default.join(process.cwd(), ".data");
var SERVERS_DIR = import_path11.default.join(DATA_DIR, "servers");
var BACKUPS_DIR = import_path11.default.join(process.cwd(), "backups");
import_fs_extra10.default.ensureDirSync(DATA_DIR);
import_fs_extra10.default.ensureDirSync(SERVERS_DIR);
import_fs_extra10.default.ensureDirSync(BACKUPS_DIR);
import_fs_extra10.default.ensureDirSync(import_path11.default.join(DATA_DIR, "temp"));
if (!import_fs_extra10.default.existsSync(import_path11.default.join(DATA_DIR, "users.json"))) import_fs_extra10.default.writeFileSync(import_path11.default.join(DATA_DIR, "users.json"), "[]");
if (!import_fs_extra10.default.existsSync(import_path11.default.join(DATA_DIR, "servers.json"))) import_fs_extra10.default.writeFileSync(import_path11.default.join(DATA_DIR, "servers.json"), "[]");
if (!import_fs_extra10.default.existsSync(import_path11.default.join(DATA_DIR, "settings.json"))) import_fs_extra10.default.writeFileSync(import_path11.default.join(DATA_DIR, "settings.json"), "{}");
panelEvents.on("log", (serverId, data) => {
  io.to(`server_${serverId}`).emit("log", data);
});
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const verified = import_jsonwebtoken4.default.verify(token, JWT_SECRET);
    socket.user = verified;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});
io.on("connection", (socket) => {
  socket.on("joinServer", async (serverId) => {
    try {
      const serversJSON = await import_fs_extra10.default.readFile(import_path11.default.join(DATA_DIR, "servers.json"), "utf8");
      const servers = JSON.parse(serversJSON);
      const server = Array.isArray(servers) ? servers.find((s) => s.id === serverId) : null;
      if (!server) {
        socket.emit("joinServerError", { error: "Server not found" });
        return;
      }
      const user = socket.user;
      if (!canAccessServer(user, server)) {
        socket.emit("joinServerError", { error: "Forbidden" });
        return;
      }
      socket.join(`server_${serverId}`);
      if (server.containerId) {
        const logs = await getServerRuntimeLogs(server);
        if (logs) {
          socket.emit("log", logs.trim() + "\n");
        }
        await attachServerRuntimeSocket(server, serverId);
      }
    } catch (e) {
      console.error(e);
    }
  });
  socket.on("leaveServer", (serverId) => {
    socket.leave(`server_${serverId}`);
  });
});
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.use(import_express7.default.json({ limit: "50gb" }));
app.use(import_express7.default.urlencoded({ extended: true, limit: "50gb" }));
app.use((0, import_cors.default)());
app.use("/api", generalApiRateLimit, api_default);
async function startServer2() {
  const { runMigrations: runMigrations2 } = await Promise.resolve().then(() => (init_postgres(), postgres_exports));
  await runMigrations2();
  await initSFTPServer();
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true, allowedHosts: ["gtk.qzz.io"] },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path11.default.join(process.cwd(), "dist");
    app.use(import_express7.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path11.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Proto Panel running on port ${PORT}`);
  });
}
var isMain = typeof require !== "undefined" && require.main === module || process.argv[1] && process.argv[1].includes("server.ts") || process.argv[1] && process.argv[1].includes("server.cjs");
console.log("IS MAIN:", isMain, "TEST_ENV:", process.env.TEST_ENV);
if (true) {
  startServer2().catch((err) => {
    console.error("[FATAL] Failed to start Proto Panel:", err);
    process.exit(1);
  });
}
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  import_fs_extra10.default.writeFileSync("crash.log", String(err.stack));
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION:", reason);
  import_fs_extra10.default.writeFileSync("crash.log", String(reason));
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  io
});
//# sourceMappingURL=server.cjs.map
