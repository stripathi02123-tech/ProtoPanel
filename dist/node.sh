#!/bin/bash
# ==============================================================================
# Proto Panel — Remote Node Agent Installer
# Sets up a lightweight authenticated agent on a remote VPS that lets the
# panel orchestrate Docker containers on this machine and pull live host
# telemetry (cpu/mem/disk), the same way Pterodactyl's Wings daemon does.
# Credit: Nishant
# ==============================================================================
set -Eeuo pipefail

PORT=6768
CF_TOKEN=""
NODE_KEY=""
NODE_ID=""
PANEL_URL=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -p|--port) PORT="$2"; shift ;;
        -c|--cf-token) CF_TOKEN="$2"; shift ;;
        -k|--key) NODE_KEY="$2"; shift ;;
        -i|--id) NODE_ID="$2"; shift ;;
        -u|--panel-url) PANEL_URL="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

echo "======================================"
echo "    Proto Panel Node Agent Setup       "
echo "======================================"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash node.sh ...)"
  exit 1
fi

# --- Docker -------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo "[+] Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "[+] Docker is already installed."
fi

# --- Node.js --------------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo "[+] Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[+] Node.js is already installed."
fi

# --- PM2 --------------------------------------------------------------
if ! command -v pm2 &> /dev/null; then
    echo "[+] Installing PM2..."
    npm install -g pm2
fi

# --- Agent directory --------------------------------------------------------------
mkdir -p /opt/protopanel-node
cd /opt/protopanel-node

# This is where the panel bind-mounts each server's data directory into its
# container (see docker.ts:containerBindPath). Needs to exist up front with
# permissive ownership since the panel process runs on a different machine
# and can't chmod it directly — only reach it via the Docker Engine API.
mkdir -p /opt/protopanel-node/servers
chmod 777 /opt/protopanel-node/servers

cat << 'PKGEOF' > package.json
{
  "name": "protopanel-node",
  "version": "2.0.0",
  "description": "Remote node agent for Proto Panel",
  "main": "agent.js",
  "dependencies": {
    "express": "^4.18.2",
    "http-proxy-middleware": "^2.0.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  }
}
PKGEOF

cat << 'AGENTEOF' > agent.js
require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
app.use(cors());

// Public, unauthenticated health check — used by the panel to show
// "reachable" status before the node key handshake is verified.
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'protopanel-node', status: 'online' });
});

// Everything below this line requires the panel-issued node key.
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!process.env.NODE_KEY) {
    console.error('Missing NODE_KEY in environment');
    return res.status(500).send('Node key not configured properly.');
  }
  if (!auth || auth !== 'Bearer ' + process.env.NODE_KEY) {
    console.error('Invalid token authentication attempt');
    return res.status(401).send('Unauthorized');
  }
  next();
});

// Live host telemetry — polled by the panel's Nodes page every few seconds.
function cpuUsagePercent() {
  return new Promise((resolve) => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();
      let idleDelta = 0, totalDelta = 0;
      for (let i = 0; i < start.length; i++) {
        const s = start[i].times, e = end[i].times;
        const sTotal = s.user + s.nice + s.sys + s.idle + s.irq;
        const eTotal = e.user + e.nice + e.sys + e.idle + e.irq;
        idleDelta += e.idle - s.idle;
        totalDelta += eTotal - sTotal;
      }
      resolve(totalDelta > 0 ? Math.max(0, Math.min(100, Math.round(100 - (100 * idleDelta / totalDelta)))) : 0);
    }, 150);
  });
}

app.get('/agent/stats', async (req, res) => {
  try {
    const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMB = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMB = totalMemMB - freeMemMB;

    let diskTotalMB = 0, diskUsedMB = 0, diskPercent = 0;
    try {
      const out = execSync("df -m / | tail -1").toString().trim().split(/\s+/);
      diskTotalMB = parseInt(out[1]) || 0;
      diskUsedMB = parseInt(out[2]) || 0;
      diskPercent = parseInt((out[4] || '0').replace('%', '')) || 0;
    } catch (e) {}

    const cpuUsage = await cpuUsagePercent();

    res.json({
      cpuUsage,
      cpuCores: os.cpus().length,
      cpuModel: (os.cpus()[0] || {}).model || 'Unknown CPU',
      memory: {
        totalMB: totalMemMB,
        usedMB: usedMemMB,
        freeMB: freeMemMB,
        percent: totalMemMB > 0 ? Math.round((usedMemMB / totalMemMB) * 100) : 0
      },
      disk: {
        totalMB: diskTotalMB,
        usedMB: diskUsedMB,
        percent: diskPercent
      },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Everything else proxies straight to the local Docker Engine API, so the
// panel's existing dockerode client can manage containers on this node
// exactly as it does on localhost.
const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';

if (!fs.existsSync(socketPath) && process.platform !== 'win32') {
  console.error(`Warning: Docker socket not found at ${socketPath}`);
}

app.use('/', createProxyMiddleware({
  target: { host: 'localhost', protocol: 'http:', socketPath },
  changeOrigin: true
}));

const PORT = process.env.PORT || 6768;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proto Panel node agent listening on port ${PORT}`);
});
AGENTEOF

echo "[+] Installing agent dependencies..."
npm install --no-audit --no-fund --quiet

# --- Node key: use panel-issued key if provided, otherwise mint one so this
# script still works when run manually/standalone -------------------------
if [ -z "$NODE_KEY" ]; then
    NODE_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
fi

echo "NODE_KEY=$NODE_KEY" > .env
echo "PORT=$PORT" >> .env

echo "[+] Starting node agent..."
pm2 stop protopanel-node 2>/dev/null || true
pm2 delete protopanel-node 2>/dev/null || true
pm2 start agent.js --name protopanel-node
pm2 save
pm2 startup | tail -n 1 > pm2-startup.sh
chmod +x pm2-startup.sh
./pm2-startup.sh || true

IP_ADDR=$(curl -s ifconfig.me || echo "YOUR_VPS_IP")

if [ -n "$CF_TOKEN" ]; then
    echo "[+] Cloudflare Tunnel token provided. Installing cloudflared..."
    if ! command -v cloudflared &> /dev/null; then
      curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
      dpkg -i cloudflared.deb
      rm cloudflared.deb
    fi
    echo "[+] Starting Cloudflare Tunnel service..."
    cloudflared service install "$CF_TOKEN"
fi

echo "======================================"
echo "    Node Agent Setup Complete!         "
echo "======================================"

# If this install was kicked off from the panel's "Add Node" flow (which
# passes --id/--key/--panel-url), report back so the node flips from
# "pending" to "online" without the user pasting anything manually.
if [ -n "$NODE_ID" ] && [ -n "$PANEL_URL" ]; then
    echo "[+] Notifying panel at ${PANEL_URL} that this node is online..."
    curl -s -o /dev/null -X POST "${PANEL_URL%/}/api/nodes/${NODE_ID}/checkin" \
        -H "Content-Type: application/json" \
        -d "{\"key\":\"${NODE_KEY}\",\"ip\":\"${IP_ADDR}\",\"port\":${PORT}}" || \
        echo "    (Could not reach panel automatically — it will pick the node up on the next stats poll.)"
fi

echo ""
echo "If you ran this manually (not via the panel's Add Node button), enter"
echo "these details into the panel yourself:"
echo ""
echo "  IP Address : $IP_ADDR"
echo "  Port       : $PORT"
echo "  Node Key   : $NODE_KEY"
echo ""
echo "======================================"
