// Integration тест — түр SQLite файл дээр бүтэн серверийг ажиллуулж HTTP-ээр шалгана.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aktar-test-'));
process.env.TZ = 'Asia/Ulaanbaatar';
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.OTP_DEV_EXPOSE = '1';
process.env.QPAY_MOCK = '1';

const app = require('../server');
const { db, setSetting, DEFAULT_SETTINGS } = require('../src/db');
const shop = require('../src/shop');
const { localDateTime } = require('../src/util');

let server;
let base;

// Cookie хадгалдаг энгийн клиент
function client() {
  const jar = new Map();
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (v) jar.set(pair.slice(0, i), v);
      else jar.delete(pair.slice(0, i));
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}

function seedProducts() {
  const now = localDateTime();
  db.prepare("INSERT INTO categories (name, slug, created_at) VALUES ('Жин хасах', 'jin-hasah', ?)").run(now);
  db.prepare("INSERT INTO categories (parent_id, name, slug, created_at) VALUES (1, 'Капсул', 'kapsul', ?)").run(now);
  const ins = db.prepare(
    `INSERT INTO products (sku, slug, name, brand, category_id, price, stock, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, ?, 'Zerofit', 2, ?, 0, 2, ?, ?)`
  );
  ins.run('A1', 'a1', 'Капсул А', 50000, now, now);
  ins.run('B1', 'b1', 'Цай Б', 100000, now, now);
  shop.moveStock(1, 5, { type: 'initial', actor: 'test' });
  shop.moveStock(2, 3, { type: 'initial', actor: 'test' });
}

const stockOf = (id) => db.prepare('SELECT stock FROM products WHERE id = ?').get(id).stock;

test.before(async () => {
  seedProducts();
  await new Promise((r) => {
    server = app.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('гишүүнчлэлийн шат: 1-р 0%, 2-р 10%, 3+ 20%', () => {
  assert.equal(shop.tierForSeq(1).pct, 0);
  assert.equal(shop.tierForSeq(2).pct, 10);
  assert.equal(shop.tierForSeq(3).pct, 20);
  assert.equal(shop.tierForSeq(12).pct, 20);
  assert.equal(shop.tierForSeq(3).next, null);
  assert.equal(shop.tierForSeq(1).next.orders_left, 1);
  // Нэмэлт шат тохируулж болно (жишээ: 5-р захиалгаас 30%)
  const custom = { enabled: true, tiers: [...DEFAULT_SETTINGS.loyalty.tiers, { min_order: 5, pct: 30, name: 'VIP' }] };
  assert.equal(shop.tierForSeq(4, custom).pct, 20);
  assert.equal(shop.tierForSeq(5, custom).pct, 30);
  assert.equal(shop.tierForSeq(4, custom).next.orders_left, 1);
  assert.equal(shop.tierForSeq(3, { ...custom, enabled: false }).pct, 0);
});

test('каталог нэвтрэлтгүй харагдана, сагс нэвтрэлт шаардана', async () => {
  const anon = client();
  const list = await anon('GET', '/api/store/products?category=jin-hasah');
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 2); // дэд категорийн барааг багтаана
  const detail = await anon('GET', '/api/store/products/a1');
  assert.equal(detail.data.product.stock, 5);
  const cart = await anon('POST', '/api/cart/items', { product_id: 1 });
  assert.equal(cart.status, 401);
  assert.equal(cart.data.code, 'AUTH_REQUIRED');
});

test('захиалгын бүтэн урсгал: үлдэгдэл нөөцлөх, QPay төлөх, хямдрал өсөх', async () => {
  const u = client();
  const reg = await u('POST', '/api/account/register', { identifier: '9911 2233', password: 'secret123', name: 'Тест' });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.phone, '99112233');
  assert.equal((await u('POST', '/api/account/register', { identifier: '99112233', password: 'secret123' })).status, 409);

  // Үлдэгдлээс их нэмэхийг хориглоно
  assert.equal((await u('POST', '/api/cart/items', { product_id: 2, qty: 4 })).status, 409);

  async function buy(productId, qty) {
    const c = await u('POST', '/api/cart/items', { product_id: productId, qty });
    assert.equal(c.status, 200, JSON.stringify(c.data));
    const o = await u('POST', '/api/orders', { name: 'Тест', phone: '99112233', address: 'Улаанбаатар, СБД 1-р хороо' });
    assert.equal(o.status, 201, JSON.stringify(o.data));
    assert.equal(o.data.payment.mode, 'mock');
    assert.ok(o.data.payment.qr_image.startsWith('data:image/png;base64,'));
    assert.ok(o.data.payment.deeplinks.length > 5);
    return o.data;
  }

  // 1-р захиалга — 0%
  const first = await buy(1, 2);
  assert.equal(first.order.order_seq, 1);
  assert.equal(first.order.discount_pct, 0);
  assert.equal(first.order.subtotal, 100000);
  assert.equal(first.order.shipping_fee, 5000);
  assert.equal(first.order.total, 105000);
  assert.equal(stockOf(1), 3);
  assert.equal((await u('GET', '/api/cart')).data.items.length, 0);

  const pending = await u('POST', `/api/orders/${first.order.order_no}/check`);
  assert.equal(pending.data.order.payment_status, 'pending');
  const paid = await u('POST', `/api/payments/mock/${first.payment.invoice_id}/pay`);
  assert.equal(paid.data.payment_status, 'paid');
  const after = await u('GET', `/api/orders/${first.order.order_no}`);
  assert.equal(after.data.order.payment_status, 'paid');
  assert.ok(after.data.order.history.some((h) => h.kind === 'payment' && h.to_value === 'paid'));

  // 2-р захиалга — 10%, 150,000₮-с дээш үнэгүй хүргэлт
  const cartView = await u('POST', '/api/cart/items', { product_id: 2, qty: 2 });
  assert.equal(cartView.data.discount_pct, 10);
  assert.equal(cartView.data.loyalty.next_order_seq, 2);
  await u('DELETE', '/api/cart');
  const second = await buy(2, 2);
  assert.equal(second.order.discount_pct, 10);
  assert.equal(second.order.discount_amount, 20000);
  assert.equal(second.order.shipping_fee, 0);
  assert.equal(second.order.total, 180000);
  await u('POST', `/api/payments/mock/${second.payment.invoice_id}/pay`);

  // 3-р захиалга — 20%
  const third = await buy(1, 1);
  assert.equal(third.order.order_seq, 3);
  assert.equal(third.order.discount_pct, 20);
  assert.equal(third.order.total, 40000 + 5000);

  // Хэрэглэгч төлөгдөөгүй захиалгаа цуцлахад үлдэгдэл буцна
  assert.equal(stockOf(1), 2);
  const cancel = await u('POST', `/api/orders/${third.order.order_no}/cancel`);
  assert.equal(cancel.data.order.status, 'cancelled');
  assert.equal(cancel.data.order.payment_status, 'cancelled');
  assert.equal(stockOf(1), 3);
  // Төлөгдсөн захиалгыг хэрэглэгч цуцалж чадахгүй
  assert.equal((await u('POST', `/api/orders/${first.order.order_no}/cancel`)).status, 409);

  const me = await u('GET', '/api/account/me');
  assert.equal(me.data.loyalty.paid_orders, 2);
  assert.equal(me.data.loyalty.tier.pct, 20);

  // Нэвтрэлтгүйгээр өөр хэрэглэгчийн захиалга харагдахгүй
  const other = client();
  await other('POST', '/api/account/register', { identifier: 'other@example.com', password: 'secret123' });
  assert.equal((await other('GET', `/api/orders/${first.order.order_no}`)).status, 404);
});

test('төлбөрийн хугацаа дуусахад захиалга автоматаар цуцлагдана', async () => {
  const u = client();
  await u('POST', '/api/account/register', { identifier: 'expire@example.com', password: 'secret123' });
  await u('POST', '/api/cart/items', { product_id: 1, qty: 1 });
  const before = stockOf(1);
  const o = await u('POST', '/api/orders', { name: 'Хугацаа', phone: '88112233', address: 'Улаанбаатар хот' });
  assert.equal(stockOf(1), before - 1);
  db.prepare('UPDATE payments SET expires_at = ? WHERE id = ?').run('2000-01-01 00:00:00', o.data.payment.id);
  await shop.sweepPendingPayments();
  const r = await u('GET', `/api/orders/${o.data.order.order_no}`);
  assert.equal(r.data.order.status, 'cancelled');
  assert.equal(r.data.order.payment_status, 'cancelled');
  assert.equal(r.data.order.payment.status, 'expired');
  assert.equal(stockOf(1), before);
});

test('OTP-оор нэвтрэх ба шинээр бүртгүүлэх', async () => {
  const u = client();
  const req = await u('POST', '/api/account/otp/request', { identifier: 'otp@example.com' });
  assert.equal(req.status, 200);
  assert.equal(req.data.is_new, true);
  assert.match(req.data.dev_code, /^\d{6}$/);
  const wrong = await u('POST', '/api/account/otp/verify', { identifier: 'otp@example.com', code: '000000' === req.data.dev_code ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  const ok = await u('POST', '/api/account/otp/verify', { identifier: 'otp@example.com', code: req.data.dev_code, name: 'OTP' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.verified, true);
  assert.equal(ok.data.user.has_password, false);
  // Нэг кодыг дахин ашиглахгүй
  assert.equal((await client()('POST', '/api/account/otp/verify', { identifier: 'otp@example.com', code: req.data.dev_code })).status, 400);
  // Хэт ойр дахин код хүсэхийг хязгаарлана
  assert.equal((await u('POST', '/api/account/otp/request', { identifier: 'otp@example.com' })).status, 429);
});

test('админ: нэвтрэлт, төлөв шилжилт, агуулах, импорт, анализ', async () => {
  const a = client();
  assert.equal((await a('GET', '/api/admin/dashboard')).status, 401);
  assert.equal((await a('POST', '/api/admin/login', { username: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await a('POST', '/api/admin/login', { username: 'admin', password: '12345678' })).status, 200);

  const orders = await a('GET', '/api/admin/orders?payment_status=paid');
  assert.ok(orders.data.total >= 2);
  const paidOrder = orders.data.items[orders.data.items.length - 1];

  // Төлөв зөвхөн урагш
  assert.equal((await a('PATCH', `/api/admin/orders/${paidOrder.id}/status`, { status: 'processing' })).data.order.status, 'processing');
  assert.equal((await a('PATCH', `/api/admin/orders/${paidOrder.id}/status`, { status: 'pending' })).status, 409);
  assert.equal((await a('PATCH', `/api/admin/orders/${paidOrder.id}/status`, { status: 'shipped' })).data.order.status, 'shipped');

  // Төлөгдөөгүй захиалгыг бэлтгэхийг хориглоно
  const u = client();
  await u('POST', '/api/account/register', { identifier: 'unpaid@example.com', password: 'secret123' });
  await u('POST', '/api/cart/items', { product_id: 2, qty: 1 });
  const unpaid = await u('POST', '/api/orders', { name: 'Unpaid', phone: '88990011', address: 'Улаанбаатар хот' });
  assert.equal((await a('PATCH', `/api/admin/orders/${unpaid.data.order.id}/status`, { status: 'processing' })).status, 409);

  // Агуулах: орлого, зарлага, тооллого, сөрөг үлдэгдэл хориглох
  const s0 = stockOf(2);
  assert.equal((await a('POST', '/api/admin/products/2/stock', { type: 'in', qty: 10, reason: 'Нийлүүлэлт' })).data.stock, s0 + 10);
  assert.equal((await a('POST', '/api/admin/products/2/stock', { type: 'out', qty: 999 })).status, 409);
  assert.equal((await a('POST', '/api/admin/products/2/stock', { type: 'adjust', stock: 7 })).data.stock, 7);
  const moves = await a('GET', '/api/admin/stock-movements?product_id=2');
  assert.deepEqual(moves.data.items.slice(0, 2).map((m) => m.type), ['adjust', 'in']);
  const inv = await a('GET', '/api/admin/inventory');
  assert.ok(Array.isArray(inv.data.alerts));

  // Bulk импорт — CSV preview → commit
  const csv = '﻿sku,name,price,stock,category,brand,benefits\r\nA1,Капсул А шинэ,55000,9,kapsul,Zerofit,Нэг | Хоёр\r\nNEW-1,"Шинэ бараа, 1",12000,4,jin-hasah,SLC,\r\nBAD,,abc,-1,unknown,,\r\n';
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv');
  const preview = await a('POST', '/api/admin/import/preview', fd);
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.summary, { total: 3, create: 1, update: 1, error: 1 });
  const commit = await a('POST', '/api/admin/import/commit', { rows: preview.data.rows });
  assert.equal(commit.data.created, 1);
  assert.equal(commit.data.updated, 1);
  assert.equal(commit.data.skipped, 1);
  const a1 = db.prepare("SELECT * FROM products WHERE sku = 'A1'").get();
  assert.equal(a1.price, 55000);
  assert.equal(a1.stock, 9);
  assert.deepEqual(JSON.parse(a1.benefits), ['Нэг', 'Хоёр']);
  assert.equal(db.prepare("SELECT name FROM products WHERE sku = 'NEW-1'").get().name, 'Шинэ бараа, 1');

  // Бараа CRUD + захиалгатай барааг устгахад архивлана
  const created = await a('POST', '/api/admin/products', { sku: 'c-1', name: 'Кофе', price: 30000, stock: 3, category_id: 1, benefits: ['a', 'b'] });
  assert.equal(created.status, 201);
  assert.equal(created.data.product.sku, 'C-1');
  assert.equal(created.data.product.stock, 3);
  assert.equal((await a('DELETE', `/api/admin/products/${created.data.product.id}`)).data.deleted, true);
  assert.equal((await a('DELETE', '/api/admin/products/1')).data.archived, true);

  // Анализ
  const sales = await a('GET', '/api/admin/analytics/sales?period=day');
  assert.equal(sales.data.series.length, 30);
  assert.equal(sales.data.totals.orders, 2);
  assert.equal(sales.data.totals.revenue, 105000 + 180000);
  const weekly = await a('GET', '/api/admin/analytics/sales?period=week');
  assert.equal(weekly.data.totals.revenue, 285000);
  const top = await a('GET', '/api/admin/analytics/top-products');
  assert.equal(top.data.items.length, 2);
  const ret = await a('GET', '/api/admin/analytics/retention');
  assert.equal(ret.data.buyers, 1);
  assert.equal(ret.data.retention_rate, 100);

  const customers = await a('GET', '/api/admin/customers?q=99112233');
  assert.equal(customers.data.items[0].paid_orders, 2);
  assert.equal(customers.data.items[0].tier.pct, 20);

  // Тохиргоо: давхардсан шатыг хориглоно, 5-р захиалгаас 30% нэмж болно
  assert.equal((await a('PUT', '/api/admin/settings/loyalty', { enabled: true, tiers: [{ min_order: 2, pct: 5 }, { min_order: 2, pct: 10 }] })).status, 400);
  const saved = await a('PUT', '/api/admin/settings/loyalty', { enabled: true, tiers: [...DEFAULT_SETTINGS.loyalty.tiers, { min_order: 5, pct: 30, name: 'VIP' }] });
  assert.equal(saved.data.loyalty.tiers.length, 4);
  setSetting('loyalty', DEFAULT_SETTINGS.loyalty);
});

test('өөр домэйноос ирсэн бичих хүсэлтийг хаана', async () => {
  const r = await client()('POST', '/api/account/login', { identifier: 'x@y.mn', password: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});
