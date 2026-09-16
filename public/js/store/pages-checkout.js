// Сагс, захиалга баталгаажуулах, QPay төлбөр, mock төлбөр
import { state, api, esc, money, setTitle, navigate, onLeave, isStale, requireLogin, setCart, loading, parseDate, emitState, toast, ApiError } from './core.js';
import { icons, breadcrumbs, emptyState, qtyStepper, paymentLogos, payLogoFor, logoTile, WALLET_RE, drawCheck } from './components.js';

// ======================= Сагс =======================
function summaryRows(c, { showHints = true } = {}) {
  const afterDiscount = c.subtotal - c.discount_amount;
  const l = c.loyalty;
  const freeLeft = c.free_shipping_over > 0 && c.shipping_fee > 0 ? c.free_shipping_over - afterDiscount : 0;
  return `<dl class="summary-rows">
      <div><dt>Дүн (${esc(c.count)} бараа)</dt><dd>${money(c.subtotal)}</dd></div>
      ${
        l && l.enabled
          ? `<div class="${c.discount_amount > 0 ? 'row-discount' : ''}"><dt>Гишүүнчлэлийн хямдрал<small>${esc(l.next_order_seq)}-р захиалга, ${esc(c.discount_pct)}%</small></dt><dd>${c.discount_amount > 0 ? `-${money(c.discount_amount)}` : money(0)}</dd></div>`
          : ''
      }
      <div><dt>Хүргэлт</dt><dd>${c.shipping_fee > 0 ? money(c.shipping_fee) : '<span class="text-green">Үнэгүй</span>'}</dd></div>
      <div class="row-total"><dt>Нийт</dt><dd>${money(c.total)}</dd></div>
    </dl>
    ${showHints && freeLeft > 0 ? `<p class="summary-hint">${icons.truck(16)}<span>Дахиад <b>${money(freeLeft)}</b>-ийн бараа нэмбэл хүргэлт үнэгүй.</span></p>` : ''}
    ${showHints && l && l.enabled && l.tier && l.tier.next ? `<p class="summary-hint">${icons.award(16)}<span>Дараагийн шат: <b>${esc(l.tier.next.orders_left)} захиалгын дараа ${esc(l.tier.next.pct)}% хямдрал</b></span></p>` : ''}`;
}

export async function cartPage({ app, token }) {
  setTitle('Сагс');
  if (!requireLogin()) return;
  loading(app);
  let cart = await api('/cart');
  if (isStale(token)) return;
  setCart(cart);
  let busy = false;

  let drawn = false;
  const draw = () => {
    const stat = drawn ? ' static' : '';
    drawn = true;
    if (!cart.items.length) {
      app.innerHTML = `<div class="container${stat}">${breadcrumbs([{ label: 'Сагс' }])}${emptyState('Таны сагс хоосон байна', 'Бүтээгдэхүүн сонгож сагсандаа нэмнэ үү.', { href: '/products', label: 'Бараа үзэх' })}</div>`;
      return;
    }
    const hasUnavailable = cart.items.some((it) => !it.available);
    app.innerHTML = `<div class="container cart-page${stat}">
      ${breadcrumbs([{ label: 'Сагс' }])}
      <h1 class="page-title">Сагс <span class="muted">(${esc(cart.count)})</span></h1>
      <div class="two-col">
        <section class="card cart-items">
          ${cart.items
            .map(
              (it) => `<div class="cart-row ${it.available ? '' : 'is-unavailable'}" data-pid="${esc(it.product_id)}">
              <a href="/p/${esc(it.slug)}" class="cart-img">${it.image ? `<img src="${esc(it.image)}" alt="" width="88" height="88" loading="lazy">` : ''}</a>
              <div class="cart-info">
                <a href="/p/${esc(it.slug)}" class="cart-name">${esc(it.name)}</a>
                <div class="muted small">${esc(it.sku)}${it.volume ? ` · ${esc(it.volume)}` : ''}</div>
                <div class="cart-unit">${money(it.price)}${Number(it.compare_price) > Number(it.price) ? ` <s class="muted">${money(it.compare_price)}</s>` : ''}</div>
                ${!it.available ? `<div class="cart-warn">${icons.alert(14)} ${it.stock > 0 ? `Үлдэгдэл хүрэлцэхгүй — боломжит: ${esc(it.stock)} ширхэг` : 'Энэ бараа одоогоор дууссан'}</div>` : ''}
              </div>
              <div class="cart-qty">
                ${it.stock > 0 ? qtyStepper(it.qty, Math.max(it.stock, it.qty), 'data-cart-qty') : ''}
                <button type="button" class="link-btn link-danger" data-remove>${icons.trash(16)} Устгах</button>
              </div>
              <div class="cart-line">${money(it.line_total)}</div>
            </div>`
            )
            .join('')}
          <div class="cart-foot"><a href="/products" class="link-btn">${icons.chevronLeft(16)} Худалдан авалт үргэлжлүүлэх</a><button type="button" class="link-btn link-danger" data-clear>Сагс хоослох</button></div>
        </section>
        <aside class="card summary">
          <h2>Захиалгын дүн</h2>
          ${summaryRows(cart)}
          ${hasUnavailable ? `<div class="alert alert-error">${icons.alert(16)}<span>Үлдэгдэл хүрэлцэхгүй барааны тоог өөрчлөх эсвэл устгана уу.</span></div>` : ''}
          <a href="/checkout" class="btn btn-primary btn-block btn-lg ${hasUnavailable ? 'is-disabled' : ''}" ${hasUnavailable ? 'aria-disabled="true" data-block' : ''}>Захиалах</a>
          <p class="summary-pay muted small">${icons.lock(14)} QPay, банкны аппууд, Storepay, Pocket Zero-оор төлнө</p>
          ${paymentLogos({ limit: 6, cls: 'paylogos-sm paylogos-center' })}
        </aside>
      </div>
    </div>`;
  };

  const mutate = async (fn) => {
    if (busy) return;
    busy = true;
    app.querySelector('.cart-page')?.classList.add('is-busy');
    try {
      cart = await fn();
      if (isStale(token)) return;
      setCart(cart);
    } catch (e) {
      if (isStale(token)) return;
      toast(e.message, 'error');
      try {
        cart = await api('/cart');
        setCart(cart);
      } catch {
        /* ignore */
      }
    } finally {
      busy = false;
    }
    if (!isStale(token)) draw();
  };

  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  onLeave(() => {
    app.removeEventListener('click', onClick);
    app.removeEventListener('change', onChange);
  });

  function onClick(e) {
    if (e.target.closest('[data-block]')) {
      e.preventDefault();
      return;
    }
    const row = e.target.closest('[data-pid]');
    const qtyBtn = e.target.closest('[data-qty]');
    if (row && qtyBtn) {
      const cur = cart.items.find((i) => String(i.product_id) === row.dataset.pid);
      const qty = Math.max(1, cur.qty + Number(qtyBtn.dataset.qty));
      mutate(() => api(`/cart/items/${row.dataset.pid}`, { method: 'PATCH', body: { qty } }));
    } else if (row && e.target.closest('[data-remove]')) {
      mutate(() => api(`/cart/items/${row.dataset.pid}`, { method: 'DELETE' }));
    } else if (e.target.closest('[data-clear]')) {
      if (confirm('Сагсан дахь бүх барааг устгах уу?')) mutate(() => api('/cart', { method: 'DELETE' }));
    }
  }
  function onChange(e) {
    const input = e.target.closest('.qty-input');
    const row = e.target.closest('[data-pid]');
    if (!input || !row) return;
    const qty = Math.max(1, parseInt(input.value, 10) || 1);
    mutate(() => api(`/cart/items/${row.dataset.pid}`, { method: 'PATCH', body: { qty } }));
  }

  draw();
}

// ======================= Checkout =======================
export async function checkoutPage({ app, token }) {
  setTitle('Захиалга баталгаажуулах');
  if (!requireLogin()) return;
  loading(app);
  const [cart, me] = await Promise.all([api('/cart'), api('/account/me')]);
  if (isStale(token)) return;
  setCart(cart);
  if (!cart.items.length) {
    navigate('/cart', { replace: true });
    return;
  }
  const u = me.user;
  const vals = { name: u.name || '', phone: u.phone || '', address: u.address || '', note: '' };

  let drawn = false;
  const draw = (err = '', fieldErrs = {}) => {
    const stat = drawn ? ' static' : '';
    drawn = true;
    const unavailable = cart.items.filter((i) => !i.available);
    app.innerHTML = `<div class="container checkout-page${stat}">
      ${breadcrumbs([{ label: 'Сагс', href: '/cart' }, { label: 'Захиалга' }])}
      <ol class="steps-bar"><li class="done">Сагс</li><li class="is-active">Хүргэлтийн мэдээлэл</li><li>Төлбөр</li></ol>
      <div class="two-col">
        <form class="card form checkout-form" novalidate>
          <h2>Хүргэлтийн мэдээлэл</h2>
          ${err ? `<div class="alert alert-error" role="alert">${icons.alert(18)}<span>${esc(err)}${unavailable.length || /үлдэгдэл/i.test(err) ? ' <a href="/cart">Сагс руу буцах</a>' : ''}</span></div>` : ''}
          <div class="form-grid">
            <label class="field ${fieldErrs.name ? 'has-error' : ''}"><span>Нэр *</span>
              <input name="name" type="text" autocomplete="name" maxlength="80" value="${esc(vals.name)}" required>
              ${fieldErrs.name ? `<small class="field-error">${esc(fieldErrs.name)}</small>` : ''}</label>
            <label class="field ${fieldErrs.phone ? 'has-error' : ''}"><span>Утас *</span>
              <input name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="8" placeholder="99112233" value="${esc(vals.phone)}" required>
              ${fieldErrs.phone ? `<small class="field-error">${esc(fieldErrs.phone)}</small>` : ''}</label>
          </div>
          <label class="field ${fieldErrs.address ? 'has-error' : ''}"><span>Хүргэлтийн хаяг *</span>
            <textarea name="address" rows="3" maxlength="400" placeholder="Дүүрэг, хороо, байр, орц, давхар, тоот" required>${esc(vals.address)}</textarea>
            ${fieldErrs.address ? `<small class="field-error">${esc(fieldErrs.address)}</small>` : ''}</label>
          <label class="field"><span>Нэмэлт тэмдэглэл</span>
            <textarea name="note" rows="2" maxlength="500" placeholder="Жишээ: орцны код, хүргэлтийн цаг">${esc(vals.note)}</textarea></label>
          ${state.site.delivery && state.site.delivery.note ? `<p class="muted small">${icons.truck(14)} ${esc(state.site.delivery.note)}</p>` : ''}
          <div class="pay-method">
            <div class="pay-method-head">
              <span class="pay-method-radio" aria-hidden="true"></span>
              <img src="/img/pay/qpay.png" alt="QPay" height="28">
              <div><b>QPay-ээр төлөх</b><small>QR уншуулах эсвэл банкны апп, Storepay, Pocket Zero-оор шууд төлнө</small></div>
            </div>
            ${paymentLogos({ cls: 'paylogos-sm' })}
          </div>
          <button type="submit" class="btn btn-primary btn-lg btn-block">QPay-ээр төлөх</button>
        </form>
        <aside class="card summary">
          <h2>Таны захиалга</h2>
          <ul class="mini-items">
            ${cart.items
              .map(
                (it) => `<li class="${it.available ? '' : 'is-unavailable'}">
                <span class="mini-img">${it.image ? `<img src="${esc(it.image)}" alt="" width="56" height="56">` : ''}<span class="mini-qty">${esc(it.qty)}</span></span>
                <span class="mini-name">${esc(it.name)}<small class="muted">${money(it.price)} × ${esc(it.qty)}</small></span>
                <b>${money(it.line_total)}</b>
              </li>`
              )
              .join('')}
          </ul>
          ${summaryRows(cart, { showHints: false })}
          <p class="summary-pay muted small">${icons.lock(14)} Захиалга үүссэний дараа QPay QR код болон банкны аппын холбоос гарна.</p>
        </aside>
      </div>
    </div>`;

    const f = app.querySelector('form');
    f.phone.addEventListener('input', () => {
      f.phone.value = f.phone.value.replace(/\D/g, '').slice(0, 8);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      vals.name = f.name.value.trim();
      vals.phone = f.phone.value.replace(/\D/g, '');
      vals.address = f.address.value.trim();
      vals.note = f.note.value.trim();
      const errs = {};
      if (!vals.name) errs.name = 'Нэрээ оруулна уу';
      if (!/^\d{8}$/.test(vals.phone)) errs.phone = 'Утасны дугаар 8 оронтой байх ёстой';
      if (vals.address.length < 5) errs.address = 'Хүргэлтийн хаягаа дэлгэрэнгүй оруулна уу';
      if (Object.keys(errs).length) return draw('', errs);
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Захиалга үүсгэж байна...';
      try {
        const r = await api('/orders', { method: 'POST', body: vals });
        if (isStale(token)) return;
        state.cartCount = 0;
        emitState();
        navigate(`/orders/${encodeURIComponent(r.order.order_no)}/pay`, { replace: true });
      } catch (ex) {
        if (isStale(token)) return;
        if (ex instanceof ApiError && ex.status === 409) {
          try {
            const c = await api('/cart');
            Object.assign(cart, c);
            setCart(c);
          } catch {
            /* ignore */
          }
        }
        draw(ex.message);
      }
    });
  };
  draw();
}

// ======================= Төлбөр =======================

function localPath(url) {
  try {
    const u = new URL(url, location.origin);
    return u.origin === location.origin ? u.pathname + u.search : url;
  } catch {
    return url;
  }
}

function deeplinkBtn(d, i) {
  const label = d.description || d.name;
  return `<a href="${esc(d.link)}" class="applink" target="_self" data-external rel="noopener" style="--d:${Math.min(i, 16) * 25}ms">
    ${logoTile(payLogoFor(d), label)}
    <span class="applink-name">${esc(label)}</span>
  </a>`;
}
const isWallet = (d) => WALLET_RE.test(`${d.name || ''} ${d.description || ''}`);

export async function payPage({ app, params, token }) {
  const orderNo = decodeURIComponent(params.orderNo);
  setTitle(`Төлбөр — ${orderNo}`);
  if (!requireLogin()) return;
  loading(app);

  let { order } = await api(`/orders/${encodeURIComponent(orderNo)}`);
  if (isStale(token)) return;
  let payment = order.payment;
  let pollTimer = null;
  let countdownTimer = null;
  const stopTimers = () => {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
  };
  onLeave(stopTimers);

  const expired = (p) => !p || p.status !== 'pending' || (parseDate(p.expires_at) && parseDate(p.expires_at).getTime() <= Date.now());
  const head = (title) => `${breadcrumbs([{ label: 'Миний захиалга', href: '/account' }, { label: order.order_no, href: `/account/orders/${encodeURIComponent(order.order_no)}` }, { label: title }])}`;

  const drawPaid = async () => {
    stopTimers();
    setTitle('Төлбөр төлөгдлөө');
    // Гишүүнчлэлийн шат өөрчлөгдсөн байж болно
    api('/account/me')
      .then((r) => {
        state.loyalty = r.loyalty;
      })
      .catch(() => {});
    app.innerHTML = `<div class="container pay-page">
      ${head('Төлбөр')}
      <div class="card result-card">
        <div class="result-icon result-ok">${drawCheck(44)}</div>
        <h1>Төлбөр амжилттай төлөгдлөө</h1>
        <p class="muted">Захиалгын дугаар <b>${esc(order.order_no)}</b> · Нийт ${money(order.total)}</p>
        <p>Таны захиалгыг бэлтгэж эхэлнэ. Захиалгын явцыг "Миний захиалга" хэсгээс харна уу.</p>
        <div class="empty-actions">
          <a href="/account/orders/${esc(encodeURIComponent(order.order_no))}" class="btn btn-primary">Захиалга харах</a>
          <a href="/products" class="btn btn-outline">Худалдан авалт үргэлжлүүлэх</a>
        </div>
      </div>
    </div>`;
  };

  const drawCancelled = (msg) => {
    stopTimers();
    app.innerHTML = `<div class="container pay-page">
      ${head('Төлбөр')}
      <div class="card result-card">
        <div class="result-icon result-bad">${icons.close(40)}</div>
        <h1>${esc(msg || 'Захиалга цуцлагдсан')}</h1>
        <p class="muted">Захиалгын дугаар <b>${esc(order.order_no)}</b>${order.cancel_reason ? ` · ${esc(order.cancel_reason)}` : ''}</p>
        <p>Төлбөрийн хугацаа дууссан эсвэл захиалга цуцлагдсан тул барааг дахин сагслаж захиална уу.</p>
        <div class="empty-actions">
          <a href="/products" class="btn btn-primary">Дахин захиалах</a>
          <a href="/account" class="btn btn-outline">Миний захиалга</a>
        </div>
      </div>
    </div>`;
  };

  const drawError = (msg) => {
    stopTimers();
    app.innerHTML = `<div class="container pay-page">
      ${head('Төлбөр')}
      <div class="card result-card">
        <div class="result-icon result-bad">${icons.alert(40)}</div>
        <h1>Төлбөрийн нэхэмжлэх үүсгэж чадсангүй</h1>
        <p class="muted">${esc(msg)}</p>
        <div class="empty-actions"><button type="button" class="btn btn-primary" data-retry>Дахин оролдох</button><a href="/account" class="btn btn-outline">Миний захиалга</a></div>
      </div>
    </div>`;
    app.querySelector('[data-retry]').addEventListener('click', () => ensure());
  };

  // Төлбөр хүлээгдэхгүй төлөвт шилжсэн бол тохирох харагдацыг зурж true буцаана
  const route = () => {
    if (order.payment_status === 'paid' || (order.status !== 'pending' && order.status !== 'cancelled')) {
      drawPaid();
      return true;
    }
    if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
      drawCancelled();
      return true;
    }
    return false;
  };

  const ensure = async () => {
    loading(app);
    try {
      const r = await api(`/orders/${encodeURIComponent(orderNo)}/pay`, { method: 'POST' });
      if (isStale(token)) return;
      order = r.order;
      payment = r.payment;
    } catch (e) {
      if (isStale(token)) return;
      try {
        order = (await api(`/orders/${encodeURIComponent(orderNo)}`)).order;
      } catch {
        /* ignore */
      }
      if (isStale(token)) return;
      if (route()) return;
      return drawError(e.message);
    }
    if (route()) return;
    if (!payment) return drawError('Нэхэмжлэх олдсонгүй. Дахин оролдоно уу.');
    drawPending();
  };

  const drawPending = () => {
    stopTimers();
    const links = payment.deeplinks || [];
    const banks = links.filter((d) => !isWallet(d));
    const wallets = links.filter(isWallet);
    const isMock = state.site.payment_mode === 'mock' || payment.mode === 'mock';
    app.innerHTML = `<div class="container pay-page">
      ${head('Төлбөр')}
      <ol class="steps-bar"><li class="done">Сагс</li><li class="done">Хүргэлтийн мэдээлэл</li><li class="is-active">Төлбөр</li></ol>
      ${isMock ? `<div class="alert alert-info">${icons.alert(18)}<span><b>Туршилтын горим.</b> Бодит төлбөр хийгдэхгүй. ${payment.short_url ? `<a href="${esc(localPath(payment.short_url))}">Туршилтын төлбөрийн хуудас</a>` : ''}</span></div>` : ''}
      <div class="pay-grid">
        <section class="card pay-qr">
          <div class="pay-head">
            <div><div class="muted small">Захиалгын дугаар</div><div class="pay-no">${esc(order.order_no)}</div></div>
            <div class="pay-amount-wrap"><div class="muted small">Төлөх дүн</div><div class="pay-amount">${money(payment.amount || order.total)}</div></div>
          </div>
          <div class="qr-box">
            ${payment.qr_image ? `<img src="${esc(payment.qr_image)}" alt="QPay QR код" width="260" height="260">` : '<div class="muted">QR код байхгүй</div>'}
          </div>
          <p class="qr-note desktop-only">Утсаараа QR уншуулна уу</p>
          <p class="qr-note mobile-only">Доорх банк, аппын аль нэгийг сонгож төлнө үү</p>
          <div class="pay-status"><span class="pulse-dot" aria-hidden="true"></span><span>Төлбөр хүлээж байна</span><span class="countdown" data-countdown></span></div>
          <button type="button" class="link-btn link-danger" data-cancel>Захиалга цуцлах</button>
        </section>
        <section class="card pay-apps">
          <div class="pay-apps-head"><h2>Банкны апп</h2><img src="/img/pay/qpay.png" alt="QPay" height="26" class="qpay-mark"></div>
          ${banks.length ? `<div class="applinks">${banks.map(deeplinkBtn).join('')}</div>` : '<p class="muted small">Холбоос байхгүй</p>'}
          ${wallets.length ? `<h2 class="pay-apps-sub">Зээл, хэтэвч апп</h2><div class="applinks">${wallets.map((d, i) => deeplinkBtn(d, i + banks.length)).join('')}</div>` : ''}
          <p class="muted small pay-foot">Төлбөр төлөгдмөгц энэ хуудас автоматаар шинэчлэгдэнэ.</p>
        </section>
      </div>
    </div>`;

    const cd = app.querySelector('[data-countdown]');
    const exp = parseDate(payment.expires_at);
    let expiredHandled = false;
    const tick = () => {
      if (!exp) return;
      const ms = exp.getTime() - Date.now();
      if (ms <= 0) {
        cd.textContent = '00:00';
        if (!expiredHandled) {
          expiredHandled = true;
          onExpired();
        }
        return;
      }
      const s = Math.floor(ms / 1000);
      cd.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);

    let checking = false;
    pollTimer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const r = await api(`/orders/${encodeURIComponent(orderNo)}/check`, { method: 'POST' });
        if (isStale(token)) return;
        order = r.order;
        if (!(order.payment_status === 'pending' && order.status === 'pending')) route();
      } catch {
        /* дараагийн удаа дахин оролдоно */
      } finally {
        checking = false;
      }
    }, 4000);

    app.querySelector('[data-cancel]').addEventListener('click', async (e) => {
      if (!confirm('Энэ захиалгыг цуцлах уу?')) return;
      e.target.disabled = true;
      try {
        const r = await api(`/orders/${encodeURIComponent(orderNo)}/cancel`, { method: 'POST' });
        if (isStale(token)) return;
        order = r.order;
        toast('Захиалга цуцлагдлаа', 'info');
        if (!route()) drawCancelled();
      } catch (ex) {
        if (isStale(token)) return;
        e.target.disabled = false;
        toast(ex.message, 'error');
        try {
          order = (await api(`/orders/${encodeURIComponent(orderNo)}`)).order;
          route();
        } catch {
          /* ignore */
        }
      }
    });
  };

  const onExpired = async () => {
    clearInterval(pollTimer);
    try {
      const r = await api(`/orders/${encodeURIComponent(orderNo)}/check`, { method: 'POST' });
      if (isStale(token)) return;
      order = r.order;
    } catch {
      /* ignore */
    }
    if (isStale(token) || route()) return;
    stopTimers();
    const box = app.querySelector('.pay-qr');
    if (!box) return;
    box.innerHTML = `<div class="result-card result-inline">
      <div class="result-icon result-bad">${icons.clock(36)}</div>
      <h2>QR кодын хугацаа дууссан</h2>
      <p class="muted">Шинэ QR код үүсгэж төлбөрөө үргэлжлүүлнэ үү.</p>
      <div class="empty-actions"><button type="button" class="btn btn-primary" data-renew>Шинэ QR код авах</button><a href="/products" class="btn btn-outline">Дахин захиалах</a></div>
    </div>`;
    box.querySelector('[data-renew]').addEventListener('click', () => ensure());
    app.querySelector('.pay-apps')?.classList.add('is-disabled');
  };

  if (route()) return;
  if (expired(payment)) await ensure();
  else drawPending();
}

// ======================= Mock төлбөр =======================
export async function mockPayPage({ app, params, token }) {
  const id = decodeURIComponent(params.invoiceId);
  setTitle('Туршилтын төлбөр');
  loading(app);
  let info;
  try {
    info = await api(`/payments/mock/${encodeURIComponent(id)}`);
  } catch (e) {
    if (isStale(token)) return;
    app.innerHTML = `<div class="container"><div class="card result-card mock-card">
      <div class="result-icon result-bad">${icons.alert(40)}</div>
      <h1>Нэхэмжлэх олдсонгүй</h1><p class="muted">${esc(e.message)}</p>
      <div class="empty-actions"><a href="/" class="btn btn-primary">Нүүр хуудас</a></div></div></div>`;
    return;
  }
  if (isStale(token)) return;

  const orderLink = `/orders/${encodeURIComponent(info.order_no)}/pay`;
  const drawDone = (title) => {
    app.innerHTML = `<div class="container"><div class="card result-card mock-card">
      <div class="result-icon result-ok">${drawCheck(44)}</div>
      <h1>${esc(title)}</h1>
      <p class="muted">Захиалга <b>${esc(info.order_no)}</b> · ${money(info.amount)}</p>
      <div class="empty-actions"><a href="${esc(orderLink)}" class="btn btn-primary">Захиалга руу буцах</a></div>
    </div></div>`;
  };
  if (info.mock_paid || info.status === 'paid') return drawDone('Энэ нэхэмжлэх төлөгдсөн байна');

  const draw = (err = '') => {
    const inactive = info.status !== 'pending';
    app.innerHTML = `<div class="container"><div class="card result-card mock-card">
      <span class="badge badge-warn">Туршилтын горим</span>
      <h1>QPay төлбөр (туршилт)</h1>
      <p class="muted">Энэ хуудас нь QPay мерчант холбогдоогүй үед төлбөрийн урсгалыг турших зориулалттай. Бодит мөнгө шилжихгүй.</p>
      <dl class="summary-rows mock-rows">
        <div><dt>Захиалгын дугаар</dt><dd>${esc(info.order_no)}</dd></div>
        <div><dt>Нэхэмжлэх</dt><dd class="small">${esc(info.invoice_id)}</dd></div>
        <div class="row-total"><dt>Дүн</dt><dd>${money(info.amount)}</dd></div>
      </dl>
      ${err ? `<div class="alert alert-error">${icons.alert(18)}<span>${esc(err)}</span></div>` : ''}
      ${inactive ? `<div class="alert alert-error">${icons.alert(18)}<span>Энэ нэхэмжлэх идэвхгүй байна (${esc(info.status)}).</span></div>` : ''}
      <button type="button" class="btn btn-primary btn-lg btn-block" data-mock-pay ${inactive ? 'disabled' : ''}>Төлбөр төлөх (туршилт)</button>
      <a href="${esc(orderLink)}" class="link-btn mock-back">Захиалга руу буцах</a>
    </div></div>`;
    app.querySelector('[data-mock-pay]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Төлж байна...';
      try {
        await api(`/payments/mock/${encodeURIComponent(id)}/pay`, { method: 'POST' });
        if (isStale(token)) return;
        drawDone('Төлбөр амжилттай');
      } catch (ex) {
        if (isStale(token)) return;
        draw(ex.message);
      }
    });
  };
  draw();
}
