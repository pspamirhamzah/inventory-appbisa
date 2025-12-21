// =========================================================
// 1. KONFIGURASI
// =========================================================
const API_URL = "https://script.google.com/macros/s/AKfycbw8idschHLJfy7Uy81bUQG4cuJtFvCwhPdNK1wjMxALbFBKic9IMy1EfmwsXGkDmIiNrA/exec"; 

// =========================================================
// 2. VARIABEL GLOBAL & INIT
// =========================================================
const indoMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
let rawData = [];
let currentSector = 'SUBSIDI';
let currentChartProduct = 'UREA';
let selectedProvince = "";
let selectedYear = new Date().getFullYear();
let chartNasional, chartProv, sparkUrea, sparkNpk;
let isAdminLoggedIn = false; 

// Theme Init
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

window.onload = function() { 
    loadData();
    initYearDropdowns();
};

// =========================================================
// 3. FUNGSI PENGAMBILAN DATA (GET)
// =========================================================
function loadData() {
    document.getElementById('loader').style.display = 'flex';
    document.getElementById('loader').style.opacity = '1';

    if (API_URL === "ISI_URL_WEB_APP_ANDA_DISINI") {
        alert("URL API belum diisi di file script.js!");
        document.getElementById('loader').style.display = 'none';
        return;
    }

    fetch(API_URL)
    .then(response => response.json())
    .then(data => {
        if(data.error) { alert("Error Server: " + data.error); return; }
        initDashboard(JSON.stringify(data));
    })
    .catch(error => {
        console.error('Error:', error);
        alert("Gagal mengambil data. Pastikan Apps Script sudah 'Anyone'.");
        document.getElementById('loader').style.display = 'none';
    });
}

function initDashboard(jsonString) {
    try {
        rawData = JSON.parse(jsonString);
        if(rawData.error) { alert("Error: " + rawData.error); return; }
    } catch(e) { rawData = []; }
    
    if(document.getElementById('adminPanelModal') && document.getElementById('adminPanelModal').classList.contains('open')) {
        renderAdminTable();
    }

    let provSet = new Set();
    let yearSet = new Set(); 

    rawData.forEach(r => {
        r['TONASE'] = Number(r['TONASE']) || 0;
        if(r['PROVINSI']) { r['PROVINSI'] = String(r['PROVINSI']).toUpperCase().trim(); provSet.add(r['PROVINSI']); }
        let idx = -1; let year = 0;
        if(r['BULAN']) {
            let d = new Date(String(r['BULAN']));
            if(!isNaN(d.getTime())) { idx = d.getMonth(); year = d.getFullYear(); } 
        }
        r['BULAN_IDX'] = r['BULAN_IDX'] !== undefined ? r['BULAN_IDX'] : idx;
        r['TAHUN'] = year; 
        if(year > 0) yearSet.add(year);
    });
    
    // Update Datalist Admin
    const dl = document.getElementById('provList');
    if(dl) {
        dl.innerHTML = '';
        Array.from(provSet).sort().forEach(p => { let opt = document.createElement('option'); opt.value = p; dl.appendChild(opt); });
    }

    // Update Year Filter
    const yearList = document.getElementById('year-options-list');
    if(yearList) {
        yearList.innerHTML = '';
        let sortedYears = Array.from(yearSet).sort((a,b) => b-a);
        if(sortedYears.length > 0) {
             if (!yearSet.has(selectedYear)) selectedYear = sortedYears[0]; 
             sortedYears.forEach(y => {
                 let div = document.createElement('div'); div.className = 'option'; div.innerText = y;
                 if(y === selectedYear) div.classList.add('selected');
                 div.onclick = function() { selectYear(y); }; yearList.appendChild(div);
             });
             document.getElementById('year-dropdown-text').innerText = selectedYear;
        } else {
             let curY = new Date().getFullYear(); selectedYear = curY;
             document.getElementById('year-dropdown-text').innerText = curY;
        }
    }

    updateAll();
    checkDataFreshness(jsonString); 
    document.getElementById('loader').style.opacity = '0';
    setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 500);
}

// =========================================================
// 4. ADMIN FEATURES (MANUAL LOGIN - DENGAN PASSWORD)
// =========================================================

// Password tetap kita simpan di sini untuk verifikasi awal & pengiriman data
const CLIENT_PASSWORD = 'pso123'; 

function openLoginModal() {
    if(isAdminLoggedIn) {
        // LOGOUT LOGIC
        isAdminLoggedIn = false;
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-lock"></i> <span>Login Admin</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'none'; 
        toggleSidebar();
        alert("Anda telah logout.");
    } else {
        // BUKA MODAL PASSWORD
        if(!document.getElementById('loginModal')) createLoginModalHTML();
        openModal('loginModal');
    }
}

function attemptLogin() {
    const pass = document.getElementById('adminPass').value;
    
    // Cek apakah password yang diketik sama dengan 'pso123'
    if(pass === CLIENT_PASSWORD) { 
        isAdminLoggedIn = true;
        closeAllModals();
        document.getElementById('adminPass').value = ''; // Bersihkan input
        
        // Ubah Tampilan Menu
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'flex';
        
        toggleSidebar();
        openAdminPanel(); // Langsung buka tabel
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
    const search = document.getElementById('searchData').value.toLowerCase();
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = '';
    const filtered = rawData.filter(item => { return Object.values(item).join(' ').toLowerCase().includes(search); });
    filtered.slice(0, 50).forEach(row => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td><button class="btn btn-sm btn-secondary" onclick='openEditForm(${JSON.stringify(row)})'><i class="fas fa-edit"></i></button></td><td>${row['SEKTOR']}</td><td>${row['PRODUK']}</td><td>${row['JENIS']}</td><td>${row['BULAN']}</td><td>${row['PROVINSI']}</td><td>${new Intl.NumberFormat('id-ID').format(row['TONASE'])}</td>`;
        tbody.appendChild(tr);
    });
}

function openEntryForm() {
    if(!document.getElementById('entryFormModal')) createEntryFormHTML();
    document.getElementById('dataForm').reset();
    document.getElementById('field_rowIndex').value = "";
    document.getElementById('formTitle').innerText = "Tambah Data Baru";
    const now = new Date();
    document.getElementById('field_bulan_select').value = now.getMonth() + 1;
    document.getElementById('field_tahun_select').value = now.getFullYear();
    document.getElementById('btnDelete').style.display = 'none';
    document.getElementById('adminPanelModal').classList.remove('open');
    openModal('entryFormModal');
}

function openEditForm(row) {
    if(!document.getElementById('entryFormModal')) createEntryFormHTML();
    document.getElementById('field_rowIndex').value = row['_rowIndex'];
    document.getElementById('field_sektor').value = row['SEKTOR'];
    document.getElementById('field_produk').value = row['PRODUK'];
    document.getElementById('field_jenis').value = row['JENIS'];
    document.getElementById('field_provinsi').value = row['PROVINSI'];
    document.getElementById('field_tonase').value = row['TONASE'];
    try {
        let d = new Date(row['BULAN']);
        if(!isNaN(d.getTime())) {
            document.getElementById('field_bulan_select').value = d.getMonth() + 1;
            document.getElementById('field_tahun_select').value = d.getFullYear();
        }
    } catch(e) {}
    document.getElementById('formTitle').innerText = "Edit Data";
    document.getElementById('btnDelete').style.display = 'block';
    document.getElementById('adminPanelModal').classList.remove('open');
    openModal('entryFormModal');
}

function closeEntryForm() {
    document.getElementById('entryFormModal').classList.remove('open');
    document.getElementById('adminPanelModal').classList.add('open');
}

function submitData() {
    const btn = document.getElementById('btnSave');
    const originalText = btn.innerText; btn.innerText = 'Menyimpan...'; btn.disabled = true;
    const bulan = document.getElementById('field_bulan_select').value;
    const tahun = document.getElementById('field_tahun_select').value;
    const formattedDate = `${tahun}-${bulan.padStart(2, '0')}-01`;
    const payload = {
        action: 'SAVE', password: 'pso123', rowIndex: document.getElementById('field_rowIndex').value,
        data: { SEKTOR: document.getElementById('field_sektor').value, PRODUK: document.getElementById('field_produk').value, JENIS: document.getElementById('field_jenis').value, BULAN: formattedDate, PROVINSI: document.getElementById('field_provinsi').value, TONASE: document.getElementById('field_tonase').value }
    };
    fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(res => res.json()).then(data => {
        btn.innerText = originalText; btn.disabled = false;
        if(data.status === 'success') { alert(data.message); closeEntryForm(); loadData(); } else { alert("Gagal: " + data.message); }
    }).catch(err => { btn.innerText = originalText; btn.disabled = false; alert("Koneksi Error."); });
}

function attemptDelete() {
    if(!confirm("Yakin hapus data ini?")) return;
    const btn = document.getElementById('btnDelete'); btn.innerText = '...'; btn.disabled = true;
    const payload = { action: 'DELETE', password: 'pso123', rowIndex: document.getElementById('field_rowIndex').value };
    fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(res => res.json()).then(data => {
        btn.innerText = 'Hapus'; btn.disabled = false;
        if(data.status === 'success') { alert(data.message); closeEntryForm(); loadData(); } else { alert("Gagal: " + data.message); }
    }).catch(err => { alert("Error koneksi."); btn.disabled = false; });
}

// =========================================================
// 5. HELPER HTML GENERATORS
// =========================================================
function createLoginModalHTML() {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal" id="loginModal"><div class="modal-header"><h3 class="modal-title">Admin Login</h3><button class="btn-close" onclick="closeAllModals()">&times;</button></div><div class="modal-body"><div style="margin-bottom:16px"><label style="display:block;margin-bottom:6px">Password</label><input type="password" id="adminPass" class="form-control" placeholder="..."></div></div><div class="modal-footer"><button class="btn btn-primary" onclick="attemptLogin()">Masuk</button></div></div>`;
    document.body.appendChild(div);
}
function createAdminPanelHTML() {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal large" id="adminPanelModal"><div class="modal-header"><h3 class="modal-title">Kelola Data</h3><button class="btn-close" onclick="closeAllModals()">&times;</button></div><div class="modal-body"><div style="display:flex;justify-content:space-between;margin-bottom:16px;"><input type="text" id="searchData" class="form-control" style="max-width:200px;" placeholder="Cari..." onkeyup="renderAdminTable()"><button class="btn btn-primary" onclick="openEntryForm()"><i class="fas fa-plus"></i> Tambah</button></div><div class="admin-table-wrapper" style="overflow-x:auto;max-height:400px;"><table class="admin-table" style="width:100%;border-collapse:collapse;text-align:left;"><thead><tr style="border-bottom:1px solid #333"><th>Aksi</th><th>Sektor</th><th>Produk</th><th>Jenis</th><th>Bulan</th><th>Prov</th><th>Ton</th></tr></thead><tbody id="adminTableBody"></tbody></table></div></div></div>`;
    document.body.appendChild(div);
}
function createEntryFormHTML() {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal" id="entryFormModal" style="z-index:1100"><div class="modal-header"><h3 class="modal-title" id="formTitle">Form</h3><button class="btn-close" onclick="closeEntryForm()">&times;</button></div><div class="modal-body" style="text-align:left"><form id="dataForm"><input type="hidden" id="field_rowIndex"><div class="form-group"><label class="form-label">Sektor</label><select id="field_sektor" class="form-control"><option value="SUBSIDI">SUBSIDI</option><option value="RETAIL">RETAIL</option><option value="NON SUBSIDI">NON SUBSIDI</option></select></div><div class="form-group"><label class="form-label">Produk</label><select id="field_produk" class="form-control"><option value="UREA">UREA</option><option value="NPK">NPK</option></select></div><div class="form-group"><label class="form-label">Jenis</label><select id="field_jenis" class="form-control"><option value="REALISASI">REALISASI</option><option value="RKAP">RKAP/TARGET</option><option value="STOK">STOK</option></select></div><div class="form-group"><label class="form-label">Provinsi</label><input type="text" id="field_provinsi" class="form-control" list="provList"><datalist id="provList"></datalist></div><div class="form-group"><label class="form-label">Periode</label><div style="display:flex;gap:8px"><select id="field_bulan_select" class="form-control"><option value="1">Jan</option><option value="2">Feb</option><option value="3">Mar</option><option value="4">Apr</option><option value="5">Mei</option><option value="6">Jun</option><option value="7">Jul</option><option value="8">Agu</option><option value="9">Sep</option><option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option></select><select id="field_tahun_select" class="form-control"></select></div></div><div class="form-group"><label class="form-label">Tonase</label><input type="number" step="0.01" id="field_tonase" class="form-control"></div></form></div><div class="modal-footer"><button class="btn btn-danger" id="btnDelete" style="margin-right:auto" onclick="attemptDelete()">Hapus</button><button class="btn btn-primary" id="btnSave" onclick="submitData()">Simpan</button></div></div>`;
    document.body.appendChild(div);
    initYearDropdowns();
}

// =========================================================
// 6. LOGIKA UI & CHART
// =========================================================
function setTheme(t) {document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); const isDark = t === 'dark'; const icon = document.getElementById('theme-icon-sidebar'); if(icon) {icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';} if(rawData.length > 0) updateCharts();}
function toggleTheme() { const current = document.documentElement.getAttribute('data-theme'); setTheme(current === 'dark' ? 'light' : 'dark'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('show'); document.querySelector('.overlay').classList.toggle('active'); }
function openModal(id) { document.getElementById(id).classList.add('open'); document.getElementById('modalBackdrop').classList.add('open'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(el => el.classList.remove('open')); document.getElementById('modalBackdrop').classList.remove('open'); }
function toggleProvDropdown(e) { e.stopPropagation(); document.getElementById('year-options-list').classList.remove('open'); document.getElementById('custom-options-list').classList.toggle('open'); }
function toggleYearDropdown(e) { e.stopPropagation(); document.getElementById('custom-options-list').classList.remove('open'); document.getElementById('year-options-list').classList.toggle('open'); }
document.addEventListener('click', function(e) { if (!e.target.closest('.select-wrapper')) { document.querySelectorAll('.select-options').forEach(el => el.classList.remove('open')); } });
function selectOption(provName) { selectedProvince = provName; document.getElementById('dropdown-text').innerText = provName; document.getElementById('custom-options-list').classList.remove('open'); document.querySelectorAll('#custom-options-list .option').forEach(opt => { opt.classList.remove('selected'); if(opt.dataset.value === provName) opt.classList.add('selected'); }); updateProvChart(); }
function selectYear(y) { selectedYear = parseInt(y); document.getElementById('year-dropdown-text').innerText = y; document.getElementById('year-options-list').classList.remove('open'); document.querySelectorAll('#year-options-list .option').forEach(opt => { opt.classList.remove('selected'); if(opt.innerText == y) opt.classList.add('selected'); }); updateAll(); }
function checkDataFreshness(jsonString) { const currentHash = simpleHash(jsonString); const savedHash = localStorage.getItem('psp_analytics_hash'); const savedDate = localStorage.getItem('psp_analytics_date'); let displayDate = ""; const now = new Date(); const d = String(now.getDate()).padStart(2, '0'); const m = String(now.getMonth() + 1).padStart(2, '0'); const y = now.getFullYear(); const todayStr = `${d}/${m}/${y}`; if (currentHash !== savedHash || !savedDate) { displayDate = todayStr; localStorage.setItem('psp_analytics_hash', currentHash); localStorage.setItem('psp_analytics_date', displayDate); } else { displayDate = savedDate; } document.getElementById('last-update').innerText = `Update: ${displayDate}`; }
function simpleHash(str) { let hash = 0; if (str.length === 0) return hash; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } return hash.toString(); }
function setSector(s) { currentSector = s; document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); const title = s === 'SUBSIDI' ? 'Subsidi' : 'Retail'; if(s === 'SUBSIDI') document.getElementById('nav-subsidi').classList.add('active'); else document.getElementById('nav-retail').classList.add('active'); document.getElementById('page-heading').innerText = title; toggleSidebar(); selectedProvince = ""; updateAll(); }
function setChartProduct(p) { currentChartProduct = p; document.getElementById('btn-nas-urea').className = p === 'UREA' ? 'btn-toggle active t-urea' : 'btn-toggle'; document.getElementById('btn-nas-npk').className = p === 'NPK' ? 'btn-toggle active t-npk' : 'btn-toggle'; updateCharts(); updateRankings(); populateDropdown(); }
function updateAll() { calculateKPIs(); populateDropdown(); updateCharts(); updateRankings(); }
function initYearDropdowns() { const yearSelect = document.getElementById('field_tahun_select'); if(!yearSelect) return; const currentYear = new Date().getFullYear(); yearSelect.innerHTML = ''; for(let i = currentYear - 2; i <= currentYear + 2; i++) { let opt = document.createElement('option'); opt.value = i; opt.innerText = i; if(i === currentYear) opt.selected = true; yearSelect.appendChild(opt); } }
function calculateKPIs() { let stats = { 'UREA': { real: 0, rkap: 0 }, 'NPK': { real: 0, rkap: 0 } }; let sparkDataUrea = Array(12).fill(0); let sparkDataNpk = Array(12).fill(0); rawData.forEach(r => { const s = String(r['SEKTOR']).toUpperCase(); let isSectorMatch = (currentSector === 'SUBSIDI') ? (s.includes('SUBSIDI') && !s.includes('NON')) : (s.includes('RETAIL') || s.includes('NON')); if (!isSectorMatch || r['TAHUN'] != selectedYear) return; const p = String(r['PRODUK']).toUpperCase(); const val = r['TONASE']; const jenis = String(r['JENIS']).toUpperCase(); const idx = r['BULAN_IDX']; let pKey = ''; if(p.includes('UREA')) pKey = 'UREA'; else if(p.includes('NPK')) pKey = 'NPK'; else return; if (jenis === 'REALISASI' || jenis === 'PENJUALAN') { stats[pKey].real += val; if(idx >= 0 && idx < 12) { if(pKey === 'UREA') sparkDataUrea[idx] += val; else sparkDataNpk[idx] += val; } } else if (jenis.includes('RKO') || jenis.includes('RKAP') || jenis.includes('TARGET')) stats[pKey].rkap += val; }); updateCardUI('urea', stats['UREA']); updateCardUI('npk', stats['NPK']); drawSparkline('sparkUrea', sparkDataUrea, 'var(--color-urea)'); drawSparkline('sparkNpk', sparkDataNpk, 'var(--color-npk)'); }
function drawSparkline(canvasId, data, colorVar) { const ctx = document.getElementById(canvasId).getContext('2d'); const color = getComputedStyle(document.body).getPropertyValue(colorVar.replace('var(','').replace(')','')).trim(); if(canvasId === 'sparkUrea' && sparkUrea) sparkUrea.destroy(); if(canvasId === 'sparkNpk' && sparkNpk) sparkNpk.destroy(); const config = { type: 'line', data: { labels: Array(12).fill(''), datasets: [{ data: data, borderColor: color, borderWidth: 2, fill: false, pointRadius: 0, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: 0 } }, layout: { padding: 0 } } }; const chart = new Chart(ctx, config); if(canvasId === 'sparkUrea') sparkUrea = chart; if(canvasId === 'sparkNpk') sparkNpk = chart; }
function updateCardUI(type, data) { const real = data.real; const rkap = data.rkap; const pct = rkap > 0 ? (real / rkap * 100).toFixed(1) : 0; const sisa = rkap - real; document.getElementById(`kpi-${type}-val`).innerText = new Intl.NumberFormat('id-ID').format(real); document.getElementById(`kpi-${type}-pct`).innerText = pct + '%'; document.getElementById(`prog-${type}`).style.width = Math.min(pct, 100) + '%'; document.getElementById(`txt-${type}-rkap`).innerText = new Intl.NumberFormat('id-ID').format(rkap); document.getElementById(`txt-${type}-sisa`).innerText = new Intl.NumberFormat('id-ID').format(sisa); }
function populateDropdown() { let provSet = new Set(); rawData.forEach(r => { const s = String(r['SEKTOR']).toUpperCase(); let isSectorMatch = (currentSector === 'SUBSIDI') ? (s.includes('SUBSIDI') && !s.includes('NON')) : (s.includes('RETAIL') || s.includes('NON')); const p = String(r['PRODUK']).toUpperCase(); let isProductMatch = p.includes(currentChartProduct); if(isSectorMatch && r['TAHUN'] == selectedYear && isProductMatch && r['PROVINSI']) provSet.add(r['PROVINSI']); }); const sortedProv = Array.from(provSet).sort(); const listContainer = document.getElementById('custom-options-list'); listContainer.innerHTML = ''; if (sortedProv.length === 0) { listContainer.innerHTML = '<div class="option">Tidak ada data</div>'; document.getElementById('dropdown-text').innerText = '-'; selectedProvince = ""; } else { if(!selectedProvince || !sortedProv.includes(selectedProvince)) selectedProvince = sortedProv[0]; document.getElementById('dropdown-text').innerText = selectedProvince; sortedProv.forEach(p => { const div = document.createElement('div'); div.className = 'option'; if(p === selectedProvince) div.classList.add('selected'); div.dataset.value = p; div.innerText = p; div.onclick = function() { selectOption(p); }; listContainer.appendChild(div); }); } updateProvChart(); }
function updateProvChart() { updateCharts(); }
function updateCharts() { const filteredData = rawData.filter(r => { const s = String(r['SEKTOR']).toUpperCase(); const p = String(r['PRODUK']).toUpperCase(); let isSectorMatch = (currentSector === 'SUBSIDI') ? (s.includes('SUBSIDI') && !s.includes('NON')) : (s.includes('RETAIL') || s.includes('NON')); return isSectorMatch && p.includes(currentChartProduct) && r['TAHUN'] == selectedYear; }); let nasReal = Array(12).fill(0); let nasRKAP = Array(12).fill(0); let nasStock = Array(12).fill(0); let provReal = Array(12).fill(0); let provRKAP = Array(12).fill(0); let provStock = Array(12).fill(0); filteredData.forEach(r => { let idx = r['BULAN_IDX']; if(idx < 0 || idx > 11) return; let val = r['TONASE']; let jenis = String(r['JENIS']).toUpperCase(); let isReal = jenis === 'REALISASI' || jenis === 'PENJUALAN'; let isRKAP = jenis.includes('RKO') || jenis.includes('RKAP') || jenis.includes('TARGET'); let isStock = jenis === 'AKTUAL' || jenis.includes('STOK'); if (isReal) nasReal[idx] += val; else if (isRKAP) nasRKAP[idx] += val; else if (isStock) nasStock[idx] += val; if (r['PROVINSI'] === selectedProvince) { if (isReal) provReal[idx] += val; else if (isRKAP) provRKAP[idx] += val; else if (isStock) provStock[idx] += val; } }); drawChart('chartNasional', nasReal, nasRKAP, nasStock); drawChart('chartProv', provReal, provRKAP, provStock); }
function drawChart(canvasId, dReal, dRKAP, dStock) { const ctx = document.getElementById(canvasId).getContext('2d'); const styles = getComputedStyle(document.body); const cUrea = styles.getPropertyValue('--color-urea').trim(); const cNpk = styles.getPropertyValue('--color-npk').trim(); const mainColor = currentChartProduct === 'UREA' ? cUrea : cNpk; const cText = styles.getPropertyValue('--text-secondary').trim(); const cGrid = styles.getPropertyValue('--border-subtle').trim(); const cStock = styles.getPropertyValue('--color-stock').trim(); if(canvasId === 'chartNasional' && chartNasional) chartNasional.destroy(); if(canvasId === 'chartProv' && chartProv) chartProv.destroy(); let grad = ctx.createLinearGradient(0,0,0,300); grad.addColorStop(0, mainColor + '80'); grad.addColorStop(1, mainColor + '00'); let datasets = [ { label: 'Realisasi', data: dReal, type: 'line', borderColor: mainColor, backgroundColor: grad, borderWidth: 3, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, fill: true, order: 1 }, { label: 'Target', data: dRKAP, type: 'line', borderColor: cText, borderDash: [4,4], borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false, order: 2 } ]; if (currentSector !== 'RETAIL') { datasets.push({ label: 'Stok', data: dStock, type: 'bar', backgroundColor: cStock + '60', borderRadius: 0, barPercentage: 0.5, order: 3 }); } const config = { type: 'bar', data: { labels: indoMonths, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 30, boxHeight: 10, color: cText, font: { family: 'Plus Jakarta Sans', size: 11 }, generateLabels: (chart) => { return chart.data.datasets.map((dataset, i) => { let pointStyle = 'line'; let lineDash = []; let fillStyle = dataset.borderColor; let strokeStyle = dataset.borderColor; let lineWidth = dataset.borderWidth || 2; if (dataset.label === 'Realisasi') pointStyle = 'line'; else if (dataset.label === 'Target') { pointStyle = 'line'; lineDash = [4, 4]; } else if (dataset.label === 'Stok') { pointStyle = 'rect'; fillStyle = dataset.backgroundColor; strokeStyle = 'transparent'; lineWidth = 0; } return { text: dataset.label, fillStyle: fillStyle, strokeStyle: strokeStyle, lineWidth: lineWidth, hidden: !chart.isDatasetVisible(i), lineDash: lineDash, pointStyle: pointStyle, datasetIndex: i, fontColor: cText }; }); } } }, tooltip: { backgroundColor: styles.getPropertyValue('--bg-sidebar').trim(), titleColor: styles.getPropertyValue('--text-primary').trim(), bodyColor: styles.getPropertyValue('--text-secondary').trim(), borderColor: styles.getPropertyValue('--border-color').trim(), borderWidth: 1, padding: 12, cornerRadius: 8, displayColors: false } }, scales: { x: { grid: { display: false }, ticks: { color: cText, font: { size: 10 } } }, y: { border: { display: false }, grid: { color: cGrid }, ticks: { color: cText, maxTicksLimit: 5, callback: (v) => formatCompact(v) }, beginAtZero: true } } } }; const chartObj = new Chart(ctx, config); if(canvasId === 'chartNasional') chartNasional = chartObj; else chartProv = chartObj; }
function updateRankings() { let provStats = {}; rawData.forEach(r => { const s = String(r['SEKTOR']).toUpperCase(); const p = String(r['PRODUK']).toUpperCase(); let isSectorMatch = (currentSector === 'SUBSIDI') ? (s.includes('SUBSIDI') && !s.includes('NON')) : (s.includes('RETAIL') || s.includes('NON')); if (isSectorMatch && p.includes(currentChartProduct) && r['TAHUN'] == selectedYear) { let prov = r['PROVINSI']; let val = Number(r['TONASE']) || 0; let jenis = String(r['JENIS']).toUpperCase(); if(!provStats[prov]) provStats[prov] = { real: 0, rkap: 0 }; if (jenis === 'REALISASI' || jenis === 'PENJUALAN') provStats[prov].real += val; else if (jenis.includes('RKO') || jenis.includes('RKAP')) provStats[prov].rkap += val; } }); let rankArray = Object.keys(provStats).map(prov => { let real = provStats[prov].real; let rkap = provStats[prov].rkap; let pct = rkap > 0 ? (real / rkap * 100) : 0; return { prov, real, rkap, pct }; }).filter(item => item.prov && item.prov.trim() !== ""); if (currentSector === 'RETAIL') rankArray.sort((a,b) => b.real - a.real); else rankArray.sort((a,b) => b.pct - a.pct); const bestList = document.getElementById('list-best'); bestList.innerHTML = ''; rankArray.slice(0, 5).forEach((item, index) => bestList.innerHTML += createRankItem(index + 1, item, true)); const warnList = document.getElementById('list-warn'); warnList.innerHTML = ''; let bottomArray = rankArray.slice(5); if (currentSector !== 'RETAIL') bottomArray.sort((a,b) => a.pct - b.pct); bottomArray.slice(0, 5).forEach((item, index) => warnList.innerHTML += createRankItem(index + 1, item, false)); }
function createRankItem(num, item, isBest) { let score, sub; if (currentSector === 'RETAIL') { score = new Intl.NumberFormat('id-ID').format(item.real) + " Ton"; sub = `Penjualan Total`; } else { score = item.pct.toFixed(1) + "%"; sub = `Real: ${new Intl.NumberFormat('id-ID').format(item.real)} / Target: ${new Intl.NumberFormat('id-ID').format(item.rkap)}`; } let badgeClass = num === 1 && isBest ? 'badge-1' : 'badge-def'; let icon = num === 1 && isBest ? '<i class="fas fa-crown"></i>' : num; let valClass = isBest ? 'text-good' : (item.pct < 70 && currentSector !== 'RETAIL' ? 'text-bad' : ''); return `<li class="rank-item"><div class="rank-badge ${badgeClass}">${icon}</div><div class="rank-content"><span class="rank-name">${item.prov}</span><span class="rank-meta">${sub}</span></div><div class="rank-val ${valClass}">${score}</div></li>`; }
function formatCompact(num) { return new Intl.NumberFormat('id-ID', { notation: "compact", compactDisplay: "short" }).format(num); }
