Chart.defaults.color = '#b3b3b3';
Chart.defaults.borderColor = '#424242';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;

const app = (() => {
    const API_URL = 'https://script.google.com/macros/s/AKfycbzFanoakpPL3NaMh8CqbolDF5wo9iVb6ikIKQavQh15aGJYBCj7rGQdWyE3sMC911wxdA/exec';
    
    let state = {
        rawData: [],
        sector: 'SUBSIDI',      
        activeProduct: 'UREA',  
        selectedYear: new Date().getFullYear(),
        sidebarOpen: true,
        isAdmin: false
    };

    let chartNasional = null;
    let chartProvinsi = null;

    // --- UTILS (Handling ; and ,) ---
    const parseIndoNumber = (str) => {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        let s = str.toString();
        // Hapus titik ribuan, Ganti desimal (;) atau (,) menjadi (.)
        if (s.includes(';')) {
             s = s.replace(/\./g, '').replace(';', '.');
        } else {
             s = s.replace(/\./g, '').replace(',', '.');
        }
        return parseFloat(s) || 0;
    };

    const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num);

    const hexToRgbA = (hex, alpha) => {
        let c; if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){ c= hex.substring(1).split(''); if(c.length== 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; } c= '0x'+c.join(''); return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')'; } return hex;
    }

    // CUSTOM DASHED CIRCLE ICON (UNTUK TARGET)
    const createDashedCircle = (color) => {
        const size = 12; 
        const r = 4.5;   
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        ctx.beginPath();
        ctx.setLineDash([2, 2]); 
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.arc(size/2, size/2, r, 0, 2 * Math.PI);
        ctx.stroke();
        return c;
    };

    const init = () => { fetchData(); checkScreenSize(); };

    const checkScreenSize = () => {
        if(window.innerWidth <= 768) { state.sidebarOpen = false; } 
        else { state.sidebarOpen = true; }
        renderSidebar();
    };

    const fetchData = async () => {
        document.getElementById('loader').style.display = 'flex';
        // Safety Timeout 10s
        setTimeout(() => { if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none'; }, 10000);

        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Format data salah");
            processData(data);
        } catch (err) {
            console.error("Fetch Error:", err);
        } finally {
            if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none';
        }
    };

    const processData = (data) => {
        state.rawData = data.map(row => ({
            TAHUN: parseInt(row.TAHUN) || 0,
            BULAN: normalizeMonth(row.BULAN),
            SEKTOR: String(row.SEKTOR || '').toUpperCase(),
            PRODUK: String(row.PRODUK || '').toUpperCase(),
            JENIS: String(row.JENIS || '').toUpperCase(),
            PROVINSI: toTitleCase(String(row.PROVINSI || '')),
            TONASE: parseIndoNumber(row.TONASE)
        }));

        const years = [...new Set(state.rawData.map(r => r.TAHUN))].sort((a,b) => b-a);
        const yearSel = document.getElementById('year-select');
        if (yearSel) {
            yearSel.innerHTML = '';
            years.forEach(y => {
                let opt = document.createElement('option');
                opt.value = y; opt.text = y;
                if(y === state.selectedYear) opt.selected = true;
                yearSel.appendChild(opt);
            });
            if(!years.includes(state.selectedYear) && years.length > 0) state.selectedYear = years[0];
        }

        updateDashboard(); 
    };

    const populateProvDropdown = (provKeys) => {
        const s = document.getElementById('dropdown-provinsi');
        if(!s) return;
        const prevVal = s.value; 
        s.innerHTML = '';

        const validKeys = provKeys.filter(p => p && p !== 'LAINNYA').sort();

        if(validKeys.length > 0) {
            validKeys.forEach(prov => {
                let opt = document.createElement('option');
                opt.value = prov; opt.innerText = prov;
                s.appendChild(opt);
            });
            if (prevVal && validKeys.includes(prevVal)) { s.value = prevVal; } 
            else { s.value = validKeys[0]; }
        } else {
            let opt = document.createElement('option');
            opt.value = ""; opt.innerText = "Tidak ada data"; s.appendChild(opt);
        }
    };

    const updateDashboard = () => {
        const { rawData, selectedYear, sector, activeProduct } = state;
        let stats = {
            curr: { UREA: {real:0, target:0}, NPK: {real:0, target:0} },
            prev: { UREA: {real:0}, NPK: {real:0} },
            nasional: { 
                UREA: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)}, 
                NPK: {real:Array(12).fill(0), target:Array(12).fill(0), stock:Array(12).fill(0)} 
            },
            provinsi: {} 
        };

        const dropdownProvs = new Set();

        rawData.forEach(r => {
            let isSectorMatch = (sector === 'SUBSIDI') ? 
                (r.SEKTOR.includes('SUBSIDI')) : (r.SEKTOR.includes('RETAIL')); 
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            if (!prodKey) return;

            if(r.TAHUN === selectedYear && prodKey === state.activeProduct) {
                 if(r.PROVINSI && r.PROVINSI !== 'LAINNYA') dropdownProvs.add(r.PROVINSI);
            }

            let isReal = r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN');
            
            // Logika Target (RKO)
            let isTarget = r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET') || r.JENIS.includes('RKO');
            
            // Logika Stok (AKTUAL)
            let isStock = r.JENIS.includes('STOK') || r.JENIS.includes('STOCK') || r.JENIS.includes('AKTUAL');

            if (r.TAHUN === selectedYear) {
                if (isReal) {
                    stats.curr[prodKey].real += r.TONASE;
                    if(r.BULAN >= 0) stats.nasional[prodKey].real[r.BULAN] += r.TONASE;
                    
                    if (prodKey === state.activeProduct) {
                         if (!stats.provinsi[r.PROVINSI]) stats.provinsi[r.PROVINSI] = { real: 0, target: 0 };
                         stats.provinsi[r.PROVINSI].real += r.TONASE;
                    }
                } 
                else if (isTarget) {
                    stats.curr[prodKey].target += r.TONASE;
                    if(r.BULAN >= 0) stats.nasional[prodKey].target[r.BULAN] += r.TONASE;
                    
                    if (prodKey === state.activeProduct) {
                        if (!stats.provinsi[r.PROVINSI]) stats.provinsi[r.PROVINSI] = { real: 0, target: 0 };
                        stats.provinsi[r.PROVINSI].target += r.TONASE;
                    }
                }
                else if (isStock) {
                    if(r.BULAN >= 0) stats.nasional[prodKey].stock[r.BULAN] += r.TONASE;
                }
            }
            if (r.TAHUN === (selectedYear - 1) && isReal) stats.prev[prodKey].real += r.TONASE;
        });

        populateProvDropdown([...dropdownProvs]);
        
        const titleEl = document.getElementById('prov-chart-title');
        if(titleEl) {
            titleEl.innerText = 'Realisasi Provinsi';
            titleEl.style.color = ''; 
        }

        renderKPI(stats);
        renderRankings(stats.provinsi);
        renderNasionalChart(stats.nasional);
        renderProvChart(); 
    };

    const renderKPI = (stats) => {
        const updateCard = (key, data) => {
            const real = data.curr[key].real;
            const target = data.curr[key].target;
            const prev = data.prev[key].real;
            const pct = target > 0 ? (real/target*100) : 0;
            
            const elReal = document.getElementById(`val-${key.toLowerCase()}-real`);
            if(elReal) elReal.innerText = formatNumber(real);
            
            const elTarget = document.getElementById(`val-${key.toLowerCase()}-target`);
            if(elTarget) elTarget.innerText = formatNumber(target);
            
            const elPct = document.getElementById(`val-${key.toLowerCase()}-pct`);
            if(elPct) elPct.innerText = pct.toFixed(1) + '%';
            
            const elProg = document.getElementById(`prog-${key.toLowerCase()}`);
            if(elProg) elProg.style.width = Math.min(pct, 100) + '%';

            let growth = 0; let isUp = true;
            if(prev > 0) { growth = ((real - prev) / prev) * 100; isUp = growth >= 0; } 
            else if (real > 0) growth = 100;

            const elGrowthVal = document.getElementById(`growth-${key.toLowerCase()}-val`);
            if(elGrowthVal) elGrowthVal.innerText = growth.toFixed(1) + '%';
            
            const badge = document.getElementById(`growth-${key.toLowerCase()}-badge`);
            if(badge) {
                badge.className = `growth-badge ${isUp ? 'growth-up' : 'growth-down'}`;
                badge.innerHTML = `<i class="fas fa-arrow-${isUp ? 'up' : 'down'}"></i> ${Math.abs(growth).toFixed(1)}%`;
            }
        };
        updateCard('UREA', stats);
        updateCard('NPK', stats);
    };

    const renderNasionalChart = (nasStats) => {
        const canvas = document.getElementById('chartNasional');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if(chartNasional) chartNasional.destroy();

        const isUrea = state.activeProduct === 'UREA';
        const data = isUrea ? nasStats.UREA : nasStats.NPK;
        const color = isUrea ? '#FFDE00' : '#38bdf8'; 
        
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
                        fill: true, tension: 0.4, borderWidth: 3, 
                        pointRadius: 4, pointHoverRadius: 6, 
                        pointStyle: 'circle',
                        order: 1
                    },
                    {
                        label: 'Target', data: data.target, borderColor: '#666', borderDash: [6, 6],
                        borderWidth: 2, fill: false, tension: 0.4, 
                        pointRadius: 0, 
                        pointStyle: targetIcon,
                        order: 2 
                    },
                    {
                        label: 'Stok', 
                        data: data.stock, 
                        type: 'bar', 
                        backgroundColor: '#616161', 
                        borderColor: '#616161',
                        borderWidth: 0,
                        barPercentage: 0.5,
                        pointStyle: 'rect', 
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: true, labels: { usePointStyle: true, boxWidth: 6, boxHeight: 6, 
                        generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => { 
                            if(l.text === 'Realisasi') l.pointStyle = 'rect';
                            if(l.text === 'Stok') l.pointStyle = 'rect';
                            return l; 
                        })
                    }},
                    tooltip: { 
                        backgroundColor: 'rgba(33, 33, 33, 0.95)', titleColor: '#ececec', bodyColor: '#b3b3b3',
                        borderColor: '#424242', borderWidth: 1, displayColors: false, 
                        callbacks: { label: (c) => c.dataset.label + ': ' + formatNumber(c.raw) }
                    }
                },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v===0?null:(v>=1000?(v/1000)+' rb':v) } } }
            }
        });
    };

    const renderProvChart = () => {
        const provName = document.getElementById('dropdown-provinsi').value;
        const placeholder = document.getElementById('prov-placeholder');
        const canvas = document.getElementById('chartProvinsi');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (!provName) {
            if(placeholder) placeholder.style.display = 'flex';
            if(chartProvinsi) chartProvinsi.clear();
            return;
        }
        if(placeholder) placeholder.style.display = 'none';

        let mReal = Array(12).fill(0);
        let mTarget = Array(12).fill(0);
        let mStock = Array(12).fill(0);

        state.rawData.forEach(r => {
            if (r.TAHUN !== state.selectedYear || r.PROVINSI !== provName) return;
            let isSectorMatch = (state.sector === 'SUBSIDI') ? r.SEKTOR.includes('SUBSIDI') : r.SEKTOR.includes('RETAIL');
            if (!isSectorMatch) return;

            let prodKey = '';
            if (r.PRODUK.includes('UREA') || r.PRODUK.includes('NITREA')) prodKey = 'UREA';
            else if (r.PRODUK.includes('NPK') || r.PRODUK.includes('PHONSKA')) prodKey = 'NPK';
            
            if (prodKey !== state.activeProduct) return;

            if (r.BULAN >= 0) {
                if (r.JENIS.includes('REALISASI') || r.JENIS.includes('PENJUALAN')) mReal[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('RKAP') || r.JENIS.includes('TARGET') || r.JENIS.includes('RKO')) mTarget[r.BULAN] += r.TONASE;
                else if (r.JENIS.includes('STOK') || r.JENIS.includes('STOCK') || r.JENIS.includes('AKTUAL')) mStock[r.BULAN] += r.TONASE;
            }
        });

        if(chartProvinsi) chartProvinsi.destroy();
        const colorMain = state.activeProduct === 'UREA' ? '#FFDE00' : '#38bdf8';
        
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
                        fill: true, tension: 0.4, borderWidth: 3, // Tension disamakan 0.4
                        pointRadius: 4, pointHoverRadius: 6, pointStyle: 'circle',
                        order: 1
                    },
                    {
                        // --- UPDATE TAMPILAN TARGET (RKO) DISAMAKAN DENGAN NASIONAL ---
                        label: 'Target', 
                        data: mTarget, 
                        borderColor: '#666', // Warna disamakan (#666)
                        borderDash: [6, 6],  // Dash disamakan [6, 6]
                        borderWidth: 2,      // Tebal disamakan 2
                        fill: false, 
                        tension: 0.4,        // Tension disamakan 0.4
                        pointRadius: 0, 
                        pointStyle: targetIcon,
                        order: 2
                    },
                    {
                        label: 'Stok', 
                        data: mStock, 
                        type: 'bar', 
                        backgroundColor: '#616161', 
                        borderColor: '#616161', 
                        borderWidth: 0, 
                        barPercentage: 0.5,
                        pointStyle: 'rect', 
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: true, labels: { usePointStyle: true, boxWidth: 6, boxHeight: 6, 
                        generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => { 
                            if(l.text === 'Realisasi') l.pointStyle = 'rect';
                            if(l.text === 'Stok') l.pointStyle = 'rect';
                            return l; 
                        }) 
                    }},
                    tooltip: { backgroundColor: 'rgba(33, 33, 33, 0.95)', titleColor: '#ececec', bodyColor: '#b3b3b3', borderColor: '#424242', borderWidth: 1, displayColors: false, callbacks: { label: (c) => c.dataset.label + ': ' + formatNumber(c.raw) } }
                },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => v===0?null:(v>=1000?(v/1000)+' rb':v) } } }
            }
        });
    };

    const renderRankings = (provData) => {
        let arr = Object.keys(provData).map(key => {
            const item = provData[key];
            let sortVal = 0, displayVal = '';
            if (state.sector === 'SUBSIDI') {
                sortVal = item.target > 0 ? (item.real / item.target) * 100 : 0;
                displayVal = sortVal.toFixed(1) + '%';
            } else {
                sortVal = item.real;
                displayVal = formatNumber(item.real);
            }
            return { name: key, val: sortVal, display: displayVal, rawReal: item.real };
        });

        // PERBAIKAN LOGIKA RANKING
        let activeData = arr.filter(item => item.rawReal > 0);
        activeData.sort((a,b) => b.val - a.val);

        const listBest = document.getElementById('list-top5');
        if(listBest) {
            const top5 = activeData.slice(0, 5);
            if(top5.length === 0) listBest.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Data Kosong</div>';
            else listBest.innerHTML = top5.map((item, i) => {
                let colorClass = ''; let medalIcon = '';
                if(i===0) { colorClass='gold'; medalIcon='<i class="fas fa-medal" style="color:var(--color-gold); font-size:14px;"></i>'; }
                else if(i===1) { colorClass='silver'; medalIcon='<i class="fas fa-medal" style="color:var(--color-silver); font-size:14px;"></i>'; }
                else if(i===2) { colorClass='bronze'; medalIcon='<i class="fas fa-medal" style="color:var(--color-bronze); font-size:14px;"></i>'; }
                
                let numberHtml = medalIcon ? 
                    `<div class="rank-num medal-box">${medalIcon}</div>` : 
                    `<div class="rank-num best">${i+1}</div>`;

                return `
                <div class="rank-item">
                    <div class="rank-left">
                        ${numberHtml}
                        <div class="rank-name ${colorClass}">${item.name}</div>
                    </div>
                    <div class="rank-val val-best">${item.display}</div>
                </div>`;
            }).join('');
        }

        const listWarn = document.getElementById('list-others');
        if(listWarn) {
            // AMBIL SISA SETELAH TOP 5, LALU URUTKAN TERENDAH KE TERTINGGI (ASC) UNTUK WARNING
            const others = activeData.slice(5).sort((a,b) => a.val - b.val).slice(0, 5);
            
            if(others.length === 0) listWarn.innerHTML = '<div style="padding:15px;text-align:center;color:grey;font-size:12px;">Data Kosong</div>';
            else listWarn.innerHTML = others.map((item, i) => `
                <div class="rank-item">
                    <div class="rank-left">
                        <div class="rank-num warn">${i+1}</div>
                        <div class="rank-name">${item.name}</div>
                    </div>
                    <div class="rank-val val-warn">${item.display}</div>
                </div>
            `).join('');
        }
    };

    const normalizeMonth = (str) => { const map = {'JAN':0, 'JANUARI':0, 'FEB':1, 'FEBRUARI':1, 'MAR':2, 'MARET':2, 'APR':3, 'APRIL':3, 'MEI':4, 'MAY':4, 'JUN':5, 'JUNI':5, 'JUL':6, 'JULI':6, 'AGU':7, 'AGUSTUS':7, 'SEP':8, 'SEPTEMBER':8, 'OKT':9, 'OKTOBER':9, 'NOV':10, 'NOVEMBER':10, 'DES':11, 'DESEMBER':11}; return map[String(str).toUpperCase().trim()] ?? -1; };
    const toTitleCase = (str) => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    const renderSidebar = () => {
        const sb = document.getElementById('sidebar');
        const main = document.getElementById('main-content');
        const overlay = document.getElementById('sidebar-overlay');
        if (state.sidebarOpen) {
            sb.classList.remove('closed'); main.classList.remove('closed');
            if(window.innerWidth <= 768) { overlay.classList.add('show'); sb.style.transform = 'translateX(0)'; }
        } else {
            sb.classList.add('closed'); main.classList.add('closed');
            if(window.innerWidth <= 768) { overlay.classList.remove('show'); sb.style.transform = 'translateX(-100%)'; }
        }
        setTimeout(() => { if (chartNasional) chartNasional.resize(); if (chartProvinsi) chartProvinsi.resize(); }, 310);
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
        renderProvChart,
        showLoginModal: () => document.getElementById('loginModal').style.display = 'flex',
        closeLoginModal: () => document.getElementById('loginModal').style.display = 'none',
        login: () => {
            const p = document.getElementById('adminPass').value;
            if(p === 'pso123') {
                state.isAdmin = true;
                document.getElementById('admin-menu').style.display = 'block';
                document.getElementById('admin-banner').style.display = 'block';
                document.getElementById('login-btn-container').style.display = 'none';
                document.getElementById('loginModal').style.display = 'none';
            } else { alert('Password salah!'); }
        },
        logout: () => {
            state.isAdmin = false;
            document.getElementById('admin-menu').style.display = 'none';
            document.getElementById('admin-banner').style.display = 'none';
            document.getElementById('login-btn-container').style.display = 'block';
        }
    };
})();
window.onload = app.init;
