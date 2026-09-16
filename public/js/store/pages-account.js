// Хэрэглэгчийн булан: захиалга, гишүүнчлэл, хувийн мэдээлэл, нууц үг, захиалгын дэлгэрэнгүй
import { state, api, esc, money, setTitle, navigate, isStale, requireLogin, loading, fmtDate, emitState, toast, countUp } from './core.js';
import { icons, breadcrumbs, emptyState, statusBadge, paymentBadge, tierLabel, tierBenefit } from './components.js';

const TABS = [
  ['orders', '/account', 'Миний захиалга', 'box'],
  ['loyalty', '/account/loyalty', 'Гишүүнчлэл', 'award'],
  ['profile', '/account/profile', 'Хувийн мэдээлэл', 'user'],
  ['password', '/account/password', 'Нууц үг', 'lock'],
];

const STATUS_LABELS = { pending: 'Хүлээгдэж буй', processing: 'Бэлтгэгдэж буй', shipped: 'Илгээгдсэн', delivered: 'Хүргэгдсэн', cancelled: 'Цуцлагдсан' };
const PAY_LABELS = { pending: 'Хүлээгдэж буй', paid: 'Төлөгдсөн', cancelled: 'Цуцлагдсан', expired: 'Хугацаа дууссан' };

function shell(active, inner) {
  const u = state.user;
  return `<div class="container account-page">
    ${breadcrumbs([{ label: 'Миний бүртгэл' }])}
    <div class="account-layout">
      <aside class="card account-side">
        <div class="account-user">
          <span class="avatar">${esc((u.name || u.phone || u.email || '?').trim().charAt(0).toUpperCase())}</span>
          <div><b>${esc(u.name || 'Хэрэглэгч')}</b><small class="muted">${esc(u.phone || u.email || '')}</small></div>
        </div>
        <nav class="account-nav">
          ${TABS.map(([k, href, label, ic]) => `<a href="${href}" class="${k === active ? 'is-active' : ''}">${icons[ic](18)}<span>${label}</span></a>`).join('')}
          <button type="button" data-logout>${icons.logout(18)}<span>Гарах</span></button>
        </nav>
      </aside>
      <section class="account-main">${inner}</section>
    </div>
  </div>`;
}

function bindLogout(app) {
  app.querySelector('[data-logout]')?.addEventListener('click', async () => {
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
  });
}

function loyaltyPanel(l) {
  if (!l.enabled) return '<div class="card"><h2>Гишүүнчлэл</h2><p class="muted">Гишүүнчлэлийн хямдрал одоогоор идэвхгүй байна.</p></div>';
  const t = l.tier;
  const next = t.next;
  const tiers = l.tiers;
  // Дараагийн шат хүртэлх явц: одоогийн шатны эхлэлээс дараагийн шатны эхлэл хүртэл
  let progress = 100;
  if (next) {
    const span = next.min_order - t.min_order;
    progress = Math.max(4, Math.min(100, Math.round(((l.next_order_seq - t.min_order) / span) * 100)));
  }
  return `<div class="card loyalty-card">
      <div class="loyalty-now">
        <span class="loyalty-icon">${icons.award(28)}</span>
        <div>
          <div class="muted small">Таны одоогийн шат</div>
          <div class="loyalty-name">${esc(t.name)}</div>
          <div>Дараагийн (${esc(l.next_order_seq)}-р) захиалгад <b>${t.pct > 0 ? `${esc(t.pct)}% хямдрал` : 'үндсэн үнэ'}</b></div>
        </div>
        <div class="loyalty-stat"><b>${esc(l.paid_orders)}</b><span class="muted small">төлөгдсөн захиалга</span></div>
      </div>
      <div class="progress-wrap">
        <div class="progress"><span style="--w:${progress}%"></span></div>
        <div class="muted small">${next ? `${esc(next.orders_left)} захиалгын дараа <b>${esc(next.name)}</b> — ${esc(next.pct)}% хямдрал` : 'Та хамгийн өндөр шатанд байна'}</div>
      </div>
    </div>
    <div class="card">
      <h2>Гишүүнчлэлийн шатууд</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Шат</th><th>Захиалга</th><th>Хямдрал</th></tr></thead>
        <tbody>${tiers
          .map(
            (x, i) => `<tr class="${i === t.index ? 'is-current' : ''}"><td>${esc(x.name)}${i === t.index ? ' <span class="badge badge-accent">Одоогийн</span>' : ''}</td><td>${esc(tierLabel(tiers, i))}</td><td><b>${x.pct > 0 ? `<span data-count="${esc(x.pct)}" data-suffix="%">${esc(x.pct)}%</span> хямдрал` : 'Үндсэн үнэ'}</b></td></tr>`
          )
          .join('')}</tbody>
      </table></div>
      <p class="muted small">Хямдрал нь төлөгдсөн захиалгын тоогоор тооцогдож, сагсанд автоматаар хэрэглэгдэнэ.</p>
    </div>`;
}

export async function accountPage({ app, params, path, token }) {
  if (!requireLogin()) return;
  const tab = path.startsWith('/account/loyalty') ? 'loyalty' : path.startsWith('/account/profile') ? 'profile' : path.startsWith('/account/password') ? 'password' : 'orders';
  setTitle({ orders: 'Миний захиалга', loyalty: 'Гишүүнчлэл', profile: 'Хувийн мэдээлэл', password: 'Нууц үг' }[tab]);
  if (!app.querySelector('.account-page')) loading(app);

  if (tab === 'orders') {
    const r = await api('/orders');
    if (isStale(token)) return;
    state.loyalty = r.loyalty;
    const list = r.orders;
    app.innerHTML = shell(
      'orders',
      `<div class="card">
        <h2>Миний захиалга</h2>
        ${
          list.length
            ? `<div class="order-list">${list
                .map((o) => {
                  const href = `/account/orders/${encodeURIComponent(o.order_no)}`;
                  const thumbs = o.items.slice(0, 4);
                  const units = o.items.reduce((s, i) => s + i.qty, 0);
                  return `<article class="order-card">
                  <div class="order-top">
                    <a href="${href}" class="order-no">${esc(o.order_no)}</a>
                    <span class="muted small">${esc(fmtDate(o.created_at))}</span>
                    <span class="order-badges">${statusBadge(o)}${paymentBadge(o)}</span>
                  </div>
                  <div class="order-mid">
                    <div class="order-thumbs">${thumbs.map((i) => `<span class="othumb" title="${esc(i.name)} × ${esc(i.qty)}">${i.image ? `<img src="${esc(i.image)}" alt="" width="52" height="52" loading="lazy">` : ''}</span>`).join('')}${o.items.length > 4 ? `<span class="othumb othumb-more">+${o.items.length - 4}</span>` : ''}</div>
                    <div class="order-sum"><span class="muted small">${esc(units)} бараа</span><b>${money(o.total)}</b></div>
                  </div>
                  <div class="order-actions">
                    ${o.payment_status === 'pending' && o.status === 'pending' ? `<a href="/orders/${encodeURIComponent(o.order_no)}/pay" class="btn btn-primary btn-sm">Төлбөр төлөх</a>` : ''}
                    <a href="${href}" class="btn btn-outline btn-sm">Дэлгэрэнгүй</a>
                  </div>
                </article>`;
                })
                .join('')}</div>`
            : emptyState('Захиалга алга байна', 'Та одоогоор захиалга өгөөгүй байна.', { href: '/products', label: 'Бараа үзэх' })
        }
      </div>`
    );
  } else if (tab === 'loyalty') {
    const r = await api('/account/me');
    if (isStale(token)) return;
    state.user = r.user;
    state.loyalty = r.loyalty;
    app.innerHTML = shell('loyalty', loyaltyPanel(r.loyalty));
    countUp(app);
  } else if (tab === 'profile') {
    const r = await api('/account/me');
    if (isStale(token)) return;
    state.user = r.user;
    const draw = (msg = '', isErr = false, v = r.user) => {
      app.innerHTML = shell(
        'profile',
        `<form class="card form narrow" novalidate data-profile>
          <h2>Хувийн мэдээлэл</h2>
          ${msg ? `<div class="alert ${isErr ? 'alert-error' : 'alert-success'}">${isErr ? icons.alert(18) : icons.check(18)}<span>${esc(msg)}</span></div>` : ''}
          <label class="field"><span>Нэр</span><input name="name" type="text" maxlength="80" autocomplete="name" value="${esc(v.name || '')}"></label>
          <div class="form-grid">
            <label class="field"><span>Утасны дугаар</span><input name="phone" type="tel" inputmode="numeric" maxlength="8" autocomplete="tel" value="${esc(v.phone || '')}"></label>
            <label class="field"><span>И-мэйл</span><input name="email" type="email" autocomplete="email" value="${esc(v.email || '')}"></label>
          </div>
          <label class="field"><span>Хүргэлтийн хаяг</span><textarea name="address" rows="3" maxlength="400">${esc(v.address || '')}</textarea></label>
          <button type="submit" class="btn btn-primary">Хадгалах</button>
        </form>`
      );
      bindLogout(app);
      const f = app.querySelector('[data-profile]');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: f.name.value.trim(), phone: f.phone.value.replace(/\D/g, ''), email: f.email.value.trim(), address: f.address.value.trim() };
        const btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const res = await api('/account/me', { method: 'PATCH', body });
          if (isStale(token)) return;
          state.user = res.user;
          emitState();
          draw('Мэдээлэл хадгалагдлаа', false, res.user);
        } catch (ex) {
          if (isStale(token)) return;
          draw(ex.message, true, body);
        }
      });
    };
    draw();
    return;
  } else {
    const r = await api('/account/me');
    if (isStale(token)) return;
    state.user = r.user;
    const has = r.user.has_password;
    const draw = (msg = '', isErr = false) => {
      app.innerHTML = shell(
        'password',
        `<form class="card form narrow" novalidate data-pw>
          <h2>${has ? 'Нууц үг солих' : 'Нууц үг тохируулах'}</h2>
          ${!has ? '<p class="muted small">Та нэг удаагийн кодоор бүртгүүлсэн тул нууц үг тохируулснаар дараа нь нууц үгээр нэвтрэх боломжтой.</p>' : ''}
          ${msg ? `<div class="alert ${isErr ? 'alert-error' : 'alert-success'}">${isErr ? icons.alert(18) : icons.check(18)}<span>${esc(msg)}</span></div>` : ''}
          ${has ? '<label class="field"><span>Одоогийн нууц үг</span><input name="current" type="password" autocomplete="current-password"></label>' : ''}
          <label class="field"><span>Шинэ нууц үг</span><input name="next" type="password" minlength="8" autocomplete="new-password"><small class="hint">Хамгийн багадаа 8 тэмдэгт</small></label>
          <label class="field"><span>Шинэ нууц үг давтах</span><input name="confirm" type="password" minlength="8" autocomplete="new-password"></label>
          <button type="submit" class="btn btn-primary">Хадгалах</button>
        </form>`
      );
      bindLogout(app);
      const f = app.querySelector('[data-pw]');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (f.next.value.length < 8) return draw('Нууц үг хамгийн багадаа 8 тэмдэгт байна', true);
        if (f.next.value !== f.confirm.value) return draw('Шинэ нууц үг таарахгүй байна', true);
        const btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          await api('/account/password', { method: 'POST', body: { current_password: has ? f.current.value : undefined, new_password: f.next.value } });
          if (isStale(token)) return;
          if (!has) {
            state.user = { ...state.user, has_password: true };
            navigate('/account/password', { replace: true, scroll: false });
            toast('Нууц үг тохируулагдлаа', 'success');
            return;
          }
          draw('Нууц үг амжилттай солигдлоо');
        } catch (ex) {
          if (isStale(token)) return;
          draw(ex.message, true);
        }
      });
    };
    draw();
    return;
  }
  bindLogout(app);
}

export async function orderDetailPage({ app, params, token }) {
  if (!requireLogin()) return;
  const orderNo = decodeURIComponent(params.orderNo);
  setTitle(`Захиалга ${orderNo}`);
  loading(app);
  const { order: o } = await api(`/orders/${encodeURIComponent(orderNo)}`);
  if (isStale(token)) return;

  const flow = ['pending', 'processing', 'shipped', 'delivered'];
  const curIdx = flow.indexOf(o.status);
  const statusTimes = {};
  for (const h of o.history || []) if (h.kind === 'status' && !statusTimes[h.to_value]) statusTimes[h.to_value] = h.created_at;
  statusTimes.pending = statusTimes.pending || o.created_at;

  const timeline =
    o.status === 'cancelled'
      ? `<div class="alert alert-error">${icons.close(18)}<span><b>Захиалга цуцлагдсан</b>${o.cancelled_at ? ` · ${esc(fmtDate(o.cancelled_at))}` : ''}${o.cancel_reason ? ` · ${esc(o.cancel_reason)}` : ''}</span></div>`
      : `<ol class="timeline">${flow
          .map(
            (s, i) => `<li class="${i < curIdx ? 'done' : i === curIdx ? 'is-active' : ''}">
            <span class="tl-dot">${i <= curIdx ? icons.check(14) : ''}</span>
            <span class="tl-label">${STATUS_LABELS[s]}</span>
            <span class="tl-time">${statusTimes[s] && i <= curIdx ? esc(fmtDate(statusTimes[s])) : ''}</span>
          </li>`
          )
          .join('')}</ol>`;

  const history = (o.history || [])
    .slice()
    .reverse()
    .map((h) => {
      const map = h.kind === 'payment' ? PAY_LABELS : STATUS_LABELS;
      const label = h.kind === 'payment' ? `Төлбөр: ${map[h.to_value] || h.to_value}` : map[h.to_value] || h.to_value;
      return `<li><span class="muted small">${esc(fmtDate(h.created_at))}</span><span>${esc(label)}${h.note ? ` <span class="muted">— ${esc(h.note)}</span>` : ''}</span></li>`;
    })
    .join('');

  const canPay = o.payment_status === 'pending' && o.status === 'pending';

  app.innerHTML = `<div class="container order-page">
    ${breadcrumbs([{ label: 'Миний захиалга', href: '/account' }, { label: o.order_no }])}
    <div class="order-header">
      <div>
        <h1 class="page-title">Захиалга ${esc(o.order_no)}</h1>
        <div class="muted small">${esc(fmtDate(o.created_at))} · ${esc(o.order_seq)}-р захиалга</div>
      </div>
      <div class="order-badges">${statusBadge(o)}${paymentBadge(o)}</div>
    </div>
    ${canPay ? `<div class="alert alert-info pay-alert">${icons.card(18)}<span>Энэ захиалгын төлбөр хараахан төлөгдөөгүй байна.</span><a href="/orders/${esc(encodeURIComponent(o.order_no))}/pay" class="btn btn-primary btn-sm">Төлбөр төлөх</a></div>` : ''}
    ${o.refund_required ? `<div class="alert alert-info">${icons.alert(18)}<span>Энэ захиалгын төлбөрийг буцаан олгохоор дэлгүүртэй холбогдоно уу.</span></div>` : ''}
    <div class="card">${timeline}</div>
    <div class="two-col">
      <section class="card">
        <h2>Бараа</h2>
        <ul class="mini-items mini-items-lg">
          ${o.items
            .map(
              (it) => `<li>
              <span class="mini-img">${it.image ? `<img src="${esc(it.image)}" alt="" width="64" height="64">` : ''}</span>
              <span class="mini-name">${esc(it.name)}<small class="muted">${esc(it.sku)} · ${money(it.price)} × ${esc(it.qty)}</small></span>
              <b>${money(it.line_total)}</b>
            </li>`
            )
            .join('')}
        </ul>
        <dl class="summary-rows">
          <div><dt>Дүн</dt><dd>${money(o.subtotal)}</dd></div>
          <div class="${o.discount_amount > 0 ? 'row-discount' : ''}"><dt>Гишүүнчлэлийн хямдрал<small>${esc(o.order_seq)}-р захиалга, ${esc(o.discount_pct)}%</small></dt><dd>${o.discount_amount > 0 ? `-${money(o.discount_amount)}` : money(0)}</dd></div>
          <div><dt>Хүргэлт</dt><dd>${o.shipping_fee > 0 ? money(o.shipping_fee) : '<span class="text-green">Үнэгүй</span>'}</dd></div>
          <div class="row-total"><dt>Нийт</dt><dd>${money(o.total)}</dd></div>
        </dl>
      </section>
      <aside>
        <div class="card">
          <h2>Хүргэлтийн мэдээлэл</h2>
          <dl class="info-list">
            <div><dt>Нэр</dt><dd>${esc(o.customer_name)}</dd></div>
            <div><dt>Утас</dt><dd>${esc(o.phone)}</dd></div>
            <div><dt>Хаяг</dt><dd>${esc(o.address)}</dd></div>
            ${o.note ? `<div><dt>Тэмдэглэл</dt><dd>${esc(o.note)}</dd></div>` : ''}
          </dl>
        </div>
        <div class="card">
          <h2>Төлбөр</h2>
          <dl class="info-list">
            <div><dt>Төлөв</dt><dd>${paymentBadge(o)}</dd></div>
            <div><dt>Арга</dt><dd>${esc(o.payment_method === 'qpay' || !o.payment_method ? 'QPay' : o.payment_method)}</dd></div>
            ${o.paid_at ? `<div><dt>Төлсөн</dt><dd>${esc(fmtDate(o.paid_at))}</dd></div>` : ''}
          </dl>
        </div>
        ${history ? `<div class="card"><h2>Түүх</h2><ul class="history">${history}</ul></div>` : ''}
      </aside>
    </div>
  </div>`;
}
