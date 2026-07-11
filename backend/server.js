const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Load routers
const adminRouter = require('./admin/adminRoutes');
const utamaRouter = require('./utama/utamaRoutes');

// Mount API routes
app.use('/api', adminRouter);
app.use('/api', utamaRouter);

// Serve frontend assets statically
// 1. Client/Utama static website at '/'
app.use('/', express.static(path.join(__dirname, '../frontend/utama')));

// 2. Admin static portal at '/admin'
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));

// Start Express Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Putra Abadi Backend Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
