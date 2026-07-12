const express = require('express');
const router = express.Router();
const shared = require('../shared');

// Health Check & Integration Status
router.get('/status', async (req, res) => {
  let dbStatus = 'disconnected';
  if (shared.dbPool) {
    try {
      await shared.dbPool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = `error: ${err.message}`;
    }
  }

  res.json({
    status: 'online',
    integrations: {
      tidb: dbStatus,
      cloudinary: process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloudinary_cloud_name' ? 'configured' : 'mocked',
      resend: shared.resend ? 'configured' : 'mocked',
      fonnte: process.env.FONNTE_TOKEN ? 'configured' : 'mocked',
      midtrans: shared.isMidtransConfigured ? 'configured' : 'mocked'
    }
  });
});

// Upload Payment Receipt
router.post('/upload-receipt', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 payload is required' });
  }

  try {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloudinary_cloud_name') {
      const uploadResponse = await shared.cloudinary.uploader.upload(imageBase64, {
        folder: 'putra_abadi_receipts'
      });
      return res.json({
        success: true,
        imageUrl: uploadResponse.secure_url,
        publicId: uploadResponse.public_id
      });
    } else {
      console.log('Mocked Receipt Upload: Received image base64 data.');
      return res.json({
        success: true,
        imageUrl: 'https://via.placeholder.com/400x600.png?text=Bukti+Transfer+Mock',
        mock: true
      });
    }
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Send Notification Email
router.post('/send-email', async (req, res) => {
  const { to, subject, htmlContent } = req.body;
  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ error: 'to, subject, and htmlContent are required' });
  }

  try {
    if (shared.resend) {
      const { data, error } = await shared.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: to,
        subject: subject,
        html: htmlContent
      });

      if (error) throw new Error(error.message);
      return res.json({ success: true, id: data.id });
    } else {
      console.log(`Mocked Email:\nTo: ${to}\nSubject: ${subject}`);
      return res.json({ success: true, mock: true });
    }
  } catch (err) {
    console.error('Email Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Send WhatsApp notification
router.post('/send-whatsapp', async (req, res) => {
  const { target, message } = req.body;
  if (!target || !message) {
    return res.status(400).json({ error: 'target and message are required' });
  }
  const result = await shared.sendWhatsappNotification(target, message);
  res.json(result);
});

// Config endpoint (Midtrans client key)
router.get('/config', (req, res) => {
  res.json({
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || 'MOCK_CLIENT_KEY',
    mock: !shared.isMidtransConfigured
  });
});

// ── GET Bookings dari TiDB (format nested: courtId > dateKey > slotKey) ──
router.get('/bookings', async (req, res) => {
  try {
    const data = await shared.getBookingsFromDb();
    res.json(data);
  } catch (err) {
    console.error('GET /bookings error:', err.message);
    res.json(shared.bookings); // fallback ke cache
  }
});

// ── GET Members dari TiDB (format: { username: memberData }) ──
router.get('/members', async (req, res) => {
  try {
    const data = await shared.getMembersFromDb();
    res.json(data);
  } catch (err) {
    console.error('GET /members error:', err.message);
    res.json(shared.members); // fallback ke cache
  }
});

// ── GET Guests dari TiDB ──
router.get('/guests', async (req, res) => {
  try {
    const guests = await shared.getGuestsFromDatabase();
    res.json(guests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Initiate Midtrans Snap transaction ──
router.post('/midtrans/create-transaction', async (req, res) => {
  const { type, amount, name, phone, bookingDetails, bookerType, fixedCourtId, fixedDayOfWeek, fixedSlotKey } = req.body;
  if (!type || !amount || !name || !phone) {
    return res.status(400).json({ error: 'type, amount, name, and phone are required' });
  }

  const orderId = `${type === 'booking' ? 'BOOK' : 'MEMB'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

  // Jika tamu (tanpa akun), simpan ke tabel guests dan dapatkan guest_id
  let guestId = null;
  const resolvedBookerType = bookerType || 'guest';
  if (resolvedBookerType === 'guest' && type === 'booking') {
    guestId = await shared.upsertGuest(name, phone);
  }

  // ── Pengecekan Kunci Jadwal Tetap & Sesi Pertama Gratis ──
  if (type === 'booking' && bookingDetails) {
    const { courtId, dateKey, slotKey } = bookingDetails;
    const parts = dateKey.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = d.getDay(); // 0 = Minggu, 1 = Senin, ...

    // Ambil daftar member
    const membersList = await shared.getMembersFromDb();
    
    // Cari member yang mengunci slot ini
    let lockingMember = null;
    for (const username in membersList) {
      const m = membersList[username];
      if (m.isMember && 
          String(m.fixedCourtId) === String(courtId) && 
          m.fixedDayOfWeek !== null && Number(m.fixedDayOfWeek) === dayOfWeek && 
          m.fixedSlotKey === slotKey) {
        lockingMember = { username, ...m };
        break;
      }
    }

    if (lockingMember) {
      // Cek apakah kunci masih aktif (H-1 Jam sebelum jam mulai slot)
      const slotStartTimeStr = slotKey.split(' - ')[0]; // "19:00"
      const [shour, sminute] = slotStartTimeStr.split(':').map(Number);
      const slotStart = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), shour, sminute);
      const now = new Date();

      const timeDiffMs = slotStart.getTime() - now.getTime();
      const oneHourMs = 60 * 60 * 1000;

      if (timeDiffMs >= oneHourMs) {
        // Kunci aktif! Hanya member yang bersangkutan yang boleh membooking
        if (name !== lockingMember.username) {
          return res.status(403).json({ error: `Slot ini terkunci untuk jadwal tetap member ${lockingMember.username} hingga 1 jam sebelum sesi dimulai.` });
        }
      }
    }

    // ── Cek Sesi Pertama Gratis Pemilik Jadwal Tetap ──
    const activeMember = membersList[name];
    const isThisSlotTheirFixedSchedule = activeMember && 
      activeMember.isMember &&
      String(activeMember.fixedCourtId) === String(courtId) &&
      activeMember.fixedDayOfWeek !== null && Number(activeMember.fixedDayOfWeek) === dayOfWeek &&
      activeMember.fixedSlotKey === slotKey;

    if (isThisSlotTheirFixedSchedule && !activeMember.freeSessionUsed) {
      // Bypass Midtrans pembayaran DP, konfirmasi gratis seketika
      console.log(`[Free Session] Booking gratis pertama jadwal tetap untuk member: ${name}`);

      // 1. Simpan booking ke DB
      const bookingObj = {
        name, phone,
        bookerType: 'member',
        guestId: null,
        status: 'confirmed_dp',
        paid: 0,
        total: 0,
        orderId
      };
      await shared.saveBookingToDb(courtId, dateKey, slotKey, bookingObj);

      // 2. Tandai free_session_used di tabel members
      activeMember.freeSessionUsed = true;
      await shared.saveMemberToDb(name, activeMember);

      // 3. Simpan data pembayaran Rp 0 ke database
      await shared.savePaymentRecordToDatabase({ orderId, amount: 0, paymentType: 'free_session', orderType: 'booking', status: 'paid' });

      // 4. Kirim notifikasi WhatsApp
      const waMsg = `Halo ${name},\n\nBooking Jadwal Tetap Gratis Pertama Anda di *Putra Abadi Sport Center* telah berhasil dikonfirmasi!\n\n*Rincian Booking*:\n- Lapangan: Lapangan 0${courtId}\n- Tanggal: ${dateKey}\n- Jam Sesi: ${slotKey}\n- Total Tarif: Rp 0 (Sesi Pertama Deposit)\n- Status: Sukses Dikonfirmasi (Gratis) 🏀`;
      await shared.sendWhatsappNotification(phone, waMsg);

      return res.json({ success: true, freeSession: true, orderId });
    }
  }

  // ── Mock mode (Midtrans tidak dikonfigurasi) ──
  if (!shared.isMidtransConfigured) {
    console.log(`[Midtrans Mock] ${orderId} for ${name} (${resolvedBookerType}) Rp ${amount}`);

    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      const bookingObj = {
        name, phone,
        bookerType: resolvedBookerType,
        guestId,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      // Simpan langsung ke TiDB
      await shared.saveBookingToDb(courtId, dateKey, slotKey, bookingObj);
    } else if (type === 'membership') {
      shared.pendingMemberships[orderId] = { 
        username: name, 
        phone,
        fixedCourtId: fixedCourtId || null,
        fixedDayOfWeek: fixedDayOfWeek !== undefined && fixedDayOfWeek !== null ? Number(fixedDayOfWeek) : null,
        fixedSlotKey: fixedSlotKey || null
      };
    }

    return res.json({ token: `mock-snap-token-${orderId}`, orderId, mock: true });
  }

  // ── Real Midtrans ──
  try {
    const parameter = {
      transaction_details: { order_id: orderId, gross_amount: amount },
      credit_card: { secure: true },
      customer_details: { first_name: name, phone },
      expiry: { duration: 3, unit: 'minutes' }
    };

    const transaction = await shared.snap.createTransaction(parameter);

    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      const bookingObj = {
        name, phone,
        bookerType: resolvedBookerType,
        guestId,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      await shared.saveBookingToDb(courtId, dateKey, slotKey, bookingObj);
    } else if (type === 'membership') {
      shared.pendingMemberships[orderId] = { 
        username: name, 
        phone,
        fixedCourtId: fixedCourtId || null,
        fixedDayOfWeek: fixedDayOfWeek !== undefined && fixedDayOfWeek !== null ? Number(fixedDayOfWeek) : null,
        fixedSlotKey: fixedSlotKey || null
      };
    }

    res.json({ token: transaction.token, orderId });
  } catch (err) {
    console.error('Midtrans create-transaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Manual check & confirm payment status ──
router.get('/midtrans/check-status', async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  // Mock / simulasi
  if (!shared.isMidtransConfigured || order_id.includes('mock') || order_id.includes('MOCK')) {
    const result = await shared.confirmPayment(order_id, 'qris', order_id.startsWith('BOOK') ? 50000 : 180000);
    return res.json(result);
  }

  try {
    const statusResponse = await shared.snap.transaction.status(order_id);
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Check status ${order_id}: ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (transactionStatus === 'capture' && fraudStatus === 'challenge') {
        return res.json({ success: false, status: 'challenge', error: 'Payment is challenged' });
      }
      const grossAmount = parseInt(statusResponse.gross_amount);
      const confirmResult = await shared.confirmPayment(order_id, statusResponse.payment_type, grossAmount);
      return res.json(confirmResult);
    } else {
      return res.json({ success: false, status: transactionStatus, error: `Transaction status: ${transactionStatus}` });
    }
  } catch (err) {
    console.error('Check status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Midtrans Webhook ──
router.post('/midtrans/webhook', async (req, res) => {
  const notificationJson = req.body;
  if (!shared.isMidtransConfigured) {
    return res.status(400).json({ error: 'Midtrans is not configured' });
  }

  try {
    const statusResponse = await shared.snap.transaction.notification(notificationJson);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Webhook: ${orderId} → ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (!(transactionStatus === 'capture' && fraudStatus === 'challenge')) {
        const grossAmount = parseInt(statusResponse.gross_amount);
        await shared.confirmPayment(orderId, statusResponse.payment_type, grossAmount);
      }
    } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
      console.log(`Transaction ${transactionStatus}: ${orderId}`);
      if (orderId.startsWith('BOOK-')) {
        // Hapus booking waiting_dp yang gagal/expired
        await shared.deleteBookingByOrderId(orderId);
        console.log(`Deleted expired/cancelled booking for order: ${orderId}`);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
