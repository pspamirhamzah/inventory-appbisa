/* =========================================================
   APP SCRIPT CONFIGURATION
   ========================================================= */
// ⚠️ PENTING: PASTE URL /exec ANDA DISINI
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvQc8_pnXd6PrcU9bQZ28Trh0Ad0P5OHrCKs9203wwY-Sk7u9KvCeKKHpucoQmAyBunA/exec';

const ADMIN_PASSWORD = 'pso123';

/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */
let rawData = [];     // Data mentah dari Google Sheet
let currentSector = 'SUBSIDI'; // Default View
let isAdminLoggedIn = false;

/* =========================================================
   1. INITIALIZATION & FETCH DATA
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    fetchData();
});

function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(GOOGLE_SCRIPT_URL)
        .then(response => response.json())
        .then(data => {
            // Cek apakah data berupa Array (Daftar panjang)
            if (Array.isArray(data)) {
                rawData = data; // Simpan data mentah
                updateDashboard(); // Hitung & Tampilkan
            } else {
                console.error("Format Data Bukan Array:", data);
                alert("Format data tidak dikenali. Cek Console.");
            }
            if(loader) loader.style.display = 'none';
        })
        .catch(error => {
            console.error('Error:', error);
            if(loader) loader.style.display = 'none';
            alert("Gagal mengambil data. Pastikan URL Script benar.");
        });
}

/* =========================================================
   2. DASHBOARD LOGIC (CALCULATION)
   ========================================================= */
function setSector(sector) {
    currentSector = sector;
    
    // Update Menu Aktif
    const navSubsidi = document.getElementById('nav-subsidi');
    const navRetail = document.getElementById('nav-retail');
    
    if(navSubsidi) navSubsidi.className = sector === 'SUBSIDI' ? 'nav-item active' : 'nav-item';
    if(navRetail) navRetail.className = sector === 'RETAIL' ? 'nav-item active' : 'nav-item';
    
    updateDashboard();
    
    // Tutup sidebar di HP
    if(window.innerWidth <= 768) toggleSidebar(); 
}

function updateDashboard() {
    if (rawData.length === 0) return;

    // 1. FILTER DATA BERDASARKAN SEKTOR (SUBSIDI / RETAIL)
    // Kita ambil baris data yang kolom "SEKTOR"-nya sesuai pilihan
    const filteredData = rawData.filter(row => 
        row.SEKTOR && row.SEKTOR.toUpperCase() === currentSector
    );

    // 2. HITUNG TOTAL (AGGREGATE)
    // Kita jumlahkan kolom "TONASE" berdasarkan jenis "PRODUK"
    let totalUrea = 0;
    let totalNPK = 0;

    filteredData.forEach(row => {
        const produk = row.PRODUK ? row.PRODUK.toUpperCase() : '';
        const tonase = parseInt(row.TONASE) || 0; // Pastikan angka

        // Logika Penjumlahan
        if (produk.includes('UREA') || produk.includes('NITREA')) {
            totalUrea += tonase;
        } else if (produk.includes('NPK') || produk.includes('PHONSKA')) {
            totalNPK += tonase;
        }
    });

    // 3. UPDATE TAMPILAN (DOM)
    const pageTitle = document.querySelector('.page-info h2');
    if(pageTitle) pageTitle.innerText = currentSector === 'SUBSIDI' ? 'Subsidi' : 'Retail';

    // Update Angka di Kartu
    updateElement('val-urea', formatNumber(totalUrea));
    updateElement('val-npk', formatNumber(totalNPK));
}

// Fungsi Aman Update Teks
function updateElement(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

/* =========================================================
   3. THEME & UI INTERACTION
   ========================================================= */
function toggleTheme() {
    const current = localStorage.getItem('theme') || 'dark';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    const icon = document.getElementById('theme-icon-sidebar');
    if(icon) icon.className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay'); // Pastikan ID ini 'overlay' bukan class
    // Karena di CSS kita pakai class .overlay, mari kita sesuaikan selektornya:
    const overlayEl = document.querySelector('.overlay');

    if(sb) sb.classList.toggle('show');
    if(overlayEl) overlayEl.classList.toggle('active');
}

/* =========================================================
   4. ADMIN LOGIN SYSTEM
   ========================================================= */
function openLoginModal() {
    if(isAdminLoggedIn) {
        isAdminLoggedIn = false;
        alert("Anda telah logout.");
        const btn = document.getElementById('btn-login-trigger');
        if(btn) btn.innerHTML = '<i class="fas fa-lock"></i> <span>Login Admin</span>';
        
        // Sembunyikan tombol kelola data jika ada
        const adminBtn = document.getElementById('btn-admin-panel');
        if(adminBtn) adminBtn.style.display = 'none';
        
        toggleSidebar();
    } else {
        openModal('loginModal');
    }
}

function attemptLogin() {
    const input = document.getElementById('adminPass');
    if(!input) return;
    
    if(input.value === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        closeAllModals();
        input.value = ''; 
        
        const btn = document.getElementById('btn-login-trigger');
        if(btn) btn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
        
        // Tampilkan tombol kelola data
        const adminBtn = document.getElementById('btn-admin-panel');
        if(adminBtn) adminBtn.style.display = 'flex';

        alert("Login Berhasil!");
        toggleSidebar();
    } else {
        alert("Password Salah!");
    }
}

function openModal(modalId) {
    const m = document.getElementById(modalId);
    const b = document.querySelector('.backdrop'); // Selektor class backdrop
    if(m) m.classList.add('open');
    if(b) b.classList.add('open'); // Pastikan HTML punya div class="backdrop"
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.overlay, .backdrop').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.backdrop').forEach(b => b.classList.remove('open'));
}

// Tutup modal saat klik area gelap
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('backdrop') || e.target.classList.contains('overlay')) {
        closeAllModals();
        // Tutup sidebar juga jika overlay diklik
        const sb = document.getElementById('sidebar');
        if(sb && sb.classList.contains('show')) toggleSidebar();
    }
});
