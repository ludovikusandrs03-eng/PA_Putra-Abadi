const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const { Snap } = require('midtrans-client');

// Load environment variables from parent folder .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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
  sendWhatsappNotification,
  confirmPayment
};
