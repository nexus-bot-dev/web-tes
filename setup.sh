#!/bin/bash

# =======================================================
# Skrip Auto-Install Panel VPN Saldo (IP:PORT Mode)
# Dibuat untuk Ubuntu 22.04 LTS
# =======================================================

# --- Variabel Konfigurasi ---
NODE_PORT="3000" 
# GANTI DENGAN URL REPO ANDA YANG BENAR
GITHUB_REPO_URL="https://github.com/nexus-bot-dev/web-tes.git" 
SERVICE_NAME="vpn-panel-saldo" 
PROJECT_DIR="/var/www/vpn-panel-saldo" 

# --- Fungsi Helper ---
log() { echo -e "\n\e[1;33m[SETUP] $1\e[0m"; }
error_exit() { echo -e "\n\e[1;31m[ERROR] $1\e[0m"; exit 1; }

# --- 1. Persiapan Sistem ---
log "Memperbarui sistem dan menginstal paket dasar (git, ufw)..."
sudo apt update -y || error_exit "Gagal menjalankan apt update."
sudo apt install curl git ufw -y || error_exit "Gagal menginstal paket dasar."

# --- 2. Instalasi Node.js dan PM2 ---
log "Menginstal Node.js (v18 LTS) dan PM2..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || error_exit "Gagal menambahkan repo NodeSource."
sudo apt install nodejs -y || error_exit "Gagal menginstal Node.js."
sudo npm install -g pm2 || error_exit "Gagal menginstal PM2."

# --- 3. Deployment Aplikasi dari GitHub ---
log "Mengclone repositori dari GitHub..."
if [ -d "$PROJECT_DIR" ]; then sudo rm -rf "$PROJECT_DIR"; fi
sudo git clone "$GITHUB_REPO_URL" "$PROJECT_DIR" || error_exit "Gagal meng-clone repositori GitHub."

log "Mengatur hak akses direktori..."
sudo chown -R $USER:$USER "$PROJECT_DIR" 
cd "$PROJECT_DIR" || error_exit "Gagal pindah ke direktori proyek."

# Buat file JSON jika belum ada
touch servers.json users.json transactions.json
if ! grep -q "DEPOSIT_API_KEY" config.json; then cp config.json config.json.bak; fi # Jangan timpa config.json jika sudah ada

# Menginstal dependensi Node.js
log "Menginstal dependensi Node.js (npm install)..."
npm install || error_exit "Gagal menjalankan npm install."

# --- 4. Firewall Setup ---
log "Mengatur Firewall (UFW) dan mengizinkan port $NODE_PORT..."
sudo ufw allow ssh
sudo ufw allow $NODE_PORT/tcp || error_exit "Gagal mengizinkan port $NODE_PORT di UFW."
sudo ufw --force enable

# --- 5. Menjalankan Aplikasi dengan PM2 ---
log "Menjalankan aplikasi Node.js dengan PM2..."
pm2 delete "$SERVICE_NAME" 2>/dev/null
pm2 start server.js --name "$SERVICE_NAME" || error_exit "Gagal menjalankan aplikasi dengan PM2."
pm2 startup systemd
pm2 save

# --- 6. Langkah Akhir ---
log "PEMBERSIHAN DAN INSTRUKSI AKHIR"
log "================================="
IP_VPS=$(curl -s api.ipify.org) 
echo "✅ Instalasi Selesai! Panel berjalan di IP:PORT."
echo " "
echo "➡️ AKSES PANEL ANDA DI (Copy & Paste ke Browser):"
echo -e "\e[1;32mhttp://$IP_VPS:$NODE_PORT\e[0m"
echo " "
echo "➡️ KREDENSIAL PENTING (HARUS DIUBAH!):"
echo "   1. ADMIN Login: admin_panel / PasswordSuperAman123"
echo "   2. UBAH KREDENSIAL INI di file: $PROJECT_DIR/server.js"
echo "   3. UBAH DEPOSIT API KEY di file: $PROJECT_DIR/config.json"
echo "================================="
