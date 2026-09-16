// Өгөгдлийн сан — Node 22+ built-in SQLite (node:sqlite).
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shop.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE,
  phone         TEXT UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  is_blocked    INTEGER NOT NULL DEFAULT 0,
  address       TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target      TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('email','phone')),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp_target ON otp_codes(target, created_at);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                 TEXT UNIQUE NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  brand               TEXT NOT NULL DEFAULT '',
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price               INTEGER NOT NULL CHECK (price >= 0),
  compare_price       INTEGER NOT NULL DEFAULT 0,
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  volume              TEXT NOT NULL DEFAULT '',
  short_desc          TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  benefits            TEXT NOT NULL DEFAULT '[]',
  usage               TEXT NOT NULL DEFAULT '[]',
  is_active           INTEGER NOT NULL DEFAULT 1,
  is_featured         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pimg_product ON product_images(product_id, sort);

CREATE TABLE IF NOT EXISTS stock_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change      INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('in','out','adjust','order','cancel','import','initial')),
  reason      TEXT NOT NULL DEFAULT '',
  order_id    INTEGER,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stockmv_product ON stock_movements(product_id, created_at);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  added_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no         TEXT UNIQUE NOT NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  payment_status   TEXT NOT NULL DEFAULT 'pending'
                   CHECK (payment_status IN ('pending','paid','cancelled')),
  payment_method   TEXT NOT NULL DEFAULT 'qpay',
  order_seq        INTEGER NOT NULL DEFAULT 1,
  subtotal         INTEGER NOT NULL,
  discount_pct     INTEGER NOT NULL DEFAULT 0,
  discount_amount  INTEGER NOT NULL DEFAULT 0,
  shipping_fee     INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  customer_name    TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  paid_at          TEXT,
  cancelled_at     TEXT,
  cancel_reason    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_paid ON orders(payment_status, paid_at);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku        TEXT NOT NULL,
  name       TEXT NOT NULL,
  image      TEXT NOT NULL DEFAULT '',
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  line_total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oitems_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_oitems_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('status','payment')),
  from_value  TEXT,
  to_value    TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_osh_order ON order_status_history(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'qpay',
  mode                TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','mock')),
  invoice_id          TEXT NOT NULL,
  amount              INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','expired')),
  qr_text             TEXT NOT NULL DEFAULT '',
  qr_image            TEXT NOT NULL DEFAULT '',
  short_url           TEXT NOT NULL DEFAULT '',
  deeplinks           TEXT NOT NULL DEFAULT '[]',
  provider_payment_id TEXT,
  paid_amount         INTEGER NOT NULL DEFAULT 0,
  mock_paid           INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  checked_at          TEXT,
  paid_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---- Тохиргооны анхны утгууд (админ хэсгээс өөрчилнө) ----
const DEFAULT_SETTINGS = {
  business: {
    name: 'Aktar Marka',
    tagline: 'Эрүүл амьдралын бүтээгдэхүүн',
    phones: ['7744-4044', '8060-8618'],
    email: '',
    hours: '09:00 - 21:00',
    address: 'Орчлон комплекс В-1 давхар 09 тоот',
    address_note:
      'Бөхийн өргөө автобус буудлын баруун талд төв зам дагуу ХААЯамны чанх өөдөөс харсан худалдааны төв',
    facebook: '',
    instagram: '',
  },
  // Захиалгын дараалалд суурилсан хямдрал: min_order-оос эхлэн pct% хямдрал.
  // Хамгийн өндөр min_order нь түүнээс хойшхи бүх захиалгад үйлчилнэ.
  loyalty: {
    enabled: true,
    tiers: [
      { min_order: 1, pct: 0, name: 'Шинэ гишүүн' },
      { min_order: 2, pct: 10, name: 'Мөнгөн гишүүн' },
      { min_order: 3, pct: 20, name: 'Алтан гишүүн' },
    ],
  },
  delivery: {
    fee: 5000,
    free_over: 150000,
    note: 'Улаанбаатар хот дотор 24-48 цагийн дотор хүргэнэ',
  },
  payment: {
    invoice_ttl_minutes: 30,
  },
  home: {
    banners: [
      { image: '/img/brand/banner-store.webp', link: '/products', title: 'Aktar Marka' },
    ],
    featured_title: 'Онцлох бүтээгдэхүүн',
  },
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key) {
  const row = getSettingStmt.get(key);
  if (!row) return structuredClone(DEFAULT_SETTINGS[key]);
  try {
    return JSON.parse(row.value);
  } catch {
    return structuredClone(DEFAULT_SETTINGS[key]);
  }
}
function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}
for (const key of Object.keys(DEFAULT_SETTINGS)) {
  if (!getSettingStmt.get(key)) setSetting(key, DEFAULT_SETTINGS[key]);
}

// Гүйлгээ — алдаа гарвал буцаана
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, tx, getSetting, setSetting, DEFAULT_SETTINGS, DB_PATH };
