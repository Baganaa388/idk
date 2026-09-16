// Хяналтын самбар
'use strict';

const ORDER_STATUS_COLORS = { pending: PAL.warm, processing: PAL.mid, shipped: PAL.light, delivered: PAL.dark, cancelled: '#D3D9D5' };

// Орлогын графикийн хугацааны сонголт
const DASH_RANGES = {
  d30: { label: '30 өдөр', period: 'day', from: (t) => addDays(t, -29), prevLabel: 'өмнөх 30 өдрөөс' },
  w12: { label: '12 долоо хоног', period: 'week', from: (t) => addDays(t, -83), prevLabel: 'өмнөх 12 долоо хоногоос' },
  m12: { label: '12 сар', period: 'month', from: (t) => `${addDays(`${t.slice(0, 7)}-01`, -334).slice(0, 7)}-01`, prevLabel: 'өмнөх 12 сараас' },
};

Views.dashboard = async (root, ctx) => {
  const today = todayStr();
  const [d, ext, oc] = await Promise.all([
    api('/api/admin/dashboard'),
    api(`/api/admin/analytics/sales?period=day&from=${addDays(today, -69)}&to=${today}`),
    api('/api/admin/orders?limit=1'),
  ]);
  if (!ctx.alive()) return;
  setBadges(d);
  const r = d.retention;

  // Өдрийн цуваанаас харьцуулалт
  const byDay = new Map(ext.series.map((x) => [x.key, x]));
  const day = (k) => byDay.get(k) || { revenue: 0, orders: 0 };
  const yesterday = day(addDays(today, -1));
  const dom = Number(today.slice(8));
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const prevMonthLen = Number(addDays(monthStart, -1).slice(8));
  const sumRange = (from, n) => {
    let rev = 0; let ord = 0;
    for (let i = 0; i < n; i++) { const x = day(addDays(from, i)); rev += x.revenue; ord += x.orders; }
    return { revenue: rev, orders: ord };
  };
  const prevMtd = sumRange(prevMonthStart, Math.min(dom, prevMonthLen));
  const last14 = ext.series.slice(-14).map((x) => x.revenue);
  const mtdSeries = ext.series.filter((x) => x.key >= monthStart).map((x) => x.revenue);

  const counts = oc.counts || {};
  const totalOrders = Object.values(counts).reduce((a, b) => a + b, 0);
  const topMax = Math.max(1, ...d.top_products.map((p) => p.qty));

  root.innerHTML = `
    ${App.paymentMode === 'mock' ? `<div class="notice">${ICONS.info}<span>QPay туршилтын горимд ажиллаж байна. Бодит төлбөр авахын тулд мерчант мэдээллээ <a href="#/settings">тохируулна уу</a>.</span></div>` : ''}

    <div class="stats">
      <div class="card stat stat--spark">
        <span class="stat__label">Өнөөдрийн орлого</span>
        <span class="stat__value num" data-count="${d.today.revenue}" data-fmt="t">${fmtT(d.today.revenue)}</span>
        <span class="stat__sub num">${deltaChip(d.today.revenue, yesterday.revenue)} өчигдрөөс · ${fmtNum(d.today.orders)} захиалга</span>
        <div class="stat__spark"><canvas id="spToday" aria-label="Сүүлийн 14 өдрийн орлого"></canvas></div>
      </div>
      <div class="card stat stat--spark">
        <span class="stat__label">Энэ сарын орлого</span>
        <span class="stat__value num" data-count="${d.month.revenue}" data-fmt="t">${fmtT(d.month.revenue)}</span>
        <span class="stat__sub num">${deltaChip(d.month.revenue, prevMtd.revenue)} өмнөх сарын мөн үеэс · ${fmtNum(d.month.orders)} захиалга</span>
        <div class="stat__spark"><canvas id="spMonth" aria-label="Энэ сарын өдрийн орлого"></canvas></div>
      </div>
      <a class="card stat${d.counts.to_process ? ' stat--warn' : ''}" href="#/orders?status=pending&payment_status=paid">
        <span class="stat__ic">${ICONS.box}</span>
        <span class="stat__label">Бэлтгэх захиалга</span>
        <span class="stat__value num" data-count="${d.counts.to_process || 0}">${fmtNum(d.counts.to_process)}</span>
        <span class="stat__sub num">Бэлтгэгдэж буй ${fmtNum(d.counts.processing)} · Илгээгдсэн ${fmtNum(d.counts.shipped)}</span>
      </a>
      <a class="card stat" href="#/orders?status=pending&payment_status=pending">
        <span class="stat__ic">${ICONS.clock}</span>
        <span class="stat__label">Төлбөр хүлээгдэж буй</span>
        <span class="stat__value num" data-count="${d.counts.awaiting_payment || 0}">${fmtNum(d.counts.awaiting_payment)}</span>
        <span class="stat__sub">QPay нэхэмжлэх төлөгдөөгүй</span>
      </a>
      <a class="card stat${d.low_stock_count ? ' stat--red' : ''}" href="#/inventory">
        <span class="stat__ic">${ICONS.warehouse}</span>
        <span class="stat__label">Нөөц дуусаж буй</span>
        <span class="stat__value num" data-count="${d.low_stock_count}">${fmtNum(d.low_stock_count)}</span>
        <span class="stat__sub num">Идэвхтэй ${fmtNum(d.products)} бараанаас</span>
      </a>
      <a class="card stat" href="#/customers">
        <span class="stat__ic">${ICONS.users}</span>
        <span class="stat__label">Хэрэглэгч</span>
        <span class="stat__value num" data-count="${d.customers}">${fmtNum(d.customers)}</span>
        <span class="stat__sub">Энэ сард <b class="num">+${fmtNum(d.new_customers_month)}</b> шинэ</span>
      </a>
    </div>

    <div class="grid-23">
      <div class="card">
        <div class="card__head">
          <div>
            <h2>Орлого ба захиалга</h2>
            <p class="card__sub num" id="revSummary">&nbsp;</p>
          </div>
          <div class="spacer"></div>

        </div>
        <div class="card__body">
          <div class="chart-toolbar">
            <div class="chart-legend">
              <span><i style="background:${PAL.brand}"></i>Орлого (₮)</span>
              <span><i style="background:${PAL.light}"></i>Захиалгын тоо</span>
            </div>
  <div class="seg seg--inline seg--sm" id="revRange">
            ${Object.entries(DASH_RANGES).map(([k, v]) => `<button type="button" data-r="${k}" class="${k === 'd30' ? 'active' : ''}">${v.label}</button>`).join('')}
          </div>
          </div>
          <div class="chart-box"><canvas id="chRev" aria-label="Орлогын график"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card__head">
          <h2>Захиалгын төлөв</h2>
          <div class="spacer"></div>
          <a class="btn btn--soft btn--sm" href="#/orders">Бүгд</a>
        </div>
        <div class="card__body">
          ${totalOrders ? `
          <div class="chart-box chart-box--donut"><canvas id="chStatus" aria-label="Захиалгын төлөвийн харьцаа"></canvas></div>
          <div class="legend legend--rows">
            ${Object.keys(ORDER_STATUS).map((s) => `
              <a class="legend__item" href="#/orders?status=${s}">
                <i style="background:${ORDER_STATUS_COLORS[s]}"></i><span>${ORDER_STATUS[s][0]}</span>
                <b class="num">${fmtNum(counts[s] || 0)}</b><em class="num">${totalOrders ? Math.round(((counts[s] || 0) / totalOrders) * 100) : 0}%</em>
              </a>`).join('')}
          </div>` : emptyBox('Захиалга алга байна', 'receipt')}
        </div>
      </div>
    </div>

    <div class="grid-23">
      <div class="card">
        <div class="card__head">
          <h2>Сүүлийн захиалгууд</h2>
          <div class="spacer"></div>
          <a class="btn btn--soft btn--sm" href="#/orders">Бүгдийг харах</a>
        </div>
        <div class="card__body--flush tbl-wrap">
          ${d.recent_orders.length ? `
          <table class="tbl tbl--click" id="recentTbl">
            <thead><tr><th>Дугаар</th><th>Хэрэглэгч</th><th class="r">Дүн</th><th>Төлөв</th><th>Төлбөр</th></tr></thead>
            <tbody>
              ${d.recent_orders.map((o) => `
                <tr data-href="#/orders/${o.id}">
                  <td class="strong nowrap"><a href="#/orders/${o.id}">${esc(o.order_no)}</a><div class="sub num">${fmtDT(o.created_at)}</div></td>
                  <td>${esc(o.customer_name)}</td>
                  <td class="r strong num nowrap">${fmtT(o.total)}</td>
                  <td>${statusChip(o.status)}</td>
                  <td>${payChip(o.payment_status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : emptyBox('Захиалга алга байна', 'receipt')}
        </div>
      </div>
      <div class="col">
        <div class="card">
          <div class="card__head"><h2>Их зарагдсан бараа</h2><div class="spacer"></div><span class="hint">30 өдөр</span></div>
          <div class="card__body--flush">
            ${d.top_products.length ? `<div class="list">${d.top_products.map((p, i) => `
              <${p.product_id ? `a href="#/products/${p.product_id}"` : 'div'} class="list__item">
                <span class="rank${i === 0 ? ' rank--1' : ''} num">${i + 1}</span>
                ${thumb(p.image, 'thumb--sm')}
                <div class="list__main">
                  <b>${esc(p.name)}</b>
                  <span class="minibar"><i style="--w:${Math.round((p.qty / topMax) * 100)}%"></i></span>
                </div>
                <div class="list__end"><b class="num">${fmtT(p.revenue)}</b><span class="num">${fmtNum(p.qty)} ширхэг</span></div>
              </${p.product_id ? 'a' : 'div'}>`).join('')}</div>`
            : emptyBox('Энэ хугацаанд борлуулалт алга')}
          </div>
        </div>
        <div class="card">
          <div class="card__head">
            <h2>Нөөц дуусаж буй</h2>
            <div class="spacer"></div>
            ${d.low_stock_count ? `<span class="chip chip--red num">${fmtNum(d.low_stock_count)}</span>` : ''}
          </div>
          <div class="card__body--flush">
            ${d.low_stock.length ? `<div class="list">${d.low_stock.map((p) => `
              <a class="list__item" href="#/products/${p.id}">
                ${thumb(p.image, 'thumb--sm')}
                <div class="list__main"><b>${esc(p.name)}</b>${stockBar(p.stock, p.low_stock_threshold)}</div>
                ${stockChip(p.stock, p.low_stock_threshold)}
              </a>`).join('')}</div>
              ${d.low_stock_count > d.low_stock.length ? `<div style="padding:8px 20px 12px"><a href="#/inventory">Бүгдийг харах (${fmtNum(d.low_stock_count)})</a></div>` : ''}`
            : `<div class="empty empty--sm">${ICONS.check}<p>Бүх барааны нөөц хангалттай</p></div>`}
          </div>
        </div>
        <a class="card card--link card__pad retention-mini" href="#/analytics">
          <div>
            <span class="stat__label">Эргэн худалдан авалт</span>
            <div class="retention-mini__rate num" data-count="${r.retention_rate}" data-fmt="pct">${r.retention_rate}%</div>
            <p class="hint">12 сард ${fmtNum(r.buyers)} худалдан авагчийн ${fmtNum(r.repeat_buyers)} нь дахин авсан</p>
          </div>
          <div class="chart-box" style="height:92px;width:92px"><canvas id="chRet" aria-label="Эргэн худалдан авалт"></canvas></div>
        </a>
      </div>
    </div>`;

  bindRowLinks($('#recentTbl', root) || root.firstElementChild);
  sparkline($('#spToday', root), last14, PAL.brand);
  sparkline($('#spMonth', root), mtdSeries.length > 1 ? mtdSeries : ext.series.slice(-30).map((x) => x.revenue), PAL.mid);

  if (totalOrders) {
    const keys = Object.keys(ORDER_STATUS);
    makeChart($('#chStatus', root), {
      type: 'doughnut',
      data: {
        labels: keys.map((k) => ORDER_STATUS[k][0]),
        datasets: [{ data: keys.map((k) => counts[k] || 0), backgroundColor: keys.map((k) => ORDER_STATUS_COLORS[k]), borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }],
      },
      options: {
        maintainAspectRatio: false, cutout: '70%',
        plugins: {
          centerText: { value: fmtNum(totalOrders), label: 'захиалга' },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} (${Math.round((c.parsed / totalOrders) * 100)}%)` } },
        },
      },
    });
  }

  makeChart($('#chRet', root), {
    type: 'doughnut',
    data: { datasets: [{ data: [r.repeat_buyers, Math.max(0, r.buyers - r.repeat_buyers)], backgroundColor: [PAL.brand, '#E6ECE8'], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: '72%', events: [], plugins: { tooltip: { enabled: false } } },
  });

  /* ---- Орлогын график ---- */
  let revChart = null;
  const loadRevenue = async (key) => {
    const R = DASH_RANGES[key];
    const from = R.from(today);
    const len = daysBetween(from, today) + 1;
    const prevTo = addDays(from, -1);
    const [cur, prev] = await Promise.all([
      key === 'd30' ? Promise.resolve({ ...ext, period: 'day', from, series: ext.series.filter((x) => x.key >= from), totals: null }) : api(`/api/admin/analytics/sales${qs({ period: R.period, from, to: today })}`),
      key === 'd30' ? Promise.resolve(null) : api(`/api/admin/analytics/sales${qs({ period: R.period, from: addDays(prevTo, -(len - 1)), to: prevTo })}`),
    ]);
    if (!ctx.alive()) return;
    const series = cur.series;
    const tot = series.reduce((a, x) => ({ revenue: a.revenue + x.revenue, orders: a.orders + x.orders }), { revenue: 0, orders: 0 });
    const prevRev = prev ? prev.totals.revenue : sumRange(addDays(from, -30), 30).revenue;
    $('#revSummary', root).innerHTML = `<b>${fmtT(tot.revenue)}</b> · ${fmtNum(tot.orders)} захиалга · ${deltaChip(tot.revenue, prevRev)} ${R.prevLabel}`;

    const labelOf = (k) => (R.period === 'month' ? `${Number(k.slice(5))}-р сар` : shortDate(k));
    const titleOf = (k) => (R.period === 'month' ? mnDate(k) : R.period === 'week' ? `${mnDate(k, { weekday: false })}-ны 7 хоног` : mnDate(k));
    const sparse = isSparse(series.map((x) => x.revenue));
    if (revChart) { revChart.destroy(); charts = charts.filter((c) => c !== revChart); }
    revChart = makeChart($('#chRev', root), {
      type: 'bar',
      data: {
        labels: series.map((x) => labelOf(x.key)),
        datasets: [
          sparse ? {
            type: 'bar', label: 'Орлого', data: series.map((x) => x.revenue), yAxisID: 'y', order: 1,
            backgroundColor: PAL.brand, hoverBackgroundColor: PAL.dark, borderRadius: 5, borderSkipped: false, maxBarThickness: 18,
          } : {
            type: 'line', label: 'Орлого', data: series.map((x) => x.revenue), yAxisID: 'y', order: 1,
            borderColor: PAL.brand, borderWidth: 2.2, tension: 0.35, cubicInterpolationMode: 'monotone',
            fill: 'origin', backgroundColor: alpha(PAL.brand, 0.09),
            pointRadius: series.map((x) => (x.revenue > 0 && (sparse || series.length <= 14) ? 3.5 : 0)),
            pointBackgroundColor: '#fff', pointBorderColor: PAL.brand, pointBorderWidth: 2,
            pointHoverRadius: 5.5, pointHoverBackgroundColor: PAL.brand, pointHoverBorderColor: '#fff',
          },
          {
            type: sparse ? 'line' : 'bar', label: 'Захиалга', data: series.map((x) => x.orders), yAxisID: 'y1', order: sparse ? 0 : 2,
            backgroundColor: sparse ? PAL.light : alpha(PAL.light, 0.55), hoverBackgroundColor: PAL.light, borderRadius: 4, maxBarThickness: 16,
            showLine: false, pointRadius: series.map((x) => (sparse && x.orders > 0 ? 4 : 0)), pointBorderColor: '#fff', pointBorderWidth: 1.5,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          crosshair: { enabled: true },
          tooltip: {
            displayColors: true,
            callbacks: {
              title: (it) => titleOf(series[it[0].dataIndex].key),
              label: (c) => (c.dataset.yAxisID === 'y' ? ` Орлого: ${fmtT(c.parsed.y)}` : ` Захиалга: ${fmtNum(c.parsed.y)}`),
              labelColor: (c) => ({ borderColor: c.dataset.yAxisID === 'y' ? PAL.brand : PAL.light, backgroundColor: c.dataset.yAxisID === 'y' ? PAL.brand : PAL.light }),
            },
          },
        },
        scales: {
          x: catAxis({ ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 18, color: PAL.axis } }),
          y: moneyAxis({ grace: '12%' }),
          y1: countAxis({ position: 'right', grace: '40%' }),
        },
      },
    });
  };
  $('#revRange', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || b.classList.contains('active')) return;
    $$('#revRange button', root).forEach((x) => x.classList.toggle('active', x === b));
    loadRevenue(b.dataset.r).catch((er) => toast(er.message, 'err'));
  });
  const startKey = isSparse(ext.series.slice(-30).map((x) => x.revenue)) ? 'w12' : 'd30';
  $$('#revRange button', root).forEach((x) => x.classList.toggle('active', x.dataset.r === startKey));
  await loadRevenue(startKey);
};
