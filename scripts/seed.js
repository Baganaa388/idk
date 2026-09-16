// Зурагнаас гаргасан өгөгдлөөр (extracted-products.json) категори, барааг оруулна.
//   npm run seed            — категори + бараа (байгаа SKU-г шинэчилнэ)
//   npm run seed -- --demo  — нэмээд туршилтын хэрэглэгч, захиалга үүсгэнэ (анализ харахад)
'use strict';

process.env.TZ = process.env.TZ || 'Asia/Ulaanbaatar';

const fs = require('node:fs');
const path = require('node:path');
const { db, tx } = require('../src/db');
const shop = require('../src/shop');
const { hashPassword } = require('../src/auth');
const { localDateTime } = require('../src/util');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'extracted-products.json'), 'utf8'));
const images = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'extracted-images.json'), 'utf8')).map((m) => [m.sku, m.image])
);

function seedCatalog() {
  tx(() => {
    const now = localDateTime();
    data.categories.forEach((c, i) => {
      const parent = c.parent ? db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.parent) : null;
      const exists = db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.slug);
      if (exists) db.prepare('UPDATE categories SET name = ?, parent_id = ?, sort = ? WHERE id = ?').run(c.name, parent ? parent.id : null, i, exists.id);
      else db.prepare('INSERT INTO categories (parent_id, name, slug, sort, created_at) VALUES (?, ?, ?, ?, ?)').run(parent ? parent.id : null, c.name, c.slug, i, now);
    });

    for (const p of data.products) {
      const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(p.category);
      const shortDesc = p.benefits[0].length > 140 ? `${p.benefits[0].slice(0, 137)}...` : p.benefits[0];
      const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku);
      let id;
      if (existing) {
        id = existing.id;
        db.prepare(
          `UPDATE products SET slug = ?, name = ?, brand = ?, category_id = ?, price = ?, volume = ?, short_desc = ?, benefits = ?, usage = ?, updated_at = ? WHERE id = ?`
        ).run(p.slug, p.name, p.brand, cat ? cat.id : null, p.price, p.volume, shortDesc, JSON.stringify(p.benefits), JSON.stringify(p.usage), now, id);
      } else {
        const info = db
          .prepare(
            `INSERT INTO products (sku, slug, name, brand, category_id, price, stock, low_stock_threshold, volume, short_desc, benefits, usage, is_active, is_featured, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 5, ?, ?, ?, ?, 1, 1, ?, ?)`
          )
          .run(p.sku, p.slug, p.name, p.brand, cat ? cat.id : null, p.price, p.volume, shortDesc, JSON.stringify(p.benefits), JSON.stringify(p.usage), now, now);
        id = Number(info.lastInsertRowid);
        shop.moveStock(id, p.stock, { type: 'initial', reason: 'Анхны үлдэгдэл (зурагнаас импорт)', actor: 'seed' });
      }
      if (images[p.sku] && !db.prepare('SELECT 1 FROM product_images WHERE product_id = ?').get(id)) {
        db.prepare('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, 0)').run(id, images[p.sku]);
      }
    }
  });
  console.log(`Категори: ${data.categories.length}, бараа: ${data.products.length}`);
}

// Туршилтын өгөгдөл — сүүлийн 90 хоногт тархсан төлөгдсөн захиалгууд
function seedDemo() {
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  const names = ['Болормаа', 'Сарангэрэл', 'Номин', 'Энхжин', 'Мөнхзул', 'Анужин', 'Цэцэгмаа', 'Оюунчимэг', 'Хулан', 'Уранчимэг', 'Золзаяа', 'Солонго'];
  let rnd = 42;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending'];
  let orders = 0;
  tx(() => {
    names.forEach((name, i) => {
      const phone = `99${String(110000 + i * 7919).slice(-6)}`;
      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!user) {
        const created = new Date(Date.now() - (95 - i * 3) * 86400_000);
        const info = db
          .prepare('INSERT INTO users (phone, name, password_hash, verified, created_at) VALUES (?, ?, ?, 1, ?)')
          .run(phone, name, hashPassword('demo12345'), localDateTime(created));
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
      }
      const count = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < count; k++) {
        const daysAgo = Math.max(0, Math.floor(90 - (i * 5 + k * 17 + rand() * 10)));
        const at = new Date(Date.now() - daysAgo * 86400_000 - Math.floor(rand() * 8) * 3600_000);
        const lines = products.filter(() => rand() < 0.35).slice(0, 3);
        if (!lines.length) lines.push(products[Math.floor(rand() * products.length)]);
        const items = lines.map((p) => ({ p, qty: 1 + Math.floor(rand() * 2) }));
        const seq = shop.paidOrderCount(user.id) + 1;
        const tier = shop.tierForSeq(seq);
        const subtotal = items.reduce((s, it) => s + it.p.price * it.qty, 0);
        const discount = Math.round((subtotal * tier.pct) / 100);
        const shipping = subtotal - discount >= 150000 ? 0 : 5000;
        const ts = localDateTime(at);
        const status = daysAgo < 3 ? statuses[5 - Math.floor(rand() * 3)] : 'delivered';
        const info = db
          .prepare(
            `INSERT INTO orders (order_no, user_id, status, payment_status, order_seq, subtotal, discount_pct, discount_amount, shipping_fee, total,
               customer_name, phone, address, created_at, updated_at, paid_at)
             VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(`DEMO${String(user.id).padStart(3, '0')}${k}`, user.id, status, seq, subtotal, tier.pct, discount, shipping,
            subtotal - discount + shipping, name, phone, 'Улаанбаатар, Сүхбаатар дүүрэг', ts, ts, ts);
        const oid = Number(info.lastInsertRowid);
        for (const it of items) {
          const img = db.prepare('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort LIMIT 1').get(it.p.id);
          db.prepare('INSERT INTO order_items (order_id, product_id, sku, name, image, price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(oid, it.p.id, it.p.sku, it.p.name, img ? img.url : '', it.p.price, it.qty, it.p.price * it.qty);
        }
        db.prepare("INSERT INTO order_status_history (order_id, kind, from_value, to_value, actor, note, created_at) VALUES (?, 'payment', 'pending', 'paid', 'demo', 'Туршилтын өгөгдөл', ?)").run(oid, ts);
        orders++;
      }
    });
  });
  console.log(`Туршилтын хэрэглэгч: ${names.length}, захиалга: ${orders} (нууц үг: demo12345)`);
}

seedCatalog();
if (process.argv.includes('--demo')) {
  if (db.prepare("SELECT 1 FROM orders WHERE order_no LIKE 'DEMO%' LIMIT 1").get()) console.log('Туршилтын захиалга аль хэдийн үүссэн байна.');
  else seedDemo();
}
