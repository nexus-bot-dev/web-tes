#!/bin/bash

# =======================================================
# Skrip Auto-Install Panel VPN Multi-Server (IP:PORT Mode)
# Dibuat untuk Ubuntu 22.04 LTS
# =======================================================

# --- Variabel Konfigurasi ---
# Port yang digunakan oleh aplikasi Node.js Anda
NODE_PORT="3000" 
# URL repositori GitHub Anda
GITHUB_REPO_URL="https://github.com/nexus-bot-dev/web-tes.git" 
# Nama service PM2
SERVICE_NAME="vpn-panel-backend" 
# Directory projek
PROJECT_DIR="/var/www/vpn-panel" 

# --- Fungsi Helper ---
log() {
    echo -e "\n\e[1;33m[SETUP] $1\e[0m"
}
error_exit() {
    echo -e "\n\e[1;31m[ERROR] $1\e[0m"
    exit 1
}

# --- 1. Persiapan Sistem ---
log "Memperbarui sistem dan menginstal paket dasar (git, ufw)..."
# Nginx dihapus dari instalasi dasar
sudo apt update -y || error_exit "Gagal menjalankan apt update."
sudo apt install curl git ufw -y || error_exit "Gagal menginstal paket dasar."

# --- 2. Instalasi Node.js dan PM2 ---
log "Menginstal Node.js (v18 LTS) dan PM2..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || error_exit "Gagal menambahkan repo NodeSource."
sudo apt install nodejs -y || error_exit "Gagal menginstal Node.js."
sudo npm install -g pm2 || error_exit "Gagal menginstal PM2."

# --- 3. Deployment Aplikasi dari GitHub ---
log "Mengclone repositori dari GitHub..."
if [ -d "$PROJECT_DIR" ]; then
    log "Direktori lama ditemukan, menghapus..."
    sudo rm -rf "$PROJECT_DIR"
fi

sudo git clone "$GITHUB_REPO_URL" "$PROJECT_DIR" || error_exit "Gagal meng-clone repositori GitHub."

log "Mengatur hak akses direktori..."
# Memberikan hak akses penuh kepada pengguna saat ini untuk bekerja di folder proyek
sudo chown -R $USER:$USER "$PROJECT_DIR" 
cd "$PROJECT_DIR" || error_exit "Gagal pindah ke direktori proyek."

# Menginstal dependensi Node.js
log "Menginstal dependensi Node.js (npm install)..."
npm install || error_exit "Gagal menjalankan npm install."

# --- 4. Firewall Setup ---
log "Mengatur Firewall (UFW) dan mengizinkan port..."
sudo ufw allow ssh
# Izinkan port aplikasi Node.js yang ditentukan
sudo ufw allow $NODE_PORT/tcp || error_exit "Gagal mengizinkan port $NODE_PORT di UFW."
sudo ufw --force enable

# --- 5. Menjalankan Aplikasi dengan PM2 ---
log "Menjalankan aplikasi Node.js dengan PM2..."
pm2 delete "$SERVICE_NAME" 2>/dev/null
pm2 start server.js --name "$SERVICE_NAME" || error_exit "Gagal menjalankan aplikasi dengan PM2."
# Mengatur PM2 agar berjalan saat boot
pm2 startup systemd
pm2 save

# --- 6. Menampilkan IP VPS (Langkah Akhir) ---
log "PEMBERSIHAN DAN INSTRUKSI AKHIR"
log "================================="
IP_VPS=$(curl -s api.ipify.org) # Mendapatkan IP publik VPS
echo "✅ Instalasi Selesai! Aplikasi berjalan di IP:PORT."
echo " "
echo "➡️ AKSES PANEL ANDA DI (Copy & Paste ke Browser):"
echo -e "\e[1;32mhttp://$IP_VPS:$NODE_PORT\e[0m"
echo " "
echo "➡️ KREDENSIAL DEFAULT (HARUS DIUBAH!):"
echo "   File: $PROJECT_DIR/server.js"
echo "   Username: admin_panel"
echo "   Password: PasswordSuperAman123"
echo "================================="
