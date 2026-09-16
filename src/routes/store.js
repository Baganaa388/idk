// Нээлттэй каталог API + сагс + захиалга + төлбөр (хэрэглэгчийн тал).
'use strict';

const express = require('express');
const { db, getSetting } = require('../db');
const auth = require('../auth');
const shop = require('../shop');
const qpay = require('../qpay');
const { httpError, toInt } = require('../util');

const store = express.Router();

// ---------- Каталог (нэвтрэлтгүй) ----------
store.get('/site', (req, res) => {
  const business = getSetting('business');
  const delivery = getSetting('delivery');
  const home = getSetting('home');
  const loyalty = getSetting('loyalty');
  const brands = db
    .prepare("SELECT brand, COUNT(*) AS n FROM products WHERE is_active = 1 AND brand != '' GROUP BY brand ORDER BY n DESC")
    .all();
  res.json({
    business,
    delivery,
    home,
    loyalty: { enabled: loyalty.enabled !== false, tiers: shop.loyaltyTiers(loyalty) },
    categories: shop.categoryTree(),
    brands,
    payment_mode: qpay.isMock() ? 'mock' : 'live',
  });
});

store.get('/categories', (req, res) => res.json({ categories: shop.categoryTree() }));

store.get('/products', (req, res) => {
  const { category, q, brand, min, max, sort, page, limit, featured } = req.query;
  res.json(shop.listProducts({ category, q, brand, min, max, sort, page, limit, featured: featured === '1' }));
});

store.get('/products/:slug', (req, res) => {
  const p = shop.getProduct({ slug: req.params.slug });
  if (!p) throw httpError(404, 'Бараа олдсонгүй');
  // Ижил категори → эцэг категори → бүх бараа гэсэн дарааллаар 8 хүртэл бараа
  const related = [];
  const seen = new Set([p.id]);
  for (const category of [p.category_id, p.category_parent_id, undefined]) {
    if (related.length >= 8) break;
    if (category === null) continue;
    for (const x of shop.listProducts({ category, sort: 'popular', limit: 12 }).items) {
      if (!seen.has(x.id) && related.length < 8) {
        seen.add(x.id);
        related.push(x);
      }
    }
  }
  res.json({ product: p, related });
});

// ---------- Сагс (нэвтрэх шаардлагатай) ----------
const cart = express.Router();
cart.use(auth.requireUser);
cart.get('/', (req, res) => res.json(shop.cartView(req.user.id)));
cart.post('/items', (req, res) => res.json(shop.setCartQty(req.user.id, req.body.product_id, req.body.qty ?? 1, { add: true })));
cart.patch('/items/:productId', (req, res) => res.json(shop.setCartQty(req.user.id, req.params.productId, req.body.qty)));
cart.delete('/items/:productId', (req, res) => res.json(shop.setCartQty(req.user.id, req.params.productId, 0)));
cart.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json(shop.cartView(req.user.id));
});

// ---------- Захиалга ----------
const orders = express.Router();
orders.use(auth.requireUser);

function ownOrder(req) {
  const o = shop.getOrderByNo(req.params.orderNo);
  if (!o || o.user_id !== req.user.id) throw httpError(404, 'Захиалга олдсонгүй');
  return o;
}

orders.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  const items = db.prepare('SELECT name, image, qty FROM order_items WHERE order_id = ? ORDER BY id');
  res.json({
    orders: rows.map((o) => ({ ...shop.decorateOrder(o), items: items.all(o.id) })),
    loyalty: shop.loyaltyStatus(req.user.id),
  });
});

orders.post('/', auth.rateLimit({ key: 'order', max: 20, windowMs: 10 * 60_000 }), async (req, res) => {
  const order = shop.createOrderFromCart(req.user, req.body || {});
  let payment = null;
  let payment_error = null;
  try {
    payment = await shop.ensureInvoice(order.id, req);
  } catch (e) {
    // Нэхэмжлэх үүсээгүй ч захиалга хадгалагдана — төлбөрийн хуудаснаас дахин оролдоно
    console.error(`Нэхэмжлэх үүсгэх алдаа (${order.order_no}):`, e.message);
    payment_error = 'Төлбөрийн нэхэмжлэх үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.';
  }
  res.status(201).json({ order: shop.getOrder(order.id), payment, payment_error });
});

orders.get('/:orderNo', (req, res) => res.json({ order: ownOrder(req) }));

// Төлбөрийн нэхэмжлэх авах/шинэчлэх
orders.post('/:orderNo/pay', async (req, res) => {
  const o = ownOrder(req);
  const payment = await shop.ensureInvoice(o.id, req);
  res.json({ order: shop.getOrder(o.id), payment });
});

// Төлбөр шалгах (хуудас 3-5 секунд тутамд дуудна)
orders.post('/:orderNo/check', auth.rateLimit({ key: 'paycheck', max: 120, windowMs: 5 * 60_000 }), async (req, res) => {
  const o = ownOrder(req);
  const order = o.payment_status === 'pending' ? await shop.syncOrderPayment(o.id, { actor: 'customer' }) : o;
  res.json({ order });
});

orders.post('/:orderNo/cancel', async (req, res) => {
  const o = ownOrder(req);
  if (o.payment_status !== 'pending' || o.status !== 'pending') {
    throw httpError(409, 'Төлбөр төлөгдсөн захиалгыг цуцлахын тулд дэлгүүртэй холбогдоно уу');
  }
  // Цуцлахаас өмнө сүүлийн удаа шалгана — төлөгдчихсөн байж болно
  const synced = await shop.syncOrderPayment(o.id, { actor: 'customer' });
  if (synced.payment_status === 'paid') throw httpError(409, 'Энэ захиалгын төлбөр төлөгдсөн байна');
  res.json({ order: await shop.cancelOrder(o.id, { actor: 'customer', reason: 'Хэрэглэгч цуцалсан' }) });
});

// ---------- Төлбөрийн callback ба mock ----------
const payments = express.Router();

// QPay callback — хүсэлтэд итгэхгүй, QPay API-аар дахин шалгана
payments.all('/qpay/callback', async (req, res) => {
  const orderNo = String(req.query.order || '');
  const o = orderNo && db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo);
  if (!o || req.query.t !== shop.callbackToken(orderNo)) return res.status(404).json({ error: 'Олдсонгүй' });
  try {
    await shop.syncOrderPayment(o.id, { actor: 'qpay-callback' });
  } catch (e) {
    console.error('QPay callback алдаа:', e.message);
  }
  res.json({ ok: true });
});

// Mock горим — туршилтын төлбөр хийх (зөвхөн мерчант мэдээлэлгүй үед)
payments.get('/mock/:invoiceId', (req, res) => {
  if (!qpay.isMock()) throw httpError(404, 'Олдсонгүй');
  const p = db.prepare("SELECT p.*, o.order_no FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.invoice_id = ? AND p.mode = 'mock'").get(req.params.invoiceId);
  if (!p) throw httpError(404, 'Нэхэмжлэх олдсонгүй');
  res.json({ invoice_id: p.invoice_id, order_no: p.order_no, amount: p.amount, status: p.status, mock_paid: !!p.mock_paid });
});
payments.post('/mock/:invoiceId/pay', async (req, res) => {
  if (!qpay.isMock()) throw httpError(404, 'Олдсонгүй');
  const p = db.prepare("SELECT * FROM payments WHERE invoice_id = ? AND mode = 'mock'").get(req.params.invoiceId);
  if (!p) throw httpError(404, 'Нэхэмжлэх олдсонгүй');
  if (p.status !== 'pending') throw httpError(409, 'Энэ нэхэмжлэх идэвхгүй байна');
  db.prepare('UPDATE payments SET mock_paid = 1 WHERE id = ?').run(p.id);
  const order = await shop.syncOrderPayment(p.order_id, { actor: 'qpay-mock' });
  res.json({ ok: true, order_no: order.order_no, payment_status: order.payment_status });
});

module.exports = { store, cart, orders, payments, toInt };
