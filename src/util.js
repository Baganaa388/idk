// Дундын туслах функцууд — огноо, алдаа, таних тэмдэг (и-мэйл/утас), slug.
'use strict';

const pad = (n) => String(n).padStart(2, '0');

// Серверийн локал цагаар (TZ=Asia/Ulaanbaatar) 'YYYY-MM-DD HH:MM:SS'
function localDateTime(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addMinutes(d, m) {
  return new Date(d.getTime() + m * 60_000);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Хэрэглэгчийн оруулсан "и-мэйл эсвэл утас"-ыг нэг хэлбэрт оруулна
function parseIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.includes('@')) {
    const email = s.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return null;
    return { type: 'email', value: email };
  }
  let digits = s.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+976')) digits = digits.slice(4);
  else if (digits.startsWith('976') && digits.length === 11) digits = digits.slice(3);
  if (!/^[0-9]{8}$/.test(digits)) return null;
  return { type: 'phone', value: digits };
}

const isPhone = (s) => typeof s === 'string' && /^[0-9]{8}$/.test(s);

// Кирилл → латин slug (URL-д)
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'yu', я: 'ya',
};
function slugify(s) {
  const out = String(s || '')
    .toLowerCase()
    .split('')
    .map((c) => (c in TRANSLIT ? TRANSLIT[c] : c))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return out || 'item';
}

const toInt = (v, dflt = 0) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : dflt;
};
const clampStr = (v, max) => String(v ?? '').trim().slice(0, max);

module.exports = {
  localDateTime,
  localDate,
  addMinutes,
  httpError,
  parseIdentifier,
  isPhone,
  slugify,
  toInt,
  clampStr,
};
