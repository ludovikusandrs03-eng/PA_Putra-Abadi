const oneMonthFromNow = new Date();
oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

let registeredMembers = {
    "Angelo": { phone: "08123456789", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Rio": { phone: "08987654321", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Andrew": { phone: "08555554444", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Bryan": { phone: "08777776666", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() }
};

function isUserActiveMember(u) {
    if (!u || !registeredMembers[u]) return false;
    const memberData = registeredMembers[u];
    if (!memberData.isMember) return false;
    if (!memberData.expiryDate) return false;
    return new Date() < new Date(memberData.expiryDate);
}
let loggedInUser = null; 
let isAdminActive = false;

let activeCourt = 1;
let activeDay = 0;
let pickedSlot = null;
let tempName = "";
let tempPhone = "";
let hasUploadedFile = false;
let hasUploadedMemberFile = false;
let currentActiveAdminTab = 'booking';

const dateList = [];
for (let i = 0; i < 7; i++) {
    const today = new Date();
    today.setDate(today.getDate() + i);
    dateList.push(today);
}

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const st = ["10:00 - 11:00","11:00 - 12:00","12:00 - 13:00","13:00 - 14:00","14:00 - 15:00","15:00 - 16:00","16:00 - 17:00","17:00 - 18:00","18:00 - 19:00","19:00 - 20:00","20:00 - 21:00","21:00 - 22:00"];

let bk = {
    1: { 
        [dk(dateList[0])]: { 
            "19:00 - 20:00": { name: "Budi", phone: "081222", status: "confirmed_dp", paid: 50000, total: 100000 }
        } 
    },
    2: { 
        [dk(dateList[0])]: { 
            "18:00 - 19:00": { name: "Angelo", phone: "08123456789", status: "settled", paid: 80000, total: 80000 } 
        } 
    }
};

window.addEventListener('DOMContentLoaded', () => { 
    // Muat data dari backend saat inisialisasi
    Promise.all([
        fetch('http://localhost:5000/api/members').then(res => res.json()),
        fetch('http://localhost:5000/api/bookings').then(res => res.json())
    ])
    .then(([membersData, bookingsData]) => {
        registeredMembers = membersData;
        bk = bookingsData;
        console.log('Data member & booking dimuat dari backend.');
        updatePills(); 
        updateJoinMemberBtn(); 
    })
    .catch(err => {
        console.warn('Backend offline, menggunakan data default lokal:', err);
        updatePills(); 
        updateJoinMemberBtn(); 
    });
});

function updatePills() {
    const k = dk(dateList[0]);
    [1, 2].forEach(cNum => {
        const bookedSlots = bk[cNum] && bk[cNum][k] ? Object.keys(bk[cNum][k]).filter(s => bk[cNum][k][s].status !== 'waiting_dp') : [];
        const bCount = bookedSlots.length;
        const aEl = document.getElementById(`avail-${cNum}`);
        const bEl = document.getElementById(`booked-${cNum}`);
        if (bCount >= st.length) {
            if(aEl) aEl.style.display = 'none'; if(bEl) bEl.style.display = 'inline-flex';
        } else {
            if(aEl) { aEl.style.display = 'inline-flex'; aEl.querySelector('span').textContent = ` ${st.length - bCount} Sesi Kosong`; }
            if(bEl) bEl.style.display = 'none';
        }
    });
}

// TABS ADMIN CONTROL
function switchAdminTab(tabName) {
    currentActiveAdminTab = tabName;
    
    // Atur status aktif pada link navigasi bar atas khusus admin
    document.querySelectorAll('#main-nav-links a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`#main-nav-links a[data-tab="${tabName}"]`);
    if(activeLink) activeLink.classList.add('active');

    // Toggle visibilitas panel konten dasbor
    document.querySelectorAll('.admin-panel').forEach(panel => panel.style.display = 'none');
    document.getElementById(`panel-${tabName}`).style.display = 'block';
    
    if(tabName === 'booking') renderAdminDashboard();
    if(tabName === 'schedule') {
        populateScheduleDates();
        renderAdminSchedule();
    }
    if(tabName === 'member') renderAdminMembers();
    if(tabName === 'report') renderAdminReports();
}

// Fungsi bantu pemicu tab dari klik nav menu atas
function handleAdminNavClick(e, tabName) {
    e.preventDefault();
    switchAdminTab(tabName);
}

function navigateToUserSection(element) {
    if(isAdminActive) return; 
    document.querySelectorAll('#main-nav-links a').forEach(a => a.classList.remove('active'));
    element.classList.add('active');
}

// LOGIN SYSTEM
function openAdminLoginModal(e) {
    if(e) e.preventDefault();
    document.getElementById('member-modal').classList.add('open');
    switchMemberView('admin-login');
}

function loginAdminProcess() {
    const u = document.getElementById('admin-log-username').value.trim();
    const p = document.getElementById('admin-log-password').value;
    if(!u || !p){ alert('Isi semua kolom!'); return; }
    
    if (u === "admin" && p === "admin123") {
        isAdminActive = true;
        document.getElementById('member-status-text').textContent = "ADMIN";
        document.getElementById('nav-member-btn').style.background = '#333'; 
        
        const navLinksContainer = document.getElementById('main-nav-links');
        navLinksContainer.innerHTML = `
            <a href="#" data-tab="booking" class="active" onclick="handleAdminNavClick(event, 'booking')">Reservasi</a>
            <a href="#" data-tab="schedule" onclick="handleAdminNavClick(event, 'schedule')">Jadwal</a>
            <a href="#" data-tab="member" onclick="handleAdminNavClick(event, 'member')">Membership</a>
            <a href="#" data-tab="report" onclick="handleAdminNavClick(event, 'report')">Laporan</a>
        `;

        document.getElementById('user-page-content').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
        switchAdminTab('booking');
        closeMemberModal();
        
        document.getElementById('admin-log-username').value = '';
        document.getElementById('admin-log-password').value = '';
    } else {
        alert('Kredensial Admin salah!');
    }
}

function loginMemberProcess() {
    const u = document.getElementById('log-username').value.trim();
    const p = document.getElementById('log-password').value;
    if(!u || !p){ alert('Isi semua kolom!'); return; }

    if(registeredMembers[u] && registeredMembers[u].password === p) {
        loggedInUser = u; isAdminActive = false;
        document.getElementById('member-status-text').textContent = u;
        if (isUserActiveMember(u)) {
            document.getElementById('nav-member-btn').style.background = '#16a34a';
        } else {
            document.getElementById('nav-member-btn').style.background = 'var(--red)';
        }
        updateJoinMemberBtn();
        switchMemberView('choice'); closeMemberModal();
        if (pickedSlot) {
            openModal(activeCourt, true);
            processToPayment();
        }
    } else { alert('Kredensial salah!'); }
}

function logoutAdmin(e) {
    if(e) e.preventDefault();
    isAdminActive = false;
    document.getElementById('member-status-text').textContent = "Login";
    document.getElementById('nav-member-btn').style.background = 'var(--red)';
    
    const navLinksContainer = document.getElementById('main-nav-links');
    navLinksContainer.innerHTML = `
        <a href="#" class="active" onclick="navigateToUserSection(this)">Home</a>
        <a href="#courts" onclick="navigateToUserSection(this)">Booking</a>
        <a href="#features" onclick="navigateToUserSection(this)">Membership</a>
    `;

    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('user-page-content').style.display = 'block';
    updatePills();
    updateJoinMemberBtn();
    closeMemberModal();
}

// --- DASHBOARD ADMIN: BOOKING ---
function renderAdminDashboard() {
    const tbody = document.getElementById('admin-booking-table-body');
    tbody.innerHTML = '';
    let c = 0, s = 0;

    for (const courtId in bk) {
        for (const dateKey in bk[courtId]) {
            for (const slotKey in bk[courtId][dateKey]) {
                const order = bk[courtId][dateKey][slotKey];
                if (!order) continue;

                if (order.status === 'waiting_dp') continue;
                if (order.status === 'confirmed_dp') c++;
                if (order.status === 'settled') s++;

                let stLabel = '';
                if(order.status === 'confirmed_dp') stLabel = 'Sudah DP';
                else stLabel = 'Lunas';

                const infoButton = `<button class="btn-cek-info" onclick="openBookingDetail(${courtId}, '${dateKey}', '${slotKey}')">CEK</button>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${dateKey}</td>
                    <td>Lap 0${courtId}</td>
                    <td>${slotKey}</td>
                    <td>${order.name} <span style="color:#666; margin-left:6px; font-size:11px;">(${order.phone})</span></td>
                    <td>${stLabel}</td>
                    <td style="text-align:center;">${infoButton}</td>
                `;
                tbody.appendChild(tr);
            }
        }
    }
    const countWaitingElement = document.getElementById('count-waiting-dp');
    if (countWaitingElement) countWaitingElement.textContent = '0';
    document.getElementById('count-confirmed-dp').textContent = c;
    document.getElementById('count-settled').textContent = s;
}

function openBookingDetail(courtId, dateKey, slotKey) {
    const order = bk[courtId][dateKey][slotKey];
    let statusText = '';
    let actionButtons = '';

    if (order.status === 'waiting_dp') {
        statusText = '<span style="color:#eab308; font-weight:bold;">Menunggu DP</span>';
        actionButtons = '';
    } else if (order.status === 'confirmed_dp') {
        statusText = '<span style="color:#3b82f6; font-weight:bold;">Sudah Diterima (DP)</span>';
        actionButtons = `
            <button class="btn-confirm" style="margin-bottom: 10px;" onclick="openSettlePrompt(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-coin"></i> Lunasi Lapangan</button>
            <button class="btn-outline" style="width: 100%;" onclick="updateBookingTimePrompt(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-edit"></i> Ubah Jam Main</button>
        `;
    } else {
        statusText = '<span style="color:#4ade80; font-weight:bold;">Lunas & Selesai</span>';
        actionButtons = `
            <button class="btn-outline" style="width: 100%; border-color: #f87171; color: #f87171;" onclick="closeAdminActionModal(); rejectBooking(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-trash"></i> Hapus Riwayat</button>
        `;
    }

    let adminControlHTML = '';
    if (actionButtons) {
        adminControlHTML = `
            <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
                <div style="font-family:'Barlow Condensed'; font-size:14px; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; color:var(--text-muted);">Kontrol Admin</div>
                ${actionButtons}
            </div>
        `;
    }

    document.getElementById('adm-modal-title').textContent = "Detail Informasi Reservasi";
    document.getElementById('admin-action-modal').classList.add('open');

    document.getElementById('adm-modal-body').innerHTML = `
        <div style="background: #111; padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px; font-size: 13px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Nama Pemesan</span>
                <strong style="color:#fff;">${order.name}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">No. WhatsApp</span>
                <strong style="color:#fff;">${order.phone}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Jadwal Main</span>
                <strong style="color:#fff;">${dateKey} | Pukul ${slotKey}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Lapangan</span>
                <strong style="color:#fff;">Lapangan 0${courtId}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:10px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                <span style="color:#aaa;">Status Saat Ini</span>
                ${statusText}
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Total Tarif</span>
                <strong style="color:#fff;">Rp ${order.total.toLocaleString('id-ID')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Sudah Dibayar (DP)</span>
                <strong style="color:#4ade80;">Rp ${order.paid.toLocaleString('id-ID')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; color: #f87171; font-size: 15px;">
                <span>Sisa Tagihan</span>
                <strong>Rp ${(order.total - order.paid).toLocaleString('id-ID')}</strong>
            </div>
        </div>
        
        ${adminControlHTML}
    `;
}


function openSettlePrompt(courtId, dateKey, slotKey) {
    const order = bk[courtId][dateKey][slotKey];
    document.getElementById('adm-modal-title').textContent = "Pelunasan Lapangan";
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-body').innerHTML = `
        <p style="font-size:13px; margin-bottom:12px;">Sisa Tagihan: <strong>Rp ${(order.total - order.paid).toLocaleString()}</strong></p>
        <div class="bform-group" style="margin-bottom:15px;">
            <button class="btn-admin-action-solid" style="background:#222; border:1px dashed #444; color:#fff;" onclick="alert('Simulasi kamera aktif')">📸 Ambil Foto Nota Pelunasan</button>
        </div>
        <button class="btn-confirm" style="margin:0;" onclick="executeSettle(${courtId}, '${dateKey}', '${slotKey}')">Simpan Pelunasan</button>
    `;
}

function executeSettle(courtId, dateKey, slotKey) {
    bk[courtId][dateKey][slotKey].status = 'settled';
    bk[courtId][dateKey][slotKey].paid = bk[courtId][dateKey][slotKey].total;
    syncBookingsToBackend();
    closeAdminActionModal(); renderAdminDashboard();
}

function updateBookingTimePrompt(courtId, dateKey, slotKey) {
    document.getElementById('adm-modal-title').textContent = "Ubah Jam Operasional";
    document.getElementById('admin-action-modal').classList.add('open');
    let opts = ''; st.forEach(t => opts += `<option value="${t}" ${t===slotKey?'selected':''}>${t}</option>`);
    document.getElementById('adm-modal-body').innerHTML = `
        <select id="adm-reschedule-select" class="bform-input" style="width:100%; background:#222; margin-bottom:15px;">${opts}</select>
        <button class="btn-confirm" style="margin:0;" onclick="executeReschedule(${courtId}, '${dateKey}', '${slotKey}')">Simpan Jadwal Baru</button>
    `;
}

function executeReschedule(courtId, dateKey, oldSlot) {
    const newSlot = document.getElementById('adm-reschedule-select').value;
    if(bk[courtId][dateKey][newSlot]) { alert('Jam sudah penuh!'); return; }
    bk[courtId][dateKey][newSlot] = bk[courtId][dateKey][oldSlot];
    delete bk[courtId][dateKey][oldSlot];
    syncBookingsToBackend();
    closeAdminActionModal(); renderAdminDashboard();
}

function rejectBooking(courtId, dateKey, slotKey) {
    if(confirm('Hapus atau batalkan reservasi sesi ini?')) { 
        delete bk[courtId][dateKey][slotKey]; 
        syncBookingsToBackend();
        renderAdminDashboard(); 
    }
}

function closeAdminActionModal() { document.getElementById('admin-action-modal').classList.remove('open'); }

// --- DASHBOARD ADMIN: MEMBERSHIP ---
function renderAdminMembers() {
    const tbody = document.getElementById('admin-member-table-body'); 
    tbody.innerHTML = '';
    
    for (const username in registeredMembers) {
        if (!registeredMembers[username].isMember) continue;
        
        const tr = document.createElement('tr');
        const infoButton = `<button class="btn-cek-info" onclick="openMemberDetail('${username}')">CEK</button>`;
        
        tr.innerHTML = `
            <td><strong>${username}</strong></td>
            <td>${registeredMembers[username].phone}</td>
            <td style="text-align:center;">${infoButton}</td>
        `;
        tbody.appendChild(tr);
    }
}

function openMemberDetail(username) {
    const user = registeredMembers[username];
    
    document.getElementById('adm-modal-title').textContent = "Detail Data Member";
    document.getElementById('admin-action-modal').classList.add('open');

    document.getElementById('adm-modal-body').innerHTML = `
        <div style="background: #111; padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px; font-size: 13px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Nama Pengguna</span>
                <strong style="color:#fff;">${username}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">No. WhatsApp</span>
                <strong style="color:#fff;">${user.phone}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 10px;">
                <span style="color:#aaa;">Status Keanggotaan</span>
                <strong style="color:#4ade80;">Aktif</strong>
            </div>
        </div>
        
        <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
            <div style="font-family:'Barlow Condensed'; font-size:14px; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; color:var(--text-muted);">Kontrol Admin</div>
            <button class="btn-confirm" style="margin-bottom: 10px; background: #3b82f6;" onclick="openEditMemberForm('${username}')"><i class="ti ti-edit"></i> Edit Data Member</button>
            <button class="btn-outline" style="width: 100%; border-color: #f87171; color: #f87171;" onclick="closeAdminActionModal(); deleteMember('${username}')"><i class="ti ti-trash"></i> Hapus Member</button>
        </div>
    `;
}

// FUNGSI BARU: Render Form Edit Member di dalam Modal
function openEditMemberForm(username) {
    const user = registeredMembers[username];
    
    // Ubah judul modal
    document.getElementById('adm-modal-title').textContent = "Edit Data Member";

    // Suntikkan form HTML ke dalam body modal
    document.getElementById('adm-modal-body').innerHTML = `
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Nama Pengguna (Tetap)</label>
            <input class="bform-input" style="background: #222; color: #888; cursor: not-allowed;" type="text" value="${username}" disabled />
            <small style="color: #666; font-size: 10px;">*Username tidak dapat diubah untuk menjaga integritas data.</small>
        </div>
        <div class="bform-group" style="margin-bottom: 15px;">
            <label class="bform-label" style="color: #aaa;">No. WhatsApp Baru</label>
            <input class="bform-input" id="edit-member-phone" type="text" value="${user.phone}" placeholder="08xx-xxxx-xxxx" />
        </div>
        <div class="bform-group" style="margin-bottom: 25px;">
            <label class="bform-label" style="color: #aaa;">Kata Sandi Baru</label>
            <input class="bform-input" id="edit-member-password" type="password" placeholder="Isi jika ingin ganti password..." />
            <small style="color: #666; font-size: 10px;">*Kosongkan jika kata sandi tidak ingin diubah.</small>
        </div>

        <div style="display: flex; gap: 10px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
            <button class="btn-outline" style="flex: 1; padding: 10px;" onclick="openMemberDetail('${username}')">Batal</button>
            <button class="btn-confirm" style="margin-top: 0; flex: 1; background: #3b82f6;" onclick="saveMemberEdit('${username}')"><i class="ti ti-device-floppy"></i> Simpan</button>
        </div>
    `;
}

// FUNGSI BARU: Menyimpan hasil input dari Form Edit
function saveMemberEdit(username) {
    const newPhone = document.getElementById('edit-member-phone').value.trim();
    const newPassword = document.getElementById('edit-member-password').value;

    if (!newPhone) {
        alert("Nomor WhatsApp tidak boleh kosong!");
        return;
    }

    // Update nomor WA
    registeredMembers[username].phone = newPhone;
    
    // Update kata sandi HANYA jika form diisi (tidak kosong)
    if (newPassword.trim() !== "") {
        registeredMembers[username].password = newPassword;
    }

    syncMembersToBackend();
    // Render ulang tabel di background
    renderAdminMembers();

    // Kembalikan modal ke tampilan Detail Informasi
    openMemberDetail(username);
}

function openAddMemberPrompt() {
    const n = prompt("Nama Member Baru:"); if(!n) return;
    const ph = prompt("No WhatsApp:"); const ps = prompt("Buat Password:");
    if(!ph || !ps) return; 
    registeredMembers[n] = { phone: ph, password: ps }; 
    syncMembersToBackend();
    renderAdminMembers();
}

function deleteMember(user) {
    if(confirm(`Hapus akun member ${user} dari sistem?`)) { 
        delete registeredMembers[user]; 
        syncMembersToBackend();
        renderAdminMembers(); 
    }
}

// --- DASHBOARD ADMIN: LAPORAN ---
let selectedCustomReportDate = "";

function triggerReportDatePicker() {
    const picker = document.getElementById('report-date-picker');
    if (picker) {
        if (typeof picker.showPicker === 'function') {
            picker.showPicker();
        } else {
            picker.click();
        }
    }
}

function handleReportDatePickerChange(value) {
    if (value) {
        selectedCustomReportDate = value;
        const select = document.getElementById('report-time-filter');
        let customOpt = document.getElementById('report-temp-custom-option');
        if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.id = 'report-temp-custom-option';
            customOpt.value = 'custom';
            select.appendChild(customOpt);
        }
        const dateParts = value.split('-');
        const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        customOpt.textContent = `Tanggal: ${formattedDate}`;
        customOpt.selected = true;
        
        renderAdminReports();
    }
}

function handleReportFilterChange() {
    const filter = document.getElementById('report-time-filter').value;
    if (filter !== 'custom') {
        const customOpt = document.getElementById('report-temp-custom-option');
        if (customOpt) {
            customOpt.remove();
        }
        document.getElementById('report-date-picker').value = '';
        selectedCustomReportDate = '';
    }
    renderAdminReports();
}

function renderAdminReports() {
    const tbody = document.getElementById('admin-report-table-body'); 
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filter = document.getElementById('report-time-filter') ? document.getElementById('report-time-filter').value : 'all';
    let collected = 0, debt = 0;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    function isSameWeek(d1, d2) {
        const oneDay = 24 * 60 * 60 * 1000;
        const day1 = d1.getDay() === 0 ? 7 : d1.getDay();
        const mon1 = new Date(d1.getTime() - (day1 - 1) * oneDay);
        mon1.setHours(0,0,0,0);
        const day2 = d2.getDay() === 0 ? 7 : d2.getDay();
        const mon2 = new Date(d2.getTime() - (day2 - 1) * oneDay);
        mon2.setHours(0,0,0,0);
        return mon1.getTime() === mon2.getTime();
    }
    
    for (const courtId in bk) {
        for (const dateKey in bk[courtId]) {
            const dateParts = dateKey.split('-');
            const bDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            bDate.setHours(0,0,0,0);
            
            let match = true;
            if (filter === 'daily') {
                match = (bDate.getTime() === today.getTime());
            } else if (filter === 'weekly') {
                match = isSameWeek(bDate, today);
            } else if (filter === 'monthly') {
                match = (bDate.getMonth() === today.getMonth() && bDate.getFullYear() === today.getFullYear());
            } else if (filter === 'yearly') {
                match = (bDate.getFullYear() === today.getFullYear());
            } else if (filter === 'custom') {
                match = selectedCustomReportDate ? (dateKey === selectedCustomReportDate) : false;
            }
            
            if (!match) continue;
            
            for (const slotKey in bk[courtId][dateKey]) {
                const order = bk[courtId][dateKey][slotKey]; if (!order) continue;
                collected += order.paid; debt += (order.total - order.paid);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${dateKey}</td>
                    <td>Lap 0${courtId} (${slotKey})</td>
                    <td>${order.name}</td>
                    <td>Rp ${order.total.toLocaleString()}</td>
                    <td>Rp ${order.paid.toLocaleString()}</td>
                    <td>${order.status.toUpperCase()}</td>
                `;
                tbody.appendChild(tr);
            }
        }
    }
    document.getElementById('report-total-revenue').textContent = `Rp ${collected.toLocaleString('id-ID')}`;
    document.getElementById('report-remaining-pip').textContent = `Rp ${debt.toLocaleString('id-ID')}`;
}

function exportReportToExcel() {
    const filter = document.getElementById('report-time-filter') ? document.getElementById('report-time-filter').value : 'all';
    let csv = "data:text/csv;charset=utf-8,Tanggal,Lapangan,Penyewa,Tarif,Terbayar,Status\n";
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    function isSameWeek(d1, d2) {
        const oneDay = 24 * 60 * 60 * 1000;
        const day1 = d1.getDay() === 0 ? 7 : d1.getDay();
        const mon1 = new Date(d1.getTime() - (day1 - 1) * oneDay);
        mon1.setHours(0,0,0,0);
        const day2 = d2.getDay() === 0 ? 7 : d2.getDay();
        const mon2 = new Date(d2.getTime() - (day2 - 1) * oneDay);
        mon2.setHours(0,0,0,0);
        return mon1.getTime() === mon2.getTime();
    }
    
    for (const courtId in bk) {
        for (const dateKey in bk[courtId]) {
            const dateParts = dateKey.split('-');
            const bDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            bDate.setHours(0,0,0,0);
            
            let match = true;
            if (filter === 'daily') {
                match = (bDate.getTime() === today.getTime());
            } else if (filter === 'weekly') {
                match = isSameWeek(bDate, today);
            } else if (filter === 'monthly') {
                match = (bDate.getMonth() === today.getMonth() && bDate.getFullYear() === today.getFullYear());
            } else if (filter === 'yearly') {
                match = (bDate.getFullYear() === today.getFullYear());
            } else if (filter === 'custom') {
                match = selectedCustomReportDate ? (dateKey === selectedCustomReportDate) : false;
            }
            
            if (!match) continue;
            
            for (const slotKey in bk[courtId][dateKey]) {
                const order = bk[courtId][dateKey][slotKey]; if (!order) continue;
                csv += `${dateKey},Lap 0${courtId} (${slotKey}),${order.name},${order.total},${order.paid},${order.status}\n`;
            }
        }
    }
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `Laporan_Pendapatan_${filter}.csv`); document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
}

// --- USER MEMBERSHIP FUNCTIONS ---
function openMemberModal() {
    document.getElementById('member-modal').classList.add('open');
    if (loggedInUser || isAdminActive) {
        switchMemberView('choice');
    } else {
        switchMemberView('login');
    }
}
function closeMemberModal() { document.getElementById('member-modal').classList.remove('open'); }
function closeMemberModalOutside(e) { if (e.target.id === 'member-modal') closeMemberModal(); }

function switchMemberView(view) {
    document.getElementById('member-choice-screen').style.display = (view === 'choice') ? 'block' : 'none';
    document.getElementById('member-login-form').style.display = (view === 'login') ? 'block' : 'none';
    document.getElementById('member-register-form').style.display = (view === 'register') ? 'block' : 'none';
    document.getElementById('admin-login-form').style.display = (view === 'admin-login') ? 'block' : 'none';
    document.getElementById('member-upgrade-form').style.display = (view === 'upgrade') ? 'block' : 'none';
    document.getElementById('member-edit-profile-form').style.display = (view === 'edit-profile') ? 'block' : 'none';
    if(view === 'choice') {
        const guestBox = document.getElementById('guest-choice-box');
        const loggedBox = document.getElementById('logged-in-box');
        if(loggedInUser || isAdminActive) {
            guestBox.style.display = 'none';
            loggedBox.style.display = 'block';
            if (isAdminActive) {
                document.getElementById('logged-in-box-title').textContent = '✓ Anda sedang login sebagai Admin';
                document.getElementById('logged-member-info').innerHTML = '';
                document.getElementById('modal-member-action-btn').style.display = 'none';
                if(document.getElementById('modal-edit-profile-btn')) document.getElementById('modal-edit-profile-btn').style.display = 'none';
            } else {
                const isMem = isUserActiveMember(loggedInUser);
                document.getElementById('logged-in-box-title').textContent = isMem ? '✓ Anda sedang login sebagai Member' : '✓ Anda sedang login sebagai User';
                
                let infoHTML = `Username: ${loggedInUser}`;
                if (isMem) {
                    const exp = new Date(registeredMembers[loggedInUser].expiryDate);
                    const formattedDate = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
                    infoHTML += `<br><span style="color: #4ade80; font-size: 12px;">Aktif s.d. ${formattedDate}</span>`;
                    document.getElementById('modal-member-action-btn').textContent = 'Perpanjang Membership';
                } else {
                    infoHTML += `<br><span style="color: var(--text-muted); font-size: 12px;">Akun biasa (non-member)</span>`;
                    document.getElementById('modal-member-action-btn').textContent = 'Daftar Member Sekarang';
                }
                
                document.getElementById('logged-member-info').innerHTML = infoHTML;
                document.getElementById('modal-member-action-btn').style.display = 'block';
                if(document.getElementById('modal-edit-profile-btn')) document.getElementById('modal-edit-profile-btn').style.display = 'block';
            }
        } else {
            guestBox.style.display = 'block';
            loggedBox.style.display = 'none';
        }
    }
}

function openEditProfileForm() {
    if (!loggedInUser || !registeredMembers[loggedInUser]) return;
    const user = registeredMembers[loggedInUser];
    document.getElementById('edit-name').value = loggedInUser;
    document.getElementById('edit-phone').value = user.phone;
    document.getElementById('edit-password').value = user.password;
    switchMemberView('edit-profile');
}

function saveProfileChanges() {
    const oldName = loggedInUser;
    const newName = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const password = document.getElementById('edit-password').value;

    if (!newName || !phone || !password) {
        alert('Lengkapi semua isian!');
        return;
    }

    if (newName !== oldName && registeredMembers[newName]) {
        alert('Username sudah terpakai!');
        return;
    }

    const updatedUser = {
        phone: phone,
        password: password,
        isMember: registeredMembers[oldName].isMember,
        expiryDate: registeredMembers[oldName].expiryDate
    };

    if (newName !== oldName) {
        delete registeredMembers[oldName];
    }
    registeredMembers[newName] = updatedUser;
    loggedInUser = newName;

    // Sync changes to backend
    syncMembersToBackend();

    // Update status text on header
    document.getElementById('member-status-text').textContent = newName;

    // Refresh UI
    updateJoinMemberBtn();
    switchMemberView('choice');
    alert('Profil berhasil diperbarui!');
}

function triggerMemberFileInput() { document.getElementById('m-inp-file').click(); }
function handleMemberFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('m-upload-icon').style.display = 'none';
            document.getElementById('m-upload-text').style.display = 'none';
            const prev = document.getElementById('m-preview-img');
            prev.src = event.target.result; prev.style.display = 'block';
            hasUploadedMemberFile = true;
        }
        reader.readAsDataURL(file);
    }
}

function registerMemberProcess() {
    const n = document.getElementById('reg-name').value.trim();
    const ph = document.getElementById('reg-phone').value.trim();
    const pass = document.getElementById('reg-password').value;
    if(!n || !ph || !pass){ alert('Lengkapi form!'); return; }
    registeredMembers[n] = { phone: ph, password: pass, isMember: false };
    syncMembersToBackend();
    
    alert('Pembuatan akun berhasil! Silakan login menggunakan akun Anda.');
    
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-password').value = '';
    
    switchMemberView('login');
}

// FUNGSI LOGOUT MEMBER (PENGGUNA)
function logoutMember() {
    if (isAdminActive) {
        logoutAdmin();
        return;
    }
    loggedInUser = null; document.getElementById('member-status-text').textContent = "Login";
    document.getElementById('nav-member-btn').style.background = 'var(--red)';
    updateJoinMemberBtn();
    closeMemberModal();
}

// --- BOOKING MODAL FUNCTIONS ---
function openModal(courtId, preserveSlot = false) {
    activeCourt = courtId;
    if (!preserveSlot) {
        pickedSlot = null;
        activeDay = 0;
        resetPaymentState();
    }
    document.getElementById('modal-num').textContent = String(courtId).padStart(2, '0');
    if(courtId === 1) {
        document.getElementById('modal-name').textContent = "Lapangan Basket 1";
        document.getElementById('modal-sub').textContent = "Indoor · Lantai Kayu";
    } else {
        document.getElementById('modal-name').textContent = "Lapangan Basket 2";
        document.getElementById('modal-sub').textContent = "Indoor · Lantai Vinyl Biru";
    }
    const mAlert = document.getElementById('booking-member-alert');
    if(loggedInUser && registeredMembers[loggedInUser]?.isMember) {
        mAlert.style.display = 'block';
    } else {
        mAlert.style.display = 'none';
    }
    
    if(loggedInUser) {
        document.getElementById('inp-name').value = loggedInUser;
        document.getElementById('inp-phone').value = registeredMembers[loggedInUser].phone;
    } else { 
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-phone').value = '';
    }
    
    if (pickedSlot) {
        document.getElementById('identity-section').style.display = 'block';
    } else {
        document.getElementById('identity-section').style.display = 'none';
    }
    
    document.getElementById('modal').classList.add('open');
    updateDays(); updateSlots();
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }
function closeModalOutside(e) { if(e.target.id === 'modal') closeModal(); }

function updateDays() {
    const container = document.getElementById('days-container'); container.innerHTML = '';
    dateList.forEach((d, idx) => {
        const pill = document.createElement('div'); pill.className = `day-pill ${idx === activeDay ? 'active' : ''}`;
        const daysName = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        pill.innerHTML = `<span class="day-name">${daysName[d.getDay()]}</span><span class="day-date">${d.getDate()}</span>`;
        pill.onclick = () => { activeDay = idx; pickedSlot = null; resetPaymentState(); updateDays(); updateSlots(); };
        container.appendChild(pill);
    });
}

document.getElementById('log-username').addEventListener('keypress', function(e) { if (e.key === 'Enter') loginMemberProcess(); });
document.getElementById('log-password').addEventListener('keypress', function(e) { if (e.key === 'Enter') loginMemberProcess(); });

function updateSlots() {
    const grid = document.getElementById('slots-grid'); grid.innerHTML = '';
    const k = dk(dateList[activeDay]); const courtBk = bk[activeCourt] && bk[activeCourt][k] ? bk[activeCourt][k] : {};
    st.forEach(slot => {
        const card = document.createElement('div'); card.className = 'slot-card'; const order = courtBk[slot];
        if (order && order.status !== 'waiting_dp') {
            card.classList.add('disabled');
            card.innerHTML = `<span class="slot-time">${slot}</span><span class="slot-status status-booked">Penuh</span>`;
        } else {
            if (pickedSlot === slot) card.classList.add('active');
            card.innerHTML = `<span class="slot-time">${slot}</span><span class="slot-status status-avail">${order ? 'Pending' : 'Tersedia'}</span>`;
            card.onclick = () => {
                if (pickedSlot === slot) { pickedSlot = null; document.getElementById('identity-section').style.display = 'none'; }
                else { pickedSlot = slot; document.getElementById('identity-section').style.display = 'block'; }
                updateSlots(); resetPaymentState();
            };
        }
        grid.appendChild(card);
    });
}

function processToPayment() {
    if (!loggedInUser) {
        alert('Anda harus login terlebih dahulu untuk melakukan booking lapangan.');
        closeModal();
        openMemberModal();
        switchMemberView('login');
        return;
    }
    const nameInp = document.getElementById('inp-name').value.trim();
    const phoneInp = document.getElementById('inp-phone').value.trim();
    if(!nameInp || !phoneInp) { alert('Isi data diri!'); return; }
    tempName = nameInp; tempPhone = phoneInp;
    const finalPrice = isUserActiveMember(loggedInUser) ? 80000 : 100000;
    document.getElementById('sum-court-name').textContent = `Lapangan 0${activeCourt}`;
    document.getElementById('sum-price-base').textContent = `Rp ${finalPrice.toLocaleString()}`;
    document.getElementById('sum-total').textContent = `Rp ${(finalPrice - 50000).toLocaleString()}`;
    const daysName = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    document.getElementById('sum-time').textContent = `${daysName[dateList[activeDay].getDay()]}, ${dateList[activeDay].getDate()}/${dateList[activeDay].getMonth()+1}`;
    document.getElementById('payment-section').style.display = 'block';
}

function triggerFileInput() { document.getElementById('inp-file').click(); }
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('upload-icon').style.display = 'none';
            document.getElementById('upload-text').style.display = 'none';
            const pImg = document.getElementById('preview-img');
            pImg.src = event.target.result; pImg.style.display = 'block';
            hasUploadedFile = true;
        }
        reader.readAsDataURL(file);
    }
}

function resetPaymentState(){
    const paymentSection = document.getElementById('payment-section');
    if (paymentSection) paymentSection.style.display = 'none';
    
    const inpFile = document.getElementById('inp-file');
    if (inpFile) inpFile.value = '';
    
    const uploadIcon = document.getElementById('upload-icon');
    if (uploadIcon) uploadIcon.style.display = 'block';
    
    const uploadText = document.getElementById('upload-text');
    if (uploadText) uploadText.style.display = 'block';
    
    const previewImg = document.getElementById('preview-img');
    if (previewImg) previewImg.style.display = 'none';
    
    hasUploadedFile = false;
}

function finalizeBooking(){
    if(!hasUploadedFile && !window.bypassUpload){ alert('Upload bukti transfer DP!'); return; }
    const k = dk(dateList[activeDay]); if(!bk[activeCourt][k]) bk[activeCourt][k] = {};
    const finalPrice = isUserActiveMember(loggedInUser) ? 80000 : 100000;
    bk[activeCourt][k][pickedSlot] = { name: tempName, phone: tempPhone, status: "waiting_dp", paid: 0, total: finalPrice };
    
    // Kirim notifikasi WhatsApp sukses booking
    sendWhatsappBookingNotification(tempPhone, tempName, activeCourt, k, pickedSlot, finalPrice);
    
    closeModal(); updatePills(); alert('Request booking terkirim!');
}

function joinMemberClick() {
    openMemberModal();
    switchMemberView('upgrade');
}

function updateJoinMemberBtn() {
    const btn = document.getElementById('join-member-btn');
    if (!btn) return;
    if (loggedInUser && !isAdminActive) {
        btn.style.display = 'inline-flex';
        const isMem = isUserActiveMember(loggedInUser);
        btn.innerHTML = `<i class="ti ti-id-badge"></i> ` + (isMem ? 'Perpanjang Membership' : 'Join Member Sekarang');
    } else {
        btn.style.display = 'none';
    }
}

function triggerMemberFileInput() { document.getElementById('m-inp-file').click(); }
function handleMemberFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('m-upload-icon').style.display = 'none';
            document.getElementById('m-upload-text').style.display = 'none';
            const prev = document.getElementById('m-preview-img');
            prev.src = event.target.result; prev.style.display = 'block';
            hasUploadedMemberFile = true;
        }
        reader.readAsDataURL(file);
    }
}

function upgradeToMemberProcess() {
    const u = loggedInUser;
    if (!u || !registeredMembers[u]) return;
    
    const currentExpiry = registeredMembers[u].expiryDate;
    const now = new Date();
    let newExpiry;
    
    if (registeredMembers[u].isMember && currentExpiry && new Date(currentExpiry) > now) {
        newExpiry = new Date(currentExpiry);
        newExpiry.setMonth(newExpiry.getMonth() + 1);
        alert('Membership berhasil diperpanjang selama 1 bulan!');
    } else {
        newExpiry = new Date();
        newExpiry.setMonth(newExpiry.getMonth() + 1);
        alert('Pendaftaran member berhasil! Status member aktif selama 1 bulan.');
    }
    
    registeredMembers[u].isMember = true;
    registeredMembers[u].expiryDate = newExpiry.toISOString();
    
    hasUploadedMemberFile = false;
    document.getElementById('m-upload-icon').style.display = 'block';
    document.getElementById('m-upload-text').style.display = 'block';
    document.getElementById('m-preview-img').style.display = 'none';
    
    document.getElementById('nav-member-btn').style.background = '#16a34a';
    updateJoinMemberBtn();
    
    const phoneNo = registeredMembers[u].phone;
    const exp = new Date(newExpiry);
    const formattedDate = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
    
    // Kirim notifikasi WhatsApp sukses member
    sendWhatsappMemberNotification(phoneNo, u, formattedDate);
    
    switchMemberView('choice');
    closeMemberModal();
    
    if (pickedSlot) {
        openModal(activeCourt, true);
        processToPayment();
    }
}

// ── 5. GATEWAY FONNTE WHATSAPP CLIENT-SIDE TRIGGERS ──
function sendWhatsappBookingNotification(phone, name, court, date, slot, price) {
    const msg = `Halo ${name},\n\nBooking Lapangan Basket di *Putra Abadi Sport Center* telah kami terima.\n\n*Rincian Booking*:\n- Lapangan: Lapangan 0${court}\n- Tanggal: ${date}\n- Jam Sesi: ${slot}\n- Total Tarif: Rp ${price.toLocaleString('id-ID')}\n- Status: Menunggu Validasi DP\n\nAdmin akan segera memverifikasi bukti transfer Anda. Terima kasih!`;
    
    fetch('http://localhost:5000/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: phone, message: msg })
    })
    .then(res => res.json())
    .then(data => console.log('WA Booking Sent:', data))
    .catch(err => console.error('WA Error:', err));
}

function sendWhatsappMemberNotification(phone, name, expiryDate) {
    const msg = `Halo ${name},\n\nSelamat! Pendaftaran member resmi Anda di *Putra Abadi Sport Center* telah berhasil diaktifkan.\n\n*Rincian Membership*:\n- Status: Member Resmi Aktif\n- Potongan Booking: Rp 20.000 / jam\n- Berlaku s.d.: ${expiryDate}\n\nTerima kasih atas kepercayaan Anda berlatih bersama kami! 👑`;
    
    fetch('http://localhost:5000/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: phone, message: msg })
    })
    .then(res => res.json())
    .then(data => console.log('WA Member Sent:', data))
    .catch(err => console.error('WA Error:', err));
}

// --- DASHBOARD ADMIN: KELOLA JADWAL CRUD ---
function populateScheduleDates() {
    const select = document.getElementById('schedule-select-date');
    if (!select) return;
    select.innerHTML = '';
    const daysName = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    dateList.forEach(d => {
        const key = dk(d);
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${daysName[d.getDay()]} - ${d.getDate()}/${d.getMonth()+1}`;
        select.appendChild(opt);
    });
}

function renderAdminSchedule() {
    const courtId = document.getElementById('schedule-select-court').value;
    const dateKey = document.getElementById('schedule-select-date').value;
    const tbody = document.getElementById('admin-schedule-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    st.forEach(slot => {
        const booking = bk[courtId] && bk[courtId][dateKey] ? bk[courtId][dateKey][slot] : null;
        const tr = document.createElement('tr');
        
        let statusHTML = '';
        let penyewa = '—';
        let phone = '—';
        let totalHTML = '—';
        let actionHTML = '';
        
        if (booking) {
            let statusText = '';
            let statusClass = '';
            if (booking.status === 'waiting_dp') {
                statusText = 'Menunggu DP';
                statusClass = 'span-waiting';
            } else if (booking.status === 'confirmed_dp') {
                statusText = 'DP Diterima';
                statusClass = 'span-confirmed';
            } else if (booking.status === 'settled') {
                statusText = 'Lunas';
                statusClass = 'span-settled';
            }
            
            // We inline custom badge colors for status display in dark theme
            let badgeBg = 'rgba(234, 179, 8, 0.15)'; // yellow
            let badgeColor = '#facc15';
            if (booking.status === 'confirmed_dp') {
                badgeBg = 'rgba(59, 130, 246, 0.15)'; // blue
                badgeColor = '#60a5fa';
            } else if (booking.status === 'settled') {
                badgeBg = 'rgba(34, 197, 94, 0.15)'; // green
                badgeColor = '#4ade80';
            }
            
            statusHTML = `<span class="admin-status-badge" style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${statusText}</span>`;
            penyewa = booking.name;
            phone = booking.phone;
            totalHTML = `Rp ${booking.total.toLocaleString('id-ID')}`;
            
            actionHTML = `
                <div style="display:flex; justify-content:center; gap:8px;">
                    <button class="btn-admin-action-solid" style="padding: 4px 10px; font-size: 11px;" onclick="editScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-edit"></i> Edit</button>
                    <button class="btn-admin-action-solid" style="padding: 4px 10px; font-size: 11px; background:var(--red-dark);" onclick="deleteScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-trash"></i> Hapus</button>
                </div>
            `;
        } else {
            statusHTML = `<span class="admin-status-badge" style="background: rgba(255,255,255,0.06); color: #888; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">KOSONG</span>`;
            actionHTML = `
                <div style="display:flex; justify-content:center;">
                    <button class="btn-admin-action-solid" style="padding: 4px 12px; font-size: 11px; background:#1e3a8a;" onclick="createScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-plus"></i> Booking</button>
                </div>
            `;
        }
        
        tr.innerHTML = `
            <td><strong>${slot}</strong></td>
            <td>${statusHTML}</td>
            <td>${penyewa}</td>
            <td>${phone}</td>
            <td>${totalHTML}</td>
            <td style="text-align: center;">${actionHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

function createScheduleBooking(courtId, dateKey, slot) {
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-title').textContent = 'Tambah Booking';
    
    document.getElementById('adm-modal-body').innerHTML = `
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Nama Penyewa</label>
            <input class="bform-input" id="sched-name" placeholder="Masukkan nama..."/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">No. WhatsApp</label>
            <input class="bform-input" id="sched-phone" placeholder="Masukkan no. HP..."/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Total Tarif (Rp)</label>
            <input class="bform-input" type="number" id="sched-total" value="100000" placeholder="100000"/>
        </div>
        <div class="bform-group" style="margin-bottom: 20px;">
            <label class="bform-label" style="color: #aaa;">Status Pembayaran</label>
            <select class="bform-input" id="sched-status">
                <option value="confirmed_dp">DP Diterima (Rp 50.000)</option>
                <option value="settled">Lunas</option>
            </select>
        </div>
        <button class="btn-confirm" onclick="saveScheduleBooking('${courtId}', '${dateKey}', '${slot}', false)">Simpan</button>
    `;
}

function editScheduleBooking(courtId, dateKey, slot) {
    const booking = bk[courtId] && bk[courtId][dateKey] ? bk[courtId][dateKey][slot] : null;
    if (!booking) return;
    
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-title').textContent = 'Edit Jadwal';
    
    document.getElementById('adm-modal-body').innerHTML = `
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Nama Penyewa</label>
            <input class="bform-input" id="sched-name" value="${booking.name}" placeholder="Masukkan nama..."/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">No. WhatsApp</label>
            <input class="bform-input" id="sched-phone" value="${booking.phone}" placeholder="Masukkan no. HP..."/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Total Tarif (Rp)</label>
            <input class="bform-input" type="number" id="sched-total" value="${booking.total}" placeholder="100000"/>
        </div>
        <div class="bform-group" style="margin-bottom: 20px;">
            <label class="bform-label" style="color: #aaa;">Status Pembayaran</label>
            <select class="bform-input" id="sched-status">
                <option value="confirmed_dp" ${booking.status === 'confirmed_dp' ? 'selected' : ''}>DP Diterima (Rp 50.000)</option>
                <option value="settled" ${booking.status === 'settled' ? 'selected' : ''}>Lunas</option>
            </select>
        </div>
        <button class="btn-confirm" onclick="saveScheduleBooking('${courtId}', '${dateKey}', '${slot}', true)">Simpan</button>
    `;
}

function saveScheduleBooking(courtId, dateKey, slot, isEdit) {
    const name = document.getElementById('sched-name').value.trim();
    const phone = document.getElementById('sched-phone').value.trim();
    const total = parseInt(document.getElementById('sched-total').value);
    const status = document.getElementById('sched-status').value;
    
    if (!name || !phone || isNaN(total)) {
        alert('Lengkapi semua isian!');
        return;
    }
    
    if (!bk[courtId]) bk[courtId] = {};
    if (!bk[courtId][dateKey]) bk[courtId][dateKey] = {};
    
    let paid = 0;
    if (status === 'confirmed_dp') paid = 50000;
    else if (status === 'settled') paid = total;
    
    bk[courtId][dateKey][slot] = {
        name: name,
        phone: phone,
        status: status,
        paid: paid,
        total: total
    };
    
    syncBookingsToBackend();
    closeAdminActionModal();
    renderAdminSchedule();
    updatePills();
    renderAdminDashboard();
    alert(isEdit ? 'Jadwal berhasil diperbarui!' : 'Booking berhasil ditambahkan!');
}

function deleteScheduleBooking(courtId, dateKey, slot) {
    if (confirm(`Apakah Anda yakin ingin menghapus booking lapangan ${courtId} tanggal ${dateKey} jam ${slot}?`)) {
        if (bk[courtId] && bk[courtId][dateKey] && bk[courtId][dateKey][slot]) {
            delete bk[courtId][dateKey][slot];
            syncBookingsToBackend();
            renderAdminSchedule();
            updatePills();
            renderAdminDashboard();
            alert('Booking berhasil dihapus!');
        }
    }
}

// ── MIDTRANS & BACKEND SYNC HELPERS ──
const API_URL = 'http://localhost:5000/api';
let currentMidtransOrderId = null;
let pendingRegName = "";
let pendingRegPhone = "";
let pendingRegPassword = "";

function syncBookingsToBackend() {
    fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bk)
    }).catch(err => console.error('Failed to sync bookings to backend:', err));
}

function syncMembersToBackend() {
    fetch(`${API_URL}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registeredMembers)
    }).catch(err => console.error('Failed to sync members to backend:', err));
}

function loadBookingsFromBackend() {
    fetch(`${API_URL}/bookings`)
    .then(res => res.json())
    .then(data => {
        bk = data;
        updatePills();
        updateSlots();
        if (isAdminActive && currentActiveAdminTab === 'booking') {
            renderAdminDashboard();
        }
        if (isAdminActive && currentActiveAdminTab === 'schedule') {
            renderAdminSchedule();
        }
    })
    .catch(err => console.error('Error loading bookings:', err));
}

function loadMembersFromBackend() {
    fetch(`${API_URL}/members`)
    .then(res => res.json())
    .then(data => {
        registeredMembers = data;
        updateJoinMemberBtn();
        if (loggedInUser) {
            document.getElementById('member-status-text').textContent = loggedInUser;
            if (isUserActiveMember(loggedInUser)) {
                document.getElementById('nav-member-btn').style.background = '#16a34a';
            } else {
                document.getElementById('nav-member-btn').style.background = 'var(--red)';
            }
        }
        if (isAdminActive && currentActiveActiveTab === 'member') {
            renderAdminMembers();
        }
    })
    .catch(err => console.error('Error loading members:', err));
}

function payWithMidtrans() {
    if (!loggedInUser) {
        alert('Anda harus login terlebih dahulu untuk melakukan booking.');
        return;
    }
    const nameInp = document.getElementById('inp-name').value.trim();
    const phoneInp = document.getElementById('inp-phone').value.trim();
    if(!nameInp || !phoneInp) { alert('Isi data diri!'); return; }
    
    const payBtn = document.getElementById('btn-pay-midtrans');
    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Memproses...';
    }

    const finalPrice = isUserActiveMember(loggedInUser) ? 80000 : 100000;
    const k = dk(dateList[activeDay]);

    const bookingDetails = {
        courtId: activeCourt,
        dateKey: k,
        slotKey: pickedSlot,
        total: finalPrice
    };

    fetch(`${API_URL}/midtrans/create-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'booking',
            amount: 50000,
            name: nameInp,
            phone: phoneInp,
            bookingDetails: bookingDetails
        })
    })
    .then(res => res.json())
    .then(data => {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '<i class="ti ti-credit-card"></i> Bayar DP Sekarang';
        }

        if (data.error) {
            alert('Gagal membuat transaksi: ' + data.error);
            return;
        }

        currentMidtransOrderId = data.orderId;

        if (data.mock) {
            openSimulationModal(data.orderId, 50000, 'DP Booking Lapangan');
        } else {
            window.snap.pay(data.token, {
                onSuccess: function(result) {
                    console.log('Payment success:', result);
                    verifyPaymentStatus(data.orderId);
                },
                onPending: function(result) {
                    console.log('Payment pending:', result);
                    alert('Pembayaran pending. Silakan selesaikan pembayaran QRIS Anda.');
                    closeModal();
                    loadBookingsFromBackend();
                },
                onError: function(result) {
                    console.error('Payment error:', result);
                    alert('Pembayaran gagal! Silakan coba lagi.');
                },
                onClose: function() {
                    console.log('Payment popup closed');
                    loadBookingsFromBackend();
                }
            });
        }
    })
    .catch(err => {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '<i class="ti ti-credit-card"></i> Bayar DP Sekarang';
        }
        console.error('Fetch error:', err);
        alert('Terjadi kesalahan koneksi ke server.');
    });
}

function verifyPaymentStatus(orderId) {
    fetch(`${API_URL}/midtrans/check-status?order_id=${orderId}`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Pembayaran berhasil dikonfirmasi secara otomatis! Lapangan berhasil dibooking.');
            closeModal();
            loadBookingsFromBackend();
        } else {
            alert('Pembayaran belum dikonfirmasi oleh sistem: ' + (data.error || 'silakan cek status kembali'));
        }
    })
    .catch(err => {
        console.error('Verification error:', err);
        alert('Gagal menghubungi server untuk verifikasi.');
    });
}

function payMembershipWithMidtrans() {
    let name = "";
    let phone = "";

    if (loggedInUser) {
        name = loggedInUser;
        phone = registeredMembers[loggedInUser].phone;
    } else {
        const n = document.getElementById('reg-name').value.trim();
        const ph = document.getElementById('reg-phone').value.trim();
        const pass = document.getElementById('reg-password').value;
        if(!n || !ph || !pass){ alert('Lengkapi form pendaftaran!'); return; }
        
        name = n;
        phone = ph;
        pendingRegName = n;
        pendingRegPhone = ph;
        pendingRegPassword = pass;
    }

    const payBtn = document.getElementById('btn-pay-member-midtrans');
    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Memproses...';
    }

    fetch(`${API_URL}/midtrans/create-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'membership',
            amount: 20000,
            name: name,
            phone: phone
        })
    })
    .then(res => res.json())
    .then(data => {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = 'Bayar & Aktifkan Member';
        }

        if (data.error) {
            alert('Gagal membuat transaksi: ' + data.error);
            return;
        }

        currentMidtransOrderId = data.orderId;

        if (data.mock) {
            openSimulationModal(data.orderId, 20000, 'Registrasi Member Baru');
        } else {
            window.snap.pay(data.token, {
                onSuccess: function(result) {
                    console.log('Membership payment success:', result);
                    verifyMembershipPaymentStatus(data.orderId);
                },
                onPending: function(result) {
                    console.log('Membership payment pending:', result);
                    alert('Pembayaran pending. Silakan selesaikan pembayaran QRIS Anda.');
                    closeMemberModal();
                },
                onError: function(result) {
                    console.error('Membership payment error:', result);
                    alert('Pembayaran gagal! Silakan coba lagi.');
                },
                onClose: function() {
                    console.log('Payment popup closed');
                }
            });
        }
    })
    .catch(err => {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = 'Bayar & Aktifkan Member';
        }
        console.error('Fetch error:', err);
        alert('Terjadi kesalahan koneksi ke server.');
    });
}

function verifyMembershipPaymentStatus(orderId) {
    fetch(`${API_URL}/midtrans/check-status?order_id=${orderId}`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Pembayaran pendaftaran member berhasil dikonfirmasi secara otomatis! Akun member aktif.');
            closeMemberModal();
            
            if (!loggedInUser && pendingRegName) {
                registeredMembers[pendingRegName] = {
                    phone: pendingRegPhone,
                    password: pendingRegPassword,
                    isMember: true,
                    expiryDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString()
                };
                
                loggedInUser = pendingRegName;
                document.getElementById('member-status-text').textContent = loggedInUser;
                document.getElementById('nav-member-btn').style.background = '#16a34a';
                updateJoinMemberBtn();
                
                document.getElementById('reg-name').value = '';
                document.getElementById('reg-phone').value = '';
                document.getElementById('reg-password').value = '';
            }
            
            loadMembersFromBackend();
        } else {
            alert('Pembayaran member belum dikonfirmasi: ' + (data.error || 'silakan cek status kembali'));
        }
    })
    .catch(err => {
        console.error('Verification error:', err);
        alert('Gagal menghubungi server untuk verifikasi.');
    });
}

function openSimulationModal(orderId, amount, type) {
    document.getElementById('sim-order-id').textContent = orderId;
    document.getElementById('sim-amount').textContent = `Rp ${amount.toLocaleString('id-ID')}`;
    document.getElementById('sim-type').textContent = type;
    document.getElementById('simulation-modal').style.display = 'block';
}

function closeSimulationModal() {
    document.getElementById('simulation-modal').style.display = 'none';
}

function closeSimulationModalOutside(e) {
    if (e.target.id === 'simulation-modal') closeSimulationModal();
}

function simulatePaymentSuccess() {
    const orderId = document.getElementById('sim-order-id').textContent;
    closeSimulationModal();
    
    if (orderId.startsWith('BOOK-')) {
        verifyPaymentStatus(orderId);
    } else {
        verifyMembershipPaymentStatus(orderId);
    }
}

function simulatePaymentCancel() {
    closeSimulationModal();
    alert('Simulasi pembayaran dibatalkan.');
}
