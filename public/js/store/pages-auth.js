// Нэвтрэх / бүртгүүлэх (нууц үг эсвэл OTP)
import { state, api, esc, setTitle, navigate, onLeave, refreshCartCount, safeNext, emitState, isStale } from './core.js';
import { icons } from './components.js';

function afterLogin(user, next) {
  state.user = user;
  emitState();
  // Гишүүнчлэлийн төлөв ба сагсыг шинэчилнэ
  Promise.all([
    api('/account/me')
      .then((r) => {
        state.loyalty = r.loyalty;
      })
      .catch(() => {}),
    refreshCartCount(),
  ]).finally(() => navigate(next || '/account', { replace: true }));
}

function errorBox(msg) {
  return msg ? `<div class="alert alert-error" role="alert">${icons.alert(18)}<span>${esc(msg)}</span></div>` : '';
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (label) btn.textContent = busy ? 'Түр хүлээнэ үү...' : label;
}

export async function authPage({ app, query, path, token }) {
  const mode = path.startsWith('/register') ? 'register' : 'login';
  const next = safeNext(query.next || '');
  if (state.user) {
    navigate(next || '/account', { replace: true });
    return;
  }
  setTitle(mode === 'register' ? 'Бүртгүүлэх' : 'Нэвтрэх');
  let tab = query.tab === 'otp' ? 'otp' : 'password';
  const nextQs = next ? `?next=${encodeURIComponent(next)}` : '';

  app.innerHTML = `<div class="container auth-wrap">
    <div class="auth-card">
      <h1>${mode === 'register' ? 'Бүртгүүлэх' : 'Нэвтрэх'}</h1>
      <p class="muted auth-sub">${mode === 'register' ? 'И-мэйл эсвэл утасны дугаараар шинэ бүртгэл үүсгэнэ.' : 'Захиалга өгөх, сагслахын тулд бүртгэлдээ нэвтэрнэ үү.'}</p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="password">${mode === 'register' ? 'Нууц үгээр' : 'Нууц үгээр'}</button>
        <button type="button" role="tab" data-tab="otp">Нэг удаагийн кодоор (OTP)</button>
      </div>
      <div data-panel></div>
    </div>
  </div>`;

  const panel = app.querySelector('[data-panel]');
  const tabs = app.querySelectorAll('[data-tab]');
  let otpTimer = null;
  onLeave(() => clearInterval(otpTimer));

  const showTab = (t) => {
    tab = t;
    clearInterval(otpTimer);
    tabs.forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === t);
      b.setAttribute('aria-selected', String(b.dataset.tab === t));
    });
    if (t === 'password') (mode === 'register' ? renderRegister : renderLogin)();
    else renderOtpStart();
  };
  tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- Нууц үгээр нэвтрэх ----------
  function renderLogin(err = '', ident = '') {
    panel.innerHTML = `<form class="form" novalidate>
      ${errorBox(err)}
      <label class="field"><span>И-мэйл эсвэл утасны дугаар</span>
        <input name="identifier" type="text" autocomplete="username" required value="${esc(ident)}" placeholder="99112233 эсвэл name@mail.mn"></label>
      <label class="field"><span>Нууц үг</span>
        <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Нэвтрэх</button>
      <p class="auth-switch">Бүртгэлгүй юу? <a href="/register${esc(nextQs)}">Бүртгүүлэх</a></p>
    </form>`;
    const f = panel.querySelector('form');
    f.identifier.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = f.identifier.value.trim();
      const password = f.password.value;
      if (!identifier || !password) return renderLogin('Нэвтрэх нэр болон нууц үгээ оруулна уу', identifier);
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Нэвтрэх');
      try {
        const r = await api('/account/login', { method: 'POST', body: { identifier, password } });
        if (isStale(token)) return;
        afterLogin(r.user, next);
      } catch (ex) {
        if (isStale(token)) return;
        renderLogin(ex.message, identifier);
      }
    });
  }

  // ---------- Бүртгүүлэх ----------
  function renderRegister(err = '', vals = {}) {
    panel.innerHTML = `<form class="form" novalidate>
      ${errorBox(err)}
      <label class="field"><span>Нэр</span>
        <input name="name" type="text" autocomplete="name" maxlength="80" value="${esc(vals.name || '')}"></label>
      <label class="field"><span>И-мэйл эсвэл утасны дугаар</span>
        <input name="identifier" type="text" autocomplete="username" required value="${esc(vals.identifier || '')}" placeholder="99112233 эсвэл name@mail.mn"></label>
      <label class="field"><span>Нууц үг</span>
        <input name="password" type="password" autocomplete="new-password" minlength="8" required><small class="hint">Хамгийн багадаа 8 тэмдэгт</small></label>
      <label class="field"><span>Нууц үг давтах</span>
        <input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Бүртгүүлэх</button>
      <p class="auth-switch">Бүртгэлтэй юу? <a href="/login${esc(nextQs)}">Нэвтрэх</a></p>
    </form>`;
    const f = panel.querySelector('form');
    (vals.name ? f.identifier : f.name).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = { name: f.name.value.trim(), identifier: f.identifier.value.trim() };
      const password = f.password.value;
      if (!v.identifier) return renderRegister('И-мэйл хаяг эсвэл утасны дугаараа оруулна уу', v);
      if (password.length < 8) return renderRegister('Нууц үг хамгийн багадаа 8 тэмдэгт байна', v);
      if (password !== f.confirm.value) return renderRegister('Нууц үг таарахгүй байна', v);
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Бүртгүүлэх');
      try {
        const r = await api('/account/register', { method: 'POST', body: { ...v, password } });
        if (isStale(token)) return;
        afterLogin(r.user, next);
      } catch (ex) {
        if (isStale(token)) return;
        renderRegister(ex.message, v);
      }
    });
  }

  // ---------- OTP ----------
  function renderOtpStart(err = '', ident = '') {
    panel.innerHTML = `<form class="form" novalidate>
      ${errorBox(err)}
      <p class="muted form-note">Утасны дугаар эсвэл и-мэйл хаяг руу 6 оронтой код илгээнэ. Бүртгэлгүй бол автоматаар бүртгэнэ.</p>
      <label class="field"><span>И-мэйл эсвэл утасны дугаар</span>
        <input name="identifier" type="text" autocomplete="username" required value="${esc(ident)}" placeholder="99112233 эсвэл name@mail.mn"></label>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Код авах</button>
      <p class="auth-switch">${mode === 'register' ? 'Бүртгэлтэй юу? <a href="/login' + esc(nextQs) + '">Нэвтрэх</a>' : 'Бүртгэлгүй юу? <a href="/register' + esc(nextQs) + '">Бүртгүүлэх</a>'}</p>
    </form>`;
    const f = panel.querySelector('form');
    f.identifier.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = f.identifier.value.trim();
      if (!identifier) return renderOtpStart('И-мэйл хаяг эсвэл утасны дугаараа оруулна уу');
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Код авах');
      try {
        const r = await api('/account/otp/request', { method: 'POST', body: { identifier } });
        if (isStale(token)) return;
        renderOtpVerify(identifier, r);
      } catch (ex) {
        if (isStale(token)) return;
        renderOtpStart(ex.message, identifier);
      }
    });
  }

  function renderOtpVerify(identifier, info, err = '', vals = {}) {
    clearInterval(otpTimer);
    const where = info.channel === 'email' ? 'и-мэйл хаяг' : 'утасны дугаар';
    panel.innerHTML = `<form class="form" novalidate>
      ${errorBox(err)}
      <p class="form-note">Таны <b>${esc(identifier)}</b> ${where} руу 6 оронтой код илгээлээ.${info.ttl_minutes ? ` Код ${esc(info.ttl_minutes)} минут хүчинтэй.` : ''}</p>
      ${info.dev_code ? `<p class="dev-code">Туршилтын код: ${esc(info.dev_code)}</p>` : ''}
      <label class="field"><span>Баталгаажуулах код</span>
        <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="otp-input" value="${esc(vals.code || '')}" required></label>
      ${info.is_new ? `<label class="field"><span>Таны нэр</span><input name="name" type="text" autocomplete="name" maxlength="80" value="${esc(vals.name || '')}"><small class="hint">Шинэ бүртгэл үүснэ</small></label>` : ''}
      <button type="submit" class="btn btn-primary btn-block btn-lg">Баталгаажуулах</button>
      <div class="otp-actions">
        <button type="button" class="link-btn" data-resend disabled></button>
        <button type="button" class="link-btn" data-change>Өөр хаяг ашиглах</button>
      </div>
    </form>`;
    const f = panel.querySelector('form');
    f.code.focus();
    f.code.addEventListener('input', () => {
      f.code.value = f.code.value.replace(/\D/g, '').slice(0, 6);
    });

    const resend = panel.querySelector('[data-resend]');
    let left = Number(info.resend_seconds) || 60;
    const tick = () => {
      if (left > 0) {
        resend.disabled = true;
        resend.textContent = `Дахин илгээх (${left})`;
        left -= 1;
      } else {
        clearInterval(otpTimer);
        resend.disabled = false;
        resend.textContent = 'Код дахин илгээх';
      }
    };
    tick();
    otpTimer = setInterval(tick, 1000);

    resend.addEventListener('click', async () => {
      resend.disabled = true;
      try {
        const r = await api('/account/otp/request', { method: 'POST', body: { identifier } });
        if (isStale(token)) return;
        renderOtpVerify(identifier, r, '', { name: f.name ? f.name.value : '' });
      } catch (ex) {
        if (isStale(token)) return;
        renderOtpVerify(identifier, { ...info, resend_seconds: 0 }, ex.message);
      }
    });
    panel.querySelector('[data-change]').addEventListener('click', () => renderOtpStart('', identifier));

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = f.code.value.trim();
      const name = f.name ? f.name.value.trim() : undefined;
      const remaining = left;
      if (!/^\d{6}$/.test(code)) return renderOtpVerify(identifier, { ...info, resend_seconds: remaining }, '6 оронтой кодоо оруулна уу', { code, name });
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Баталгаажуулах');
      try {
        const r = await api('/account/otp/verify', { method: 'POST', body: { identifier, code, name } });
        if (isStale(token)) return;
        clearInterval(otpTimer);
        afterLogin(r.user, next);
      } catch (ex) {
        if (isStale(token)) return;
        renderOtpVerify(identifier, { ...info, resend_seconds: left }, ex.message, { name });
      }
    });
  }

  showTab(tab);
}
