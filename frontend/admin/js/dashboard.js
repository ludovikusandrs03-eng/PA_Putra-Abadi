// ── ADMIN PORTAL DASHBOARD LOGIC ──

window.addEventListener('DOMContentLoaded', () => {
    // Check if session is active
    const loggedIn = checkAdminLoginSession();
    if (loggedIn) {
        initializeDashboardData();
    }
});

async function handleLoginProcess() {
    const u = document.getElementById('admin-log-username').value.trim();
    const p = document.getElementById('admin-log-password').value;
    const e = document.getElementById('admin-log-email').value.trim();

    if (!u || !p) {
        alert('Username dan password admin wajib diisi.');
        return;
    }

    try {
        const data = await loginAdmin(u, p, e);
        if (data.success) {
            sessionStorage.setItem('adminActive', 'true');
            sessionStorage.setItem('adminUsername', u);
            if (e) {
                sessionStorage.setItem('adminEmail', e);
            }
            checkAdminLoginSession();
            initializeDashboardData();
        } else {
            alert(data.error || 'Kredensial Admin salah!');
        }
    } catch (err) {
        console.error('Admin login failed:', err);
        alert('Tidak bisa menghubungkan ke server admin saat ini.');
    }
}

async function handleForgotPassword() {
    const u = document.getElementById('admin-log-username').value.trim();
    const e = document.getElementById('admin-log-email').value.trim();

    if (!u) {
        alert('Masukkan username admin terlebih dahulu.');
        return;
    }

    const targetEmail = e || window.prompt('Masukkan email admin yang aktif untuk menerima password:');
    if (!targetEmail) {
        return;
    }

    try {
        const data = await requestAdminPasswordReset(u, targetEmail);
        if (data.success) {
            alert(data.message || 'Password berhasil dikirim ke email admin.');
        } else {
            alert(data.error || 'Gagal mengirim password admin.');
        }
    } catch (err) {
        console.error('Forgot password request failed:', err);
        alert('Gagal mengirim permintaan reset password.');
    }
}

function handleLogoutProcess() {
    sessionStorage.removeItem('adminActive');
    window.location.href = window.location.protocol === 'file:' ? '../utama/index.html' : '/';
}

function openAdminLogoutModal() {
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-title').innerHTML = `<i class="ti ti-id-badge"></i> Area Membership`;
    document.getElementById('adm-modal-body').innerHTML = `
        <div style="text-align: center; padding: 1.5rem 0;">
            <h3 style="color: #4ade80; font-size: 16px; font-weight: 700; margin-bottom: 20px; font-family: 'Barlow', sans-serif;">✓ Anda sedang login sebagai Admin</h3>
            <button class="btn-outline" style="border-color: var(--red); color: var(--red-bright); padding: 8px 24px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 1px; margin-bottom: 10px;" onclick="openChangePasswordModal()">UBAH PASSWORD</button>
            <button class="btn-outline" style="border-color: var(--red); color: var(--red-bright); padding: 8px 24px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 1px;" onclick="executeAdminLogout()">LOG OUT</button>
        </div>
    `;
}

function executeAdminLogout() {
    closeAdminActionModal();
    handleLogoutProcess();
}

function openChangePasswordModal() {
    closeAdminActionModal();
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-title').innerHTML = '<i class="ti ti-lock"></i> Ubah Password Admin';
    document.getElementById('adm-modal-body').innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="bform-group">
                <label class="bform-label">Password Lama</label>
                <input class="bform-input" id="admin-current-password" type="password" placeholder="Masukkan password lama" required />
            </div>
            <div class="bform-group">
                <label class="bform-label">Password Baru</label>
                <input class="bform-input" id="admin-new-password" type="password" placeholder="Masukkan password baru" required />
            </div>
            <div class="bform-group">
                <label class="bform-label">Konfirmasi Password Baru</label>
                <input class="bform-input" id="admin-confirm-password" type="password" placeholder="Ulangi password baru" required />
            </div>
            <button class="btn-confirm" onclick="submitChangePassword()">Simpan Password Baru</button>
        </div>
    `;
}

async function submitChangePassword() {
    const username = sessionStorage.getItem('adminUsername') || 'admin';
    const currentPassword = document.getElementById('admin-current-password').value;
    const newPassword = document.getElementById('admin-new-password').value;
    const confirmPassword = document.getElementById('admin-confirm-password').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Semua field wajib diisi.');
        return;
    }

    try {
        const data = await changeAdminPassword(username, currentPassword, newPassword, confirmPassword);
        if (data.success) {
            alert('Password admin berhasil diperbarui.');
            closeAdminActionModal();
        } else {
            alert(data.error || 'Gagal mengubah password admin.');
        }
    } catch (err) {
        console.error('Change password failed:', err);
        alert('Gagal menghubungkan ke server admin.');
    }
}

function initializeDashboardData() {
    Promise.all([
        loadBookingsFromBackend(),
        loadMembersFromBackend()
    ]).then(() => {
        console.log('Dashboard data loaded successfully.');
        switchAdminTab('booking');
    });
}

function handleAdminNavClick(e, tabName) {
    e.preventDefault();
    switchAdminTab(tabName);
}

function switchAdminTab(tabName) {
    currentActiveAdminTab = tabName;
    
    // Manage active state on nav links
    document.querySelectorAll('#main-nav-links a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`#main-nav-links a[data-tab="${tabName}"]`);
    if(activeLink) activeLink.classList.add('active');

    // Toggle panels visibility
    document.querySelectorAll('.admin-panel').forEach(panel => panel.style.display = 'none');
    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) targetPanel.style.display = 'block';
    
    // Trigger panel-specific rendering
    if(tabName === 'booking') renderAdminDashboard();
    if(tabName === 'schedule') {
        populateScheduleDates();
        renderAdminSchedule();
    }
    if(tabName === 'member') renderAdminMembers();
    if(tabName === 'report') renderAdminReports();
}

// ── 1. BOOKING PANEL RENDERING ──
function renderAdminDashboard() {
    const tbody = document.getElementById('admin-booking-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let confirmed = 0, settled = 0;

    for (const courtId in bk) {
        for (const dateKey in bk[courtId]) {
            for (const slotKey in bk[courtId][dateKey]) {
                const order = bk[courtId][dateKey][slotKey];
                if (!order) continue;

                if (order.status === 'waiting_dp' || order.status === 'confirmed_dp') confirmed++;
                else if (order.status === 'settled') settled++;

                let stLabel = '';
                if (order.status === 'waiting_dp' || order.status === 'confirmed_dp') stLabel = 'DP via Midtrans';
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
    document.getElementById('count-confirmed-dp').textContent = confirmed;
    document.getElementById('count-settled').textContent = settled;
}

function openBookingDetail(courtId, dateKey, slotKey) {
    const order = bk[courtId][dateKey][slotKey];
    let statusText = '';
    let actionButtons = '';

    if (order.status === 'waiting_dp' || order.status === 'confirmed_dp') {
        // DP sudah tervalidasi Midtrans — admin cukup lunasi saja
        statusText = '<span style="color:#3b82f6; font-weight:bold;">DP via Midtrans</span>';
        actionButtons = `
            <button class="btn-confirm" style="margin-bottom: 10px;" onclick="openSettlePrompt(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-coin"></i> Lunasi Lapangan</button>
            <button class="btn-outline" style="width: 100%; margin-bottom: 10px;" onclick="updateBookingTimePrompt(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-edit"></i> Ubah Jam Main</button>
            <button class="btn-outline" style="width: 100%; border-color: #f87171; color: #f87171;" onclick="closeAdminActionModal(); rejectBooking(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-trash"></i> Batalkan Booking</button>
        `;
    } else {
        statusText = '<span style="color:#4ade80; font-weight:bold;">Lunas & Selesai</span>';
        actionButtons = `
            <button class="btn-outline" style="width: 100%; border-color: #f87171; color: #f87171;" onclick="closeAdminActionModal(); rejectBooking(${courtId}, '${dateKey}', '${slotKey}')"><i class="ti ti-trash"></i> Hapus Riwayat</button>
        `;
    }

    const adminControlHTML = `
        <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
            <div style="font-family:'Barlow Condensed'; font-size:14px; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; color:var(--text-muted);">Kontrol Admin</div>
            ${actionButtons}
        </div>
    `;

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
                <span style="color:#aaa;">Sudah Dibayar</span>
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

// executeConfirmDP dihapus — DP sudah divalidasi otomatis oleh Midtrans

function openSettlePrompt(courtId, dateKey, slotKey) {
    const order = bk[courtId][dateKey][slotKey];
    document.getElementById('adm-modal-title').textContent = "Pelunasan Lapangan";
    document.getElementById('adm-modal-body').innerHTML = `
        <p style="font-size:13px; margin-bottom:12px;">Sisa Tagihan: <strong>Rp ${(order.total - order.paid).toLocaleString()}</strong></p>
        <button class="btn-confirm" style="margin:0;" onclick="executeSettle(${courtId}, '${dateKey}', '${slotKey}')">Simpan Pelunasan Lunas</button>
    `;
}

function executeSettle(courtId, dateKey, slotKey) {
    if (bk[courtId] && bk[courtId][dateKey] && bk[courtId][dateKey][slotKey]) {
        bk[courtId][dateKey][slotKey].status = 'settled';
        bk[courtId][dateKey][slotKey].paid = bk[courtId][dateKey][slotKey].total;
        syncBookingsToBackend();
        closeAdminActionModal();
        renderAdminDashboard();
    }
}

function updateBookingTimePrompt(courtId, dateKey, slotKey) {
    document.getElementById('adm-modal-title').textContent = "Ubah Sesi Jam Main";
    let opts = ''; 
    st.forEach(t => opts += `<option value="${t}" ${t===slotKey?'selected':''}>${t}</option>`);
    
    document.getElementById('adm-modal-body').innerHTML = `
        <select id="adm-reschedule-select" class="bform-input" style="width:100%; background:#222; margin-bottom:15px;">${opts}</select>
        <button class="btn-confirm" style="margin:0;" onclick="executeReschedule(${courtId}, '${dateKey}', '${slotKey}')">Simpan Jadwal Baru</button>
    `;
}

function executeReschedule(courtId, dateKey, oldSlot) {
    const newSlot = document.getElementById('adm-reschedule-select').value;
    if(bk[courtId][dateKey][newSlot]) { alert('Jam sudah terisi booking lain!'); return; }
    bk[courtId][dateKey][newSlot] = bk[courtId][dateKey][oldSlot];
    delete bk[courtId][dateKey][oldSlot];
    syncBookingsToBackend();
    closeAdminActionModal();
    renderAdminDashboard();
}

function rejectBooking(courtId, dateKey, slotKey) {
    if(confirm('Batalkan reservasi sesi ini?')) { 
        delete bk[courtId][dateKey][slotKey]; 
        syncBookingsToBackend();
        renderAdminDashboard(); 
    }
}

function closeAdminActionModal() { document.getElementById('admin-action-modal').classList.remove('open'); }
function closeAdminActionModalOutside(e) { if(e.target.id === 'admin-action-modal') closeAdminActionModal(); }


// ── 2. JADWAL PANEL RENDERING ──
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
            if (booking.status === 'waiting_dp' || booking.status === 'confirmed_dp') statusText = 'DP via Midtrans';
            else if (booking.status === 'settled') statusText = 'Lunas';
            
            let badgeBg = 'rgba(59, 130, 246, 0.15)';
            let badgeColor = '#60a5fa';
            if (booking.status === 'settled') {
                badgeBg = 'rgba(34, 197, 94, 0.15)';
                badgeColor = '#4ade80';
            }
            
            statusHTML = `<span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${statusText}</span>`;
            penyewa = booking.name;
            phone = booking.phone;
            totalHTML = `Rp ${booking.total.toLocaleString('id-ID')}`;
            
            actionHTML = `
                <div style="display:flex; justify-content:center; gap:8px;">
                    <button class="btn-admin-action-solid" style="padding: 4px 10px; font-size: 11px;" onclick="editScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-edit"></i> Edit</button>
                    <button class="btn-admin-action-solid" style="padding: 4px 10px; font-size: 11px; background:var(--red-dark); color:#fff;" onclick="deleteScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-trash"></i> Hapus</button>
                </div>
            `;
        } else {
            statusHTML = `<span style="background: rgba(255,255,255,0.06); color: #888; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">KOSONG</span>`;
            actionHTML = `
                <div style="display:flex; justify-content:center;">
                    <button class="btn-admin-action-solid" style="padding: 4px 12px; font-size: 11px; background:#1e3a8a; color:#fff;" onclick="createScheduleBooking('${courtId}', '${dateKey}', '${slot}')"><i class="ti ti-plus"></i> Booking</button>
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
    document.getElementById('adm-modal-title').textContent = 'Tambah Booking Manual';
    
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
            <input class="bform-input" type="number" id="sched-total" value="100000"/>
        </div>
        <div class="bform-group" style="margin-bottom: 20px;">
            <label class="bform-label" style="color: #aaa;">Status Pembayaran</label>
            <select class="bform-input" id="sched-status">
                <option value="confirmed_dp">DP via Midtrans (Rp 50.000)</option>
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
    document.getElementById('adm-modal-title').textContent = 'Edit Jadwal Booking';
    
    document.getElementById('adm-modal-body').innerHTML = `
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Nama Penyewa</label>
            <input class="bform-input" id="sched-name" value="${booking.name}"/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">No. WhatsApp</label>
            <input class="bform-input" id="sched-phone" value="${booking.phone}"/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color: #aaa;">Total Tarif (Rp)</label>
            <input class="bform-input" type="number" id="sched-total" value="${booking.total}"/>
        </div>
        <div class="bform-group" style="margin-bottom: 20px;">
            <label class="bform-label" style="color: #aaa;">Status Pembayaran</label>
            <select class="bform-input" id="sched-status">
                <option value="confirmed_dp" ${(booking.status === 'waiting_dp' || booking.status === 'confirmed_dp') ? 'selected' : ''}>DP via Midtrans (Rp 50.000)</option>
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
        total: total,
        orderId: `MANUAL-${Date.now()}`
    };
    
    syncBookingsToBackend();
    closeAdminActionModal();
    renderAdminSchedule();
    renderAdminDashboard();
    alert(isEdit ? 'Jadwal berhasil diperbarui!' : 'Booking berhasil ditambahkan!');
}

function deleteScheduleBooking(courtId, dateKey, slot) {
    if (confirm(`Apakah Anda yakin ingin menghapus booking lapangan ${courtId} tanggal ${dateKey} jam ${slot}?`)) {
        if (bk[courtId] && bk[courtId][dateKey] && bk[courtId][dateKey][slot]) {
            delete bk[courtId][dateKey][slot];
            syncBookingsToBackend();
            renderAdminSchedule();
            renderAdminDashboard();
            alert('Booking berhasil dihapus!');
        }
    }
}


// ── 3. MEMBERS PANEL RENDERING ──
function renderAdminMembers() {
    const tbody = document.getElementById('admin-member-table-body'); 
    if (!tbody) return;
    tbody.innerHTML = '';
    
    for (const username in registeredMembers) {
        const user = registeredMembers[username];
        if (!user.isMember) continue;
        
        const expiry = new Date(user.expiryDate);
        const tr = document.createElement('tr');
        const infoButton = `<button class="btn-cek-info" onclick="openMemberDetail('${username}')">CEK</button>`;
        
        tr.innerHTML = `
            <td><strong>${username}</strong></td>
            <td>${user.phone}</td>
            <td>${expiry.toLocaleDateString('id-ID')}</td>
            <td style="text-align:center;">${infoButton}</td>
        `;
        tbody.appendChild(tr);
    }
}

function openAddMemberPrompt() {
    document.getElementById('adm-modal-title').textContent = "Tambah Member Baru";
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-body').innerHTML = `
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color:#aaa;">Username Member</label>
            <input class="bform-input" id="new-mem-username" placeholder="Masukkan username..."/>
        </div>
        <div class="bform-group" style="margin-bottom: 12px;">
            <label class="bform-label" style="color:#aaa;">Nomor WhatsApp</label>
            <input class="bform-input" id="new-mem-phone" placeholder="08xx-xxxx-xxxx"/>
        </div>
        <div class="bform-group" style="margin-bottom: 20px;">
            <label class="bform-label" style="color:#aaa;">Masa Aktif (Bulan)</label>
            <select class="bform-input" id="new-mem-duration">
                <option value="1">1 Bulan</option>
                <option value="3">3 Bulan</option>
                <option value="6">6 Bulan</option>
                <option value="12">12 Bulan (1 Tahun)</option>
            </select>
        </div>
        <button class="btn-confirm" onclick="saveNewMember()">Simpan Member</button>
    `;
}

function saveNewMember() {
    const username = document.getElementById('new-mem-username').value.trim();
    const phone = document.getElementById('new-mem-phone').value.trim();
    const duration = parseInt(document.getElementById('new-mem-duration').value);
    
    if (!username || !phone) {
        alert('Lengkapi semua isian!');
        return;
    }
    
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + duration);
    
    registeredMembers[username] = {
        phone: phone,
        password: "123",
        isMember: true,
        expiryDate: expiry.toISOString()
    };
    
    syncMembersToBackend();
    closeAdminActionModal();
    renderAdminMembers();
    alert('Member berhasil ditambahkan!');
}

function openMemberDetail(username) {
    const user = registeredMembers[username];
    const expiry = new Date(user.expiryDate);
    const active = expiry > new Date();
    const statusText = active ? '<span style="color:#4ade80; font-weight:bold;">Aktif</span>' : '<span style="color:#f87171; font-weight:bold;">Expired</span>';
    
    document.getElementById('adm-modal-title').textContent = "Detail Informasi Member";
    document.getElementById('admin-action-modal').classList.add('open');
    document.getElementById('adm-modal-body').innerHTML = `
        <div style="background: #111; padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 20px; font-size: 13px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Username</span>
                <strong style="color:#fff;">${username}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">No. WhatsApp</span>
                <strong style="color:#fff;">${user.phone}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#aaa;">Masa Berlaku</span>
                <strong style="color:#fff;">${expiry.toLocaleDateString('id-ID')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#aaa;">Status</span>
                ${statusText}
            </div>
        </div>
        <button class="btn-outline" style="width: 100%; border-color: #f87171; color: #f87171;" onclick="deleteMember('${username}')"><i class="ti ti-trash"></i> Hapus Member</button>
    `;
}

function deleteMember(username) {
    if (confirm(`Hapus status member untuk ${username}?`)) {
        if (registeredMembers[username]) {
            registeredMembers[username].isMember = false;
            syncMembersToBackend();
            closeAdminActionModal();
            renderAdminMembers();
            alert('Member berhasil dihapus!');
        }
    }
}


// ── 4. REPORT PANEL RENDERING ──
function renderAdminReports() {
    const filter = document.getElementById('report-time-filter') ? document.getElementById('report-time-filter').value : 'all';
    const customContainer = document.getElementById('custom-report-date-container');
    
    if (customContainer) {
        customContainer.style.display = (filter === 'custom') ? 'flex' : 'none';
    }
    
    const tbody = document.getElementById('admin-report-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
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
                const order = bk[courtId][dateKey][slotKey]; 
                if (!order) continue;
                
                collected += order.paid; 
                debt += (order.total - order.paid);
                
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

function triggerReportDatePicker() {
    const p = document.getElementById('report-custom-date-picker');
    if (p) p.showPicker();
}

function handleCustomReportDateSelect(input) {
    selectedCustomReportDate = input.value;
    const btn = document.getElementById('btn-report-calendar');
    if (btn) {
        if (selectedCustomReportDate) {
            const parts = selectedCustomReportDate.split('-');
            btn.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            btn.textContent = 'Pilih Tanggal';
        }
    }
    renderAdminReports();
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
    
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `Laporan_Pendapatan_${filter}.csv`); 
    document.body.appendChild(link);
    link.click(); 
    document.body.removeChild(link);
}
