// Хэрэглэгчийн удирдлага — жагсаалт, дэлгэрэнгүй, гишүүнчлэлийн шат
'use strict';

const tierChip = (t) => `<span class="chip ${t.pct > 0 ? 'chip--brand' : ''}">${esc(t.name)} · ${t.pct}%</span>`;

Views.customers = async (root, ctx) => {
  if (ctx.parts[1]) return customerDetail(root, ctx, ctx.parts[1]);
  const p = ctx.params;
  const f = { q: p.get('q') || '', sort: p.get('sort') || 'new', page: +p.get('page') || 1 };

  root.innerHTML = `
    <div class="card">
      <div class="card__head"><h2>Бүх хэрэглэгч</h2><span class="chip num" id="cuTotal"></span></div>
      <div class="filters">
        <div class="search">${ICONS.search}<input class="input" id="cuQ" placeholder="Нэр, утас, и-мэйлээр хайх…" value="${esc(f.q)}"></div>
        <select class="input" id="cuSort" aria-label="Эрэмбэ">
          ${[['new', 'Шинэ бүртгүүлсэн'], ['spent', 'Их худалдан авалт'], ['orders', 'Олон захиалга'], ['last', 'Сүүлд авсан']]
            .map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="card__body--flush tbl-wrap" id="cuTable" style="margin-top:12px"><div class="loading">Ачаалж байна…</div></div>
      <div class="pager" id="cuPager"></div>
    </div>`;

  const load = async () => {
    const d = await api(`/api/admin/customers${qs({ ...f, limit: 20 })}`);
    if (!ctx.alive()) return;
    f.page = d.page;
    syncHashQuery('customers', { q: f.q, sort: f.sort === 'new' ? '' : f.sort, page: f.page > 1 ? f.page : '' });
    $('#cuTotal', root).textContent = fmtNum(d.total);
    $('#cuTable', root).innerHTML = d.items.length ? `
      <table class="tbl tbl--click">
        <thead><tr><th>Хэрэглэгч</th><th>Холбоо барих</th><th class="r">Төлсөн захиалга</th><th class="r">Нийт худалдан авалт</th><th>Дараагийн захиалгын шат</th><th>Сүүлд авсан</th><th>Төлөв</th></tr></thead>
        <tbody>
          ${d.items.map((c) => `
            <tr data-href="#/customers/${c.id}">
              <td><a href="#/customers/${c.id}"><b style="font-weight:600">${esc(c.name || 'Нэргүй')}</b></a><div class="sub num">Бүртгүүлсэн ${fmtDate(c.created_at)}</div></td>
              <td class="num">${c.phone ? esc(fmtPhone(c.phone)) : ''}${c.email ? `<div class="sub">${esc(c.email)}</div>` : ''}</td>
              <td class="r num">${fmtNum(c.paid_orders)}${c.orders_count > c.paid_orders ? `<span class="sub"> / ${fmtNum(c.orders_count)}</span>` : ''}</td>
              <td class="r strong num nowrap">${fmtT(c.total_spent)}</td>
              <td class="nowrap">${tierChip(c.tier)} <span class="sub">${ordinal(c.next_order_seq)} захиалга</span></td>
              <td class="num nowrap muted">${c.last_order_at ? fmtDate(c.last_order_at) : '—'}</td>
              <td>${c.is_blocked ? '<span class="chip chip--red">Хаагдсан</span>' : '<span class="chip chip--ok">Идэвхтэй</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : emptyBox(f.q ? 'Хайлтад тохирох хэрэглэгч олдсонгүй' : 'Хэрэглэгч бүртгэгдээгүй байна', 'users');
    renderPager($('#cuPager', root), d, (pg) => { f.page = pg; load().catch((e) => toast(e.message, 'err')); });
  };
  const reload = () => { f.page = 1; load().catch((e) => toast(e.message, 'err')); };
  bindRowLinks($('#cuTable', root));
  $('#cuQ', root).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); reload(); }, 300));
  $('#cuSort', root).addEventListener('change', (e) => { f.sort = e.target.value; reload(); });
  await load();
};

async function customerDetail(root, ctx, id) {
  const d = await api(`/api/admin/customers/${encodeURIComponent(id)}`);
  if (!ctx.alive()) return;
  const c = d.customer;
  const L = d.loyalty;
  ctx.setTitle(c.name || 'Хэрэглэгч');

  const tiers = L.tiers || [];
  const cur = L.tier;
  const nxt = cur.next;
  // Одоогийн шатнаас дараагийн шат хүртэлх явц (захиалгын дугаараар)
  const progress = nxt ? Math.round(((L.next_order_seq - cur.min_order) / (nxt.min_order - cur.min_order)) * 100) : 100;

  root.innerHTML = `
    <div>
      <a class="back-link" href="#/customers">${ICONS.back}Хэрэглэгчид рүү буцах</a>
      <div class="card card__pad cust-head">
        <span class="cust-head__avatar">${esc((c.name || '?')[0].toUpperCase())}</span>
        <div class="cust-head__info">
          <h2>${esc(c.name || 'Нэргүй')} ${c.is_blocked ? '<span class="chip chip--red">Хаагдсан</span>' : ''} ${c.verified ? '<span class="chip chip--ok">Баталгаажсан</span>' : ''}</h2>
          <p class="num">${[c.phone && fmtPhone(c.phone), c.email].filter(Boolean).map(esc).join(' · ') || '—'}</p>
          <p class="num">Бүртгүүлсэн ${fmtDT(c.created_at)}${c.last_login_at ? ` · Сүүлд нэвтэрсэн ${fmtDT(c.last_login_at)}` : ''}</p>
        </div>
        <label class="toggle">
          <input type="checkbox" id="cuBlocked" ${c.is_blocked ? 'checked' : ''}>
          <span class="toggle__track"></span>
          <span class="toggle__text"><b>Хаах</b><span>Нэвтрэх, захиалах эрхгүй болно</span></span>
        </label>
      </div>
    </div>

    <div class="stats stats--4">
      <div class="card stat"><span class="stat__ic">${ICONS.receipt}</span><span class="stat__label">Төлсөн захиалга</span><span class="stat__value num">${fmtNum(c.paid_orders)}</span><span class="stat__sub num">Нийт ${fmtNum(c.orders_count)} захиалга</span></div>
      <div class="card stat"><span class="stat__ic">${ICONS.coin}</span><span class="stat__label">Нийт худалдан авалт</span><span class="stat__value num">${fmtT(c.total_spent)}</span><span class="stat__sub num">Дундаж ${fmtT(c.paid_orders ? c.total_spent / c.paid_orders : 0)}</span></div>
      <div class="card stat"><span class="stat__ic">${ICONS.star}</span><span class="stat__label">Одоогийн хямдрал</span><span class="stat__value num">${cur.pct}%</span><span class="stat__sub">${esc(cur.name)}</span></div>
      <div class="card stat"><span class="stat__ic">${ICONS.calendar}</span><span class="stat__label">Сүүлд авсан</span><span class="stat__value num" style="font-size:20px">${c.last_order_at ? fmtDate(c.last_order_at) : '—'}</span><span class="stat__sub">төлбөр төлсөн огноо</span></div>
    </div>

    <div class="grid-32">
      <div class="col">
        <div class="card">
          <div class="card__head"><h2>Гишүүнчлэлийн шат</h2>${L.enabled ? '' : '<span class="chip chip--off">Идэвхгүй</span>'}</div>
          <div class="card__body form-grid">
            <div>
              <p style="color:var(--ink-2)">Дараагийн захиалга: <b style="color:var(--ink)">${ordinal(L.next_order_seq)} захиалга</b></p>
              <p style="font-size:22px;font-weight:700;margin-top:2px">${cur.pct}% хямдрал <span class="chip chip--brand" style="vertical-align:middle">${esc(cur.name)}</span></p>
            </div>
            <div>
              <div class="progress"><i style="width:${Math.max(4, Math.min(100, progress))}%"></i></div>
              <p class="hint" style="margin-top:6px">${nxt ? `${esc(nxt.name)} (${nxt.pct}%) хүртэл ${fmtNum(nxt.orders_left)} төлсөн захиалга дутуу` : 'Хамгийн дээд шатанд хүрсэн — цаашдын бүх захиалгад үйлчилнэ'}</p>
            </div>
            <div class="tier-list">
              ${tiers.map((t, i) => {
                const on = i === cur.index;
                const done = i < cur.index;
                return `<div class="tier-row${on ? ' tier-row--on' : ''}${done ? ' tier-row--done' : ''}">
                  ${on ? ICONS.check : `<span style="width:1.2em"></span>`}
                  <b>${esc(t.name)}</b>
                  <span class="num">${ordinal(t.min_order)} захиалгаас${i === tiers.length - 1 ? ' цааш' : ''}</span>
                  <span class="chip ${t.pct ? 'chip--brand' : ''} num">${t.pct}%</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h2>Их авсан бараа</h2></div>
          <div class="card__body--flush">
            ${d.products.length ? `<div class="list">${d.products.map((p, i) => `
              <div class="list__item">
                <span class="rank${i === 0 ? ' rank--1' : ''} num">${i + 1}</span>
                <div class="list__main"><b>${esc(p.name)}</b><span>${esc(p.sku)}</span></div>
                <div style="text-align:right"><b class="num">${fmtNum(p.qty)} ш</b><div class="hint num">${fmtT(p.revenue)}</div></div>
              </div>`).join('')}</div>` : emptyBox('Худалдан авалт алга')}
          </div>
        </div>
      </div>

      <div class="col">
      <div class="card">
        <div class="card__head">
          <div><h2>Сарын худалдан авалт</h2><p class="card__sub">Сүүлийн 12 сар · төлөгдсөн захиалга</p></div>
          <div class="spacer"></div>
          <div class="chart-legend"><span><i style="background:${PAL.brand}"></i>Дүн</span><span><i class="line" style="background:${PAL.warm}"></i>Захиалга</span></div>
        </div>
        <div class="card__body">${c.paid_orders ? '<div class="chart-box chart-box--sm"><canvas id="cuChart" aria-label="Сарын худалдан авалт"></canvas></div>' : `<div class="empty empty--sm">${ICONS.chart}<p>Төлөгдсөн худалдан авалт алга</p></div>`}</div>
      </div>
      <div class="card">
        <div class="card__head"><h2>Худалдан авалтын түүх</h2><div class="spacer"></div><span class="chip num">${fmtNum(d.orders.length)} захиалга</span></div>
        <div class="card__body--flush tbl-wrap">
          ${d.orders.length ? `
          <table class="tbl tbl--click" id="cuOrders">
            <thead><tr><th>Дугаар</th><th>Огноо</th><th class="r">Хямдрал</th><th class="r">Дүн</th><th>Төлөв</th><th>Төлбөр</th></tr></thead>
            <tbody>
              ${d.orders.map((o) => `
                <tr data-href="#/orders/${o.id}">
                  <td class="strong nowrap"><a href="#/orders/${o.id}">${esc(o.order_no)}</a>${o.payment_status === 'paid' && o.status !== 'cancelled' ? `<div class="sub">${ordinal(o.order_seq)} захиалга</div>` : ''}</td>
                  <td class="num nowrap muted">${fmtDT(o.created_at)}</td>
                  <td class="r num">${o.discount_pct ? `<span class="chip chip--brand">${o.discount_pct}%</span>` : '<span class="muted">—</span>'}</td>
                  <td class="r strong num nowrap">${fmtT(o.total)}</td>
                  <td>${statusChip(o.status)}</td>
                  <td>${payChip(o.payment_status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : emptyBox('Захиалга өгөөгүй байна', 'receipt')}
        </div>
      </div>
      </div>
    </div>`;

  // Сүүлийн 12 сарын худалдан авалт
  const months = [];
  const now = todayStr();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 - i, 1);
    months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  const byMonth = new Map(months.map((m) => [m, { total: 0, orders: 0 }]));
  d.orders.filter((o) => o.payment_status === 'paid' && o.status !== 'cancelled').forEach((o) => {
    const m = byMonth.get(String(o.paid_at || o.created_at).slice(0, 7));
    if (m) { m.total += o.total; m.orders += 1; }
  });
  makeChart($('#cuChart', root), {
    type: 'bar',
    data: {
      labels: months.map((m) => `${Number(m.slice(5))}-р сар`),
      datasets: [
        { type: 'bar', data: months.map((m) => byMonth.get(m).total), yAxisID: 'y', order: 2, backgroundColor: alpha(PAL.brand, 0.85), hoverBackgroundColor: PAL.dark, borderRadius: 5, borderSkipped: false, maxBarThickness: 26 },
        { type: 'line', data: months.map((m) => byMonth.get(m).orders), yAxisID: 'y1', order: 1, borderColor: PAL.warm, borderWidth: 2, tension: 0.3, pointRadius: 2.5, pointBackgroundColor: '#fff', pointBorderColor: PAL.warm },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        crosshair: { enabled: true },
        tooltip: { displayColors: true, callbacks: {
          title: (it) => mnDate(months[it[0].dataIndex]),
          label: (ct) => (ct.datasetIndex === 0 ? ` Дүн: ${fmtT(ct.parsed.y)}` : ` Захиалга: ${fmtNum(ct.parsed.y)}`),
          labelColor: (ct) => { const col = ct.datasetIndex === 0 ? PAL.brand : PAL.warm; return { borderColor: col, backgroundColor: col }; },
        } },
      },
      scales: { x: catAxis(), y: moneyAxis({ grace: '10%' }), y1: countAxis({ position: 'right', grace: '30%', suggestedMax: 2 }) },
    },
  });

  const ot = $('#cuOrders', root);
  if (ot) bindRowLinks(ot);

  const blk = $('#cuBlocked', root);
  blk.addEventListener('change', () => {
    const want = blk.checked;
    blk.checked = !want;
    confirmModal(want ? 'Хэрэглэгч хаах' : 'Хэрэглэгч нээх',
      want
        ? `<p><b>${esc(c.name || 'Хэрэглэгч')}</b>-ийг хаах уу? Идэвхтэй нэвтрэлт нь салгагдаж, дахин нэвтрэх боломжгүй болно.</p>`
        : `<p><b>${esc(c.name || 'Хэрэглэгч')}</b>-ийн эрхийг сэргээх үү?</p>`,
      {
        yes: want ? 'Хаах' : 'Нээх',
        danger: want,
        onYes: async () => {
          await api(`/api/admin/customers/${c.id}`, { method: 'PATCH', body: { is_blocked: want } });
          toast(want ? 'Хэрэглэгч хаагдлаа' : 'Хэрэглэгчийн эрх сэргээгдлээ');
          customerDetail(root, ctx, id).catch((e) => toast(e.message, 'err'));
        },
      });
  });
}
