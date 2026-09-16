// Эх сурвалж зурагнуудаас (info*.jpg) бүтээгдэхүүний зургийг тайрч цэвэрлэнэ.
// - crop: extracted-products.json доторх хайрцгаар тайрна
// - trim: үлдсэн нэг өнгийн (цөцгий) дэвсгэрийг автоматаар хасна
// - дөрвөлжин цагаан дэвсгэр дээр төвлөрүүлж 800x800 webp болгоно
// Лого: ногоон дэвсгэрийг ил тод болгож, header-т зориулсан хар ногоон хувилбар гаргана.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_PRODUCTS = path.join(ROOT, 'public', 'img', 'products');
const OUT_BRAND = path.join(ROOT, 'public', 'img', 'brand');
fs.mkdirSync(OUT_PRODUCTS, { recursive: true });
fs.mkdirSync(OUT_BRAND, { recursive: true });

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'extracted-products.json'), 'utf8'));

async function productImage(p) {
  const src = path.join(ROOT, p.source_image);
  const cropped = await sharp(src).extract(p.crop).flatten({ background: '#ffffff' }).toBuffer();
  const trimmedRaw = await sharp(cropped).trim({ threshold: 18 }).raw().toBuffer({ resolveWithObject: true });
  // Цөцгий өнгийн слайдын дэвсгэрийг цэвэр цагаан болгоно (бүтээгдэхүүний өнгийг хөндөхгүй)
  const px = trimmedRaw.data;
  const ch = trimmedRaw.info.channels;
  for (let i = 0; i < px.length; i += ch) {
    if (px[i] > 236 && px[i + 1] > 232 && px[i + 2] > 225) px[i] = px[i + 1] = px[i + 2] = 255;
  }
  const trimmed = await sharp(px, { raw: trimmedRaw.info }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const side = Math.round(Math.max(meta.width, meta.height) * 1.12);
  const file = `${p.slug}.webp`;
  await sharp({ create: { width: side, height: side, channels: 3, background: '#ffffff' } })
    .composite([{ input: trimmed, gravity: 'center' }])
    .resize(800, 800)
    .webp({ quality: 88 })
    .toFile(path.join(OUT_PRODUCTS, file));
  return `/img/products/${file}`;
}

// Ногоон дэвсгэртэй лого → ил тод дэвсгэр дээр ганц өнгөөр (color) зурсан PNG
async function recolorLogo(color, file, region) {
  let img = sharp(path.join(ROOT, 'logo.jpg'));
  if (region) img = img.extract(region);
  const { data: px, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const [r, g, b] = color;
  for (let i = 0; i < px.length; i += 4) {
    // Дэвсгэр #064A2B орчим, зурлага #DDFBA8 орчим — гэрэлтэлтээр alpha тооцно
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const a = Math.max(0, Math.min(255, ((lum - 60) / (225 - 60)) * 255));
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  await sharp(px, { raw: info }).trim().png().toFile(path.join(OUT_BRAND, file));
}

async function main() {
  const manifest = [];
  for (const p of data.products) {
    const image = await productImage(p);
    manifest.push({ sku: p.sku, image });
    console.log(`  ${p.source_image} → ${image}`);
  }

  const dark = [6, 74, 43];
  const light = [221, 251, 168];
  await recolorLogo(dark, 'logo-full-dark.png');
  await recolorLogo(light, 'logo-full-light.png');
  await recolorLogo(dark, 'logo-mark-dark.png', { left: 560, top: 470, width: 480, height: 450 });
  await recolorLogo(light, 'logo-mark-light.png', { left: 560, top: 470, width: 480, height: 450 });
  // Wordmark (AKTAR MARKA) — header-т хэвтээ байрлуулна
  await recolorLogo(dark, 'logo-word-dark.png', { left: 150, top: 960, width: 1300, height: 160 });
  await recolorLogo(light, 'logo-word-light.png', { left: 150, top: 960, width: 1300, height: 160 });
  await sharp(path.join(ROOT, 'info.jpg')).resize(1600).webp({ quality: 85 }).toFile(path.join(OUT_BRAND, 'banner-store.webp'));
  await sharp(path.join(ROOT, 'info1.jpg')).resize(900).webp({ quality: 85 }).toFile(path.join(OUT_BRAND, 'green-juice.webp'));
  await sharp(path.join(ROOT, 'logo.jpg')).extract({ left: 560, top: 470, width: 480, height: 450 })
    .resize(64, 64, { fit: 'contain', background: '#064A2B' }).png().toFile(path.join(ROOT, 'public', 'favicon.png'));

  fs.writeFileSync(path.join(__dirname, 'extracted-images.json'), JSON.stringify(manifest, null, 2));
  console.log('Зураг цэвэрлэж дууслаа.');
}

main().catch((e) => { console.error(e); process.exit(1); });
