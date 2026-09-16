// Тохиргоо — байгууллага, гишүүнчлэл, хүргэлт, төлбөр, нүүр хуудас, нууц үг
'use strict';

Views.settings = async (root, ctx) => {
  const S = await api('/api/admin/settings');
  if (!ctx.alive()) return;
  const b = S.business;
  const q = S.qpay;

  const saveBtn = (id) => `<div class="card__foot"><button class="btn btn--primary" type="submit" id="${id}">${ICONS.check}Хадгалах</button></div>`;
  const put = async (key, value, btn) =>
    withBusy(btn, async () => {
      try {
        const r = await api(`/api/admin/settings/${key}`, { method: 'PUT', body: value });
        S[key] = r[key];
        toast('Тохиргоо хадгалагдлаа');
        return r[key];
      } catch (e) { toast(e.message, 'err'); return null; }
    });

  root.innerHTML = `
    <div class="settings-grid">
      <div class="col">
        <form class="card" id="stBiz" novalidate>
          <div class="card__head"><h2>Байгууллага</h2></div>
          <div class="card__body form-grid">
            <div class="form-row">
              <div class="field"><label for="bName">Нэр</label><input class="input" id="bName" maxlength="80" value="${esc(b.name)}"></div>
              <div class="field"><label for="bTag">Уриа үг</label><input class="input" id="bTag" maxlength="120" value="${esc(b.tagline)}"></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="bPhones">Утас</label><input class="input" id="bPhones" value="${esc((b.phones || []).join(', '))}"><span class="hint">Таслалаар тусгаарлана, 5 хүртэл</span></div>
              <div class="field"><label for="bEmail">И-мэйл</label><input class="input" id="bEmail" type="email" maxlength="120" value="${esc(b.email)}"></div>
            </div>
            <div class="field"><label for="bHours">Ажлын цаг</label><input class="input" id="bHours" maxlength="60" value="${esc(b.hours)}"></div>
            <div class="field"><label for="bAddr">Хаяг</label><input class="input" id="bAddr" maxlength="200" value="${esc(b.address)}"></div>
            <div class="field"><label for="bAddrNote">Хаягийн тайлбар</label><textarea class="input" id="bAddrNote" rows="2" maxlength="300">${esc(b.address_note)}</textarea></div>
            <div class="form-row">
              <div class="field"><label for="bFb">Facebook холбоос</label><input class="input" id="bFb" maxlength="200" value="${esc(b.facebook)}" placeholder="https://facebook.com/…"></div>
              <div class="field"><label for="bIg">Instagram холбоос</label><input class="input" id="bIg" maxlength="200" value="${esc(b.instagram)}" placeholder="https://instagram.com/…"></div>
            </div>
          </div>
          ${saveBtn('bSave')}
        </form>

        <form class="card" id="stDel" novalidate>
          <div class="card__head"><h2>Хүргэлт</h2></div>
          <div class="card__body form-grid">
            <div class="form-row">
              <div class="field"><label for="dFee">Хүргэлтийн төлбөр</label><div class="input-suffix"><input class="input num" id="dFee" type="number" min="0" step="500" value="${esc(S.delivery.fee)}"><em>₮</em></div></div>
              <div class="field"><label for="dFree">Үнэгүй хүргэх доод дүн</label><div class="input-suffix"><input class="input num" id="dFree" type="number" min="0" step="1000" value="${esc(S.delivery.free_over)}"><em>₮</em></div><span class="hint">0 бол үргэлж төлбөртэй</span></div>
            </div>
            <div class="field"><label for="dNote">Хүргэлтийн мэдээлэл</label><input class="input" id="dNote" maxlength="200" value="${esc(S.delivery.note)}"></div>
          </div>
          ${saveBtn('dSave')}
        </form>

        <form class="card" id="stHome" novalidate>
          <div class="card__head"><h2>Нүүр хуудас</h2></div>
          <div class="card__body form-grid">
            <div class="field"><label for="hTitle">Онцлох бүтээгдэхүүний гарчиг</label><input class="input" id="hTitle" maxlength="80" value="${esc(S.home.featured_title)}"></div>
            <div class="field">
              <span class="field__label">Баннер</span>
              <div class="form-grid" id="hBanners"></div>
              <div><button class="btn btn--ghost btn--sm" type="button" id="hAdd">${ICONS.plus}Баннер нэмэх</button></div>
              <span class="hint">Зургийг файлаар оруулах эсвэл URL (/… эсвэл https://…) бичнэ. Зураггүй баннер хадгалагдахгүй. 8 хүртэл.</span>
            </div>
          </div>
          ${saveBtn('hSave')}
        </form>
      </div>

      <div class="col">
        <form class="card" id="stLoy" novalidate>
          <div class="card__head">
            <h2>Гишүүнчлэлийн хямдрал</h2>
            <div class="spacer"></div>
            <label class="toggle"><input type="checkbox" id="lEnabled" ${S.loyalty.enabled ? 'checked' : ''}><span class="toggle__track"></span><span class="toggle__text"><b>Идэвхтэй</b></span></label>
          </div>
          <div class="card__body form-grid">
            <p class="hint" style="font-size:13px">Хэрэглэгчийн төлсөн захиалгын дарааллаар хямдрал автоматаар тооцогдоно. <b>Хамгийн сүүлийн шат цаашдын бүх захиалгад үйлчилнэ.</b> Эхний шат үргэлж 1-р захиалгаас эхэлнэ.</p>
            <div class="tier-edit tier-edit-head"><span>Захиалгаас</span><span>Хямдрал</span><span>Шатны нэр</span><span></span></div>
            <div class="form-grid" id="lTiers" style="gap:8px"></div>
            <div><button class="btn btn--ghost btn--sm" type="button" id="lAdd">${ICONS.plus}Шат нэмэх</button></div>
            <div class="notice notice--info" id="lPreview"></div>
          </div>
          ${saveBtn('lSave')}
        </form>

        <form class="card" id="stPay" novalidate>
          <div class="card__head"><h2>Төлбөр</h2><div class="spacer"></div><img class="qpay-logo" src="/img/pay/qpay.png" alt="QPay"></div>
          <div class="card__body form-grid">
            <div class="qpay-status">
              ${q.mode === 'live' ? '<span class="chip chip--ok"><i class="dot"></i>Бодит горим (live)</span>' : '<span class="chip chip--warn"><i class="dot"></i>Туршилтын горим (mock)</span>'}
            </div>
            <div class="pay-logos" aria-label="QPay-ээр төлөх боломжтой банк, апп">
              ${['khanbank', 'statebank', 'tdbbank', 'xacbank', 'golomt', 'bogdbank', 'capitronbank', 'ckbank', 'transbank', 'mbank', 'arig', 'most', 'socialpay', 'monpay', 'hipay', 'pocket', 'storepay', 'ard']
                .filter((n) => n !== 'golomt').map((n) => `<img src="/img/pay/${n}.png" alt="${n}" title="${n}" loading="lazy">`).join('')}
            </div>
            <p class="hint">Хэрэглэгч QPay QR уншуулах эсвэл дээрх банк, зээлийн аппаар шууд төлнө.</p>
            <dl class="kv">
              <dt>API хаяг</dt><dd>${esc(q.base_url || '—')}</dd>
              <dt>Invoice code</dt><dd>${esc(q.invoice_code || '—')}</dd>
              <dt>Public URL (callback)</dt><dd>${esc(q.public_url || '—')}</dd>
            </dl>
            <p class="hint" style="font-size:12.5px;line-height:1.6">
              QPay мерчантын мэдээллийг серверийн орчны хувьсагчаар тохируулна:
              <code class="env">QPAY_USERNAME</code>, <code class="env">QPAY_PASSWORD</code>, <code class="env">QPAY_INVOICE_CODE</code>,
              мөн QPay callback хүлээн авах нийтийн хаяг <code class="env">PUBLIC_URL</code>. Тохируулаагүй бол систем туршилтын (mock) горимд ажиллаж, төлбөрийг туршилтын хуудсаар баталгаажуулна. Өөрчилсний дараа серверийг дахин эхлүүлнэ.
            </p>
            <div class="field" style="max-width:260px">
              <label for="pTtl">Нэхэмжлэхийн хүчинтэй хугацаа</label>
              <div class="input-suffix"><input class="input num" id="pTtl" type="number" min="5" max="1440" step="5" value="${esc(S.payment.invoice_ttl_minutes)}"><em>мин</em></div>
              <span class="hint">Хугацаандаа төлөгдөөгүй захиалга автоматаар цуцлагдаж үлдэгдэл буцна (5–1440)</span>
            </div>
          </div>
          ${saveBtn('pSave')}
        </form>

        <form class="card" id="stPw" novalidate>
          <div class="card__head"><h2>Нууц үг солих</h2></div>
          <div class="card__body form-grid">
            <input type="text" autocomplete="username" value="${esc(App.user)}" hidden>
            <div class="field"><label for="pwCur">Одоогийн нууц үг</label><input class="input" id="pwCur" type="password" autocomplete="current-password"></div>
            <div class="form-row">
              <div class="field"><label for="pwNew">Шинэ нууц үг</label><input class="input" id="pwNew" type="password" autocomplete="new-password" minlength="8"><span class="hint">Хамгийн багадаа 8 тэмдэгт</span></div>
              <div class="field"><label for="pwNew2">Шинэ нууц үг давтах</label><input class="input" id="pwNew2" type="password" autocomplete="new-password"></div>
            </div>
            <p class="error-text" id="pwErr" hidden></p>
          </div>
          <div class="card__foot"><button class="btn btn--primary" type="submit" id="pwSave">${ICONS.lock}Нууц үг солих</button></div>
        </form>
      </div>
    </div>`;

  const val = (sel) => $(sel, root).value.trim();

  /* ---- Байгууллага ---- */
  $('#stBiz', root).addEventListener('submit', (e) => {
    e.preventDefault();
    put('business', {
      name: val('#bName'), tagline: val('#bTag'),
      phones: val('#bPhones').split(',').map((s) => s.trim()).filter(Boolean),
      email: val('#bEmail'), hours: val('#bHours'), address: val('#bAddr'), address_note: val('#bAddrNote'),
      facebook: val('#bFb'), instagram: val('#bIg'),
    }, $('#bSave', root));
  });

  /* ---- Хүргэлт ---- */
  $('#stDel', root).addEventListener('submit', (e) => {
    e.preventDefault();
    put('delivery', { fee: Number(val('#dFee')) || 0, free_over: Number(val('#dFree')) || 0, note: val('#dNote') }, $('#dSave', root));
  });

  /* ---- Төлбөр ---- */
  $('#stPay', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await put('payment', { invoice_ttl_minutes: Number(val('#pTtl')) || 30 }, $('#pSave', root));
    if (r) $('#pTtl', root).value = r.invoice_ttl_minutes;
  });

  /* ---- Гишүүнчлэл ---- */
  let tiers = S.loyalty.tiers.map((t) => ({ ...t }));
  const renderTiers = () => {
    $('#lTiers', root).innerHTML = tiers.map((t, i) => `
      <div class="tier-edit" data-row="${i}">
        <div class="input-suffix"><input class="input num" type="number" min="1" step="1" data-k="min_order" value="${esc(t.min_order)}" ${i === 0 ? 'disabled title="Эхний шат 1-р захиалгаас эхэлнэ"' : ''} aria-label="Захиалгын дугаар"><em>-р</em></div>
        <div class="input-suffix"><input class="input num" type="number" min="0" max="100" step="1" data-k="pct" value="${esc(t.pct)}" aria-label="Хямдрал хувь"><em>%</em></div>
        <input class="input" data-k="name" maxlength="40" value="${esc(t.name)}" aria-label="Шатны нэр" placeholder="Шатны нэр">
        <button type="button" class="btn btn--icon btn--ghost" data-rm="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Устгах" title="Устгах">${ICONS.trash}</button>
      </div>`).join('');
    renderTierPreview();
  };
  const renderTierPreview = () => {
    const sorted = tiers.map((t, i) => ({ ...t, min_order: i === 0 ? 1 : Math.max(1, Math.floor(Number(t.min_order) || 1)) }))
      .sort((a, b) => a.min_order - b.min_order);
    $('#lPreview', root).innerHTML = `${ICONS.info}<span>${sorted.map((t, i) => {
      const nx = sorted[i + 1];
      const range = nx ? (nx.min_order - t.min_order > 1 ? `${t.min_order}–${nx.min_order - 1}-р` : `${t.min_order}-р`) : `${t.min_order}-р ба цаашид`;
      return `${range} захиалга: <b>${esc(Number(t.pct) || 0)}%</b>`;
    }).join(' · ')}</span>`;
  };
  renderTiers();
  $('#lTiers', root).addEventListener('input', (e) => {
    const inp = e.target.closest('[data-k]');
    if (!inp) return;
    const i = +inp.closest('[data-row]').dataset.row;
    tiers[i][inp.dataset.k] = inp.dataset.k === 'name' ? inp.value : inp.value;
    renderTierPreview();
  });
  $('#lTiers', root).addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    tiers.splice(+rm.dataset.rm, 1);
    renderTiers();
  });
  $('#lAdd', root).onclick = () => {
    if (tiers.length >= 10) return toast('10 хүртэл шат нэмнэ', 'err');
    const last = tiers[tiers.length - 1] || { min_order: 0, pct: 0 };
    tiers.push({ min_order: (Number(last.min_order) || 0) + 1, pct: Math.min(100, (Number(last.pct) || 0) + 10), name: '' });
    renderTiers();
    const inputs = $$('#lTiers [data-k="name"]', root);
    inputs[inputs.length - 1].focus();
  };
  $('#stLoy', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const clean = tiers.map((t, i) => ({
      min_order: i === 0 ? 1 : Math.floor(Number(t.min_order)),
      pct: Number(t.pct),
      name: String(t.name || '').trim(),
    }));
    for (const t of clean) {
      if (!Number.isFinite(t.min_order) || t.min_order < 1) return toast('Захиалгын дугаар 1-ээс их бүхэл тоо байна', 'err');
      if (!Number.isFinite(t.pct) || t.pct < 0 || t.pct > 100) return toast('Хямдрал 0–100% хооронд байна', 'err');
      if (!t.name) return toast('Шат бүрд нэр өгнө үү', 'err');
    }
    const seen = new Set();
    for (const t of clean) {
      if (seen.has(t.min_order)) return toast(`${t.min_order}-р захиалгын шат давхардсан байна`, 'err');
      seen.add(t.min_order);
    }
    const r = await put('loyalty', { enabled: $('#lEnabled', root).checked, tiers: clean }, $('#lSave', root));
    if (r) { tiers = r.tiers.map((t) => ({ ...t })); renderTiers(); }
  });

  /* ---- Нүүр хуудас ---- */
  let banners = (S.home.banners || []).map((x) => ({ ...x }));
  const renderBanners = () => {
    $('#hBanners', root).innerHTML = banners.length ? banners.map((bn, i) => `
      <div class="banner-row" data-row="${i}">
        ${bn.image ? `<img class="banner-row__img" src="${esc(bn.image)}" alt="">` : `<span class="banner-row__img thumb" style="height:auto">${ICONS.image}</span>`}
        <div class="form-grid" style="gap:8px">
          <div style="display:flex;gap:6px">
            <input class="input input--sm" data-k="image" value="${esc(bn.image)}" placeholder="Зургийн URL" aria-label="Зургийн URL">
            <label class="btn btn--ghost btn--sm upload-btn" title="Зураг оруулах">${ICONS.upload}<input type="file" accept="image/jpeg,image/png,image/webp" data-up="${i}"></label>
          </div>
          <input class="input input--sm" data-k="title" value="${esc(bn.title)}" maxlength="120" placeholder="Гарчиг" aria-label="Гарчиг">
          <div style="display:flex;gap:6px">
            <input class="input input--sm" data-k="link" value="${esc(bn.link)}" maxlength="300" placeholder="Холбоос, жиш: /products" aria-label="Холбоос">
            <button type="button" class="btn btn--icon btn--sm btn--danger" data-rm="${i}" aria-label="Устгах" title="Устгах">${ICONS.trash}</button>
          </div>
        </div>
      </div>`).join('') : '<p class="hint">Баннер алга</p>';
  };
  renderBanners();
  const hb = $('#hBanners', root);
  hb.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-k]');
    if (!inp) return;
    banners[+inp.closest('[data-row]').dataset.row][inp.dataset.k] = inp.value;
  });
  hb.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-k="image"]');
    if (inp) renderBanners();
  });
  hb.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { banners.splice(+rm.dataset.rm, 1); renderBanners(); }
  });
  hb.addEventListener('change', async (e) => {
    const up = e.target.closest('[data-up]');
    if (!up || !up.files[0]) return;
    const file = up.files[0];
    const i = +up.dataset.up;
    if (file.size > 8 * 1024 * 1024) return toast('Зураг 8MB-аас их байна', 'err');
    const fd = new FormData();
    fd.append('image', file);
    up.closest('label').classList.add('is-disabled');
    try {
      const r = await api('/api/admin/uploads', { method: 'POST', body: fd });
      banners[i].image = r.url;
      toast('Зураг оруулагдлаа — хадгалахаа мартуузай');
    } catch (ex) { toast(ex.message, 'err'); }
    renderBanners();
  });
  $('#hAdd', root).onclick = () => {
    if (banners.length >= 8) return toast('8 хүртэл баннер', 'err');
    banners.push({ image: '', link: '', title: '' });
    renderBanners();
  };
  $('#stHome', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = banners.find((x) => x.image && !/^(\/|https?:\/\/)/.test(x.image));
    if (bad) return toast('Зургийн URL нь / эсвэл https:// -ээр эхэлнэ', 'err');
    const r = await put('home', { featured_title: val('#hTitle'), banners: banners.filter((x) => x.image) }, $('#hSave', root));
    if (r) { banners = r.banners.map((x) => ({ ...x })); renderBanners(); }
  });

  /* ---- Нууц үг ---- */
  $('#stPw', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pwErr', root);
    err.hidden = true;
    const show = (m) => { err.textContent = m; err.hidden = false; };
    const cur = $('#pwCur', root).value;
    const n1 = $('#pwNew', root).value;
    const n2 = $('#pwNew2', root).value;
    if (!cur) return show('Одоогийн нууц үгээ оруулна уу');
    if (n1.length < 8) return show('Шинэ нууц үг хамгийн багадаа 8 тэмдэгт');
    if (n1 !== n2) return show('Шинэ нууц үг таарахгүй байна');
    await withBusy($('#pwSave', root), async () => {
      try {
        await api('/api/admin/password', { method: 'POST', body: { current_password: cur, new_password: n1 } });
        ['#pwCur', '#pwNew', '#pwNew2'].forEach((s) => { $(s, root).value = ''; });
        toast('Нууц үг солигдлоо');
      } catch (ex) { show(ex.message); }
    });
  });
};
