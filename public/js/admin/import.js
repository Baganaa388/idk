// Bulk импорт — CSV/Excel файлаас бараа нэмэх, шинэчлэх
'use strict';

const IMPORT_COLUMNS = [
  ['sku', 'Барааны код — заавал. Байгаа SKU бол шинэчилнэ'],
  ['name', 'Барааны нэр — заавал'],
  ['price', 'Үнэ (₮) — заавал'],
  ['stock', 'Үлдэгдэл (ширхэг)'],
  ['category', 'Категорийн slug эсвэл нэр'],
  ['brand', 'Брэнд'],
  ['compare_price', 'Хуучин үнэ (₮)'],
  ['low_stock_threshold', 'Анхааруулах доод үлдэгдэл'],
  ['volume', 'Хэмжээ / савлагаа'],
  ['short_desc', 'Товч тайлбар'],
  ['description', 'Дэлгэрэнгүй тайлбар'],
  ['benefits', 'Давуу талууд — | тэмдгээр тусгаарлана'],
  ['usage', 'Хэрэглэх заавар — | тэмдгээр тусгаарлана'],
  ['images', 'Зургийн URL — | тэмдгээр тусгаарлана'],
  ['is_active', 'Идэвхтэй эсэх: 1 эсвэл 0'],
];

Views.import = async (root) => {
  let preview = null;

  root.innerHTML = `
    <div class="card">
      <div class="card__head"><span class="step-num">1</span><h2>Загвар файл татах</h2></div>
      <div class="card__body form-grid">
        <p style="color:var(--ink-2)">Загвар файлыг татаж, мөр бүрт нэг бараа бөглөнө. Эхний мөр нь баганын нэр байна. CSV файлыг UTF-8 кодчилолтой хадгална уу.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn--ghost" href="/api/admin/import/template.xlsx" download>${ICONS.download}Excel загвар (.xlsx)</a>
          <a class="btn btn--ghost" href="/api/admin/import/template.csv" download>${ICONS.download}CSV загвар (.csv)</a>
        </div>
        <div class="col-help">
          ${IMPORT_COLUMNS.map(([k, l]) => `<div><code>${k}</code> <span>${esc(l)}</span></div>`).join('')}
        </div>
        <div class="notice notice--info">${ICONS.info}<span>"info" зурагнуудаас уншиж бэлтгэсэн барааны өгөгдөл <code class="env">scripts/extracted-products.csv</code> файлд байгаа — түүнийг энд импортлож болно.</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><span class="step-num">2</span><h2>Файл сонгох</h2></div>
      <div class="card__body">
        <div class="dropzone" id="impDrop">
          <span class="thumb" style="width:44px;height:44px">${ICONS.file}</span>
          <div style="flex:1;min-width:180px">
            <b id="impFileName">Файл сонгоогүй</b>
            <p class="hint">.csv эсвэл .xlsx, 10MB хүртэл. Файлаа энд чирч оруулж болно.</p>
          </div>
          <label class="btn btn--primary upload-btn" id="impPick">${ICONS.upload}Файл сонгох<input type="file" id="impFile" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        </div>
      </div>
    </div>

    <div id="impPreview"></div>`;

  const doPreview = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) return toast('Зөвхөн .csv эсвэл .xlsx файл сонгоно уу', 'err');
    $('#impFileName', root).textContent = file.name;
    const out = $('#impPreview', root);
    out.innerHTML = '<div class="card"><div class="loading">Файлыг шалгаж байна…</div></div>';
    const fd = new FormData();
    fd.append('file', file);
    try {
      preview = await api('/api/admin/import/preview', { method: 'POST', body: fd });
      renderPreview();
    } catch (e) {
      out.innerHTML = '';
      toast(e.message, 'err');
    }
  };

  const renderPreview = () => {
    const out = $('#impPreview', root);
    const s = preview.summary || { total: 0, create: 0, update: 0, error: 0 };
    const valid = s.create + s.update;
    const actionChip = (a) => ({
      create: '<span class="chip chip--ok">Шинэ</span>',
      update: '<span class="chip chip--blue">Шинэчлэх</span>',
      error: '<span class="chip chip--red">Алдаатай</span>',
    }[a] || esc(a));
    out.innerHTML = `
      <div class="card">
        <div class="card__head">
          <span class="step-num">3</span><h2>Шалгах ба импортлох</h2>
          <div class="spacer"></div>
          <span class="chip num">Нийт ${fmtNum(s.total)}</span>
          <span class="chip chip--ok num">Шинэ ${fmtNum(s.create)}</span>
          <span class="chip chip--blue num">Шинэчлэх ${fmtNum(s.update)}</span>
          <span class="chip chip--red num">Алдаатай ${fmtNum(s.error)}</span>
        </div>
        ${(preview.errors || []).length ? `<div class="card__body" style="padding-bottom:0"><div class="notice notice--red">${ICONS.alert}<span>${preview.errors.map(esc).join('<br>')}</span></div></div>` : ''}
        <div class="card__body--flush tbl-wrap" style="margin-top:8px">
          ${preview.rows.length ? `
          <table class="tbl">
            <thead><tr><th class="r">Мөр</th><th>Үйлдэл</th><th>SKU</th><th>Нэр</th><th>Категори</th><th class="r">Үнэ</th><th class="r">Үлдэгдэл</th><th>Алдаа</th></tr></thead>
            <tbody>
              ${preview.rows.map((r) => {
                const d = r.data || {};
                const stockCell = r.action === 'update' && r.current_stock !== undefined && r.current_stock !== null
                  ? (Number(r.current_stock) === Number(d.stock) ? `<span class="num">${fmtNum(d.stock)}</span>` : `<span class="num muted">${fmtNum(r.current_stock)}</span> → <b class="num">${fmtNum(d.stock)}</b>`)
                  : `<span class="num">${d.stock === undefined || d.stock === '' ? '—' : fmtNum(d.stock)}</span>`;
                return `
                <tr class="${r.action === 'error' ? 'row-error' : ''}">
                  <td class="r num muted">${fmtNum(r.line)}</td>
                  <td>${actionChip(r.action)}</td>
                  <td class="nowrap strong">${esc(d.sku) || '<span class="muted">—</span>'}</td>
                  <td>${esc(d.name) || '<span class="muted">—</span>'}</td>
                  <td>${d.category_name ? esc(d.category_name) : '<span class="muted">—</span>'}</td>
                  <td class="r num nowrap">${d.price !== undefined && d.price !== '' && d.price !== null ? fmtT(d.price) : '—'}</td>
                  <td class="r nowrap">${stockCell}</td>
                  <td>${(r.errors || []).length ? `<ul class="err-list">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : emptyBox('Файлд бараа олдсонгүй', 'file')}
        </div>
        <div class="card__foot">
          <span class="hint" style="margin-right:auto;align-self:center">${s.error ? 'Алдаатай мөрүүдийг алгасна. ' : ''}Үлдэгдлийн өөрчлөлт агуулахын түүхэнд "Импорт" гэж бүртгэгдэнэ.</span>
          <button class="btn btn--ghost" id="impClear">Болих</button>
          <button class="btn btn--primary" id="impCommit" ${valid ? '' : 'disabled'}>${ICONS.check}Импортлох (${fmtNum(valid)})</button>
        </div>
      </div>`;

    $('#impClear', root).onclick = () => { preview = null; out.innerHTML = ''; $('#impFileName', root).textContent = 'Файл сонгоогүй'; };
    $('#impCommit', root).onclick = (e) =>
      withBusy(e.currentTarget, async () => {
        try {
          const r = await api('/api/admin/import/commit', { method: 'POST', body: { rows: preview.rows } });
          preview = null;
          refreshBadges();
          out.innerHTML = `
            <div class="card">
              <div class="card__head"><h2>Импорт дууслаа</h2></div>
              <div class="card__body form-grid">
                <div class="result-grid">
                  <div><b class="num" style="color:var(--green-600)">${fmtNum(r.created)}</b><span>Шинээр нэмсэн</span></div>
                  <div><b class="num" style="color:var(--blue-600)">${fmtNum(r.updated)}</b><span>Шинэчилсэн</span></div>
                  <div><b class="num" style="color:var(--ink-3)">${fmtNum(r.skipped)}</b><span>Алгассан</span></div>
                </div>
                ${(r.errors || []).length ? `<div class="notice notice--red">${ICONS.alert}<span>${r.errors.map((x) => `Мөр ${esc(x.line)}: ${esc((x.errors || []).join(', '))}`).join('<br>')}</span></div>` : ''}
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <a class="btn btn--primary" href="#/products">Бараа руу очих</a>
                  <a class="btn btn--ghost" href="#/inventory?type=import">Агуулахын түүх</a>
                </div>
              </div>
            </div>`;
          $('#impFileName', root).textContent = 'Файл сонгоогүй';
          toast(`Импорт: ${r.created} шинэ, ${r.updated} шинэчилсэн`);
        } catch (ex) { toast(ex.message, 'err'); }
      });
  };

  $('#impFile', root).addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    doPreview(file);
  });
  const drop = $('#impDrop', root);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    doPreview(e.dataTransfer.files[0]);
  });
};
