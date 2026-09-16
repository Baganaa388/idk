// Хэрэглэгчийн бүртгэл/нэвтрэлт (нууц үг эсвэл OTP), профайл.
'use strict';

const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { parseIdentifier, localDateTime, httpError, clampStr } = require('../util');
const { loyaltyStatus } = require('../shop');

const router = express.Router();

const loginLimit = auth.rateLimit({ key: 'ulogin', max: 10, windowMs: 15 * 60_000 });
const otpLimit = auth.rateLimit({ key: 'otp', max: 6, windowMs: 15 * 60_000, message: 'Хэт олон код хүссэн байна. 15 минутын дараа оролдоно уу.' });

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    address: u.address,
    verified: !!u.verified,
    has_password: !!u.password_hash,
    created_at: u.created_at,
  };
}

function findByIdentifier(ident) {
  return db.prepare(`SELECT * FROM users WHERE ${ident.type} = ?`).get(ident.value) || null;
}

function startSession(req, res, user) {
  const token = auth.userSessions.create(user.id);
  auth.setSessionCookie(req, res, auth.USER_COOKIE, token, auth.USER_SESSION_DAYS);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(localDateTime(), user.id);
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw httpError(400, 'Нууц үг хамгийн багадаа 8 тэмдэгт байна');
  if (pw.length > 128) throw httpError(400, 'Нууц үг хэт урт байна');
}

// Бүртгүүлэх — и-мэйл эсвэл утас + нууц үг
const registerLimit = auth.rateLimit({ key: 'uregister', max: 10, windowMs: 15 * 60_000 });

router.post('/register', registerLimit, (req, res) => {
  const ident = parseIdentifier(req.body.identifier);
  if (!ident) throw httpError(400, 'И-мэйл хаяг эсвэл 8 оронтой утасны дугаар оруулна уу');
  validatePassword(req.body.password);
  if (findByIdentifier(ident)) throw httpError(409, 'Энэ хаягаар бүртгэл үүссэн байна. Нэвтэрнэ үү.');
  const info = db
    .prepare(`INSERT INTO users (${ident.type}, name, password_hash, created_at) VALUES (?, ?, ?, ?)`)
    .run(ident.value, clampStr(req.body.name, 80), auth.hashPassword(req.body.password), localDateTime());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  startSession(req, res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', loginLimit, (req, res) => {
  const ident = parseIdentifier(req.body.identifier);
  const user = ident && findByIdentifier(ident);
  if (!user || !user.password_hash || !auth.verifyPassword(req.body.password, user.password_hash)) {
    throw httpError(401, 'Нэвтрэх нэр эсвэл нууц үг буруу байна');
  }
  if (user.is_blocked) throw httpError(403, 'Таны бүртгэл түр хаагдсан байна');
  auth.resetRateLimit(req, 'ulogin');
  startSession(req, res, user);
  res.json({ user: publicUser(user) });
});

// OTP — код илгээх (бүртгэлгүй бол баталгаажуулсны дараа автоматаар бүртгэнэ)
router.post('/otp/request', otpLimit, async (req, res) => {
  const ident = parseIdentifier(req.body.identifier);
  if (!ident) throw httpError(400, 'И-мэйл хаяг эсвэл 8 оронтой утасны дугаар оруулна уу');
  const existing = findByIdentifier(ident);
  if (existing && existing.is_blocked) throw httpError(403, 'Таны бүртгэл түр хаагдсан байна');
  const r = await auth.issueOtp(ident);
  res.json({ sent: true, channel: ident.type, is_new: !existing, ...r });
});

router.post('/otp/verify', loginLimit, (req, res) => {
  const ident = parseIdentifier(req.body.identifier);
  if (!ident) throw httpError(400, 'И-мэйл хаяг эсвэл утасны дугаар буруу байна');
  auth.consumeOtp(ident, req.body.code);
  let user = findByIdentifier(ident);
  if (!user) {
    const info = db
      .prepare(`INSERT INTO users (${ident.type}, name, verified, created_at) VALUES (?, ?, 1, ?)`)
      .run(ident.value, clampStr(req.body.name, 80), localDateTime());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  } else if (!user.verified) {
    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(user.id);
    user.verified = 1;
  }
  if (user.is_blocked) throw httpError(403, 'Таны бүртгэл түр хаагдсан байна');
  auth.resetRateLimit(req, 'ulogin');
  startSession(req, res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  auth.userSessions.destroy(auth.parseCookies(req)[auth.USER_COOKIE]);
  res.clearCookie(auth.USER_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', auth.requireUser, (req, res) => {
  res.json({ user: publicUser(req.user), loyalty: loyaltyStatus(req.user.id) });
});

router.patch('/me', auth.requireUser, (req, res) => {
  const u = req.user;
  const name = req.body.name !== undefined ? clampStr(req.body.name, 80) : u.name;
  const address = req.body.address !== undefined ? clampStr(req.body.address, 400) : u.address;
  const updates = { name, address, email: u.email, phone: u.phone };
  for (const field of ['email', 'phone']) {
    if (req.body[field] === undefined || req.body[field] === (u[field] || '')) continue;
    if (req.body[field] === '' || req.body[field] === null) {
      updates[field] = null;
      continue;
    }
    const ident = parseIdentifier(req.body[field]);
    if (!ident || ident.type !== field) throw httpError(400, field === 'email' ? 'И-мэйл хаяг буруу байна' : 'Утасны дугаар буруу байна');
    const other = findByIdentifier(ident);
    if (other && other.id !== u.id) throw httpError(409, 'Энэ хаяг өөр бүртгэлд ашиглагдаж байна');
    updates[field] = ident.value;
  }
  if (!updates.email && !updates.phone) throw httpError(400, 'И-мэйл эсвэл утасны дугаарын аль нэг заавал байна');
  db.prepare('UPDATE users SET name = ?, address = ?, email = ?, phone = ? WHERE id = ?').run(
    updates.name,
    updates.address,
    updates.email,
    updates.phone,
    u.id
  );
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

router.post('/password', auth.requireUser, (req, res) => {
  const u = req.user;
  if (u.password_hash && !auth.verifyPassword(req.body.current_password, u.password_hash)) {
    throw httpError(400, 'Одоогийн нууц үг буруу байна');
  }
  validatePassword(req.body.new_password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(req.body.new_password), u.id);
  res.json({ ok: true });
});

module.exports = router;
