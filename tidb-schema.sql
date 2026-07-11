-- ============================================================
--  Putra Abadi Sport Center - TiDB Schema
-- ============================================================

-- 1. Tabel kredensial admin
CREATE TABLE IF NOT EXISTS admin_credentials (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  email      VARCHAR(255) DEFAULT '',
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed data admin default (password: admin123)
INSERT INTO admin_credentials (username, password, email)
VALUES ('admin', 'admin123', '')
ON DUPLICATE KEY UPDATE
  password   = VALUES(password),
  email      = VALUES(email);

-- ----------------------------------------------------------------

-- 2. Tabel member
CREATE TABLE IF NOT EXISTS members (
  username    VARCHAR(100) PRIMARY KEY,
  phone       VARCHAR(30)  DEFAULT '',
  password    VARCHAR(255) NOT NULL,
  is_member   BOOLEAN      DEFAULT FALSE,
  expiry_date VARCHAR(50)  DEFAULT '',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------

-- 3. Tabel tamu / non-member (booking tanpa akun)
--    Tamu tidak punya password. Data disimpan agar riwayat booking
--    tidak hilang saat server restart.
--    user_type : "guest" (tidak punya akun, booking langsung)
CREATE TABLE IF NOT EXISTS guests (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  phone      VARCHAR(30)  NOT NULL,
  user_type  VARCHAR(20)  NOT NULL DEFAULT 'guest',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  -- Satu tamu diidentifikasi oleh kombinasi nama + nomor HP
  UNIQUE KEY uk_guest (name, phone)
);

-- ----------------------------------------------------------------

-- 5. Tabel booking lapangan
--    court_id  : nomor lapangan (mis. "1", "2")
--    date_key  : tanggal sesi   (mis. "2025-07-09")
--    slot_key  : jam sesi       (mis. "19:00 - 20:00")
--    status flow:
--      waiting_dp   -> booking dibuat, menunggu pembayaran DP via Midtrans
--      confirmed_dp -> DP diterima & tervalidasi otomatis oleh Midtrans webhook
--      settled      -> admin melunasi sisa tagihan di lapangan
--      cancelled    -> dibatalkan oleh admin
CREATE TABLE IF NOT EXISTS bookings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  court_id     VARCHAR(20)   NOT NULL,
  date_key     VARCHAR(20)   NOT NULL,
  slot_key     VARCHAR(50)   NOT NULL,
  name         VARCHAR(150)  NOT NULL,
  phone        VARCHAR(30)   DEFAULT '',
  booker_type  VARCHAR(20)   NOT NULL DEFAULT 'guest',
  -- booker_type: 'member' | 'user' | 'guest'
  -- guest_id NULL berarti yang booking adalah member/user terdaftar
  guest_id     INT           DEFAULT NULL,
  status       VARCHAR(30)   NOT NULL DEFAULT 'waiting_dp',
  paid         DECIMAL(12,2) DEFAULT 0,
  total        DECIMAL(12,2) DEFAULT 0,
  order_id     VARCHAR(100)  DEFAULT '',
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_booking (court_id, date_key, slot_key)
);

-- ----------------------------------------------------------------

-- 6. Tabel riwayat pembayaran
--    order_type : "booking" | "membership"
--    status     : "paid" | "pending" | "failed"
CREATE TABLE IF NOT EXISTS payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     VARCHAR(100)  NOT NULL,
  order_type   VARCHAR(30)   DEFAULT 'booking',
  amount       DECIMAL(12,2) DEFAULT 0,
  payment_type VARCHAR(50)   DEFAULT 'qris',
  status       VARCHAR(30)   DEFAULT 'paid',
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
