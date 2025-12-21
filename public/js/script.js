/* =========================================================
   1. CONFIGURATION
   ========================================================= */
// ⚠️ PASTE URL /exec ANDA DISINI
const API_URL = 'https://script.google.com/macros/s/AKfycbxvQc8_pnXd6PrcU9bQZ28Trh0Ad0P5OHrCKs9203wwY-Sk7u9KvCeKKHpucoQmAyBunA/exec';
const ADMIN_PASSWORD = 'pso123';

/* =========================================================
   2. GLOBAL VARIABLES
   ========================================================= */
let rawData = [];
let currentSector = 'SUBSIDI'; 
let selectedYear = new Date().getFullYear(); // Default tahun sekarang
let isAdminLoggedIn = false;

/* =========================================================
   3. INITIALIZATION
   ========================================================= */
window.onload = function() { 
    // Init Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    // Load Data
    loadData();
    
    // Setup Tahun Dropdown (2 Tahun kebelakang & kedepan)
    setupYearFilter();
};

function loadData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(API_URL)
    .then(response => response.json())
    .then(data => {
        if(data.error) { 
            console.error("Server Error:", data.error);
            alert("Terjadi kesalahan di server Apps Script.");
            return;
        }

        // PROSES DATA (MIRIP SCRIPT LAMA)
        rawData = processData(data);
        
        console.log("Data Processed:", rawData); // Debugging

        updateDashboard();
        
        if(loader) loader.style.display = 'none';
    })
    .catch(error => {
        console.error('Fetch Error:', error);
        if(loader) loader.style.display = 'none';
    });
}

// LOGIKA PENTING DARI SCRIPT LAMA: Normalisasi Data
function processData(data) {
    if (!Array.isArray(data)) return [];
    
    return data.map(r => {
        // 1. Pastikan Angka
        let val = r['TONASE'];
        if (typeof val === 'string') {
            val = parseFloat(val.replace(/\./g, '').replace(/,/g, '.')) || 0;
        } else {
            val = Number(val) || 0;
        }

        // 2. Ambil Tahun dari kolom BULAN (Format: YYYY-MM-DD)
        let year = 0;
        if(r['BULAN']) {
            let d = new Date(String(r['BULAN']));
            if(!isNaN(d.getTime())) { 
                year = d.getFullYear(); 
            }
        }

        return {
            ...r,
            SEKTOR: String(r['SEKTOR']).toUpperCase().trim(),
            PRODUK: String(r['PRODUK']).toUpperCase().trim(),
            JENIS: String(r['JENIS']).toUpperCase().trim(), // PENTING: REALISASI / RKAP
            PROVINSI: String(r['PROVINSI']).toUpperCase().trim(),
            TONASE: val,
            TAHUN: year || 0,
            _rowIndex: r['_rowIndex'] // Penting untuk Edit/Hapus
        };
    });
}

/* =========================================================
   4. DASHBOARD LOGIC
   ========================================================= */
function setSector(sector) {
    currentSector = sector;
    
    // Update Menu Visual
    const navSubsidi = document.getElementById('nav-subsidi');
    const navRetail = document.getElementById('nav-retail');
    if(navSubsidi) navSubsidi.className = sector === 'SUBSIDI' ? 'nav-item active' : 'nav-item';
    if(navRetail) navRetail.className = sector === 'RETAIL' ? 'nav-item active' : 'nav-item';
    
    updateDashboard();
    if(window.innerWidth <= 768) toggleSidebar();
}

function updateDashboard() {
    if (rawData.length === 0) return;

    let totalUrea = 0;
    let totalNPK = 0;
    let provStats = {};

    // LOOPING DATA
    rawData.forEach(r => {
        // 1. FILTER: Sektor & Tahun
        if (r.SEKTOR !== currentSector) return;
        if (r.TAHUN !== selectedYear && r.TAHUN !== 0) return; // 0 jika gagal parse tahun

        // 2. FILTER: Hanya ambil 'REALISASI' atau 'PENJUALAN'
        // (Jangan jumlahkan Target/RKAP ke dalam Total Realisasi)
        const isRealisasi = r.JENIS === 'REALISASI' || r.JENIS === 'PENJUALAN';
        
        if (isRealisasi) {
            // Hitung Total Nasional
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) {
                totalUrea += r.TONASE;
            } else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) {
                totalNPK += r.TONASE;
            }

            // Hitung Per Provinsi
            let prov = r.PROVINSI || 'LAINNYA';
            if (!provStats[prov]) provStats[prov] = 0;
            provStats[prov] += r.TONASE;
        }
    });

    // UPDATE UI KARTU
    const pageTitle = document.querySelector('.page-info h2');
    if(pageTitle) pageTitle.innerText = currentSector === 'SUBSIDI' ? 'Subsidi' : 'Retail';
    
    updateElement('val-urea', formatNumber(totalUrea));
    updateElement('val-npk', formatNumber(totalNPK));

    // UPDATE RANKING PROVINSI
    renderRanking(provStats);
}

function renderRanking(provStats) {
    const container = document.getElementById('top-province-list');
    if(!container) return;

    let sorted = Object.keys(provStats).map(key => ({ name: key, val: provStats[key] }));
    sorted.sort((a, b) => b.val - a.val); // Sort Besar ke Kecil

    let html = '';
    sorted.slice(0, 5).forEach((item, index) => {
        const isFirst = index === 0;
        html += `
        <div class="rank-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="rank-badge ${isFirst ? 'badge-1' : ''}" style="width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: bold; border: 1px solid var(--border-color);">
                    ${index + 1}
                </div>
                <div>
                    <span class="rank-name" style="font-weight: 600; font-size: 13px; display: block;">${item.name}</span>
                    <span class="rank-meta" style="font-size: 11px; color: var(--text-secondary);">Realisasi</span>
                </div>
            </div>
            <div class="rank-val" style="font-weight: 700; font-size: 13px;">${formatNumber(item.val)}</div>
        </div>`;
    });
    
    if (sorted.length === 0) html = '<p style="text-align:center; padding:20px; font-size:12px; color:grey">Tidak ada data realisasi</p>';
    container.innerHTML = html;
}

/* =========================================================
   5. ADMIN FEATURES (RESTORED FROM OLD SCRIPT)
   ========================================================= */
function openLoginModal() {
    if(isAdminLoggedIn) {
        isAdminLoggedIn = false;
        alert("Logout Berhasil");
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-lock"></i> <span>Login Admin</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'none';
        toggleSidebar();
    } else {
        // Render Modal HTML jika belum ada (Biar tidak menuhin index.html)
        if(!document.getElementById('loginModal')) createLoginModalHTML();
        openModal('loginModal');
    }
}

function attemptLogin() {
    const pass = document.getElementById('adminPass').value;
    if(pass === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        closeAllModals();
        document.getElementById('adminPass').value = '';
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'flex';
        alert("Login Berhasil!");
        toggleSidebar();
        // Langsung buka tabel data
        openAdminPanel();
    } else {
        alert("Password Salah!");
    }
}

function openAdminPanel() {
    if(!document.getElementById('adminPanelModal')) createAdminPanelHTML();
    renderAdminTable();
    openModal('adminPanelModal');
}

function renderAdminTable() {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Ambil 50 data terakhir saja biar tidak berat
    rawData.slice(0, 50).forEach(row => {
        let tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-subtle)";
        tr.innerHTML = `
            <td style="padding:10px;"><button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick='openEditForm(${JSON.stringify(row)})'>Edit</button></td>
            <td style="padding:10px; font-size:12px;">${row['SEKTOR']}</td>
            <td style="padding:10px; font-size:12px;">${row['PRODUK']}</td>
            <td style="padding:10px; font-size:12px;">${row['JENIS']}</td>
            <td style="padding:10px; font-size:12px;">${row['PROVINSI']}</td>
            <td style="padding:10px; font-size:12px;">${formatNumber(row['TONASE'])}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Fitur Edit/Hapus akan memanggil API dengan POST (seperti script lama)
// Saya sederhanakan agar muat disini, intinya konsepnya sama:
function openEditForm(row) {
    // Implementasi Form Edit sederhana
    let newVal = prompt("Edit Tonase untuk " + row.PROVINSI + " (" + row.PRODUK + "):", row.TONASE);
    if(newVal !== null) {
        saveData(row._rowIndex, newVal);
    }
}

function saveData(rowIndex, tonase) {
    // Kirim data ke Google Script
    const payload = {
        action: 'UPDATE_TONASE', // Pastikan Apps Script menangani ini
        password: ADMIN_PASSWORD,
        rowIndex: rowIndex,
        tonase: tonase
    };

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message || "Update Berhasil");
        loadData(); // Reload data
    })
    .catch(err => alert("Gagal Update: " + err));
}

/* =========================================================
   6. UI HELPERS & UTILS
   ========================================================= */
function setupYearFilter() {
    // Cari elemen dropdown tahun di Header (jika ada)
    // Untuk simplifikasi, kita set tahun ini saja
    selectedYear = new Date().getFullYear();
    // Jika Anda punya dropdown tahun di HTML, tambahkan event listener disini
}

function updateElement(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

function toggleTheme() {
    const current = localStorage.getItem('theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
}

function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    const icon = document.getElementById('theme-icon-sidebar');
    if(icon) icon.className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const overlay = document.querySelector('.overlay'); 
    if(sb) sb.classList.toggle('show');
    if(overlay) overlay.classList.toggle('active');
}

function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.querySelector('.backdrop').classList.add('open');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.backdrop').forEach(b => b.classList.remove('open'));
}

document.addEventListener('click', (e) => {
    if(e.target.classList.contains('backdrop')) closeAllModals();
});

/* =========================================================
   7. HTML GENERATORS (Untuk Modal Login/Admin)
   ========================================================= */
function createLoginModalHTML() {
    const div = document.createElement('div');
    div.innerHTML = `
    <div class="modal" id="loginModal">
        <div class="modal-header">
            <h3 class="modal-title">Admin Login</h3>
            <button class="btn-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <input type="password" id="adminPass" class="form-control" placeholder="Password...">
        </div>
        <div class="modal-footer">
            <button class="btn btn-primary" onclick="attemptLogin()">Masuk</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}

function createAdminPanelHTML() {
    const div = document.createElement('div');
    div.innerHTML = `
    <div class="modal large" id="adminPanelModal" style="width:95%; max-width:800px;">
        <div class="modal-header">
            <h3 class="modal-title">Kelola Data</h3>
            <button class="btn-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; color:var(--text-primary);">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color); text-align:left;">
                            <th style="padding:10px;">Aksi</th>
                            <th>Sektor</th>
                            <th>Produk</th>
                            <th>Jenis</th>
                            <th>Provinsi</th>
                            <th>Tonase</th>
                        </tr>
                    </thead>
                    <tbody id="adminTableBody"></tbody>
                </table>
            </div>
        </div>
    </div>`;
    document.body.appendChild(div);
}
