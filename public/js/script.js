/* =========================================================
   1. KONFIGURASI
   ========================================================= */
const API_URL = 'https://script.google.com/macros/s/AKfycbzFanoakpPL3NaMh8CqbolDF5wo9iVb6ikIKQavQh15aGJYBCj7rGQdWyE3sMC911wxdA/exec';
const ADMIN_PASSWORD = 'pso123';

/* =========================================================
   2. VARIABEL GLOBAL
   ========================================================= */
let rawData = [];
let currentSector = 'SUBSIDI'; 
let currentChartProduct = 'UREA';
let selectedYear = new Date().getFullYear();

// KAMUS BULAN (Untuk parsing data Spreadsheet)
const MONTH_MAP = {
    'JAN': 0, 'JANUARI': 0, 'FEB': 1, 'FEBRUARI': 1, 
    'MAR': 2, 'MARET': 2, 'APR': 3, 'APRIL': 3, 
    'MEI': 4, 'MAY': 4, 'JUN': 5, 'JUNI': 5,
    'JUL': 6, 'JULI': 6, 'AGU': 7, 'AGUSTUS': 7, 'AUG': 7,
    'SEP': 8, 'SEPTEMBER': 8, 'OKT': 9, 'OKTOBER': 9,
    'NOV': 10, 'NOVEMBER': 10, 'DES': 11, 'DESEMBER': 11
};
// LABEL GRAFIK
const CHART_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// CHART INSTANCES
let chartNasional, sparkUrea, sparkNpk;

/* =========================================================
   3. INIT & DATA LOADING
   ========================================================= */
window.onload = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    loadData();
};

function loadData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(API_URL)
    .then(res => res.json())
    .then(data => {
        if (!Array.isArray(data)) { console.error("Data Error"); return; }
        
        processData(data); // 1. Bersihkan Data
        updateAll();       // 2. Hitung & Tampilkan Semua
        
        if(loader) loader.style.display = 'none';
    })
    .catch(err => {
        console.error(err);
        if(loader) loader.style.display = 'none';
    });
}

// FUNGSI PEMBERSIH DATA (Menggunakan Logika Baru yg Sukses)
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
        }
    }
    
    // Update Label Tahun di Header
    const yearInfo = document.querySelector('.page-info p');
    if(yearInfo) yearInfo.innerText = `Data Tahun: ${selectedYear}`;
}

/* =========================================================
   4. LOGIKA UTAMA (PERHITUNGAN)
   ========================================================= */
function updateAll() {
    if (rawData.length === 0) return;

    // A. Siapkan Wadah Data
    let stats = {
        UREA: { real: 0, rkap: 0, realMonthly: Array(12).fill(0) },
        NPK:  { real: 0, rkap: 0, realMonthly: Array(12).fill(0) }
    };
    
    // Wadah Ranking (Provinsi: { real: 0, rkap: 0 })
    let provStats = {}; 

    // B. Looping Data
    rawData.forEach(r => {
        // Filter Tahun
        if (r.TAHUN !== selectedYear) return;

        // Filter Sektor
        let isSectorMatch = (currentSector === 'SUBSIDI') ? 
            (r.SEKTOR_RAW.includes('SUBSIDI') && !r.SEKTOR_RAW.includes('NON')) : 
            (r.SEKTOR_RAW.includes('RETAIL') || r.SEKTOR_RAW.includes('NON'));
        if (!isSectorMatch) return;

        // Identifikasi Jenis & Produk
        const isReal = r.JENIS_RAW.includes('REALISASI') || r.JENIS_RAW.includes('PENJUALAN');
        const isTarget = r.JENIS_RAW.includes('RKAP') || r.JENIS_RAW.includes('TARGET') || r.JENIS_RAW.includes('RKO');
        
        let pKey = '';
        if (r.PRODUK_RAW.includes('UREA') || r.PRODUK_RAW.includes('NITREA')) pKey = 'UREA';
        else if (r.PRODUK_RAW.includes('NPK') || r.PRODUK_RAW.includes('PHONSKA')) pKey = 'NPK';

        if (!pKey) return;

        // Inisialisasi object provinsi jika belum ada
        let prov = r.PROVINSI_RAW || 'LAINNYA';
        if (!provStats[prov]) provStats[prov] = { real: 0, rkap: 0 };

        // Aggregasi Data
        if (isReal) {
            stats[pKey].real += r.TONASE;
            provStats[prov].real += r.TONASE; // Tambah realisasi provinsi
            if (r.BULAN_IDX >= 0) stats[pKey].realMonthly[r.BULAN_IDX] += r.TONASE;
        } 
        else if (isTarget) {
            stats[pKey].rkap += r.TONASE;
            provStats[prov].rkap += r.TONASE; // Tambah target provinsi
        }
    });

    // C. Update UI Kartu Atas
    updateCard('urea', stats.UREA);
    updateCard('npk', stats.NPK);

    // D. Update Sparklines (Grafik Kecil)
    drawSparkline('sparkUrea', stats.UREA.realMonthly, 'var(--color-urea)');
    drawSparkline('sparkNpk', stats.NPK.realMonthly, 'var(--color-npk)');

    // E. Update Ranking (Logika Lama Dikembalikan)
    renderRankings(provStats);

    // F. Update Grafik Utama
    renderMainChart(stats);
}

// --- HELPER: UPDATE KARTU KPI ---
function updateCard(type, data) {
    const real = data.real;
    const rkap = data.rkap;
    // Hitung persen: Jika target 0, persen 0. 
    const pct = rkap > 0 ? (real / rkap * 100) : 0;
    const sisa = rkap - real;

    updateEl(`kpi-${type}-val`, formatNumber(real)); // ID di HTML Baru: kpi-urea-val (di index.html lama) atau val-urea (di baru)
    // Cek ID mana yang dipakai di HTML saat ini.
    // Berdasarkan file index.html TERAKHIR yang Anda kasih, ID nya adalah: 'val-urea'
    // TAPI script lama pakai 'kpi-urea-val'.
    // SAYA AKAN PAKAI TRY-CATCH UNTUK KEDUA ID AGAR AMAN.
    
    safeUpdateText(`val-${type}`, formatNumber(real)); // ID HTML Baru
    safeUpdateText(`kpi-${type}-val`, formatNumber(real)); // Jaga-jaga ID lama
    
    safeUpdateText(`txt-${type}-rkap`, formatNumber(rkap));
    safeUpdateText(`kpi-${type}-pct`, pct.toFixed(1) + '%');
    safeUpdateText(`txt-${type}-sisa`, formatNumber(sisa));
    
    const progEl = document.getElementById(`prog-${type}`);
    if(progEl) progEl.style.width = Math.min(pct, 100) + '%';
}

// --- HELPER: RENDER RANKING (MENGEMBALIKAN LOGIKA LAMA) ---
function renderRankings(stats) {
    const listBest = document.getElementById('top-province-list') || document.getElementById('list-best');
    const listWarn = document.getElementById('list-warn'); // Opsional jika ada
    
    if (!listBest) return;

    // Convert Object ke Array
    let rankArray = Object.keys(stats).map(prov => {
        let d = stats[prov];
        let pct = d.rkap > 0 ? (d.real / d.rkap * 100) : 0;
        return { 
            name: toTitleCase(prov), 
            real: d.real, 
            rkap: d.rkap, 
            pct: pct 
        };
    });

    // LOGIKA SORTING (Mirip Script Lama)
    if (currentSector === 'RETAIL') {
        // Retail biasanya sort by Volume Realisasi
        rankArray.sort((a,b) => b.real - a.real);
    } else {
        // Subsidi biasanya sort by Persentase Capaian (Siapa yang paling mendekati target)
        // ATAU Default sort by Volume Realisasi jika user mau lihat volume terbesar
        // Mari kita pakai Volume Realisasi saja agar pasti muncul angka besar di atas
        rankArray.sort((a,b) => b.real - a.real);
    }

    // Render HTML
    let html = '';
    rankArray.slice(0, 5).forEach((item, i) => {
        const isFirst = i === 0;
        // Subtext: Menampilkan % jika ada target, atau Realisasi saja
        let subText = currentSector === 'SUBSIDI' && item.rkap > 0 
            ? `Capaian: ${item.pct.toFixed(1)}%` 
            : `Realisasi Total`;

        html += `
        <div class="rank-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex; gap:12px; align-items:center;">
                <div class="rank-badge ${isFirst ? 'badge-1' : ''}" style="width:30px; height:30px; display:flex; justify-content:center; align-items:center; border-radius:8px; font-weight:bold; border:1px solid var(--border-color); font-size:12px;">
                    ${i+1}
                </div>
                <div>
                    <span class="rank-name" style="font-weight:600; font-size:13px; display:block;">${item.name}</span>
                    <span class="rank-meta" style="font-size:11px; color:var(--text-secondary);">${subText}</span>
                </div>
            </div>
            <div class="rank-val" style="font-weight:700; font-size:13px;">
                ${formatNumber(item.real)}
            </div>
        </div>`;
    });

    if (rankArray.length === 0) html = '<p style="text-align:center; padding:10px; font-size:12px; color:grey">Data Kosong</p>';
    list.innerHTML = html;
}

// --- HELPER: GRAFIK UTAMA ---
function renderMainChart(stats) {
    const ctx = document.getElementById('chartNasional');
    if (!ctx) return;
    if (chartNasional) chartNasional.destroy();

    const d = (currentChartProduct === 'UREA') ? stats.UREA : stats.NPK;
    const styles = getComputedStyle(document.body);
    const colorMain = currentChartProduct === 'UREA' ? '#F7DA19' : '#055AA1'; 

    chartNasional = new Chart(ctx, {
        type: 'line',
        data: {
            labels: CHART_LABELS,
            datasets: [
                { label: 'Realisasi', data: d.realMonthly, borderColor: colorMain, backgroundColor: colorMain+'20', fill: true, tension: 0.4 },
                // Target Bulanan (Rata-rata atau Data Asli jika ada)
                // Disini kita tampilkan data Asli dari RKO jika ada, jika tidak, flat line
                { label: 'Target', data: d.rkap > 0 && d.rkapMonthly.reduce((a,b)=>a+b,0) === 0 ? Array(12).fill(d.rkap/12) : d.rkapMonthly, borderColor: '#888', borderDash: [5,5], fill: false, tension: 0.4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#333' } } }
        }
    });
}

// --- HELPER: SPARKLINES ---
function drawSparkline(id, data, colorVar) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    
    const color = getComputedStyle(document.body).getPropertyValue(colorVar.replace('var(','').replace(')','')).trim() || '#fff';
    
    // Hapus instance lama (pakai variabel global)
    if (id === 'sparkUrea') { if(sparkUrea) sparkUrea.destroy(); }
    if (id === 'sparkNpk') { if(sparkNpk) sparkNpk.destroy(); }

    const config = {
        type: 'line',
        data: { labels: CHART_LABELS, datasets: [{ data: data, borderColor: color, borderWidth: 2, fill: false, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display: false}, tooltip: {enabled: false} }, scales: { x: {display:false}, y: {display:false} } }
    };

    const chart = new Chart(ctx, config);
    if (id === 'sparkUrea') sparkUrea = chart;
    if (id === 'sparkNpk') sparkNpk = chart;
}


// --- INTERAKSI UI ---
function setSector(s) {
    currentSector = s;
    updateEl('nav-subsidi', '', el => el.className = s === 'SUBSIDI' ? 'nav-item active' : 'nav-item');
    updateEl('nav-retail', '', el => el.className = s === 'RETAIL' ? 'nav-item active' : 'nav-item');
    updateEl('page-heading', s === 'SUBSIDI' ? 'Subsidi' : 'Retail');
    updateAll();
    if(window.innerWidth <= 768) toggleSidebar();
}

function setChartProduct(p) {
    currentChartProduct = p;
    updateEl('btn-chart-urea', '', el => el.className = p === 'UREA' ? 'btn-toggle active' : 'btn-toggle');
    updateEl('btn-chart-npk', '', el => el.className = p === 'NPK' ? 'btn-toggle active' : 'btn-toggle');
    updateAll(); // Refresh grafik
}

// --- UTILS ---
function updateEl(id, val, cb) {
    const el = document.getElementById(id);
    if(el) {
        if(val !== '') el.innerText = val;
        if(cb) cb(el);
    }
}
function safeUpdateText(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
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

// ADMIN (Dummy)
function openLoginModal() { alert("Login Admin"); }
function openAdminPanel() { alert("Panel Admin"); }
function closeAllModals() { document.querySelector('.backdrop').classList.remove('open'); }
