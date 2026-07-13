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

-- 2. Tabel member
CREATE TABLE IF NOT EXISTS members (
  username    VARCHAR(100) PRIMARY KEY,
  phone       VARCHAR(30)  DEFAULT '',
  password    VARCHAR(255) NOT NULL,
  is_member   BOOLEAN      DEFAULT FALSE,
  expiry_date VARCHAR(50)  DEFAULT '',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Guest
CREATE TABLE IF NOT EXISTS guests (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  phone      VARCHAR(30)  NOT NULL,
  password   VARCHAR(255) DEFAULT NULL,
  user_type  VARCHAR(20)  NOT NULL DEFAULT 'guest',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  -- Satu tamu diidentifikasi oleh kombinasi nama + nomor HP
  UNIQUE KEY uk_guest (name, phone)
);

-- 4. Tabel booking lapangan
CREATE TABLE IF NOT EXISTS bookings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  court_id     VARCHAR(20)   NOT NULL,
  date_key     VARCHAR(20)   NOT NULL,
  slot_key     VARCHAR(50)   NOT NULL,
  name         VARCHAR(150)  NOT NULL,
  phone        VARCHAR(30)   DEFAULT '',
  booker_type  VARCHAR(20)   NOT NULL DEFAULT 'guest',
  guest_id     INT           DEFAULT NULL,
  status       VARCHAR(30)   NOT NULL DEFAULT 'waiting_dp',
  paid         DECIMAL(12,2) DEFAULT 0,
  total        DECIMAL(12,2) DEFAULT 0,
  order_id     VARCHAR(100)  DEFAULT '',
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_booking (court_id, date_key, slot_key)
);

-- 6. Tabel Payment
CREATE TABLE IF NOT EXISTS payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     VARCHAR(100)  NOT NULL,
  order_type   VARCHAR(30)   DEFAULT 'booking',
  amount       DECIMAL(12,2) DEFAULT 0,
  payment_type VARCHAR(50)   DEFAULT 'qris',
  status       VARCHAR(30)   DEFAULT 'paid',
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
