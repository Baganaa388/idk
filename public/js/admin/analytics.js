// Дата анализ — борлуулалт, өмнөх үетэй харьцуулалт, шилдэг бараа, эргэн худалдан авалт
'use strict';

const periodLabel = (key, period) => {
  if (period === 'month') return key.replace('-', '.');
  if (period === 'week') return `${shortDate(key)}-ны 7 хоног`;
  return shortDate(key);
};
const periodTitle = (key, period) => {
  if (period === 'month') return mnDate(key);
  if (period === 'week') return `${mnDate(key, { weekday: false })}-ны 7 хоног`;
  return mnDate(key);
};

Views.analytics = async (root, ctx) => {
  const p = ctx.params;
  const f = {
    period: ['day', 'week', 'month'].includes(p.get('period')) ? p.get('period') : 'day',
    from: p.get('from') || '', to: p.get('to') || '', userRange: !!(p.get('from') || p.get('to')),
  };
  let topMetric = 'qty';

  root.innerHTML = `
    <div class="card toolbar">
      <div class="seg seg--inline" id="anPeriod">
        ${[['day', 'Өдөр'], ['week', 'Долоо хоног'], ['month', 'Сар']].map(([k, l]) => `<button type="button" data-p="${k}" class="${f.period === k ? 'active' : ''}">${l}</button>`).join('')}
      </div>
      <div class="filters__dates">
        <input class="input" type="date" id="anFrom" aria-label="Эхлэх огноо">
        <span class="muted">—</span>
        <input class="input" type="date" id="anTo" aria-label="Дуусах огноо">
      </div>
      <button class="btn btn--ghost btn--sm" id="anReset" type="button">Анхдагч хугацаа</button>
      <div class="spacer"></div>
      <a class="btn btn--ghost" id="anCsv" download>${ICONS.download}CSV татах</a>
    </div>
    <div id="anBody" class="col">${skelPage('dashboard')}</div>`;

  const load = async () => {
    const s = await api(`/api/admin/analytics/sales${qs({ period: f.period, from: f.from, to: f.to })}`);
    const len = daysBetween(s.from, s.to) + 1;
    const prevTo = addDays(s.from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    const [prev, top, ret] = await Promise.all([
      api(`/api/admin/analytics/sales${qs({ period: s.period, from: prevFrom, to: prevTo })}`),
      api(`/api/admin/analytics/top-products${qs({ from: s.from, to: s.to, limit: 10 })}`),
      api(`/api/admin/analytics/retention${qs({ from: f.from, to: f.to })}`),
    ]);
    if (!ctx.alive()) return;
    destroyCharts();
    $('#anFrom', root).value = s.from;
    $('#anTo', root).value = s.to;
    syncHashQuery('analytics', { period: f.period === 'day' ? '' : f.period, from: f.userRange ? f.from : '', to: f.userRange ? f.to : '' });
    $('#anCsv', root).href = `/api/admin/analytics/sales.csv${qs({ period: s.period, from: s.from, to: s.to })}`;
    const T = s.totals;
    const P = prev.totals;
    const periodName = { day: 'өдрөөр', week: 'долоо хоногоор', month: 'сараар' }[s.period];
    const discPct = T.gross ? Math.round((T.discounts / T.gross) * 1000) / 10 : 0;
    const stat = (label, key, fmt, cur, prv, sub = '') => `
      <div class="card stat">
        <span class="stat__label">${label}</span>
        <span class="stat__value num" data-count="${cur}" data-fmt="${fmt}">${fmt === 't' ? fmtT(cur) : fmtNum(cur)}</span>
        <span class="stat__sub num">${deltaChip(cur, prv)} ${sub || 'өмнөх үеэс'}</span>
      </div>`;

    $('#anBody', root).innerHTML = `
      <div class="compare-note hint">${ICONS.repeat}<span>Харьцуулалт: <b>${fmtDate(s.from)} — ${fmtDate(s.to)}</b> ба өмнөх ижил хугацаа <b>${fmtDate(prevFrom)} — ${fmtDate(prevTo)}</b> (${fmtNum(len)} хоног)</span></div>
      <div class="stats stats--5">
        ${stat('Орлого', 'revenue', 't', T.revenue, P.revenue)}
        ${stat('Захиалга', 'orders', 'n', T.orders, P.orders)}
        ${stat('Дундаж захиалга', 'avg', 't', T.avg_order, P.avg_order)}
        ${stat('Олгосон хямдрал', 'disc', 't', T.discounts, P.discounts, `· нийт дүнгийн ${discPct}%`)}
        ${stat('Зарагдсан ширхэг', 'units', 'n', T.units, P.units)}
      </div>

      <div class="card">
        <div class="card__head">
          <div><h2>Орлого ${periodName}</h2><p class="card__sub num">${fmtDate(s.from)} — ${fmtDate(s.to)}</p></div>
          <div class="spacer"></div>
          <div class="chart-legend">
            <span><i style="background:${PAL.brand}"></i>Орлого</span>
            <span><i class="line" style="background:${PAL.warm}"></i>Захиалга</span>
            <span><i class="dash" style="border-color:${PAL.light}"></i>Өмнөх үеийн орлого</span>
          </div>
        </div>
        <div class="card__body">${T.orders || P.orders ? '<div class="chart-box chart-box--lg"><canvas id="anRev" aria-label="Орлогын график"></canvas></div>' : `<div class="empty empty--chart">${ICONS.chart}<p>Сонгосон хугацаанд төлөгдсөн захиалга алга</p><span class="hint">Өөр хугацаа сонгож үзнэ үү</span></div>`}</div>
      </div>

      <div class="grid-23">
        <div class="card">
          <div class="card__head">
            <h2>Хамгийн их зарагдсан бараа</h2>
            <div class="spacer"></div>
            <div class="seg seg--inline seg--sm" id="topMetric">
              <button type="button" data-m="qty" class="active">Ширхэгээр</button>
              <button type="button" data-m="revenue">Орлогоор</button>
            </div>
          </div>
          <div class="card__body--flush" id="topList"></div>
        </div>
        <div class="card">
          <div class="card__head"><h2>Эргэн худалдан авалт</h2></div>
          <div class="card__body">
            ${ret.buyers ? `
            <div class="chart-box chart-box--donut"><canvas id="anDist" aria-label="Худалдан авалтын давтамж"></canvas></div>
            <div class="legend legend--rows">
              ${[['1 удаа авсан', ret.distribution['1'], PAL.light], ['2 удаа авсан', ret.distribution['2'], PAL.mid], ['3 ба түүнээс олон', ret.distribution['3+'], PAL.dark]]
                .map(([l, n, c]) => `<div class="legend__item"><i style="background:${c}"></i><span>${l}</span><b class="num">${fmtNum(n)}</b><em class="num">${Math.round((n / ret.buyers) * 100)}%</em></div>`).join('')}
            </div>
            <p class="hint" style="margin-top:12px">${fmtDate(ret.from)} — ${fmtDate(ret.to)}: ${fmtNum(ret.buyers)} худалдан авагчаас ${fmtNum(ret.repeat_buyers)} нь дахин худалдан авсан.</p>`
            : emptyBox('Энэ хугацаанд худалдан авалт алга')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h2>Сарын cohort</h2><div class="spacer"></div><span class="hint">Анх худалдан авсан сараар — хэдэн хувь нь эргэж ирсэн</span></div>
        <div class="card__body--flush tbl-wrap">
          ${ret.cohorts.length ? `
          <table class="tbl cohort">
            <thead><tr><th>Сар</th><th class="r">Шинэ худалдан авагч</th><th class="r">Эргэж ирсэн</th><th class="c">Эргэн ирэлт</th></tr></thead>
            <tbody>
              ${ret.cohorts.map((co) => {
                const h = heatColor(co.rate);
                return `
                <tr>
                  <td class="strong num">${esc(co.month.replace('-', '.'))}</td>
                  <td class="r num">${fmtNum(co.customers)}</td>
                  <td class="r num">${fmtNum(co.returned)}</td>
                  <td class="c"><span class="heat num" style="background:${h.bg};color:${h.fg}">${co.rate}%</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : emptyBox('Энэ хугацаанд өгөгдөл алга')}
        </div>
      </div>`;
    countUp($('#anBody', root));

    const renderTop = () => {
      const box = $('#topList', root);
      if (!top.items.length) { box.innerHTML = emptyBox('Энэ хугацаанд борлуулалт алга', 'chart'); return; }
      const items = [...top.items].sort((a, b) => b[topMetric] - a[topMetric]);
      const max = Math.max(1, ...items.map((x) => x[topMetric]));
      const sum = items.reduce((a, x) => a + x[topMetric], 0) || 1;
      box.innerHTML = `<div class="rank-list">${items.map((x, i) => `
        <${x.product_id ? `a href="#/products/${x.product_id}"` : 'div'} class="rank-row">
          <span class="rank${i === 0 ? ' rank--1' : ''} num">${i + 1}</span>
          ${thumb(x.image)}
          <div class="rank-row__main">
            <div class="rank-row__top"><b>${esc(x.name)}</b><span class="num">${topMetric === 'qty' ? `${fmtNum(x.qty)} ширхэг` : fmtT(x.revenue)}</span></div>
            <span class="hbar"><i style="--w:${Math.max(2, Math.round((x[topMetric] / max) * 100))}%"></i></span>
            <div class="rank-row__sub num">${esc(x.sku)} · ${fmtNum(x.orders)} захиалга · ${topMetric === 'qty' ? fmtT(x.revenue) : `${fmtNum(x.qty)} ширхэг`} · ${Math.round((x[topMetric] / sum) * 100)}%</div>
          </div>
        </${x.product_id ? 'a' : 'div'}>`).join('')}</div>`;
    };
    renderTop();
    $('#topMetric', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      topMetric = b.dataset.m;
      $$('#topMetric button', root).forEach((x) => x.classList.toggle('active', x === b));
      renderTop();
    });

    const series = s.series;
    const prevSeries = prev.series;
    makeChart($('#anRev', root), {
      type: 'bar',
      data: {
        labels: series.map((x) => periodLabel(x.key, s.period)),
        datasets: [
          {
            type: 'bar', label: 'Орлого', data: series.map((x) => x.revenue), yAxisID: 'y', order: 3,
            backgroundColor: alpha(PAL.brand, 0.88), hoverBackgroundColor: PAL.dark, borderRadius: 6, borderSkipped: false,
            maxBarThickness: 34, categoryPercentage: 0.72,
          },
          {
            type: 'line', label: 'Өмнөх үе', data: series.map((_, i) => (prevSeries[i] ? prevSeries[i].revenue : null)), yAxisID: 'y', order: 2,
            borderColor: PAL.light, borderWidth: 2, borderDash: [5, 4], pointRadius: 0, showLine: !isSparse(prevSeries.map((x) => x.revenue)), pointHoverRadius: 4, cubicInterpolationMode: 'monotone', fill: false,
          },
          {
            type: 'line', label: 'Захиалга', data: series.map((x) => x.orders), yAxisID: 'y1', order: 1, showLine: !isSparse(series.map((x) => x.orders)),
            borderColor: PAL.warm, backgroundColor: PAL.warm, borderWidth: 2, tension: 0.3, cubicInterpolationMode: 'monotone',
            pointRadius: series.map((x) => (isSparse(series.map((y) => y.orders)) ? (x.orders > 0 ? 4 : 0) : series.length > 45 ? 0 : 2.5)), pointBackgroundColor: '#fff', pointBorderWidth: 1.8, pointHoverRadius: 5,
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
              title: (it) => periodTitle(series[it[0].dataIndex].key, s.period),
              label: (c) => {
                if (c.datasetIndex === 0) return ` Орлого: ${fmtT(c.parsed.y)}`;
                if (c.datasetIndex === 1) {
                  const pk = prevSeries[c.dataIndex];
                  return pk ? ` Өмнөх үе (${periodLabel(pk.key, s.period)}): ${fmtT(c.parsed.y)}` : null;
                }
                return ` Захиалга: ${fmtNum(c.parsed.y)}`;
              },
              labelColor: (c) => {
                const col = [PAL.brand, PAL.light, PAL.warm][c.datasetIndex];
                return { borderColor: col, backgroundColor: col };
              },
            },
          },
        },
        scales: {
          x: catAxis(),
          y: moneyAxis({ grace: '8%' }),
          y1: countAxis({ position: 'right', grace: '25%' }),
        },
      },
    });

    if (ret.buyers) {
      makeChart($('#anDist', root), {
        type: 'doughnut',
        data: {
          labels: ['1 удаа', '2 удаа', '3+ удаа'],
          datasets: [{ data: [ret.distribution['1'], ret.distribution['2'], ret.distribution['3+']], backgroundColor: [PAL.light, PAL.mid, PAL.dark], borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
        },
        options: {
          maintainAspectRatio: false, cutout: '70%',
          plugins: {
            centerText: { value: `${ret.retention_rate}%`, label: 'дахин авсан', size: 24 },
            tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} хэрэглэгч` } },
          },
        },
      });
    }
  };

  const reload = () => {
    $('#anBody', root).classList.add('is-loading');
    load().catch((e) => toast(e.message, 'err')).finally(() => { const b = $('#anBody', root); if (b) b.classList.remove('is-loading'); });
  };
  $('#anPeriod', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    f.period = b.dataset.p;
    $$('#anPeriod button', root).forEach((x) => x.classList.toggle('active', x === b));
    if (!f.userRange) { f.from = ''; f.to = ''; }
    reload();
  });
  const onDate = () => {
    f.from = $('#anFrom', root).value;
    f.to = $('#anTo', root).value;
    f.userRange = true;
    reload();
  };
  $('#anFrom', root).addEventListener('change', onDate);
  $('#anTo', root).addEventListener('change', onDate);
  $('#anReset', root).onclick = () => { f.from = ''; f.to = ''; f.userRange = false; reload(); };
  await load();
};
