// Нэвтрэлт — scrypt нууц үг, SQLite session, HttpOnly cookie, rate-limit, OTP.
'use strict';

const crypto = require('node:crypto');
const { db } = require('./db');
const { localDateTime, addMinutes, httpError } = require('./util');
const notify = require('./notify');

const ADMIN_COOKIE = 'asid';
const USER_COOKIE = 'usid';
const ADMIN_SESSION_DAYS = 7;
const USER_SESSION_DAYS = 30;

// ---------------- Нууц үг ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `s2:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [tag, salt, hash] = String(stored).split(':');
    if (tag !== 's2') return false;
    const calc = crypto.scryptSync(String(password), salt, 64);
    return crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// ---------------- Cookie ----------------
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* эвдэрсэн cookie-г алгасна */
      }
    }
  }
  return out;
}
function setSessionCookie(req, res, name, token, days) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: days * 86400_000,
  });
}

// ---------------- Session (ерөнхий) ----------------
function sessionStore(table, ownerCol, days) {
  const ins = db.prepare(`INSERT INTO ${table} (token, ${ownerCol}, created_at, expires_at) VALUES (?, ?, ?, ?)`);
  const get = db.prepare(`SELECT * FROM ${table} WHERE token = ?`);
  const del = db.prepare(`DELETE FROM ${table} WHERE token = ?`);
  const cleanup = db.prepare(`DELETE FROM ${table} WHERE expires_at < ?`);
  return {
    create(owner) {
      const token = crypto.randomBytes(32).toString('base64url');
      const now = new Date();
      ins.run(token, owner, localDateTime(now), localDateTime(new Date(now.getTime() + days * 86400_000)));
      return token;
    },
    get(token) {
      if (!token) return null;
      const row = get.get(token);
      if (!row) return null;
      if (row.expires_at < localDateTime()) {
        del.run(token);
        return null;
      }
      return row;
    },
    destroy(token) {
      if (token) del.run(token);
    },
    cleanup() {
      cleanup.run(localDateTime());
    },
  };
}
const adminSessions = sessionStore('admin_sessions', 'username', ADMIN_SESSION_DAYS);
const userSessions = sessionStore('user_sessions', 'user_id', USER_SESSION_DAYS);

// ---------------- Middleware ----------------
function requireAdmin(req, res, next) {
  const s = adminSessions.get(parseCookies(req)[ADMIN_COOKIE]);
  if (!s) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  req.admin = s.username;
  next();
}

const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
function currentUser(req) {
  const s = userSessions.get(parseCookies(req)[USER_COOKIE]);
  if (!s) return null;
  const u = getUserStmt.get(s.user_id);
  if (!u || u.is_blocked) return null;
  return u;
}
function optionalUser(req, res, next) {
  req.user = currentUser(req);
  next();
}
function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Үргэлжлүүлэхийн тулд нэвтэрнэ үү', code: 'AUTH_REQUIRED' });
  req.user = u;
  next();
}

// ---------------- Rate limit (санах ойд) ----------------
const buckets = new Map();
function rateLimit({ key, max, windowMs, message }) {
  return (req, res, next) => {
    const id = `${key}:${req.ip || req.socket.remoteAddress || '?'}`;
    const now = Date.now();
    let b = buckets.get(id);
    if (!b || now > b.resetAt) b = { count: 0, resetAt: now + windowMs };
    if (b.count >= max) {
      return res.status(429).json({ error: message || 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' });
    }
    b.count++;
    buckets.set(id, b);
    next();
  };
}
function resetRateLimit(req, key) {
  buckets.delete(`${key}:${req.ip || req.socket.remoteAddress || '?'}`);
}

// ---------------- OTP ----------------
const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SEC = 60;

function hashOtp(target, code) {
  return crypto.createHash('sha256').update(`${target}:${code}`).digest('hex');
}

async function issueOtp(identifier) {
  const last = db
    .prepare('SELECT created_at FROM otp_codes WHERE target = ? ORDER BY id DESC LIMIT 1')
    .get(identifier.value);
  if (last && last.created_at > localDateTime(new Date(Date.now() - OTP_RESEND_SEC * 1000))) {
    throw httpError(429, `Кодыг ${OTP_RESEND_SEC} секундын дараа дахин илгээнэ үү`);
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  db.prepare(
    'INSERT INTO otp_codes (target, channel, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(identifier.value, identifier.type, hashOtp(identifier.value, code), localDateTime(now), localDateTime(addMinutes(now, OTP_TTL_MIN)));
  await notify.sendOtp(identifier, code, OTP_TTL_MIN);
  return { ttl_minutes: OTP_TTL_MIN, resend_seconds: OTP_RESEND_SEC, dev_code: notify.exposeDevCode() ? code : undefined };
}

function consumeOtp(identifier, code) {
  const row = db
    .prepare('SELECT * FROM otp_codes WHERE target = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(identifier.value);
  if (!row || row.expires_at < localDateTime()) throw httpError(400, 'Код хүчингүй эсвэл хугацаа дууссан байна');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw httpError(429, 'Хэт олон буруу оролдлого. Шинэ код авна уу.');
  const ok = crypto.timingSafeEqual(
    Buffer.from(hashOtp(identifier.value, String(code || '').trim())),
    Buffer.from(row.code_hash)
  );
  if (!ok) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw httpError(400, 'Код буруу байна');
  }
  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(localDateTime(), row.id);
  return true;
}

// ---------------- Админ ----------------
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = '12345678';

function setAdminPassword(username, password) {
  const hash = hashPassword(password);
  const exists = db.prepare('SELECT 1 FROM admin_users WHERE username = ?').get(username);
  if (exists) db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, username);
  else
    db.prepare('INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)').run(
      username,
      hash,
      localDateTime()
    );
  db.prepare('DELETE FROM admin_sessions WHERE username = ?').run(username);
}

function ensureDefaultAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM admin_users').get();
  if (row.n === 0) {
    const pw = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASS;
    setAdminPassword(DEFAULT_ADMIN_USER, pw);
    console.log(`Админ хэрэглэгч үүслээ → нэр: ${DEFAULT_ADMIN_USER}, нууц үг: ${pw} (Тохиргоо хэсгээс солино уу)`);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, 5 * 60_000).unref();
setInterval(() => {
  adminSessions.cleanup();
  userSessions.cleanup();
  db.prepare('DELETE FROM otp_codes WHERE expires_at < ?').run(localDateTime(new Date(Date.now() - 86400_000)));
}, 6 * 3600_000).unref();

module.exports = {
  ADMIN_COOKIE,
  USER_COOKIE,
  ADMIN_SESSION_DAYS,
  USER_SESSION_DAYS,
  hashPassword,
  verifyPassword,
  parseCookies,
  setSessionCookie,
  adminSessions,
  userSessions,
  requireAdmin,
  requireUser,
  optionalUser,
  currentUser,
  rateLimit,
  resetRateLimit,
  issueOtp,
  consumeOtp,
  setAdminPassword,
  ensureDefaultAdmin,
};
