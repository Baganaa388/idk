// Aktar Marka дэлгүүр — үндсэн туслахууд: API, escape, мөнгө, router, toast, нэвтрэлтийн төлөв
import { skeleton, closeDrawer } from './components.js';

export const state = {
  site: null,
  user: null,
  loyalty: null,
  cartCount: 0,
  listeners: new Set(),
};

export function onStateChange(fn) {
  state.listeners.add(fn);
}
export function emitState() {
  for (const fn of state.listeners) fn(state);
}

// ---------- Escape / формат ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v) {
  return v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function money(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? '-' : ''}${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}₮`;
}

// Сервер 'YYYY-MM-DD HH:MM:SS' Улаанбаатарын цагаар буцаана
export function parseDate(s) {
  if (!s) return null;
  const d = new Date(`${String(s).replace(' ', 'T')}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function fmtDate(s, withTime = true) {
  if (!s) return '';
  const str = String(s);
  return withTime ? str.slice(0, 16) : str.slice(0, 10);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---------- API ----------
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
    this.code = this.data.code;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Сүлжээний алдаа. Интернэт холболтоо шалгана уу.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && data && data.code === 'AUTH_REQUIRED' && state.user) {
      state.user = null;
      state.cartCount = 0;
      emitState();
    }
    throw new ApiError((data && data.error) || 'Алдаа гарлаа. Дахин оролдоно уу.', res.status, data);
  }
  return data;
}

export function isAuthError(e) {
  return e instanceof ApiError && e.status === 401;
}

// ---------- Нэвтрэлт ----------
export async function loadUser() {
  try {
    const r = await api('/account/me');
    state.user = r.user;
    state.loyalty = r.loyalty;
  } catch {
    state.user = null;
    state.loyalty = null;
  }
  await refreshCartCount();
}

export async function refreshCartCount() {
  if (!state.user) {
    state.cartCount = 0;
    emitState();
    return;
  }
  try {
    const c = await api('/cart');
    state.cartCount = c.count;
  } catch {
    state.cartCount = 0;
  }
  emitState();
}

export function setCart(cart) {
  if (cart && typeof cart.count === 'number') {
    state.cartCount = cart.count;
    emitState();
  }
}

export function loginUrl(next) {
  const n = next || location.pathname + location.search;
  return `/login?next=${encodeURIComponent(n)}`;
}

export function safeNext(n) {
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/register')
    ? n
    : '';
}

// Нэвтрээгүй бол нэвтрэх хуудас руу шилжүүлнэ; true буцаавал үргэлжлүүлнэ
export function requireLogin() {
  if (state.user) return true;
  navigate(loginUrl(), { replace: true });
  return false;
}

// Сагсанд нэмэх — нэвтрээгүй бол нэвтрэх хуудас руу
export async function addToCart(productId, qty = 1, { silent = false } = {}) {
  if (!state.user) {
    navigate(loginUrl());
    return null;
  }
  try {
    const cart = await api('/cart/items', { method: 'POST', body: { product_id: productId, qty } });
    setCart(cart);
    if (!silent) toast('Сагсанд нэмэгдлээ', 'success', { href: '/cart', label: 'Сагс харах' });
    return cart;
  } catch (e) {
    if (isAuthError(e)) {
      navigate(loginUrl());
      return null;
    }
    toast(e.message, 'error');
    return null;
  }
}

// Сагсанд нэмэх товчны төлөв: ачаалж байна → нэмэгдлээ
export async function buttonAdd(btn, productId, qty = 1, { silent = false, feedback = true } = {}) {
  if (!state.user) {
    navigate(loginUrl());
    return null;
  }
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('is-loading');
  const cart = await addToCart(productId, qty, { silent });
  btn.classList.remove('is-loading');
  if (cart && feedback && btn.isConnected) {
    btn.classList.add('is-added');
    btn.innerHTML = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="tick" d="m5 12 5 5 9-10"/></svg><span>Нэмэгдлээ</span>';
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove('is-added');
      btn.innerHTML = original;
      btn.disabled = false;
    }, 1400);
  } else {
    btn.disabled = false;
  }
  return cart;
}

// ---------- Toast ----------
export function toast(message, type = 'info', action) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<a href="${esc(action.href)}" class="toast-link">${esc(action.label)}</a>` : ''}`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, type === 'error' ? 5000 : 3200);
}

// ---------- Router ----------
const routes = [];
let cleanups = [];
let navToken = 0;
let notFoundHandler = null;

export function route(pattern, handler) {
  // '/p/:slug' → RegExp
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/\//g, '\\/').replace(/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    })}\\/?$`
  );
  routes.push({ re, keys, handler });
}
export function setNotFound(handler) {
  notFoundHandler = handler;
}

// Хуудаснаас гарахад ажиллах цэвэрлэгээ (interval, timeout, listener)
export function onLeave(fn) {
  cleanups.push(fn);
}

export function currentToken() {
  return navToken;
}
export function isStale(token) {
  return token !== navToken;
}

export function setTitle(t) {
  const name = (state.site && state.site.business && state.site.business.name) || 'Aktar Marka';
  document.title = t ? `${t} — ${name}` : `${name} — ${(state.site && state.site.business.tagline) || 'Онлайн дэлгүүр'}`;
}

export function navigate(url, { replace = false, scroll = true } = {}) {
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  render({ scroll });
}

export function queryParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

export async function render({ scroll = true } = {}) {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  cleanups = [];
  const token = ++navToken;
  const path = decodeURI(location.pathname);
  const app = document.getElementById('app');
  closeDrawer();
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#header, #catnav')) document.activeElement.blur();
  if (scroll) window.scrollTo(0, 0);
  app.classList.remove('route-in');
  void app.offsetWidth;
  app.classList.add('route-in');
  emitState();

  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => {
      params[k] = m[i + 1];
    });
    try {
      await r.handler({ app, params, query: queryParams(), path, token });
    } catch (e) {
      if (isStale(token)) return;
      if (isAuthError(e)) {
        navigate(loginUrl(), { replace: true });
        return;
      }
      if (e instanceof ApiError && e.status === 404 && notFoundHandler) {
        notFoundHandler({ app, message: e.message });
        return;
      }
      console.error(e);
      app.innerHTML = `<div class="container"><div class="empty"><h2>Алдаа гарлаа</h2><p>${esc(e.message || 'Дахин оролдоно уу.')}</p><a href="${esc(location.pathname + location.search)}" class="btn btn-primary">Дахин ачаалах</a></div></div>`;
    }
    return;
  }
  if (notFoundHandler) notFoundHandler({ app });
}

export function loading(app, kind = 'default') {
  app.innerHTML = skeleton(kind);
}

// ---------- Хөдөлгөөн ----------
export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Гүйлгэхэд гарч ирэх (.reveal) элементүүд
let revealIO = null;
function setupReveal() {
  const app = document.body;
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    document.documentElement.classList.add('no-reveal');
    return;
  }
  document.documentElement.classList.add('js-reveal');
  revealIO = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          revealIO.unobserve(en.target);
        }
      }
    },
    { rootMargin: '0px 0px -40px 0px', threshold: 0.08 }
  );
  const scan = () => document.querySelectorAll('.reveal:not([data-rv])').forEach((el) => {
    el.setAttribute('data-rv', '');
    revealIO.observe(el);
  });
  new MutationObserver(scan).observe(app, { childList: true, subtree: true });
  scan();
}

// Тоо өсөх хөдөлгөөн: <span data-count="20" data-suffix="%">
export function countUp(root, duration = 700) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    if (reducedMotion() || !('IntersectionObserver' in window) || target === 0) {
      el.textContent = target + suffix;
      return;
    }
    el.textContent = '0' + suffix;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(el);
  });
}

export function startRouter() {
  setupReveal();
  window.addEventListener('popstate', () => render({ scroll: false }));
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.dataset.external !== undefined) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    if (/^\/(api|admin|uploads|img|css|js|vendor)(\/|$)/.test(href)) return;
    e.preventDefault();
    const cur = location.pathname + location.search;
    navigate(href, { replace: href === cur });
  });
  render();
}
