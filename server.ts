import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import fs from "fs-extra";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./src/server/config/secrets.js";
import { canAccessServer } from "./src/server/utils/authz.js";

const app = express();
app.set("trust proxy", true);
const httpServer = createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});
app.set("io", io);

// Initialize data folders
const DATA_DIR = path.join(process.cwd(), ".data");
const SERVERS_DIR = path.join(DATA_DIR, "servers");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SERVERS_DIR);
fs.ensureDirSync(BACKUPS_DIR);
fs.ensureDirSync(path.join(DATA_DIR, "temp"));

if (!fs.existsSync(path.join(DATA_DIR, "users.json"))) fs.writeFileSync(path.join(DATA_DIR, "users.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "servers.json"))) fs.writeFileSync(path.join(DATA_DIR, "servers.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "settings.json"))) fs.writeFileSync(path.join(DATA_DIR, "settings.json"), "{}");

import { attachServerRuntimeSocket, getServerRuntimeLogs } from "./src/server/services/runtime.js";
import { panelEvents } from "./src/server/events.js";

panelEvents.on("log", (serverId, data) => {
  io.to(`server_${serverId}`).emit("log", data);
});


io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    (socket as any).user = verified;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  socket.on("joinServer", async (serverId) => {
    // Previously this joined the socket to the server's log room based
    // purely on the id it was given — any logged-in user could stream
    // the console output of any server on the panel by guessing/knowing
    // its id. Now we look the server up first and check the connected
    // user actually has access to it.
    try {
      const serversJSON = await fs.readFile(path.join(DATA_DIR, "servers.json"), "utf8");
      const servers = JSON.parse(serversJSON);
      const server = Array.isArray(servers) ? servers.find((s: any) => s.id === serverId) : null;

      if (!server) {
        socket.emit("joinServerError", { error: "Server not found" });
        return;
      }

      const user = (socket as any).user;
      if (!canAccessServer(user, server)) {
        socket.emit("joinServerError", { error: "Forbidden" });
        return;
      }

      socket.join(`server_${serverId}`);

      // Stream logs if the container is already running
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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "50gb" }));
app.use(express.urlencoded({ extended: true, limit: "50gb" }));
app.use(cors());

import apiRoutes from "./src/server/routes/api.js";
import { generalApiRateLimit } from "./src/server/middleware/rateLimit.js";
app.use("/api", generalApiRateLimit, apiRoutes);

import { initSFTPServer } from "./src/server/services/sftp.js";

async function startServer() {
  const { runMigrations } = await import("./src/server/services/postgres.js");
  await runMigrations();

  await initSFTPServer();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: ["gtk.qzz.io"] },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Proto Panel running on port ${PORT}`);
  });
}




// Only start server if not imported as a module in tests
const isMain = 
  (typeof require !== 'undefined' && require.main === module) || 
  (process.argv[1] && process.argv[1].includes('server.ts')) ||
  (process.argv[1] && process.argv[1].includes('server.cjs'));

console.log("IS MAIN:", isMain, "TEST_ENV:", process.env.TEST_ENV);
if (true) {
  startServer().catch((err) => {
    console.error("[FATAL] Failed to start Proto Panel:", err);
    process.exit(1);
  });
}


process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  fs.writeFileSync('crash.log', String(err.stack));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  fs.writeFileSync('crash.log', String(reason));
});
