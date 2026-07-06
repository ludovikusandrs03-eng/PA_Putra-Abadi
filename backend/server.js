const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const path = require('path');
const fs = require('fs');
const midtransClient = require('midtrans-client');

// Load environment variables from parent folder .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ── DATA PERSISTENCE INITIALIZATION (bookings.json & members.json) ──
const bookingsFilePath = path.join(__dirname, 'bookings.json');
const membersFilePath = path.join(__dirname, 'members.json');

let bookings = {};
let members = {};

// Load/Initialize members
const oneMonthFromNow = new Date();
oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

if (fs.existsSync(membersFilePath)) {
  try {
    members = JSON.parse(fs.readFileSync(membersFilePath, 'utf8'));
    console.log('Members data loaded from members.json.');
  } catch (err) {
    console.error('Error parsing members.json:', err);
  }
} else {
  members = {
    "Angelo": { phone: "08123456789", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Rio": { phone: "08987654321", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Andrew": { phone: "08555554444", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() },
    "Bryan": { phone: "08777776666", password: "123", isMember: true, expiryDate: oneMonthFromNow.toISOString() }
  };
  fs.writeFileSync(membersFilePath, JSON.stringify(members, null, 2), 'utf8');
  console.log('Created default members.json.');
}

// Load/Initialize bookings
if (fs.existsSync(bookingsFilePath)) {
  try {
    bookings = JSON.parse(fs.readFileSync(bookingsFilePath, 'utf8'));
    console.log('Bookings data loaded from bookings.json.');
  } catch (err) {
    console.error('Error parsing bookings.json:', err);
  }
} else {
  const todayStr = new Date().toISOString().split('T')[0];
  bookings = {
    1: { 
      [todayStr]: { 
        "19:00 - 20:00": { name: "Budi", phone: "081222", status: "confirmed_dp", paid: 50000, total: 100000 }
      } 
    },
    2: { 
      [todayStr]: { 
        "18:00 - 19:00": { name: "Angelo", phone: "08123456789", status: "settled", paid: 80000, total: 80000 } 
      } 
    }
  };
  fs.writeFileSync(bookingsFilePath, JSON.stringify(bookings, null, 2), 'utf8');
  console.log('Created default bookings.json.');
}

function saveBookingsToFile() {
  fs.writeFileSync(bookingsFilePath, JSON.stringify(bookings, null, 2), 'utf8');
}

function saveMembersToFile() {
  fs.writeFileSync(membersFilePath, JSON.stringify(members, null, 2), 'utf8');
}

// ── MIDTRANS CLIENT INITIALIZATION ──
let snap = null;
const isMidtransConfigured = !!(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY && process.env.MIDTRANS_SERVER_KEY !== 'SB-Mid-server-xxxxxxxxxxxx');
if (isMidtransConfigured) {
  snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
  });
  console.log('Midtrans Snap Client initialized.');
} else {
  console.log('Warning: Midtrans credentials not found in .env, running Midtrans in mock/simulation mode.');
}

// Keep track of pending membership registrations
let pendingMemberships = {};

// ── 1. TIDB DATABASE POOL INITIALIZATION ──
let dbPool = null;
if (process.env.TIDB_HOST) {
  const dbConfig = {
    host: process.env.TIDB_HOST,
    port: parseInt(process.env.TIDB_PORT || '4000'),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  // Setup SSL cert if specified (recommended for TiDB Serverless)
  if (process.env.TIDB_SSL_CA) {
    try {
      dbConfig.ssl = {
        ca: fs.readFileSync(process.env.TIDB_SSL_CA)
      };
    } catch (err) {
      console.warn('Warning: Failed to load TiDB SSL CA cert from path:', process.env.TIDB_SSL_CA);
    }
  }

  dbPool = mysql.createPool(dbConfig);
  console.log('TiDB Database Connection Pool established.');
} else {
  console.log('Warning: TIDB_HOST not found in .env, running database in mock mode.');
}

// ── 2. CLOUDINARY CONFIGURATION ──
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('Cloudinary SDK configured.');
} else {
  console.log('Warning: Cloudinary credentials not found in .env, running uploads in mock mode.');
}

// ── 3. RESEND EMAIL SERVICE INITIALIZATION ──
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend Email Client initialized.');
} else {
  console.log('Warning: RESEND_API_KEY not found in .env, running emails in mock mode.');
}

// ── 4. FONNTE WHATSAPP GATEWAY INITIALIZATION ──
if (process.env.FONNTE_TOKEN) {
  console.log('Fonnte WhatsApp Token configured.');
} else {
  console.log('Warning: FONNTE_TOKEN not found in .env, running WhatsApp in mock mode.');
}

// ── 5. API ROUTING / STUBS ──

// Health Check & Integration Status
app.get('/api/status', async (req, res) => {
  let dbStatus = 'disconnected';
  if (dbPool) {
    try {
      const [rows] = await dbPool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = `error: ${err.message}`;
    }
  }

  res.json({
    status: 'online',
    integrations: {
      tidb: dbStatus,
      cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'mocked',
      resend: resend ? 'configured' : 'mocked',
      fonnte: process.env.FONNTE_TOKEN ? 'configured' : 'mocked'
    }
  });
});

// Upload Payment Receipt (Cloudinary API endpoint stub)
app.post('/api/upload-receipt', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 payload is required' });
  }

  try {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      // Real upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(imageBase64, {
        folder: 'putra_abadi_receipts'
      });
      return res.json({
        success: true,
        imageUrl: uploadResponse.secure_url,
        publicId: uploadResponse.public_id
      });
    } else {
      // Mock mode
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

// Send Notification Email (Resend API endpoint stub)
app.post('/api/send-email', async (req, res) => {
  const { to, subject, htmlContent } = req.body;
  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ error: 'to, subject, and htmlContent are required' });
  }

  try {
    if (resend) {
      // Real email dispatch using Resend
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: to,
        subject: subject,
        html: htmlContent
      });

      if (error) {
        throw new Error(error.message);
      }

      return res.json({ success: true, id: data.id });
    } else {
      // Mock mode
      console.log(`Mocked Email Dispatch:\nTo: ${to}\nSubject: ${subject}\nHTML: ${htmlContent}`);
      return res.json({ success: true, mock: true });
    }
  } catch (err) {
    console.error('Email Dispatch Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to send WhatsApp messages using Fonnte API (Node native fetch)
async function sendWhatsappNotification(target, message) {
  if (!process.env.FONNTE_TOKEN) {
    console.log(`\n--- [Mock WA Notification] ---\nTo: ${target}\nMessage:\n${message}\n------------------------------\n`);
    return { success: true, mock: true };
  }

  console.log(`Sending WhatsApp via Fonnte to: ${target}...`);
  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': process.env.FONNTE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: target,
        message: message
      })
    });
    const data = await response.json();
    console.log('Fonnte API Response Data:', data);
    return data;
  } catch (err) {
    console.error('Fonnte API Fetch Error:', err);
    return { success: false, error: err.message };
  }
}

// POST endpoint to send WhatsApp notification
app.post('/api/send-whatsapp', async (req, res) => {
  const { target, message } = req.body;
  if (!target || !message) {
    return res.status(400).json({ error: 'target and message are required' });
  }
  const result = await sendWhatsappNotification(target, message);
  res.json(result);
});

// ── 6. MIDTRANS & PERSISTENCE API ENDPOINTS ──

// Config endpoint to expose Client Key to client
app.get('/api/config', (req, res) => {
  res.json({
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || 'MOCK_CLIENT_KEY',
    mock: !isMidtransConfigured
  });
});

// GET Bookings from local persistence
app.get('/api/bookings', (req, res) => {
  res.json(bookings);
});

// POST Bookings to update persistence
app.post('/api/bookings', (req, res) => {
  try {
    bookings = req.body;
    saveBookingsToFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Members from local persistence
app.get('/api/members', (req, res) => {
  res.json(members);
});

// POST Members to update persistence
app.post('/api/members', (req, res) => {
  try {
    members = req.body;
    saveMembersToFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to process successful payment, update status, and send WhatsApp
async function confirmPayment(orderId, paymentType = 'qris', actualAmountPaid) {
  if (orderId.startsWith('BOOK-')) {
    // Find booking matching order ID
    for (const courtId in bookings) {
      for (const dateKey in bookings[courtId]) {
        for (const slotKey in bookings[courtId][dateKey]) {
          const b = bookings[courtId][dateKey][slotKey];
          if (b.orderId === orderId) {
            if (b.status === 'waiting_dp') {
              b.status = 'confirmed_dp';
              b.paid = actualAmountPaid || 50000;
              saveBookingsToFile();
              console.log(`[Success] Booking for ${b.name} on ${dateKey} ${slotKey} confirmed via Midtrans.`);
              
              // Kirim notifikasi WhatsApp sukses booking
              const waMsg = `Halo ${b.name},\n\nBooking Lapangan Basket di *Putra Abadi Sport Center* telah berhasil dikonfirmasi!\n\n*Rincian Booking*:\n- Lapangan: Lapangan 0${courtId}\n- Tanggal: ${dateKey}\n- Jam Sesi: ${slotKey}\n- Total Tarif: Rp ${b.total.toLocaleString('id-ID')}\n- Status: DP Diterima (Rp ${b.paid.toLocaleString('id-ID')})\n\nSilakan datang tepat waktu dan selesaikan pelunasan di lapangan. Terima kasih! 🏀`;
              await sendWhatsappNotification(b.phone, waMsg);
              return { success: true, type: 'booking', booking: b };
            }
            return { success: true, type: 'booking', booking: b, alreadyConfirmed: true };
          }
        }
      }
    }
  } else if (orderId.startsWith('MEMB-')) {
    const pending = pendingMemberships[orderId];
    if (pending) {
      const username = pending.username;
      const phone = pending.phone;
      
      const currentExpiry = members[username]?.expiryDate;
      const now = new Date();
      let newExpiry;
      
      if (members[username] && members[username].isMember && currentExpiry && new Date(currentExpiry) > now) {
        newExpiry = new Date(currentExpiry);
        newExpiry.setMonth(newExpiry.getMonth() + 1);
      } else {
        newExpiry = new Date();
        newExpiry.setMonth(newExpiry.getMonth() + 1);
      }
      
      members[username] = {
        phone: phone,
        password: members[username]?.password || '123',
        isMember: true,
        expiryDate: newExpiry.toISOString()
      };
      
      saveMembersToFile();
      delete pendingMemberships[orderId];
      
      const exp = new Date(newExpiry);
      const formattedDate = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
      
      const waMsg = `Halo ${username},\n\nSelamat! Pendaftaran member resmi Anda di *Putra Abadi Sport Center* telah aktif via pembayaran online.\n\n*Rincian Membership*:\n- Status: Member Resmi Aktif\n- Potongan Booking: Rp 20.000 / jam\n- Berlaku s.d.: ${formattedDate}\n\nTerima kasih atas pembayaran Anda! 👑`;
      await sendWhatsappNotification(phone, waMsg);
      
      return { success: true, type: 'membership', username, expiryDate: formattedDate };
    }
  }
  return { success: false, error: 'Order ID not found or already processed' };
}

// POST endpoint to initiate a Midtrans Snap transaction
app.post('/api/midtrans/create-transaction', async (req, res) => {
  const { type, amount, name, phone, bookingDetails } = req.body;
  if (!type || !amount || !name || !phone) {
    return res.status(400).json({ error: 'type, amount, name, and phone are required' });
  }

  // Generate unique order ID
  const orderId = `${type === 'booking' ? 'BOOK' : 'MEMB'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

  // If in mock/simulation mode (no API keys configured)
  if (!isMidtransConfigured) {
    console.log(`[Midtrans Mock] Creating transaction ${orderId} for ${name} amount Rp ${amount}`);
    
    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      if (!bookings[courtId]) bookings[courtId] = {};
      if (!bookings[courtId][dateKey]) bookings[courtId][dateKey] = {};
      bookings[courtId][dateKey][slotKey] = {
        name,
        phone,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      saveBookingsToFile();
    } else if (type === 'membership') {
      pendingMemberships[orderId] = { username: name, phone };
    }

    return res.json({
      token: `mock-snap-token-${orderId}`,
      orderId,
      mock: true
    });
  }

  // Real Midtrans Snap Transaction API call
  try {
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount
      },
      credit_card: {
        secure: true
      },
      customer_details: {
        first_name: name,
        phone: phone
      },
      expiry: {
        duration: 3,
        unit: 'minutes'
      }
    };

    const transaction = await snap.createTransaction(parameter);
    
    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      if (!bookings[courtId]) bookings[courtId] = {};
      if (!bookings[courtId][dateKey]) bookings[courtId][dateKey] = {};
      bookings[courtId][dateKey][slotKey] = {
        name,
        phone,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      saveBookingsToFile();
    } else if (type === 'membership') {
      pendingMemberships[orderId] = { username: name, phone };
    }

    res.json({
      token: transaction.token,
      orderId
    });
  } catch (err) {
    console.error('Error creating Midtrans transaction:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET endpoint to manually verify transaction status from the client side (localhost fallback)
app.get('/api/midtrans/check-status', async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  // Handle mock order IDs or when running in mock mode
  if (!isMidtransConfigured || order_id.startsWith('mock') || order_id.includes('MOCK')) {
    const result = await confirmPayment(order_id, 'qris', order_id.startsWith('BOOK') ? 50000 : 20000);
    return res.json(result);
  }

  try {
    const statusResponse = await snap.transaction.status(order_id);
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Manual status check for ${order_id}: ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (transactionStatus === 'capture' && fraudStatus === 'challenge') {
        return res.json({ success: false, status: 'challenge', error: 'Payment is challenged' });
      } else {
        const grossAmount = parseInt(statusResponse.gross_amount);
        const confirmResult = await confirmPayment(order_id, statusResponse.payment_type, grossAmount);
        return res.json(confirmResult);
      }
    } else {
      return res.json({ success: false, status: transactionStatus, error: `Transaction status is ${transactionStatus}` });
    }
  } catch (err) {
    console.error('Check status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint for Midtrans Webhook Notification callback
app.post('/api/midtrans/webhook', async (req, res) => {
  const notificationJson = req.body;
  if (!isMidtransConfigured) {
    return res.status(400).json({ error: 'Midtrans is not configured' });
  }

  try {
    const statusResponse = await snap.transaction.notification(notificationJson);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Transaction notification received. Order ID: ${orderId}. Status: ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (transactionStatus === 'capture' && fraudStatus === 'challenge') {
        console.log(`Transaction challenged: ${orderId}`);
      } else {
        const grossAmount = parseInt(statusResponse.gross_amount);
        await confirmPayment(orderId, statusResponse.payment_type, grossAmount);
      }
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      console.log(`Transaction failed/cancelled/expired: ${orderId}`);
      if (orderId.startsWith('BOOK-')) {
        for (const courtId in bookings) {
          for (const dateKey in bookings[courtId]) {
            for (const slotKey in bookings[courtId][dateKey]) {
              const b = bookings[courtId][dateKey][slotKey];
              if (b.orderId === orderId && b.status === 'waiting_dp') {
                delete bookings[courtId][dateKey][slotKey];
                saveBookingsToFile();
                console.log(`Deleted pending booking session for order: ${orderId}`);
              }
            }
          }
        }
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Putra Abadi Backend Server running at http://localhost:${PORT}`);
});
