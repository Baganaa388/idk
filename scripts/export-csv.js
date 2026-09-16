// extracted-products.json → админы Bulk импортод шууд оруулах CSV
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEYS = ['sku', 'name', 'price', 'stock', 'category', 'brand', 'compare_price', 'low_stock_threshold', 'volume', 'short_desc', 'description', 'benefits', 'usage', 'images', 'is_active'];
const cell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'extracted-products.json'), 'utf8'));
const imgFile = path.join(__dirname, 'extracted-images.json');
const images = fs.existsSync(imgFile) ? Object.fromEntries(JSON.parse(fs.readFileSync(imgFile, 'utf8')).map((m) => [m.sku, m.image])) : {};

const rows = data.products.map((p) => ({
  sku: p.sku,
  name: p.name,
  price: p.price,
  stock: p.stock,
  category: p.category,
  brand: p.brand,
  compare_price: '',
  low_stock_threshold: 5,
  volume: p.volume,
  short_desc: p.benefits[0].slice(0, 140),
  description: '',
  benefits: p.benefits.join(' | '),
  usage: p.usage.join(' | '),
  images: images[p.sku] || '',
  is_active: 1,
}));

const out = path.join(__dirname, 'extracted-products.csv');
fs.writeFileSync(out, '﻿' + [KEYS.join(','), ...rows.map((r) => KEYS.map((k) => cell(r[k])).join(','))].join('\r\n'));
console.log(`CSV: ${out} (${rows.length} бараа)`);
