// Дахин ашиглагдах UI хэсгүүд: icon, header, ангиллын цэс, footer, барааны карт, төлбөрийн лого, pagination
import { state, api, esc, money, onStateChange, navigate, emitState, toast } from './core.js';

const svg = (d, size = 20, extra = '') =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icons = {
  search: (s) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  user: (s) => svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>', s),
  cart: (s) => svg('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.2"/><circle cx="17" cy="20.5" r="1.2"/>', s),
  menu: (s) => svg('<path d="M4 6h16M4 12h16M4 18h16"/>', s),
  close: (s) => svg('<path d="M6 6l12 12M18 6 6 18"/>', s),
  chevronDown: (s) => svg('<path d="m6 9 6 6 6-6"/>', s),
  chevronRight: (s) => svg('<path d="m9 6 6 6-6 6"/>', s),
  chevronLeft: (s) => svg('<path d="m15 6-6 6 6 6"/>', s),
  arrowRight: (s) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s),
  clock: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  phone: (s) => svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', s),
  pin: (s) => svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', s),
  mail: (s) => svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', s),
  check: (s) => svg('<path d="m5 12 5 5 9-10"/>', s),
  truck: (s) => svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>', s),
  tag: (s) => svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', s),
  shield: (s) => svg('<path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>', s),
  card: (s) => svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s),
  minus: (s) => svg('<path d="M5 12h14"/>', s),
  trash: (s) => svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', s),
  filter: (s) => svg('<path d="M4 5h16l-6 8v6l-4-2v-4z"/>', s),
  logout: (s) => svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>', s),
  box: (s) => svg('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>', s),
  award: (s) => svg('<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>', s),
  lock: (s) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', s),
  facebook: (s) => svg('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>', s),
  instagram: (s) => svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/>', s),
  alert: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>', s),
};

// Зурж гарч ирэх (stroke-draw) тэмдэг — амжилттай төлбөрт
export function drawCheck(size = 44) {
  return `<svg class="draw-check" width="${size}" height="${size}" viewBox="0 0 52 52" aria-hidden="true">
    <circle class="draw-check-circle" cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <path class="draw-check-mark" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M15 27l7 7 15-16"/>
  </svg>`;
}

// ---------- Төлбөрийн лого ----------
// QPay deeplink-ийн нэр/тайлбараас лого файл таних (хуучин нэхэмжлэхэд logo хоосон байж болно)
const PAY_LOGO_MAP = [
  [/qpay\s*(wallet|хэтэвч)/i, 'qpay-icon'],
  [/khan|хаан банк/i, 'khanbank'],
  [/state bank|төрийн банк/i, 'statebank'],
  [/xac|хас банк|khas/i, 'xacbank'],
  [/trade and development|tdb|тдб/i, 'tdbbank'],
  [/social ?pay|golomt|голомт/i, 'socialpay'],
  [/most|мост/i, 'most'],
  [/chinggis|чингис/i, 'ckbank'],
  [/capitron|капитрон/i, 'capitronbank'],
  [/bogd|богд/i, 'bogdbank'],
  [/trans ?bank|тээвэр хөгжлийн/i, 'transbank'],
  [/^m ?bank|м банк/i, 'mbank'],
  [/arig|ариг/i, 'arig'],
  [/monpay|монпэй/i, 'monpay'],
  [/\bard\b|ард апп/i, 'ard'],
  [/hipay/i, 'hipay'],
  [/pocket/i, 'pocket-app'],
  [/storepay/i, 'storepay-app'],
  [/^qpay$/i, 'qpay-icon'],
];

export const WALLET_RE = /pocket|storepay|lendmn|monpay|toki|most|мост|candy|\bard\b|ард апп|hipay|qpay\s*(wallet|хэтэвч)/i;

// Брэнд бүрийн өнгө (апп icon-ы ард суурь хавтан)
export const BRAND_COLORS = {
  'qpay-icon': '#0B2B5B',
  qpay: '#0B2B5B',
  khanbank: '#0B5E3A',
  statebank: '#00A0E3',
  xacbank: '#F04E23',
  tdbbank: '#1B75BB',
  socialpay: '#16A3D9',
  most: '#1C8C3C',
  ckbank: '#5B2A86',
  capitronbank: '#3B3B98',
  bogdbank: '#0D7A3E',
  transbank: '#1E2B4F',
  mbank: '#10B39B',
  arig: '#E0457B',
  monpay: '#1A1446',
  ard: '#6B6B6B',
  hipay: '#E6242E',
  pocket: '#E4334F',
  'pocket-app': '#E4334F',
  storepay: '#1F3BFF',
  'storepay-app': '#1F3BFF',
};

// Marquee-д харагдах апп/банкны жагсаалт
export const PAY_APPS = [
  ['qpay-icon', 'QPay'],
  ['khanbank', 'Хаан банк'],
  ['storepay-app', 'Storepay'],
  ['pocket-app', 'Pocket Zero'],
  ['socialpay', 'Голомт банк'],
  ['tdbbank', 'ТДБ'],
  ['xacbank', 'Хас банк'],
  ['statebank', 'Төрийн банк'],
  ['monpay', 'Монпэй'],
  ['most', 'МОСТ мони'],
  ['hipay', 'Hipay'],
  ['ckbank', 'Чингис хаан банк'],
  ['capitronbank', 'Капитрон банк'],
  ['bogdbank', 'Богд банк'],
  ['transbank', 'Тээвэр хөгжлийн банк'],
  ['mbank', 'М банк'],
  ['arig', 'Ариг банк'],
  ['ard', 'Ард апп'],
];

function logoKey(src) {
  const m = String(src || '').match(/\/img\/pay\/([a-z0-9-]+)\.png$/i);
  return m ? m[1] : '';
}

export function payLogoFor(d) {
  const logo = String((d && d.logo) || '');
  const hay = `${(d && d.name) || ''} | ${(d && d.description) || ''}`;
  // Хуучин нэхэмжлэх wordmark (pocket.png/storepay.png) заасан бол дөрвөлжин icon руу солино
  if (/^\/img\/pay\/(pocket|storepay)\.png$/.test(logo)) return logo.replace('.png', '-app.png');
  if (/^https:\/\//.test(logo) || /^\/img\//.test(logo)) return logo;
  for (const [re, file] of PAY_LOGO_MAP) if (re.test(hay)) return `/img/pay/${file}.png`;
  return '';
}

function brandColorFor(src, name) {
  const key = logoKey(src);
  if (BRAND_COLORS[key]) return BRAND_COLORS[key];
  for (const [re, file] of PAY_LOGO_MAP) if (re.test(name || '')) return BRAND_COLORS[file] || '#064A2B';
  return '#064A2B';
}

// Апп icon: дугуйрсан дөрвөлжин icon + брэнд өнгийн суурь хавтан
export function appIcon(src, name, { size = 'md', cls = '' } = {}) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase();
  const color = brandColorFor(src, name);
  return `<span class="appicon appicon-${size} ${cls}" style="--brand:${color}" title="${esc(name)}">
    <span class="appicon-base" aria-hidden="true"></span>
    <span class="appicon-face">${src ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy" width="96" height="96">` : `<span class="paylogo-initial">${esc(initial)}</span>`}</span>
  </span>`;
}

export function logoTile(src, name, cls = '') {
  return appIcon(src, name, { size: 'sm', cls });
}

// Төлбөрийн нөхцөлийн урсдаг зурвас (footer-ийн дээр)
export function renderPayBar() {
  const el = document.getElementById('paybar');
  if (!el) return;
  const items = PAY_APPS.map(([f, n]) => `<li>${appIcon(`/img/pay/${f}.png`, n, { size: 'lg' })}</li>`).join('');
  el.innerHTML = `<div class="container paybar-head">
      <div>
        <span class="kicker">Төлбөрийн нөхцөл</span>
        <h2>QPay-ээр бүх банк, зээлийн аппаар төлнө</h2>
      </div>
      <img src="/img/pay/qpay.png" alt="QPay" class="paybar-qpay" height="40">
    </div>
    <div class="marquee" aria-label="Төлбөр хүлээн авах банк, аппууд">
      <div class="marquee-track">
        <ul class="marquee-group">${items}</ul>
        <ul class="marquee-group" aria-hidden="true">${items}</ul>
      </div>
    </div>`;
}

// ---------- Custom select (native select-ийг орлоно) ----------
let cselectSeq = 0;
export function upgradeSelect(sel) {
  if (sel.dataset.enhanced || sel.hasAttribute('data-native')) return;
  sel.dataset.enhanced = '1';
  const id = `cs${++cselectSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'cselect';
  sel.parentNode.insertBefore(wrap, sel);
  const opts = [...sel.options];
  const label = sel.getAttribute('aria-label') || '';
  const cur = opts[sel.selectedIndex] || opts[0];
  wrap.innerHTML = `<button type="button" class="cselect-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" ${label ? `aria-label="${esc(label)}: ${esc(cur ? cur.text : '')}"` : ''}>
      <span class="cselect-value">${esc(cur ? cur.text : '')}</span>${icons.chevronDown(16)}
    </button>
    <ul class="cselect-list" id="${id}-list" role="listbox" tabindex="-1" ${label ? `aria-label="${esc(label)}"` : ''}>
      ${opts
        .map(
          (o, i) => `<li role="option" id="${id}-o${i}" data-index="${i}" aria-selected="${o.selected}" class="${o.selected ? 'is-selected' : ''}">
          <span>${esc(o.text)}</span>${icons.check(16)}
        </li>`
        )
        .join('')}
    </ul>`;
  wrap.appendChild(sel);
  sel.classList.add('cselect-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
}

function cselectParts(wrap) {
  return {
    btn: wrap.querySelector('.cselect-btn'),
    list: wrap.querySelector('.cselect-list'),
    sel: wrap.querySelector('select'),
    items: [...wrap.querySelectorAll('[role=option]')],
  };
}
function setActive(wrap, idx) {
  const { list, items } = cselectParts(wrap);
  const i = Math.max(0, Math.min(items.length - 1, idx));
  items.forEach((it, k) => it.classList.toggle('is-active', k === i));
  list.setAttribute('aria-activedescendant', items[i].id);
  items[i].scrollIntoView({ block: 'nearest' });
  wrap.dataset.active = String(i);
}
function openSelect(wrap) {
  closeAllSelects(wrap);
  const { btn, list, sel } = cselectParts(wrap);
  wrap.classList.add('is-open');
  btn.setAttribute('aria-expanded', 'true');
  setActive(wrap, sel.selectedIndex);
  list.focus({ preventScroll: true });
}
function closeSelect(wrap, focusBtn = false) {
  const { btn } = cselectParts(wrap);
  if (!wrap.classList.contains('is-open')) return;
  wrap.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
  if (focusBtn) btn.focus({ preventScroll: true });
}
function closeAllSelects(except) {
  document.querySelectorAll('.cselect.is-open').forEach((w) => w !== except && closeSelect(w));
}
function chooseOption(wrap, idx) {
  const { btn, sel, items } = cselectParts(wrap);
  const changed = sel.selectedIndex !== idx;
  sel.selectedIndex = idx;
  items.forEach((it, k) => {
    it.classList.toggle('is-selected', k === idx);
    it.setAttribute('aria-selected', String(k === idx));
  });
  const text = sel.options[idx].text;
  btn.querySelector('.cselect-value').textContent = text;
  const lbl = sel.getAttribute('aria-label');
  if (lbl) btn.setAttribute('aria-label', `${lbl}: ${text}`);
  closeSelect(wrap, true);
  if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function bindCustomSelects() {
  const app = document.getElementById('app');
  const scan = (root) => root.querySelectorAll('select').forEach(upgradeSelect);
  new MutationObserver(() => scan(app)).observe(app, { childList: true, subtree: true });
  scan(app);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.cselect-btn');
    const opt = e.target.closest('.cselect [role=option]');
    if (btn || opt) e.preventDefault(); // <label> дотор байвал давхар идэвхжихээс сэргийлнэ
    if (btn) {
      const wrap = btn.closest('.cselect');
      if (wrap.classList.contains('is-open')) closeSelect(wrap, true);
      else openSelect(wrap);
      return;
    }
    if (opt) {
      chooseOption(opt.closest('.cselect'), Number(opt.dataset.index));
      return;
    }
    if (!e.target.closest('.cselect')) closeAllSelects();
  });
  document.addEventListener('mousemove', (e) => {
    const opt = e.target.closest && e.target.closest('.cselect.is-open [role=option]');
    if (opt) setActive(opt.closest('.cselect'), Number(opt.dataset.index));
  });
  document.addEventListener('keydown', (e) => {
    const wrap = e.target.closest && e.target.closest('.cselect');
    if (!wrap) return;
    const open = wrap.classList.contains('is-open');
    const { items } = cselectParts(wrap);
    const active = Number(wrap.dataset.active || 0);
    if (!open && e.target.classList.contains('cselect-btn')) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openSelect(wrap);
      }
      return;
    }
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(wrap, active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(wrap, active - 1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(wrap, 0);
        break;
      case 'End':
        e.preventDefault();
        setActive(wrap, items.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        chooseOption(wrap, active);
        break;
      case 'Escape':
        e.preventDefault();
        closeSelect(wrap, true);
        break;
      case 'Tab':
        closeSelect(wrap);
        break;
      default:
    }
  });
}

const PAY_BRANDS = [
  ['qpay', 'QPay', 'wide'],
  ['storepay', 'Storepay', 'wide'],
  ['pocket', 'Pocket Zero', 'wide'],
  ['khanbank', 'Хаан банк'],
  ['socialpay', 'Голомт банк'],
  ['tdbbank', 'ТДБ'],
  ['xacbank', 'Хас банк'],
  ['statebank', 'Төрийн банк'],
  ['monpay', 'Монпэй'],
];

// Жижиг лого мөр — footer, checkout, барааны дэлгэрэнгүй
export function paymentLogos({ limit = PAY_BRANDS.length, cls = '' } = {}) {
  return `<div class="paylogos ${cls}">${PAY_BRANDS.slice(0, limit)
    .map(([f, n, kind]) => `<span class="paychip ${kind === 'wide' ? 'paychip-wide' : ''}" title="${esc(n)}"><img src="/img/pay/${f}.png" alt="${esc(n)}" loading="lazy"></span>`)
    .join('')}</div>`;
}

// ---------- Туслах ----------
export function flattenCategories(tree, depth = 0, parent = null, out = []) {
  for (const c of tree || []) {
    out.push({ ...c, depth, parent });
    flattenCategories(c.children, depth + 1, c, out);
  }
  return out;
}
export function findCategory(slug) {
  return flattenCategories(state.site ? state.site.categories : []).find((c) => c.slug === slug) || null;
}

export function tierLabel(tiers, i) {
  const t = tiers[i];
  const next = tiers[i + 1];
  if (!next) return i === 0 ? 'Бүх худалдан авалт' : `${t.min_order}-р ба цаашид`;
  if (next.min_order - t.min_order > 1) return `${t.min_order}–${next.min_order - 1}-р худалдан авалт`;
  return `${t.min_order}-р худалдан авалт`;
}
export function tierBenefit(t) {
  return t.pct > 0 ? `${t.pct}% хямдрал` : 'Үндсэн үнэ';
}

export function breadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Байршил"><a href="/">Нүүр</a>${items
    .map((it) => `<span class="crumb-sep">/</span>${it.href ? `<a href="${esc(it.href)}">${esc(it.label)}</a>` : `<span aria-current="page">${esc(it.label)}</span>`}`)
    .join('')}</nav>`;
}

export function priceHtml(price, compare, cls = '') {
  const hasCompare = Number(compare) > Number(price);
  return `<div class="price ${cls}"><span class="price-now">${money(price)}</span>${hasCompare ? `<s class="price-old">${money(compare)}</s>` : ''}</div>`;
}

export function productCard(p, i = 0) {
  const href = `/p/${encodeURIComponent(p.slug)}`;
  const off = Number(p.compare_price) > Number(p.price) ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  const badge = !p.in_stock
    ? '<span class="badge badge-muted">Дууссан</span>'
    : off > 0
      ? `<span class="badge badge-accent">-${off}%</span>`
      : p.low_stock
        ? '<span class="badge badge-warn">Цөөн үлдсэн</span>'
        : '';
  return `<article class="pcard reveal" style="--d:${Math.min(i, 8) * 55}ms">
    <a href="${href}" class="pcard-img">
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400">` : '<span class="img-ph"></span>'}
      ${badge ? `<span class="pcard-badges">${badge}</span>` : ''}
    </a>
    <div class="pcard-body">
      ${p.brand ? `<div class="pcard-brand">${esc(p.brand)}</div>` : ''}
      <a href="${href}" class="pcard-name" title="${esc(p.name)}">${esc(p.name)}</a>
      ${p.volume ? `<div class="pcard-meta">${esc(p.volume)}</div>` : ''}
      ${priceHtml(p.price, p.compare_price)}
      <button type="button" class="btn btn-outline btn-block pcard-add" data-add="${esc(p.id)}" ${p.in_stock ? '' : 'disabled'}>
        <span class="add-icon">${icons.cart(18)}</span><span class="add-label">${p.in_stock ? 'Сагсанд нэмэх' : 'Дууссан'}</span>
      </button>
    </div>
  </article>`;
}

export function productGrid(items, cls = '') {
  return `<div class="pgrid ${cls}">${items.map((p, i) => productCard(p, i)).join('')}</div>`;
}

export function pagination(page, pages, hrefFor) {
  if (pages <= 1) return '';
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  let html = '';
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) html += '<span class="page-gap">…</span>';
    html += n === page ? `<span class="page-num is-active" aria-current="page">${n}</span>` : `<a class="page-num" href="${esc(hrefFor(n))}">${n}</a>`;
    prev = n;
  }
  return `<nav class="pager" aria-label="Хуудас">
    ${page > 1 ? `<a class="page-num" href="${esc(hrefFor(page - 1))}" aria-label="Өмнөх">${icons.chevronLeft(16)}</a>` : ''}
    ${html}
    ${page < pages ? `<a class="page-num" href="${esc(hrefFor(page + 1))}" aria-label="Дараах">${icons.chevronRight(16)}</a>` : ''}
  </nav>`;
}

export function qtyStepper(value, max, attrs = '') {
  return `<div class="qty" ${attrs}>
    <button type="button" class="qty-btn" data-qty="-1" aria-label="Хасах" ${value <= 1 ? 'disabled' : ''}>${icons.minus(16)}</button>
    <input type="number" class="qty-input" value="${esc(value)}" min="1" max="${esc(max)}" inputmode="numeric" aria-label="Тоо ширхэг">
    <button type="button" class="qty-btn" data-qty="1" aria-label="Нэмэх" ${value >= max ? 'disabled' : ''}>${icons.plus(16)}</button>
  </div>`;
}

export function emptyState(title, text, action) {
  return `<div class="empty">
    <div class="empty-icon">${icons.box(40)}</div>
    <h2>${esc(title)}</h2>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action ? `<a href="${esc(action.href)}" class="btn btn-primary">${esc(action.label)}</a>` : ''}
  </div>`;
}

export function statusBadge(order) {
  const cls = { pending: 'badge-warn', processing: 'badge-info', shipped: 'badge-info', delivered: 'badge-ok', cancelled: 'badge-muted' }[order.status] || 'badge-muted';
  return `<span class="badge ${cls}">${esc(order.status_label || order.status)}</span>`;
}
export function paymentBadge(order) {
  const cls = { pending: 'badge-warn', paid: 'badge-ok', cancelled: 'badge-muted' }[order.payment_status] || 'badge-muted';
  return `<span class="badge ${cls}">${esc(order.payment_status_label || order.payment_status)}</span>`;
}

// ---------- Skeleton loader ----------
export function skeleton(kind = 'default') {
  const card = '<div class="sk-card"><div class="sk sk-img"></div><div class="sk sk-line w40"></div><div class="sk sk-line w90"></div><div class="sk sk-line w60"></div><div class="sk sk-btn"></div></div>';
  const grid = (n, cls = '') => `<div class="pgrid ${cls}">${card.repeat(n)}</div>`;
  let inner;
  if (kind === 'home') {
    inner = `<div class="sk sk-hero"></div><div class="sk-row">${'<div class="sk sk-perk"></div>'.repeat(4)}</div><div class="sk sk-line sk-title"></div>${grid(6, 'pgrid-home')}`;
  } else if (kind === 'listing') {
    inner = `<div class="sk sk-line sk-crumb"></div><div class="listing-layout"><div class="sk sk-side"></div><div><div class="sk sk-line sk-title"></div>${grid(8, 'pgrid-listing')}</div></div>`;
  } else if (kind === 'product') {
    inner = `<div class="sk sk-line sk-crumb"></div><div class="pd"><div class="sk sk-gallery"></div><div class="sk-stack"><div class="sk sk-line w20"></div><div class="sk sk-line sk-h1"></div><div class="sk sk-line w40"></div><div class="sk sk-line sk-price"></div><div class="sk sk-line w90"></div><div class="sk sk-line w70"></div><div class="sk sk-btn sk-btn-lg"></div><div class="sk sk-box"></div></div></div>`;
  } else {
    inner = `<div class="sk sk-line sk-crumb"></div><div class="two-col"><div class="sk-stack"><div class="sk sk-box sk-box-lg"></div><div class="sk sk-box"></div></div><div class="sk sk-box sk-box-lg"></div></div>`;
  }
  return `<div class="container skeleton-page" aria-busy="true" aria-label="Уншиж байна">${inner}</div>`;
}

// ---------- Layout: header / nav / drawer / footer ----------
function accountMenu() {
  if (!state.user) return '';
  return `<div class="acc-menu" role="menu">
    <div class="acc-menu-head"><b>${esc(state.user.name || 'Миний бүртгэл')}</b><small>${esc(state.user.phone || state.user.email || '')}</small></div>
    <a href="/account" role="menuitem">${icons.box(16)} Миний захиалга</a>
    <a href="/account/loyalty" role="menuitem">${icons.award(16)} Гишүүнчлэл</a>
    <a href="/account/profile" role="menuitem">${icons.user(16)} Хувийн мэдээлэл</a>
    <button type="button" data-header-logout role="menuitem">${icons.logout(16)} Гарах</button>
  </div>`;
}

function accountHtml() {
  return `<a href="/account" class="haction">${icons.user(24)}<span class="haction-text"><small>${state.user ? 'Сайн байна уу' : 'Хэрэглэгч'}</small><b>${state.user ? esc(state.user.name || 'Миний бүртгэл') : 'Нэвтрэх'}</b></span></a>${accountMenu()}`;
}

function renderHeader() {
  const el = document.getElementById('header');
  const q = location.pathname === '/products' ? new URLSearchParams(location.search).get('q') || '' : '';
  el.innerHTML = `<div class="container header-inner">
    <button type="button" class="icon-btn header-menu" data-drawer-open aria-label="Ангилал">${icons.menu(24)}</button>
    <a href="/" class="logo" aria-label="${esc(state.site.business.name)} — нүүр">
      <img src="/img/brand/logo-mark-dark.png" alt="" class="logo-mark" width="40" height="40">
      <img src="/img/brand/logo-word-dark.png" alt="${esc(state.site.business.name)}" class="logo-word" height="22">
    </a>
    <form class="search" role="search" data-search>
      <input type="search" name="q" value="${esc(q)}" placeholder="Бүтээгдэхүүн хайх..." aria-label="Хайх" autocomplete="off">
      <button type="submit" aria-label="Хайх">${icons.search(20)}</button>
    </form>
    <div class="header-actions">
      <div class="haccount" data-account>${accountHtml()}</div>
      <a href="/cart" class="haction" data-cart>
        <span class="cart-icon">${icons.cart(24)}<span class="cart-count" ${state.cartCount ? '' : 'hidden'}>${esc(state.cartCount)}</span></span>
        <span class="haction-text"><small>Миний</small><b>Сагс</b></span>
      </a>
    </div>
  </div>`;
  el.querySelector('[data-search]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.q.value.trim();
    navigate(v ? `/products?q=${encodeURIComponent(v)}` : '/products');
  });
}

let lastUserKey = null;
let lastCount = null;
function updateHeaderState() {
  const acc = document.querySelector('[data-account]');
  const userKey = state.user ? `${state.user.id}:${state.user.name}` : '';
  if (acc && userKey !== lastUserKey) {
    acc.innerHTML = accountHtml();
    lastUserKey = userKey;
  }
  const cnt = document.querySelector('[data-cart] .cart-count');
  if (cnt) {
    cnt.textContent = state.cartCount > 99 ? '99+' : String(state.cartCount);
    cnt.hidden = !state.cartCount;
    if (lastCount !== null && state.cartCount > lastCount) {
      cnt.classList.remove('bump');
      void cnt.offsetWidth;
      cnt.classList.add('bump');
    }
    lastCount = state.cartCount;
  }
  const input = document.querySelector('[data-search] input');
  if (input && document.activeElement !== input) {
    input.value = location.pathname === '/products' ? new URLSearchParams(location.search).get('q') || '' : '';
  }
  const path = location.pathname;
  document.querySelectorAll('#catnav a[data-slug]').forEach((a) => {
    a.classList.toggle('is-active', path === `/c/${a.dataset.slug}`);
  });
}

function renderNav() {
  const cats = state.site.categories || [];
  const el = document.getElementById('catnav');
  el.innerHTML = `<div class="container catnav-inner">
    <a href="/products" class="catnav-link catnav-all">${icons.menu(18)}<span>Бүх бараа</span></a>
    ${cats
      .map(
        (c) => `<div class="catnav-item ${c.children && c.children.length ? 'has-sub' : ''}">
        <a href="/c/${esc(c.slug)}" class="catnav-link" data-slug="${esc(c.slug)}">${esc(c.name)}${c.children && c.children.length ? icons.chevronDown(14) : ''}</a>
        ${
          c.children && c.children.length
            ? `<div class="catnav-sub">${c.children
                .map((s) => `<a href="/c/${esc(s.slug)}" data-slug="${esc(s.slug)}">${esc(s.name)}<span>${esc(s.total_count)}</span></a>`)
                .join('')}</div>`
            : ''
        }
      </div>`
      )
      .join('')}
    <a href="/products?sort=popular" class="catnav-link">Их борлуулалттай</a>
    <a href="/products?sort=new" class="catnav-link">Шинэ</a>
    ${state.site.delivery && state.site.delivery.free_over > 0 ? `<span class="catnav-note">${icons.truck(16)} ${money(state.site.delivery.free_over)}-с дээш хүргэлт үнэгүй</span>` : ''}
  </div>`;

  const b = state.site.business;
  const drawer = document.getElementById('drawer');
  const tree = (nodes, depth) =>
    nodes
      .map(
        (c) => `<a href="/c/${esc(c.slug)}" class="drawer-link depth-${depth}">${esc(c.name)}<span>${esc(c.total_count)}</span></a>${c.children && c.children.length ? tree(c.children, depth + 1) : ''}`
      )
      .join('');
  drawer.innerHTML = `<div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer-panel" role="dialog" aria-label="Цэс">
      <div class="drawer-head">
        <img src="/img/brand/logo-word-dark.png" alt="${esc(b.name)}" height="18">
        <button type="button" class="icon-btn" data-drawer-close aria-label="Хаах">${icons.close(22)}</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-title">Ангилал</div>
        <a href="/products" class="drawer-link depth-0">Бүх бараа</a>
        ${tree(cats, 0)}
        <div class="drawer-title">Бүртгэл</div>
        <a href="/account" class="drawer-link depth-0">Миний захиалга</a>
        <a href="/account/loyalty" class="drawer-link depth-0">Гишүүнчлэл</a>
        <a href="/cart" class="drawer-link depth-0">Сагс</a>
        <div class="drawer-info">
          ${b.hours ? `<p>${icons.clock(15)} ${esc(b.hours)}</p>` : ''}
          ${(b.phones || []).length ? `<p>${icons.phone(15)} ${b.phones.map((p) => `<a href="tel:${esc(p.replace(/\D/g, ''))}" data-external>${esc(p)}</a>`).join(', ')}</p>` : ''}
        </div>
      </div>
    </aside>`;
}

function renderFooter() {
  const b = state.site.business;
  const d = state.site.delivery || {};
  const el = document.getElementById('footer');
  const year = new Date().getFullYear();
  el.innerHTML = `<div class="container footer-grid">
      <div class="footer-col footer-about">
        <a href="/" class="logo footer-logo"><img src="/img/brand/logo-mark-dark.png" alt="" width="36" height="36"><img src="/img/brand/logo-word-dark.png" alt="${esc(b.name)}" height="18"></a>
        ${b.tagline ? `<p class="footer-tagline">${esc(b.tagline)}</p>` : ''}
        ${b.address ? `<p class="footer-line">${icons.pin(16)}<span>${esc(b.address)}${b.address_note ? `<small>${esc(b.address_note)}</small>` : ''}</span></p>` : ''}
      </div>
      <div class="footer-col">
        <h4>Холбоо барих</h4>
        ${(b.phones || []).length ? `<p class="footer-line">${icons.phone(16)}<span>${b.phones.map((p) => `<a href="tel:${esc(p.replace(/\D/g, ''))}" data-external>${esc(p)}</a>`).join('<br>')}</span></p>` : ''}
        ${b.email ? `<p class="footer-line">${icons.mail(16)}<a href="mailto:${esc(b.email)}" data-external>${esc(b.email)}</a></p>` : ''}
        ${b.hours ? `<p class="footer-line">${icons.clock(16)}<span>Өдөр бүр ${esc(b.hours)}</span></p>` : ''}
        ${
          b.facebook || b.instagram
            ? `<div class="footer-social">${b.facebook ? `<a href="${esc(b.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icons.facebook(18)}</a>` : ''}${b.instagram ? `<a href="${esc(b.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${icons.instagram(18)}</a>` : ''}</div>`
            : ''
        }
      </div>
      <div class="footer-col">
        <h4>Худалдан авалт</h4>
        <ul class="footer-links">
          <li><a href="/products">Бүх бараа</a></li>
          <li><a href="/products?sort=popular">Их борлуулалттай</a></li>
          <li><a href="/cart">Сагс</a></li>
          <li><a href="/account">Миний захиалга</a></li>
          <li><a href="/account/loyalty">Гишүүнчлэлийн хямдрал</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Хүргэлт</h4>
        ${d.note ? `<p class="footer-line">${icons.truck(16)}<span>${esc(d.note)}</span></p>` : ''}
        <p class="footer-line">${icons.tag(16)}<span>${Number(d.fee) > 0 ? `Хүргэлт ${money(d.fee)}${Number(d.free_over) > 0 ? `, ${money(d.free_over)}-с дээш захиалгад үнэгүй` : ''}` : 'Хүргэлт үнэгүй'}</span></p>
      </div>
    </div>
    <div class="footer-bottom"><div class="container">© ${year} ${esc(b.name)}. Бүх эрх хуулиар хамгаалагдсан.</div></div>`;
}

export function openDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
}
export function closeDrawer() {
  const drawer = document.getElementById('drawer');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
}

export function renderLayout() {
  renderHeader();
  renderNav();
  renderFooter();
  renderPayBar();
  bindCustomSelects();
  lastUserKey = state.user ? `${state.user.id}:${state.user.name}` : '';
  onStateChange(updateHeaderState);

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-drawer-open]')) openDrawer();
    else if (e.target.closest('[data-drawer-close]')) closeDrawer();
    if (e.target.closest('[data-header-logout]')) {
      try {
        await api('/account/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      state.user = null;
      state.loyalty = null;
      state.cartCount = 0;
      emitState();
      toast('Системээс гарлаа');
      navigate('/', { replace: true });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
}
