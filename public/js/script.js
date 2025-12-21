Chart.defaults.color = '#b3b3b3';
Chart.defaults.borderColor = '#424242';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;

const app = (() => {
    // ⚠️ PASTIKAN URL WEB APP ANDA BENAR DI SINI ⚠️
    const API_URL = 'https://script.google.com/macros/s/AKfycbzFanoakpPL3NaMh8CqbolDF5wo9iVb6ikIKQavQh15aGJYBCj7rGQdWyE3sMC911wxdA/exec';
    
    let state = {
        rawData: [],
        sector: 'SUBSIDI',      
        activeProduct: 'UREA',  
        selectedYear: new Date().getFullYear(),
        sidebarOpen: true
    };

    let chartNasional = null;
    let chartProvinsi = null;

    // --- UTILS ---
    const parseIndoNumber = (str) => {
        if(typeof str === 'number') return str;
        if(!str) return 0;
        let clean = String(str).replace(/\./g, '').replace(/,/g, '.');
        return parseFloat(clean) || 0;
    };

    const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num);

    const createDashedCircle = (color) => {
        const size = 12; const r = 4.5; const c = document.createElement('canvas');
        c.width = size; c.height = size; const ctx = c.getContext('2d');
        ctx.beginPath(); ctx.setLineDash([2, 2]); ctx.lineWidth = 1.5;
        ctx.strokeStyle = color; ctx.arc(size/2, size/2, r, 0, 2 * Math.PI); ctx.stroke();
        return c;
    };

    const normalizeMonth = (str) => {
        const map = {'JAN':0, 'JANUARI':0, 'FEB':1, 'FEBRUARI':1, 'MAR':2, 'MARET':2, 'APR':3, 'APRIL':3, 'MEI':4, 'MAY':4, 'JUN':5, 'JUNI':5, 'JUL':6, 'JULI':6, 'AGU':7, 'AGUSTUS':7, 'SEP':8, 'SEPTEMBER':8, 'OKT':9, 'OKTOBER':9, 'NOV':10, 'NOVEMBER':10, 'DES':11, 'DESEMBER':11};
        return map[String(str).toUpperCase().trim()] ?? -1;
    };
    
    const toTitleCase = (str) => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    const hexToRgbA = (hex, alpha) => {
        let c; if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){ c= hex.substring(1).split(''); if(c.length== 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; } c= '0x'+c.join(''); return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')'; } return hex;
    }

    // --- INIT & LOAD ---
    const init = () => { fetchData(); checkScreenSize(); };

    const checkScreenSize = () => {
        if(window.innerWidth <= 768) { state.sidebarOpen = false; } 
        else { state.sidebarOpen = true; }
        renderSidebar();
    };

    const fetchData = async () => {
        document.getElementById('loader').style.display = 'flex';
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            processData(data);
        } catch (err) {
            console.error("Error:", err);
            // alert("Gagal koneksi data."); 
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    };

    const processData = (data) => {
        state.rawData = data.map(row => ({
            TAHUN: parseInt(row.TAHUN),
            BULAN: normalizeMonth(row.BULAN),
            SEKTOR: String(row.SEKTOR || '').toUpperCase(),
            PRODUK: String(row.PRODUK || '').toUpperCase(),
            JENIS: String(row.JENIS || '').toUpperCase(),
            PROVINSI: toTitleCase(String(row.PROVINSI || '')),
            TONASE: parseIndoNumber(row.TONASE)
        }));

        // Setup Filter Tahun
        const years = [...new Set(state.rawData.map(r => r.TAHUN))].sort((a,b) => b-a);
        const yearSel = document.getElementById('year-select');
        yearSel.innerHTML = '';
        years.forEach(y => {
            let opt = document.createElement('option');
            opt.value = y; opt.text = y;
            if(y === state.selectedYear) opt.selected = true;
            yearSel.appendChild(opt);
        });
        if(!years.includes(state.selectedYear) && years.length > 0) state.selectedYear = years[0];

        updateDashboard(); 
    };

    // --- DROPDOWN LOGIC ---
    const populateProvDropdown = (provKeys) => {
        const s = document.getElementById('dropdown-provinsi');
        const prevVal = s.value; 
        s.innerHTML = '';

        const optDefault = document.createElement('option');
        optDefault.value = ""; optDefault.innerText = "-- Pilih Provinsi --";
        s.appendChild(optDefault);

        if(!provKeys || provKeys.length === 0) return;

        const sortedProvs = provKeys.filter(p => p !== 'LAINNYA').sort();
        sortedProvs.forEach(prov => {
            let opt = document.createElement('option');
            opt.value = prov; opt.innerText = prov;
            s.appendChild(opt);
        });
        
        if (prevVal && sortedProvs.includes(prevVal)) s.value = prevVal; 
    };

    // --- MAIN DASHBOARD LOGIC ---
    const updateDashboard = () => {
        const { rawData, selectedYear, sector, activeProduct } = state;
        
        // 1. Hitung KPI Cards (UREA & NPK Terpisah)
        let kpiStats = {
            curr: { UREA: {real:0, target:0}, NPK: {real:0, target:0} },
            prev: { UREA: {real:0}, NPK: {real:0} },
            nasional: { 
                UREA: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)}, 
                NPK: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)} 
            }
        };

        // 2. Hitung Data Ranking & Dropdown (Hanya Produk Aktif)
        let rankStats = {}; 
        let dropdownProvs = new Set();

        rawData.forEach(r => {
            let isSectorMatch = (sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL');
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            if (!prodKey) return;

            let isReal = r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN');
            let isTarget = r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET');
            let isStock = r.JENIS.includes('STOK') || r.JENIS.includes('STOCK');

            // -- Logic KPI Global (Semua Produk) --
            if (r.TAHUN === selectedYear) {
                if (isReal) {
                    kpiStats.curr[prodKey].real += r.TONASE;
                    if(r.BULAN >= 0) kpiStats.nasional[prodKey].real[r.BULAN] += r.TONASE;
                } else if (isTarget) {
                    kpiStats.curr[prodKey].target += r.TONASE;
                    if(r.BULAN >= 0) kpiStats.nasional[prodKey].target[r.BULAN] += r.TONASE;
                } else if (isStock) {
                    if(r.BULAN >= 0) kpiStats.nasional[prodKey].stock[r.BULAN] += r.TONASE;
                }
            }
            if (r.TAHUN === (selectedYear - 1) && isReal) kpiStats.prev[prodKey].real += r.TONASE;

            // -- Logic Ranking (Hanya Produk Aktif) --
            if (prodKey === activeProduct && r.TAHUN === selectedYear) {
                if (r.PROVINSI && r.PROVINSI !== 'LAINNYA') {
                    dropdownProvs.add(r.PROVINSI);
                    if (!rankStats[r.PROVINSI]) rankStats[r.PROVINSI] = { real: 0 };
                    if (isReal) rankStats[r.PROVINSI].real += r.TONASE;
                }
            }
        });

        populateProvDropdown([...dropdownProvs]);
        renderKPI(kpiStats);
        renderRankings(rankStats); // Kirim data ranking spesifik produk aktif
        renderNasionalChart(kpiStats.nasional);
        renderProvChart(); 
    };

    // --- RENDERERS ---
    const renderKPI = (stats) => {
        const updateCard = (key) => {
            const real = stats.curr[key].real;
            const target = stats.curr[key].target;
            const prev = stats.prev[key].real;
            const pct = target > 0 ? (real/target*100) : 0;
            
            document.getElementById(`val-${key.toLowerCase()}-real`).innerText = formatNumber(real);
            document.getElementById(`val-${key.toLowerCase()}-target`).innerText = formatNumber(target);
            document.getElementById(`val-${key.toLowerCase()}-pct`).innerText = pct.toFixed(1) + '%';
            document.getElementById(`prog-${key.toLowerCase()}`).style.width = Math.min(pct, 100) + '%';

            let growthVal = 0;
            let isUp = true;
            if(prev > 0) {
                growthVal = ((real - prev) / prev) * 100;
                isUp = growthVal >= 0;
            } else if (real > 0) growthVal = 100;

            const badge = document.getElementById(`growth-${key.toLowerCase()}-badge`);
            document.getElementById(`growth-${key.toLowerCase()}-val`).innerText = Math.abs(growthVal).toFixed(1) + '%';
            badge.className = `growth-badge ${isUp ? 'growth-up' : 'growth-down'}`;
            badge.innerHTML = `<i class="fas fa-arrow-${isUp ? 'up' : 'down'}"></i> ${Math.abs(growthVal).toFixed(1)}%`;
        };
        updateCard('UREA');
        updateCard('NPK');
    };

    const renderRankings = (provData) => {
        // Data provData sekarang hanya berisi data Produk Aktif (Urea ATAU NPK)
        let arr = Object.keys(provData).map(key => {
            return { 
                name: key, 
                real: provData[key].real 
            };
        });

        // Sortir dari Terbesar ke Terkecil
        arr.sort((a,b) => b.real - a.real);

        // Render Top 5
        const listTop5 = document.getElementById('list-top5');
        if (arr.length > 0) {
            listTop5.innerHTML = arr.slice(0, 5).map((item, i) => `
                <div class="rank-item">
                    <div class="rank-left">
                        <div class="rank-num best">${i+1}</div>
                        <div class="rank-name">${item.name}</div>
                    </div>
                    <div class="rank-val val-best">${formatNumber(item.real)}</div>
                </div>
            `).join('');
        } else {
            listTop5.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Tidak ada data</div>';
        }

        // Render Bottom 5
        const listOthers = document.getElementById('list-others');
        if(arr.length > 5) {
            listOthers.innerHTML = arr.slice(-5).reverse().map((item, i) => `
                <div class="rank-item">
                    <div class="rank-left">
                        <div class="rank-num warn">${i+1}</div>
                        <div class="rank-name">${item.name}</div>
                    </div>
                    <div class="rank-val val-warn">${formatNumber(item.real)}</div>
                </div>
            `).join('');
        } else {
            listOthers.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Data kurang untuk ditampilkan</div>';
        }
    };

    const renderNasionalChart = (nasStats) => {
        const ctx = document.getElementById('chartNasional').getContext('2d');
        if(chartNasional) chartNasional.destroy();

        const isUrea = state.activeProduct === 'UREA';
        const data = isUrea ? nasStats.UREA : nasStats.NPK;
        const color = isUrea ? '#fbbf24' : '#38bdf8'; 
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(color, 0.4));
        gradient.addColorStop(1, hexToRgbA(color, 0.0));

        const targetIcon = createDashedCircle('#999'); 

        chartNasional = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'],
                datasets: [
                    {
                        label: 'Realisasi', data: data.real, borderColor: color, backgroundColor: gradient,
                        fill: true, tension: 0.4, borderWidth: 3, pointRadius: 3
                    },
                    {
                        label: 'Target', data: data.target, borderColor: '#666', borderDash: [6, 6],
                        borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0, pointStyle: targetIcon 
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 6 } } },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v >= 1000 ? (v/1000)+' rb' : v } } }
            }
        });
    };

    const renderProvChart = () => {
        const provName = document.getElementById('dropdown-provinsi').value;
        const placeholder = document.getElementById('prov-placeholder');
        const ctx = document.getElementById('chartProvinsi').getContext('2d');
        
        if (!provName) {
            placeholder.style.display = 'flex';
            if(chartProvinsi) chartProvinsi.clear();
            return;
        }
        placeholder.style.display = 'none';

        let mReal = Array(12).fill(0), mTarget = Array(12).fill(0), mStock = Array(12).fill(0);

        state.rawData.forEach(r => {
            if (r.TAHUN !== state.selectedYear || r.PROVINSI !== provName) return;
            let isSectorMatch = (state.sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL');
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            
            if (prodKey !== state.activeProduct) return; // Filter Chart sesuai tombol

            if (r.BULAN >= 0) {
                if (r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN')) mReal[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET')) mTarget[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('STOK') || r.JENIS.includes('STOCK')) mStock[r.BULAN] += r.TONASE;
            }
        });

        if(chartProvinsi) chartProvinsi.destroy();
        const colorMain = state.activeProduct === 'UREA' ? '#fbbf24' : '#38bdf8';
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgbA(colorMain, 0.4));
        gradient.addColorStop(1, hexToRgbA(colorMain, 0.0));
        const targetIcon = createDashedCircle('#999');

        chartProvinsi = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'],
                datasets: [
                    {
                        label: 'Realisasi', data: mReal, borderColor: colorMain, backgroundColor: gradient,
                        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 4
                    },
                    {
                        label: 'Target', data: mTarget, borderColor: '#999', borderDash: [4, 4], 
                        borderWidth: 1, pointRadius: 0, tension: 0.3, pointStyle: targetIcon
                    },
                    {
                        label: 'Stok', data: mStock, borderColor: '#a8a29e', borderDash: [], 
                        showLine: true, borderWidth: 2, pointRadius: 0, fill: false
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 6 } } },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v >= 1000 ? (v/1000)+' rb' : v } } }
            }
        });
    };

    const renderSidebar = () => {
        const sb = document.getElementById('sidebar');
        const main = document.getElementById('main-content');
        if (state.sidebarOpen) {
            sb.classList.remove('closed'); sb.classList.add('show'); main.classList.remove('closed');
        } else {
            sb.classList.add('closed'); sb.classList.remove('show'); main.classList.add('closed');
        }
    };

    return {
        init,
        toggleSidebar: () => { state.sidebarOpen = !state.sidebarOpen; renderSidebar(); },
        setSector: (sec) => {
            state.sector = sec;
            document.getElementById('nav-subsidi').classList.toggle('active', sec === 'SUBSIDI');
            document.getElementById('nav-retail').classList.toggle('active', sec === 'RETAIL');
            document.getElementById('page-title-text').innerText = sec === 'SUBSIDI' ? 'Subsidi' : 'Retail';
            updateDashboard();
            if(window.innerWidth <= 768) { state.sidebarOpen = false; renderSidebar(); }
        },
        changeYear: (val) => { state.selectedYear = parseInt(val); updateDashboard(); },
        setChartProduct: (prod) => {
            state.activeProduct = prod;
            document.getElementById('btn-nas-urea').classList.toggle('active', prod === 'UREA');
            document.getElementById('btn-nas-npk').classList.toggle('active', prod === 'NPK');
            updateDashboard();
        },
        renderProvChart
    };
})();

window.onload = app.init;
