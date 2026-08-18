#!/usr/bin/env bash

# ==============================================================================
#  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ 
#  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗
#  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║
#  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║
#  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝
#  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
#
#  Product Name : Proto Panel (Update Suite)
#  Banner       : PROTO PANEL
#  Creator      : Nishant
# ==============================================================================

set -Eeuo pipefail

LOG_DIR="$(pwd)/.install-logs"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
UPDATE_LOG="${LOG_DIR}/proto-panel-update-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$UPDATE_LOG" 2>/dev/null || cat) 2>&1

FAILED_STEPS=()

# Palette
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_VIBRANT_CYAN='\033[38;5;45m'
C_DEEP_BLUE='\033[38;5;33m'
C_EMERALD='\033[38;5;48m'
C_AMBER='\033[38;5;214m'
C_CRIMSON='\033[38;5;196m'
C_WHITE='\033[38;5;255m'
C_MUTED='\033[38;5;244m'

echo ""
echo -e "${C_VIBRANT_CYAN}${C_BOLD}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
echo -e "${C_VIBRANT_CYAN}${C_BOLD}  │                 PROTO PANEL - AUTOMATED UPDATE SUITE                       │${C_RESET}"
echo -e "${C_VIBRANT_CYAN}${C_BOLD}  │               Credit: Nishant  |  Proto Panel                       │${C_RESET}"
echo -e "${C_VIBRANT_CYAN}${C_BOLD}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
echo ""

# Workspace verification
if [ ! -f "package.json" ]; then
    if [ -d "ProtoPanel" ]; then
        cd ProtoPanel
    else
        echo -e " ${C_CRIMSON}[✗ ERROR]${C_RESET} package.json not found. Please run this script from inside the Proto Panel directory."
        exit 1
    fi
fi

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Fetching latest updates from GitHub repository..."
if ! git fetch origin main 2>/dev/null && ! git fetch origin master 2>/dev/null; then
    echo -e " ${C_AMBER}[! WARNING]${C_RESET} Could not fetch from origin (no network, no remote, or no git repo here)."
    FAILED_STEPS+=("git fetch")
fi
git pull --ff-only origin main 2>/dev/null || git pull --ff-only origin master 2>/dev/null || git pull 2>/dev/null || {
    echo -e " ${C_AMBER}[! WARNING]${C_RESET} git pull did not apply cleanly. Continuing with the code already on disk."
    FAILED_STEPS+=("git pull")
}

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Refreshing dependencies..."
if ! npm install --no-audit --no-fund --quiet; then
    echo -e " ${C_CRIMSON}[✗ ERROR]${C_RESET} npm install failed. See ${UPDATE_LOG} for details."
    FAILED_STEPS+=("npm install")
fi

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Compiling and building latest production release..."
if ! npm run build; then
    echo -e " ${C_CRIMSON}[✗ ERROR]${C_RESET} Build failed. The previous build (if any) is still running. See ${UPDATE_LOG} for details."
    FAILED_STEPS+=("npm run build")
fi

echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} Restarting background service..."
if command -v systemctl &> /dev/null && systemctl is-active --quiet proto-panel 2>/dev/null; then
    sudo systemctl restart proto-panel || FAILED_STEPS+=("systemctl restart")
elif command -v pm2 &> /dev/null; then
    pm2 restart proto-panel 2>/dev/null || npx pm2 restart proto-panel 2>/dev/null || FAILED_STEPS+=("pm2 restart")
else
    echo -e " ${C_AMBER}[! WARNING]${C_RESET} No systemd service or pm2 process named 'proto-panel' found to restart. Start it manually if needed."
fi

echo ""
if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
    echo -e " ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}Proto Panel has been updated and restarted successfully!${C_RESET}"
else
    echo -e " ${C_CRIMSON}${C_BOLD}[✗ COMPLETED WITH ERRORS]${C_RESET} ${C_WHITE}The following steps had problems: ${FAILED_STEPS[*]}${C_RESET}"
    echo -e " ${C_MUTED}Full log: ${UPDATE_LOG}${C_RESET}"
fi
echo ""
