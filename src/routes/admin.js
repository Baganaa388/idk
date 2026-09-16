// Админ API — бараа, категори, агуулах, импорт, захиалга, хэрэглэгч, анализ, тохиргоо.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const { db, tx, getSetting, setSetting } = require('../db');
const auth = require('../auth');
const shop = require('../shop');
const qpay = require('../qpay');
const importer = require('../importer');
const analytics = require('../analytics');
const { localDateTime, localDate, httpError, slugify, toInt, clampStr } = require('../util');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype) ? cb(null, true) : cb(httpError(400, 'Зөвхөн зураг (jpg, png, webp) оруулна уу')),
});
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Зургийг webp болгож хэмжээг тохируулна (EXIF-ээр эргүүлж, мета өгөгдлийг хасна)
async function saveImage(file) {
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.webp`;
  try {
    await sharp(file.buffer).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(UPLOAD_DIR, name));
  } catch {
    throw httpError(400, 'Зургийн файл эвдэрсэн эсвэл дэмжигдэхгүй байна');
  }
  return `/uploads/${name}`;
}

// ---------------- Нэвтрэлт ----------------
const loginLimit = auth.rateLimit({ key: 'alogin', max: 10, windowMs: 15 * 60_000, message: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу.' });

router.post('/login', loginLimit, (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(String(username || ''));
  if (!row || !auth.verifyPassword(password, row.password_hash)) throw httpError(401, 'Нэвтрэх нэр эсвэл нууц үг буруу');
  auth.resetRateLimit(req, 'alogin');
  const token = auth.adminSessions.create(row.username);
  auth.setSessionCookie(req, res, auth.ADMIN_COOKIE, token, auth.ADMIN_SESSION_DAYS);
  res.json({ username: row.username });
});

router.use(auth.requireAdmin);

router.post('/logout', (req, res) => {
  auth.adminSessions.destroy(auth.parseCookies(req)[auth.ADMIN_COOKIE]);
  res.clearCookie(auth.ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});
router.get('/me', (req, res) => res.json({ username: req.admin, payment_mode: qpay.isMock() ? 'mock' : 'live' }));
router.post('/password', (req, res) => {
  const row = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(req.admin);
  if (!auth.verifyPassword(req.body.current_password, row.password_hash)) throw httpError(400, 'Одоогийн нууц үг буруу');
  if (typeof req.body.new_password !== 'string' || req.body.new_password.length < 8) throw httpError(400, 'Шинэ нууц үг хамгийн багадаа 8 тэмдэгт');
  auth.setAdminPassword(req.admin, req.body.new_password);
  const token = auth.adminSessions.create(req.admin);
  auth.setSessionCookie(req, res, auth.ADMIN_COOKIE, token, auth.ADMIN_SESSION_DAYS);
  res.json({ ok: true });
});

// ---------------- Хяналтын самбар ----------------
router.get('/dashboard', (req, res) => res.json(analytics.dashboard()));

// ---------------- Категори ----------------
router.get('/categories', (req, res) => {
  const flat = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
              (SELECT COUNT(*) FROM categories ch WHERE ch.parent_id = c.id) AS child_count
       FROM categories c ORDER BY c.sort, c.name`
    )
    .all();
  res.json({ categories: flat, tree: shop.categoryTree({ includeInactive: true }) });
});

function categoryInput(body, id = null) {
  const name = clampStr(body.name, 80);
  if (!name) throw httpError(400, 'Категорийн нэр оруулна уу');
  const slug = slugify(body.slug || name);
  const dup = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (dup && dup.id !== id) throw httpError(409, `"${slug}" slug давхцаж байна`);
  let parentId = body.parent_id ? toInt(body.parent_id) : null;
  if (parentId) {
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(parentId)) throw httpError(400, 'Эцэг категори олдсонгүй');
    if (id && shop.categoryDescendantIds(id).includes(parentId)) throw httpError(400, 'Категорийг өөрийн дэд категорид байрлуулах боломжгүй');
  }
  return { name, slug, parentId, sort: toInt(body.sort, 0), is_active: body.is_active === false ? 0 : 1 };
}

router.post('/categories', (req, res) => {
  const c = categoryInput(req.body);
  const info = db
    .prepare('INSERT INTO categories (parent_id, name, slug, sort, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.parentId, c.name, c.slug, c.sort, c.is_active, localDateTime());
  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(info.lastInsertRowid)) });
});
router.put('/categories/:id', (req, res) => {
  const id = toInt(req.params.id);
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id)) throw httpError(404, 'Категори олдсонгүй');
  const c = categoryInput(req.body, id);
  db.prepare('UPDATE categories SET parent_id = ?, name = ?, slug = ?, sort = ?, is_active = ? WHERE id = ?').run(c.parentId, c.name, c.slug, c.sort, c.is_active, id);
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
});
router.delete('/categories/:id', (req, res) => {
  const id = toInt(req.params.id);
  if (db.prepare('SELECT 1 FROM categories WHERE parent_id = ?').get(id)) throw httpError(409, 'Дэд категоритой тул устгах боломжгүй');
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id).n;
  if (n) throw httpError(409, `Энэ категорид ${n} бараа байна. Эхлээд барааг шилжүүлнэ үү.`);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- Бараа ----------------
router.get('/products', (req, res) => {
  const { q, category, status, stock, sort, page, limit, brand } = req.query;
  res.json(shop.listProducts({ q, category, status, stock, sort: sort || 'new', page, limit: limit || 20, brand, includeInactive: true }));
});

router.get('/products/:id', (req, res) => {
  const p = shop.getProduct({ id: req.params.id }, { includeInactive: true });
  if (!p) throw httpError(404, 'Бараа олдсонгүй');
  const movements = db.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 50').all(p.id);
  const sold = db
    .prepare(
      `SELECT COALESCE(SUM(oi.qty),0) AS qty, COALESCE(SUM(oi.line_total),0) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ? AND o.payment_status = 'paid' AND o.status != 'cancelled'`
    )
    .get(p.id);
  // Сүүлийн 30 хоногийн өдөр тутмын борлуулалт (барааны дэлгэрэнгүй график)
  const r = analytics.range(req.query.from, req.query.to, 30);
  const daily = new Map(
    db
      .prepare(
        `SELECT substr(o.paid_at,1,10) AS d, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = ? AND o.payment_status = 'paid' AND o.status != 'cancelled'
           AND substr(o.paid_at,1,10) BETWEEN ? AND ? GROUP BY d`
      )
      .all(p.id, r.from, r.to)
      .map((x) => [x.d, x])
  );
  const series = [];
  for (let d = new Date(`${r.from}T00:00:00`); d <= new Date(`${r.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    const key = localDate(d);
    const row = daily.get(key);
    series.push({ key, qty: row ? row.qty : 0, revenue: row ? row.revenue : 0 });
  }
  res.json({ product: p, movements, sold, sales_series: series });
});

function productInput(body, existing = null) {
  const name = clampStr(body.name ?? existing?.name, 160);
  if (!name) throw httpError(400, 'Барааны нэр оруулна уу');
  const sku = clampStr(body.sku ?? existing?.sku, 60).toUpperCase();
  if (!sku) throw httpError(400, 'SKU (барааны код) оруулна уу');
  const dupSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (dupSku && dupSku.id !== existing?.id) throw httpError(409, `"${sku}" SKU өөр бараанд ашиглагдсан байна`);
  let slug = slugify(body.slug || existing?.slug || name);
  const dupSlug = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
  if (dupSlug && dupSlug.id !== existing?.id) {
    if (body.slug) throw httpError(409, `"${slug}" URL давхцаж байна`);
    slug = `${slug}-${slugify(sku)}`;
  }
  const price = Math.round(Number(body.price ?? existing?.price));
  if (!Number.isFinite(price) || price < 0) throw httpError(400, 'Үнэ буруу байна');
  const categoryId = body.category_id === '' || body.category_id === null ? null : body.category_id !== undefined ? toInt(body.category_id) : existing?.category_id ?? null;
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) throw httpError(400, 'Категори олдсонгүй');
  const list = (v, prev) => {
    if (v === undefined) return prev ?? '[]';
    const arr = Array.isArray(v) ? v : String(v).split('\n');
    return JSON.stringify(arr.map((x) => clampStr(x, 600)).filter(Boolean).slice(0, 40));
  };
  const bool = (v, prev) => (v === undefined ? (prev ?? 1) : v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
  return {
    sku,
    slug,
    name,
    brand: clampStr(body.brand ?? existing?.brand, 60),
    category_id: categoryId,
    price,
    compare_price: Math.max(0, toInt(body.compare_price ?? existing?.compare_price, 0)),
    low_stock_threshold: Math.max(0, toInt(body.low_stock_threshold ?? existing?.low_stock_threshold, 5)),
    volume: clampStr(body.volume ?? existing?.volume, 120),
    short_desc: clampStr(body.short_desc ?? existing?.short_desc, 300),
    description: clampStr(body.description ?? existing?.description, 5000),
    benefits: list(body.benefits, existing && JSON.stringify(existing.benefits)),
    usage: list(body.usage, existing && JSON.stringify(existing.usage)),
    is_active: bool(body.is_active, existing ? (existing.is_active ? 1 : 0) : 1),
    is_featured: bool(body.is_featured, existing ? (existing.is_featured ? 1 : 0) : 0),
  };
}

router.post('/products', (req, res) => {
  const d = productInput(req.body || {});
  const initialStock = Math.max(0, toInt(req.body.stock, 0));
  const id = tx(() => {
    const now = localDateTime();
    const info = db
      .prepare(
        `INSERT INTO products (sku, slug, name, brand, category_id, price, compare_price, stock, low_stock_threshold, volume,
           short_desc, description, benefits, usage, is_active, is_featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(d.sku, d.slug, d.name, d.brand, d.category_id, d.price, d.compare_price, d.low_stock_threshold, d.volume,
        d.short_desc, d.description, d.benefits, d.usage, d.is_active, d.is_featured, now, now);
    const pid = Number(info.lastInsertRowid);
    if (initialStock > 0) shop.moveStock(pid, initialStock, { type: 'initial', reason: 'Анхны үлдэгдэл', actor: req.admin });
    if (Array.isArray(req.body.image_urls)) {
      const ins = db.prepare('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)');
      req.body.image_urls.filter((u) => typeof u === 'string' && /^(\/|https?:\/\/)/.test(u)).slice(0, 12).forEach((u, i) => ins.run(pid, u, i));
    }
    return pid;
  });
  res.status(201).json({ product: shop.getProduct({ id }, { includeInactive: true }) });
});

router.put('/products/:id', (req, res) => {
  const existing = shop.getProduct({ id: req.params.id }, { includeInactive: true });
  if (!existing) throw httpError(404, 'Бараа олдсонгүй');
  const d = productInput(req.body || {}, existing);
  db.prepare(
    `UPDATE products SET sku = ?, slug = ?, name = ?, brand = ?, category_id = ?, price = ?, compare_price = ?, low_stock_threshold = ?,
       volume = ?, short_desc = ?, description = ?, benefits = ?, usage = ?, is_active = ?, is_featured = ?, updated_at = ? WHERE id = ?`
  ).run(d.sku, d.slug, d.name, d.brand, d.category_id, d.price, d.compare_price, d.low_stock_threshold, d.volume,
    d.short_desc, d.description, d.benefits, d.usage, d.is_active, d.is_featured, localDateTime(), existing.id);
  // Үлдэгдлийг энд шууд өөрчлөхгүй — агуулахын хөдөлгөөнөөр (түүх үлдэнэ)
  res.json({ product: shop.getProduct({ id: existing.id }, { includeInactive: true }) });
});

router.delete('/products/:id', (req, res) => {
  const id = toInt(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw httpError(404, 'Бараа олдсонгүй');
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id);
  if (used) {
    // Захиалгын түүхэд байгаа тул идэвхгүй болгоно (тайлан эвдэхгүй)
    db.prepare('UPDATE products SET is_active = 0, is_featured = 0, updated_at = ? WHERE id = ?').run(localDateTime(), id);
    db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(id);
    return res.json({ ok: true, archived: true, message: 'Захиалгын түүхтэй тул барааг идэвхгүй болголоо' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true, deleted: true });
});

// Зураг
router.post('/products/:id/images', imageUpload.array('images', 10), async (req, res) => {
  const id = toInt(req.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw httpError(404, 'Бараа олдсонгүй');
  if (!req.files || !req.files.length) throw httpError(400, 'Зураг сонгоно уу');
  const urls = [];
  for (const f of req.files) urls.push(await saveImage(f));
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM product_images WHERE product_id = ?').get(id).m;
  const ins = db.prepare('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)');
  urls.forEach((u, i) => ins.run(id, u, maxSort + 1 + i));
  res.status(201).json({ images: shop.productImages(id) });
});
router.put('/products/:id/images/order', (req, res) => {
  const id = toInt(req.params.id);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => toInt(x)) : [];
  const upd = db.prepare('UPDATE product_images SET sort = ? WHERE id = ? AND product_id = ?');
  tx(() => ids.forEach((imgId, i) => upd.run(i, imgId, id)));
  res.json({ images: shop.productImages(id) });
});
router.delete('/products/:id/images/:imageId', (req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(toInt(req.params.imageId), toInt(req.params.id));
  if (!img) throw httpError(404, 'Зураг олдсонгүй');
  db.prepare('DELETE FROM product_images WHERE id = ?').run(img.id);
  if (img.url.startsWith('/uploads/') && !db.prepare('SELECT 1 FROM product_images WHERE url = ?').get(img.url)) {
    fs.rm(path.join(UPLOAD_DIR, path.basename(img.url)), { force: true }, () => {});
  }
  res.json({ images: shop.productImages(toInt(req.params.id)) });
});

// Ерөнхий зураг байршуулах (баннер г.м.)
router.post('/uploads', imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Зураг сонгоно уу');
  res.status(201).json({ url: await saveImage(req.file) });
});

// ---------------- Агуулах ----------------
router.get('/inventory', (req, res) => {
  const alerts = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.stock, p.low_stock_threshold, p.is_active,
         (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image
       FROM products p WHERE p.stock <= p.low_stock_threshold ORDER BY p.stock ASC, p.name`
    )
    .all();
  const totals = db
    .prepare('SELECT COUNT(*) AS products, COALESCE(SUM(stock),0) AS units, COALESCE(SUM(stock * price),0) AS stock_value FROM products WHERE is_active = 1')
    .get();
  res.json({ alerts, totals, out_of_stock: alerts.filter((a) => a.stock === 0).length });
});

router.post('/products/:id/stock', (req, res) => {
  const id = toInt(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw httpError(404, 'Бараа олдсонгүй');
  const type = ['in', 'out', 'adjust'].includes(req.body.type) ? req.body.type : null;
  if (!type) throw httpError(400, 'Хөдөлгөөний төрөл буруу (in/out/adjust)');
  let change;
  if (type === 'adjust') {
    const target = toInt(req.body.stock, -1);
    if (target < 0) throw httpError(400, 'Тоолсон үлдэгдлийг зөв оруулна уу');
    change = target - p.stock;
    if (change === 0) throw httpError(400, 'Үлдэгдэл өөрчлөгдөөгүй байна');
  } else {
    const qty = toInt(req.body.qty, 0);
    if (qty <= 0) throw httpError(400, 'Тоо ширхэг 0-ээс их байх ёстой');
    change = type === 'in' ? qty : -qty;
  }
  const reason = clampStr(req.body.reason, 200) || { in: 'Орлого', out: 'Зарлага', adjust: 'Тооллогын залруулга' }[type];
  const after = tx(() => shop.moveStock(id, change, { type, reason, actor: req.admin }));
  res.json({ stock: after, product: shop.getProduct({ id }, { includeInactive: true }) });
});

router.get('/stock-movements', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.product_id) {
    where.push('m.product_id = ?');
    params.push(toInt(req.query.product_id));
  }
  if (req.query.type) {
    where.push('m.type = ?');
    params.push(String(req.query.type));
  }
  if (req.query.from) {
    where.push('substr(m.created_at,1,10) >= ?');
    params.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('substr(m.created_at,1,10) <= ?');
    params.push(String(req.query.to));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 30)));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM stock_movements m ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.max(1, toInt(req.query.page, 1)));
  const items = db
    .prepare(
      `SELECT m.*, p.name AS product_name, p.sku, o.order_no FROM stock_movements m
       JOIN products p ON p.id = m.product_id LEFT JOIN orders o ON o.id = m.order_id
       ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, pages });
});

// ---------------- Bulk импорт ----------------
router.get('/import/template.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="baraa-import-template.csv"');
  res.send(importer.templateCsv());
});
router.get('/import/template.xlsx', async (req, res) => {
  const buf = await importer.templateXlsx();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="baraa-import-template.xlsx"');
  res.send(Buffer.from(buf));
});
router.post('/import/preview', fileUpload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Файл сонгоно уу');
  res.json(await importer.preview(req.file));
});
router.post('/import/commit', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  if (!rows.length) throw httpError(400, 'Импортлох мөр алга');
  res.json(importer.commit(rows, req.admin));
});

// ---------------- Захиалга ----------------
function orderFilters(q) {
  const where = [];
  const params = [];
  if (q.status) {
    where.push('o.status = ?');
    params.push(String(q.status));
  }
  if (q.payment_status) {
    where.push('o.payment_status = ?');
    params.push(String(q.payment_status));
  }
  if (q.q) {
    const like = `%${String(q.q).trim().slice(0, 60)}%`;
    where.push('(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ? OR u.email LIKE ?)');
    params.push(like, like, like, like);
  }
  if (q.from) {
    where.push('substr(o.created_at,1,10) >= ?');
    params.push(String(q.from));
  }
  if (q.to) {
    where.push('substr(o.created_at,1,10) <= ?');
    params.push(String(q.to));
  }
  if (q.user_id) {
    where.push('o.user_id = ?');
    params.push(toInt(q.user_id));
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/orders', (req, res) => {
  const f = orderFilters(req.query);
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id ${f.sql}`).get(...f.params).n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.max(1, toInt(req.query.page, 1)));
  const rows = db
    .prepare(
      `SELECT o.*, u.email AS user_email, u.phone AS user_phone,
         (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS units
       FROM orders o JOIN users u ON u.id = o.user_id ${f.sql} ORDER BY o.id DESC LIMIT ? OFFSET ?`
    )
    .all(...f.params, limit, (page - 1) * limit);
  const counts = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
  res.json({ items: rows.map((o) => shop.decorateOrder(o)), total, page, pages, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

router.get('/orders/export.csv', (req, res) => {
  const f = orderFilters(req.query);
  const rows = db
    .prepare(`SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id ${f.sql} ORDER BY o.id DESC LIMIT 20000`)
    .all(...f.params);
  const head = ['Дугаар', 'Огноо', 'Хэрэглэгч', 'Утас', 'И-мэйл', 'Хаяг', 'Дүн', 'Хямдрал %', 'Хямдрал', 'Хүргэлт', 'Нийт', 'Төлөв', 'Төлбөр', 'Төлсөн огноо'];
  const lines = rows.map((o) =>
    [o.order_no, o.created_at, o.customer_name, o.phone, o.user_email || '', o.address, o.subtotal, o.discount_pct, o.discount_amount,
      o.shipping_fee, o.total, shop.ORDER_STATUS_LABELS[o.status], shop.PAYMENT_STATUS_LABELS[o.payment_status], o.paid_at || '']
      .map(importer.csvCell)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send('﻿' + [head.join(','), ...lines].join('\r\n'));
});

router.get('/orders/:id', (req, res) => {
  const o = shop.getOrder(toInt(req.params.id));
  if (!o) throw httpError(404, 'Захиалга олдсонгүй');
  const user = db.prepare('SELECT id, name, email, phone, created_at FROM users WHERE id = ?').get(o.user_id);
  res.json({ order: o, customer: user, loyalty: shop.loyaltyStatus(o.user_id) });
});

router.patch('/orders/:id/status', async (req, res) => {
  const order = await shop.changeOrderStatus(toInt(req.params.id), String(req.body.status || ''), { actor: req.admin, note: clampStr(req.body.note, 300) });
  res.json({ order });
});

router.post('/orders/:id/sync-payment', async (req, res) => {
  const order = await shop.syncOrderPayment(toInt(req.params.id), { actor: req.admin });
  res.json({ order });
});

// ---------------- Хэрэглэгч ----------------
const CUSTOMER_STATS = `
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders_count,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid' AND o.status != 'cancelled') AS paid_orders,
  (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid' AND o.status != 'cancelled') AS total_spent,
  (SELECT MAX(paid_at) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS last_order_at`;

function withTier(u) {
  const seq = u.paid_orders + 1;
  const t = shop.tierForSeq(seq);
  return { ...u, password_hash: undefined, is_blocked: !!u.is_blocked, verified: !!u.verified, next_order_seq: seq, tier: t };
}

router.get('/customers', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    const like = `%${String(req.query.q).trim().slice(0, 60)}%`;
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const SORTS = { new: 'u.id DESC', spent: 'total_spent DESC', orders: 'paid_orders DESC', last: 'last_order_at DESC' };
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.max(1, toInt(req.query.page, 1)));
  const rows = db
    .prepare(`SELECT u.*, ${CUSTOMER_STATS} FROM users u ${whereSql} ORDER BY ${SORTS[req.query.sort] || SORTS.new} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ items: rows.map(withTier), total, page, pages, tiers: shop.loyaltyTiers() });
});

router.get('/customers/:id', (req, res) => {
  const u = db.prepare(`SELECT u.*, ${CUSTOMER_STATS} FROM users u WHERE u.id = ?`).get(toInt(req.params.id));
  if (!u) throw httpError(404, 'Хэрэглэгч олдсонгүй');
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(u.id).map((o) => shop.decorateOrder(o));
  const products = db
    .prepare(
      `SELECT oi.name, oi.sku, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = ? AND o.payment_status = 'paid' AND o.status != 'cancelled' GROUP BY COALESCE(oi.product_id, oi.sku) ORDER BY qty DESC LIMIT 10`
    )
    .all(u.id);
  res.json({ customer: withTier(u), orders, products, loyalty: shop.loyaltyStatus(u.id) });
});

router.patch('/customers/:id', (req, res) => {
  const id = toInt(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw httpError(404, 'Хэрэглэгч олдсонгүй');
  const name = req.body.name !== undefined ? clampStr(req.body.name, 80) : u.name;
  const blocked = req.body.is_blocked !== undefined ? (req.body.is_blocked ? 1 : 0) : u.is_blocked;
  db.prepare('UPDATE users SET name = ?, is_blocked = ? WHERE id = ?').run(name, blocked, id);
  if (blocked) db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- Анализ ----------------
router.get('/analytics/sales', (req, res) => res.json(analytics.sales(req.query)));
router.get('/analytics/top-products', (req, res) => res.json(analytics.topProducts(req.query)));
router.get('/analytics/retention', (req, res) => res.json(analytics.retention(req.query)));
router.get('/analytics/sales.csv', (req, res) => {
  const s = analytics.sales(req.query);
  const lines = s.series.map((r) => [r.key, r.orders, r.units, r.gross, r.discounts, r.revenue].join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sales-${s.period}-${s.from}-${s.to}.csv"`);
  res.send('﻿' + ['Хугацаа,Захиалга,Ширхэг,Нийт дүн,Хямдрал,Орлого', ...lines].join('\r\n'));
});

// ---------------- Тохиргоо ----------------
const SETTING_KEYS = ['business', 'loyalty', 'delivery', 'payment', 'home'];
router.get('/settings', (req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k);
  out.loyalty.tiers = shop.loyaltyTiers(out.loyalty);
  out.qpay = {
    mode: qpay.isMock() ? 'mock' : 'live',
    base_url: qpay.BASE_URL,
    invoice_code: process.env.QPAY_INVOICE_CODE ? `${process.env.QPAY_INVOICE_CODE.slice(0, 4)}…` : '',
    public_url: process.env.PUBLIC_URL || '',
  };
  res.json(out);
});

function sanitizeSetting(key, v) {
  if (!v || typeof v !== 'object') throw httpError(400, 'Тохиргооны өгөгдөл буруу');
  switch (key) {
    case 'business':
      return {
        name: clampStr(v.name, 80) || 'Aktar Marka',
        tagline: clampStr(v.tagline, 120),
        phones: (Array.isArray(v.phones) ? v.phones : String(v.phones || '').split(','))
          .map((p) => clampStr(p, 20))
          .filter(Boolean)
          .slice(0, 5),
        email: clampStr(v.email, 120),
        hours: clampStr(v.hours, 60),
        address: clampStr(v.address, 200),
        address_note: clampStr(v.address_note, 300),
        facebook: clampStr(v.facebook, 200),
        instagram: clampStr(v.instagram, 200),
      };
    case 'loyalty': {
      const tiers = shop.loyaltyTiers({ tiers: Array.isArray(v.tiers) ? v.tiers.slice(0, 10) : [] });
      const seen = new Set();
      for (const t of tiers) {
        if (seen.has(t.min_order)) throw httpError(400, `${t.min_order}-р захиалгын шат давхардсан байна`);
        seen.add(t.min_order);
      }
      return { enabled: v.enabled !== false, tiers };
    }
    case 'delivery':
      return { fee: Math.max(0, toInt(v.fee, 0)), free_over: Math.max(0, toInt(v.free_over, 0)), note: clampStr(v.note, 200) };
    case 'payment':
      return { invoice_ttl_minutes: Math.min(1440, Math.max(5, toInt(v.invoice_ttl_minutes, 30))) };
    case 'home':
      return {
        featured_title: clampStr(v.featured_title, 80),
        banners: (Array.isArray(v.banners) ? v.banners : [])
          .slice(0, 8)
          .map((b) => ({ image: clampStr(b.image, 300), link: clampStr(b.link, 300), title: clampStr(b.title, 120) }))
          .filter((b) => /^(\/|https?:\/\/)/.test(b.image)),
      };
    default:
      throw httpError(404, 'Ийм тохиргоо байхгүй');
  }
}

router.put('/settings/:key', (req, res) => {
  const key = req.params.key;
  if (!SETTING_KEYS.includes(key)) throw httpError(404, 'Ийм тохиргоо байхгүй');
  const value = sanitizeSetting(key, req.body);
  setSetting(key, value);
  res.json({ [key]: value });
});

module.exports = router;
