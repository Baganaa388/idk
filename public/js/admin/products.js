// Барааны удирдлага — жагсаалт (хүснэгт/карт), тойм, нэмэх/засах, зураг
'use strict';

let categoriesCache = null;
async function loadCategories(force = false) {
  if (!categoriesCache || force) categoriesCache = (await api('/api/admin/categories')).categories;
  return categoriesCache;
}

const discountPct = (price, compare) => (Number(compare) > Number(price) && Number(price) >= 0 ? Math.round((1 - price / compare) * 100) : 0);
function priceBlock(price, compare) {
  const off = discountPct(price, compare);
  return `<span class="price"><b class="num">${fmtT(price)}</b>${off ? `<s class="num">${fmtT(compare)}</s><em class="num">−${off}%</em>` : ''}</span>`;
}

Views.products = async (root, ctx) => {
  if (ctx.parts[1]) return productForm(root, ctx, ctx.parts[1] === 'new' ? null : ctx.parts[1]);

  const p = ctx.params;
  const f = {
    q: p.get('q') || '', category: p.get('category') || '', status: p.get('status') || '',
    stock: p.get('stock') || '', sort: p.get('sort') || 'new', page: +p.get('page') || 1,
  };
  let view = prefGet('productsView', window.innerWidth < 640 ? 'grid' : 'table') === 'grid' ? 'grid' : 'table';
  let items = [];
  const cats = await loadCategories(true);
  if (!ctx.alive()) return;

  root.innerHTML = `
    <div class="card">
      <div class="card__head">
        <h2>Бүх бараа</h2>
        <span class="chip num" id="pTotal"></span>
        <div class="spacer"></div>
        <div class="seg seg--inline seg--icons" id="pView" role="group" aria-label="Харагдац">
          <button type="button" data-v="table" class="${view === 'table' ? 'active' : ''}" title="Хүснэгт" aria-label="Хүснэгт">${ICONS.list}</button>
          <button type="button" data-v="grid" class="${view === 'grid' ? 'active' : ''}" title="Карт" aria-label="Карт">${ICONS.grid}</button>
        </div>
        <a class="btn btn--ghost" href="#/import">${ICONS.upload}Импорт</a>
        <a class="btn btn--primary" href="#/products/new">${ICONS.plus}Бараа нэмэх</a>
      </div>
      <div class="filters">
        <div class="search">${ICONS.search}<input class="input" id="pQ" placeholder="Нэр, SKU, брэндээр хайх…" value="${esc(f.q)}"></div>
        <select class="input" id="pCat" aria-label="Категори">${categoryOptions(cats, f.category, { blank: 'Бүх категори' })}</select>
        <select class="input" id="pStatus" aria-label="Төлөв">
          <option value="">Төлөв: бүгд</option>
          <option value="active" ${f.status === 'active' ? 'selected' : ''}>Идэвхтэй</option>
          <option value="inactive" ${f.status === 'inactive' ? 'selected' : ''}>Идэвхгүй</option>
        </select>
        <select class="input" id="pStock" aria-label="Үлдэгдэл">
          <option value="">Үлдэгдэл: бүгд</option>
          <option value="alert" ${f.stock === 'alert' ? 'selected' : ''}>Анхааруулгатай</option>
          <option value="low" ${f.stock === 'low' ? 'selected' : ''}>Бага үлдсэн</option>
          <option value="out" ${f.stock === 'out' ? 'selected' : ''}>Дууссан</option>
        </select>
        <select class="input" id="pSort" aria-label="Эрэмбэ">
          ${[['new', 'Шинэ нь эхэнд'], ['name', 'Нэрээр'], ['price_asc', 'Үнэ: багаас'], ['price_desc', 'Үнэ: ихээс'], ['stock', 'Үлдэгдэл багаас'], ['popular', 'Их зарагдсан']]
            .map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div id="pBody" style="margin-top:12px">${skelRows(6, 6)}</div>
      <div class="pager" id="pPager"></div>
    </div>`;

  const actions = (x) => `
    <div class="row-actions">
      <a class="btn btn--icon btn--sm btn--ghost" href="#/products/${x.id}" title="Засах" aria-label="Засах">${ICONS.pencil}</a>
      <button type="button" class="btn btn--icon btn--sm btn--ghost" data-stock="${x.id}" title="Агуулахын хөдөлгөөн" aria-label="Агуулахын хөдөлгөөн">${ICONS.warehouse}</button>
    </div>`;
  const activeSwitch = (x) => `
    <label class="toggle toggle--sm" title="${x.is_active ? 'Идэвхтэй — дэлгүүрт харагдана' : 'Идэвхгүй'}">
      <input type="checkbox" data-active="${x.id}" ${x.is_active ? 'checked' : ''} aria-label="Идэвхтэй эсэх">
      <span class="toggle__track"></span>
    </label>`;

  const renderTable = (maxStock) => `
    <div class="tbl-wrap">
      <table class="tbl tbl--click tbl--products">
        <thead><tr><th>Бараа</th><th class="r">Үнэ</th><th style="min-width:150px">Үлдэгдэл</th><th class="r">Зарагдсан</th><th class="c">Идэвхтэй</th><th class="c">Онцлох</th><th class="r"></th></tr></thead>
        <tbody>
          ${items.map((x) => `
            <tr data-href="#/products/${x.id}" class="${x.is_active ? '' : 'is-muted'}">
              <td><div class="cell-prod">${thumb(x.image, 'thumb--lg')}<div>
                <a href="#/products/${x.id}"><b>${esc(x.name)}</b></a>
                <span class="sub">${esc(x.sku)}${x.volume ? ` · ${esc(x.volume)}` : ''}</span>
                <span class="sub">${x.category_name ? esc(x.category_name) : 'Категоригүй'}${x.brand ? ` · ${esc(x.brand)}` : ''}</span>
              </div></div></td>
              <td class="r nowrap">${priceBlock(x.price, x.compare_price)}</td>
              <td><div class="stock-cell">${stockChip(x.stock, x.low_stock_threshold)}${stockBar(x.stock, x.low_stock_threshold, maxStock)}</div></td>
              <td class="r num"><b style="font-weight:600">${fmtNum(x.sold)}</b><span class="sub"> ш</span></td>
              <td class="c">${activeSwitch(x)}</td>
              <td class="c"><button type="button" class="star-btn${x.is_featured ? ' on' : ''}" data-feat="${x.id}" title="${x.is_featured ? 'Онцлохоос хасах' : 'Онцлох болгох'}" aria-pressed="${x.is_featured}">${x.is_featured ? ICONS.starFill : ICONS.star}</button></td>
              <td class="r">${actions(x)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const renderGrid = (maxStock) => `
    <div class="pgrid-admin">
      ${items.map((x) => `
        <article class="pcard-admin${x.is_active ? '' : ' is-muted'}" data-href="#/products/${x.id}">
          <div class="pcard-admin__img">
            ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : ICONS.image}
            <span class="pcard-admin__badges">
              ${x.is_active ? '' : '<span class="chip chip--off">Идэвхгүй</span>'}
              ${x.stock <= 0 ? '<span class="chip chip--red">Дууссан</span>' : x.stock <= x.low_stock_threshold ? '<span class="chip chip--warn">Бага үлдсэн</span>' : ''}
            </span>
            <button type="button" class="star-btn star-btn--float${x.is_featured ? ' on' : ''}" data-feat="${x.id}" title="${x.is_featured ? 'Онцлохоос хасах' : 'Онцлох болгох'}" aria-pressed="${x.is_featured}">${x.is_featured ? ICONS.starFill : ICONS.star}</button>
          </div>
          <div class="pcard-admin__body">
            <span class="sub">${esc(x.category_name || 'Категоригүй')}</span>
            <a class="pcard-admin__name" href="#/products/${x.id}">${esc(x.name)}</a>
            <span class="sub">${esc(x.sku)}</span>
            ${priceBlock(x.price, x.compare_price)}
            <div class="pcard-admin__stock">
              <span class="sub num">Үлдэгдэл <b>${fmtNum(x.stock)}</b></span>
              <span class="sub num">Зарагдсан <b>${fmtNum(x.sold)}</b></span>
            </div>
            ${stockBar(x.stock, x.low_stock_threshold, maxStock)}
          </div>
          <div class="pcard-admin__foot">
            ${activeSwitch(x)}
            ${actions(x)}
          </div>
        </article>`).join('')}
    </div>`;

  const render = () => {
    const body = $('#pBody', root);
    if (!items.length) { body.innerHTML = emptyBox('Шүүлтүүрт тохирох бараа олдсонгүй', 'box'); return; }
    const maxStock = Math.max(10, ...items.map((x) => Math.max(x.stock, x.low_stock_threshold * 4)));
    body.innerHTML = view === 'grid' ? renderGrid(maxStock) : renderTable(maxStock);
  };

  const load = async () => {
    const d = await api(`/api/admin/products${qs({ ...f, limit: view === 'grid' ? 24 : 20 })}`);
    if (!ctx.alive()) return;
    f.page = d.page;
    items = d.items;
    syncHashQuery('products', { ...f, sort: f.sort === 'new' ? '' : f.sort, page: f.page > 1 ? f.page : '' });
    $('#pTotal', root).textContent = fmtNum(d.total);
    render();
    renderPager($('#pPager', root), d, (pg) => { f.page = pg; load().catch((e) => toast(e.message, 'err')); });
  };
  const reload = () => { f.page = 1; load().catch((e) => toast(e.message, 'err')); };

  const body = $('#pBody', root);
  bindRowLinks(body);
  body.addEventListener('click', (e) => {
    const st = e.target.closest('[data-stock]');
    const feat = e.target.closest('[data-feat]');
    if (st) {
      const x = items.find((i) => i.id === +st.dataset.stock);
      openStockModal({ product: x, onDone: () => load().catch((er) => toast(er.message, 'err')) });
    } else if (feat) {
      const x = items.find((i) => i.id === +feat.dataset.feat);
      feat.disabled = true;
      api(`/api/admin/products/${x.id}`, { method: 'PUT', body: { is_featured: !x.is_featured } })
        .then((r) => { Object.assign(x, { is_featured: r.product.is_featured }); render(); toast(x.is_featured ? 'Онцлох бараанд нэмлээ' : 'Онцлохоос хаслаа'); })
        .catch((er) => { feat.disabled = false; toast(er.message, 'err'); });
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target.closest('[data-active]');
    if (!t) return;
    const x = items.find((i) => i.id === +t.dataset.active);
    t.disabled = true;
    api(`/api/admin/products/${x.id}`, { method: 'PUT', body: { is_active: t.checked } })
      .then((r) => { x.is_active = r.product.is_active; render(); toast(x.is_active ? `${x.name} идэвхжлээ` : `${x.name} идэвхгүй боллоо`); })
      .catch((er) => { t.checked = !t.checked; t.disabled = false; toast(er.message, 'err'); });
  });
  $('#pView', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === view) return;
    view = b.dataset.v;
    prefSet('productsView', view);
    $$('#pView button', root).forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#pQ', root).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); reload(); }, 300));
  [['#pCat', 'category'], ['#pStatus', 'status'], ['#pStock', 'stock'], ['#pSort', 'sort']].forEach(([sel, key]) =>
    $(sel, root).addEventListener('change', (e) => { f[key] = e.target.value; reload(); }));
  await load();
};

/* ================= Тойм + нэмэх / засах ================= */
async function productForm(root, ctx, id) {
  const [cats, data] = await Promise.all([
    loadCategories(true),
    id ? api(`/api/admin/products/${encodeURIComponent(id)}`) : Promise.resolve(null),
  ]);
  if (!ctx.alive()) return;
  const isNew = !data;
  const p = data ? data.product : {
    sku: '', name: '', slug: '', brand: '', category_id: '', price: '', compare_price: '', stock: 0, low_stock_threshold: 5,
    volume: '', short_desc: '', description: '', benefits: [], usage: [], is_active: true, is_featured: false, images: [],
  };
  ctx.setTitle(isNew ? 'Бараа нэмэх' : p.name);

  // 30 хоногийн борлуулалт
  const series = (data && data.sales_series) || [];
  const qty30 = series.reduce((a, x) => a + (x.qty || 0), 0);
  const rev30 = series.reduce((a, x) => a + (x.revenue || 0), 0);
  const perDay = qty30 / Math.max(1, series.length || 30);
  const daysLeft = perDay > 0 ? Math.floor(p.stock / perDay) : null;

  const toggle = (idName, checked, title, sub) => `
    <label class="toggle">
      <input type="checkbox" id="${idName}" ${checked ? 'checked' : ''}>
      <span class="toggle__track"></span>
      <span class="toggle__text"><b>${title}</b><span>${sub}</span></span>
    </label>`;

  root.innerHTML = `
    <div>
      <a class="back-link" href="#/products">${ICONS.back}Бараа руу буцах</a>
      <div class="page-head">
        ${isNew ? '' : thumb(p.image, 'thumb--lg')}
        <div>
          <h2>${isNew ? 'Шинэ бараа' : esc(p.name)} ${isNew ? '' : activeChip(p.is_active)} ${!isNew && p.is_featured ? '<span class="chip chip--brand">Онцлох</span>' : ''}</h2>
          ${isNew ? '<p class="hint">Мэдээллээ бөглөөд хадгална уу. Зургийг хадгалсны дараа нэмнэ.</p>' : `<p class="hint num">${esc(p.sku)}${p.category_name ? ` · ${esc(p.category_name)}` : ''} · шинэчилсэн ${fmtDT(p.updated_at)}</p>`}
        </div>
        <div class="spacer"></div>
        ${isNew ? '' : `<a class="btn btn--ghost" href="/p/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${ICONS.external}Дэлгүүрт харах</a>
          <button class="btn btn--danger" id="pfDel" type="button">${ICONS.trash}Устгах</button>`}
      </div>
    </div>

    ${isNew ? '' : `
    <div class="stats stats--4">
      <div class="card stat">
        <span class="stat__ic">${ICONS.cart}</span>
        <span class="stat__label">Зарагдсан</span>
        <span class="stat__value num" data-count="${data.sold.qty}">${fmtNum(data.sold.qty)}</span>
        <span class="stat__sub num">Сүүлийн 30 хоногт ${fmtNum(qty30)} ширхэг</span>
      </div>
      <div class="card stat">
        <span class="stat__ic">${ICONS.coin}</span>
        <span class="stat__label">Орлого</span>
        <span class="stat__value num" data-count="${data.sold.revenue}" data-fmt="t">${fmtT(data.sold.revenue)}</span>
        <span class="stat__sub num">Сүүлийн 30 хоногт ${fmtT(rev30)}</span>
      </div>
      <div class="card stat${p.stock <= 0 ? ' stat--red' : p.stock <= p.low_stock_threshold ? ' stat--warn' : ''}">
        <span class="stat__ic">${ICONS.warehouse}</span>
        <span class="stat__label">Үлдэгдэл</span>
        <span class="stat__value num" data-count="${p.stock}">${fmtNum(p.stock)}</span>
        ${stockBar(p.stock, p.low_stock_threshold)}
        <span class="stat__sub num">Анхааруулах босго ${fmtNum(p.low_stock_threshold)}</span>
      </div>
      <div class="card stat${daysLeft !== null && daysLeft <= 14 ? ' stat--warn' : ''}">
        <span class="stat__ic">${ICONS.clock}</span>
        <span class="stat__label">Нөөц хүрэлцэх хугацаа</span>
        <span class="stat__value num">${daysLeft === null ? '—' : `<span data-count="${daysLeft}">${fmtNum(daysLeft)}</span> <small>хоног</small>`}</span>
        <span class="stat__sub num">${perDay > 0 ? `Өдөрт дунджаар ${(Math.round(perDay * 10) / 10).toLocaleString('en-US')} ширхэг` : '30 хоногт борлуулалт алга'}</span>
      </div>
    </div>

    <div class="grid-23">
      <div class="card">
        <div class="card__head">
          <div><h2>Борлуулалт — сүүлийн 30 хоног</h2><p class="card__sub num"><b>${fmtNum(qty30)}</b> ширхэг · <b>${fmtT(rev30)}</b></p></div>
          <div class="spacer"></div>
          <div class="chart-legend">
            <span><i style="background:${PAL.brand}"></i>Ширхэг</span>
            <span><i class="line" style="background:${PAL.warm}"></i>Орлого</span>
          </div>
        </div>
        <div class="card__body">${series.length ? '<div class="chart-box chart-box--sm"><canvas id="pfSales" aria-label="30 хоногийн борлуулалт"></canvas></div>' : emptyBox('Борлуулалтын өгөгдөл алга', 'chart')}</div>
      </div>
      <div class="card">
        <div class="card__head">
          <h2>Сүүлийн хөдөлгөөн</h2>
          <div class="spacer"></div>
          <button class="btn btn--soft btn--sm" type="button" id="pfStockBtn">${ICONS.plus}Хөдөлгөөн</button>
          <a class="btn btn--ghost btn--sm" href="#/inventory?product_id=${p.id}">Бүгд</a>
        </div>
        <div class="card__body--flush tbl-wrap">
          ${data.movements.length ? `
          <table class="tbl tbl--compact">
            <thead><tr><th>Огноо</th><th>Төрөл</th><th class="r">Өөрчлөлт</th><th class="r">Үлдэгдэл</th></tr></thead>
            <tbody>${data.movements.slice(0, 7).map((m) => `
              <tr title="${esc(m.reason)}">
                <td class="num nowrap muted">${fmtDT(m.created_at)}</td>
                <td>${esc(MOVE_TYPES[m.type] || m.type)}</td>
                <td class="r num ${m.change > 0 ? 'chg-plus' : 'chg-minus'}">${m.change > 0 ? '+' : ''}${fmtNum(m.change)}</td>
                <td class="r num">${fmtNum(m.stock_after)}</td>
              </tr>`).join('')}</tbody>
          </table>` : emptyBox('Хөдөлгөөн алга')}
        </div>
      </div>
    </div>`}

    <form id="pfForm" class="product-layout" novalidate>
      <div class="col">
        <section class="card">
          <div class="card__head"><h2>Үндсэн мэдээлэл</h2></div>
          <div class="card__body form-grid">
            <div class="field"><label for="fName">Барааны нэр <span class="req">*</span></label><input class="input" id="fName" maxlength="160" required value="${esc(p.name)}"></div>
            <div class="form-row">
              <div class="field"><label for="fSku">SKU (барааны код) <span class="req">*</span></label><input class="input" id="fSku" maxlength="60" required value="${esc(p.sku)}" style="text-transform:uppercase" placeholder="ZF-TEA-30"></div>
              <div class="field"><label for="fSlug">URL (slug)</label><input class="input" id="fSlug" maxlength="120" value="${esc(p.slug)}" placeholder="Хоосон бол нэрээс үүсгэнэ"></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="fCat">Категори</label><select class="input" id="fCat">${categoryOptions(cats, p.category_id)}</select></div>
              <div class="field"><label for="fBrand">Брэнд</label><input class="input" id="fBrand" maxlength="60" value="${esc(p.brand)}"></div>
            </div>
            <div class="field"><label for="fVolume">Хэмжээ / багц</label><input class="input" id="fVolume" maxlength="120" value="${esc(p.volume)}" placeholder="Жиш: 30ш, 30 өдрийн хэрэглээ"></div>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h2>Үнэ ба агуулах</h2></div>
          <div class="card__body form-grid">
            <div class="form-row">
              <div class="field"><label for="fPrice">Үнэ <span class="req">*</span></label><div class="input-suffix"><input class="input num" id="fPrice" type="number" min="0" step="100" required value="${esc(p.price)}"><em>₮</em></div></div>
              <div class="field"><label for="fCompare">Хуучин үнэ</label><div class="input-suffix"><input class="input num" id="fCompare" type="number" min="0" step="100" value="${p.compare_price ? esc(p.compare_price) : ''}"><em>₮</em></div><span class="hint" id="fDiscHint">Хямдарсан мэт харуулах бол үндсэн үнээс их дүн</span></div>
            </div>
            <div class="form-row">
              ${isNew
                ? '<div class="field"><label for="fStock">Анхны үлдэгдэл</label><input class="input num" id="fStock" type="number" min="0" step="1" value="0"></div>'
                : `<div class="field"><span class="field__label">Одоогийн үлдэгдэл</span>
                     <div class="stock-inline">${stockChip(p.stock, p.low_stock_threshold)}<button class="btn btn--soft btn--sm" type="button" id="pfStockBtn2">${ICONS.warehouse}Өөрчлөх</button></div>
                     <span class="hint">Үлдэгдлийг агуулахын хөдөлгөөнөөр өөрчилнө (түүх хадгалагдана)</span></div>`}
              <div class="field"><label for="fThreshold">Анхааруулах босго</label><input class="input num" id="fThreshold" type="number" min="0" step="1" value="${esc(p.low_stock_threshold)}"><span class="hint">Үлдэгдэл энэ тоонд хүрвэл анхааруулна</span></div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h2>Тайлбар</h2></div>
          <div class="card__body form-grid">
            <div class="field"><label for="fShort">Товч тайлбар</label><input class="input" id="fShort" maxlength="300" value="${esc(p.short_desc)}"></div>
            <div class="field"><label for="fDesc">Дэлгэрэнгүй тайлбар</label><textarea class="input" id="fDesc" rows="4" maxlength="5000">${esc(p.description)}</textarea></div>
            <div class="form-row">
              <div class="field"><label for="fBenefits">Давуу тал, үйлчилгээ</label><textarea class="input" id="fBenefits" rows="6">${esc((p.benefits || []).join('\n'))}</textarea><span class="hint">Мөр бүрт нэг зүйл</span></div>
              <div class="field"><label for="fUsage">Хэрэглэх заавар</label><textarea class="input" id="fUsage" rows="6">${esc((p.usage || []).join('\n'))}</textarea><span class="hint">Мөр бүрт нэг алхам</span></div>
            </div>
          </div>
        </section>

        <section class="card" id="imgCard">
          <div class="card__head">
            <h2>Зураг</h2>
            <span class="chip num" id="imgCount">${(p.images || []).length}</span>
            <div class="spacer"></div>
            ${isNew ? '' : '<span class="hint">Чирж дарааллыг өөрчилнө · эхнийх нь нүүр зураг</span>'}
          </div>
          <div class="card__body" id="imgBody">
            ${isNew ? `<div class="empty empty--sm">${ICONS.image}<p>Барааг хадгалсны дараа зураг нэмэх боломжтой болно</p></div>` : ''}
          </div>
        </section>
      </div>

      <aside class="product-aside">
        <section class="card">
          <div class="card__head"><h2>Төлөв</h2></div>
          <div class="card__body form-grid">
            ${toggle('fActive', p.is_active, 'Идэвхтэй', 'Дэлгүүрт харагдаж, захиалах боломжтой')}
            ${toggle('fFeatured', p.is_featured, 'Онцлох', 'Нүүр хуудасны онцлох хэсэгт гарна')}
          </div>
        </section>
        <section class="card">
          <div class="card__head"><h2>Дэлгүүрт харагдах байдал</h2></div>
          <div class="card__body"><div id="pfPreview"></div></div>
        </section>
      </aside>

      <div class="savebar">
        <span class="savebar__state" id="pfState">${isNew ? 'Шинэ бараа' : 'Өөрчлөлт алга'}</span>
        <div class="spacer"></div>
        ${isNew ? '<a class="btn btn--ghost" href="#/products">Болих</a>' : '<button class="btn btn--ghost" type="button" id="pfReset" disabled>Буцаах</button>'}
        <button class="btn btn--primary" id="pfSave" type="submit">${ICONS.check}${isNew ? 'Бараа хадгалах' : 'Хадгалах'}</button>
      </div>
    </form>`;

  let images = (p.images || []).slice();
  const lines = (sel) => $(sel, root).value.split('\n').map((s) => s.trim()).filter(Boolean);
  const readForm = () => ({
    name: $('#fName', root).value.trim(),
    sku: $('#fSku', root).value.trim().toUpperCase(),
    slug: $('#fSlug', root).value.trim(),
    category_id: $('#fCat', root).value || null,
    brand: $('#fBrand', root).value.trim(),
    volume: $('#fVolume', root).value.trim(),
    short_desc: $('#fShort', root).value.trim(),
    description: $('#fDesc', root).value.trim(),
    benefits: lines('#fBenefits'),
    usage: lines('#fUsage'),
    price: $('#fPrice', root).value === '' ? '' : Number($('#fPrice', root).value),
    compare_price: Number($('#fCompare', root).value) || 0,
    low_stock_threshold: Number($('#fThreshold', root).value) || 0,
    is_active: $('#fActive', root).checked,
    is_featured: $('#fFeatured', root).checked,
  });

  /* ---- Урьдчилан харах ---- */
  const renderPreview = () => {
    const v = readForm();
    const stock = isNew ? Number(($('#fStock', root) || {}).value) || 0 : p.stock;
    const threshold = v.low_stock_threshold;
    const off = discountPct(v.price || 0, v.compare_price);
    const badge = stock <= 0 ? '<span class="sbadge sbadge--muted">Дууссан</span>'
      : off > 0 ? `<span class="sbadge sbadge--accent">-${off}%</span>`
        : stock <= threshold ? '<span class="sbadge sbadge--warn">Цөөн үлдсэн</span>' : '';
    $('#pfPreview', root).innerHTML = `
      <div class="store-preview${v.is_active ? '' : ' is-off'}">
        <div class="store-preview__img">
          ${images[0] ? `<img src="${esc(images[0].url)}" alt="">` : `<span>${ICONS.image}</span>`}
          ${badge ? `<span class="store-preview__badges">${badge}</span>` : ''}
        </div>
        <div class="store-preview__body">
          ${v.brand ? `<span class="store-preview__brand">${esc(v.brand)}</span>` : ''}
          <b class="store-preview__name">${esc(v.name) || '<span class="muted">Барааны нэр</span>'}</b>
          ${v.volume ? `<span class="store-preview__meta">${esc(v.volume)}</span>` : ''}
          <span class="store-preview__price"><b class="num">${fmtT(v.price || 0)}</b>${off ? `<s class="num">${fmtT(v.compare_price)}</s>` : ''}</span>
          <span class="store-preview__btn${stock <= 0 ? ' is-disabled' : ''}">${ICONS.cart}${stock <= 0 ? 'Дууссан' : 'Сагсанд нэмэх'}</span>
        </div>
      </div>
      ${v.is_active ? '' : '<p class="hint" style="margin-top:10px">Идэвхгүй тул дэлгүүрт харагдахгүй.</p>'}
      ${v.short_desc ? `<p class="hint" style="margin-top:10px">${esc(v.short_desc)}</p>` : ''}`;
    const dh = $('#fDiscHint', root);
    if (dh) dh.textContent = off ? `Дэлгүүрт −${off}% хямдралтай харагдана` : 'Хямдарсан мэт харуулах бол үндсэн үнээс их дүн';
  };

  /* ---- Хадгалаагүй өөрчлөлт ---- */
  const snapshot = () => JSON.stringify(readForm());
  let initial = snapshot();
  const form = $('#pfForm', root);
  const updateState = () => {
    const dirty = snapshot() !== initial;
    form.classList.toggle('is-dirty', dirty);
    $('#pfState', root).textContent = dirty ? 'Хадгалаагүй өөрчлөлт байна' : isNew ? 'Шинэ бараа' : 'Өөрчлөлт алга';
    const rs = $('#pfReset', root);
    if (rs) rs.disabled = !dirty;
  };
  form.addEventListener('input', () => { renderPreview(); updateState(); });
  form.addEventListener('change', () => { renderPreview(); updateState(); });
  renderPreview();

  const reloadForm = () => productForm(root, ctx, p.id).then(() => countUp(root)).catch((er) => toast(er.message, 'err'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = readForm();
    if (!body.name) { $('#fName', root).focus(); return toast('Барааны нэр оруулна уу', 'err'); }
    if (!body.sku) { $('#fSku', root).focus(); return toast('SKU оруулна уу', 'err'); }
    if (body.price === '' || !(body.price >= 0)) { $('#fPrice', root).focus(); return toast('Үнэ оруулна уу', 'err'); }
    await withBusy($('#pfSave', root), async () => {
      try {
        if (isNew) {
          body.stock = Math.max(0, Number($('#fStock', root).value) || 0);
          const r = await api('/api/admin/products', { method: 'POST', body });
          toast('Бараа нэмэгдлээ. Одоо зураг нэмнэ үү.');
          location.hash = `#/products/${r.product.id}`;
        } else {
          await api(`/api/admin/products/${p.id}`, { method: 'PUT', body });
          toast('Хадгалагдлаа');
          initial = snapshot();
          reloadForm();
        }
      } catch (er) { toast(er.message, 'err'); }
    });
  });

  if (isNew) return;

  $('#pfReset', root).onclick = () => reloadForm();
  const openStock = () => openStockModal({ product: p, onDone: reloadForm });
  $('#pfStockBtn', root).onclick = openStock;
  $('#pfStockBtn2', root).onclick = openStock;

  $('#pfDel', root).onclick = () =>
    confirmModal('Бараа устгах', `
      <p><b>${esc(p.name)}</b> барааг устгах уу?</p>
      <p class="hint">Захиалгын түүхэд орсон бараа бол устгахгүй, харин идэвхгүй болгоно.</p>`, {
      yes: 'Устгах',
      onYes: async () => {
        const r = await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
        toast(r.archived ? r.message : 'Бараа устгагдлаа');
        location.hash = '#/products';
      },
    });

  /* ---- 30 хоногийн график ---- */
  if (series.length) {
    makeChart($('#pfSales', root), {
      type: 'bar',
      data: {
        labels: series.map((x) => shortDate(x.key)),
        datasets: [
          { type: 'bar', label: 'Ширхэг', data: series.map((x) => x.qty), yAxisID: 'y1', order: 2, backgroundColor: alpha(PAL.brand, 0.85), hoverBackgroundColor: PAL.dark, borderRadius: 4, maxBarThickness: 14 },
          { type: 'line', label: 'Орлого', data: series.map((x) => x.revenue), yAxisID: 'y', order: 1, showLine: !isSparse(series.map((x) => x.revenue)), borderColor: PAL.warm, borderWidth: 2, tension: 0.35, cubicInterpolationMode: 'monotone', pointRadius: series.map((x) => (x.revenue > 0 ? 4 : 0)), pointBackgroundColor: '#fff', pointBorderColor: PAL.warm, pointBorderWidth: 2, fill: false },
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
              title: (it) => mnDate(series[it[0].dataIndex].key),
              label: (c) => (c.dataset.yAxisID === 'y1' ? ` Зарагдсан: ${fmtNum(c.parsed.y)} ширхэг` : ` Орлого: ${fmtT(c.parsed.y)}`),
              labelColor: (c) => { const col = c.dataset.yAxisID === 'y1' ? PAL.brand : PAL.warm; return { borderColor: col, backgroundColor: col }; },
            },
          },
        },
        scales: { x: catAxis(), y: moneyAxis({ position: 'right', grid: { display: false }, grace: '15%' }), y1: countAxis({ position: 'left', grid: { color: PAL.grid }, grace: '15%' }) },
      },
    });
  }

  /* ---- Зургийн менежер ---- */
  const renderImages = () => {
    const box = $('#imgBody', root);
    $('#imgCount', root).textContent = images.length;
    box.innerHTML = `
      <div class="img-grid" id="imgGrid">
        ${images.map((im, i) => `
          <div class="img-tile${i === 0 ? ' img-tile--cover' : ''}" draggable="true" data-img="${im.id}">
            ${i === 0 ? '<span class="chip chip--solid img-tile__cover">Нүүр зураг</span>' : `<span class="img-tile__num num">${i + 1}</span>`}
            <img src="${esc(im.url)}" alt="" loading="lazy" draggable="false">
            <div class="img-tile__bar">
              <button type="button" class="btn btn--icon btn--sm btn--ghost" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Өмнө нь">${ICONS.left}</button>
              ${i === 0 ? '' : `<button type="button" class="btn btn--sm btn--ghost img-tile__make" data-cover="${i}" title="Нүүр зураг болгох">Нүүр</button>`}
              <button type="button" class="btn btn--icon btn--sm btn--danger" data-rm="${im.id}" aria-label="Устгах">${ICONS.trash}</button>
              <button type="button" class="btn btn--icon btn--sm btn--ghost" data-mv="1" data-i="${i}" ${i === images.length - 1 ? 'disabled' : ''} aria-label="Дараа нь">${ICONS.right}</button>
            </div>
          </div>`).join('')}
        <label class="img-add" id="imgAdd">
          ${ICONS.upload}<b>Зураг нэмэх</b><span>эсвэл энд чирж оруулна</span>
          <input type="file" id="imgInput" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple>
        </label>
      </div>
      <p class="hint" style="margin-top:10px">jpg, png, webp — нэг бүр 8MB хүртэл, нэг удаад 10 хүртэл.</p>`;
    renderPreview();
  };
  const saveOrder = async (ids) => {
    try {
      const r = await api(`/api/admin/products/${p.id}/images/order`, { method: 'PUT', body: { ids } });
      images = r.images;
    } catch (er) { toast(er.message, 'err'); }
    renderImages();
  };
  const upload = async (files) => {
    files = files.filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    if (files.length > 10) return toast('Нэг удаад 10 хүртэл зураг оруулна', 'err');
    const big = files.find((f) => f.size > 8 * 1024 * 1024);
    if (big) return toast(`${big.name}: 8MB-аас их байна`, 'err');
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    const add = $('#imgAdd', root);
    if (add) { add.classList.add('is-busy'); add.querySelector('b').textContent = 'Хуулж байна…'; }
    try {
      const r = await api(`/api/admin/products/${p.id}/images`, { method: 'POST', body: fd });
      images = r.images;
      toast(`${files.length} зураг нэмэгдлээ`);
    } catch (er) { toast(er.message, 'err'); }
    renderImages();
  };
  renderImages();

  const imgBody = $('#imgBody', root);
  imgBody.addEventListener('click', async (e) => {
    const mv = e.target.closest('[data-mv]');
    const rm = e.target.closest('[data-rm]');
    const cv = e.target.closest('[data-cover]');
    if (mv) {
      const i = +mv.dataset.i;
      const j = i + +mv.dataset.mv;
      const ids = images.map((x) => x.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await saveOrder(ids);
    } else if (cv) {
      const ids = images.map((x) => x.id);
      const [moved] = ids.splice(+cv.dataset.cover, 1);
      ids.unshift(moved);
      await saveOrder(ids);
      toast('Нүүр зураг солигдлоо');
    } else if (rm) {
      confirmModal('Зураг устгах', '<p>Энэ зургийг устгах уу?</p>', {
        yes: 'Устгах',
        onYes: async () => {
          const r = await api(`/api/admin/products/${p.id}/images/${rm.dataset.rm}`, { method: 'DELETE' });
          images = r.images;
          renderImages();
          toast('Зураг устгагдлаа');
        },
      });
    }
  });
  imgBody.addEventListener('change', (e) => {
    if (e.target.id !== 'imgInput') return;
    const files = [...e.target.files];
    e.target.value = '';
    upload(files);
  });

  // Чирж дараалал солих, файл чирж оруулах
  let dragId = null;
  const isFileDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  imgBody.addEventListener('dragstart', (e) => {
    const t = e.target.closest('[data-img]');
    if (!t) return;
    dragId = +t.dataset.img;
    t.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragId));
  });
  imgBody.addEventListener('dragend', () => {
    dragId = null;
    $$('.img-tile, .img-add', imgBody).forEach((x) => x.classList.remove('dragging', 'drop'));
  });
  imgBody.addEventListener('dragover', (e) => {
    if (isFileDrag(e)) {
      e.preventDefault();
      const add = $('#imgAdd', root);
      if (add) add.classList.add('drop');
      return;
    }
    const t = e.target.closest('[data-img]');
    if (!t || dragId === null) return;
    e.preventDefault();
    $$('.img-tile', imgBody).forEach((x) => x.classList.toggle('drop', x === t && +x.dataset.img !== dragId));
  });
  imgBody.addEventListener('dragleave', (e) => {
    if (!imgBody.contains(e.relatedTarget)) $$('.img-tile, .img-add', imgBody).forEach((x) => x.classList.remove('drop'));
  });
  imgBody.addEventListener('drop', async (e) => {
    if (isFileDrag(e)) {
      e.preventDefault();
      upload([...e.dataTransfer.files]);
      return;
    }
    const t = e.target.closest('[data-img]');
    if (!t || dragId === null) return;
    e.preventDefault();
    const target = +t.dataset.img;
    if (target === dragId) return;
    const ids = images.map((x) => x.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(target);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    dragId = null;
    await saveOrder(ids);
  });
}
