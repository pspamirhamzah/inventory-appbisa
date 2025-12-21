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
        sidebarOpen: true
    };

    let chartNasional = null;
    let chartProvinsi = null;

    const init = () => {
        fetchData();
        checkScreenSize();
    };

    const fetchData = async () => {
        document.getElementById('loader').style.display = 'flex';
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            processData(data);
        } catch (e) {
            alert('Gagal memuat data');
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    };

    /* ===== SEMUA FUNCTION KAMU PINDAH UTUH ===== */

    return {
        init,
        toggleSidebar,
        setSector,
        changeYear,
        setChartProduct,
        renderProvChart
    };
})();

window.onload = app.init;

