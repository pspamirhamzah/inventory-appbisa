/* =========================================================
   SCRIPT HYBRID FINAL
   (Mesin Data Baru + Fitur Lengkap Lama)
   ========================================================= */

const API_URL = 'https://script.google.com/macros/s/AKfycbzFanoakpPL3NaMh8CqbolDF5wo9iVb6ikIKQavQh15aGJYBCj7rGQdWyE3sMC911wxdA/exec';
const ADMIN_PASSWORD = 'pso123';

// GLOBAL VARS
let rawData = [];
let currentSector = 'SUBSIDI'; 
let currentChartProduct = 'UREA'; // Default grafik
let selectedYear = new Date().getFullYear();

// KAMUS BULAN (Agar teks Spreadsheet terbaca)
const MONTH_MAP = {
    'JAN': 0, 'JANUARI': 0, 'FEB': 1, 'FEBRUARI': 1, 'MAR': 2, 'MARET': 2,
    'APR': 3, 'APRIL': 3, 'MEI': 4, 'MAY': 4, 'JUN': 5, 'JUNI': 5,
    'JUL': 6, 'JULI': 6, 'AGU': 7, 'AGUSTUS': 7, 'AUG': 7, 'SEP': 8, 'SEPTEMBER': 8,
    'OKT': 9, 'OKTOBER': 9, 'NOV': 10, 'NOVEMBER': 10, 'DES': 11, 'DESEMBER': 11
};
const CHART_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// CHART INSTANCES
let chartNasional, chartProv, sparkUrea, sparkNpk;
let isAdminLoggedIn = false;

// 1. INIT
window.onload = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    loadData();
};

// 2. LOAD DATA
function loadData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(API_URL)
    .then(res => res.json())
    .then(data => {
        if (!Array.isArray(data)) { console.error("Data Error"); return; }
        
        processData(data); // Bersihkan data
        updateDashboard(); // Tampilkan
        
        if(loader) loader.style.display = 'none';
    })
    .catch(err => {
        console.error(err);
        if(loader) loader.style.display = 'none';
    });
}

// 3. PROCESS DATA (Pembersihan Teks -> Angka)
function processData(data) {
    rawData = data.map(r => {
        // Bersihkan Angka (1.250 -> 1250)
        let valStr = String(r['TONASE']).replace(/\./g, '').replace(/,/g, '.');
        let val = parseFloat(valStr) || 0;

        // Bersihkan Tahun
        let year = parseInt(r['TAHUN']) || 0;
        if (year === 0) year = new Date().getFullYear();

        // Bersihkan Bulan
        let txtBulan = String(r['BULAN'] || '').toUpperCase().trim();
        let monthIdx = MONTH_MAP[txtBulan] !== undefined ? MONTH_MAP[txtBulan] : -1;

        return {
            ...r,
            TAHUN: year,
            BULAN_IDX: monthIdx,
            SEKTOR_RAW: String(r['SEKTOR'] || '').toUpperCase().trim(),
            PRODUK_RAW: String(r['PRODUK'] || '').toUpperCase().trim(),
            JENIS_RAW: String(r['JENIS'] || '').toUpperCase().trim(),
            PROVINSI_RAW: String(r['PROVINSI'] || '').toUpperCase().trim(),
            TONASE: val
        };
    });

    // Auto-Switch Tahun
    const hasData = rawData.some(r => r.TAHUN === selectedYear);
    if (!hasData && rawData.length > 0) {
        const uniqueYears = [...new Set(rawData.map(r => r.TAHUN))].sort((a,b) => b-a);
        if(uniqueYears.length > 0) {
            selectedYear = uniqueYears[0];
            const el = document.getElementById('year-label');
            if(el) el.innerText = `Data Tahun: ${selectedYear}`;
        }
    }
}

// 4. UPDATE DASHBOARD (LOGIKA LENGKAP)
function updateDashboard() {
    if (rawData.length === 0) return;

    // A. Siapkan Wadah Data
    let stats = {
        UREA: { real: 0, rkap: 0, realMonthly: Array(12).fill(0), rkapMonthly: Array(12).fill(0) },
        NPK: { real: 0, rkap: 0, realMonthly: Array(12).fill(0), rkapMonthly: Array(12).fill(0) }
    };
    let provStats = {}; // Untuk ranking

    // B. Looping & Filter
    rawData.forEach(r => {
        if (r.TAHUN !== selectedYear) return;

        // Filter Sektor
        let isSectorMatch = (currentSector === 'SUBSIDI') ? 
            (r.SEKTOR_RAW.includes('SUBSIDI') && !r.SEKTOR_RAW.includes('NON')) : 
            (r.SEKTOR_RAW.includes('RETAIL') || r.SEKTOR_RAW.includes('NON'));
        if (!isSectorMatch) return;

        // Identifikasi Jenis (Realisasi vs Target/RKAP)
        const isReal = r.JENIS_RAW.includes('REALISASI') || r.JENIS_RAW.includes('PENJUALAN');
        const isTarget = r.JENIS_RAW.includes('RKAP') || r.JENIS_RAW.includes('TARGET');

        // Identifikasi Produk
        let pKey = '';
        if (r.PRODUK_RAW.includes('UREA') || r.PRODUK_RAW.includes('NITREA')) pKey = 'UREA';
        else if (r.PRODUK_RAW.includes('NPK') || r.PRODUK_RAW.includes('PHONSKA')) pKey = 'NPK';

        if (!pKey) return;

        // Aggregasi
        if (isReal) {
            stats[pKey].real += r.TONASE;
            // Ranking per provinsi
            let prov = r.PROVINSI_RAW || 'LAINNYA';
            if (!provStats[prov]) provStats[prov] = 0;
            provStats[prov] += r.TONASE;
            // Grafik Bulanan
            if (r.BULAN_IDX >= 0) stats[pKey].realMonthly[r.BULAN_IDX] += r.TONASE;
        } 
        else if (isTarget) {
            stats[pKey].rkap += r.TONASE;
            if (r.BULAN_IDX >= 0) stats[pKey].rkapMonthly[r.BULAN_IDX] += r.TONASE;
        }
    });

    // C. Update Kartu KPI (Dengan Persentase & Progress)
    updateCard('urea', stats.UREA);
    updateCard('npk', stats.NPK);

    // D. Update Sparklines (Grafik Kecil)
    drawSparkline('sparkUrea', stats.UREA.realMonthly, 'var(--color-urea)');
    drawSparkline('sparkNpk', stats.NPK.realMonthly, 'var(--color-npk)');

    // E. Update Ranking
    renderRankings(provStats);

    // F. Update Grafik Utama
    renderMainChart(stats);
    
    // G. Update Dropdown Provinsi
    populateProvDropdown(provStats);
}

// Helper: Update Kartu
function updateCard(type, data) {
    const real = data.real;
    const rkap = data.rkap;
    // Hitung persen (jika target 0, persen 0)
    const pct = rkap > 0 ? (real / rkap * 100) : 0;
    const sisa = rkap - real;

    updateEl(`kpi-${type}-val`, formatNumber(real));
    updateEl(`txt-${type}-rkap`, formatNumber(rkap));
    updateEl(`kpi-${type}-pct`, pct.toFixed(1) + '%');
    updateEl(`txt-${type}-sisa`, formatNumber(sisa));
    
    // Update Progress Bar
    const progEl = document.getElementById(`prog-${type}`);
    if(progEl) progEl.style.width = Math.min(pct, 100) + '%';
}

// Helper: Render Ranking
function renderRankings(stats) {
    const listBest = document.getElementById('list-best');
    const listWarn = document.getElementById('list-warn');
    if (!listBest) return;

    let sorted = Object.keys(stats).map(k => ({ name: toTitleCase(k), val: stats[k] }));
    sorted.sort((a, b) => b.val - a.val);

    // Top 5
    listBest.innerHTML = sorted.slice(0, 5).map((item, i) => createRankItem(i+1, item, true)).join('');
    // Bottom 5 (Jika data cukup banyak)
    if (sorted.length > 5) {
        let bottom = sorted.slice(-5).reverse();
        listWarn.innerHTML = bottom.map((item, i) => createRankItem(i+1, item, false)).join('');
    } else {
        listWarn.innerHTML = '<p style="padding:10px; font-size:12px; color:grey">Data tidak cukup</p>';
    }
}

function createRankItem(idx, item, isBest) {
    return `
    <div class="rank-item">
        <div class="rank-left">
            <div class="rank-badge ${isBest && idx===1 ? 'badge-1' : ''}">${idx}</div>
            <div class="rank-info">
                <span class="rank-name">${item.name}</span>
                <span class="rank-desc">Realisasi</span>
            </div>
        </div>
        <div class="rank-val">${formatNumber(item.val)}</div>
    </div>`;
}

// Helper: Grafik Utama
function renderMainChart(stats) {
    // Pilih data berdasarkan tab aktif (Urea / NPK)
    const d = (currentChartProduct === 'UREA') ? stats.UREA : stats.NPK;
    const ctx = document.getElementById('chartNasional');
    if (!ctx) return;
    
    if (chartNasional) chartNasional.destroy();

    const styles = getComputedStyle(document.body);
    const colorMain = currentChartProduct === 'UREA' ? '#F7DA19' : '#055AA1'; // Hardcode fallback colors
    
    chartNasional = new Chart(ctx, {
        type: 'line',
        data: {
            labels: CHART_LABELS,
            datasets: [
                { label: 'Realisasi', data: d.realMonthly, borderColor: colorMain, backgroundColor: colorMain+'20', fill: true, tension: 0.4 },
                { label: 'Target', data: d.rkapMonthly, borderColor: '#888', borderDash: [5,5], fill: false, tension: 0.4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true, grid: { color: '#333' } }, x: { grid: { display: false } } }
        }
    });
}

// Helper: Grafik Sparkline
function drawSparkline(id, data, colorVar) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    
    // Ambil warna dari CSS Variable
    const color = getComputedStyle(document.body).getPropertyValue(colorVar.replace('var(','').replace(')','')).trim() || '#fff';
    
    // Hapus instance lama
    if (id === 'sparkUrea' && sparkUrea) sparkUrea.destroy();
    if (id === 'sparkNpk' && sparkNpk) sparkNpk.destroy();

    const config = {
        type: 'line',
        data: { labels: CHART_LABELS, datasets: [{ data: data, borderColor: color, borderWidth: 2, fill: false, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display: false}, tooltip: {enabled: false} }, scales: { x: {display:false}, y: {display:false} } }
    };

    const chart = new Chart(ctx, config);
    if (id === 'sparkUrea') sparkUrea = chart;
    if (id === 'sparkNpk') sparkNpk = chart;
}

// UI Interaction
function setSector(s) {
    currentSector = s;
    updateEl('nav-subsidi', '', (el) => el.className = s === 'SUBSIDI' ? 'nav-item active' : 'nav-item');
    updateEl('nav-retail', '', (el) => el.className = s === 'RETAIL' ? 'nav-item active' : 'nav-item');
    updateEl('page-heading', s === 'SUBSIDI' ? 'Subsidi' : 'Retail');
    updateDashboard();
    if(window.innerWidth <= 768) toggleSidebar();
}

function setChartProduct(p) {
    currentChartProduct = p;
    updateEl('btn-chart-urea', '', el => el.className = p === 'UREA' ? 'btn-toggle active' : 'btn-toggle');
    updateEl('btn-chart-npk', '', el => el.className = p === 'NPK' ? 'btn-toggle active' : 'btn-toggle');
    updateDashboard(); // Redraw chart only
}

function populateProvDropdown(stats) {
    const sel = document.getElementById('prov-select');
    if(!sel) return;
    sel.innerHTML = '<option value="">Semua Wilayah</option>';
    Object.keys(stats).sort().forEach(prov => {
        let opt = document.createElement('option');
        opt.value = prov;
        opt.innerText = toTitleCase(prov);
        sel.appendChild(opt);
    });
}
function updateProvChart(provName) {
    // Fitur chart provinsi bisa ditambahkan logika filter disini nanti
    alert("Filter wilayah: " + provName);
}

// UTILS
function updateEl(id, val, cb) {
    const el = document.getElementById(id);
    if(el) {
        if(val !== '') el.innerText = val;
        if(cb) cb(el);
    }
}
function formatNumber(n) { return new Intl.NumberFormat('id-ID').format(n || 0); }
function toTitleCase(s) { return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase()); }
function toggleTheme() {
    const cur = localStorage.getItem('theme') || 'dark';
    setTheme(cur === 'dark' ? 'light' : 'dark');
}
function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
}
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('show');
    document.querySelector('.overlay').classList.toggle('active');
}

// ADMIN (Placeholder - Fully restore later if needed)
function openLoginModal() { 
    if(!document.getElementById('loginModal')) createLoginModal();
    document.getElementById('loginModal').classList.add('open'); 
    document.getElementById('modalBackdrop').classList.add('open');
}
function closeAllModals() {
    document.querySelectorAll('.modal, .backdrop').forEach(e => e.classList.remove('open'));
}
function createLoginModal() {
    const d = document.createElement('div');
    d.innerHTML = `<div class="modal" id="loginModal"><div class="modal-header"><h3>Admin Login</h3><button class="btn-close" onclick="closeAllModals()">&times;</button></div><div class="modal-body"><input type="password" id="adminPass" class="form-control" placeholder="Password"></div><div class="modal-footer"><button class="btn btn-primary" onclick="alert('Login Logic')">Login</button></div></div>`;
    document.body.appendChild(d);
}
