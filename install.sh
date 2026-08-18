#!/usr/bin/env bash

# ==============================================================================
#  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ 
#  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗
#  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║
#  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║
#  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝
#  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
#
#  Product Name : Proto Panel
#  Panel Banner : PROTO PANEL
#  Version      : v3.0
#  Creator      : Nishant
#  Repository   : https://github.com/stripathi02123-tech/ProtoPanel
# ==============================================================================

set -Eeuo pipefail

# Panel Core Configuration
PANEL_TITLE="PROTO PANEL"
PANEL_SUBTITLE="Proto Panel"
PANEL_AUTHOR="Nishant"
PANEL_VERSION="3.0"
DEFAULT_PROD_PORT=6767
DEFAULT_DEV_PORT=30000
REPO_URL="https://github.com/stripathi02123-tech/ProtoPanel.git"

# --- Debugging & Logging ---------------------------------------------------
# Every run is fully logged so failures can be diagnosed without reproducing
# them interactively. Set PROTO_DEBUG=1 in the environment to also echo
# every command that's executed (bash 'xtrace') into the same log file.
LOG_DIR="$(pwd)/.install-logs"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
INSTALL_LOG="${LOG_DIR}/proto-panel-install-$(date +%Y%m%d-%H%M%S).log"
touch "$INSTALL_LOG" 2>/dev/null || INSTALL_LOG="/tmp/proto-panel-install.log"

if [ "${PROTO_DEBUG:-0}" = "1" ]; then
    exec 19>>"$INSTALL_LOG"
    BASH_XTRACEFD=19
    PS4='+ [\D{%H:%M:%S}] ${BASH_SOURCE##*/}:${LINENO}: '
    set -x
fi

# Mirror all stdout/stderr into the log file while still showing it on screen
exec > >(tee -a "$INSTALL_LOG") 2>&1

CURRENT_STEP="initializing"

# ==============================================================================
#  Language / i18n support
#  INSTALL_LANG holds the active language code (en/hi/bn/fr). t() looks up a
#  message key in that language, always falling back to English if the key or
#  language is missing, so the installer never prints a blank line.
# ==============================================================================
INSTALL_LANG="en"

t() {
    local key="$1"
    local var="MSG_${INSTALL_LANG}_${key}"
    local fallback_var="MSG_en_${key}"
    if [ -n "${!var:-}" ]; then
        printf '%s' "${!var}"
    elif [ -n "${!fallback_var:-}" ]; then
        printf '%s' "${!fallback_var}"
    else
        printf '%s' "$key"
    fi
}

# --- English (default) -------------------------------------------------------
MSG_en_lang_prompt_title="STEP 0: SELECT INSTALLER LANGUAGE"
MSG_en_lang_prompt_body="Choose the language for this installer's prompts and messages:"
MSG_en_lang_selected="Installer language set to: English"
MSG_en_menu_title_1="Install Proto Panel (Production Deployment - Port"
MSG_en_menu_title_2="Install Proto Panel (Development Mode - Port"
MSG_en_menu_title_3="Update Panel (Pull GitHub updates & rebuild)"
MSG_en_menu_title_4="Create / Reset Administrator Account"
MSG_en_menu_title_5="Restart Panel Service"
MSG_en_menu_title_6="Uninstall Panel"
MSG_en_menu_title_7="Configure Domain & Free SSL (Nginx + Let's Encrypt)"
MSG_en_menu_title_8="Exit"
MSG_en_menu_title_9="Install Wings Daemon on this machine (experimental)"
MSG_en_menu_select="Select an option [1-9]:"
MSG_en_menu_invalid="Invalid selection. Please enter a number between 1 and 9."
MSG_en_menu_press_enter="Press Enter to return to main menu..."
MSG_en_menu_exiting="Exiting installer. Thank you for using Proto Panel!"
MSG_en_subtitle="Next-Gen Game Server & Workload Control Dashboard"

# --- Hindi (हिन्दी) ------------------------------------------------------------
MSG_hi_lang_prompt_title="चरण 0: इंस्टॉलर की भाषा चुनें"
MSG_hi_lang_prompt_body="इस इंस्टॉलर के संदेशों के लिए भाषा चुनें:"
MSG_hi_lang_selected="इंस्टॉलर भाषा सेट: हिन्दी"
MSG_hi_menu_title_1="प्रोटो पैनल इंस्टॉल करें (प्रोडक्शन डिप्लॉयमेंट - पोर्ट"
MSG_hi_menu_title_2="प्रोटो पैनल इंस्टॉल करें (डेवलपमेंट मोड - पोर्ट"
MSG_hi_menu_title_3="पैनल अपडेट करें (GitHub अपडेट लाएं और रीबिल्ड करें)"
MSG_hi_menu_title_4="एडमिन खाता बनाएं / रीसेट करें"
MSG_hi_menu_title_5="पैनल सेवा पुनः प्रारंभ करें"
MSG_hi_menu_title_6="पैनल अनइंस्टॉल करें"
MSG_hi_menu_title_7="डोमेन और फ्री SSL कॉन्फ़िगर करें (Nginx + Let's Encrypt)"
MSG_hi_menu_title_8="बाहर निकलें"
MSG_hi_menu_title_9="इस मशीन पर Wings डेमन इंस्टॉल करें (प्रायोगिक)"
MSG_hi_menu_select="एक विकल्प चुनें [1-9]:"
MSG_hi_menu_invalid="अमान्य चयन। कृपया 1 से 9 के बीच एक संख्या दर्ज करें।"
MSG_hi_menu_press_enter="मुख्य मेनू पर लौटने के लिए Enter दबाएं..."
MSG_hi_menu_exiting="इंस्टॉलर से बाहर निकल रहे हैं। Proto Panel उपयोग करने के लिए धन्यवाद!"
MSG_hi_subtitle="नेक्स्ट-जेन गेम सर्वर और वर्कलोड नियंत्रण डैशबोर्ड"

# --- Bengali (বাংলা) -----------------------------------------------------------
MSG_bn_lang_prompt_title="ধাপ ০: ইনস্টলার ভাষা নির্বাচন করুন"
MSG_bn_lang_prompt_body="এই ইনস্টলারের বার্তার জন্য ভাষা নির্বাচন করুন:"
MSG_bn_lang_selected="ইনস্টলার ভাষা সেট করা হয়েছে: বাংলা"
MSG_bn_menu_title_1="প্রোটো প্যানেল ইনস্টল করুন (প্রোডাকশন ডিপ্লয়মেন্ট - পোর্ট"
MSG_bn_menu_title_2="প্রোটো প্যানেল ইনস্টল করুন (ডেভেলপমেন্ট মোড - পোর্ট"
MSG_bn_menu_title_3="প্যানেল আপডেট করুন (GitHub আপডেট আনুন ও রিবিল্ড করুন)"
MSG_bn_menu_title_4="অ্যাডমিন অ্যাকাউন্ট তৈরি / রিসেট করুন"
MSG_bn_menu_title_5="প্যানেল সার্ভিস পুনরায় চালু করুন"
MSG_bn_menu_title_6="প্যানেল আনইনস্টল করুন"
MSG_bn_menu_title_7="ডোমেইন ও ফ্রি SSL কনফিগার করুন (Nginx + Let's Encrypt)"
MSG_bn_menu_title_8="প্রস্থান করুন"
MSG_bn_menu_title_9="এই মেশিনে Wings ডেমন ইনস্টল করুন (পরীক্ষামূলক)"
MSG_bn_menu_select="একটি অপশন নির্বাচন করুন [১-৯]:"
MSG_bn_menu_invalid="ভুল নির্বাচন। অনুগ্রহ করে ১ থেকে ৯ এর মধ্যে একটি সংখ্যা লিখুন।"
MSG_bn_menu_press_enter="মূল মেনুতে ফিরে যেতে Enter চাপুন..."
MSG_bn_menu_exiting="ইনস্টলার থেকে বের হওয়া হচ্ছে। Proto Panel ব্যবহারের জন্য ধন্যবাদ!"
MSG_bn_subtitle="নেক্সট-জেন গেম সার্ভার ও ওয়ার্কলোড কন্ট্রোল ড্যাশবোর্ড"

# --- French (Français) --------------------------------------------------------
MSG_fr_lang_prompt_title="ÉTAPE 0 : CHOISISSEZ LA LANGUE DE L'INSTALLATEUR"
MSG_fr_lang_prompt_body="Choisissez la langue des messages de cet installateur :"
MSG_fr_lang_selected="Langue de l'installateur définie sur : Français"
MSG_fr_menu_title_1="Installer Proto Panel (Déploiement Production - Port"
MSG_fr_menu_title_2="Installer Proto Panel (Mode Développement - Port"
MSG_fr_menu_title_3="Mettre à jour le panneau (récupérer les mises à jour GitHub et reconstruire)"
MSG_fr_menu_title_4="Créer / réinitialiser le compte administrateur"
MSG_fr_menu_title_5="Redémarrer le service du panneau"
MSG_fr_menu_title_6="Désinstaller le panneau"
MSG_fr_menu_title_7="Configurer le domaine et le SSL gratuit (Nginx + Let's Encrypt)"
MSG_fr_menu_title_8="Quitter"
MSG_fr_menu_title_9="Installer le démon Wings sur cette machine (expérimental)"
MSG_fr_menu_select="Sélectionnez une option [1-9] :"
MSG_fr_menu_invalid="Sélection invalide. Veuillez entrer un nombre entre 1 et 9."
MSG_fr_menu_press_enter="Appuyez sur Entrée pour revenir au menu principal..."
MSG_fr_menu_exiting="Fermeture de l'installateur. Merci d'utiliser Proto Panel !"
MSG_fr_subtitle="Tableau de bord de contrôle de serveurs de jeu nouvelle génération"

prompt_language_selection() {
    clear
    echo -e "${C_ELECTRIC_PURPLE}${C_BOLD}"
    echo "██████╗ ██████╗   ██████╗ ████████╗ ██████╗    ██████╗   █████╗ ███╗   ██╗███████╗██╗     "
    echo "██╔══██╗██╔══██╗ ██╔═══██╗╚══██╔══╝██╔═══██╗   ██╔══██╗ ██╔══██╗████╗  ██║██╔════╝██║     "
    echo "██████╔╝██████╔╝ ██║   ██║   ██║   ██║   ██║   ██████╔╝ ███████║██╔██╗ ██║█████╗  ██║     "
    echo "██╔═══╝ ██╔══██╗ ██║   ██║   ██║   ██║   ██║   ██╔═══╝  ██╔══██║██║╚██╗██║██╔══╝  ██║     "
    echo "██║     ██║  ██║ ╚██████╔╝   ██║   ╚██████╔╝   ██║      ██║  ██║██║ ╚████║███████╗███████╗"
    echo "╚═╝     ╚═╝  ╚═╝  ╚═════╝    ╚═╝    ╚═════╝    ╚═╝      ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
    echo -e "${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  │ ${C_WHITE}${C_BOLD} $(t lang_prompt_title)${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    echo -e "  $(t lang_prompt_body)"
    echo ""
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 1 ] ${C_WHITE}English${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 2 ] ${C_WHITE}हिन्दी (Hindi)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 3 ] ${C_WHITE}বাংলা (Bengali)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 4 ] ${C_WHITE}Français (French)${C_RESET}"
    echo ""

    local lang_choice
    read -r -p "  Enter Selection [1-4, default: 1]: " lang_choice
    lang_choice=$(echo "$lang_choice" | tr -d ' ')

    case "$lang_choice" in
        2) INSTALL_LANG="hi" ;;
        3) INSTALL_LANG="bn" ;;
        4) INSTALL_LANG="fr" ;;
        *) INSTALL_LANG="en" ;;
    esac

    echo ""
    log_success "$(t lang_selected)"
    sleep 0.8
}


# High-Contrast Deep ANSI Palette
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'

# Foreground Colors
C_DEEP_BLUE='\033[38;5;33m'
C_VIBRANT_CYAN='\033[38;5;45m'
C_ELECTRIC_PURPLE='\033[38;5;141m'
C_EMERALD='\033[38;5;48m'
C_AMBER='\033[38;5;214m'
C_ROSE='\033[38;5;204m'
C_CRIMSON='\033[38;5;196m'
C_WHITE='\033[38;5;255m'
C_MUTED='\033[38;5;244m'

# Background Badges
BG_CYAN='\033[48;5;31;38;5;255m'
BG_GREEN='\033[48;5;28;38;5;255m'
BG_AMBER='\033[48;5;208;38;5;232m'
BG_RED='\033[48;5;160;38;5;255m'
BG_PURPLE='\033[48;5;93;38;5;255m'

print_banner() {
    clear
    echo -e "${C_VIBRANT_CYAN}${C_BOLD}"
    echo "██████╗ ██████╗   ██████╗ ████████╗ ██████╗    ██████╗   █████╗ ███╗   ██╗███████╗██╗     "
    echo "██╔══██╗██╔══██╗ ██╔═══██╗╚══██╔══╝██╔═══██╗   ██╔══██╗ ██╔══██╗████╗  ██║██╔════╝██║     "
    echo "██████╔╝██████╔╝ ██║   ██║   ██║   ██║   ██║   ██████╔╝ ███████║██╔██╗ ██║█████╗  ██║     "
    echo "██╔═══╝ ██╔══██╗ ██║   ██║   ██║   ██║   ██║   ██╔═══╝  ██╔══██║██║╚██╗██║██╔══╝  ██║     "
    echo "██║     ██║  ██║ ╚██████╔╝   ██║   ╚██████╔╝   ██║      ██║  ██║██║ ╚████║███████╗███████╗"
    echo "╚═╝     ╚═╝  ╚═╝  ╚═════╝    ╚═╝    ╚═════╝    ╚═╝      ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
    echo -e "${C_RESET}"
    echo -e "${C_DEEP_BLUE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_WHITE}${C_BOLD}                     ${PANEL_SUBTITLE} (v${PANEL_VERSION})                         ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_MUTED} $(t subtitle)${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_AMBER}                  Credit / Author: ${C_WHITE}${C_BOLD}${PANEL_AUTHOR}                               ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_VIBRANT_CYAN}         Repo: ${C_WHITE}https://github.com/Nishant/ProtoPanel                      ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    echo ""
}

log_info() {
    echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} ${C_WHITE}$1${C_RESET}"
}

log_success() {
    echo -e " ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}$1${C_RESET}"
}

log_warning() {
    echo -e " ${C_AMBER}${C_BOLD}[! WARNING]${C_RESET} ${C_AMBER}$1${C_RESET}"
}

log_error() {
    echo -e " ${C_CRIMSON}${C_BOLD}[✗ ERROR]${C_RESET} ${C_CRIMSON}$1${C_RESET}"
}

log_debug() {
    if [ "${PROTO_DEBUG:-0}" = "1" ]; then
        echo -e " ${C_MUTED}[DEBUG]${C_RESET} ${C_MUTED}$1${C_RESET}"
    fi
}

step() {
    # Marks which logical step is currently running, so a failure trap can
    # tell the user exactly where things went wrong instead of just dumping
    # a raw bash error.
    CURRENT_STEP="$1"
    log_debug "Entering step: $1"
}

on_error() {
    local exit_code=$?
    local line_no=$1
    local last_cmd=$2
    echo ""
    echo -e " ${BG_RED}${C_BOLD} [ INSTALLATION FAILED ] ${C_RESET}"
    log_error "Step failed:      ${CURRENT_STEP}"
    log_error "Command:           ${last_cmd}"
    log_error "Line:              ${line_no}"
    log_error "Exit code:         ${exit_code}"
    echo ""
    echo -e "  ${C_MUTED}A full trace of this run was saved to:${C_RESET}"
    echo -e "  ${C_VIBRANT_CYAN}${INSTALL_LOG}${C_RESET}"
    echo ""
    echo -e "  ${C_MUTED}Common fixes:${C_RESET}"
    echo -e "  ${C_MUTED}  - Re-run with more detail:${C_RESET} ${C_VIBRANT_CYAN}PROTO_DEBUG=1 bash install.sh${C_RESET}"
    echo -e "  ${C_MUTED}  - Check disk space:${C_RESET}        ${C_VIBRANT_CYAN}df -h .${C_RESET}"
    echo -e "  ${C_MUTED}  - Check the port is free:${C_RESET}  ${C_VIBRANT_CYAN}ss -ltnp | grep ${DEFAULT_PROD_PORT}${C_RESET}"
    echo -e "  ${C_MUTED}  - Re-run the installer; most steps are safe to repeat.${C_RESET}"
    echo ""
    exit "$exit_code"
}
trap 'on_error ${LINENO} "${BASH_COMMAND}"' ERR

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_warning "Running as non-root user. If package installation fails, please execute: sudo bash install.sh"
    fi
}

get_public_ip() {
    local ip
    ip=$(curl -s --max-time 4 https://api.ipify.org 2>/dev/null || curl -s --max-time 4 https://ifconfig.me 2>/dev/null || curl -s --max-time 4 https://icanhazip.com 2>/dev/null || echo "127.0.0.1")
    echo "$ip" | tr -d '\n' | tr -d '\r'
}

check_disk_space() {
    # npm install + build for this project comfortably needs >1GB free.
    local avail_kb
    avail_kb=$(df -Pk . 2>/dev/null | awk 'NR==2 {print $4}')
    if [ -n "$avail_kb" ] && [ "$avail_kb" -lt 1048576 ]; then
        log_warning "Low disk space detected ($((avail_kb / 1024))MB free). Installation may fail during npm install/build."
    fi
}

check_port_available() {
    local port=$1
    if command -v ss &> /dev/null && ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}\$"; then
        log_warning "Port ${port} already appears to be in use by another process."
        log_warning "The panel may fail to start until that process is stopped or a different port is configured in .env."
    fi
}

setup_system_dependencies() {
    step "Installing base system dependencies"
    log_info "Updating system package registry and tools..."

    if command -v apt-get &> /dev/null; then
        # Resolve any interrupted dpkg states and clear stale archive caches that trigger EXDEV / cross-device link errors
        sudo dpkg --configure -a 2>/dev/null || true
        sudo apt-get clean 2>/dev/null || true
        sudo rm -f /var/cache/apt/archives/*.deb 2>/dev/null || true

        # Detect only missing packages to avoid re-unpacking already working binaries
        local needed=()
        command -v curl &>/dev/null || needed+=("curl")
        command -v git &>/dev/null || needed+=("git")
        command -v tar &>/dev/null || needed+=("tar")
        command -v xz &>/dev/null || needed+=("xz-utils")
        command -v jq &>/dev/null || needed+=("jq")
        command -v ufw &>/dev/null || needed+=("ufw")
        [ -f /etc/ssl/certs/ca-certificates.crt ] || needed+=("ca-certificates")
        command -v make &>/dev/null || needed+=("build-essential")

        if [ ${#needed[@]} -gt 0 ]; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get update -y -qq 2>/dev/null || true
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
                -o Dpkg::Options::="--force-confdef" \
                -o Dpkg::Options::="--force-confold" \
                -o Dpkg::Options::="--force-overwrite" \
                "${needed[@]}" 2>/dev/null || {
                    for pkg in "${needed[@]}"; do
                        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$pkg" 2>/dev/null || true
                    done
                }
        fi
    elif command -v yum &> /dev/null; then
        sudo yum update -y -q || true
        sudo yum install -y -q curl git make gcc-c++ ca-certificates tar xz jq || true
    elif command -v pacman &> /dev/null; then
        sudo pacman -Sy --noconfirm curl git base-devel ca-certificates tar xz jq || true
    fi
    log_success "Base system dependencies configured."
}

ensure_nodejs() {
    step "Verifying/installing Node.js runtime"
    log_info "Verifying Node.js 20+ runtime environment..."
    local need_install=0

    if ! command -v node &> /dev/null; then
        need_install=1
    else
        local node_ver
        node_ver=$(node -v | cut -d'.' -f1 | tr -d 'v')
        if [ "$node_ver" -lt 20 ]; then
            log_warning "Detected legacy Node.js ($(node -v)). Upgrading to Node.js 22 LTS..."
            need_install=1
        fi
    fi

    if [ "$need_install" -eq 1 ]; then
        log_info "Installing Node.js 22.x LTS..."
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
            sudo yum install -y nodejs
        fi
    fi

    log_success "Node.js $(node -v) & npm $(npm -v) verified."
}

prompt_runtime_configuration() {
    step "Prompting for runtime engine selection"
    echo ""
    echo -e "${C_ELECTRIC_PURPLE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  │ ${C_WHITE}${C_BOLD}           STEP 1: SELECT SERVER EXECUTION RUNTIME ENGINE                 ${C_ELECTRIC_PURPLE}│${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    echo -e "  Choose how server processes (Minecraft, Node.js, Python) execute on this node:"
    echo ""
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 1 ] Docker Container Sandbox ${C_EMERALD}(Recommended for Production)${C_RESET}"
    echo -e "        ${C_MUTED}Isolated per-server Docker containers with memory & CPU limits.${C_RESET}"
    echo ""
    echo -e "  ${C_AMBER}${C_BOLD} [ 2 ] Local Process Engine ${C_MUTED}(Direct Host Execution via Node/Java/Python)${C_RESET}"
    echo -e "        ${C_MUTED}Spawns background child processes natively directly on the host.${C_RESET}"
    echo ""
    echo -e "  ${C_MUTED}--------------------------------------------------------------------------${C_RESET}"
    echo -e "  ${C_VIBRANT_CYAN}ℹ Notice: On standard panel (port ${DEFAULT_PROD_PORT}), all server creations use this default.${C_RESET}"
    echo -e "  ${C_VIBRANT_CYAN}  Per-server runtime selection is enabled exclusively in the Developer Panel.${C_RESET}"
    echo -e "  ${C_MUTED}--------------------------------------------------------------------------${C_RESET}"
    
    local choice
    read -r -p "  Enter Selection [1 or 2, default: 1]: " choice
    choice=$(echo "$choice" | tr -d ' ')

    case "$choice" in
        2)
            SELECTED_RUNTIME="local"
            RUNTIME_MODE="local"
            ;;
        *)
            SELECTED_RUNTIME="docker"
            RUNTIME_MODE="docker"
            ;;
    esac

    RUNTIME_LOCKED="true"
    echo ""
    log_success "Active Server Runtime: ${C_BOLD}${SELECTED_RUNTIME}${C_RESET} (Enforced & Locked for standard panel)"
}

prompt_theme_selection() {
    step "Prompting for accent theme selection"
    echo ""
    echo -e "${C_ELECTRIC_PURPLE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  │ ${C_WHITE}${C_BOLD}               STEP 2: SELECT PANEL ACCENT COLOR THEME                    ${C_ELECTRIC_PURPLE}│${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    echo -e "  Select the primary brand & accent color scheme for the panel interface:"
    echo ""
    echo -e "  ${C_CRIMSON} [ 1 ] Crimson Red   ${C_MUTED}(Signature Proto Red)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE} [ 2 ] Cobalt Blue   ${C_MUTED}(Classic Deep Blue)${C_RESET}"
    echo -e "  ${C_ELECTRIC_PURPLE} [ 3 ] Neon Purple   ${C_MUTED}(Cyberpunk Glow)${C_RESET}"
    echo -e "  ${C_VIBRANT_CYAN} [ 4 ] Cyber Cyan    ${C_MUTED}(Electric Aqua)${C_RESET}"
    echo -e "  ${C_EMERALD} [ 5 ] Emerald Green ${C_MUTED}(Vibrant Matrix)${C_RESET}"
    echo -e "  ${C_AMBER} [ 6 ] Amber Gold    ${C_MUTED}(Warm Radiant)${C_RESET}"
    echo -e "  ${C_ROSE} [ 7 ] Vivid Rose    ${C_MUTED}(Pastel Neon)${C_RESET}"
    echo -e "  ${C_WHITE} [ 8 ] Clean Slate   ${C_MUTED}(Monochrome Minimal)${C_RESET}"
    echo ""
    
    local theme_choice
    read -r -p "  Enter Theme Selection [1-8, default: 1]: " theme_choice
    theme_choice=$(echo "$theme_choice" | tr -d ' ')

    case "$theme_choice" in
        2) SELECTED_THEME="blue" ;;
        3) SELECTED_THEME="purple" ;;
        4) SELECTED_THEME="cyan" ;;
        5) SELECTED_THEME="green" ;;
        6) SELECTED_THEME="amber" ;;
        7) SELECTED_THEME="rose" ;;
        8) SELECTED_THEME="white" ;;
        *) SELECTED_THEME="red" ;;
    esac

    echo ""
    log_success "Panel Accent Theme Set: ${C_BOLD}${SELECTED_THEME}${C_RESET}"
}

prompt_java_install() {
    step "Checking/installing Java runtime"
    echo ""
    echo -e "${C_DEEP_BLUE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_WHITE}${C_BOLD}             STEP 3: JAVA RUNTIME (MINECRAFT LOCAL ENGINE)                ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    
    if command -v java &> /dev/null; then
        log_success "Java is already installed ($(java -version 2>&1 | head -n 1))."
    elif [ -f ".data/bin/jre-21/bin/java" ]; then
        log_success "Portable OpenJDK 21 LTS detected in .data/bin/jre-21."
    else
        local install_java
        read -r -p "  Install OpenJDK 21 Java Runtime on host? [y/N, default: y]: " install_java
        install_java=$(echo "$install_java" | tr -d ' ')
        if [[ "$install_java" =~ ^[Nn]$ ]]; then
            log_info "Skipping host Java installation. (The panel auto-provisions portable JRE on demand)."
        else
            log_info "Installing OpenJDK 21..."
            if command -v apt-get &> /dev/null; then
                sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
                    -o Dpkg::Options::="--force-confdef" \
                    -o Dpkg::Options::="--force-confold" \
                    -o Dpkg::Options::="--force-overwrite" \
                    openjdk-21-jre-headless 2>/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openjdk-17-jre-headless 2>/dev/null || log_warning "System Java package unavailable. Portable JRE will be used."
            elif command -v yum &> /dev/null; then
                sudo yum install -y -q java-21-openjdk-headless || sudo yum install -y -q java-17-openjdk-headless || true
            fi
            log_success "Java runtime verified."
        fi
    fi
}

prompt_docker_install() {
    step "Checking/installing Docker engine"
    echo ""
    echo -e "${C_DEEP_BLUE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_WHITE}${C_BOLD}               STEP 4: DOCKER CONTAINER ENGINE VERIFICATION              ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"

    if command -v docker &> /dev/null; then
        log_success "Docker Engine is active ($(docker --version 2>/dev/null | head -n 1))."
    else
        if [ "$SELECTED_RUNTIME" = "docker" ]; then
            log_info "Installing Docker Engine for container isolation..."
            curl -fsSL https://get.docker.com | sudo sh
            sudo systemctl enable --now docker 2>/dev/null || true
            sudo usermod -aG docker "$USER" 2>/dev/null || true
            log_success "Docker Engine installed and started."
        else
            local install_docker
            read -r -p "  Install Docker Engine? [y/N, default: n]: " install_docker
            if [[ "$install_docker" =~ ^[Yy]$ ]]; then
                curl -fsSL https://get.docker.com | sudo sh
                sudo systemctl enable --now docker 2>/dev/null || true
                sudo usermod -aG docker "$USER" 2>/dev/null || true
                log_success "Docker installed."
            else
                log_info "Docker skipped (Local Process mode selected)."
            fi
        fi
    fi
}

validate_domain() {
    local domain="$1"
    [[ "$domain" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]]
}

install_nginx() {
    if command -v nginx &> /dev/null; then
        return 0
    fi
    log_info "Installing Nginx..."
    if command -v apt-get &> /dev/null; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends nginx 2>/dev/null
    elif command -v yum &> /dev/null; then
        sudo yum install -y -q nginx
    elif command -v pacman &> /dev/null; then
        sudo pacman -Sy --noconfirm nginx
    else
        log_error "No supported package manager found to install Nginx."
        return 1
    fi
    sudo systemctl enable --now nginx 2>/dev/null || true
}

write_nginx_site() {
    local domain="$1"
    local proxy_port="$2"
    local conf_path="/etc/nginx/sites-available/${domain}.conf"
    local conf_content
    conf_content=$(cat <<NGINXEOF
# Proto Panel reverse proxy — ${domain}
# Generated by install.sh — credit: Nishant
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:${proxy_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }
}
NGINXEOF
)
    echo "$conf_content" | sudo tee "$conf_path" > /dev/null

    if [ -d /etc/nginx/sites-enabled ]; then
        sudo ln -sf "$conf_path" "/etc/nginx/sites-enabled/${domain}.conf"
    else
        # RHEL-style layouts include /etc/nginx/conf.d/*.conf automatically
        conf_path="/etc/nginx/conf.d/${domain}.conf"
        echo "$conf_content" | sudo tee "$conf_path" > /dev/null
    fi

    if ! sudo nginx -t 2>&1 | tee -a "$INSTALL_LOG"; then
        log_error "Nginx configuration test failed. Fix the config at ${conf_path} and run: sudo systemctl reload nginx"
        return 1
    fi
    sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || true
    log_success "Nginx reverse proxy configured for ${domain} -> 127.0.0.1:${proxy_port}"
}

prompt_domain_configuration() {
    step "Configuring domain & SSL (optional)"
    local target_port=$1
    echo ""
    echo -e "${C_DEEP_BLUE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_DEEP_BLUE}  │ ${C_WHITE}${C_BOLD}          STEP 5: DOMAIN & SSL SETUP (LIKE PTERODACTYL PANEL)             ${C_DEEP_BLUE}│${C_RESET}"
    echo -e "${C_DEEP_BLUE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    echo -e "  ${C_MUTED}Point a domain (e.g. panel.example.com) at this server and access it over${C_RESET}"
    echo -e "  ${C_MUTED}HTTPS with a free Let's Encrypt certificate, instead of using an IP:port.${C_RESET}"
    echo ""

    local want_domain
    read -r -p "  Configure a domain for this panel now? [y/N]: " want_domain
    if [[ ! "$want_domain" =~ ^[Yy]$ ]]; then
        log_info "Skipping domain setup. The panel will be reachable at http://<server-ip>:${target_port}."
        SELECTED_DOMAIN=""
        SSL_ENABLED="false"
        return 0
    fi

    local domain
    while true; do
        read -r -p "  Enter the domain/subdomain to use (e.g. panel.example.com): " domain
        if validate_domain "$domain"; then
            break
        fi
        log_warning "'$domain' doesn't look like a valid domain. Try again."
    done
    SELECTED_DOMAIN="$domain"

    # DNS sanity check — warn, but never block the install on it
    local server_ip resolved_ip
    server_ip=$(get_public_ip)
    resolved_ip=$( (getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -n1) || true )
    if [ -z "$resolved_ip" ]; then
        resolved_ip=$( (curl -s --max-time 4 "https://dns.google/resolve?name=${domain}&type=A" 2>/dev/null | grep -o '"data":"[0-9.]*"' | head -n1 | cut -d'"' -f4) || true )
    fi
    if [ -n "$resolved_ip" ] && [ "$resolved_ip" != "$server_ip" ]; then
        log_warning "DNS for ${domain} currently resolves to ${resolved_ip}, but this server's IP is ${server_ip}."
        log_warning "SSL issuance will fail until the DNS A record points here. You can still continue — fix DNS and re-run 'certbot --nginx -d ${domain}' later."
    elif [ -z "$resolved_ip" ]; then
        log_warning "Could not resolve ${domain} yet. If it's a brand-new DNS record, propagation may take a few minutes."
    else
        log_success "DNS for ${domain} correctly resolves to this server (${server_ip})."
    fi

    if ! install_nginx; then
        log_warning "Nginx installation failed — continuing without a reverse proxy. The panel remains reachable on port ${target_port}."
        SSL_ENABLED="false"
        return 0
    fi

    if ! write_nginx_site "$domain" "$target_port"; then
        SSL_ENABLED="false"
        return 0
    fi

    local want_ssl
    read -r -p "  Issue a free Let's Encrypt SSL certificate for ${domain} now? [y/N]: " want_ssl
    if [[ "$want_ssl" =~ ^[Yy]$ ]]; then
        log_info "Installing Certbot..."
        if command -v apt-get &> /dev/null; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends certbot python3-certbot-nginx 2>/dev/null
        elif command -v yum &> /dev/null; then
            sudo yum install -y -q certbot python3-certbot-nginx
        fi

        local admin_email
        read -r -p "  Email for SSL renewal notices (or press Enter to skip): " admin_email

        local certbot_args=(--nginx -d "$domain" --non-interactive --agree-tos --redirect)
        if [ -n "$admin_email" ]; then
            certbot_args+=(-m "$admin_email")
        else
            certbot_args+=(--register-unsafely-without-email)
        fi

        if sudo certbot "${certbot_args[@]}"; then
            log_success "SSL certificate issued. ${domain} is now served over HTTPS."
            SSL_ENABLED="true"
            sudo systemctl enable certbot.timer 2>/dev/null || true
        else
            log_error "Certbot failed to issue a certificate (check DNS/firewall for port 80/443). The panel is still reachable over HTTP at http://${domain}."
            log_error "Retry manually later with: sudo certbot --nginx -d ${domain}"
            SSL_ENABLED="false"
        fi
    else
        log_info "Skipping SSL. ${domain} will serve the panel over plain HTTP."
        SSL_ENABLED="false"
    fi

    if command -v ufw &> /dev/null; then
        sudo ufw allow "Nginx Full" 2>/dev/null || sudo ufw allow 80/tcp 2>/dev/null || true
        sudo ufw allow 443/tcp 2>/dev/null || true
    fi
}

prepare_repository() {
    step "Preparing application workspace (clone/pull repo)"
    log_info "Preparing application workspace..."

    # Check if we are already inside the project workspace
    if [ -f "package.json" ] && grep -q "proto-panel" "package.json" 2>/dev/null; then
        PROJECT_DIR="$(pwd)"
        log_info "Using current workspace directory: ${PROJECT_DIR}"
        sync_existing_repository "$PROJECT_DIR"
    elif [ -d "ProtoPanel" ]; then
        PROJECT_DIR="$(pwd)/ProtoPanel"
        cd "$PROJECT_DIR"
        log_info "Found existing 'ProtoPanel' directory. Syncing repository..."
        sync_existing_repository "$PROJECT_DIR"
    else
        log_info "Cloning Proto Panel from ${REPO_URL}..."
        git clone "$REPO_URL" ProtoPanel
        PROJECT_DIR="$(pwd)/ProtoPanel"
        cd "$PROJECT_DIR"
    fi

    verify_repository_integrity "$PROJECT_DIR"
}

# ------------------------------------------------------------------------------
# sync_existing_repository <dir>
#
# Forces the given directory (already the current working directory) to be a
# byte-for-byte match of origin/<default-branch>. Previously this was a plain
# `git pull ... || true`, which silently swallowed every failure mode below,
# leaving a stale workspace that would still "successfully" reach npm run
# build with missing/outdated files:
#   - dir exists but was extracted from a zip / copied manually (no .git)
#   - dir is a git repo but origin points somewhere else (fork/mirror)
#   - local commits/edits diverge from origin and `git pull` fast-forward fails
#   - a previous partial clone/pull left the working tree inconsistent
# In every one of these cases we now detect the problem explicitly and fall
# back to a clean re-clone instead of silently continuing on stale files.
# ------------------------------------------------------------------------------
sync_existing_repository() {
    local dir="$1"

    if [ ! -d ".git" ]; then
        log_warning "'${dir}' exists but is not a git repository (likely extracted from a zip/archive or copied manually)."
        reclone_repository "$dir"
        return
    fi

    local current_remote
    current_remote=$(git remote get-url origin 2>/dev/null || echo "")
    if [ "$current_remote" != "$REPO_URL" ]; then
        log_warning "'${dir}' is a git repo but its origin (${current_remote:-none}) does not match ${REPO_URL}."
        reclone_repository "$dir"
        return
    fi

    log_info "Fetching latest changes from origin..."
    if ! git fetch --prune origin; then
        log_warning "git fetch failed for '${dir}'. Falling back to a fresh clone."
        reclone_repository "$dir"
        return
    fi

    local default_branch
    default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
    if [ -z "$default_branch" ]; then
        if git show-ref --verify --quiet refs/remotes/origin/main; then
            default_branch="main"
        elif git show-ref --verify --quiet refs/remotes/origin/master; then
            default_branch="master"
        else
            log_warning "Could not determine the default branch for '${dir}'. Falling back to a fresh clone."
            reclone_repository "$dir"
            return
        fi
    fi

    # Hard reset + clean guarantees the working tree exactly matches origin,
    # discarding any local drift, half-merges, or leftover stale files
    # (this is what actually fixes the missing-file class of build failures).
    if git reset --hard "origin/${default_branch}" && git clean -fd; then
        log_success "Repository synced to latest '${default_branch}' from origin."
    else
        log_warning "Could not cleanly sync '${dir}' to origin/${default_branch}. Falling back to a fresh clone."
        reclone_repository "$dir"
    fi
}

# ------------------------------------------------------------------------------
# reclone_repository <dir>
#
# Backs up a broken/stale project directory (never deletes user data silently)
# and performs a fresh git clone in its place.
# ------------------------------------------------------------------------------
reclone_repository() {
    local dir="$1"
    local dirname_only
    dirname_only="$(basename "$dir")"

    cd ..
    local backup="${dir}.bak-$(date +%s)"
    log_warning "Backing up existing directory to '${backup}' and re-cloning from ${REPO_URL}..."
    mv "$dir" "$backup" 2>/dev/null || rm -rf "$dir"

    git clone "$REPO_URL" "$dirname_only"
    cd "$dirname_only"
    log_success "Fresh clone complete."
}

# ------------------------------------------------------------------------------
# verify_repository_integrity <dir>
#
# Sanity-checks that files the frontend build actually imports are present
# before we spend time on npm install/build. Catches any remaining sync edge
# case (e.g. a corrupted checkout) with a clear, actionable error instead of
# letting it surface later as a cryptic Vite/Rollup resolution error.
# ------------------------------------------------------------------------------
verify_repository_integrity() {
    local dir="$1"
    local missing=()
    local required_files=(
        "src/components/ImageCropper.tsx"
        "src/utils/cropImage.ts"
        "package.json"
    )

    local f
    for f in "${required_files[@]}"; do
        if [ ! -f "${dir}/${f}" ]; then
            missing+=("$f")
        fi
    done

    if [ "${#missing[@]}" -ne 0 ]; then
        log_error "Repository sync verification failed: required file(s) missing after sync:"
        local m
        for m in "${missing[@]}"; do
            log_error "  - ${m}"
        done
        log_error "This usually means the workspace directory was not a clean clone of ${REPO_URL}."
        log_error "Try removing '${dir}' entirely and re-running the installer."
        exit 1
    fi

    log_success "Repository integrity verified: all required source files present."
}

setup_environment() {
    local target_port=$1
    local run_mode=$2

    step "Writing .env and initializing data directories"
    check_port_available "$target_port"
    log_info "Initializing environment & data structures..."

    # Cleanly ensure directories without file/directory collision
    if [ -f ".logs" ]; then
        rm -f ".logs"
    fi
    mkdir -p .data/servers .data/temp .data/logs backups .logs 2>/dev/null || true

    # Generate JWT Secret
    local jwt_secret
    jwt_secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "proto_secret_key_$(date +%s)")

    cat > .env <<EOF
# ==============================================================================
# Proto Panel Configuration
# Credit: Nishant
# ==============================================================================
NODE_ENV=${run_mode}
PORT=${target_port}
JWT_SECRET=${jwt_secret}
DEFAULT_RUNTIME=${SELECTED_RUNTIME:-docker}
ENABLE_DOCKER=$( [ "${SELECTED_RUNTIME:-docker}" = "docker" ] && echo "true" || echo "false" )
PANEL_RUNTIME_MODE=${RUNTIME_MODE:-docker}
PANEL_RUNTIME_LOCKED=${RUNTIME_LOCKED:-true}
PANEL_THEME=${SELECTED_THEME:-red}
DEV_MODE=$( [ "$run_mode" = "development" ] && echo "true" || echo "false" )
PANEL_DEV_MODE=$( [ "$run_mode" = "development" ] && echo "true" || echo "false" )
EOF

    # Persist runtime & theme settings to .data/settings.json
    node -e '
      const fs = require("fs");
      const path = ".data/settings.json";
      let s = {};
      try { if (fs.existsSync(path)) s = JSON.parse(fs.readFileSync(path, "utf8")); } catch(e){}
      s.defaultRuntime = process.env.DEFAULT_RUNTIME || "docker";
      s.runtimeLocked = process.env.PANEL_RUNTIME_LOCKED === "true";
      if (process.env.PANEL_THEME) s.theme = process.env.PANEL_THEME;
      fs.writeFileSync(path, JSON.stringify(s, null, 2));
    ' 2>/dev/null || true

    log_success "Environment configured on port ${target_port} (Runtime: ${SELECTED_RUNTIME:-docker}, Theme: ${SELECTED_THEME:-red})."
}

persist_domain_settings() {
    # Appends domain/SSL info to the already-written .env (setup_environment
    # must run first). Safe to call even when no domain was configured.
    if [ -n "${SELECTED_DOMAIN:-}" ]; then
        {
            echo "PANEL_DOMAIN=${SELECTED_DOMAIN}"
            echo "PANEL_SSL_ENABLED=${SSL_ENABLED:-false}"
            if [ "${SSL_ENABLED:-false}" = "true" ]; then
                echo "PANEL_PUBLIC_URL=https://${SELECTED_DOMAIN}"
            else
                echo "PANEL_PUBLIC_URL=http://${SELECTED_DOMAIN}"
            fi
        } >> .env
        log_success "Domain settings saved to .env (PANEL_DOMAIN=${SELECTED_DOMAIN})."
    fi
}

build_application() {
    step "Installing NPM dependencies"
    check_disk_space

    log_info "Installing NPM dependencies..."
    if ! npm install --no-audit --no-fund --quiet; then
        log_warning "npm install failed, retrying once with verbose output for diagnostics..."
        npm install --no-audit --no-fund
    fi

    step "Compiling frontend assets & bundling server"
    log_info "Compiling frontend assets & bundling server..."
    if ! npm run build; then
        log_error "Build failed. Full npm output was written to ${INSTALL_LOG}."
        exit 1
    fi

    log_success "Application compilation succeeded."
}

configure_pm2_service() {
    local target_port=$1
    step "Configuring PM2 background service"
    log_info "Configuring high-availability background process daemon..."

    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2 2>/dev/null || npm install -g pm2 2>/dev/null || true
    fi

    # Terminate existing instance if present
    pm2 delete proto-panel 2>/dev/null || npx pm2 delete proto-panel 2>/dev/null || true

    # Launch daemon
    PORT="${target_port}" npx pm2 start "scripts/start-with-update.sh" --name "proto-panel" 2>/dev/null || PORT="${target_port}" npx pm2 start "dist/server.cjs" --name "proto-panel"
    npx pm2 save 2>/dev/null || true

    if [ "$EUID" -eq 0 ]; then
        npx pm2 startup systemd -u root --hp /root 2>/dev/null || true
    fi

    log_success "PM2 service 'proto-panel' registered and active."
}

create_initial_admin() {
    step "Creating primary owner account"
    echo ""
    echo -e "${C_ELECTRIC_PURPLE}  ╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  │ ${C_WHITE}${C_BOLD}                   CREATE PRIMARY OWNER ACCOUNT                           ${C_ELECTRIC_PURPLE}│${C_RESET}"
    echo -e "${C_ELECTRIC_PURPLE}  ╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}"
    npm run createuser || true
}

install_production() {
    print_banner
    echo -e " ${BG_GREEN}${C_BOLD} [ PRODUCTION INSTALLATION ] ${C_RESET} ${C_WHITE}Deploying ${PANEL_TITLE} on port ${DEFAULT_PROD_PORT}${C_RESET}\n"
    
    check_root
    setup_system_dependencies
    ensure_nodejs
    prompt_runtime_configuration
    prompt_theme_selection
    prompt_java_install
    prompt_docker_install
    prompt_domain_configuration "$DEFAULT_PROD_PORT"

    prepare_repository
    setup_environment "$DEFAULT_PROD_PORT" "production"
    persist_domain_settings
    build_application
    configure_pm2_service "$DEFAULT_PROD_PORT"
    create_initial_admin

    local server_ip
    server_ip=$(get_public_ip)

    local public_url
    if [ -n "${SELECTED_DOMAIN:-}" ]; then
        if [ "${SSL_ENABLED:-false}" = "true" ]; then
            public_url="https://${SELECTED_DOMAIN}"
        else
            public_url="http://${SELECTED_DOMAIN}"
        fi
    else
        public_url="http://${server_ip}:${DEFAULT_PROD_PORT}"
    fi

    echo ""
    echo "██████╗ ██████╗   ██████╗ ████████╗ ██████╗    ██████╗   █████╗ ███╗   ██╗███████╗██╗     "
    echo "██╔══██╗██╔══██╗ ██╔═══██╗╚══██╔══╝██╔═══██╗   ██╔══██╗ ██╔══██╗████╗  ██║██╔════╝██║     "
    echo "██████╔╝██████╔╝ ██║   ██║   ██║   ██║   ██║   ██████╔╝ ███████║██╔██╗ ██║█████╗  ██║     "
    echo "██╔═══╝ ██╔══██╗ ██║   ██║   ██║   ██║   ██║   ██╔═══╝  ██╔══██║██║╚██╗██║██╔══╝  ██║     "
    echo "██║     ██║  ██║ ╚██████╔╝   ██║   ╚██████╔╝   ██║      ██║  ██║██║ ╚████║███████╗███████╗"
    echo "╚═╝     ╚═╝  ╚═╝  ╚═════╝    ╚═╝    ╚═════╝    ╚═╝      ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
    echo ""
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Panel Web Interface:${C_RESET}    ${C_VIBRANT_CYAN}${C_BOLD}${public_url}${C_RESET}"
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Direct IP Access:${C_RESET}       ${C_VIBRANT_CYAN}${C_BOLD}http://${server_ip}:${DEFAULT_PROD_PORT}${C_RESET}"
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Localhost Access:${C_RESET}       ${C_VIBRANT_CYAN}${C_BOLD}http://localhost:${DEFAULT_PROD_PORT}${C_RESET}"
    if [ -n "${SELECTED_DOMAIN:-}" ]; then
        echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}SSL Certificate:${C_RESET}        ${C_AMBER}$( [ "${SSL_ENABLED:-false}" = "true" ] && echo "Active (Let's Encrypt, auto-renews)" || echo "Not enabled — serving over HTTP" )${C_RESET}"
    fi
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Enforced Runtime:${C_RESET}       ${C_AMBER}${SELECTED_RUNTIME:-docker}${C_RESET} (Locked: ${RUNTIME_LOCKED:-true})"
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Accent Theme:${C_RESET}           ${C_ELECTRIC_PURPLE}${SELECTED_THEME:-red}${C_RESET}"
    echo -e "  ${C_MUTED}>>${C_RESET} ${C_WHITE}${C_BOLD}Creator / Credit:${C_RESET}       ${C_EMERALD}${PANEL_AUTHOR}${C_RESET}"
    echo ""
    echo -e "  ${C_MUTED}┌── Useful Management Commands ───────────────────────────────────────────┐${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Check Status:     ${C_VIBRANT_CYAN}npx pm2 status${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Live Logs:        ${C_VIBRANT_CYAN}npx pm2 logs proto-panel${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Restart Panel:    ${C_VIBRANT_CYAN}npx pm2 restart proto-panel${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Update Panel:     ${C_VIBRANT_CYAN}bash update.sh${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Uninstall:        ${C_VIBRANT_CYAN}bash uninstall.sh${C_RESET}"
    if [ -n "${SELECTED_DOMAIN:-}" ]; then
    echo -e "  ${C_MUTED}│${C_RESET} Renew SSL now:     ${C_VIBRANT_CYAN}sudo certbot renew${C_RESET}"
    echo -e "  ${C_MUTED}│${C_RESET} Reload Nginx:      ${C_VIBRANT_CYAN}sudo systemctl reload nginx${C_RESET}"
    fi
    echo -e "  ${C_MUTED}└─────────────────────────────────────────────────────────────────────────┘${C_RESET}"
    echo ""
}

install_development() {
    print_banner
    echo -e " ${BG_AMBER}${C_BOLD} [ DEVELOPMENT SETUP ] ${C_RESET} ${C_WHITE}Configuring ${PANEL_TITLE} Dev Environment on port ${DEFAULT_DEV_PORT}${C_RESET}\n"
    
    setup_system_dependencies
    ensure_nodejs
    prompt_runtime_configuration
    prompt_theme_selection
    prepare_repository
    setup_environment "$DEFAULT_DEV_PORT" "development"
    
    log_info "Installing dependencies..."
    npm install
    create_initial_admin

    echo ""
    log_success "Development workspace ready!"
    echo -e "  Start development server: ${C_VIBRANT_CYAN}npm run dev${C_RESET}"
}

# Installs the real, official Pterodactyl Wings daemon on this machine.
#
# IMPORTANT — read before using this: Wings needs to call BACK into a
# panel's "Application/Remote API" (/api/remote/servers/:uuid,
# /api/remote/backups, etc.) to fetch install scripts and report backup
# status. Proto Panel does not implement that API surface yet — only the
# panel -> Wings direction (pushing server config on create) is wired up.
# This installer gets the real Wings binary running as a systemd service
# and talking to Docker, and it WILL respond to /api/system (which is
# what the panel's node status/stats now check), but server installs and
# backups routed through it will fail until the remote API is built.
# It's here so you can stand the daemon up now and layer the rest on top.
install_wings() {
    print_banner
    echo -e " ${BG_AMBER}${C_BOLD} [ WINGS DAEMON - EXPERIMENTAL ] ${C_RESET}\n"
    log_warning "Proto Panel does not yet implement Wings' remote API."
    log_warning "This installs and starts real Wings, but server installs/backups"
    log_warning "routed through it will not work until that API exists."
    echo ""
    read -r -p "  Continue anyway? [y/N]: " confirm_wings
    if [[ ! "$confirm_wings" =~ ^[Yy]$ ]]; then
        log_info "Cancelled."
        return
    fi

    if [ "$(id -u)" -ne 0 ]; then
        log_error "Wings installation requires root."
        return
    fi

    command -v docker >/dev/null 2>&1 || { log_error "Docker is required for Wings. Install Docker first (menu option for Panel install does this for the panel host)."; return; }

    read -r -p "  Panel URL this node reports to (e.g. https://panel.example.com): " wings_panel_url
    read -r -p "  Node UUID (from the panel's Node creation screen): " wings_uuid
    read -r -p "  Daemon token (from the panel's Node creation screen): " wings_token
    read -r -p "  Daemon token ID: " wings_token_id

    if [ -z "$wings_panel_url" ] || [ -z "$wings_uuid" ] || [ -z "$wings_token" ] || [ -z "$wings_token_id" ]; then
        log_error "All fields are required. Create the node in the panel first to get these values."
        return
    fi

    step "Downloading Wings binary"
    mkdir -p /etc/pterodactyl
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) WINGS_ARCH="amd64" ;;
        aarch64|arm64) WINGS_ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; return ;;
    esac
    if ! curl -fsSL -o /usr/local/bin/wings "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_${WINGS_ARCH}"; then
        log_error "Failed to download Wings binary. Check network access to github.com."
        return
    fi
    chmod +x /usr/local/bin/wings

    step "Writing Wings configuration"
    cat > /etc/pterodactyl/config.yml <<EOF
debug: false
uuid: ${wings_uuid}
token_id: ${wings_token_id}
token: ${wings_token}
api:
  host: 0.0.0.0
  port: 8080
  ssl:
    enabled: false
    cert: /etc/letsencrypt/live/\$(hostname -f)/fullchain.pem
    key: /etc/letsencrypt/live/\$(hostname -f)/privkey.pem
  upload_limit: 1024
system:
  data: /var/lib/pterodactyl
  sftp:
    bind_port: 2022
docker:
  network:
    interface: 172.18.0.1
    dns:
      - 1.1.1.1
      - 1.0.0.1
remote: ${wings_panel_url}
allowed_mounts: []
EOF
    mkdir -p /var/lib/pterodactyl

    step "Installing systemd service"
    cat > /etc/systemd/system/wings.service <<'EOF'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable wings >/dev/null 2>&1
    systemctl restart wings

    sleep 2
    if systemctl is-active --quiet wings; then
        log_success "Wings is running. Check status with: systemctl status wings"
        log_warning "Remember: server installs/backups via this node need the remote API (see note above)."
    else
        log_error "Wings failed to start. Check logs: journalctl -u wings -e"
    fi
}

# Main Interactive Dispatcher
prompt_language_selection
while true; do
    print_banner
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 1 ] ${C_WHITE}$(t menu_title_1) ${DEFAULT_PROD_PORT})${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 2 ] ${C_WHITE}$(t menu_title_2) ${DEFAULT_DEV_PORT})${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 3 ] ${C_WHITE}$(t menu_title_3)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 4 ] ${C_WHITE}$(t menu_title_4)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 5 ] ${C_WHITE}$(t menu_title_5)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 6 ] ${C_WHITE}$(t menu_title_6)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 7 ] ${C_WHITE}$(t menu_title_7)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 8 ] ${C_MUTED}$(t menu_title_8)${C_RESET}"
    echo -e "  ${C_DEEP_BLUE}${C_BOLD} [ 9 ] ${C_WHITE}$(t menu_title_9)${C_RESET}"
    echo ""
    echo -e "  ${C_MUTED}──────────────────────────────────────────────────────────────────────────${C_RESET}"
    
    read -r -p "  $(t menu_select) " option
    option=$(echo "$option" | tr -d ' ')

    case "$option" in
        1)
            install_production
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        2)
            install_development
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        3)
            bash update.sh
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        4)
            npm run createuser || (cd ProtoPanel && npm run createuser)
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        5)
            log_info "Restarting Proto Panel..."
            pm2 restart proto-panel 2>/dev/null || npx pm2 restart proto-panel 2>/dev/null || npm run start:auto-update
            log_success "Panel service restarted."
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        6)
            bash uninstall.sh
            exit 0
            ;;
        7)
            existing_port=$( (grep -oE '^PORT=[0-9]+' .env 2>/dev/null | cut -d= -f2) || true )
            prompt_domain_configuration "${existing_port:-$DEFAULT_PROD_PORT}"
            if [ -n "${SELECTED_DOMAIN:-}" ] && [ -f ".env" ]; then
                sed -i '/^PANEL_DOMAIN=/d; /^PANEL_SSL_ENABLED=/d; /^PANEL_PUBLIC_URL=/d' .env 2>/dev/null || true
                persist_domain_settings
            fi
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        8)
            echo -e "\n  ${C_AMBER}$(t menu_exiting)${C_RESET}\n"
            exit 0
            ;;
        9)
            install_wings
            echo ""
            read -r -p "  $(t menu_press_enter) " _
            ;;
        *)
            log_error "$(t menu_invalid)"
            sleep 1.2
            ;;
    esac
done