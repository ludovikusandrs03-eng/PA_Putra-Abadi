const express = require('express');
const router = express.Router();
const shared = require('../shared');

// POST Bookings to update persistence
router.post('/bookings', (req, res) => {
  try {
    shared.bookings = req.body;
    shared.saveBookingsToFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Members to update persistence
router.post('/members', (req, res) => {
  try {
    shared.members = req.body;
    shared.saveMembersToFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
