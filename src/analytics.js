// Дата анализ — борлуулалт (өдөр/долоо хоног/сар), шилдэг бараа, орлого, retention.
// Орлогод зөвхөн төлөгдсөн, цуцлагдаагүй захиалгыг (paid_at огноогоор) тооцно.
'use strict';

const { db } = require('./db');
const { localDate, toInt } = require('./util');

const PAID = "o.payment_status = 'paid' AND o.status != 'cancelled'";

function range(from, to, dfltDays = 30) {
  const today = localDate();
  const t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
  let f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : null;
  if (!f) {
    const d = new Date(`${t}T00:00:00`);
    d.setDate(d.getDate() - (dfltDays - 1));
    f = localDate(d);
  }
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

// Долоо хоногийн эхлэл (Даваа гараг)
function weekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return localDate(d);
}

function bucketKey(dateStr, period) {
  if (period === 'month') return dateStr.slice(0, 7);
  if (period === 'week') return weekStart(dateStr);
  return dateStr;
}

// Хугацааны бүх bucket-ийг (хоосон ч гэсэн) үүсгэнэ
function buckets(from, to, period) {
  const keys = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    const k = bucketKey(localDate(d), period);
    if (keys[keys.length - 1] !== k) keys.push(k);
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

function sales({ period = 'day', from, to } = {}) {
  if (!['day', 'week', 'month'].includes(period)) period = 'day';
  const r = range(from, to, period === 'month' ? 365 : period === 'week' ? 84 : 30);
  const rows = db
    .prepare(
      `SELECT substr(o.paid_at, 1, 10) AS d, COUNT(*) AS orders, SUM(o.total) AS revenue,
              SUM(o.discount_amount) AS discounts, SUM(o.subtotal) AS gross,
              SUM((SELECT SUM(qty) FROM order_items WHERE order_id = o.id)) AS units
       FROM orders o WHERE ${PAID} AND substr(o.paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY d`
    )
    .all(r.from, r.to);
  const map = new Map();
  for (const row of rows) {
    const k = bucketKey(row.d, period);
    const cur = map.get(k) || { orders: 0, revenue: 0, discounts: 0, gross: 0, units: 0 };
    cur.orders += row.orders;
    cur.revenue += row.revenue || 0;
    cur.discounts += row.discounts || 0;
    cur.gross += row.gross || 0;
    cur.units += row.units || 0;
    map.set(k, cur);
  }
  const series = buckets(r.from, r.to, period).map((k) => ({
    key: k,
    ...(map.get(k) || { orders: 0, revenue: 0, discounts: 0, gross: 0, units: 0 }),
  }));
  const totals = series.reduce(
    (a, s) => ({
      orders: a.orders + s.orders,
      revenue: a.revenue + s.revenue,
      discounts: a.discounts + s.discounts,
      gross: a.gross + s.gross,
      units: a.units + s.units,
    }),
    { orders: 0, revenue: 0, discounts: 0, gross: 0, units: 0 }
  );
  totals.avg_order = totals.orders ? Math.round(totals.revenue / totals.orders) : 0;
  return { period, ...r, series, totals };
}

function topProducts({ from, to, limit = 10 } = {}) {
  const r = range(from, to, 30);
  const items = db
    .prepare(
      `SELECT oi.product_id, oi.name, oi.sku, MAX(oi.image) AS image, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue,
              COUNT(DISTINCT o.id) AS orders
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE ${PAID} AND substr(o.paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY COALESCE(oi.product_id, oi.sku) ORDER BY qty DESC, revenue DESC LIMIT ?`
    )
    .all(r.from, r.to, Math.min(50, Math.max(1, toInt(limit, 10))));
  return { ...r, items };
}

// Retention: худалдан авалт хийсэн хэрэглэгчдээс 2 ба түүнээс дээш удаа авсан хувь
function retention({ from, to } = {}) {
  const r = range(from, to, 365);
  const perUser = db
    .prepare(
      `SELECT o.user_id, COUNT(*) AS n, MIN(o.paid_at) AS first_paid
       FROM orders o WHERE ${PAID} AND substr(o.paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY o.user_id`
    )
    .all(r.from, r.to);
  const buyers = perUser.length;
  const repeat = perUser.filter((u) => u.n >= 2).length;
  const distribution = { 1: 0, 2: 0, '3+': 0 };
  for (const u of perUser) distribution[u.n >= 3 ? '3+' : u.n]++;

  // Сарын cohort: тухайн сард анх худалдан авсан хэрэглэгчдийн хэд нь дараа нь дахин авсан бэ
  const firstEver = db
    .prepare(
      `SELECT o.user_id, MIN(o.paid_at) AS first_paid, COUNT(*) AS n
       FROM orders o WHERE ${PAID} GROUP BY o.user_id`
    )
    .all();
  const cohorts = new Map();
  for (const u of firstEver) {
    const m = u.first_paid.slice(0, 7);
    if (m < r.from.slice(0, 7) || m > r.to.slice(0, 7)) continue;
    const c = cohorts.get(m) || { month: m, customers: 0, returned: 0 };
    c.customers++;
    if (u.n >= 2) c.returned++;
    cohorts.set(m, c);
  }
  return {
    ...r,
    buyers,
    repeat_buyers: repeat,
    retention_rate: buyers ? Math.round((repeat / buyers) * 1000) / 10 : 0,
    distribution,
    cohorts: [...cohorts.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((c) => ({ ...c, rate: c.customers ? Math.round((c.returned / c.customers) * 1000) / 10 : 0 })),
  };
}

function dashboard() {
  const today = localDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const sum = (from, to) =>
    db
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o
         WHERE ${PAID} AND substr(o.paid_at,1,10) BETWEEN ? AND ?`
      )
      .get(from, to);
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' AND payment_status = 'paid' THEN 1 ELSE 0 END) AS to_process,
         SUM(CASE WHEN status = 'pending' AND payment_status = 'pending' THEN 1 ELSE 0 END) AS awaiting_payment,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
         SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped
       FROM orders`
    )
    .get();
  const lowStock = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.stock, p.low_stock_threshold,
         (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image
       FROM products p WHERE p.stock <= p.low_stock_threshold ORDER BY p.stock ASC, p.name LIMIT 10`
    )
    .all();
  const lowStockCount = db.prepare('SELECT COUNT(*) AS n FROM products WHERE stock <= low_stock_threshold').get().n;
  const recent = db
    .prepare(
      `SELECT o.id, o.order_no, o.customer_name, o.total, o.status, o.payment_status, o.created_at
       FROM orders o ORDER BY o.id DESC LIMIT 8`
    )
    .all();
  const customers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const newCustomers = db.prepare('SELECT COUNT(*) AS n FROM users WHERE substr(created_at,1,10) >= ?').get(monthStart).n;
  return {
    today: sum(today, today),
    month: sum(monthStart, today),
    counts,
    low_stock: lowStock,
    low_stock_count: lowStockCount,
    recent_orders: recent,
    customers,
    new_customers_month: newCustomers,
    products: db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_active = 1').get().n,
    sales_30d: sales({ period: 'day' }),
    top_products: topProducts({ limit: 5 }).items,
    retention: retention({}),
  };
}

module.exports = { sales, topProducts, retention, dashboard, range };
