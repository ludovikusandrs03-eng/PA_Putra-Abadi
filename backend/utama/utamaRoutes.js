const express = require('express');
const router = express.Router();
const shared = require('../shared');

// Health Check & Integration Status
router.get('/status', async (req, res) => {
  let dbStatus = 'disconnected';
  if (shared.dbPool) {
    try {
      const [rows] = await shared.dbPool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = `error: ${err.message}`;
    }
  }

  res.json({
    status: 'online',
    integrations: {
      tidb: dbStatus,
      cloudinary: shared.cloudinary ? 'configured' : 'mocked',
      resend: shared.resend ? 'configured' : 'mocked',
      fonnte: process.env.FONNTE_TOKEN ? 'configured' : 'mocked'
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
    if (process.env.CLOUDINARY_CLOUD_NAME) {
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

      if (error) {
        throw new Error(error.message);
      }

      return res.json({ success: true, id: data.id });
    } else {
      console.log(`Mocked Email Dispatch:\nTo: ${to}\nSubject: ${subject}\nHTML: ${htmlContent}`);
      return res.json({ success: true, mock: true });
    }
  } catch (err) {
    console.error('Email Dispatch Error:', err);
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

// Config endpoint
router.get('/config', (req, res) => {
  res.json({
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || 'MOCK_CLIENT_KEY',
    mock: !shared.isMidtransConfigured
  });
});

// GET Bookings from local persistence
router.get('/bookings', (req, res) => {
  res.json(shared.bookings);
});

// GET Members from local persistence
router.get('/members', (req, res) => {
  res.json(shared.members);
});

// Initiate a Midtrans Snap transaction
router.post('/midtrans/create-transaction', async (req, res) => {
  const { type, amount, name, phone, bookingDetails } = req.body;
  if (!type || !amount || !name || !phone) {
    return res.status(400).json({ error: 'type, amount, name, and phone are required' });
  }

  const orderId = `${type === 'booking' ? 'BOOK' : 'MEMB'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

  if (!shared.isMidtransConfigured) {
    console.log(`[Midtrans Mock] Creating transaction ${orderId} for ${name} amount Rp ${amount}`);
    
    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      if (!shared.bookings[courtId]) shared.bookings[courtId] = {};
      if (!shared.bookings[courtId][dateKey]) shared.bookings[courtId][dateKey] = {};
      shared.bookings[courtId][dateKey][slotKey] = {
        name,
        phone,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      shared.saveBookingsToFile();
    } else if (type === 'membership') {
      shared.pendingMemberships[orderId] = { username: name, phone };
    }

    return res.json({
      token: `mock-snap-token-${orderId}`,
      orderId,
      mock: true
    });
  }

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

    const transaction = await shared.snap.createTransaction(parameter);
    
    if (type === 'booking' && bookingDetails) {
      const { courtId, dateKey, slotKey, total } = bookingDetails;
      if (!shared.bookings[courtId]) shared.bookings[courtId] = {};
      if (!shared.bookings[courtId][dateKey]) shared.bookings[courtId][dateKey] = {};
      shared.bookings[courtId][dateKey][slotKey] = {
        name,
        phone,
        status: 'waiting_dp',
        paid: 0,
        total,
        orderId
      };
      shared.saveBookingsToFile();
    } else if (type === 'membership') {
      shared.pendingMemberships[orderId] = { username: name, phone };
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
router.get('/midtrans/check-status', async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  if (!shared.isMidtransConfigured || order_id.startsWith('mock') || order_id.includes('MOCK')) {
    const result = await shared.confirmPayment(order_id, 'qris', order_id.startsWith('BOOK') ? 50000 : 20000);
    return res.json(result);
  }

  try {
    const statusResponse = await shared.snap.transaction.status(order_id);
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Manual status check for ${order_id}: ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (transactionStatus === 'capture' && fraudStatus === 'challenge') {
        return res.json({ success: false, status: 'challenge', error: 'Payment is challenged' });
      } else {
        const grossAmount = parseInt(statusResponse.gross_amount);
        const confirmResult = await shared.confirmPayment(order_id, statusResponse.payment_type, grossAmount);
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

    console.log(`Transaction notification received. Order ID: ${orderId}. Status: ${transactionStatus}`);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (transactionStatus === 'capture' && fraudStatus === 'challenge') {
        console.log(`Transaction challenged: ${orderId}`);
      } else {
        const grossAmount = parseInt(statusResponse.gross_amount);
        await shared.confirmPayment(orderId, statusResponse.payment_type, grossAmount);
      }
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      console.log(`Transaction failed/cancelled/expired: ${orderId}`);
      if (orderId.startsWith('BOOK-')) {
        for (const courtId in shared.bookings) {
          for (const dateKey in shared.bookings[courtId]) {
            for (const slotKey in shared.bookings[courtId][dateKey]) {
              const b = shared.bookings[courtId][dateKey][slotKey];
              if (b.orderId === orderId && b.status === 'waiting_dp') {
                delete shared.bookings[courtId][dateKey][slotKey];
                shared.saveBookingsToFile();
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

module.exports = router;
