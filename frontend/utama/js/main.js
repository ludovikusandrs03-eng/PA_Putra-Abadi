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

const API_URL = 'http://localhost:5000/api';
let currentMidtransOrderId = null;
let pendingRegName = "";
let pendingRegPhone = "";
let pendingRegPassword = "";

window.addEventListener('DOMContentLoaded', () => { 
    // Adjust admin link if opened via file protocol
    const adminLink = document.getElementById('logo-admin-link');
    if (adminLink && window.location.protocol === 'file:') {
        adminLink.setAttribute('href', '../admin/index.html');
    }

    // Muat data dari backend saat inisialisasi
    Promise.all([
        fetch(`${API_URL}/members`).then(res => res.json()),
        fetch(`${API_URL}/bookings`).then(res => res.json())
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

    const logUserEl = document.getElementById('log-username');
    const logPassEl = document.getElementById('log-password');
    if (logUserEl) logUserEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') loginMemberProcess(); });
    if (logPassEl) logPassEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') loginMemberProcess(); });
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

function navigateToUserSection(element) {
    document.querySelectorAll('#main-nav-links a').forEach(a => a.classList.remove('active'));
    element.classList.add('active');
}

// LOGIN SYSTEM
function loginMemberProcess() {
    const u = document.getElementById('log-username').value.trim();
    const p = document.getElementById('log-password').value;
    if(!u || !p){ alert('Isi semua kolom!'); return; }

    if(registeredMembers[u] && registeredMembers[u].password === p) {
        loggedInUser = u;
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

function logoutMember() {
    loggedInUser = null; 
    document.getElementById('member-status-text').textContent = "Login";
    document.getElementById('nav-member-btn').style.background = 'var(--red)';
    updateJoinMemberBtn();
    closeMemberModal();
}

// PROFILE ACTIONS
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

// MEMBER MODAL
function openMemberModal() {
    document.getElementById('member-modal').classList.add('open');
    if (loggedInUser) {
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
    document.getElementById('member-upgrade-form').style.display = (view === 'upgrade') ? 'block' : 'none';
    document.getElementById('member-edit-profile-form').style.display = (view === 'edit-profile') ? 'block' : 'none';
    if(view === 'choice') {
        const guestBox = document.getElementById('guest-choice-box');
        const loggedBox = document.getElementById('logged-in-box');
        if(loggedInUser) {
            guestBox.style.display = 'none';
            loggedBox.style.display = 'block';
            
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
        } else {
            guestBox.style.display = 'block';
            loggedBox.style.display = 'none';
        }
    }
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
    document.getElementById('sum-time').textContent = `${daysName[dateList[activeDay].getDay()]} · ${dateList[activeDay].getDate()}/${dateList[activeDay].getMonth()+1} · ${pickedSlot}`;
    document.getElementById('payment-section').style.display = 'block';
}

function resetPaymentState(){
    const paymentSection = document.getElementById('payment-section');
    if (paymentSection) paymentSection.style.display = 'none';
}

function joinMemberClick() {
    openMemberModal();
    switchMemberView('upgrade');
}

function updateJoinMemberBtn() {
    const btn = document.getElementById('join-member-btn');
    if (!btn) return;
    if (loggedInUser) {
        btn.style.display = 'inline-flex';
        const isMem = isUserActiveMember(loggedInUser);
        btn.innerHTML = `<i class="ti ti-id-badge"></i> ` + (isMem ? 'Perpanjang Membership' : 'Join Member Sekarang');
    } else {
        btn.style.display = 'none';
    }
}

// ── GATEWAY FONNTE WHATSAPP CLIENT-SIDE TRIGGERS ──
function sendWhatsappBookingNotification(phone, name, court, date, slot, price) {
    const msg = `Halo ${name},\n\nBooking Lapangan Basket di *Putra Abadi Sport Center* telah kami terima.\n\n*Rincian Booking*:\n- Lapangan: Lapangan 0${court}\n- Tanggal: ${date}\n- Jam Sesi: ${slot}\n- Total Tarif: Rp ${price.toLocaleString('id-ID')}\n- Status: Menunggu Validasi DP\n\nAdmin akan segera memverifikasi bukti transfer Anda. Terima kasih!`;
    
    fetch(`${API_URL}/send-whatsapp`, {
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
    
    fetch(`${API_URL}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: phone, message: msg })
    })
    .then(res => res.json())
    .then(data => console.log('WA Member Sent:', data))
    .catch(err => console.error('WA Error:', err));
}

// ── SYNC HELPERS ──
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
            bookerType: loggedInUser
                ? (isUserActiveMember(loggedInUser) ? 'member' : 'user')
                : 'guest',
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
