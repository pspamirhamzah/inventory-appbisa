/* =========================================================
   APP SCRIPT CONFIGURATION
   ========================================================= */
// ⚠️ GANTI LAGI URL INI DENGAN YANG /exec JIKA BERUBAH
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvQc8_pnXd6PrcU9bQZ28Trh0Ad0P5OHrCKs9203wwY-Sk7u9KvCeKKHpucoQmAyBunA/exec';

const ADMIN_PASSWORD = 'pso123';

/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */
let rawData = [];
let currentSector = 'SUBSIDI'; // Default

/* =========================================================
   1. INITIALIZATION
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set Tema
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    // 2. Ambil Data
    fetchData();
});

function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    fetch(GOOGLE_SCRIPT_URL)
        .then(response => response.json())
        .then(data => {
            console.log("Data Mentah:", data); // Cek di Console Browser
            
            if (Array.isArray(data) && data.length > 0) {
                rawData = data;
                updateDashboard(); // Hitung Data
                
                // Matikan Loading
                if(loader) loader.style.display = 'none';
            } else {
                if(loader) loader.style.display = 'none';
                alert("Data kosong atau format salah.");
            }
        })
        .catch(error => {
            console.error(error);
            if(loader) loader.style.display = 'none';
            // Jangan alert error agar tidak mengganggu jika hanya masalah koneksi sesaat
        });
}

/* =========================================================
   2. DATA CALCULATION (PERBAIKAN LOGIKA)
   ========================================================= */
function setSector(sector) {
    currentSector = sector;
    
    // Update Menu Aktif (Visual Sidebar)
    const navSubsidi = document.getElementById('nav-subsidi');
    const navRetail = document.getElementById('nav-retail');
    
    if(navSubsidi) navSubsidi.className = sector === 'SUBSIDI' ? 'nav-item active' : 'nav-item';
    if(navRetail) navRetail.className = sector === 'RETAIL' ? 'nav-item active' : 'nav-item';
    
    updateDashboard();
    
    // Tutup Sidebar (Mobile)
    if(window.innerWidth <= 768) toggleSidebar();
}

function updateDashboard() {
    if (rawData.length === 0) return;

    // --- LOGIKA HITUNG BARU (LEBIH AMAN) ---
    let totalUrea = 0;
    let totalNPK = 0;

    rawData.forEach(row => {
        // 1. BERSIHKAN DATA (Hapus Spasi & Jadi Huruf Besar)
        // Contoh: " Urea " jadi "UREA"
        const sektorRaw = row.SEKTOR ? row.SEKTOR.toString().toUpperCase().trim() : '';
        const produkRaw = row.PRODUK ? row.PRODUK.toString().toUpperCase().trim() : '';
        
        // 2. BERSIHKAN ANGKA (Hapus titik ribuan jadi angka murni)
        let tonase = 0;
        if (typeof row.TONASE === 'string') {
            // Ubah "1.250" jadi 1250 (Format Indonesia)
            tonase = parseFloat(row.TONASE.replace(/\./g, '').replace(/,/g, '.')) || 0;
        } else {
            tonase = parseFloat(row.TONASE) || 0;
        }

        // 3. PENJUMLAHAN
        // Cek apakah baris ini milik Sektor yang sedang dipilih (Subsidi/Retail)
        if (sektorRaw === currentSector) {
            
            // Cek Jenis Produk
            if (produkRaw.includes('UREA') || produkRaw.includes('NITREA')) {
                totalUrea += tonase;
            } 
            else if (produkRaw.includes('NPK') || produkRaw.includes('PHONSKA') || produkRaw.includes('NPK')) {
                totalNPK += tonase;
            }
        }
    });

    // --- UPDATE UI ---
    // 1. Judul Halaman
    const pageTitle = document.querySelector('.page-info h2');
    if(pageTitle) pageTitle.innerText = currentSector === 'SUBSIDI' ? 'Subsidi' : 'Retail';

    // 2. Masukkan Angka ke Kotak
    updateElement('val-urea', formatNumber(totalUrea));
    updateElement('val-npk', formatNumber(totalNPK));
}

// Helper: Update Teks HTML
function updateElement(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

// Helper: Format Ribuan (1000 -> 1.000)
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
    const overlay = document.querySelector('.overlay'); 
    if(sb) sb.classList.toggle('show');
    if(overlay) overlay.classList.toggle('active');
}

/* =========================================================
   4. ADMIN LOGIN
   ========================================================= */
let isAdminLoggedIn = false;

function openLoginModal() {
    if(isAdminLoggedIn) {
        isAdminLoggedIn = false;
        alert("Anda telah logout.");
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-lock"></i> <span>Login Admin</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'none';
        toggleSidebar();
    } else {
        openModal('loginModal');
    }
}

function attemptLogin() {
    const input = document.getElementById('adminPass');
    if(input && input.value === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        closeAllModals();
        input.value = '';
        document.getElementById('btn-login-trigger').innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
        if(document.getElementById('btn-admin-panel')) document.getElementById('btn-admin-panel').style.display = 'flex';
        alert("Login Berhasil!");
        toggleSidebar();
    } else {
        alert("Password Salah!");
    }
}

function openModal(modalId) {
    const m = document.getElementById(modalId);
    const b = document.querySelector('.backdrop');
    if(m) m.classList.add('open');
    if(b) b.classList.add('open');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.overlay, .backdrop').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.backdrop').forEach(b => b.classList.remove('open'));
}

document.addEventListener('click', (e) => {
    if(e.target.classList.contains('backdrop') || e.target.classList.contains('overlay')) {
        closeAllModals();
        const sb = document.getElementById('sidebar');
        if(sb && sb.classList.contains('show')) toggleSidebar();
    }
});
