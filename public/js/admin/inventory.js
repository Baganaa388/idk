// Агуулах — нөөцийн анхааруулга, хөдөлгөөн бүртгэх, түүх
'use strict';

/* ================= Хөдөлгөөн бүртгэх modal ================= */
// product: { id, name, sku, stock, low_stock_threshold, image } эсвэл null (сонгогчтой)
function openStockModal({ product = null, type = 'in', onDone } = {}) {
  let prod = product;
  let mtype = type;

  openModal('Агуулахын хөдөлгөөн', `
    <form id="smForm" class="form-grid" novalidate>
      <div id="smProduct"></div>
      <div class="field">
        <span class="field__label">Төрөл</span>
        <div class="seg" id="smType">
          <button type="button" data-t="in">Орлого</button>
          <button type="button" data-t="out">Зарлага</button>
          <button type="button" data-t="adjust">Тооллого</button>
        </div>
      </div>
      <div class="field">
        <label for="smQty" id="smQtyLabel">Тоо ширхэг</label>
        <input class="input num" id="smQty" type="number" min="0" step="1" inputmode="numeric">
        <span class="hint" id="smHint"></span>
      </div>
      <div class="stock-preview" id="smPreview"></div>
      <div class="field">
        <label for="smReason">Тайлбар / шалтгаан</label>
        <input class="input" id="smReason" maxlength="200" placeholder="Жиш: Нийлүүлэгчээс ирсэн">
      </div>
      <p class="error-text" id="smErr" hidden></p>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" id="smCancel">Болих</button>
        <button class="btn btn--primary" type="submit" id="smSave">Бүртгэх</button>
      </div>
    </form>`);

  const renderProduct = () => {
    const box = $('#smProduct');
    if (prod) {
      box.innerHTML = `
        <div class="picked">
          ${thumb(prod.image)}
          <div class="picked__main"><b>${esc(prod.name)}</b><span>${esc(prod.sku)} · одоогийн үлдэгдэл <b class="num">${fmtNum(prod.stock)}</b></span></div>
          ${product ? '' : '<button type="button" class="btn btn--ghost btn--sm" id="smChange">Солих</button>'}
        </div>`;
      const ch = $('#smChange');
      if (ch) ch.onclick = () => { prod = null; renderProduct(); preview(); };
    } else {
      box.innerHTML = `
        <div class="field">
          <label for="smSearch">Бараа сонгох</label>
          <div class="search">${ICONS.search}<input class="input" id="smSearch" placeholder="Нэр эсвэл SKU-аар хайх…" autocomplete="off"></div>
        </div>
        <div class="picker-list" id="smList" style="margin-top:8px"><div class="loading" style="padding:16px">Ачаалж байна…</div></div>`;
      const search = async (q) => {
        try {
          const d = await api(`/api/admin/products${qs({ q, limit: 20, sort: 'name' })}`);
          const list = $('#smList');
          if (!list) return;
          list.innerHTML = d.items.length
            ? d.items.map((x) => `
              <button type="button" data-pick="${x.id}">
                ${thumb(x.image, 'thumb--sm')}
                <span style="flex:1;min-width:0"><b style="font-weight:600;display:block">${esc(x.name)}</b><span class="hint">${esc(x.sku)}</span></span>
                ${stockChip(x.stock, x.low_stock_threshold)}
              </button>`).join('')
            : '<div class="empty" style="padding:16px"><p>Бараа олдсонгүй</p></div>';
          list._items = d.items;
        } catch (e) { toast(e.message, 'err'); }
      };
      $('#smSearch').addEventListener('input', debounce((e) => search(e.target.value.trim()), 250));
      $('#smList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        prod = $('#smList')._items.find((x) => x.id === +b.dataset.pick);
        renderProduct();
        preview();
        $('#smQty').focus();
      });
      search('');
      setTimeout(() => $('#smSearch') && $('#smSearch').focus(), 40);
    }
  };

  const preview = () => {
    const el = $('#smPreview');
    const v = $('#smQty').value;
    if (!prod || v === '') { el.innerHTML = ''; return; }
    const n = Math.max(0, Math.floor(Number(v) || 0));
    const after = mtype === 'in' ? prod.stock + n : mtype === 'out' ? prod.stock - n : n;
    const change = after - prod.stock;
    el.innerHTML = `<span>Үлдэгдэл:</span> <b class="num">${fmtNum(prod.stock)}</b> ${ICONS.arrow} <b class="num" style="color:${after < 0 ? 'var(--red-600)' : 'inherit'}">${fmtNum(after)}</b>
      <span class="num ${change >= 0 ? 'chg-plus' : 'chg-minus'}">(${change > 0 ? '+' : ''}${fmtNum(change)})</span>
      ${after < 0 ? '<span class="error-text">Үлдэгдэл хүрэлцэхгүй</span>' : ''}`;
  };

  const setType = (t) => {
    mtype = t;
    $$('#smType button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    $('#smQtyLabel').textContent = t === 'adjust' ? 'Тоолсон бодит үлдэгдэл' : 'Тоо ширхэг';
    $('#smHint').textContent = {
      in: 'Агуулахад орж ирсэн тоо ширхэг нэмэгдэнэ',
      out: 'Гэмтэл, хэрэглээ зэргээр хасагдах тоо ширхэг',
      adjust: 'Тоолж гарсан бодит тоогоор үлдэгдлийг залруулна',
    }[t];
    $('#smReason').placeholder = { in: 'Жиш: Нийлүүлэгчээс ирсэн', out: 'Жиш: Гэмтэлтэй бараа', adjust: 'Жиш: Сарын тооллого' }[t];
    preview();
  };

  renderProduct();
  setType(mtype);
  if (prod) setTimeout(() => $('#smQty').focus(), 40);
  $('#smType').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setType(b.dataset.t); });
  $('#smQty').addEventListener('input', preview);
  $('#smCancel').onclick = closeModal;
  $('#smForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#smErr');
    err.hidden = true;
    const show = (m) => { err.textContent = m; err.hidden = false; };
    if (!prod) return show('Бараа сонгоно уу');
    const raw = $('#smQty').value;
    const n = Math.floor(Number(raw));
    if (raw === '' || !Number.isFinite(n) || n < 0 || (mtype !== 'adjust' && n === 0)) return show(mtype === 'adjust' ? 'Тоолсон үлдэгдлийг оруулна уу' : 'Тоо ширхэг 0-ээс их байх ёстой');
    const body = mtype === 'adjust' ? { type: 'adjust', stock: n } : { type: mtype, qty: n };
    body.reason = $('#smReason').value.trim();
    await withBusy($('#smSave'), async () => {
      try {
        const r = await api(`/api/admin/products/${prod.id}/stock`, { method: 'POST', body });
        closeModal();
        toast(`${prod.name}: үлдэгдэл ${fmtNum(r.stock)}`);
        refreshBadges();
        if (onDone) onDone(r);
      } catch (ex) { show(ex.message); }
    });
  });
}

/* ================= Агуулах хуудас ================= */
Views.inventory = async (root, ctx) => {
  const p = ctx.params;
  const f = { product_id: p.get('product_id') || '', type: p.get('type') || '', from: p.get('from') || '', to: p.get('to') || '', page: 1 };
  const [inv, prods] = await Promise.all([
    api('/api/admin/inventory'),
    api('/api/admin/products?limit=100&sort=name'),
  ]);
  if (!ctx.alive()) return;
  const t = inv.totals;

  root.innerHTML = `
    <div class="stats stats--4">
      <div class="card stat"><span class="stat__ic">${ICONS.box}</span><span class="stat__label">Идэвхтэй бараа</span><span class="stat__value num">${fmtNum(t.products)}</span><span class="stat__sub">төрөл</span></div>
      <div class="card stat"><span class="stat__ic">${ICONS.warehouse}</span><span class="stat__label">Нийт үлдэгдэл</span><span class="stat__value num">${fmtNum(t.units)}</span><span class="stat__sub">ширхэг</span></div>
      <div class="card stat"><span class="stat__ic">${ICONS.coin}</span><span class="stat__label">Нөөцийн үнэлгээ</span><span class="stat__value num">${fmtT(t.stock_value)}</span><span class="stat__sub">зарах үнээр</span></div>
      <div class="card stat${inv.alerts.length ? ' stat--red' : ''}"><span class="stat__ic">${ICONS.alert}</span><span class="stat__label">Анхааруулга</span><span class="stat__value num">${fmtNum(inv.alerts.length)}</span><span class="stat__sub num">${fmtNum(inv.out_of_stock)} нь дууссан</span></div>
    </div>

    <div class="card">
      <div class="card__head">
        <h2>Нөөц дуусаж буй бараа</h2>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="invMove">${ICONS.plus}Хөдөлгөөн бүртгэх</button>
      </div>
      <div class="card__body--flush tbl-wrap" id="invAlerts">
        ${inv.alerts.length ? `
        <table class="tbl">
          <thead><tr><th>Бараа</th><th class="r">Үлдэгдэл</th><th class="r">Босго</th><th>Төлөв</th><th class="r"></th></tr></thead>
          <tbody>
            ${inv.alerts.map((a) => `
              <tr>
                <td><div class="cell-prod">${thumb(a.image)}<div><a href="#/products/${a.id}"><b>${esc(a.name)}</b></a><span class="sub">${esc(a.sku)}</span></div></div></td>
                <td class="r">${stockChip(a.stock, a.low_stock_threshold)}</td>
                <td class="r num muted">${fmtNum(a.low_stock_threshold)}</td>
                <td>${a.stock <= 0 ? '<span class="chip chip--red">Дууссан</span>' : '<span class="chip chip--warn">Бага үлдсэн</span>'}${a.is_active ? '' : ' <span class="chip chip--off">Идэвхгүй</span>'}</td>
                <td class="r"><button class="btn btn--soft btn--sm" data-in="${a.id}">${ICONS.plus}Орлого авах</button></td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="empty">${ICONS.check}<p>Бүх барааны нөөц хангалттай байна</p></div>`}
      </div>
    </div>

    <div class="card">
      <div class="card__head"><h2>Хөдөлгөөний түүх</h2></div>
      <div class="filters">
        <select class="input" id="mvProd" aria-label="Бараа" style="max-width:280px">
          <option value="">Бүх бараа</option>
          ${prods.items.map((x) => `<option value="${x.id}" ${String(x.id) === f.product_id ? 'selected' : ''}>${esc(x.name)} (${esc(x.sku)})</option>`).join('')}
        </select>
        <select class="input" id="mvType" aria-label="Төрөл">
          <option value="">Бүх төрөл</option>
          ${Object.entries(MOVE_TYPES).map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <div class="filters__dates">
          <input class="input" type="date" id="mvFrom" value="${esc(f.from)}" aria-label="Эхлэх огноо">
          <span class="muted">—</span>
          <input class="input" type="date" id="mvTo" value="${esc(f.to)}" aria-label="Дуусах огноо">
        </div>
      </div>
      <div class="card__body--flush tbl-wrap" id="mvTable" style="margin-top:12px"></div>
      <div class="pager" id="mvPager"></div>
    </div>`;

  const reloadAll = () => Views.inventory(root, ctx).catch((e) => toast(e.message, 'err'));
  const alertsById = new Map(inv.alerts.map((a) => [a.id, a]));

  $('#invMove', root).onclick = () => openStockModal({ onDone: reloadAll });
  $('#invAlerts', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-in]');
    if (b) openStockModal({ product: alertsById.get(+b.dataset.in), type: 'in', onDone: reloadAll });
  });

  const load = async () => {
    const d = await api(`/api/admin/stock-movements${qs({ ...f, limit: 30 })}`);
    if (!ctx.alive()) return;
    f.page = d.page;
    $('#mvTable', root).innerHTML = d.items.length ? `
      <table class="tbl">
        <thead><tr><th>Огноо</th><th>Бараа</th><th>Төрөл</th><th class="r">Өөрчлөлт</th><th class="r">Үлдэгдэл</th><th>Тайлбар</th><th>Захиалга</th><th>Хэн</th></tr></thead>
        <tbody>
          ${d.items.map((m) => `
            <tr>
              <td class="num nowrap muted">${fmtDT(m.created_at)}</td>
              <td><a href="#/products/${m.product_id}"><b style="font-weight:600">${esc(m.product_name)}</b></a><div class="sub">${esc(m.sku)}</div></td>
              <td><span class="chip${m.type === 'in' || m.type === 'initial' || m.type === 'import' ? ' chip--ok' : m.type === 'out' || m.type === 'order' ? ' chip--warn' : m.type === 'cancel' ? ' chip--blue' : ''}">${esc(MOVE_TYPES[m.type] || m.type)}</span></td>
              <td class="r num ${m.change > 0 ? 'chg-plus' : 'chg-minus'}">${m.change > 0 ? '+' : ''}${fmtNum(m.change)}</td>
              <td class="r num strong">${fmtNum(m.stock_after)}</td>
              <td style="max-width:260px">${m.reason ? esc(m.reason) : '<span class="muted">—</span>'}</td>
              <td class="nowrap">${m.order_no ? `<a href="#/orders/${m.order_id}">${esc(m.order_no)}</a>` : '<span class="muted">—</span>'}</td>
              <td class="muted">${esc(m.created_by || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : emptyBox('Хөдөлгөөн олдсонгүй', 'warehouse');
    renderPager($('#mvPager', root), d, (pg) => { f.page = pg; load().catch((e) => toast(e.message, 'err')); });
  };
  const reload = () => {
    f.page = 1;
    syncHashQuery('inventory', { product_id: f.product_id, type: f.type, from: f.from, to: f.to });
    load().catch((e) => toast(e.message, 'err'));
  };
  [['#mvProd', 'product_id'], ['#mvType', 'type'], ['#mvFrom', 'from'], ['#mvTo', 'to']].forEach(([sel, key]) =>
    $(sel, root).addEventListener('change', (e) => { f[key] = e.target.value; reload(); }));
  await load();
};
