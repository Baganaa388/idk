// Админ самбарын дундын туслахууд — DOM, API, формат, дүрс, modal, toast, chart, pager.
// Бүх динамик өгөгдөл esc()-ээр дамжиж DOM-д орно.
'use strict';

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= Формат ================= */
const fmtT = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')}₮`;
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US');
const fmtDate = (s) => (s ? String(s).slice(0, 10).replaceAll('-', '.') : '—');
const fmtDT = (s) => (s ? `${String(s).slice(0, 10).replaceAll('-', '.')} ${String(s).slice(11, 16)}` : '—');
const fmtPhone = (s) => (s && String(s).length === 8 ? `${String(s).slice(0, 4)}-${String(s).slice(4)}` : s || '');
const compact = (v) =>
  Math.abs(v) >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}сая` : Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(0)}мян` : v;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ================= API ================= */
let onAuthLost = null;
async function api(path, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const init = { method: opts.method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: {} };
  if (opts.body !== undefined) {
    if (isForm) init.body = opts.body; // Content-Type-г браузер boundary-тай тавина
    else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    const e = new Error('Сервертэй холбогдож чадсангүй');
    e.status = 0;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* хоосон */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Алдаа гарлаа (${res.status})`);
    err.status = res.status;
    err.data = data;
    if (res.status === 401 && !path.endsWith('/login') && onAuthLost) onAuthLost();
    throw err;
  }
  return data;
}

/* ================= Toast ================= */
function toast(msg, type = 'ok') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span>${type === 'ok' ? ICONS.check : ICONS.alert}</span><div>${esc(msg)}</div>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 5000 : 3200);
}

/* ================= Дүрс ================= */
const _i = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  gauge: _i('<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5"/>'),
  receipt: _i('<path d="M6 3h12v18l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  box: _i('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>'),
  layers: _i('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
  warehouse: _i('<path d="M3 20V8.5L12 4l9 4.5V20"/><path d="M7 20v-8h10v8M7 15.5h10"/>'),
  upload: _i('<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>'),
  download: _i('<path d="M12 4v12M7.5 11.5 12 16l4.5-4.5M4 20h16"/>'),
  users: _i('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 15.2c2.3.3 4.2 1.9 5 4.8"/>'),
  chart: _i('<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>'),
  sliders: _i('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  logout: _i('<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>'),
  menu: _i('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  search: _i('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>'),
  trash: _i('<path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14M10 11v6M14 11v6"/>'),
  pencil: _i('<path d="M4 20l4.5-1L20 7.5a1.5 1.5 0 0 0 0-2.1l-1.4-1.4a1.5 1.5 0 0 0-2.1 0L5 15.5 4 20Z"/>'),
  check: _i('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: _i('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: _i('<path d="M12 5v14M5 12h14"/>'),
  alert: _i('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16.2v.3"/>'),
  info: _i('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.3"/>'),
  back: _i('<path d="M20 12H5M10 6.5 4.5 12l5.5 5.5"/>'),
  arrow: _i('<path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/>'),
  left: _i('<path d="m14.5 6-6 6 6 6"/>'),
  right: _i('<path d="m9.5 6 6 6-6 6"/>'),
  image: _i('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>'),
  refresh: _i('<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>'),
  coin: _i('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9 9.8h6M9 14.2h6"/>'),
  calendar: _i('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  truck: _i('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>'),
  clock: _i('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  star: _i('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/></svg>',
  external: _i('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  wallet: _i('<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M16 6V5a2 2 0 0 0-2.4-2L4.6 5"/><circle cx="16.5" cy="13" r="1.3" fill="currentColor" stroke="none"/>'),
  user: _i('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6"/>'),
  pin: _i('<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.3" r="2.3"/>'),
  file: _i('<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5Z"/><path d="M14 3v5h5"/>'),
  lock: _i('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  trendUp: _i('<path d="m4 16 5.5-5.5 4 4L20 8M15 8h5v5"/>'),
  trendDown: _i('<path d="m4 8 5.5 5.5 4-4L20 16M15 16h5v-5"/>'),
  grid: _i('<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>'),
  list: _i('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="18" r=".9" fill="currentColor"/>'),
  eye: _i('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>'),
  cart: _i('<circle cx="9" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/><path d="M3 4h2.2l2.3 11h11l2-7.5H6.3"/>'),
  repeat: _i('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>'),
};

/* ================= Шошго, төлөв ================= */
const ORDER_STATUS = {
  pending: ['Хүлээгдэж буй', 'warn'],
  processing: ['Бэлтгэгдэж буй', 'blue'],
  shipped: ['Илгээгдсэн', 'violet'],
  delivered: ['Хүргэгдсэн', 'ok'],
  cancelled: ['Цуцлагдсан', 'off'],
};
const PAY_STATUS = {
  pending: ['Хүлээгдэж буй', 'warn'],
  paid: ['Төлөгдсөн', 'ok'],
  cancelled: ['Цуцлагдсан', 'off'],
  expired: ['Хугацаа дууссан', 'off'],
};
const MOVE_TYPES = {
  initial: 'Анхны', in: 'Орлого', out: 'Зарлага', adjust: 'Тооллого', order: 'Захиалга', cancel: 'Цуцлалт', import: 'Импорт',
};
const statusChip = (s) => {
  const [label, cls] = ORDER_STATUS[s] || [s, 'off'];
  return `<span class="chip chip--${cls}">${esc(label)}</span>`;
};
const payChip = (s) => {
  const [label, cls] = PAY_STATUS[s] || [s, 'off'];
  return `<span class="chip chip--${cls}"><i class="dot"></i>${esc(label)}</span>`;
};
const activeChip = (on) => (on ? '<span class="chip chip--ok">Идэвхтэй</span>' : '<span class="chip chip--off">Идэвхгүй</span>');
function stockChip(stock, threshold) {
  if (stock <= 0) return `<span class="chip chip--red num">${fmtNum(stock)}</span>`;
  if (stock <= threshold) return `<span class="chip chip--warn num">${fmtNum(stock)}</span>`;
  return `<span class="chip num">${fmtNum(stock)}</span>`;
}
// Үлдэгдлийн түвшний зурвас. max — харьцуулах дээд утга (анхдагч: босгын 4 дахин)
function stockBar(stock, threshold, max) {
  const cap = Math.max(1, max || Math.max(threshold * 4, stock, 10));
  const pct = Math.max(stock > 0 ? 4 : 0, Math.min(100, Math.round((stock / cap) * 100)));
  const cls = stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'ok';
  return `<span class="stockbar stockbar--${cls}" title="Үлдэгдэл ${fmtNum(stock)} · босго ${fmtNum(threshold)}"><i style="--w:${pct}%"></i></span>`;
}
const thumb = (url, cls = '') =>
  url
    ? `<img class="thumb ${cls}" src="${esc(url)}" alt="" loading="lazy">`
    : `<span class="thumb ${cls}">${ICONS.image}</span>`;
const emptyBox = (msg, icon = 'info') => `<div class="empty">${ICONS[icon] || ''}<p>${esc(msg)}</p></div>`;
const ordinal = (n) => `${n}-р`;

/* ================= Modal ================= */
function openModal(title, bodyHtml, { wide = false } = {}) {
  const host = $('#modalHost');
  host.innerHTML = `
    <div class="modal-back" id="modalBack">
      <div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal__head">
          <h3 id="modalTitle">${esc(title)}</h3>
          <button class="btn btn--icon btn--ghost btn--sm" id="modalX" aria-label="Хаах">${ICONS.x}</button>
        </div>
        <div class="modal__body">${bodyHtml}</div>
      </div>
    </div>`;
  $('#modalX').onclick = closeModal;
  $('#modalBack').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBack') closeModal(); });
  const first = $('.modal__body input, .modal__body select, .modal__body textarea', host);
  if (first) setTimeout(() => first.focus(), 30);
  return $('.modal', host);
}
function closeModal() {
  const back = $('#modalBack');
  if (!back) return;
  back.removeAttribute('id');
  if (REDUCED_MOTION) { back.remove(); return; }
  back.classList.add('is-closing');
  setTimeout(() => back.remove(), 160);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modalBack')) closeModal(); });

// bodyHtml нь аль хэдийн esc() хийгдсэн байх ёстой
function confirmModal(title, bodyHtml, { yes = 'Тийм', danger = true, onYes }) {
  const m = openModal(title, `
    <div style="color:var(--ink-2);font-size:14px;display:grid;gap:10px">${bodyHtml}</div>
    <div class="modal__actions">
      <button class="btn btn--ghost" id="cfNo">Болих</button>
      <button class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'}" id="cfYes">${esc(yes)}</button>
    </div>`);
  $('#cfNo').onclick = closeModal;
  $('#cfYes').onclick = async () => {
    const b = $('#cfYes');
    b.disabled = true;
    try { await onYes(m); closeModal(); } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  };
  return m;
}

// Товч дээр ачааллын төлөвтэй async үйлдэл
async function withBusy(btn, fn) {
  if (!btn || btn.disabled) return;
  const html = btn.innerHTML;
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

/* ================= Pager ================= */
function renderPager(el, d, onPage) {
  if (!el) return;
  const total = d.total || 0;
  const pages = d.pages || 1;
  const page = d.page || 1;
  el.innerHTML = `
    <span class="num">Нийт ${fmtNum(total)} · ${page}/${pages} хуудас</span>
    <div class="pager__btns">
      <button class="btn btn--ghost btn--sm" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>${ICONS.left}Өмнөх</button>
      <button class="btn btn--ghost btn--sm" data-pg="next" ${page >= pages ? 'disabled' : ''}>Дараах${ICONS.right}</button>
    </div>`;
  el.hidden = total === 0;
  $('[data-pg="prev"]', el).onclick = () => onPage(page - 1);
  $('[data-pg="next"]', el).onclick = () => onPage(page + 1);
}

// tr[data-href] мөр дээр дарахад шилжинэ (дотор нь линк/товч дарсан бол үл хамаарна)
function bindRowLinks(root) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, select, label')) return;
    const tr = e.target.closest('[data-href]');
    if (tr) location.hash = tr.dataset.href;
  });
}


/* ================= Хөдөлгөөн (animation) ================= */
const REDUCED_MOTION = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();

// [data-count] элементийн тоог 0-ээс эцсийн утга хүртэл өсгөнө. data-fmt: t (₮) | n | pct
function countUp(root) {
  const fmt = (v, f) => (f === 't' ? fmtT(v) : f === 'pct' ? `${(Math.round(v * 10) / 10).toLocaleString('en-US')}%` : fmtNum(Math.round(v)));
  $$('[data-count]', root).forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const f = el.dataset.fmt || 'n';
    if (REDUCED_MOTION || !target) { el.textContent = fmt(target, f); return; }
    const dur = 420;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(f === 'pct' ? target * e : Math.round(target * e), f);
      if (k < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    el.textContent = fmt(0, f);
    requestAnimationFrame(tick);
  });
}

// Өмнөх үетэй харьцуулсан өөрчлөлтийн chip
function deltaChip(cur, prev, { suffix = '' } = {}) {
  cur = Number(cur) || 0;
  prev = Number(prev) || 0;
  if (!prev && !cur) return `<span class="delta delta--flat">0%${suffix}</span>`;
  if (!prev) return `<span class="delta delta--up">${ICONS.trendUp}Шинэ${suffix}</span>`;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return `<span class="delta delta--${cls}">${pct > 0 ? ICONS.trendUp : pct < 0 ? ICONS.trendDown : ''}${pct > 0 ? '+' : ''}${pct.toLocaleString('en-US')}%${suffix}</span>`;
}

/* ---- Skeleton ---- */
const skelLine = (w = '100%', h = 12) => `<span class="skel" style="width:${w};height:${h}px"></span>`;
function skelRows(n = 6, cols = 5) {
  return `<div class="skel-table">${Array.from({ length: n }, () => `<div class="skel-row">${Array.from({ length: cols }, (_, i) => skelLine(i === 0 ? '70%' : `${40 + ((i * 17) % 45)}%`)).join('')}</div>`).join('')}</div>`;
}
function skelPage(kind = 'default') {
  const stat = `<div class="card stat">${skelLine('45%', 11)}${skelLine('60%', 24)}${skelLine('35%', 10)}</div>`;
  const stats = kind === 'form' ? '' : `<div class="stats">${stat.repeat(kind === 'dashboard' ? 6 : 3)}</div>`;
  const chart = kind === 'dashboard' ? `<div class="grid-23"><div class="card card__pad">${skelLine('30%', 14)}<span class="skel skel--block" style="height:240px;margin-top:18px"></span></div><div class="card card__pad">${skelLine('40%', 14)}<span class="skel skel--circle"></span></div></div>` : '';
  const table = `<div class="card">${kind === 'form' ? `<div class="card__pad form-grid">${[1, 2, 3, 4, 5].map(() => `${skelLine('20%', 10)}${skelLine('100%', 36)}`).join('')}</div>` : `<div class="card__pad">${skelLine('25%', 14)}</div>${skelRows(7, 6)}`}</div>`;
  return `<div class="skel-page" aria-busy="true" aria-label="Ачаалж байна">${stats}${chart}${table}</div>`;
}

/* ================= Chart ================= */
const PAL = {
  dark: '#064A2B', brand: '#0A5C37', mid: '#3F8F5F', light: '#8CC7A1', pale: '#DDFBA8', warm: '#C9822B',
  grid: '#EEF1EE', axis: '#87918A', amber: '#C9822B',
};
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const MN_MONTHS = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
const MN_WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
// 'YYYY-MM-DD' → '9-р сарын 16, Лхагва'
function mnDate(key, { weekday = true } = {}) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!d) return `${y} оны ${MN_MONTHS[m - 1]}`;
  const wd = MN_WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${MN_MONTHS[m - 1].replace(' сар', ' сарын')} ${d}${weekday ? `, ${wd}` : ''}`;
}
const shortDate = (key) => String(key).slice(5).replace('-', '.');
// Огноог 'YYYY-MM-DD' болгож, n хоног нэмнэ
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

let charts = [];
if (window.Chart) {
  Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#6B756E';
  Chart.defaults.borderColor = PAL.grid;
  Chart.defaults.plugins.legend.display = false;
  if (REDUCED_MOTION) Chart.defaults.animation = false;
  else Object.assign(Chart.defaults.animation, { duration: 650, easing: 'easeOutQuart' });
  Chart.defaults.transitions.resize = { animation: { duration: 0 } };
  Chart.defaults.elements.bar.borderRadius = 5;
  Chart.defaults.elements.line.borderCapStyle = 'round';
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hoverBorderWidth = 2;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: '#111814', padding: { x: 12, y: 10 }, cornerRadius: 8, caretSize: 5,
    titleFont: { family: "'Inter', sans-serif", weight: '600', size: 12.5 },
    bodyFont: { family: "'Inter', sans-serif", size: 12.5 }, bodySpacing: 5,
    titleMarginBottom: 7, boxWidth: 9, boxHeight: 9, boxPadding: 5, usePointStyle: true,
    displayColors: false,
  });

  // Hover үед босоо заагч шугам
  Chart.register({
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const opt = chart.options.plugins.crosshair;
      const act = chart.tooltip && chart.tooltip.getActiveElements();
      if (!opt || opt.enabled !== true || !act || !act.length) return;
      const x = act[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(17, 24, 20, .28)';
      ctx.stroke();
      ctx.restore();
    },
  });
  // Doughnut-ийн голд тоо, тайлбар
  Chart.register({
    id: 'centerText',
    afterDraw(chart) {
      const opt = chart.options.plugins.centerText;
      if (!opt || opt.value === undefined || opt.value === null) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data.length) return;
      const { x, y } = meta.data[0];
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#111814';
      ctx.font = `700 ${opt.size || 22}px Inter, sans-serif`;
      ctx.fillText(opt.value, x, y - (opt.label ? 8 : 0));
      if (opt.label) {
        ctx.fillStyle = '#87918A';
        ctx.font = '500 11.5px Inter, sans-serif';
        ctx.fillText(opt.label, x, y + 13);
      }
      ctx.restore();
    },
  });
}
function makeChart(canvas, cfg) {
  if (!window.Chart || !canvas || !canvas.isConnected) return null;
  const c = new Chart(canvas, cfg);
  charts.push(c);
  return c;
}
function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}
// Жижиг sparkline (stat карт дотор). Сийрэг өгөгдөлд нарийн багана, бусад үед monotone шугам (0-оос доош унахгүй)
function sparkline(canvas, values, color = PAL.brand) {
  const sparse = values.filter((v) => v > 0).length <= Math.max(3, values.length * 0.3);
  const ds = sparse
    ? { type: 'bar', data: values, backgroundColor: values.map((v) => (v > 0 ? color : alpha(color, 0.12))), borderRadius: 2, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.9, minBarLength: 2 }
    : { type: 'line', data: values, borderColor: color, borderWidth: 1.8, cubicInterpolationMode: 'monotone', pointRadius: 0, fill: 'origin', backgroundColor: alpha(color, 0.08) };
  return makeChart(canvas, {
    type: sparse ? 'bar' : 'line',
    data: { labels: values.map((_, i) => i), datasets: [ds] },
    options: {
      maintainAspectRatio: false, events: [],
      plugins: { tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, min: 0, suggestedMax: Math.max(1, ...values) } },
      layout: { padding: { top: 2, bottom: 0, left: 0, right: 0 } },
    },
  });
}
// Утгын ихэнх нь 0 бол (сийрэг өгөгдөл) шугам биш цэг/багана ашиглана
const isSparse = (arr) => arr.filter((v) => v > 0).length <= Math.max(3, arr.length * 0.3);
const moneyAxis = (extra = {}) => ({
  border: { display: false }, grid: { color: PAL.grid, drawTicks: false }, beginAtZero: true,
  ticks: { callback: (v) => compact(v), maxTicksLimit: 5, padding: 8, color: PAL.axis }, ...extra,
});
const countAxis = (extra = {}) => ({
  border: { display: false }, grid: { display: false, drawTicks: false }, beginAtZero: true,
  ticks: { precision: 0, maxTicksLimit: 5, padding: 8, color: PAL.axis }, ...extra,
});
const catAxis = (extra = {}) => ({
  grid: { display: false }, border: { color: PAL.grid },
  ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14, color: PAL.axis }, ...extra,
});
// Rate (0–100) → cohort heat өнгө
function heatColor(rate) {
  const k = Math.max(0, Math.min(1, rate / 100));
  const from = [243, 248, 244];
  const to = [10, 92, 55];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * k));
  return { bg: `rgb(${c.join(',')})`, fg: k > 0.5 ? '#fff' : '#111814' };
}

/* ================= Localstorage (хамгаалалттай) ================= */
function prefGet(key, dflt) {
  try { const v = localStorage.getItem(`am.admin.${key}`); return v === null ? dflt : v; } catch { return dflt; }
}
function prefSet(key, val) {
  try { localStorage.setItem(`am.admin.${key}`, val); } catch { /* private mode */ }
}

/* ================= Категори ================= */
// Хавтгай жагсаалтаас мод (depth-тэй) дараалал үүсгэнэ
function categoryOrder(flat) {
  const byParent = new Map();
  flat.forEach((c) => {
    const k = c.parent_id || 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  });
  const out = [];
  const seen = new Set();
  const walk = (pid, depth) => {
    (byParent.get(pid) || []).forEach((c) => {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    });
  };
  walk(0, 0);
  flat.forEach((c) => { if (!seen.has(c.id)) out.push({ ...c, depth: 0 }); }); // эцэггүй үлдсэн
  return out;
}
function categoryOptions(flat, selected, { excludeId = null, blank = 'Категоригүй' } = {}) {
  const exclude = new Set();
  if (excludeId) {
    // өөрийг нь болон дэд категориудыг хасна
    const add = (id) => { exclude.add(id); flat.filter((c) => c.parent_id === id).forEach((c) => add(c.id)); };
    add(excludeId);
  }
  return (blank !== null ? `<option value="">${esc(blank)}</option>` : '') +
    categoryOrder(flat)
      .filter((c) => !exclude.has(c.id))
      .map((c) => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${'    '.repeat(c.depth)}${c.depth ? '— ' : ''}${esc(c.name)}</option>`)
      .join('');
}

/* ================= Хуудас бүртгэл ================= */
// Views[name] = async (root, ctx) => {}   ctx: { parts, params, setTitle }
const Views = {};
const App = { user: null, paymentMode: null };
