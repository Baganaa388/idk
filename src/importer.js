// Bulk импорт — CSV / Excel (.xlsx) файлаас бараа нэмэх/шинэчлэх.
// Эхлээд preview (шалгалт) хийж, дараа нь commit хийнэ.
'use strict';

const ExcelJS = require('exceljs');
const { db, tx } = require('./db');
const { localDateTime, slugify, toInt, clampStr } = require('./util');
const { moveStock } = require('./shop');

const COLUMNS = [
  { key: 'sku', label: 'SKU (заавал)' },
  { key: 'name', label: 'Нэр (заавал)' },
  { key: 'price', label: 'Үнэ (заавал)' },
  { key: 'stock', label: 'Үлдэгдэл' },
  { key: 'category', label: 'Категори (slug эсвэл нэр)' },
  { key: 'brand', label: 'Брэнд' },
  { key: 'compare_price', label: 'Хуучин үнэ' },
  { key: 'low_stock_threshold', label: 'Анхааруулах доод үлдэгдэл' },
  { key: 'volume', label: 'Хэмжээ/савлагаа' },
  { key: 'short_desc', label: 'Товч тайлбар' },
  { key: 'description', label: 'Дэлгэрэнгүй тайлбар' },
  { key: 'benefits', label: 'Үйлчилгээ (| тусгаарлана)' },
  { key: 'usage', label: 'Хэрэглэх заавар (| тусгаарлана)' },
  { key: 'images', label: 'Зургийн URL (| тусгаарлана)' },
  { key: 'is_active', label: 'Идэвхтэй (1/0)' },
];
const KEYS = COLUMNS.map((c) => c.key);

// RFC 4180 CSV parser (хашилт доторх таслал, мөр шилжилтийг дэмжинэ)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  // Excel-ийн ';' тусгаарлагчийг танина
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let i = 1; i <= r.cellCount; i++) {
      const v = r.getCell(i).value;
      vals.push(
        v == null ? '' : typeof v === 'object' ? (v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : String(v))) : String(v)
      );
    }
    rows.push(vals);
  });
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

// Толгой мөрийн нэрийг түлхүүр рүү (sku, "SKU (заавал)", "Нэр" гэх мэт)
const HEADER_ALIASES = {
  sku: ['sku', 'код', 'барааны код'],
  name: ['name', 'нэр', 'барааны нэр'],
  price: ['price', 'үнэ'],
  stock: ['stock', 'үлдэгдэл', 'тоо', 'тоо ширхэг'],
  category: ['category', 'категори', 'ангилал'],
  brand: ['brand', 'брэнд'],
  compare_price: ['compare_price', 'хуучин үнэ'],
  low_stock_threshold: ['low_stock_threshold', 'анхааруулах доод үлдэгдэл', 'доод үлдэгдэл'],
  volume: ['volume', 'хэмжээ', 'хэмжээ/савлагаа'],
  short_desc: ['short_desc', 'товч тайлбар'],
  description: ['description', 'тайлбар', 'дэлгэрэнгүй тайлбар'],
  benefits: ['benefits', 'үйлчилгээ'],
  usage: ['usage', 'хэрэглэх заавар'],
  images: ['images', 'зураг', 'зургийн url'],
  is_active: ['is_active', 'идэвхтэй'],
};
function headerKey(h) {
  const n = String(h || '').trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(n)) return key;
  return null;
}

const splitList = (v) =>
  String(v || '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);

function findCategory(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return (
    db.prepare('SELECT id, name FROM categories WHERE slug = ?').get(v) ||
    db.prepare('SELECT id, name FROM categories WHERE lower(name) = lower(?)').get(v) ||
    null
  );
}

// Мөр бүрийг шалгаж action (create/update/error) тодорхойлно
function validateRows(table) {
  if (table.length < 2) return { rows: [], errors: ['Файлд толгой мөр болон дор хаяж нэг бараа байх ёстой'] };
  const keys = table[0].map(headerKey);
  if (!keys.includes('sku') || !keys.includes('name') || !keys.includes('price')) {
    return { rows: [], errors: ['Толгой мөрөнд sku, name, price баганууд заавал байх ёстой. Загвар файлыг татаж ашиглана уу.'] };
  }
  const seen = new Set();
  const rows = table.slice(1).map((vals, i) => {
    const raw = {};
    keys.forEach((k, j) => {
      if (k) raw[k] = String(vals[j] ?? '').trim();
    });
    const errors = [];
    const sku = clampStr(raw.sku, 60).toUpperCase();
    if (!sku) errors.push('SKU хоосон');
    if (seen.has(sku)) errors.push('Файлд SKU давхардсан');
    seen.add(sku);
    if (!raw.name) errors.push('Нэр хоосон');
    const price = Number(String(raw.price || '').replace(/[,\s₮]/g, ''));
    if (!Number.isFinite(price) || price < 0) errors.push('Үнэ буруу');
    const stockRaw = String(raw.stock ?? '').replace(/[,\s]/g, '');
    const stock = stockRaw === '' ? null : Number(stockRaw);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) errors.push('Үлдэгдэл буруу');
    let category = null;
    if (raw.category) {
      category = findCategory(raw.category);
      if (!category) errors.push(`"${raw.category}" категори олдсонгүй`);
    }
    const existing = sku ? db.prepare('SELECT id, stock FROM products WHERE sku = ?').get(sku) : null;
    return {
      line: i + 2,
      action: errors.length ? 'error' : existing ? 'update' : 'create',
      errors,
      data: {
        sku,
        name: clampStr(raw.name, 160),
        price: Math.round(price) || 0,
        stock,
        category_id: category ? category.id : null,
        category_name: category ? category.name : '',
        brand: clampStr(raw.brand, 60),
        compare_price: toInt(String(raw.compare_price || '').replace(/[,\s₮]/g, ''), 0),
        low_stock_threshold: raw.low_stock_threshold ? toInt(raw.low_stock_threshold, 5) : null,
        volume: clampStr(raw.volume, 120),
        short_desc: clampStr(raw.short_desc, 300),
        description: clampStr(raw.description, 5000),
        benefits: splitList(raw.benefits),
        usage: splitList(raw.usage),
        images: splitList(raw.images).filter((u) => /^(https?:\/\/|\/)/.test(u)),
        is_active: raw.is_active === undefined || raw.is_active === '' ? null : !['0', 'false', 'үгүй', 'no'].includes(raw.is_active.toLowerCase()),
      },
      current_stock: existing ? existing.stock : null,
    };
  });
  return { rows, errors: [] };
}

async function preview(file) {
  const name = String(file.originalname || '').toLowerCase();
  let table;
  if (name.endsWith('.xlsx')) table = await parseXlsx(file.buffer);
  else if (name.endsWith('.csv') || name.endsWith('.txt')) table = parseCsv(file.buffer.toString('utf8'));
  else return { rows: [], errors: ['Зөвхөн .csv эсвэл .xlsx файл дэмжинэ'] };
  const r = validateRows(table);
  return {
    ...r,
    summary: {
      total: r.rows.length,
      create: r.rows.filter((x) => x.action === 'create').length,
      update: r.rows.filter((x) => x.action === 'update').length,
      error: r.rows.filter((x) => x.action === 'error').length,
    },
  };
}

// Preview-ээс ирсэн мөрүүдийг дахин шалгаад хадгална (клиентэд итгэхгүй)
function commit(rows, actor) {
  const table = [KEYS, ...rows.map((r) => KEYS.map((k) => {
    const d = r.data || r;
    if (k === 'category') return d.category_id ? String(d.category_id) : d.category || '';
    const v = d[k];
    if (Array.isArray(v)) return v.join(' | ');
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
  }))];
  // category_id-г id-ээр хайхын тулд түр alias
  const checked = validateRowsWithIds(table);
  const valid = checked.rows.filter((r) => r.action !== 'error');
  const result = { created: 0, updated: 0, skipped: checked.rows.length - valid.length, errors: checked.rows.filter((r) => r.action === 'error') };
  tx(() => {
    const now = localDateTime();
    for (const r of valid) {
      const d = r.data;
      const existing = db.prepare('SELECT * FROM products WHERE sku = ?').get(d.sku);
      let productId;
      if (existing) {
        db.prepare(
          `UPDATE products SET name = ?, price = ?, category_id = COALESCE(?, category_id), brand = ?, compare_price = ?,
             low_stock_threshold = COALESCE(?, low_stock_threshold), volume = ?, short_desc = ?, description = ?,
             benefits = ?, usage = ?, is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`
        ).run(
          d.name, d.price, d.category_id, d.brand || existing.brand, d.compare_price, d.low_stock_threshold,
          d.volume || existing.volume, d.short_desc || existing.short_desc, d.description || existing.description,
          d.benefits.length ? JSON.stringify(d.benefits) : existing.benefits,
          d.usage.length ? JSON.stringify(d.usage) : existing.usage,
          d.is_active === null ? null : d.is_active ? 1 : 0, now, existing.id
        );
        productId = existing.id;
        if (d.stock !== null && d.stock !== existing.stock) {
          moveStock(productId, d.stock - existing.stock, { type: 'import', reason: 'Bulk импорт', actor });
        }
        result.updated++;
      } else {
        let slug = slugify(d.name);
        if (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug = `${slug}-${slugify(d.sku)}`;
        const info = db
          .prepare(
            `INSERT INTO products (sku, slug, name, brand, category_id, price, compare_price, stock, low_stock_threshold,
               volume, short_desc, description, benefits, usage, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            d.sku, slug, d.name, d.brand, d.category_id, d.price, d.compare_price, d.low_stock_threshold ?? 5,
            d.volume, d.short_desc, d.description, JSON.stringify(d.benefits), JSON.stringify(d.usage),
            d.is_active === false ? 0 : 1, now, now
          );
        productId = Number(info.lastInsertRowid);
        if (d.stock) moveStock(productId, d.stock, { type: 'import', reason: 'Bulk импорт (анхны үлдэгдэл)', actor });
        result.created++;
      }
      if (d.images.length) {
        const has = db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?').get(productId).n;
        if (!has) {
          const ins = db.prepare('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)');
          d.images.forEach((url, i) => ins.run(productId, url, i));
        }
      }
    }
  });
  return result;
}

function validateRowsWithIds(table) {
  // commit үед category нь id байж болно — findCategory-г түр өргөтгөнө
  const idx = table[0].indexOf('category');
  const t = table.map((row, i) => {
    if (i === 0 || idx < 0 || !/^\d+$/.test(row[idx])) return row;
    const c = db.prepare('SELECT slug FROM categories WHERE id = ?').get(Number(row[idx]));
    const copy = [...row];
    copy[idx] = c ? c.slug : row[idx];
    return copy;
  });
  return validateRows(t);
}

function templateCsv() {
  const example = [
    'ZF-TEA-60', 'Зерофит цай', '88000', '20', 'undaa', 'Zerofit', '', '5', '60ш, 30 өдрийн хэрэглээ',
    'Жин хасах цай', '', 'Өөхийг хайлуулна | Бодисын солилцоог хурдасгана', 'Өглөө 1 пакет хандалж ууна', '', '1',
  ];
  return '﻿' + [KEYS, example].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

async function templateXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Бараа');
  ws.columns = COLUMNS.map((c) => ({ header: c.key, key: c.key, width: Math.max(14, c.label.length + 2) }));
  ws.addRow(['ZF-TEA-60', 'Зерофит цай', 88000, 20, 'undaa', 'Zerofit', '', 5, '60ш, 30 өдрийн хэрэглээ', 'Жин хасах цай', '', 'Өөхийг хайлуулна | Бодисын солилцоог хурдасгана', 'Өглөө 1 пакет хандалж ууна', '', 1]);
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet('Заавар');
  help.columns = [{ header: 'Багана', key: 'k', width: 22 }, { header: 'Тайлбар', key: 'l', width: 50 }];
  COLUMNS.forEach((c) => help.addRow({ k: c.key, l: c.label }));
  const cats = db.prepare('SELECT slug, name FROM categories ORDER BY sort, name').all();
  const cs = wb.addWorksheet('Категориуд');
  cs.columns = [{ header: 'slug', key: 'slug', width: 24 }, { header: 'Нэр', key: 'name', width: 30 }];
  cats.forEach((c) => cs.addRow(c));
  return wb.xlsx.writeBuffer();
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV томьёо-тарилгаас хамгаална
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = { COLUMNS, KEYS, parseCsv, preview, commit, templateCsv, templateXlsx, csvCell };
