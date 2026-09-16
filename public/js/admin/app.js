// Ачаалал, нэвтрэлт, hash router.
'use strict';

const TITLES = {
  dashboard: 'Хяналтын самбар',
  orders: 'Захиалга',
  products: 'Бараа',
  categories: 'Категори',
  inventory: 'Агуулах',
  import: 'Бөөнөөр импортлох',
  customers: 'Хэрэглэгчид',
  analytics: 'Дата анализ',
  settings: 'Тохиргоо',
};

let routeSeq = 0;
let appStarted = false;

$$('[data-ic]').forEach((el) => { el.outerHTML = ICONS[el.dataset.ic] || ''; });

async function boot() {
  onAuthLost = () => { if (appStarted) showLogin(); };
  try {
    const me = await api('/api/admin/me');
    App.user = me.username;
    App.paymentMode = me.payment_mode;
    enterApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  appStarted = false;
  closeModal();
  destroyCharts();
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  document.title = 'Нэвтрэх — Aktar Marka';
  setTimeout(() => $('#loginUser').focus(), 30);
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const err = $('#loginError');
    err.hidden = true;
    const username = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    if (!username || !password) {
      err.textContent = 'Нэвтрэх нэр, нууц үгээ оруулна уу';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Нэвтэрч байна…';
    try {
      await api('/api/admin/login', { method: 'POST', body: { username, password } });
      const me = await api('/api/admin/me');
      App.user = me.username;
      App.paymentMode = me.payment_mode;
      $('#loginPass').value = '';
      enterApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Нэвтрэх';
    }
  };
}

function enterApp() {
  appStarted = true;
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  $('#userName').textContent = App.user;
  $('#userAvatar').textContent = (App.user || 'A')[0];

  const d = new Date();
  const wd = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'][d.getDay()];
  $('#topDate').textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}, ${wd} гараг`;

  $('#logoutBtn').onclick = async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    location.hash = '';
    showLogin();
  };
  const closeSide = () => { $('#sidebar').classList.remove('open'); $('#sidebarBack').classList.remove('open'); };
  $('#burger').onclick = () => { $('#sidebar').classList.add('open'); $('#sidebarBack').classList.add('open'); };
  $('#sidebarBack').onclick = closeSide;
  $$('#sideNav a').forEach((a) => a.addEventListener('click', closeSide));

  window.onhashchange = route;
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/dashboard';
  else route();
  refreshBadges();
}

// Sidebar дээрх тоолуур: бэлтгэх захиалга, нөөц дуусаж буй бараа
const refreshBadges = debounce(async () => {
  try {
    const d = await api('/api/admin/dashboard');
    setBadges(d);
  } catch { /* чимээгүй */ }
}, 400);
function setBadges(d) {
  const o = $('#navOrdersBadge');
  const s = $('#navStockBadge');
  o.textContent = d.counts.to_process || '';
  o.hidden = !d.counts.to_process;
  o.title = 'Бэлтгэх захиалга';
  s.textContent = d.low_stock_count || '';
  s.hidden = !d.low_stock_count;
  s.title = 'Нөөц дуусаж буй';
}

async function route() {
  if (!appStarted) return;
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [pathPart, queryPart] = hash.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const name = Views[parts[0]] ? parts[0] : 'dashboard';
  const params = new URLSearchParams(queryPart || '');
  const seq = ++routeSeq;

  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const setTitle = (t) => {
    if (seq !== routeSeq) return;
    $('#pageTitle').textContent = t;
    document.title = `${t} — Aktar Marka`;
  };
  setTitle(TITLES[name]);
  closeModal();
  destroyCharts();

  const view = $('#view');
  const root = document.createElement('div');
  root.className = 'view-root';
  view.replaceChildren(root);
  const skelKind = name === 'dashboard' ? 'dashboard' : (parts[1] && ['products', 'orders', 'customers'].includes(name)) || ['settings', 'import'].includes(name) ? 'form' : 'default';
  root.innerHTML = skelPage(skelKind);
  window.scrollTo(0, 0);
  try {
    await Views[name](root, { parts, params, setTitle, alive: () => seq === routeSeq });
    if (seq === routeSeq) countUp(root);
  } catch (e) {
    if (seq !== routeSeq) return;
    if (e.status === 401) return;
    root.innerHTML = `<div class="card">${emptyBox(e.message, 'alert')}</div>`;
  }
}

boot();
