/* =========================================================
   1. CONFIGURATION
   ========================================================= */
// ⚠️ PASTE URL /exec ANDA DISINI
const API_URL = 'https://script.google.com/macros/s/AKfycbwsKVwPmUMxc72ZFIq3q6NJCEHadQ5pBcHmF2bP3rybCtiluyLQCRkBj-TONJkFhMmMYQ/exec';
const ADMIN_PASSWORD = 'pso123';

/* =========================================================
   2. GLOBAL VARIABLES
   ========================================================= */
let rawData = [];
let currentSector = 'SUBSIDI'; 
let currentChartProduct = 'UREA';
let selectedYear = new Date().getFullYear(); // Default Tahun Ini
let chartNasional, chartProv;
let isAdminLoggedIn = false;

// Label Bulan untuk Grafik
const indoMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/* =========================================================
   3. INITIALIZATION
   ========================================================= */
window.onload = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    loadData();
    
    // Set tampilan tahun di pojok kanan atas
    const yearSelect = document.querySelector('.page-info p');
    if(yearSelect) yearSelect.innerText = `Data Tahun: ${selectedYear}`;
};

function loadData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(API_URL)
    .then(response => response.json())
    .then(data => {
        if(data.error) { 
            console.error("Server Error:", data.error);
            if(loader) loader.style.display = 'none';
            return;
        }

        // PROSES DATA
        processData(data);
        
        // UPDATE DASHBOARD
        updateAll();
        
        if(loader) loader.style.display = 'none';
    })
    .catch(error => {
        console.error('Fetch Error:', error);
        if(loader) loader.style.display = 'none';
    });
}

function processData(data) {
    if (!Array.isArray(data)) return;
    
    rawData = data.map(r => {
        // 1. BERSIHKAN ANGKA TONASE
        let val = r['TONASE'];
        if (typeof val === 'string') {
            val = parseFloat(val.replace(/\./g, '').replace(/,/g, '.')) || 0;
        } else {
            val = Number(val) || 0;
        }

        // 2. AMBIL TAHUN DARI KOLOM BANTU (KOLOM A)
        // Ini kunci agar filter tahun akurat
        let year = Number(r['TAHUN']) || 0;
        
        // 3. AMBIL BULAN UNTUK GRAFIK (KOLOM B)
        // Google Sheet mengirim tanggal format ISO (contoh: 2024-12-31T17:00...)
        // Kita konversi ke Index Bulan (0 = Jan, 11 = Des)
        let monthIdx = -1;
        if (r['BULAN']) {
            let d = new Date(r['BULAN']);
            if (!isNaN(d.getTime())) {
                monthIdx = d.getMonth(); 
            }
        }

        return {
            ...r,
            TAHUN: year,
            BULAN_IDX: monthIdx, // Simpan index bulan untuk grafik
            SEKTOR: String(r['SEKTOR'] || '').toUpperCase().trim(),
            PRODUK: String(r['PRODUK'] || '').toUpperCase().trim(),
            JENIS: String(r['JENIS'] || '').toUpperCase().trim(),
            PROVINSI: String(r['PROVINSI'] || '').toUpperCase().trim(),
            TONASE: val,
            _rowIndex: r['_rowIndex']
        };
    });
    
    // Cek apakah ada data tahun ini
    const dataThisYear = rawData.filter(r => r.TAHUN === selectedYear);
    if (dataThisYear.length === 0 && rawData.length > 0) {
        // Jika kosong, coba cari tahun yang tersedia
        const uniqueYears = [...new Set(rawData.map(item => item.TAHUN))].sort((a,b)=>b-a);
        if(uniqueYears.length > 0) {
            selectedYear = uniqueYears[0]; // Pindah ke tahun terbaru yang ada datanya
            console.log("Auto-switch Tahun ke:", selectedYear);
            // Update label tahun
            const yearDisplay = document.querySelector('.page-info p');
            if(yearDisplay) yearDisplay.innerText = `Data Tahun: ${selectedYear}`;
        }
    }
}

/* =========================================================
   4. DASHBOARD LOGIC
   ========================================================= */
function setSector(sector) {
    currentSector = sector;
    
    const navSubsidi = document.getElementById('nav-subsidi');
    const navRetail = document.getElementById('nav-retail');
    if(navSubsidi) navSubsidi.className = sector === 'SUBSIDI' ? 'nav-item active' : 'nav-item';
    if(navRetail) navRetail.className = sector === 'RETAIL' ? 'nav-item active' : 'nav-item';
    
    const title = document.querySelector('.page-info h2');
    if(title) title.innerText = sector === 'SUBSIDI' ? 'Subsidi' : 'Retail';

    updateAll();
    if(window.innerWidth <= 768) toggleSidebar();
}

function updateAll() {
    if (rawData.length === 0) return;

    // A. HITUNG TOTAL & RANKING
    let totalUrea = 0;
    let totalNPK = 0;
    let provStats = {};
    
    // B. SIAPKAN DATA GRAFIK (Array 12 Bulan)
    let chartData = {
        UREA: { real: Array(12).fill(0), target: Array(12).fill(0) },
        NPK: { real: Array(12).fill(0), target: Array(12).fill(0) }
    };

    rawData.forEach(r => {
        // FILTER DASAR
        // 1. Sektor (Pakai Includes agar fleksibel)
        let isSectorMatch = false;
        if (currentSector === 'SUBSIDI') isSectorMatch = r.SEKTOR.includes('SUBSIDI') && !r.SEKTOR.includes('NON');
        else isSectorMatch = r.SEKTOR.includes('RETAIL') || r.SEKTOR.includes('NON');
        
        if (!isSectorMatch) return;
        
        // 2. Tahun (Wajib sama)
        if (r.TAHUN !== selectedYear) return;

        // IDENTIFIKASI JENIS DATA
        const isReal = r.JENIS === 'REALISASI' || r.JENIS === 'PENJUALAN';
        const isTarget = r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET');
        
        // IDENTIFIKASI PRODUK
        let prodKey = '';
        if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
        else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';

        if (!prodKey) return; // Skip jika produk tidak dikenal

        // --- AGGREGASI DATA ---
        if (isReal) {
            // Total Kartu Atas
            if (prodKey === 'UREA') totalUrea += r.TONASE;
            else totalNPK += r.TONASE;

            // Ranking Provinsi
            let prov = r.PROVINSI || 'LAINNYA';
            if (!provStats[prov]) provStats[prov] = 0;
            provStats[prov] += r.TONASE;

            // Grafik Bulanan (Realisasi)
            if (r.BULAN_IDX >= 0 && r.BULAN_IDX < 12) {
                chartData[prodKey].real[r.BULAN_IDX] += r.TONASE;
            }
        } else if (isTarget) {
            // Grafik Bulanan (Target)
            if (r.BULAN_IDX >= 0 && r.BULAN_IDX < 12) {
                chartData[prodKey].target[r.BULAN_IDX] += r.TONASE;
            }
        }
    });

    // C. UPDATE UI
    updateElement('val-urea', formatNumber(totalUrea));
    updateElement('val-npk', formatNumber(totalNPK));
    
    renderRanking(provStats);
    renderCharts(chartData);
}

function renderRanking(provStats) {
    const container = document.getElementById('top-province-list');
    if(!container) return;

    let sorted = Object.keys(provStats).map(key => ({ name: key, val: provStats[key] }));
    sorted.sort((a, b) => b.val - a.val);

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
    
    if (sorted.length === 0) html = `<p style="text-align:center; padding:20px; font-size:12px; color:grey">Tidak ada data realisasi tahun ${selectedYear}</p>`;
    container.innerHTML = html;
}

function renderCharts(data) {
    // Pastikan elemen canvas ada di HTML Anda (id="chartNasional")
    // Jika Anda ingin grafik per produk (Urea vs NPK), kita bisa gabung atau pilih salah satu
    // Untuk simplifikasi, kita tampilkan grafik UREA di canvas utama dulu
    
    drawChart('chartNasional', data.UREA.real, data.UREA.target, 'UREA');
    // Jika ada canvas kedua untuk NPK, tambahkan disini:
    // drawChart('chartProv', data.NPK.real, data.NPK.target, 'NPK'); 
}

function drawChart(canvasId, dReal, dTarget, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return; // Skip jika canvas tidak ketemu

    const context = ctx.getContext('2d');
    
    // Warna tema
    const styles = getComputedStyle(document.body);
    const colorMain = label === 'UREA' ? styles.getPropertyValue('--color-urea').trim() || '#F7DA19' : styles.getPropertyValue('--color-npk').trim() || '#055AA1';
    const colorText = styles.getPropertyValue('--text-secondary').trim() || '#888';
    
    // Hapus chart lama jika ada
    if (canvasId === 'chartNasional' && chartNasional) chartNasional.destroy();
    if (canvasId === 'chartProv' && chartProv) chartProv.destroy();

    const config = {
        type: 'line',
        data: {
            labels: indoMonths,
            datasets: [
                {
                    label: 'Realisasi',
                    data: dReal,
                    borderColor: colorMain,
                    backgroundColor: colorMain + '20', // Transparan
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                },
                {
                    label: 'Target',
                    data: dTarget,
                    borderColor: colorText,
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top', align: 'end', labels: { color: colorText, font: { size: 11 } } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: colorText, font: { size: 10 } } },
                y: { border: { display: false }, grid: { color: '#333333' }, ticks: { color: colorText, font: { size: 10 } }, beginAtZero: true }
            }
        }
    };

    const newChart = new Chart(context, config);
    if (canvasId === 'chartNasional') chartNasional = newChart;
    else chartProv = newChart;
}

/* =========================================================
   5. ADMIN & UI UTILS
   ========================================================= */
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

// Modal Logic
function openLoginModal() {
    if(isAdminLoggedIn) {
        isAdminLoggedIn = false;
        alert("Logout Berhasil");
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-lock"></i> <span>Login Admin</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'none';
        toggleSidebar();
    } else {
        if(!document.getElementById('loginModal')) createLoginModalHTML();
        openModal('loginModal');
    }
}

function attemptLogin() {
    const pass = document.getElementById('adminPass').value;
    if(pass === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        closeAllModals();
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'flex';
        alert("Login Berhasil!");
        toggleSidebar();
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
    rawData.slice(0, 50).forEach(row => {
        let tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-subtle)";
        tr.innerHTML = `<td style="padding:10px;"><button class="btn btn-primary" style="padding:4px 8px; font-size:11px;">Edit</button></td><td style="padding:10px; font-size:12px;">${row['SEKTOR']}</td><td style="padding:10px; font-size:12px;">${row['PRODUK']}</td><td style="padding:10px; font-size:12px;">${row['JENIS']}</td><td style="padding:10px; font-size:12px;">${row['PROVINSI']}</td><td style="padding:10px; font-size:12px;">${formatNumber(row['TONASE'])}</td>`;
        tbody.appendChild(tr);
    });
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

// HTML Generators
function createLoginModalHTML() {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal" id="loginModal"><div class="modal-header"><h3 class="modal-title">Admin Login</h3><button class="btn-close" onclick="closeAllModals()">&times;</button></div><div class="modal-body"><input type="password" id="adminPass" class="form-control" placeholder="Password..."></div><div class="modal-footer"><button class="btn btn-primary" onclick="attemptLogin()">Masuk</button></div></div>`;
    document.body.appendChild(div);
}
function createAdminPanelHTML() {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal large" id="adminPanelModal" style="width:95%; max-width:800px;"><div class="modal-header"><h3 class="modal-title">Kelola Data</h3><button class="btn-close" onclick="closeAllModals()">&times;</button></div><div class="modal-body"><div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; color:var(--text-primary);"><thead><tr style="border-bottom:1px solid var(--border-color); text-align:left;"><th style="padding:10px;">Aksi</th><th>Sektor</th><th>Produk</th><th>Jenis</th><th>Provinsi</th><th>Tonase</th></tr></thead><tbody id="adminTableBody"></tbody></table></div></div></div>`;
    document.body.appendChild(div);
}
