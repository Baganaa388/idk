// Дэлгүүрийн бизнес логик — бараа, агуулах, сагс, гишүүнчлэлийн хямдрал, захиалга, төлбөр.
'use strict';

const crypto = require('node:crypto');
const { db, tx, getSetting } = require('./db');
const { localDateTime, addMinutes, httpError, toInt, clampStr } = require('./util');
const qpay = require('./qpay');

// ======================= Бараа =======================
function parseJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const imagesStmt = db.prepare('SELECT id, url, sort FROM product_images WHERE product_id = ? ORDER BY sort, id');
function productImages(productId) {
  return imagesStmt.all(productId);
}

function serializeProduct(p, { withImages = true } = {}) {
  if (!p) return null;
  const images = withImages ? productImages(p.id) : [];
  return {
    ...p,
    benefits: parseJsonArray(p.benefits),
    usage: parseJsonArray(p.usage),
    is_active: !!p.is_active,
    is_featured: !!p.is_featured,
    images,
    image: images[0] ? images[0].url : p.cover || '',
    in_stock: p.stock > 0,
    low_stock: p.stock <= p.low_stock_threshold,
  };
}

// Нүүр зургийг нэг query-ээр авах (жагсаалтад)
const COVER_SQL = `(SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort, id LIMIT 1) AS cover`;

function categoryDescendantIds(categoryId) {
  const rows = db
    .prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM categories WHERE id = ?
         UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
       ) SELECT id FROM tree`
    )
    .all(categoryId);
  return rows.map((r) => r.id);
}

function categoryTree({ includeInactive = false } = {}) {
  const rows = db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id ${includeInactive ? '' : 'AND p.is_active = 1'}) AS product_count
       FROM categories c ${includeInactive ? '' : 'WHERE c.is_active = 1'}
       ORDER BY c.sort, c.name`
    )
    .all();
  const byId = new Map(rows.map((r) => [r.id, { ...r, is_active: !!r.is_active, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).children.push(c);
    else if (!c.parent_id) roots.push(c);
  }
  // Эцэг категорийн нийт тоонд хүүхдийнхийг нэмнэ
  const total = (c) => (c.total_count = c.product_count + c.children.reduce((s, ch) => s + total(ch), 0));
  roots.forEach(total);
  return roots;
}

// opts: { category (slug|id), q, brand, min, max, sort, page, limit, includeInactive, stock }
function listProducts(opts = {}) {
  const where = [];
  const params = [];
  if (!opts.includeInactive) where.push('p.is_active = 1');
  if (opts.category) {
    const cat = /^\d+$/.test(String(opts.category))
      ? db.prepare('SELECT id FROM categories WHERE id = ?').get(toInt(opts.category))
      : db.prepare('SELECT id FROM categories WHERE slug = ?').get(String(opts.category));
    if (!cat) return { items: [], total: 0, page: 1, pages: 1 };
    const ids = categoryDescendantIds(cat.id);
    where.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (opts.q) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.short_desc LIKE ?)');
    const like = `%${String(opts.q).trim().slice(0, 80)}%`;
    params.push(like, like, like, like);
  }
  if (opts.brand) {
    where.push('p.brand = ?');
    params.push(String(opts.brand));
  }
  if (opts.min) {
    where.push('p.price >= ?');
    params.push(toInt(opts.min));
  }
  if (opts.max) {
    where.push('p.price <= ?');
    params.push(toInt(opts.max));
  }
  if (opts.featured) where.push('p.is_featured = 1');
  if (opts.stock === 'low') where.push('p.stock <= p.low_stock_threshold AND p.stock > 0');
  if (opts.stock === 'out') where.push('p.stock = 0');
  if (opts.stock === 'alert') where.push('p.stock <= p.low_stock_threshold');
  if (opts.status === 'active') where.push('p.is_active = 1');
  if (opts.status === 'inactive') where.push('p.is_active = 0');

  const SORTS = {
    new: 'p.created_at DESC, p.id DESC',
    price_asc: 'p.price ASC, p.id DESC',
    price_desc: 'p.price DESC, p.id DESC',
    name: 'p.name ASC',
    stock: 'p.stock ASC, p.name ASC',
    popular: 'sold DESC, p.id DESC',
  };
  const order = SORTS[opts.sort] || SORTS.new;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, toInt(opts.limit, 24)));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.max(1, toInt(opts.page, 1)));
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, ${COVER_SQL},
         (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.payment_status = 'paid' AND o.status != 'cancelled') AS sold
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);
  return {
    items: rows.map((r) => serializeProduct(r, { withImages: false })),
    total,
    page,
    pages,
    limit,
  };
}

function getProduct({ id, slug }, { includeInactive = false } = {}) {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.parent_id AS category_parent_id
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${id != null ? 'p.id = ?' : 'p.slug = ?'}`
    )
    .get(id != null ? toInt(id) : String(slug));
  if (!row || (!includeInactive && !row.is_active)) return null;
  return serializeProduct(row);
}

// ======================= Агуулах =======================
// change: + орлого, − зарлага. Үлдэгдэл сөрөг болохыг хориглоно.
function moveStock(productId, change, { type, reason = '', orderId = null, actor = '' }) {
  const p = db.prepare('SELECT id, stock, name FROM products WHERE id = ?').get(productId);
  if (!p) throw httpError(404, 'Бараа олдсонгүй');
  const after = p.stock + change;
  if (after < 0) throw httpError(409, `"${p.name}" барааны үлдэгдэл хүрэлцэхгүй байна (үлдэгдэл: ${p.stock})`);
  db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(after, localDateTime(), productId);
  db.prepare(
    `INSERT INTO stock_movements (product_id, change, stock_after, type, reason, order_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(productId, change, after, type, clampStr(reason, 200), orderId, actor, localDateTime());
  return after;
}

// ======================= Гишүүнчлэлийн хямдрал =======================
function loyaltyTiers(loyalty = getSetting('loyalty')) {
  const tiers = (Array.isArray(loyalty.tiers) ? loyalty.tiers : [])
    .map((t) => ({
      min_order: Math.max(1, toInt(t.min_order, 1)),
      pct: Math.min(90, Math.max(0, toInt(t.pct, 0))),
      name: clampStr(t.name, 40),
    }))
    .sort((a, b) => a.min_order - b.min_order);
  if (!tiers.length || tiers[0].min_order !== 1) tiers.unshift({ min_order: 1, pct: 0, name: 'Шинэ гишүүн' });
  return tiers;
}

// Төлөгдсөн, цуцлагдаагүй захиалгын тоо — дараагийн захиалгын дугаарыг тодорхойлно
function paidOrderCount(userId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND payment_status = 'paid' AND status != 'cancelled'")
    .get(userId).n;
}

// Хэрэглэгчийн дараагийн (seq-р) захиалгад үйлчлэх шат
function tierForSeq(seq, loyalty = getSetting('loyalty')) {
  const tiers = loyaltyTiers(loyalty);
  if (loyalty.enabled === false) return { ...tiers[0], pct: 0, index: 0, next: null };
  let idx = 0;
  tiers.forEach((t, i) => {
    if (seq >= t.min_order) idx = i;
  });
  const next = tiers[idx + 1] || null;
  return {
    ...tiers[idx],
    index: idx,
    next: next ? { ...next, orders_left: next.min_order - seq } : null,
  };
}

function loyaltyStatus(userId) {
  const paid = paidOrderCount(userId);
  const seq = paid + 1;
  const loyalty = getSetting('loyalty');
  return { paid_orders: paid, next_order_seq: seq, tier: tierForSeq(seq, loyalty), tiers: loyaltyTiers(loyalty), enabled: loyalty.enabled !== false };
}

// ======================= Сагс =======================
function cartView(userId) {
  const rows = db
    .prepare(
      `SELECT ci.product_id, ci.qty, p.name, p.slug, p.sku, p.price, p.compare_price, p.stock, p.is_active, p.volume, ${COVER_SQL}
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ? ORDER BY ci.added_at`
    )
    .all(userId);
  const items = rows.map((r) => ({
    product_id: r.product_id,
    name: r.name,
    slug: r.slug,
    sku: r.sku,
    image: r.cover || '',
    volume: r.volume,
    price: r.price,
    compare_price: r.compare_price,
    qty: r.qty,
    stock: r.stock,
    available: !!r.is_active && r.stock >= r.qty,
    line_total: r.price * r.qty,
  }));
  return { items, ...priceCart(userId, items) };
}

function priceCart(userId, items) {
  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const loyalty = loyaltyStatus(userId);
  const discountPct = loyalty.tier.pct;
  const discount = Math.round((subtotal * discountPct) / 100);
  const afterDiscount = subtotal - discount;
  const delivery = getSetting('delivery');
  const freeOver = toInt(delivery.free_over, 0);
  const shipping = items.length === 0 ? 0 : freeOver > 0 && afterDiscount >= freeOver ? 0 : Math.max(0, toInt(delivery.fee, 0));
  return {
    count: items.reduce((s, it) => s + it.qty, 0),
    subtotal,
    discount_pct: discountPct,
    discount_amount: discount,
    shipping_fee: shipping,
    free_shipping_over: freeOver,
    total: afterDiscount + shipping,
    loyalty,
  };
}

function setCartQty(userId, productId, qty, { add = false } = {}) {
  const p = db.prepare('SELECT id, stock, is_active, name FROM products WHERE id = ?').get(toInt(productId));
  if (!p || !p.is_active) throw httpError(404, 'Бараа олдсонгүй');
  const cur = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?').get(userId, p.id);
  let next = add ? (cur ? cur.qty : 0) + toInt(qty, 1) : toInt(qty, 0);
  if (next <= 0) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(userId, p.id);
    return cartView(userId);
  }
  if (p.stock <= 0) throw httpError(409, `"${p.name}" дууссан байна`);
  if (next > p.stock) throw httpError(409, `"${p.name}" барааны үлдэгдэл ${p.stock} ширхэг байна`);
  next = Math.min(next, 999);
  db.prepare(
    `INSERT INTO cart_items (user_id, product_id, qty, added_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty`
  ).run(userId, p.id, next, localDateTime());
  return cartView(userId);
}

// ======================= Захиалга =======================
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const ORDER_STATUS_LABELS = {
  pending: 'Хүлээгдэж буй',
  processing: 'Бэлтгэгдэж буй',
  shipped: 'Илгээгдсэн',
  delivered: 'Хүргэгдсэн',
  cancelled: 'Цуцлагдсан',
};
const PAYMENT_STATUS_LABELS = { pending: 'Хүлээгдэж буй', paid: 'Төлөгдсөн', cancelled: 'Цуцлагдсан' };

function generateOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 20; i++) {
    const no = `AM${ymd}${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE order_no = ?').get(no)) return no;
  }
  return `AM${ymd}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function addHistory(orderId, kind, from, to, actor, note = '') {
  db.prepare(
    'INSERT INTO order_status_history (order_id, kind, from_value, to_value, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(orderId, kind, from, to, actor, clampStr(note, 300), localDateTime());
}

// Сагснаас захиалга үүсгэнэ: үлдэгдлийг нөөцөлж (хасаж), хямдралыг тогтооно.
function createOrderFromCart(user, form) {
  const name = clampStr(form.name, 80);
  const phone = String(form.phone || '').replace(/\D/g, '');
  const address = clampStr(form.address, 400);
  if (!name) throw httpError(400, 'Нэрээ оруулна уу');
  if (!/^[0-9]{8}$/.test(phone)) throw httpError(400, 'Утасны дугаар 8 оронтой байх ёстой');
  if (address.length < 5) throw httpError(400, 'Хүргэлтийн хаягаа дэлгэрэнгүй оруулна уу');

  return tx(() => {
    const cart = cartView(user.id);
    if (!cart.items.length) throw httpError(400, 'Сагс хоосон байна');
    for (const it of cart.items) {
      if (!it.available) throw httpError(409, `"${it.name}" барааны үлдэгдэл хүрэлцэхгүй байна`);
    }
    const now = localDateTime();
    const orderNo = generateOrderNo();
    const info = db
      .prepare(
        `INSERT INTO orders (order_no, user_id, order_seq, subtotal, discount_pct, discount_amount, shipping_fee, total,
           customer_name, phone, address, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        orderNo,
        user.id,
        cart.loyalty.next_order_seq,
        cart.subtotal,
        cart.discount_pct,
        cart.discount_amount,
        cart.shipping_fee,
        cart.total,
        name,
        phone,
        address,
        clampStr(form.note, 500),
        now,
        now
      );
    const orderId = Number(info.lastInsertRowid);
    const insItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, sku, name, image, price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const it of cart.items) {
      insItem.run(orderId, it.product_id, it.sku, it.name, it.image, it.price, it.qty, it.line_total);
      moveStock(it.product_id, -it.qty, { type: 'order', orderId, reason: `Захиалга ${orderNo}`, actor: 'system' });
    }
    addHistory(orderId, 'status', null, 'pending', 'customer', 'Захиалга үүслээ');
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);
    if (!user.address) db.prepare('UPDATE users SET address = ? WHERE id = ?').run(address, user.id);
    if (!user.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
    return getOrder(orderId);
  });
}

function getOrder(orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) return null;
  return decorateOrder(o, { full: true });
}
function getOrderByNo(orderNo) {
  const o = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(String(orderNo));
  return o ? decorateOrder(o, { full: true }) : null;
}

function decorateOrder(o, { full = false } = {}) {
  const out = {
    ...o,
    status_label: ORDER_STATUS_LABELS[o.status],
    payment_status_label: PAYMENT_STATUS_LABELS[o.payment_status],
  };
  if (full) {
    out.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
    out.history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id').all(o.id);
    const pay = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(o.id);
    out.payment = pay ? publicPayment(pay) : null;
    out.refund_required = o.status === 'cancelled' && o.payment_status === 'paid';
  }
  return out;
}

function publicPayment(p) {
  let deeplinks = [];
  try {
    deeplinks = JSON.parse(p.deeplinks);
  } catch {
    /* хоосон */
  }
  return {
    id: p.id,
    provider: p.provider,
    mode: p.mode,
    invoice_id: p.invoice_id,
    amount: p.amount,
    status: p.status,
    qr_image: p.qr_image ? `data:image/png;base64,${p.qr_image}` : '',
    qr_text: p.qr_text,
    short_url: p.short_url,
    deeplinks,
    created_at: p.created_at,
    expires_at: p.expires_at,
    paid_at: p.paid_at,
    paid_amount: p.paid_amount,
  };
}

// Захиалгыг цуцлах: үлдэгдлийг буцааж, хүлээгдэж буй нэхэмжлэхийг цуцална.
async function cancelOrder(orderId, { actor, reason = '' }) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw httpError(404, 'Захиалга олдсонгүй');
  if (o.status === 'cancelled') return getOrder(orderId);
  if (o.status === 'delivered') throw httpError(409, 'Хүргэгдсэн захиалгыг цуцлах боломжгүй');
  const pendingPays = db.prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'pending'").all(orderId);
  tx(() => {
    const now = localDateTime();
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    for (const it of items) {
      if (it.product_id && db.prepare('SELECT 1 FROM products WHERE id = ?').get(it.product_id)) {
        moveStock(it.product_id, it.qty, { type: 'cancel', orderId, reason: `Цуцалсан ${o.order_no}`, actor });
      }
    }
    db.prepare(
      `UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ?,
         payment_status = CASE WHEN payment_status = 'pending' THEN 'cancelled' ELSE payment_status END
       WHERE id = ?`
    ).run(now, clampStr(reason, 300), now, orderId);
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'").run(orderId);
    addHistory(orderId, 'status', o.status, 'cancelled', actor, reason);
    if (o.payment_status === 'pending') addHistory(orderId, 'payment', 'pending', 'cancelled', actor, reason);
  });
  for (const p of pendingPays) await qpay.cancelInvoice(p);
  return getOrder(orderId);
}

// Админ төлөв өөрчлөх: pending → processing → shipped → delivered (урагш), эсвэл cancelled
async function changeOrderStatus(orderId, to, { actor, note = '' }) {
  if (!ORDER_STATUSES.includes(to)) throw httpError(400, 'Төлөв буруу байна');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw httpError(404, 'Захиалга олдсонгүй');
  if (to === 'cancelled') return cancelOrder(orderId, { actor, reason: note });
  if (o.status === 'cancelled') throw httpError(409, 'Цуцлагдсан захиалгын төлөвийг өөрчлөх боломжгүй');
  if (o.status === to) return getOrder(orderId);
  const flow = ['pending', 'processing', 'shipped', 'delivered'];
  if (flow.indexOf(to) < flow.indexOf(o.status)) throw httpError(409, 'Захиалгын төлөвийг буцаах боломжгүй');
  if (to !== 'pending' && o.payment_status !== 'paid')
    throw httpError(409, 'Төлбөр төлөгдөөгүй захиалгыг бэлтгэх/илгээх боломжгүй');
  const now = localDateTime();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(to, now, orderId);
  addHistory(orderId, 'status', o.status, to, actor, note);
  return getOrder(orderId);
}

// ======================= Төлбөр (QPay) =======================
function publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return req ? `${req.protocol}://${req.get('host')}` : 'http://127.0.0.1:3000';
}
function callbackToken(orderNo) {
  return crypto.createHmac('sha256', callbackSecret()).update(orderNo).digest('base64url').slice(0, 32);
}
let _secret = null;
function callbackSecret() {
  if (process.env.CALLBACK_SECRET) return process.env.CALLBACK_SECRET;
  if (_secret) return _secret;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'callback_secret'").get();
  if (row) _secret = JSON.parse(row.value);
  else {
    _secret = crypto.randomBytes(24).toString('base64url');
    db.prepare("INSERT INTO settings (key, value) VALUES ('callback_secret', ?)").run(JSON.stringify(_secret));
  }
  return _secret;
}

// Захиалгын идэвхтэй нэхэмжлэхийг буцаах; байхгүй/хугацаа дууссан бол шинээр үүсгэнэ
async function ensureInvoice(orderId, req) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw httpError(404, 'Захиалга олдсонгүй');
  if (o.status === 'cancelled') throw httpError(409, 'Захиалга цуцлагдсан байна');
  const existing = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);
  if (o.payment_status === 'paid') return existing ? publicPayment(existing) : null;
  if (existing && existing.status === 'pending' && existing.expires_at > localDateTime()) return publicPayment(existing);

  const base = publicBaseUrl(req);
  const inv = await qpay.createInvoice({
    orderNo: o.order_no,
    amount: o.total,
    description: `Aktar Marka захиалга ${o.order_no}`,
    callbackUrl: `${base}/api/payments/qpay/callback?order=${encodeURIComponent(o.order_no)}&t=${callbackToken(o.order_no)}`,
    publicUrl: base,
  });
  const ttl = Math.max(5, toInt(getSetting('payment').invoice_ttl_minutes, 30));
  const now = new Date();
  // Өмнөх хүлээгдэж буй нэхэмжлэхийг хүчингүй болгоно
  if (existing && existing.status === 'pending') {
    db.prepare("UPDATE payments SET status = 'expired' WHERE id = ?").run(existing.id);
    await qpay.cancelInvoice(existing);
  }
  const info = db
    .prepare(
      `INSERT INTO payments (order_id, provider, mode, invoice_id, amount, qr_text, qr_image, short_url, deeplinks, created_at, expires_at)
       VALUES (?, 'qpay', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      orderId,
      inv.mode,
      inv.invoice_id,
      o.total,
      inv.qr_text,
      inv.qr_image,
      inv.short_url,
      JSON.stringify(inv.urls || []),
      localDateTime(now),
      localDateTime(addMinutes(now, ttl))
    );
  return publicPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(info.lastInsertRowid)));
}

function markPaid(payment, result, actor) {
  tx(() => {
    const now = localDateTime();
    const fresh = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
    if (fresh.status === 'paid') return;
    db.prepare(
      "UPDATE payments SET status = 'paid', paid_at = ?, checked_at = ?, paid_amount = ?, provider_payment_id = ? WHERE id = ?"
    ).run(now, now, result.paid_amount, result.payment_id, payment.id);
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
    if (o.payment_status !== 'paid') {
      db.prepare("UPDATE orders SET payment_status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?").run(now, now, o.id);
      addHistory(o.id, 'payment', o.payment_status, 'paid', actor, `QPay гүйлгээ ${result.payment_id || ''}`.trim());
    }
  });
}

// QPay-тэй синк: төлөгдсөн бол тэмдэглэнэ, хугацаа дууссан бол захиалгыг цуцална
async function syncOrderPayment(orderId, { actor = 'system' } = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw httpError(404, 'Захиалга олдсонгүй');
  const pays = db
    .prepare("SELECT * FROM payments WHERE order_id = ? AND status IN ('pending','expired','cancelled') ORDER BY id DESC")
    .all(orderId);
  for (const p of pays) {
    let result;
    try {
      result = await qpay.checkInvoice(p);
    } catch (e) {
      console.warn(`QPay шалгалт амжилтгүй (${p.invoice_id}): ${e.message}`);
      continue;
    }
    db.prepare('UPDATE payments SET checked_at = ? WHERE id = ?').run(localDateTime(), p.id);
    if (result.paid) {
      markPaid(p, result, actor);
      // Цуцлагдсаны дараа төлөгдсөн бол буцаалт шаардлагатай гэж тэмдэглэгдэнэ (refund_required)
      return getOrder(orderId);
    }
  }
  const latest = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (latest.payment_status === 'pending' && latest.status === 'pending') {
    const active = db
      .prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
      .get(orderId);
    const ttl = Math.max(5, toInt(getSetting('payment').invoice_ttl_minutes, 30));
    const expired = active
      ? active.expires_at < localDateTime()
      : latest.created_at < localDateTime(addMinutes(new Date(), -ttl));
    if (expired) {
      await cancelOrder(orderId, { actor: 'system', reason: 'Төлбөрийн хугацаа дууссан' });
      db.prepare("UPDATE payments SET status = 'expired' WHERE order_id = ? AND status = 'cancelled'").run(orderId);
    }
  }
  return getOrder(orderId);
}

// Хүлээгдэж буй бүх төлбөрийг үе үе шалгана (callback ирээгүй тохиолдолд)
let sweeping = false;
async function sweepPendingPayments() {
  if (sweeping) return;
  sweeping = true;
  try {
    const ids = db
      .prepare("SELECT id FROM orders WHERE payment_status = 'pending' AND status = 'pending' ORDER BY id LIMIT 200")
      .all()
      .map((r) => r.id);
    for (const id of ids) {
      try {
        await syncOrderPayment(id);
      } catch (e) {
        console.warn(`Төлбөр синк алдаа (order ${id}): ${e.message}`);
      }
    }
  } finally {
    sweeping = false;
  }
}

module.exports = {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  serializeProduct,
  productImages,
  categoryTree,
  categoryDescendantIds,
  listProducts,
  getProduct,
  moveStock,
  loyaltyTiers,
  tierForSeq,
  loyaltyStatus,
  paidOrderCount,
  cartView,
  setCartQty,
  createOrderFromCart,
  getOrder,
  getOrderByNo,
  decorateOrder,
  cancelOrder,
  changeOrderStatus,
  ensureInvoice,
  syncOrderPayment,
  sweepPendingPayments,
  callbackToken,
  publicBaseUrl,
};
