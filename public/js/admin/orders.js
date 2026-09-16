// Захиалгын удирдлага — жагсаалт, дэлгэрэнгүй, төлөв, QPay синк
'use strict';

// Шүүлтүүрийг hash-ийн query-д хадгална (дэлгэрэнгүйгээс буцахад хадгалагдана)
function syncHashQuery(base, filters) {
  const url = `${location.pathname}${location.search}#/${base}${qs(filters)}`;
  history.replaceState(null, '', url);
}

Views.orders = async (root, ctx) => {
  if (ctx.parts[1]) return orderDetail(root, ctx, ctx.parts[1]);

  const p = ctx.params;
  const f = {
    status: p.get('status') || '',
    payment_status: p.get('payment_status') || '',
    q: p.get('q') || '',
    from: p.get('from') || '',
    to: p.get('to') || '',
    page: +p.get('page') || 1,
  };
  const TABS = [['', 'Бүгд'], ['pending', 'Хүлээгдэж буй'], ['processing', 'Бэлтгэгдэж буй'], ['shipped', 'Илгээгдсэн'], ['delivered', 'Хүргэгдсэн'], ['cancelled', 'Цуцлагдсан']];

  root.innerHTML = `
    <div class="card">
      <div class="tabs" id="oTabs" role="tablist">
        ${TABS.map(([k, l]) => `<button type="button" data-st="${k}" class="${f.status === k ? 'active' : ''}">${l}<i class="num" data-cnt="${k}">0</i></button>`).join('')}
      </div>
      <div class="filters">
        <div class="search">${ICONS.search}<input class="input" id="oQ" placeholder="Дугаар, нэр, утас, и-мэйл…" value="${esc(f.q)}"></div>
        <select class="input" id="oPay" aria-label="Төлбөрийн төлөв">
          <option value="">Төлбөр: бүгд</option>
          ${Object.entries(PAY_STATUS).filter(([k]) => k !== 'expired').map(([k, [l]]) => `<option value="${k}" ${f.payment_status === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <div class="filters__dates">
          <input class="input" type="date" id="oFrom" value="${esc(f.from)}" aria-label="Эхлэх огноо">
          <span class="muted">—</span>
          <input class="input" type="date" id="oTo" value="${esc(f.to)}" aria-label="Дуусах огноо">
        </div>
        <button class="btn btn--ghost" id="oReset" type="button">Цэвэрлэх</button>
        <a class="btn btn--ghost" id="oCsv" download>${ICONS.download}CSV</a>
      </div>
      <div class="card__body--flush tbl-wrap" id="oTable" style="margin-top:12px"><div class="loading">Ачаалж байна…</div></div>
      <div class="pager" id="oPager"></div>
    </div>`;

  const load = async () => {
    const d = await api(`/api/admin/orders${qs({ ...f, limit: 20 })}`);
    if (!ctx.alive()) return;
    f.page = d.page;
    syncHashQuery('orders', { ...f, page: f.page > 1 ? f.page : '' });
    const { page, ...exportF } = f;
    $('#oCsv', root).href = `/api/admin/orders/export.csv${qs(exportF)}`;

    const all = Object.values(d.counts).reduce((a, b) => a + b, 0);
    $$('[data-cnt]', root).forEach((el) => { el.textContent = fmtNum(el.dataset.cnt ? d.counts[el.dataset.cnt] || 0 : all); });

    $('#oTable', root).innerHTML = d.items.length ? `
      <table class="tbl tbl--click">
        <thead><tr><th>Дугаар</th><th>Огноо</th><th>Хэрэглэгч</th><th class="r">Ширхэг</th><th class="r">Нийт</th><th class="r">Хямдрал</th><th>Төлөв</th><th>Төлбөр</th></tr></thead>
        <tbody>
          ${d.items.map((o) => `
            <tr data-href="#/orders/${o.id}">
              <td class="strong nowrap"><a href="#/orders/${o.id}">${esc(o.order_no)}</a></td>
              <td class="num nowrap muted">${fmtDT(o.created_at)}</td>
              <td><b style="font-weight:600">${esc(o.customer_name)}</b><div class="sub num">${esc(fmtPhone(o.phone))}</div></td>
              <td class="r num">${fmtNum(o.units)}</td>
              <td class="r strong num nowrap">${fmtT(o.total)}</td>
              <td class="r num">${o.discount_pct ? `<span class="chip chip--brand">${o.discount_pct}%</span>` : '<span class="muted">—</span>'}</td>
              <td>${statusChip(o.status)}</td>
              <td>${payChip(o.payment_status)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : emptyBox('Шүүлтүүрт тохирох захиалга олдсонгүй', 'receipt');
    renderPager($('#oPager', root), d, (pg) => { f.page = pg; load().catch((e) => toast(e.message, 'err')); });
  };
  const reload = () => { f.page = 1; load().catch((e) => toast(e.message, 'err')); };

  bindRowLinks($('#oTable', root));
  $('#oTabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    f.status = b.dataset.st;
    $$('#oTabs button', root).forEach((x) => x.classList.toggle('active', x === b));
    reload();
  });
  $('#oQ', root).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); reload(); }, 300));
  $('#oPay', root).addEventListener('change', (e) => { f.payment_status = e.target.value; reload(); });
  $('#oFrom', root).addEventListener('change', (e) => { f.from = e.target.value; reload(); });
  $('#oTo', root).addEventListener('change', (e) => { f.to = e.target.value; reload(); });
  $('#oReset', root).onclick = () => {
    Object.assign(f, { status: '', payment_status: '', q: '', from: '', to: '' });
    $('#oQ', root).value = ''; $('#oPay', root).value = ''; $('#oFrom', root).value = ''; $('#oTo', root).value = '';
    $$('#oTabs button', root).forEach((x) => x.classList.toggle('active', x.dataset.st === ''));
    reload();
  };
  await load();
};

/* ================= Дэлгэрэнгүй ================= */
const NEXT_STATUS = {
  pending: ['processing', 'Бэлтгэж эхлэх'],
  processing: ['shipped', 'Илгээсэн'],
  shipped: ['delivered', 'Хүргэгдсэн'],
};
const PAY_MODE = { live: 'Бодит (live)', mock: 'Туршилт (mock)' };

async function orderDetail(root, ctx, id) {
  const d = await api(`/api/admin/orders/${encodeURIComponent(id)}`);
  if (!ctx.alive()) return;
  const o = d.order;
  const c = d.customer;
  const pay = o.payment;
  ctx.setTitle(`Захиалга ${o.order_no}`);

  const flow = ['pending', 'processing', 'shipped', 'delivered'];
  const next = NEXT_STATUS[o.status];
  const canCancel = !['delivered', 'cancelled'].includes(o.status);
  const needPaid = o.status === 'pending' && o.payment_status !== 'paid';

  const histLabel = (h) => {
    const map = h.kind === 'payment' ? PAY_STATUS : ORDER_STATUS;
    const lbl = (v) => (map[v] ? map[v][0] : v || '—');
    return `${h.kind === 'payment' ? 'Төлбөр' : 'Төлөв'}: ${h.from_value ? `${esc(lbl(h.from_value))} → ` : ''}<span>${esc(lbl(h.to_value))}</span>`;
  };

  root.innerHTML = `
    <div>
      <a class="back-link" href="#/orders">${ICONS.back}Захиалгууд руу буцах</a>
      <div class="page-head">
        <h2>${esc(o.order_no)} ${statusChip(o.status)} ${payChip(o.payment_status)}
          ${o.refund_required ? '<span class="chip chip--red">Төлбөр буцаах шаардлагатай</span>' : ''}</h2>
        <div class="spacer"></div>
        <span class="muted num">Үүссэн: ${fmtDT(o.created_at)}</span>
      </div>
    </div>

    ${o.refund_required ? `<div class="notice notice--red">${ICONS.alert}<span>Энэ захиалга цуцлагдсан боловч төлбөр нь төлөгдсөн байна. Хэрэглэгчид ${fmtT(pay && pay.paid_amount ? pay.paid_amount : o.total)} буцаан олгоно уу.</span></div>` : ''}

    <div class="grid-23">
      <div class="col">
        <div class="card">
          <div class="card__head"><h2>Бараа</h2><div class="spacer"></div><span class="chip num">${o.items.reduce((a, it) => a + it.qty, 0)} ширхэг</span></div>
          <div class="card__body--flush tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Бараа</th><th class="r">Үнэ</th><th class="r">Тоо</th><th class="r">Дүн</th></tr></thead>
              <tbody>
                ${o.items.map((it) => `
                  <tr>
                    <td><div class="cell-prod">${thumb(it.image)}<div>${it.product_id ? `<a href="#/products/${it.product_id}"><b>${esc(it.name)}</b></a>` : `<b>${esc(it.name)}</b>`}<span class="sub">${esc(it.sku)}</span></div></div></td>
                    <td class="r num nowrap">${fmtT(it.price)}</td>
                    <td class="r num">× ${fmtNum(it.qty)}</td>
                    <td class="r strong num nowrap">${fmtT(it.line_total)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card__body" style="border-top:1px solid var(--border);max-width:420px;margin-left:auto;padding-top:12px">
            <div class="sum-row"><span>Барааны дүн</span><b class="num">${fmtT(o.subtotal)}</b></div>
            <div class="sum-row sum-row--disc"><span>Гишүүнчлэлийн хямдрал (${ordinal(o.order_seq)} захиалга, ${o.discount_pct}%)</span><b class="num">${o.discount_amount ? '−' + fmtT(o.discount_amount) : fmtT(0)}</b></div>
            <div class="sum-row"><span>Хүргэлт</span><b class="num">${o.shipping_fee ? fmtT(o.shipping_fee) : 'Үнэгүй'}</b></div>
            <div class="sum-row sum-row--total"><span>Нийт төлөх</span><b class="num">${fmtT(o.total)}</b></div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h2>Төлөвийн түүх</h2></div>
          <div class="card__body">
            <ul class="timeline">
              <li><b>Захиалга үүссэн</b><p class="num">${fmtDT(o.created_at)}</p></li>
              ${o.history.map((h) => `
                <li class="${h.kind === 'payment' ? 'pay' : ''}${h.to_value === 'cancelled' ? ' cancel' : ''}">
                  <b>${histLabel(h)}</b>
                  <p class="num">${fmtDT(h.created_at)}${h.actor ? ` · ${esc(h.actor)}` : ''}</p>
                  ${h.note ? `<p class="note">${esc(h.note)}</p>` : ''}
                </li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card__head"><h2>Үйлдэл</h2></div>
          <div class="card__body actions-box">
            <div class="status-flow">
              ${flow.map((s, i) => `${i ? ICONS.right : ''}<span class="${o.status === s ? 'on' : ''}">${ORDER_STATUS[s][0]}</span>`).join('')}
            </div>
            ${o.status === 'cancelled' ? `<p class="hint">Цуцалсан: ${fmtDT(o.cancelled_at)}${o.cancel_reason ? ` — ${esc(o.cancel_reason)}` : ''}</p>` : ''}
            ${o.status === 'delivered' ? '<p class="hint">Захиалга хүргэгдэж дууссан.</p>' : ''}
            ${next ? `
              <button class="btn btn--primary" id="oNext" ${needPaid ? 'disabled' : ''}>${ICONS.check}${next[1]}</button>
              ${needPaid ? '<p class="hint">Төлбөр төлөгдсөний дараа бэлтгэж эхлэх боломжтой.</p>' : ''}` : ''}
            ${canCancel ? `<button class="btn btn--danger" id="oCancel">${ICONS.x}Цуцлах</button>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h2>Хэрэглэгч</h2></div>
          <div class="card__body">
            ${c ? `
              <div class="cell-prod" style="min-width:0">
                <span class="cust-head__avatar" style="width:40px;height:40px;font-size:15px">${esc((c.name || '?')[0].toUpperCase())}</span>
                <div><a href="#/customers/${c.id}"><b>${esc(c.name || 'Нэргүй')}</b></a>
                  <span class="sub">${esc([c.phone && fmtPhone(c.phone), c.email].filter(Boolean).join(' · '))}</span></div>
              </div>
              ${d.loyalty ? `<p class="hint" style="margin-top:10px">Төлсөн ${fmtNum(d.loyalty.paid_orders)} захиалгатай · дараагийн захиалгад ${d.loyalty.tier.pct}% (${esc(d.loyalty.tier.name)})</p>` : ''}`
            : '<p class="muted">Хэрэглэгчийн бүртгэл олдсонгүй</p>'}
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h2>Хүргэлт</h2></div>
          <div class="card__body">
            <dl class="kv">
              <dt>Хүлээн авагч</dt><dd>${esc(o.customer_name)}</dd>
              <dt>Утас</dt><dd class="num">${esc(fmtPhone(o.phone))}</dd>
              <dt>Хаяг</dt><dd>${esc(o.address)}</dd>
              ${o.note ? `<dt>Тэмдэглэл</dt><dd>${esc(o.note)}</dd>` : ''}
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <img class="qpay-logo" src="/img/pay/qpay.png" alt="QPay"><h2 class="sr-only">Төлбөр (QPay)</h2><div class="spacer"></div>
            <button class="btn btn--ghost btn--sm" id="oSync">${ICONS.refresh}QPay-тэй синк хийх</button>
          </div>
          <div class="card__body">
            <dl class="kv">
              <dt>Төлөв</dt><dd>${payChip(o.payment_status)}</dd>
              ${pay ? `
                <dt>Нэхэмжлэх</dt><dd>${payChip(pay.status)}</dd>
                <dt>Invoice ID</dt><dd class="num" style="font-size:12.5px">${esc(pay.invoice_id || '—')}</dd>
                <dt>Горим</dt><dd>${esc(PAY_MODE[pay.mode] || pay.mode)}</dd>
                <dt>Нэхэмжилсэн</dt><dd class="num">${fmtT(pay.amount)}</dd>
                <dt>Үүссэн</dt><dd class="num">${fmtDT(pay.created_at)}</dd>
                ${pay.status === 'pending' ? `<dt>Хүчинтэй</dt><dd class="num">${fmtDT(pay.expires_at)}</dd>` : ''}
                <dt>Төлсөн огноо</dt><dd class="num">${fmtDT(pay.paid_at || o.paid_at)}</dd>
                <dt>Төлсөн дүн</dt><dd class="num">${pay.paid_amount ? fmtT(pay.paid_amount) : '—'}</dd>`
              : `
                <dt>Нэхэмжлэх</dt><dd class="muted">Үүсээгүй</dd>
                <dt>Төлсөн огноо</dt><dd class="num">${fmtDT(o.paid_at)}</dd>`}
            </dl>
          </div>
        </div>
      </div>
    </div>`;

  const nextBtn = $('#oNext', root);
  if (nextBtn) nextBtn.onclick = () =>
    withBusy(nextBtn, async () => {
      try {
        await api(`/api/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status: next[0] } });
        toast(`Төлөв: ${ORDER_STATUS[next[0]][0]}`);
        refreshBadges();
        Views.orders(root, ctx).catch((e) => toast(e.message, 'err'));
      } catch (e) { toast(e.message, 'err'); }
    });

  const cancelBtn = $('#oCancel', root);
  if (cancelBtn) cancelBtn.onclick = () => {
    confirmModal('Захиалга цуцлах', `
      <p><b>${esc(o.order_no)}</b> захиалгыг цуцлах уу? Энэ үйлдлийг буцаах боломжгүй.</p>
      <div class="notice notice--info">${ICONS.info}<span>Захиалгын бараа (${o.items.reduce((a, it) => a + it.qty, 0)} ширхэг) агуулахын үлдэгдэлд буцаж нэмэгдэнэ.</span></div>
      ${o.payment_status === 'paid' ? `<div class="notice notice--red">${ICONS.alert}<span>Төлбөр төлөгдсөн захиалга тул хэрэглэгчид ${fmtT(o.total)} гараар буцаан олгох шаардлагатай.</span></div>` : ''}
      <div class="field"><label for="cReason">Цуцлах шалтгаан</label><textarea class="input" id="cReason" maxlength="300" rows="3" placeholder="Жиш: Хэрэглэгч захиалгаа цуцлуулсан"></textarea></div>`,
    {
      yes: 'Захиалга цуцлах',
      onYes: async () => {
        await api(`/api/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status: 'cancelled', note: $('#cReason').value.trim() } });
        toast('Захиалга цуцлагдлаа');
        refreshBadges();
        Views.orders(root, ctx).catch((e) => toast(e.message, 'err'));
      },
    });
  };

  const syncBtn = $('#oSync', root);
  syncBtn.onclick = () =>
    withBusy(syncBtn, async () => {
      try {
        const r = await api(`/api/admin/orders/${o.id}/sync-payment`, { method: 'POST' });
        const changed = r.order.payment_status !== o.payment_status || r.order.status !== o.status;
        toast(changed ? `Шинэчлэгдлээ: ${PAY_STATUS[r.order.payment_status][0]}` : 'Төлбөрийн төлөв өөрчлөгдөөгүй');
        if (changed) refreshBadges();
        Views.orders(root, ctx).catch((e) => toast(e.message, 'err'));
      } catch (e) { toast(e.message, 'err'); }
    });
}
