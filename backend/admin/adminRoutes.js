const express = require('express');
const router = express.Router();
const shared = require('../shared');

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    const currentConfig = await shared.getAdminAccount(username);

    if (email) {
      await shared.saveAdminAccount({ username: currentConfig?.username || username, password: currentConfig?.password || password, email });
    }

    if (username === currentConfig?.username && password === currentConfig?.password) {
      const updatedConfig = await shared.getAdminAccount(username);
      res.json({
        success: true,
        username: updatedConfig.username,
        email: updatedConfig.email || email || ''
      });
    } else {
      res.status(401).json({ success: false, error: 'Kredensial Admin salah!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/admin/change-password', async (req, res) => {
  try {
    const { username, currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!username || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'Semua field wajib diisi.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Konfirmasi password tidak sama.' });
    }

    const currentAccount = await shared.getAdminAccount(username);
    if (!currentAccount || currentAccount.username !== username || currentAccount.password !== currentPassword) {
      return res.status(401).json({ success: false, error: 'Password lama tidak sesuai.' });
    }

    const updatedAccount = await shared.saveAdminAccount({ username, password: newPassword, email: currentAccount.email || '' });
    res.json({ success: true, message: 'Password admin berhasil diperbarui.', account: updatedAccount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/admin/forgot-password', async (req, res) => {
  try {
    const { username, email } = req.body || {};
    const currentConfig = shared.getAdminConfig();
    const targetEmail = email || currentConfig.email;

    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'Masukkan email admin terlebih dahulu.' });
    }

    if (username && username !== currentConfig.username) {
      return res.status(404).json({ success: false, error: 'Username admin tidak ditemukan.' });
    }

    shared.updateAdminConfig({ email: targetEmail });
    const result = await shared.sendAdminPasswordResetEmail(targetEmail, currentConfig.username, currentConfig.password);

    if (result.success) {
      res.json({
        success: true,
        message: `Password admin berhasil dikirim ke ${targetEmail}.`,
        email: targetEmail,
        mock: !!result.mock
      });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Gagal mengirim password ke email admin.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Bookings to update persistence
router.post('/bookings', async (req, res) => {
  try {
    shared.bookings = req.body;
    shared.saveBookingsToFile();
    await shared.syncBookingsToDatabase();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Members to update persistence
router.post('/members', async (req, res) => {
  try {
    shared.members = req.body;
    shared.saveMembersToFile();
    await shared.syncMembersToDatabase();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Guests list (tamu non-member yang pernah booking)
router.get('/guests', async (req, res) => {
  try {
    const guests = await shared.getGuestsFromDatabase();
    res.json({ success: true, guests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    await shared.savePaymentRecordToDatabase(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
