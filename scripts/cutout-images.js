// Бүтээгдэхүүний зурагнаас цагаан дэвсгэрийг хасаж ил тод PNG болгоно.
// Захаас эхлэн холбогдсон цайвар пикселүүдийг (flood fill) арилгадаг тул
// бүтээгдэхүүн доторх цагаан хэсэг хэвээр үлдэнэ.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'img', 'products');
const OUT = path.join(SRC, 'cutout');
fs.mkdirSync(OUT, { recursive: true });

const LIGHT = 247; // энэнээс цайвар пиксел дэвсгэр байж болно

async function cutout(file) {
  const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isLight = (i) => data[i] >= LIGHT && data[i + 1] >= LIGHT && data[i + 2] >= LIGHT;
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !isLight(p * 4)) continue;
    bg[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    // Захын пикселийг зөөлрүүлнэ (хөрш нь дэвсгэр бол хагас ил тод)
    const x = p % w;
    const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < w * (h - 1) && bg[p + w]);
    if (edge) data[p * 4 + 3] = 170;
  }
  const out = file.replace(/\.webp$/, '.png');
  await sharp(data, { raw: info }).trim().png({ compressionLevel: 9 }).toFile(path.join(OUT, out));
  return out;
}

(async () => {
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.webp'))) {
    console.log(`  ${f} → cutout/${await cutout(f)}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
