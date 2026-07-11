const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const { Snap } = require('midtrans-client');

// Load environment variables from parent folder .env file
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

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

async function ensureAppTables() {
  if (!dbPool) return;

  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS members (
        username VARCHAR(100) PRIMARY KEY,
        phone VARCHAR(30) DEFAULT '',
        password VARCHAR(255) NOT NULL,
        is_member BOOLEAN DEFAULT FALSE,
        expiry_date VARCHAR(50) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        court_id VARCHAR(20) NOT NULL,
        date_key VARCHAR(20) NOT NULL,
        slot_key VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) DEFAULT '',
        status VARCHAR(30) NOT NULL,
        paid DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) DEFAULT 0,
        order_id VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_booking (court_id, date_key, slot_key)
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL,
        order_type VARCHAR(30) DEFAULT 'booking',
        amount DECIMAL(10,2) DEFAULT 0,
        payment_type VARCHAR(50) DEFAULT 'qris',
        status VARCHAR(30) DEFAULT 'paid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('TIDB tables for admin/member/booking/payment are ready.');
  } catch (err) {
    console.error('Failed to prepare TIDB tables:', err);
  }
}

async function syncMembersToDatabase() {
  if (!dbPool) return;

  try {
    for (const [username, member] of Object.entries(members)) {
      await dbPool.query(
        `INSERT INTO members (username, phone, password, is_member, expiry_date)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         phone = VALUES(phone),
         password = VALUES(password),
         is_member = VALUES(is_member),
         expiry_date = VALUES(expiry_date)`,
        [username, member.phone || '', member.password || '', member.isMember ? 1 : 0, member.expiryDate || '']
      );
    }
  } catch (err) {
    console.error('Failed to sync members to TIDB:', err);
  }
}

async function syncBookingsToDatabase() {
  if (!dbPool) return;

  try {
    for (const courtId in bookings) {
      for (const dateKey in bookings[courtId]) {
        for (const slotKey in bookings[courtId][dateKey]) {
          const booking = bookings[courtId][dateKey][slotKey];
          if (!booking) continue;

          await dbPool.query(
            `INSERT INTO bookings (court_id, date_key, slot_key, name, phone, status, paid, total, order_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             phone = VALUES(phone),
             status = VALUES(status),
             paid = VALUES(paid),
             total = VALUES(total),
             order_id = VALUES(order_id)`,
            [courtId, dateKey, slotKey, booking.name || '', booking.phone || '', booking.status || 'waiting_dp', booking.paid || 0, booking.total || 0, booking.orderId || '']
          );
        }
      }
    }
  } catch (err) {
    console.error('Failed to sync bookings to TIDB:', err);
  }
}

async function savePaymentRecordToDatabase({ orderId, amount, paymentType = 'qris', orderType = 'booking', status = 'paid' }) {
  if (!dbPool) return;

  try {
    await dbPool.query(
      `INSERT INTO payments (order_id, order_type, amount, payment_type, status) VALUES (?, ?, ?, ?, ?)`,
      [orderId, orderType, amount, paymentType, status]
    );
  } catch (err) {
    console.error('Failed to save payment to TIDB:', err);
  }
}

// TiDB Database Pool
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
  ensureAppTables();
} else {
  console.log('Warning: TIDB_HOST not found in .env, running database in mock mode.');
}

// Cloudinary
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

// Resend
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend Email Client initialized.');
} else {
  console.log('Warning: RESEND_API_KEY not found in .env, running emails in mock mode.');
}

// Midtrans Snap
let snap = null;
const isMidtransConfigured = !!(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY && process.env.MIDTRANS_SERVER_KEY !== 'SB-Mid-server-xxxxxxxxxxxx');
if (isMidtransConfigured) {
  snap = new Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
  });
  console.log('Midtrans Snap Client initialized.');
} else {
  console.log('Warning: Midtrans credentials not found in .env, running Midtrans in mock/simulation mode.');
}

// Pending Membership
let pendingMemberships = {};

// Admin configuration
const adminConfigPath = path.join(__dirname, 'admin-config.json');
let adminConfig = { username: 'admin', password: 'admin123', email: '' };

async function ensureAdminTable() {
  if (!dbPool) return;

  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Admin credentials table ready in TIDB.');
  } catch (err) {
    console.error('Failed to prepare admin_credentials table:', err);
  }
}

function saveAdminConfig(config = adminConfig) {
  adminConfig = { ...adminConfig, ...config };
  fs.writeFileSync(adminConfigPath, JSON.stringify(adminConfig, null, 2), 'utf8');
  return adminConfig;
}

function loadAdminConfig() {
  if (fs.existsSync(adminConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
      adminConfig = {
        username: parsed.username || 'admin',
        password: parsed.password || 'admin123',
        email: parsed.email || ''
      };
    } catch (err) {
      console.error('Error parsing admin-config.json:', err);
      adminConfig = { username: 'admin', password: 'admin123', email: '' };
    }
  } else {
    saveAdminConfig();
  }
  return adminConfig;
}

function getAdminConfig() {
  return adminConfig;
}

async function getAdminAccount(username = adminConfig.username) {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query('SELECT * FROM admin_credentials WHERE username = ? LIMIT 1', [username]);
      if (rows && rows[0]) {
        return {
          username: rows[0].username,
          password: rows[0].password,
          email: rows[0].email || ''
        };
      }
    } catch (err) {
      console.error('Failed to query admin credentials from TIDB:', err);
    }
  }

  return getAdminConfig();
}

async function saveAdminAccount(nextConfig = {}) {
  if (dbPool) {
    try {
      const username = nextConfig.username || adminConfig.username;
      const password = nextConfig.password || adminConfig.password;
      const email = nextConfig.email || adminConfig.email || '';

      const [existingRows] = await dbPool.query('SELECT id FROM admin_credentials WHERE username = ? LIMIT 1', [username]);
      if (existingRows && existingRows[0]) {
        await dbPool.query('UPDATE admin_credentials SET password = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?', [password, email, username]);
      } else {
        await dbPool.query('INSERT INTO admin_credentials (username, password, email) VALUES (?, ?, ?)', [username, password, email]);
      }

      return { username, password, email };
    } catch (err) {
      console.error('Failed to save admin credentials to TIDB:', err);
    }
  }

  return updateAdminConfig(nextConfig);
}

function updateAdminConfig(nextConfig = {}) {
  return saveAdminConfig(nextConfig);
}

loadAdminConfig();
ensureAdminTable();

async function initializeAdminAccount() {
  const current = await getAdminAccount(adminConfig.username);
  if (!current || !current.username) {
    await saveAdminAccount(adminConfig);
  }
}

initializeAdminAccount();

async function sendAdminPasswordResetEmail(targetEmail, username, password) {
  if (!targetEmail) {
    return { success: false, error: 'Email admin belum diisi.' };
  }

  if (!resend) {
    console.log(`\n--- [Mock Admin Email] ---\nTo: ${targetEmail}\nSubject: Reset Password Admin\nUsername: ${username}\nPassword: ${password}\n--------------------------\n`);
    return { success: true, mock: true };
  }

  try {
    const response = await resend.emails.send({
      from: `Putra Abadi Sport Center <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
      to: [targetEmail],
      subject: 'Reset Password Admin - Putra Abadi Sport Center',
      html: `
        <p>Halo Admin,</p>
        <p>Berikut informasi akun admin Anda:</p>
        <ul>
          <li><strong>Username:</strong> ${username}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p>Silakan gunakan kredensial tersebut untuk login kembali ke halaman admin.</p>
      `
    });
    console.log('Admin password reset email sent:', response);
    return { success: true, data: response };
  } catch (err) {
    console.error('Failed to send admin password reset email:', err);
    return { success: false, error: err.message };
  }
}

// WhatsApp notification helper
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

// Confirm Payment shared logic
async function confirmPayment(orderId, paymentType = 'qris', actualAmountPaid) {
  if (orderId.startsWith('BOOK-')) {
    for (const courtId in bookings) {
      for (const dateKey in bookings[courtId]) {
        for (const slotKey in bookings[courtId][dateKey]) {
          const b = bookings[courtId][dateKey][slotKey];
          if (b.orderId === orderId) {
            if (b.status === 'waiting_dp') {
              b.status = 'confirmed_dp';
              b.paid = actualAmountPaid || 50000;
              saveBookingsToFile();
              await syncBookingsToDatabase();
              await savePaymentRecordToDatabase({ orderId, amount: actualAmountPaid || 50000, paymentType, orderType: 'booking', status: 'paid' });
              console.log(`[Success] Booking for ${b.name} on ${dateKey} ${slotKey} confirmed via Midtrans.`);
              
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
      await syncMembersToDatabase();
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

module.exports = {
  get bookings() { return bookings; },
  set bookings(val) { bookings = val; },
  get members() { return members; },
  set members(val) { members = val; },
  dbPool,
  cloudinary,
  resend,
  get snap() { return snap; },
  isMidtransConfigured,
  pendingMemberships,
  saveBookingsToFile,
  saveMembersToFile,
  ensureAppTables,
  syncMembersToDatabase,
  syncBookingsToDatabase,
  savePaymentRecordToDatabase,
  getAdminConfig,
  getAdminAccount,
  saveAdminAccount,
  updateAdminConfig,
  sendAdminPasswordResetEmail,
  sendWhatsappNotification,
  confirmPayment
};
