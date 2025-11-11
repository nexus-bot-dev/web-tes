const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid'); // Untuk ID User
const app = express();
const PORT = 3000;

// =========================================================
// !!! KONFIGURASI UTAMA !!!
// =========================================================
const JWT_SECRET = 'Ganti_dengan_Kunci_Rahasia_Anda_yang_Panjang_dan_Aman!'; 
const ADMIN_CREDENTIALS = {
    username: 'admin_panel', 
    password: 'PasswordSuperAman123' 
};
const SERVER_URL = 'http://localhost:' + PORT;
// =========================================================

// --- Middleware & Setup ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); 

// --- Fungsi Database Helper (Menggunakan JSON File) ---
const readDB = (filename) => {
    const dataPath = path.join(__dirname, filename);
    try {
        if (!fs.existsSync(dataPath)) { fs.writeFileSync(dataPath, '[]', 'utf8'); }
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) { console.error(`Error membaca ${filename}:`, error.message); return []; }
};

const writeDB = (filename, data) => {
    try {
        fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) { console.error(`Gagal menyimpan ${filename}:`, error.message); return false; }
};

const getConfig = () => {
    const dataPath = path.join(__dirname, 'config.json');
    try {
        if (!fs.existsSync(dataPath)) { return {}; }
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) { console.error("Gagal membaca config.json:", error.message); return {}; }
};

// --- Middleware Autentikasi ---

// JWT Auth untuk Admin
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (token == null) return res.status(401).json({ status: false, message: "Akses ditolak: Token admin tidak ditemukan." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ status: false, message: "Akses ditolak: Token admin tidak valid." });
        req.user = user;
        next();
    });
};

// Session Auth untuk User (Menggunakan ID Token Sederhana)
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ status: false, message: "Akses ditolak: Silakan login ulang." });

    const users = readDB('users.json');
    const user = users.find(u => u.token === token);

    if (!user) return res.status(403).json({ status: false, message: "Akses ditolak: Sesi user tidak valid." });
    
    req.user = user;
    next();
};

// --- LOGIKA UTAMA: AUTENTIKASI ---

app.post('/login', (req, res) => {
    const { username, password, role } = req.body;
    let users = readDB('users.json');

    if (role === 'admin') {
        if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
            const token = jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '1h' }); 
            return res.json({ status: true, message: "Login Admin berhasil", token, role: 'admin' });
        }
    } else { // Role User
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            user.token = uuidv4(); // Generate token/session baru
            writeDB('users.json', users);
            return res.json({ status: true, message: "Login User berhasil", token: user.token, role: 'user', id: user.id });
        }
    }
    return res.status(401).json({ status: false, message: "Username atau password salah" });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    let users = readDB('users.json');
    const config = getConfig();

    if (users.some(u => u.username === username)) {
        return res.status(400).json({ status: false, message: "Username sudah terdaftar." });
    }

    const newUser = {
        id: uuidv4(),
        username: username,
        password: password, // PENTING: Hash password di produksi nyata
        saldo: config.USER_STARTING_BALANCE || 0,
        current_qris_trx_id: null,
        notifications: [],
        token: uuidv4() 
    };

    users.push(newUser);
    writeDB('users.json', users);

    res.json({ status: true, message: "Registrasi berhasil, silakan Login.", user: newUser });
});

// --- LOGIKA UTAMA: DEPOSIT (USER) ---

app.post('/user/deposit/create', authenticateUser, async (req, res) => {
    let users = readDB('users.json');
    const config = getConfig();
    const user = req.user;
    const { amount } = req.body;

    // 1. Cek Saldo Qris Aktif
    if (user.current_qris_trx_id) {
        return res.status(400).json({ status: false, message: "Anda masih memiliki transaksi QRIS aktif. Mohon selesaikan atau tunggu hingga kedaluwarsa." });
    }

    // 2. Buat QRIS via API Eksternal
    const depositUrl = `${config.DEPOSIT_BASE_URL}/deposit`;
    const params = { amount: amount, apikey: config.DEPOSIT_API_KEY };

    try {
        const apiResponse = await axios.get(depositUrl, { params });
        const data = apiResponse.data.data;
        
        if (apiResponse.data.status !== 'success' || !data) {
             return res.status(500).json({ status: false, message: 'Gagal membuat QRIS dari penyedia deposit.' });
        }
        
        // 3. Simpan ID Transaksi di Database User
        user.current_qris_trx_id = data.transaction_id;
        writeDB('users.json', users);
        
        // Tambahkan bonus jika ada
        const bonus = (data.amount * (config.TOPUP_BONUS_PERCENT || 0) / 100);

        return res.json({
            status: true,
            message: 'QRIS berhasil dibuat. Silakan bayar.',
            data: {
                transaction_id: data.transaction_id,
                qris_url: data.qris_url,
                total_amount: data.total_amount,
                expired_at: data.expired_at,
                bonus_amount: bonus.toFixed(0) 
            }
        });

    } catch (error) {
        console.error("Error saat membuat QRIS:", error.message);
        res.status(500).json({ status: false, message: 'Kesalahan saat menghubungi API deposit.' });
    }
});

app.get('/user/deposit/check/:trxId', authenticateUser, async (req, res) => {
    let users = readDB('users.json');
    let user = req.user;
    const config = getConfig();
    const trxId = req.params.trxId;
    const isCurrentUserTrx = user.current_qris_trx_id === trxId;

    if (!isCurrentUserTrx) {
        return res.status(403).json({ status: false, message: "ID Transaksi tidak valid untuk user ini." });
    }

    // 1. Cek Status Pembayaran ke API Eksternal
    const checkUrl = `${config.DEPOSIT_BASE_URL}/status/payment`;
    const params = { transaction_id: trxId, apikey: config.DEPOSIT_API_KEY };
    
    try {
        const apiResponse = await axios.get(checkUrl, { params });
        const data = apiResponse.data;

        if (data.status === 'success' && data.paid === true) {
            
            // 2. Tambah Saldo dan Notifikasi jika SUDAH DIBAYAR
            const originalTrx = data; // Asumsi API mengembalikan detail trx

            // Lakukan Top-up Saldo
            const amount = parseFloat(originalTrx.amount || 0); // Ambil jumlah deposit dari respons API
            const bonusPercent = config.TOPUP_BONUS_PERCENT || 0;
            const bonusAmount = amount * bonusPercent / 100;
            const totalAdded = amount + bonusAmount;

            user.saldo += totalAdded;
            user.current_qris_trx_id = null; // Reset transaksi aktif
            user.notifications.push(`🎉 Top-up Saldo Berhasil! Rp${amount} + Bonus ${bonusPercent}% (Rp${bonusAmount}) Total: Rp${totalAdded}`);

            // Simpan perubahan user
            users = users.map(u => u.id === user.id ? user : u);
            writeDB('users.json', users);

            // Log transaksi untuk Admin
            let transactions = readDB('transactions.json');
            transactions.push({ 
                type: 'DEPOSIT_SUCCESS', 
                userId: user.id, 
                amount: amount, 
                bonus: bonusAmount, 
                date: new Date().toISOString() 
            });
            writeDB('transactions.json', transactions);
            
            return res.json({ status: 'paid', message: `Saldo berhasil ditambahkan! Total: Rp${totalAdded}` });

        } else if (data.status === 'success' && data.paid === false) {
            // Belum Dibayar/Pending
            return res.json({ status: 'pending', message: 'Pembayaran belum diterima.' });
        } else {
            // API Error atau Status Gagal (expired dll)
            user.current_qris_trx_id = null; // Asumsi expired
            users = users.map(u => u.id === user.id ? user : u);
            writeDB('users.json', users);
            return res.json({ status: 'failed', message: 'Transaksi kedaluwarsa atau dibatalkan.' });
        }

    } catch (error) {
        console.error("Error saat cek QRIS:", error.message);
        res.status(500).json({ status: 'error', message: 'Kesalahan koneksi saat cek status deposit.' });
    }
});

// --- LOGIKA UTAMA: PEMBELIAN & PERPANJANGAN (USER) ---

const purchaseLogic = async (req, res, isRenewal = false) => {
    let users = readDB('users.json');
    let user = req.user;
    const config = getConfig();
    const servers = readDB('servers.json');

    const { server_id, endpoint_type, user_vpn, password_vpn, exp, limitip, quota, renew_num } = req.body;
    
    const targetServer = servers.find(s => s.id === server_id);
    const price = config.PRICES[endpoint_type];

    if (!targetServer || !price) {
        return res.status(404).json({ status: false, message: 'Konfigurasi server atau harga tidak ditemukan.' });
    }

    if (user.saldo < price) {
        return res.status(402).json({ status: false, message: `Saldo tidak cukup. Saldo Anda: Rp${user.saldo}. Harga: Rp${price}.` });
    }

    // 1. Tentukan Endpoint dan Parameter
    let apiEndpoint = '';
    const params = { auth: targetServer.auth_key, exp: exp || config.DEFAULT_CONFIG.exp };

    if (isRenewal) {
        // Renewal (menggunakan renew_num / username akun lama)
        params.num = renew_num; 
        switch (endpoint_type) {
            case 'ssh': apiEndpoint = '/api/rensh'; break;
            case 'vmess': apiEndpoint = '/api/renws'; break;
            case 'trojan': apiEndpoint = '/api/rentr'; break;
            case 'vless': apiEndpoint = '/api/renvl'; break;
            default: return res.status(400).json({ status: false, message: 'Tipe renewal tidak valid.' });
        }
    } else {
        // Creation (menggunakan username dan password baru)
        params.user = user_vpn;
        params.limitip = limitip || config.DEFAULT_CONFIG.limitip;
        if (endpoint_type === 'ssh') {
            params.password = password_vpn;
        } else {
            params.quota = quota || config.DEFAULT_CONFIG.quota;
        }
        
        apiEndpoint = `/api/create-${endpoint_type}`;
    }

    const fullUrl = `https://${targetServer.domain}${apiEndpoint}`;
    
    // 2. Panggil API VPN Target
    try {
        const apiResponse = await axios.get(fullUrl, { params });
        
        if (apiResponse.data.status !== 'success') {
            // Gagal buat akun di server target
            return res.status(500).json({ status: false, message: 'Gagal memproses di server VPN target.', api_response: apiResponse.data });
        }

        // 3. Potong Saldo (Hanya jika API sukses)
        user.saldo -= price;
        user.notifications.push(`💳 Berhasil ${isRenewal ? 'memperpanjang' : 'membeli'} akun ${endpoint_type.toUpperCase()} di server ${targetServer.name}. Biaya: -Rp${price}.`);
        
        users = users.map(u => u.id === user.id ? user : u);
        writeDB('users.json', users);

        // 4. Log Transaksi
        let transactions = readDB('transactions.json');
        transactions.push({ 
            type: isRenewal ? 'RENEWAL' : 'PURCHASE', 
            userId: user.id, 
            vpnType: endpoint_type, 
            server: targetServer.name,
            cost: price,
            date: new Date().toISOString() 
        });
        writeDB('transactions.json', transactions);

        // 5. Kirim Respons Sukses ke Frontend
        // Menggunakan "data" dari respons API target
        return res.json({ status: true, message: `Akun ${isRenewal ? 'diperpanjang' : 'dibuat'} berhasil.`, data: apiResponse.data.data });

    } catch (error) {
        console.error("Error saat proxy ke API VPN:", error.message);
        res.status(500).json({ status: false, message: 'Kesalahan saat menghubungi API VPN target.' });
    }
};

app.post('/user/purchase', authenticateUser, (req, res) => purchaseLogic(req, res, false));
app.post('/user/renew', authenticateUser, (req, res) => purchaseLogic(req, res, true));

// --- ROUTES UMUM (DAPAT DIAKSES USER/ADMIN) ---

app.get('/api/config', (req, res) => {
    const config = getConfig();
    const servers = readDB('servers.json').map(s => ({ id: s.id, name: s.name, domain: s.domain }));
    res.json({ status: true, config, servers });
});

app.get('/user/data', authenticateUser, (req, res) => {
    const user = req.user;
    // Hapus password dan token dari respons
    delete user.password;
    delete user.token;
    res.json({ status: true, user });
});

// --- ROUTES ADMIN KHUSUS ---

app.post('/admin/add-server', authenticateAdmin, (req, res) => {
    // Logika Add Server (sama seperti sebelumnya, hanya ditambah auth)
    const { domain, auth_key, name } = req.body;
    if (!domain || !auth_key || !name) { return res.status(400).json({ status: false, message: 'Data server tidak lengkap.' }); }
    
    let servers = readDB('servers.json');
    const newServerId = `srv-${Date.now()}`;
    servers.push({ id: newServerId, name: name, domain: domain, auth_key: auth_key });

    if (writeDB('servers.json', servers)) {
        res.json({ status: true, message: 'Server berhasil ditambahkan.', server: newServerId });
    } else {
        res.status(500).json({ status: false, message: 'Gagal menyimpan data server.' });
    }
});

app.post('/admin/update-config', authenticateAdmin, (req, res) => {
    const newConfig = req.body;
    writeDB('config.json', newConfig);
    res.json({ status: true, message: 'Konfigurasi berhasil diperbarui.' });
});

app.get('/admin/transactions', authenticateAdmin, (req, res) => {
    res.json({ status: true, transactions: readDB('transactions.json') });
});

// --- Redirect ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'auth.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/user', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'user.html')); });

// Start Server
app.listen(PORT, () => { console.log(`Panel Backend berjalan di http://localhost:${PORT}`); });
