import { Router } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import os from "os";
import crypto from "crypto";
import axios from "axios";
import { exec } from "child_process";
import util from "util";
import { authRateLimit, nodeOpsRateLimit } from "../middleware/rateLimit.js";
import { WingsRuntimeProvider } from "../services/wings.js";

const execPromise = util.promisify(exec);
const router = Router();

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const startCpus = os.cpus();
    setTimeout(() => {
      const endCpus = os.cpus();
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

      const usage = totalTick > 0 ? Math.max(0, Math.min(100, Math.round(100 - (100 * totalIdle / totalTick)))) : 0;
      resolve(usage);
    }, 120);
  });
}

// Agent nodes (nodes.json) talk the same protocol our own node.sh installs:
// an authenticated Docker Engine API proxy plus a /agent/stats endpoint for
// live host telemetry. This is what actually powers remote container
// orchestration today (see services/docker.ts:getDocker).
function agentBaseUrl(node: any) {
  const host = node.ip || node.hostname;
  const port = node.port || node.apiPort || 6768;
  const protocol = node.ssl ? "https" : "http";
  return `${protocol}://${host}:${port}`;
}

function agentClient(node: any) {
  return axios.create({
    baseURL: agentBaseUrl(node),
    timeout: 5000,
    headers: { Authorization: `Bearer ${node.key}` }
  });
}

// Public endpoint: the node.sh installer calls this once the agent is up so
// the node flips from "pending" straight to "online" without the user
// having to paste an IP/port/key back into the UI by hand. The panel-issued
// key doubles as the shared secret proving this request really came from
// the node we asked to be installed.
router.post("/:id/checkin", authRateLimit, async (req, res) => {
  const { id } = req.params;
  const { key, ip, port } = req.body || {};
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    const idx = nodes.findIndex((n: any) => n.id === id);
    if (idx === -1) return res.status(404).json({ error: "Unknown node id" });
    if (!key || typeof key !== "string" || !nodes[idx].key || !timingSafeStringEqual(nodes[idx].key, key)) {
      return res.status(401).json({ error: "Invalid node key" });
    }

    if (ip) nodes[idx].ip = ip;
    if (port) nodes[idx].port = port;
    nodes[idx].status = "online";
    nodes[idx].lastCheckin = new Date().toISOString();
    await writeJSON("nodes.json", nodes);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);
router.use(nodeOpsRateLimit);

router.get("/", async (req, res) => {
  try {
    const wingsNodes = (await readJSON("wings_nodes.json")) || [];
    const agentNodes = (await readJSON("nodes.json")) || [];
    const servers = (await readJSON("servers.json")) || [];

    // Real system specs for local node
    const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMB = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMB = totalMemMB - freeMemMB;
    const ramUsagePercent = Math.round((usedMemMB / totalMemMB) * 100);

    let diskTotalMB = 50000;
    let diskUsedMB = 5000;
    let diskUsagePercent = 10;
    try {
      const { stdout } = await execPromise("df -m /home || df -m /");
      const lines = stdout.trim().split("\n");
      if (lines.length > 1) {
        const parts = lines[lines.length - 1].trim().split(/\s+/);
        if (parts.length >= 5) {
          diskTotalMB = parseInt(parts[1]) || 50000;
          diskUsedMB = parseInt(parts[2]) || 5000;
          diskUsagePercent = parseInt(parts[4].replace("%", "")) || Math.round((diskUsedMB / diskTotalMB) * 100);
        }
      }
    } catch (e) {}

    const localServersCount = servers.filter((s: any) => !s.nodeId || s.nodeId === "local" || s.nodeId === "default").length;

    const localNode = {
      id: "local",
      name: "Built-in Node (Local)",
      ip: "127.0.0.1",
      hostname: os.hostname() || "localhost",
      apiPort: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      memory: totalMemMB,
      usedMemory: usedMemMB,
      ramUsagePercent,
      disk: diskTotalMB,
      usedDisk: diskUsedMB,
      diskUsagePercent,
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "Host CPU",
      serversCount: localServersCount,
      isLocal: true,
      kind: "local",
      status: "online",
      uptime: os.uptime()
    };

    // Previously this always reported "online" for every Wings node
    // regardless of whether it was actually reachable — a node could be
    // powered off for days and still show green here. Do a real,
    // short-timeout health check per node (same call getNodeHealth uses)
    // so the list matches reality; a slow/unreachable node just reports
    // offline instead of hanging the whole list.
    const wingsProvider = new WingsRuntimeProvider();
    const safeWings = await Promise.all(wingsNodes.map(async (n: any) => {
      let status = "offline";
      try {
        await wingsProvider.getNodeHealth(n.id);
        status = "online";
      } catch {
        status = "offline";
      }
      return {
        ...n,
        token: undefined,
        ip: n.hostname || n.ip,
        kind: "wings",
        serversCount: servers.filter((s: any) => s.nodeId === n.id).length,
        status
      };
    }));

    const safeAgents = agentNodes.map((n: any) => ({
      ...n,
      key: undefined,
      kind: "agent",
      serversCount: servers.filter((s: any) => s.nodeId === n.id).length,
      status: n.status || "pending"
    }));

    res.json([localNode, ...safeAgents, ...safeWings]);
  } catch (err) {
    console.error("Error loading nodes:", err);
    res.status(500).json({ error: "Failed to load nodes" });
  }
});

router.get("/:id/stats", async (req, res) => {
  const { id } = req.params;
  try {
    if (id === "local") {
      const cpuUsage = await getCpuUsage();
      const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
      const freeMemMB = Math.round(os.freemem() / (1024 * 1024));
      const usedMemMB = totalMemMB - freeMemMB;
      const ramUsagePercent = Math.round((usedMemMB / totalMemMB) * 100);

      let diskUsagePercent = 15;
      let diskTotalMB = 50000;
      let diskUsedMB = 7500;
      try {
        const { stdout } = await execPromise("df -m /home || df -m /");
        const lines = stdout.trim().split("\n");
        if (lines.length > 1) {
          const parts = lines[lines.length - 1].trim().split(/\s+/);
          if (parts.length >= 5) {
            diskTotalMB = parseInt(parts[1]) || 50000;
            diskUsedMB = parseInt(parts[2]) || 7500;
            diskUsagePercent = parseInt(parts[4].replace("%", "")) || Math.round((diskUsedMB / diskTotalMB) * 100);
          }
        }
      } catch (e) {}

      return res.json({
        cpuUsage,
        cpuCores: os.cpus().length,
        memory: { totalMB: totalMemMB, usedMB: usedMemMB, freeMB: freeMemMB, percent: ramUsagePercent },
        disk: { totalMB: diskTotalMB, usedMB: diskUsedMB, percent: diskUsagePercent },
        uptime: os.uptime(),
        timestamp: Date.now()
      });
    }

    // Agent nodes: pull real telemetry from the remote agent installed by
    // node.sh. If the node hasn't checked in yet or is unreachable, report
    // it as offline instead of inventing numbers.
    const agentNodes = (await readJSON("nodes.json")) || [];
    const agentNode = agentNodes.find((n: any) => n.id === id);
    if (agentNode) {
      try {
        const client = agentClient(agentNode);
        const { data } = await client.get("/agent/stats");

        const idx = agentNodes.findIndex((n: any) => n.id === id);
        if (idx !== -1 && agentNodes[idx].status !== "online") {
          agentNodes[idx].status = "online";
          await writeJSON("nodes.json", agentNodes);
        }

        return res.json(data);
      } catch (err) {
        const idx = agentNodes.findIndex((n: any) => n.id === id);
        if (idx !== -1 && agentNodes[idx].status !== "offline") {
          agentNodes[idx].status = "offline";
          await writeJSON("nodes.json", agentNodes);
        }
        return res.status(502).json({ error: "Node unreachable", status: "offline" });
      }
    }

    // Wings nodes: previously this endpoint returned hardcoded zeros with
    // a "not implemented" note, and the node list below always reported
    // status "online" regardless of reality — so the panel showed a
    // green "online" node with a live-looking but completely fake 0%
    // graph. getNodeHealth() already calls the real Wings /api/system
    // endpoint; wire it up the same way agent nodes are handled above,
    // including flipping the persisted status on success/failure so the
    // node list reflects it too.
    const wingsNodes = (await readJSON("wings_nodes.json")) || [];
    const wingsNode = wingsNodes.find((n: any) => n.id === id);
    if (wingsNode) {
      try {
        const health = await new WingsRuntimeProvider().getNodeHealth(id);
        const idx = wingsNodes.findIndex((n: any) => n.id === id);
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
          cpuCores: health.cpu_count ?? undefined,
          memory: {
            totalMB: totalMemMB,
            usedMB: usedMemMB,
            freeMB: Math.max(0, totalMemMB - usedMemMB),
            percent: totalMemMB > 0 ? Math.round((usedMemMB / totalMemMB) * 100) : 0
          },
          disk: {
            totalMB: totalDiskMB,
            usedMB: usedDiskMB,
            percent: totalDiskMB > 0 ? Math.round((usedDiskMB / totalDiskMB) * 100) : 0
          },
          uptime: health.uptime ?? 0,
          timestamp: Date.now(),
          raw: health
        });
      } catch (err) {
        const idx = wingsNodes.findIndex((n: any) => n.id === id);
        if (idx !== -1 && wingsNodes[idx].status !== "offline") {
          wingsNodes[idx].status = "offline";
          await writeJSON("wings_nodes.json", wingsNodes);
        }
        return res.status(502).json({ error: "Wings node unreachable", status: "offline" });
      }
    }

    return res.status(404).json({ error: "Node not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Register a new Wings-protocol node (unchanged behavior).
router.post("/", async (req, res) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  try {
    const nodes = (await readJSON("wings_nodes.json")) || [];
    const newNode = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    nodes.push(newNode);
    await writeJSON("wings_nodes.json", nodes);
    res.json({ success: true, node: { ...newNode, token: undefined } });
  } catch (err) {
    console.error("Error creating node:", err);
    res.status(500).json({ error: "Failed to save node" });
  }
});

// Register a new Agent node (our own docker-proxy protocol). Mints a node
// id + key up front and returns a ready-to-paste install command that
// bakes both in, so the operator doesn't have to copy anything back out of
// the VPS terminal.
router.post("/agent", async (req, res) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  try {
    const { name, ip, port, memory, disk, location, ssl } = req.body || {};
    if (!name) return res.status(400).json({ error: "Node name is required" });

    const id = uuidv4();
    const key = crypto.randomBytes(24).toString("hex");
    const resolvedPort = port ? parseInt(port) : 6768;

    const nodes = (await readJSON("nodes.json")) || [];
    const newNode = {
      id,
      name,
      ip: ip || "",
      port: resolvedPort,
      ssl: !!ssl,
      key,
      memory: memory || 8192,
      disk: disk || 50000,
      location: location || "Default",
      connectionMode: "direct",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    nodes.push(newNode);
    await writeJSON("nodes.json", nodes);

    const panelUrl = `${req.protocol}://${req.get("host")}`;
    const installCommand =
      `curl -fsSL ${panelUrl}/node.sh | sudo bash -s -- ` +
      `--id ${id} --key ${key} --port ${resolvedPort} --panel-url ${panelUrl}`;

    res.json({
      success: true,
      node: { ...newNode, key: undefined },
      installCommand,
      note: "Run this command as root on the remote VPS. The node will switch from 'pending' to 'online' automatically once the agent starts."
    });
  } catch (err: any) {
    console.error("Error creating agent node:", err);
    res.status(500).json({ error: "Failed to save node" });
  }
});

router.delete("/:id", async (req, res) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  const { id } = req.params;
  if (id === "local") {
    return res.status(400).json({ error: "Cannot delete the built-in local node" });
  }

  try {
    let wingsNodes = (await readJSON("wings_nodes.json")) || [];
    let agentNodes = (await readJSON("nodes.json")) || [];

    wingsNodes = wingsNodes.filter((n: any) => n.id !== id);
    agentNodes = agentNodes.filter((n: any) => n.id !== id);

    await writeJSON("wings_nodes.json", wingsNodes);
    await writeJSON("nodes.json", agentNodes);

    res.json({ success: true, message: "Node deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/health", async (req, res) => {
  const { id } = req.params;
  if (id === "local") return res.json({ status: "healthy", message: "Node online" });

  const agentNodes = (await readJSON("nodes.json")) || [];
  const agentNode = agentNodes.find((n: any) => n.id === id);
  if (agentNode) {
    try {
      await axios.get(`${agentBaseUrl(agentNode)}/health`, { timeout: 4000 });
      return res.json({ status: "healthy", message: "Node online" });
    } catch (e) {
      return res.status(502).json({ status: "unreachable", message: "Node did not respond" });
    }
  }

  res.json({ status: "healthy", message: "Node online" });
});

export default router;
