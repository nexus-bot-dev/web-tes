// server.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;

// =========================================================
// !!! KONFIGURASI UTAMA: HARAP UBAH INI SEBELUM DEPLOYMENT !!!
// =========================================================
const JWT_SECRET = 'Ganti_dengan_Kunci_Rahasia_Anda_yang_Panjang_dan_Aman!'; 
const ADMIN_CREDENTIALS = {
    username: 'admin_panel', // GANTI USERNAME INI
    password: 'PasswordSuperAman123' // GANTI PASSWORD INI (Gunakan Hash di Produksi Nyata)
};
// =========================================================

// --- Middleware & Setup ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Melayani file Frontend

// --- Fungsi Helper ---
const getServers = () => {
    const dataPath = path.join(__dirname, 'servers.json');
    try {
        if (!fs.existsSync(dataPath)) {
             fs.writeFileSync(dataPath, '[]', 'utf8');
        }
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        console.error("Gagal membaca servers.json:", error.message);
        return [];
    }
};

const saveServers = (servers) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'servers.json'), JSON.stringify(servers, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error("Gagal menyimpan servers.json:", error.message);
        return false;
    }
};

// --- Middleware Autentikasi JWT ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    
    if (token == null) return res.status(401).json({ status: false, message: "Akses ditolak: Token tidak ditemukan." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ status: false, message: "Akses ditolak: Token tidak valid." });
        req.user = user;
        next();
    });
};

// --- ROUTES PUBLIK (LOGIN) ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        const user = { username: username };
        const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' }); 
        return res.json({ status: true, message: "Login berhasil", token: accessToken });
    } else {
        return res.status(401).json({ status: false, message: "Username atau password salah" });
    }
});

// --- ROUTES ADMIN (Dilindungi oleh JWT) ---

app.get('/api/get-servers', authenticateToken, (req, res) => {
    const servers = getServers().map(s => ({ id: s.id, name: s.name, domain: s.domain }));
    res.json({ status: true, servers: servers });
});

app.post('/admin/add-server', authenticateToken, (req, res) => {
    const { domain, auth_key, name } = req.body;
    if (!domain || !auth_key || !name) {
        return res.status(400).json({ status: false, message: 'Data server tidak lengkap.' });
    }

    const servers = getServers();
    const newServerId = `srv-${Date.now()}`;
    const newServer = { id: newServerId, name: name, domain: domain, auth_key: auth_key };
    servers.push(newServer);

    if (saveServers(servers)) {
        res.json({ status: true, message: 'Server berhasil ditambahkan.', server: newServer });
    } else {
        res.status(500).json({ status: false, message: 'Gagal menyimpan data server.' });
    }
});

app.post('/api/create-account', authenticateToken, async (req, res) => {
    const { server_id, endpoint_type, user, password, exp, limitip, quota } = req.body;
    if (!server_id || !endpoint_type || !user) {
        return res.status(400).json({ status: false, message: 'Data input tidak lengkap.' });
    }

    const targetServer = getServers().find(s => s.id === server_id);
    if (!targetServer) {
        return res.status(404).json({ status: false, message: 'ID Server tidak ditemukan.' });
    }

    let apiEndpoint = '';
    const params = { auth: targetServer.auth_key, user: user, limitip: limitip || 1, exp: exp || 1 };

    switch (endpoint_type) {
        case 'ssh':
            apiEndpoint = '/api/create-ssh';
            params.password = password;
            break;
        case 'vmess':
            apiEndpoint = '/api/create-vmess';
            params.quota = quota;
            break;
        case 'trojan':
            apiEndpoint = '/api/create-trojan';
            params.quota = quota;
            break;
        case 'vless':
            apiEndpoint = '/api/create-vless';
            params.quota = quota;
            break;
        default:
            return res.status(400).json({ status: false, message: 'Tipe endpoint tidak valid.' });
    }

    const fullUrl = `https://${targetServer.domain}${apiEndpoint}`;
    
    try {
        const apiResponse = await axios.get(fullUrl, { params });
        
        if (typeof apiResponse.data === 'object' && apiResponse.data !== null) {
             res.json(apiResponse.data);
        } else {
             res.status(500).json({ status: false, message: 'Server target merespons non-JSON atau respons kosong.', data: apiResponse.data });
        }
    } catch (error) {
        console.error(`Error saat proxy ke ${endpoint_type} API:`, error.message);
        res.status(500).json({ status: false, message: 'Gagal menghubungi server target atau API error.' });
    }
});

// --- Redirect ke Halaman Login ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Panel Backend berjalan di http://localhost:${PORT}`);
});
