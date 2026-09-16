// Aktar Marka — онлайн дэлгүүр ба удирдлагын систем
'use strict';

process.env.TZ = process.env.TZ || 'Asia/Ulaanbaatar';

const path = require('node:path');
const express = require('express');

const { ensureDefaultAdmin, optionalUser } = require('./src/auth');
const accountRoutes = require('./src/routes/account');
const { store, cart, orders, payments } = require('./src/routes/store');
const adminRoutes = require('./src/routes/admin');
const shop = require('./src/shop');
const qpay = require('./src/qpay');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Cookie-д суурилсан нэвтрэлттэй тул өөр домэйноос ирсэн бичих хүсэлтийг хаана (CSRF)
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/payments/qpay/callback')) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* "null" гэх мэт буруу origin */
    }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Хүсэлтийг зөвшөөрөхгүй' });
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

app.use('/api/account', accountRoutes);
app.use('/api/store', store);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/payments', payments);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ийм зам олдсонгүй' }));

const PUBLIC = path.join(__dirname, 'public');
const staticOpts = {
  etag: true,
  redirect: false,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
  },
};
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads'), { maxAge: '30d', fallthrough: false }));
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));
app.use(express.static(PUBLIC, { ...staticOpts, index: false }));

// Дэлгүүрийн SPA — API биш бүх GET хүсэлтэд shell буцаана (client-side router)
app.get(/^\/(?!api\/|admin\/|uploads\/).*/, optionalUser, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  const msg =
    err.code === 'LIMIT_FILE_SIZE' ? 'Файлын хэмжээ хэт том байна'
    : status >= 500 && !err.qpay ? 'Серверийн алдаа гарлаа'
    : typeof err.type === 'string' ? 'Хүсэлтийн формат буруу байна'
    : err.message || 'Буруу хүсэлт';
  res.status(status).json({ error: msg });
});

ensureDefaultAdmin();

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => {
    console.log(`Aktar Marka: http://${HOST}:${PORT}  (админ: /admin)`);
    console.log(`QPay горим: ${qpay.isMock() ? 'MOCK (туршилт — мерчант мэдээлэл тохируулаагүй)' : 'LIVE'}`);
  });
  // Callback ирээгүй төлбөрийг минут тутам шалгаж, хугацаа дууссан захиалгыг цуцална
  setInterval(() => shop.sweepPendingPayments().catch((e) => console.error(e)), 60_000).unref();
}

module.exports = app;
