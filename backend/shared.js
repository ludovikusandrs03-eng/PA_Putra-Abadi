const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const { Snap } = require('midtrans-client');

// Load environment variables from parent folder .env file
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

// ─────────────────────────────────────────────────────────────
// In-memory cache (fallback saat DB offline)
// ─────────────────────────────────────────────────────────────
let bookings = {};
let members = {};

// ─────────────────────────────────────────────────────────────
// TiDB Database Pool
// ─────────────────────────────────────────────────────────────
let dbPool = null;

const sslConfig = { rejectUnauthorized: true };
if (process.env.TIDB_SSL_CA) {
  try {
    sslConfig.ca = fs.readFileSync(process.env.TIDB_SSL_CA);
  } catch (err) {
    console.warn('Warning: Failed to load TiDB SSL CA cert:', process.env.TIDB_SSL_CA);
  }
}

const baseDbConfig = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000'),
  user: process.env.TIDB_USER || process.env.TIDB_USERNAME,
  password: process.env.TIDB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  ssl: sslConfig,
  // Cegah ECONNRESET akibat idle timeout TiDB Cloud Serverless
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,   // ping setiap 10 detik
  connectTimeout: 15000            // timeout koneksi 15 detik
};

// ─────────────────────────────────────────────────────────────
// Cloudinary
// ─────────────────────────────────────────────────────────────
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloudinary_cloud_name') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('Cloudinary SDK configured.');
} else {
  console.log('Warning: Cloudinary credentials not found in .env, running uploads in mock mode.');
}

// ─────────────────────────────────────────────────────────────
// Resend
// ─────────────────────────────────────────────────────────────
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend Email Client initialized.');
} else {
  console.log('Warning: RESEND_API_KEY not found in .env, running emails in mock mode.');
}

// ─────────────────────────────────────────────────────────────
// Midtrans Snap
// ─────────────────────────────────────────────────────────────
let snap = null;
const isMidtransConfigured = !!(
  process.env.MIDTRANS_SERVER_KEY &&
  process.env.MIDTRANS_CLIENT_KEY &&
  process.env.MIDTRANS_SERVER_KEY !== 'SB-Mid-server-xxxxxxxxxxxx'
);
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

// ─────────────────────────────────────────────────────────────
// Pending Membership (in-memory, cleared on restart)
// ─────────────────────────────────────────────────────────────
let pendingMemberships = {};

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Admin config fallback (in-memory only)
// ─────────────────────────────────────────────────────────────
let adminConfig = { username: 'admin', password: 'admin123', email: '' };

function saveAdminConfig(config = adminConfig) {
  adminConfig = { ...adminConfig, ...config };
  return adminConfig;
}

function loadAdminConfig() {
  return adminConfig;
}

function getAdminConfig() {
  return adminConfig;
}

function updateAdminConfig(nextConfig = {}) {
  return saveAdminConfig(nextConfig);
}

// ─────────────────────────────────────────────────────────────
// DB Helper: Bookings
// ─────────────────────────────────────────────────────────────

// Ambil semua booking dari TiDB, rebuild ke format nested { courtId: { dateKey: { slotKey: booking } } }
async function getBookingsFromDb() {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return bookings;
  }
  try {
    const [rows] = await executeQuery(
      `SELECT court_id, date_key, slot_key, name, phone, booker_type, guest_id,
              status, paid, total, order_id, created_at
       FROM bookings ORDER BY created_at ASC`
    );
    const result = {};
    for (const row of rows) {
      const cId = String(row.court_id);
      if (!result[cId]) result[cId] = {};
      if (!result[cId][row.date_key]) result[cId][row.date_key] = {};
      result[cId][row.date_key][row.slot_key] = {
        name: row.name,
        phone: row.phone,
        bookerType: row.booker_type,
        guestId: row.guest_id,
        status: row.status,
        paid: parseFloat(row.paid),
        total: parseFloat(row.total),
        orderId: row.order_id
      };
    }
    bookings = result; // update cache
    return result;
  } catch (err) {
    console.error('Failed to get bookings from TiDB:', err.message);
    return bookings; // fallback ke cache
  }
}

// Simpan satu slot booking ke TiDB (INSERT or UPDATE)
async function saveBookingToDb(courtId, dateKey, slotKey, booking) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    await executeQuery(
      `INSERT INTO bookings
         (court_id, date_key, slot_key, name, phone, booker_type, guest_id, status, paid, total, order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name        = VALUES(name),
         phone       = VALUES(phone),
         booker_type = VALUES(booker_type),
         guest_id    = VALUES(guest_id),
         status      = VALUES(status),
         paid        = VALUES(paid),
         total       = VALUES(total),
         order_id    = VALUES(order_id)`,
      [
        String(courtId), dateKey, slotKey,
        booking.name || '', booking.phone || '',
        booking.bookerType || 'guest',
        booking.guestId || null,
        booking.status || 'waiting_dp',
        booking.paid || 0,
        booking.total || 0,
        booking.orderId || ''
      ]
    );
    // update in-memory cache
    if (!bookings[courtId]) bookings[courtId] = {};
    if (!bookings[courtId][dateKey]) bookings[courtId][dateKey] = {};
    bookings[courtId][dateKey][slotKey] = booking;
  } catch (err) {
    console.error('Failed to save booking to TiDB:', err.message);
  }
}

// Update status & paid satu booking berdasarkan order_id
async function updateBookingStatusByOrderId(orderId, status, paid) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return null;
  }
  try {
    await executeQuery(
      `UPDATE bookings SET status = ?, paid = ? WHERE order_id = ?`,
      [status, paid, orderId]
    );
    // juga ambil data booking yang diupdate untuk return ke caller
    const [rows] = await executeQuery(
      `SELECT court_id, date_key, slot_key, name, phone, booker_type, guest_id,
              status, paid, total, order_id
       FROM bookings WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (rows && rows[0]) {
      const row = rows[0];
      const b = {
        name: row.name,
        phone: row.phone,
        bookerType: row.booker_type,
        guestId: row.guest_id,
        status: row.status,
        paid: parseFloat(row.paid),
        total: parseFloat(row.total),
        orderId: row.order_id
      };
      // update cache
      const cId = String(row.court_id);
      if (bookings[cId] && bookings[cId][row.date_key]) {
        bookings[cId][row.date_key][row.slot_key] = b;
      }
      return { booking: b, courtId: row.court_id, dateKey: row.date_key, slotKey: row.slot_key };
    }
    return null;
  } catch (err) {
    console.error('Failed to update booking status in TiDB:', err.message);
    return null;
  }
}

// Cari booking berdasarkan order_id
async function getBookingByOrderId(orderId) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return null;
  }
  try {
    const [rows] = await executeQuery(
      `SELECT court_id, date_key, slot_key, name, phone, booker_type, guest_id,
              status, paid, total, order_id
       FROM bookings WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (rows && rows[0]) {
      const row = rows[0];
      return {
        courtId: row.court_id, dateKey: row.date_key, slotKey: row.slot_key,
        booking: {
          name: row.name, phone: row.phone,
          bookerType: row.booker_type, guestId: row.guest_id,
          status: row.status, paid: parseFloat(row.paid),
          total: parseFloat(row.total), orderId: row.order_id
        }
      };
    }
    return null;
  } catch (err) {
    console.error('Failed to get booking by order_id:', err.message);
    return null;
  }
}

// Hapus satu slot booking dari TiDB
async function deleteBookingFromDb(courtId, dateKey, slotKey) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    await executeQuery(
      `DELETE FROM bookings WHERE court_id = ? AND date_key = ? AND slot_key = ?`,
      [String(courtId), dateKey, slotKey]
    );
    // hapus dari cache
    if (bookings[courtId] && bookings[courtId][dateKey]) {
      delete bookings[courtId][dateKey][slotKey];
    }
  } catch (err) {
    console.error('Failed to delete booking from TiDB:', err.message);
  }
}

// Hapus booking berdasarkan order_id
async function deleteBookingByOrderId(orderId) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    // ambil data dulu untuk update cache
    const found = await getBookingByOrderId(orderId);
    await executeQuery(`DELETE FROM bookings WHERE order_id = ?`, [orderId]);
    if (found) {
      const { courtId, dateKey, slotKey } = found;
      const cId = String(courtId);
      if (bookings[cId] && bookings[cId][dateKey]) {
        delete bookings[cId][dateKey][slotKey];
      }
    }
  } catch (err) {
    console.error('Failed to delete booking by order_id:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// DB Helper: Members
// ─────────────────────────────────────────────────────────────

// Ambil semua member dari TiDB, rebuild ke format { username: memberData }
async function getMembersFromDb() {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return members;
  }
  try {
    const result = {};

    // 1. Ambil dari tabel members (member aktif)
    const [memberRows] = await executeQuery(
      `SELECT username, phone, password, expiry_date FROM members`
    );
    for (const row of memberRows) {
      result[row.username] = {
        phone: row.phone,
        password: row.password,
        isMember: true,
        expiryDate: row.expiry_date || ''
      };
    }

    // 2. Ambil dari tabel guests (non-member yang memiliki akun)
    const [guestRows] = await executeQuery(
      `SELECT name, phone, password FROM guests WHERE password IS NOT NULL`
    );
    for (const row of guestRows) {
      result[row.name] = {
        phone: row.phone,
        password: row.password,
        isMember: false,
        expiryDate: ''
      };
    }

    members = result; // update cache
    return result;
  } catch (err) {
    console.error('Failed to get members from TiDB:', err.message);
    return members; // fallback ke cache
  }
}

// Simpan satu member ke TiDB (INSERT or UPDATE)
async function saveMemberToDb(username, memberData) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    const isMember = (memberData.isMember === true || memberData.isMember === 'true' || memberData.isMember === 1);

    if (isMember) {
      // 1. Simpan/update ke tabel members
      await executeQuery(
        `INSERT INTO members (username, phone, password, is_member, expiry_date)
         VALUES (?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           phone       = VALUES(phone),
           password    = VALUES(password),
           is_member   = 1,
           expiry_date = VALUES(expiry_date)`,
        [
          username,
          memberData.phone || '',
          memberData.password || '',
          memberData.expiryDate || ''
        ]
      );

      // 2. Jika sebelumnya ada di tabel guests, pindahkan booking-nya ke member lalu hapus data guest tersebut
      const [gRows] = await executeQuery(`SELECT id FROM guests WHERE name = ? LIMIT 1`, [username]);
      if (gRows && gRows[0]) {
        const gId = gRows[0].id;
        await executeQuery(`UPDATE bookings SET guest_id = NULL, booker_type = 'member' WHERE guest_id = ?`, [gId]);
        await executeQuery(`DELETE FROM guests WHERE id = ?`, [gId]);
      }
    } else {
      // 1. Simpan/update ke tabel guests
      await executeQuery(
        `INSERT INTO guests (name, phone, password, user_type)
         VALUES (?, ?, ?, 'user')
         ON DUPLICATE KEY UPDATE
           phone     = VALUES(phone),
           password  = VALUES(password),
           user_type = 'user'`,
        [
          username,
          memberData.phone || '',
          memberData.password || ''
        ]
      );

      // 2. Hapus dari tabel members jika sebelumnya ada di sana
      await executeQuery(`DELETE FROM members WHERE username = ?`, [username]);
    }

    // update cache
    members[username] = memberData;
  } catch (err) {
    console.error('Failed to save member to TiDB:', err.message);
  }
}

// Hapus satu member dari TiDB
async function deleteMemberFromDb(username) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    await executeQuery(`DELETE FROM members WHERE username = ?`, [username]);
    await executeQuery(`DELETE FROM guests WHERE name = ? AND password IS NOT NULL`, [username]);
    delete members[username];
  } catch (err) {
    console.error('Failed to delete member from TiDB:', err.message);
  }
}

// Sinkronisasi data ke TiDB
async function syncMembersToDatabase() {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    for (const [username, memberData] of Object.entries(members)) {
      await saveMemberToDb(username, memberData);
    }
    console.log('All members synced to TiDB.');
  } catch (err) {
    console.error('Failed to sync members to database:', err.message);
  }
}

async function syncBookingsToDatabase() {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    for (const [courtId, dates] of Object.entries(bookings)) {
      for (const [dateKey, slots] of Object.entries(dates)) {
        for (const [slotKey, bookingData] of Object.entries(slots)) {
          await saveBookingToDb(courtId, dateKey, slotKey, bookingData);
        }
      }
    }
    console.log('All bookings synced to TiDB.');
  } catch (err) {
    console.error('Failed to sync bookings to database:', err.message);
  }
}

function saveBookingsToFile() {
  // Mode murni database: no-op
}

function saveMembersToFile() {
  // Mode murni database: no-op
}

// ─────────────────────────────────────────────────────────────
// DB Helper: Guests
// ─────────────────────────────────────────────────────────────

// Simpan atau update tamu ke TiDB, return guest_id
async function upsertGuest(name, phone) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return null;
  }
  try {
    await executeQuery(
      `INSERT INTO guests (name, phone, user_type)
       VALUES (?, ?, 'guest')
       ON DUPLICATE KEY UPDATE phone = VALUES(phone)`,
      [name, phone]
    );
    const [rows] = await executeQuery(
      `SELECT id FROM guests WHERE name = ? AND phone = ? LIMIT 1`,
      [name, phone]
    );
    return rows && rows[0] ? rows[0].id : null;
  } catch (err) {
    console.error('Failed to upsert guest to TiDB:', err.message);
    return null;
  }
}

// Ambil semua tamu dari TiDB
async function getGuestsFromDatabase() {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return [];
  }
  try {
    const [rows] = await executeQuery(
      `SELECT id, name, phone, user_type, created_at FROM guests ORDER BY created_at DESC`
    );
    return rows || [];
  } catch (err) {
    console.error('Failed to fetch guests from TiDB:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// DB Helper: Payments
// ─────────────────────────────────────────────────────────────

async function savePaymentRecordToDatabase({ orderId, amount, paymentType = 'qris', orderType = 'booking', status = 'paid' }) {
  if (!dbPool) {
    const pool = await getDbPool();
    if (!pool) return;
  }
  try {
    await executeQuery(
      `INSERT INTO payments (order_id, order_type, amount, payment_type, status) VALUES (?, ?, ?, ?, ?)`,
      [orderId, orderType, amount, paymentType, status]
    );
  } catch (err) {
    console.error('Failed to save payment to TiDB:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// DB Helper: Admin
// ─────────────────────────────────────────────────────────────

async function getAdminAccount(username = adminConfig.username) {
  const pool = await getDbPool();
  if (pool) {
    try {
      const [rows] = await executeQuery(
        'SELECT * FROM admin_credentials WHERE username = ? LIMIT 1',
        [username]
      );
      if (rows && rows[0]) {
        return {
          username: rows[0].username,
          password: rows[0].password,
          email: rows[0].email || ''
        };
      }
    } catch (err) {
      console.error('Failed to query admin credentials from TiDB:', err.message);
    }
  }
  return getAdminConfig();
}

async function saveAdminAccount(nextConfig = {}) {
  const pool = await getDbPool();
  if (pool) {
    try {
      const username = nextConfig.username || adminConfig.username;
      const password = nextConfig.password || adminConfig.password;
      const email = nextConfig.email !== undefined ? nextConfig.email : (adminConfig.email || '');

      const [existingRows] = await executeQuery(
        'SELECT id FROM admin_credentials WHERE username = ? LIMIT 1',
        [username]
      );
      if (existingRows && existingRows[0]) {
        await executeQuery(
          'UPDATE admin_credentials SET password = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
          [password, email, username]
        );
      } else {
        await executeQuery(
          'INSERT INTO admin_credentials (username, password, email) VALUES (?, ?, ?)',
          [username, password, email]
        );
      }
      return { username, password, email };
    } catch (err) {
      console.error('Failed to save admin credentials to TiDB:', err.message);
    }
  }
  return updateAdminConfig(nextConfig);
}

// ─────────────────────────────────────────────────────────────
// DB Init: Ensure Tables
// ─────────────────────────────────────────────────────────────

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
      CREATE TABLE IF NOT EXISTS guests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        password VARCHAR(255) DEFAULT NULL,
        user_type VARCHAR(20) NOT NULL DEFAULT 'guest',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_guest (name, phone)
      )
    `);

    await dbPool.query(`
      ALTER TABLE guests ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT NULL
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        court_id VARCHAR(20) NOT NULL,
        date_key VARCHAR(20) NOT NULL,
        slot_key VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) DEFAULT '',
        booker_type VARCHAR(20) NOT NULL DEFAULT 'guest',
        guest_id INT DEFAULT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'waiting_dp',
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

    await dbPool.query(`
      INSERT IGNORE INTO guests (name, phone, password, user_type)
      SELECT username, phone, password, 'user' FROM members WHERE is_member = 0 OR is_member = FALSE OR is_member IS NULL
    `);
    await dbPool.query(`
      DELETE FROM members WHERE is_member = 0 OR is_member = FALSE OR is_member IS NULL
    `);

    console.log('TiDB tables ready: admin / member / guest / booking / payment.');
  } catch (err) {
    console.error('Failed to prepare TiDB tables:', err.message);
  }
}

async function initializeAdminAccount() {
  const current = await getAdminAccount(adminConfig.username);
  if (!current || !current.username) {
    await saveAdminAccount(adminConfig);
    console.log('Default admin account created in TiDB.');
  }
}

let dbConnectionError = null;
let poolPromise = null;

// Load data awal dari JSON sebagai fallback di awal
_loadJsonFallback();

async function getDbPool() {
  if (dbPool) return dbPool;
  if (!process.env.TIDB_HOST) {
    dbConnectionError = 'TIDB_HOST environment variable not found.';
    return null;
  }

  if (poolPromise) {
    return poolPromise;
  }

  poolPromise = (async () => {
    try {
      const dbName = process.env.TIDB_DATABASE || 'putra_abadi';
      // Ganti - dengan _ agar nama aman sebagai identifier SQL
      const safeName = dbName.replace(/-/g, '_');

      // Koneksi sementara tanpa database untuk CREATE DATABASE IF NOT EXISTS
      const tempPool = mysql.createPool(baseDbConfig);
      await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${safeName}\``);
      await tempPool.end();
      console.log(`Database '${safeName}' siap.`);

      // Buat pool utama dengan database yang sudah ada
      dbPool = mysql.createPool({ ...baseDbConfig, database: safeName });
      console.log('TiDB Database Connection Pool established.');

      // Pastikan semua tabel ada
      await ensureAppTables();

      // Pastikan akun admin ada
      await initializeAdminAccount();

      // Load data awal ke in-memory cache dari TiDB
      await getMembersFromDb();
      await getBookingsFromDb();
      console.log('Data members & bookings loaded from TiDB into cache.');

      dbConnectionError = null;
      return dbPool;
    } catch (err) {
      dbConnectionError = err.message;
      console.error('Gagal inisialisasi TiDB, fallback ke mode lokal JSON:', err.message);
      dbPool = null;
      poolPromise = null; // Reset agar request berikutnya bisa mencoba kembali
      return null;
    }
  })();

  return poolPromise;
}

// ─────────────────────────────────────────────────────────────
// executeQuery: wrapper dengan auto-reconnect saat ECONNRESET
// TiDB Cloud Serverless bisa memutus koneksi idle → perlu retry
// ─────────────────────────────────────────────────────────────
async function executeQuery(sql, params = []) {
  const pool = await getDbPool();
  if (!pool) return [[], []];

  const RECONNECTABLE = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];

  const tryQuery = async () => pool.query(sql, params);

  try {
    return await tryQuery();
  } catch (err) {
    const isReconnectable = RECONNECTABLE.includes(err.code) ||
      (err.message && (err.message.includes('ECONNRESET') || err.message.includes('closed')));

    if (isReconnectable) {
      console.warn('[TiDB] Koneksi terputus, mencoba reconnect...');
      try {
        // Tutup pool lama dan buat pool baru
        const dbName = process.env.TIDB_DATABASE || 'putra_abadi';
        const safeName = dbName.replace(/-/g, '_');
        try { await pool.end(); } catch (_) {}
        dbPool = mysql.createPool({ ...baseDbConfig, database: safeName });
        poolPromise = Promise.resolve(dbPool);
        console.log('[TiDB] Reconnected berhasil.');
        return await dbPool.query(sql, params);
      } catch (reconnErr) {
        console.error('[TiDB] Reconnect gagal:', reconnErr.message);
        throw reconnErr;
      }
    }
    throw err;
  }
}


function _loadJsonFallback() {
  const bookingsFilePath = path.join(__dirname, 'bookings.json');
  const membersFilePath = path.join(__dirname, 'members.json');

  if (fs.existsSync(membersFilePath)) {
    try { members = JSON.parse(fs.readFileSync(membersFilePath, 'utf8')); } catch (e) {}
  }
  if (fs.existsSync(bookingsFilePath)) {
    try { bookings = JSON.parse(fs.readFileSync(bookingsFilePath, 'utf8')); } catch (e) {}
  }
  if (Object.keys(members).length) console.log('Members loaded from JSON fallback.');
  if (Object.keys(bookings).length) console.log('Bookings loaded from JSON fallback.');
}

// ─────────────────────────────────────────────────────────────
// Notification Helpers
// ─────────────────────────────────────────────────────────────

async function sendAdminPasswordResetEmail(targetEmail, username, password) {
  if (!targetEmail) {
    return { success: false, error: 'Email admin belum diisi.' };
  }

  if (!resend) {
    console.log(`\n--- [Mock Admin Email] ---\nTo: ${targetEmail}\nUsername: ${username}\nPassword: ${password}\n--------------------------\n`);
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
      body: JSON.stringify({ target, message })
    });
    const data = await response.json();
    console.log('Fonnte API Response:', data);
    return data;
  } catch (err) {
    console.error('Fonnte API Error:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// confirmPayment: dipanggil oleh Midtrans webhook / check-status
// Sekarang baca & tulis langsung dari/ke TiDB
// ─────────────────────────────────────────────────────────────

async function confirmPayment(orderId, paymentType = 'qris', actualAmountPaid) {
  if (orderId.startsWith('BOOK-')) {
    // Cari booking di DB berdasarkan order_id
    const found = await getBookingByOrderId(orderId);
    if (found) {
      const { courtId, dateKey, slotKey, booking: b } = found;
      if (b.status === 'waiting_dp') {
        const amountPaid = actualAmountPaid || 50000;
        // Update status di TiDB
        await updateBookingStatusByOrderId(orderId, 'confirmed_dp', amountPaid);
        await savePaymentRecordToDatabase({ orderId, amount: amountPaid, paymentType, orderType: 'booking', status: 'paid' });

        console.log(`[Success] Booking ${orderId} confirmed_dp (Rp ${amountPaid}).`);

        const waMsg = `Halo ${b.name},\n\nBooking Lapangan Basket di *Putra Abadi Sport Center* telah berhasil dikonfirmasi!\n\n*Rincian Booking*:\n- Lapangan: Lapangan 0${courtId}\n- Tanggal: ${dateKey}\n- Jam Sesi: ${slotKey}\n- Total Tarif: Rp ${Number(b.total).toLocaleString('id-ID')}\n- Status: DP Diterima (Rp ${Number(amountPaid).toLocaleString('id-ID')})\n\nSilakan datang tepat waktu dan selesaikan pelunasan di lapangan. Terima kasih! 🏀`;
        await sendWhatsappNotification(b.phone, waMsg);

        return { success: true, type: 'booking', booking: { ...b, status: 'confirmed_dp', paid: amountPaid } };
      }
      return { success: true, type: 'booking', booking: b, alreadyConfirmed: true };
    }
    return { success: false, error: 'Booking not found for order: ' + orderId };

  } else if (orderId.startsWith('MEMB-')) {
    const pending = pendingMemberships[orderId];
    if (pending) {
      const { username, phone } = pending;

      // Cek expiry member di DB
      const currentMembers = await getMembersFromDb();
      const currentMember = currentMembers[username];
      const now = new Date();
      let newExpiry;

      if (currentMember && currentMember.isMember && currentMember.expiryDate && new Date(currentMember.expiryDate) > now) {
        newExpiry = new Date(currentMember.expiryDate);
        newExpiry.setMonth(newExpiry.getMonth() + 1);
      } else {
        newExpiry = new Date();
        newExpiry.setMonth(newExpiry.getMonth() + 1);
      }

      const updatedMember = {
        phone,
        password: currentMember?.password || '123',
        isMember: true,
        expiryDate: newExpiry.toISOString()
      };

      // Simpan langsung ke TiDB
      await saveMemberToDb(username, updatedMember);
      await savePaymentRecordToDatabase({ orderId, amount: 20000, paymentType, orderType: 'membership', status: 'paid' });
      delete pendingMemberships[orderId];

      const exp = newExpiry;
      const formattedDate = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;

      const waMsg = `Halo ${username},\n\nSelamat! Pendaftaran member resmi Anda di *Putra Abadi Sport Center* telah aktif via pembayaran online.\n\n*Rincian Membership*:\n- Status: Member Resmi Aktif\n- Potongan Booking: Diskon 10% / jam\n- Berlaku s.d.: ${formattedDate}\n\nTerima kasih atas pembayaran Anda! 👑`;
      await sendWhatsappNotification(phone, waMsg);

      return { success: true, type: 'membership', username, expiryDate: formattedDate };
    }
  }

  return { success: false, error: 'Order ID not found or already processed' };
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  get dbPool() { return dbPool; },
  get dbConnectionError() { return dbConnectionError; },
  getDbPool,
  get bookings() { return bookings; },
  set bookings(val) { bookings = val; },
  get members() { return members; },
  set members(val) { members = val; },
  cloudinary,
  resend,
  get snap() { return snap; },
  isMidtransConfigured,
  pendingMemberships,

  // Booking DB helpers
  getBookingsFromDb,
  saveBookingToDb,
  updateBookingStatusByOrderId,
  getBookingByOrderId,
  deleteBookingFromDb,
  deleteBookingByOrderId,

  // Member DB helpers
  getMembersFromDb,
  saveMemberToDb,
  deleteMemberFromDb,
  syncMembersToDatabase,
  syncBookingsToDatabase,
  saveBookingsToFile,
  saveMembersToFile,

  // Guest DB helpers
  upsertGuest,
  getGuestsFromDatabase,

  // Payment DB helper
  savePaymentRecordToDatabase,

  // Admin helpers
  getAdminConfig,
  getAdminAccount,
  saveAdminAccount,
  updateAdminConfig,

  // Notification helpers
  sendAdminPasswordResetEmail,
  sendWhatsappNotification,

  // Core payment flow
  confirmPayment,

  // Table init (bisa dipanggil manual jika perlu)
  ensureAppTables
};
