// ── GLOBAL STATE & VARIABLES FOR ADMIN PORTAL ──
let registeredMembers = {};
let bk = {};
let currentActiveAdminTab = 'booking';
let selectedCustomReportDate = null;

const dateList = [];
for (let i = 0; i < 7; i++) {
    const today = new Date();
    today.setDate(today.getDate() + i);
    dateList.push(today);
}

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const st = ["10:00 - 11:00","11:00 - 12:00","12:00 - 13:00","13:00 - 14:00","14:00 - 15:00","15:00 - 16:00","16:00 - 17:00","17:00 - 18:00","18:00 - 19:00","19:00 - 20:00","20:00 - 21:00","21:00 - 22:00"];

function checkAdminLoginSession() {
    const isSessionActive = sessionStorage.getItem('adminActive') === 'true';
    const loginScreen = document.getElementById('admin-login-screen');
    const dashboardScreen = document.getElementById('admin-dashboard-screen');
    
    if (isSessionActive) {
        loginScreen.style.display = 'none';
        dashboardScreen.style.display = 'block';
        return true;
    } else {
        loginScreen.style.display = 'flex';
        dashboardScreen.style.display = 'none';
        return false;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const utamaLink = document.getElementById('logo-utama-link');
    const utamaImg = document.getElementById('logo-utama-img');
    if (window.location.protocol === 'file:') {
        if (utamaLink) utamaLink.setAttribute('href', '../utama/index.html');
        if (utamaImg) utamaImg.setAttribute('src', '../utama/images/pa_logo.png');
    } else {
        if (utamaImg) utamaImg.setAttribute('src', '/images/pa_logo.png');
    }
});
