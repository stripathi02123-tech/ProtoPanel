#!/usr/bin/env bash

# ==============================================================================
#  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ 
#  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗
#  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║
#  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║
#  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝
#  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
#
#  Product Name : Proto Panel (Uninstaller)
#  Banner       : PROTO PANEL
#  Creator      : Nishant
# ==============================================================================

set -Eeuo pipefail

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
echo -e "${C_CRIMSON}${C_BOLD}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
echo -e "${C_CRIMSON}${C_BOLD}  │                 PROTO PANEL - UNINSTALLATION WIZARD                        │${C_RESET}"
echo -e "${C_CRIMSON}${C_BOLD}  │               Credit: Nishant  |  Proto Panel                       │${C_RESET}"
echo -e "${C_CRIMSON}${C_BOLD}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
echo ""
echo -e "  ${C_AMBER}${C_BOLD}WARNING:${C_RESET} ${C_WHITE}This will stop PM2 services and clean up panel files.${C_RESET}"
echo -e "  ${C_EMERALD}NOTE:${C_RESET}    ${C_WHITE}Your server data in '.data/' will be safely preserved.${C_RESET}"
echo ""

read -r -p "  Are you sure you want to uninstall Proto Panel? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "\n  ${C_DEEP_BLUE}[INFO]${C_RESET} Uninstallation cancelled."
    exit 0
fi

echo -e "\n  ${C_DEEP_BLUE}[INFO]${C_RESET} Stopping PM2 services..."
if command -v pm2 &> /dev/null; then
    pm2 delete proto-panel 2>/dev/null || npx pm2 delete proto-panel 2>/dev/null || true
    pm2 save 2>/dev/null || npx pm2 save 2>/dev/null || true
fi

if [ -f ".env" ]; then
    PANEL_DOMAIN_TO_CLEAN=$(grep -oE '^PANEL_DOMAIN=.*' .env 2>/dev/null | cut -d= -f2-)
    if [ -n "${PANEL_DOMAIN_TO_CLEAN:-}" ] && command -v nginx &> /dev/null; then
        echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Removing Nginx site config for ${PANEL_DOMAIN_TO_CLEAN}..."
        sudo rm -f "/etc/nginx/sites-enabled/${PANEL_DOMAIN_TO_CLEAN}.conf" \
                   "/etc/nginx/sites-available/${PANEL_DOMAIN_TO_CLEAN}.conf" \
                   "/etc/nginx/conf.d/${PANEL_DOMAIN_TO_CLEAN}.conf" 2>/dev/null || true
        sudo nginx -t 2>/dev/null && sudo systemctl reload nginx 2>/dev/null || true
        echo -e "  ${C_MUTED}Note: the Let's Encrypt certificate for ${PANEL_DOMAIN_TO_CLEAN} was left in place.${C_RESET}"
        echo -e "  ${C_MUTED}Remove it with: sudo certbot delete --cert-name ${PANEL_DOMAIN_TO_CLEAN}${C_RESET}"
    fi
fi

echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Cleaning application workspace files (preserving .data)..."
if [ -f "package.json" ]; then
    # Safety check: only wipe the current directory if it's actually the
    # Proto Panel workspace, so this never blows away an unrelated folder
    # if the script happens to be run from the wrong place.
    if ! grep -q '"name": *"proto-panel"' package.json 2>/dev/null; then
        echo -e "  ${C_CRIMSON}[✗ ERROR]${C_RESET} This does not look like the Proto Panel directory (package.json name mismatch)."
        echo -e "  ${C_MUTED}Refusing to delete files to avoid removing the wrong folder. cd into the Proto Panel directory and re-run.${C_RESET}"
        exit 1
    fi
    read -r -p "  This will permanently delete all panel files in $(pwd) except .data/. Type 'DELETE' to confirm: " double_confirm
    if [ "$double_confirm" != "DELETE" ]; then
        echo -e "  ${C_DEEP_BLUE}[INFO]${C_RESET} Uninstallation cancelled at final confirmation."
        exit 0
    fi
    find . -maxdepth 1 ! -name '.data' ! -name '.' ! -name '..' -exec rm -rf {} + 2>/dev/null || true
elif [ -d "ProtoPanel" ]; then
    rm -rf ProtoPanel/node_modules ProtoPanel/dist ProtoPanel/src ProtoPanel/.git ProtoPanel/public ProtoPanel/package.json ProtoPanel/install.sh 2>/dev/null || true
else
    echo -e "  ${C_AMBER}[! WARNING]${C_RESET} No Proto Panel installation found in this directory or ./ProtoPanel — nothing to clean up."
fi

echo ""
echo -e "  ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}Proto Panel uninstalled cleanly.${C_RESET}"
echo -e "  ${C_MUTED}All server configurations and worlds remain preserved in .data/${C_RESET}"
echo ""
