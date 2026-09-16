// Категорийн удирдлага — мод хүснэгт, нэмэх/засах/устгах
'use strict';

Views.categories = async (root, ctx) => {
  const cats = await loadCategories(true);
  if (!ctx.alive()) return;
  const ordered = categoryOrder(cats);
  const byId = new Map(cats.map((c) => [c.id, c]));

  root.innerHTML = `
    <div class="card">
      <div class="card__head">
        <h2>Категориуд</h2>
        <span class="chip num">${fmtNum(cats.length)}</span>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="cAdd">${ICONS.plus}Категори нэмэх</button>
      </div>
      <div class="card__body--flush tbl-wrap">
        ${ordered.length ? `
        <table class="tbl">
          <thead><tr><th>Нэр</th><th>Slug</th><th class="r">Бараа</th><th class="r">Эрэмбэ</th><th>Төлөв</th><th class="r"></th></tr></thead>
          <tbody>
            ${ordered.map((c) => `
              <tr>
                <td>
                  <div style="padding-left:${c.depth * 24}px;display:flex;align-items:center;gap:8px">
                    ${c.depth ? '<span class="muted">└</span>' : ''}
                    <b style="font-weight:${c.depth ? 500 : 600}">${esc(c.name)}</b>
                    ${c.child_count ? `<span class="sub">${fmtNum(c.child_count)} дэд</span>` : ''}
                  </div>
                </td>
                <td class="muted">${esc(c.slug)}</td>
                <td class="r num">${c.product_count ? `<a href="#/products?category=${c.id}">${fmtNum(c.product_count)}</a>` : '<span class="muted">0</span>'}</td>
                <td class="r num">${fmtNum(c.sort)}</td>
                <td>${activeChip(c.is_active)}</td>
                <td class="r nowrap">
                  <button class="btn btn--icon btn--sm btn--ghost" data-edit="${c.id}" title="Засах" aria-label="Засах">${ICONS.pencil}</button>
                  <button class="btn btn--icon btn--sm btn--danger" data-del="${c.id}" title="Устгах" aria-label="Устгах">${ICONS.trash}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : emptyBox('Категори үүсгээгүй байна', 'layers')}
      </div>
    </div>
    <p class="hint">Дэд категори дахь бараа нь эцэг категорийн шүүлтүүрт мөн харагдана. Бараа эсвэл дэд категоритой категорийг устгах боломжгүй.</p>`;

  const reload = () => Views.categories(root, ctx).catch((e) => toast(e.message, 'err'));

  const openForm = (c) => {
    const isNew = !c;
    c = c || { name: '', slug: '', parent_id: '', sort: cats.length, is_active: 1 };
    openModal(isNew ? 'Категори нэмэх' : 'Категори засах', `
      <form id="catForm" class="form-grid" novalidate>
        <div class="field"><label for="cName">Нэр <span class="req">*</span></label><input class="input" id="cName" maxlength="80" value="${esc(c.name)}"></div>
        <div class="field"><label for="cSlug">Slug (URL)</label><input class="input" id="cSlug" maxlength="80" value="${esc(c.slug)}" placeholder="Хоосон бол нэрээс автоматаар"></div>
        <div class="form-row">
          <div class="field"><label for="cParent">Эцэг категори</label><select class="input" id="cParent">${categoryOptions(cats, c.parent_id, { excludeId: isNew ? null : c.id, blank: 'Үндсэн (эцэггүй)' })}</select></div>
          <div class="field"><label for="cSort">Эрэмбэ</label><input class="input num" id="cSort" type="number" step="1" value="${esc(c.sort)}"></div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="cActive" ${c.is_active ? 'checked' : ''}>
          <span class="toggle__track"></span>
          <span class="toggle__text"><b>Идэвхтэй</b><span>Дэлгүүрийн цэсэнд харагдана</span></span>
        </label>
        <p class="error-text" id="cErr" hidden></p>
        <div class="modal__actions">
          <button class="btn btn--ghost" type="button" id="cCancel">Болих</button>
          <button class="btn btn--primary" type="submit" id="cSave">Хадгалах</button>
        </div>
      </form>`);
    $('#cCancel').onclick = closeModal;
    $('#catForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#cErr');
      err.hidden = true;
      const body = {
        name: $('#cName').value.trim(),
        slug: $('#cSlug').value.trim(),
        parent_id: $('#cParent').value || null,
        sort: Number($('#cSort').value) || 0,
        is_active: $('#cActive').checked,
      };
      if (!body.name) { err.textContent = 'Нэр оруулна уу'; err.hidden = false; return; }
      await withBusy($('#cSave'), async () => {
        try {
          if (isNew) await api('/api/admin/categories', { method: 'POST', body });
          else await api(`/api/admin/categories/${c.id}`, { method: 'PUT', body });
          closeModal();
          toast(isNew ? 'Категори нэмэгдлээ' : 'Хадгалагдлаа');
          reload();
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
    });
  };

  $('#cAdd', root).onclick = () => openForm(null);
  $('.card', root).addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (ed) openForm(byId.get(+ed.dataset.edit));
    if (del) {
      const c = byId.get(+del.dataset.del);
      confirmModal('Категори устгах', `<p><b>${esc(c.name)}</b> категорийг устгах уу?</p>`, {
        yes: 'Устгах',
        onYes: async () => {
          await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
          toast('Категори устгагдлаа');
          reload();
        },
      });
    }
  });
};
