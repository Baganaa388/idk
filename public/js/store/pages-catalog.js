// Нүүр, барааны жагсаалт, барааны дэлгэрэнгүй
import { state, api, esc, money, setTitle, isStale, onLeave, navigate, addToCart, loading, loginUrl, ApiError, countUp, reducedMotion, buttonAdd } from './core.js';
import {
  icons,
  productGrid,
  breadcrumbs,
  findCategory,
  flattenCategories,
  pagination,
  priceHtml,
  qtyStepper,
  emptyState,
  tierLabel,
  tierBenefit,
  paymentLogos,
} from './components.js';

// ======================= Нүүр: hero =======================
const HERO_TINTS = ['#FBEFE3', '#E7F0FA', '#FBE7EE'];

function heroMain(products) {
  const b = state.site.business;
  const tiers = (state.site.loyalty && state.site.loyalty.enabled && state.site.loyalty.tiers) || [];
  const maxPct = tiers.reduce((m, t) => Math.max(m, t.pct), 0);
  const shown = products.filter((p) => p.image).slice(0, 3);
  const lead = shown[0];
  return `<div class="hero-main">
    <img src="/img/brand/logo-mark-dark.png" alt="" class="hero-leaf" aria-hidden="true">
    <div class="hero-copy">
      <span class="hero-kicker hero-in" style="--d:0ms"><img src="/img/brand/logo-mark-dark.png" alt="" width="18" height="18">${esc(b.tagline || b.name)}</span>
      <h1 class="hero-in" style="--d:70ms">Эрүүл жин, <span class="hl">эрч хүчтэй</span> өдөр бүр</h1>
      <p class="hero-lead hero-in" style="--d:140ms">Жин хасах цай, кофе, капсул болон биеийн арчилгааны бүтээгдэхүүнийг албан ёсны борлуулагчаас. QPay-ээр төлж, дахин авах бүрдээ хямдрал эдлээрэй.</p>
      <div class="hero-cta hero-in" style="--d:210ms">
        <a href="/products" class="btn btn-primary btn-lg">Бүтээгдэхүүн үзэх ${icons.arrowRight(18)}</a>
        ${tiers.length > 1 ? '<a href="#loyalty" class="btn btn-outline btn-lg" data-scroll-to="loyalty">Гишүүнчлэлийн хямдрал</a>' : ''}
      </div>
      <ul class="hero-chips hero-in" style="--d:280ms">
        ${b.hours ? `<li>${icons.clock(16)}<span>${esc(b.hours)}</span></li>` : ''}
        ${(b.phones || []).length ? `<li>${icons.phone(16)}<span>${b.phones.map((ph) => `<a href="tel:${esc(ph.replace(/\D/g, ''))}" data-external>${esc(ph)}</a>`).join(', ')}</span></li>` : ''}
        ${b.address ? `<li class="hero-chip-addr">${icons.pin(16)}<span>${esc(b.address)}</span></li>` : ''}
      </ul>
    </div>
    <div class="hero-visual" data-hero-visual>
      <span class="hero-shape hero-shape-a"></span>
      <span class="hero-shape hero-shape-b"></span>
      ${shown
        .map(
          (p, i) => `<a href="/p/${esc(encodeURIComponent(p.slug))}" class="hero-prod hero-prod-${i + 1}" style="--d:${160 + i * 110}ms;--tint:${HERO_TINTS[i]}" title="${esc(p.name)}">
          <span class="hero-prod-inner"><img src="${esc(p.image)}" alt="${esc(p.name)}" width="400" height="400" data-tint ${i === 0 ? 'fetchpriority="high"' : ''}></span>
        </a>`
        )
        .join('')}
      ${
        lead
          ? `<a href="/p/${esc(encodeURIComponent(lead.slug))}" class="hero-price-card" style="--d:520ms">
          <span class="hero-price-thumb" style="--tint:${HERO_TINTS[0]}"><img src="${esc(lead.image)}" alt="" width="48" height="48"></span>
          <span class="hero-price-text"><small>${esc(lead.brand || 'Онцлох')}</small><b>${esc(lead.name)}</b><span>${money(lead.price)}</span></span>
        </a>`
          : ''
      }
      ${maxPct > 0 ? `<span class="hero-badge" style="--d:620ms"><span class="hero-badge-ring" aria-hidden="true"></span><b>${esc(maxPct)}%</b><small>хүртэл хямдрал</small></span>` : ''}
    </div>
  </div>`;
}

// Барааны зургийн дундаж өнгөөр картын зөөлөн дэвсгэр өнгийг тодорхойлно
function tintFromImage(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A < 200 || (R > 235 && G > 235 && B > 235)) continue;
      const max = Math.max(R, G, B);
      const min = Math.min(R, G, B);
      const w = 1 + (max - min) / 40; // өнгөлөг пикселийг илүү жинтэй
      r += R * w;
      g += G * w;
      bl += B * w;
      n += w;
    }
    if (n < 5) return null;
    const [ar, ag, ab] = [r / n, g / n, bl / n];
    // Өнгө муутай (саарал, хүрэн) зурагт бэлэн palette ашиглана
    if (Math.max(ar, ag, ab) - Math.min(ar, ag, ab) < 38) return null;
    const mix = (v) => Math.round(v / n + (255 - v / n) * 0.82);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(bl)})`;
  } catch {
    return null;
  }
}

function bindHeroVisual(root) {
  root.querySelectorAll('img[data-tint]').forEach((img) => {
    const apply = () => {
      const t = tintFromImage(img);
      if (t) img.closest('.hero-prod').style.setProperty('--tint', t);
      const thumb = root.querySelector('.hero-price-thumb');
      if (t && thumb && img.closest('.hero-prod-1')) thumb.style.setProperty('--tint', t);
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  });
  const vis = root.querySelector('[data-hero-visual]');
  if (!vis || reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let raf = 0;
  const onMove = (e) => {
    const r = vis.getBoundingClientRect();
    const mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      vis.style.setProperty('--mx', mx.toFixed(3));
      vis.style.setProperty('--my', my.toFixed(3));
    });
  };
  const hero = vis.closest('.hero-main');
  const reset = () => {
    vis.style.setProperty('--mx', '0');
    vis.style.setProperty('--my', '0');
  };
  hero.addEventListener('mousemove', onMove);
  hero.addEventListener('mouseleave', reset);
  onLeave(() => cancelAnimationFrame(raf));
}

function heroSlider(banners, products) {
  const slides = [`<div class="hero-slide is-active" data-slide="0">${heroMain(products)}</div>`];
  if (banners.length > 1) {
    banners.forEach((bn, i) => {
      const img = `<img src="${esc(bn.image)}" alt="${esc(bn.title || '')}" width="1600" height="616" loading="lazy">`;
      slides.push(`<div class="hero-slide hero-slide-img" data-slide="${i + 1}" aria-hidden="true">${bn.link ? `<a href="${esc(bn.link)}" tabindex="-1">${img}</a>` : img}</div>`);
    });
  }
  const multi = slides.length > 1;
  return `<section class="hero ${multi ? 'hero-multi' : ''}" ${multi ? 'data-slider' : ''} aria-roledescription="${multi ? 'carousel' : 'banner'}">
    <div class="hero-track">${slides.join('')}</div>
    ${
      multi
        ? `<button type="button" class="hero-nav hero-prev" data-slide-step="-1" aria-label="Өмнөх">${icons.chevronLeft(22)}</button>
    <button type="button" class="hero-nav hero-next" data-slide-step="1" aria-label="Дараах">${icons.chevronRight(22)}</button>
    <div class="hero-dots">${slides.map((_, i) => `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-slide-go="${i}" aria-label="${i + 1}-р слайд"></button>`).join('')}</div>`
        : ''
    }
  </section>`;
}

function bindSlider(root) {
  root.querySelectorAll('[data-scroll-to]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const target = document.getElementById(a.dataset.scrollTo);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    })
  );
  const el = root.querySelector('[data-slider]');
  if (!el) return;
  const slides = [...el.querySelectorAll('.hero-slide')];
  const dots = [...el.querySelectorAll('[data-slide-go]')];
  let cur = 0;
  const go = (n, dir = 1) => {
    const next = (n + slides.length) % slides.length;
    if (next === cur) return;
    slides.forEach((s, i) => {
      s.classList.toggle('is-active', i === next);
      s.classList.toggle('is-leaving', i === cur);
      s.style.setProperty('--dir', dir);
      s.setAttribute('aria-hidden', String(i !== next));
    });
    dots.forEach((d, i) => d.classList.toggle('is-active', i === next));
    cur = next;
  };
  let timer = null;
  const start = () => {
    stop();
    if (!reducedMotion()) timer = setInterval(() => go(cur + 1, 1), 6500);
  };
  const stop = () => clearInterval(timer);
  el.addEventListener('click', (e) => {
    const step = e.target.closest('[data-slide-step]');
    const dot = e.target.closest('[data-slide-go]');
    if (!step && !dot) return;
    if (step) go(cur + Number(step.dataset.slideStep), Number(step.dataset.slideStep));
    else go(Number(dot.dataset.slideGo), Number(dot.dataset.slideGo) > cur ? 1 : -1);
    start();
  });
  el.addEventListener('mouseenter', stop);
  el.addEventListener('mouseleave', start);
  // Хуруугаар шудрах
  let x0 = null;
  el.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 48) {
      go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      start();
    }
  });
  start();
  onLeave(stop);
}

function section(title, href, inner, extraCls = '') {
  return `<section class="section ${extraCls}">
    <div class="section-head reveal"><h2>${esc(title)}</h2>${href ? `<a href="${esc(href)}" class="section-more">Бүгдийг харах ${icons.chevronRight(16)}</a>` : ''}</div>
    ${inner}
  </section>`;
}

// ======================= Гишүүнчлэл =======================
export function loyaltySection() {
  const l = state.site.loyalty;
  if (!l || !l.enabled || !l.tiers || !l.tiers.length) return '';
  const tiers = l.tiers;
  const n = tiers.length;
  const me = state.user && state.loyalty && state.loyalty.enabled ? state.loyalty : null;
  const curIdx = me ? me.tier.index : -1;
  // Явцын шугам: нэвтэрсэн бол одоогийн шатны төв хүртэл, үгүй бол бүтэн
  const progress = me ? Math.round(((curIdx + 0.5) / n) * 100) : 100;
  const side = me
    ? `<span class="lside-kicker">Таны дараагийн захиалга</span>
      <div class="lside-seq"><b>${esc(me.next_order_seq)}</b><span>-р захиалга</span></div>
      <div class="lside-pct"><span data-count="${esc(me.tier.pct)}" data-suffix="%">${esc(me.tier.pct)}%</span> хямдрал</div>
      <p class="lside-note">${me.tier.next ? `Дахиад <b>${esc(me.tier.next.orders_left)}</b> захиалгын дараа <b>${esc(me.tier.next.pct)}%</b> болно.` : 'Та хамгийн өндөр шатанд хүрсэн байна. Хямдрал бүх захиалгад тань үйлчилнэ.'}</p>
      <a href="/products" class="btn btn-accent btn-block">Бараа үзэх ${icons.arrowRight(16)}</a>
      <a href="/account/loyalty" class="lside-link">Миний гишүүнчлэл</a>`
    : `<span class="lside-kicker">Эхлэхэд амархан</span>
      <p class="lside-lead">Бүртгүүлээд захиалга бүрээрээ шатаа ахиулж, <b>${esc(tiers[n - 1].pct)}%</b> хүртэл хямдрал аваарай.</p>
      <ul class="lside-list">
        <li>${icons.check(16)} Карт, код шаардлагагүй</li>
        <li>${icons.check(16)} Хямдрал сагсанд автоматаар</li>
        <li>${icons.check(16)} Утас эсвэл и-мэйлээр бүртгүүлнэ</li>
      </ul>
      <a href="/register" class="btn btn-accent btn-block">Бүртгүүлэх ${icons.arrowRight(16)}</a>
      <a href="${esc(loginUrl('/'))}" class="lside-link">Бүртгэлтэй юу? Нэвтрэх</a>`;

  return `<section class="loyalty2 reveal" id="loyalty" style="--n:${n}">
    <img src="/img/brand/logo-mark-light.png" alt="" class="loyalty2-leaf" aria-hidden="true">
    <div class="loyalty2-head">
      <span class="kicker kicker-accent">Гишүүнчлэлийн хөтөлбөр</span>
      <h2>Дахин авах тусам илүү хямд</h2>
      <p>Хямдрал таны төлөгдсөн захиалгын тоогоор автоматаар тооцогдож, сагсанд шууд хэрэглэгдэнэ.</p>
    </div>
    <div class="loyalty2-body">
      <div class="lstairs-scroll">
        <div class="lstairs" style="--progress:${progress}%">
          <ol class="lstairs-cards">
            ${tiers
              .map((t, i) => {
                const state_ = i === curIdx ? 'is-current' : me && i < curIdx ? 'is-passed' : '';
                return `<li class="lcard ${state_}" style="--i:${i};--d:${120 + i * 130}ms">
                  ${i === curIdx ? '<span class="lcard-ribbon">Таны шат</span>' : ''}
                  <span class="lcard-step">${i + 1}-р шат</span>
                  <span class="lcard-name">${esc(t.name)}</span>
                  <span class="lcard-pct"><span data-count="${esc(t.pct)}" data-suffix="%">${esc(t.pct)}%</span></span>
                  <span class="lcard-label">${esc(tierLabel(tiers, i))}</span>
                  <span class="lcard-benefit">${esc(tierBenefit(t))}</span>
                  <img src="/img/brand/logo-mark-${i === curIdx ? 'dark' : 'light'}.png" alt="" class="lcard-leaf" aria-hidden="true">
                </li>`;
              })
              .join('')}
          </ol>
          <div class="lprogress" aria-hidden="true">
            <span class="lprogress-fill"><span class="lprogress-dot"></span></span>
          </div>
          <ol class="lprogress-labels" aria-hidden="true">${tiers.map((t, i) => `<li class="${i === curIdx ? 'is-current' : ''}">${i === n - 1 && n > 1 ? `${esc(t.min_order)}-р ба цаашид` : `${esc(t.min_order)}-р захиалга`}</li>`).join('')}</ol>
        </div>
      </div>
      <aside class="lside">${side}</aside>
    </div>
  </section>`;
}

const JUICE = [
  ['Бууцай', '1 аяга', 'Төмөр, фолийн хүчлээр баялаг'],
  ['Өргөст хэмх', '1/2 аяга', 'Жижиглэсэнтэй тэнцэх хэмжээ'],
  ['Ногоон алим', '1 ширхэг, хэрчсэн', 'Амин дэм, эслэгээр баялаг'],
  ['Цагаан гаа', '1 жижиг хэсэг', 'Дархлааг дэмжиж, үрэвслийг бууруулна'],
  ['Селдерей', '2 иш', 'Биеэс хорыг гадагшлуулж, цэвэрлэнэ'],
];

function tipBlock() {
  return `<section class="section">
    <div class="section-head reveal"><h2>Зөвлөгөө</h2></div>
    <article class="tip reveal">
      <div class="tip-img"><img src="/img/brand/green-juice.webp" alt="Дархлаа дэмжих ногоон шүүс" loading="lazy" width="600" height="600"></div>
      <div class="tip-body">
        <span class="tip-kicker">Эрүүл хооллолт</span>
        <h3>Дархлаа дэмжих ногоон шүүс</h3>
        <p class="muted">Өглөө бүр уухад тохиромжтой, энгийн орцтой ногоон шүүс. Бүх орцыг хольцлуураар нунтаглаад шууд ууна.</p>
        <ul class="ingredients">
          ${JUICE.map(([n, a, d]) => `<li><div><b>${esc(n)}</b> <span class="muted">(${esc(a)})</span></div><div class="ingredient-desc">${esc(d)}</div></li>`).join('')}
        </ul>
      </div>
    </article>
  </section>`;
}

function categoryTiles(images) {
  const flat = flattenCategories(state.site.categories).filter((c) => (!c.children || !c.children.length) && c.total_count > 0);
  if (!flat.length) return '';
  return `<section class="section">
    <div class="section-head reveal"><h2>Ангилал</h2></div>
    <div class="cat-tiles">
      ${flat
        .map(
          (c, i) => `<a href="/c/${esc(c.slug)}" class="cat-tile reveal" style="--d:${i * 60}ms">
          <span class="cat-tile-img">${images[c.slug] ? `<img src="${esc(images[c.slug])}" alt="" loading="lazy" width="120" height="120">` : icons.box(36)}</span>
          <span class="cat-tile-name">${esc(c.name)}</span>
          <span class="cat-tile-count">${esc(c.total_count)} бараа</span>
        </a>`
        )
        .join('')}
    </div>
  </section>`;
}

export async function homePage({ app, token }) {
  setTitle('');
  const site = state.site;
  loading(app, 'home');
  const [featured, fresh, popular, all] = await Promise.all([
    api('/store/products?featured=1&limit=12'),
    api('/store/products?sort=new&limit=12'),
    api('/store/products?sort=popular&limit=12'),
    api('/store/products?limit=100&sort=popular'),
  ]);
  if (isStale(token)) return;
  const images = {};
  for (const p of all.items) if (p.category_slug && p.image && !images[p.category_slug]) images[p.category_slug] = p.image;
  const heroProducts = featured.items.length ? featured.items : all.items;

  app.innerHTML = `<div class="container home">
    ${heroSlider((site.home && site.home.banners) || [], heroProducts)}
    <div class="perks">
      <div class="perk reveal" style="--d:0ms">${icons.truck(26)}<div><b>Хүргэлт</b><span>${site.delivery.free_over > 0 ? `${money(site.delivery.free_over)}-с дээш үнэгүй` : esc(site.delivery.note || 'Хот дотор хүргэнэ')}</span></div></div>
      <div class="perk reveal" style="--d:60ms">${icons.card(26)}<div><b>QPay төлбөр</b><span>Банкны апп, Storepay, Pocket Zero</span></div></div>
      <div class="perk reveal" style="--d:120ms">${icons.tag(26)}<div><b>Гишүүнчлэл</b><span>Дахин авах бүрт хямдрал</span></div></div>
      <div class="perk reveal" style="--d:180ms">${icons.shield(26)}<div><b>Баталгаат бараа</b><span>Албан ёсны борлуулагч</span></div></div>
    </div>
    ${categoryTiles(images)}
    ${featured.items.length ? section((site.home && site.home.featured_title) || 'Онцлох бүтээгдэхүүн', '/products', productGrid(featured.items, 'pgrid-home')) : ''}
    ${loyaltySection()}
    ${fresh.items.length ? section('Шинэ бүтээгдэхүүн', '/products?sort=new', productGrid(fresh.items, 'pgrid-home')) : ''}
    ${popular.items.length ? section('Их борлуулалттай', '/products?sort=popular', productGrid(popular.items, 'pgrid-home')) : ''}
    ${tipBlock()}
  </div>`;
  bindSlider(app);
  bindHeroVisual(app);
  // Гар утсан дээр одоогийн шатыг харагдах байрлалд гүйлгэнэ
  const cur = app.querySelector('.lcard.is-current');
  const sc = app.querySelector('.lstairs-scroll');
  if (cur && sc && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, cur.offsetLeft - (sc.clientWidth - cur.offsetWidth) / 2);
  countUp(app);
}

// ======================= Жагсаалт =======================
const SORTS = [
  ['new', 'Шинэ'],
  ['price_asc', 'Үнэ өсөхөөр'],
  ['price_desc', 'Үнэ буурахаар'],
  ['popular', 'Их зарагдсан'],
];

export async function listingPage({ app, params, query, token }) {
  const slug = params.slug ? decodeURIComponent(params.slug) : '';
  const cat = slug ? findCategory(slug) : null;
  if (slug && !cat) throw new ApiError('Ангилал олдсонгүй', 404);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const sort = SORTS.some((s) => s[0] === query.sort) ? query.sort : 'new';
  const q = (query.q || '').trim();
  const brand = query.brand || '';
  const min = /^\d+$/.test(query.min || '') ? query.min : '';
  const max = /^\d+$/.test(query.max || '') ? query.max : '';

  const basePath = cat ? `/c/${encodeURIComponent(cat.slug)}` : '/products';
  const buildUrl = (over = {}) => {
    const p = new URLSearchParams();
    const vals = { q, brand, min, max, sort: sort === 'new' ? '' : sort, page: '', ...over };
    for (const [k, v] of Object.entries(vals)) if (v !== '' && v !== undefined && v !== null && !(k === 'page' && String(v) === '1')) p.set(k, v);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const title = cat ? cat.name : q ? `"${q}" хайлтын үр дүн` : brand ? brand : 'Бүх бараа';
  setTitle(cat ? cat.name : q ? `Хайлт: ${q}` : 'Бүх бараа');

  const apiQ = new URLSearchParams({ sort, page: String(page), limit: '24' });
  if (cat) apiQ.set('category', cat.slug);
  if (q) apiQ.set('q', q);
  if (brand) apiQ.set('brand', brand);
  if (min) apiQ.set('min', min);
  if (max) apiQ.set('max', max);

  if (!app.querySelector('.listing')) loading(app, 'listing');
  const data = await api(`/store/products?${apiQ}`);
  if (isStale(token)) return;

  const crumbs = [];
  if (cat) {
    crumbs.push({ label: 'Бүх бараа', href: '/products' });
    if (cat.parent) crumbs.push({ label: cat.parent.name, href: `/c/${cat.parent.slug}` });
    crumbs.push({ label: cat.name });
  } else crumbs.push({ label: 'Бүх бараа' });

  const keepParams = new URLSearchParams(location.search);
  keepParams.delete('page');
  const keepQs = keepParams.toString() ? `?${keepParams}` : '';
  const catTree = (nodes, depth) =>
    `<ul class="ftree depth-${depth}">${nodes
      .map(
        (c) => `<li>
        <a href="/c/${esc(c.slug)}${esc(keepQs)}" class="${cat && cat.slug === c.slug ? 'is-active' : ''}">${esc(c.name)}<span>${esc(c.total_count)}</span></a>
        ${c.children && c.children.length ? catTree(c.children, depth + 1) : ''}
      </li>`
      )
      .join('')}</ul>`;

  const brands = state.site.brands || [];
  const activeFilters = [
    q && { label: `Хайлт: ${q}`, href: buildUrl({ q: '' }) },
    brand && { label: `Брэнд: ${brand}`, href: buildUrl({ brand: '' }) },
    (min || max) && { label: `Үнэ: ${min ? money(min) : '0₮'} – ${max ? money(max) : '...'}`, href: buildUrl({ min: '', max: '' }) },
  ].filter(Boolean);

  app.innerHTML = `<div class="container listing">
    ${breadcrumbs(crumbs)}
    <div class="listing-layout">
      <aside class="filters" data-filters>
        <div class="filters-head"><b>Шүүлтүүр</b><button type="button" class="icon-btn" data-filters-close aria-label="Хаах">${icons.close(20)}</button></div>
        <div class="fblock">
          <h3>Ангилал</h3>
          <ul class="ftree"><li><a href="/products${esc(keepQs)}" class="${!cat ? 'is-active' : ''}">Бүх бараа</a></li></ul>
          ${catTree(state.site.categories || [], 0)}
        </div>
        ${
          brands.length
            ? `<div class="fblock"><h3>Брэнд</h3><ul class="fbrands">
            ${brands
              .map(
                (b) => `<li><a href="${esc(buildUrl({ brand: brand === b.brand ? '' : b.brand }))}" class="fcheck ${brand === b.brand ? 'is-active' : ''}"><span class="box">${brand === b.brand ? icons.check(12) : ''}</span>${esc(b.brand)}<span class="count">${esc(b.n)}</span></a></li>`
              )
              .join('')}
          </ul></div>`
            : ''
        }
        <form class="fblock" data-price>
          <h3>Үнэ</h3>
          <div class="price-range">
            <input type="number" name="min" min="0" step="1000" placeholder="Доод" value="${esc(min)}" aria-label="Доод үнэ">
            <span>–</span>
            <input type="number" name="max" min="0" step="1000" placeholder="Дээд" value="${esc(max)}" aria-label="Дээд үнэ">
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-sm">Шүүх</button>
        </form>
      </aside>
      <section class="listing-main">
        <div class="listing-head">
          <div>
            <h1>${esc(title)}</h1>
            <div class="muted">${esc(data.total)} бараа олдлоо</div>
          </div>
          <div class="listing-tools">
            <button type="button" class="btn btn-outline btn-sm filters-toggle" data-filters-open>${icons.filter(16)} Шүүлтүүр</button>
            <div class="sort">
              <span class="hide-sm">Эрэмбэлэх:</span>
              <select data-sort aria-label="Эрэмбэлэх">${SORTS.map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
            </div>
          </div>
        </div>
        ${activeFilters.length ? `<div class="chips">${activeFilters.map((f) => `<a href="${esc(f.href)}" class="chip">${esc(f.label)} ${icons.close(14)}</a>`).join('')}<a href="${basePath}" class="chip-clear">Бүгдийг арилгах</a></div>` : ''}
        ${
          data.items.length
            ? productGrid(data.items, 'pgrid-listing') + pagination(data.page, data.pages, (n) => buildUrl({ page: n }))
            : emptyState('Бараа олдсонгүй', 'Шүүлтүүрээ өөрчлөх эсвэл өөр түлхүүр үгээр хайж үзнэ үү.', { href: '/products', label: 'Бүх бараа үзэх' })
        }
      </section>
    </div>
  </div>`;

  app.querySelector('[data-sort]').addEventListener('change', (e) => navigate(buildUrl({ sort: e.target.value === 'new' ? '' : e.target.value }), { scroll: false }));
  app.querySelector('[data-price]').addEventListener('submit', (e) => {
    e.preventDefault();
    let mn = e.target.min.value.trim();
    let mx = e.target.max.value.trim();
    if (mn && mx && Number(mn) > Number(mx)) [mn, mx] = [mx, mn];
    navigate(buildUrl({ min: mn, max: mx }));
  });
  const filters = app.querySelector('[data-filters]');
  app.querySelector('[data-filters-open]').addEventListener('click', () => filters.classList.add('is-open'));
  app.querySelector('[data-filters-close]').addEventListener('click', () => filters.classList.remove('is-open'));
}

// ======================= Дэлгэрэнгүй =======================
export async function productPage({ app, params, token }) {
  loading(app, 'product');
  const { product: p, related } = await api(`/store/products/${encodeURIComponent(decodeURIComponent(params.slug))}`);
  if (isStale(token)) return;
  setTitle(p.name);

  const images = (p.images && p.images.length ? p.images.map((i) => i.url) : p.image ? [p.image] : []).filter(Boolean);
  const cat = p.category_slug ? findCategory(p.category_slug) : null;
  const crumbs = [{ label: 'Бүх бараа', href: '/products' }];
  if (cat && cat.parent) crumbs.push({ label: cat.parent.name, href: `/c/${cat.parent.slug}` });
  if (cat) crumbs.push({ label: cat.name, href: `/c/${cat.slug}` });
  crumbs.push({ label: p.name });

  const stock = Number(p.stock) || 0;
  const stockHtml = !p.in_stock || stock <= 0
    ? `<span class="stock stock-out">${icons.alert(16)} Дууссан</span>`
    : p.low_stock
      ? `<span class="stock stock-low">${icons.alert(16)} Цөөн үлдсэн: ${esc(stock)} ширхэг</span>`
      : `<span class="stock stock-ok">${icons.check(16)} Бэлэн байгаа: ${esc(stock)} ширхэг</span>`;
  const canBuy = p.in_stock && stock > 0;
  const off = Number(p.compare_price) > Number(p.price) ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  const l = state.site.loyalty;
  const delivery = state.site.delivery || {};

  const paragraphs = (txt) =>
    String(txt || '')
      .split(/\n{2,}/)
      .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
      .join('');

  app.innerHTML = `<div class="container product-page">
    ${breadcrumbs(crumbs)}
    <div class="pd">
      <div class="gallery">
        <div class="gallery-main">
          ${images.length ? `<img src="${esc(images[0])}" alt="${esc(p.name)}" data-main width="800" height="800">` : '<span class="img-ph"></span>'}
          ${off ? `<span class="pcard-badges"><span class="badge badge-accent">-${off}%</span></span>` : ''}
        </div>
        ${
          images.length > 1
            ? `<div class="gallery-thumbs">${images
                .map((u, i) => `<button type="button" class="thumb ${i === 0 ? 'is-active' : ''}" data-thumb="${esc(u)}" aria-label="Зураг ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy" width="80" height="80"></button>`)
                .join('')}</div>`
            : ''
        }
      </div>
      <div class="pd-info">
        ${p.brand ? `<a href="/products?brand=${encodeURIComponent(p.brand)}" class="pd-brand">${esc(p.brand)}</a>` : ''}
        <h1 class="pd-name">${esc(p.name)}</h1>
        <div class="pd-meta"><span>Код: <b>${esc(p.sku)}</b></span>${p.category_name ? `<span>Ангилал: ${cat ? `<a href="/c/${esc(cat.slug)}">${esc(p.category_name)}</a>` : esc(p.category_name)}</span>` : ''}</div>
        ${priceHtml(p.price, p.compare_price, 'price-lg')}
        ${p.short_desc ? `<p class="pd-short">${esc(p.short_desc)}</p>` : ''}
        <dl class="pd-specs">
          <div><dt>Үлдэгдэл</dt><dd>${stockHtml}</dd></div>
          ${p.volume ? `<div><dt>Хэмжээ</dt><dd>${esc(p.volume)}</dd></div>` : ''}
        </dl>
        <div class="pd-buy">
          ${canBuy ? qtyStepper(1, stock, 'data-pd-qty') : ''}
          <button type="button" class="btn btn-outline btn-lg" data-pd-add ${canBuy ? '' : 'disabled'}>${icons.cart(20)} Сагсанд нэмэх</button>
          <button type="button" class="btn btn-primary btn-lg" data-pd-buy ${canBuy ? '' : 'disabled'}>Шууд захиалах</button>
        </div>
        <div class="pd-pay"><span>Төлбөрийн боломж:</span>${paymentLogos({ limit: 6, cls: 'paylogos-sm' })}</div>
        ${!state.user && canBuy ? `<p class="pd-login-note muted">Захиалга өгөхийн тулд <a href="${esc(loginUrl())}">нэвтэрнэ</a> үү.</p>` : ''}
        ${
          l && l.enabled && l.tiers && l.tiers.length > 1
            ? `<div class="infobox">
            <div class="infobox-title">${icons.award(18)} Гишүүнчлэлийн хямдрал</div>
            <ul class="tier-inline">${l.tiers.map((t, i) => `<li><span>${esc(tierLabel(l.tiers, i))}</span><b>${esc(tierBenefit(t))}</b></li>`).join('')}</ul>
            ${state.user && state.loyalty && state.loyalty.enabled ? `<div class="infobox-foot">Таны дараагийн захиалга: <b>${esc(state.loyalty.next_order_seq)}-р</b>, хямдрал <b>${esc(state.loyalty.tier.pct)}%</b></div>` : ''}
          </div>`
            : ''
        }
        <div class="infobox infobox-plain">
          <div class="infobox-title">${icons.truck(18)} Хүргэлт</div>
          ${delivery.note ? `<p>${esc(delivery.note)}</p>` : ''}
          <p class="muted">${Number(delivery.fee) > 0 ? `Хүргэлтийн төлбөр ${money(delivery.fee)}` : 'Хүргэлт үнэгүй'}${Number(delivery.free_over) > 0 && Number(delivery.fee) > 0 ? `, ${money(delivery.free_over)}-с дээш захиалгад үнэгүй.` : ''}</p>
        </div>
      </div>
    </div>

    <div class="pd-details">
      ${
        p.benefits && p.benefits.length
          ? `<section class="pd-section"><h2>Үйлчилгээ</h2><ul class="check-list">${p.benefits.map((b) => `<li>${icons.check(18)}<span>${esc(b)}</span></li>`).join('')}</ul></section>`
          : ''
      }
      ${
        p.usage && p.usage.length
          ? `<section class="pd-section"><h2>Хэрэглэх заавар</h2><ol class="num-list">${p.usage.map((u) => `<li>${esc(u)}</li>`).join('')}</ol></section>`
          : ''
      }
      ${p.description ? `<section class="pd-section pd-desc"><h2>Дэлгэрэнгүй</h2>${paragraphs(p.description)}</section>` : ''}
    </div>

    ${related && related.length ? section('Төстэй бүтээгдэхүүн', cat ? `/c/${cat.slug}` : '/products', productGrid(related, 'pgrid-home')) : ''}
  </div>`;

  // Галерей
  const main = app.querySelector('[data-main]');
  app.querySelectorAll('[data-thumb]').forEach((b) =>
    b.addEventListener('click', () => {
      main.src = b.dataset.thumb;
      app.querySelectorAll('[data-thumb]').forEach((x) => x.classList.toggle('is-active', x === b));
    })
  );

  // Тоо ширхэг
  const qtyEl = app.querySelector('[data-pd-qty]');
  const getQty = () => {
    if (!qtyEl) return 1;
    const input = qtyEl.querySelector('input');
    return Math.min(stock, Math.max(1, parseInt(input.value, 10) || 1));
  };
  if (qtyEl) {
    const input = qtyEl.querySelector('input');
    const sync = (v) => {
      const n = Math.min(stock, Math.max(1, v));
      input.value = n;
      qtyEl.querySelector('[data-qty="-1"]').disabled = n <= 1;
      qtyEl.querySelector('[data-qty="1"]').disabled = n >= stock;
    };
    qtyEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qty]');
      if (b) sync(getQty() + Number(b.dataset.qty));
    });
    input.addEventListener('change', () => sync(parseInt(input.value, 10) || 1));
  }

  const addBtn = app.querySelector('[data-pd-add]');
  const buyBtn = app.querySelector('[data-pd-buy]');
  const doAdd = async (btn, thenCart) => {
    if (!state.user) {
      navigate(loginUrl());
      return;
    }
    const cart = thenCart ? await buttonAdd(btn, p.id, getQty(), { silent: true, feedback: false }) : await buttonAdd(btn, p.id, getQty());
    if (isStale(token)) return;
    if (cart && thenCart) navigate('/cart');
  };
  addBtn.addEventListener('click', () => doAdd(addBtn, false));
  buyBtn.addEventListener('click', () => doAdd(buyBtn, true));
}

export function notFoundPage({ app, message }) {
  setTitle('Хуудас олдсонгүй');
  app.innerHTML = `<div class="container"><div class="empty notfound">
    <div class="nf-code">404</div>
    <h2>${esc(message || 'Хуудас олдсонгүй')}</h2>
    <p>Таны хайсан хуудас устсан эсвэл хаяг буруу байж магадгүй.</p>
    <div class="empty-actions"><a href="/" class="btn btn-primary">Нүүр хуудас</a><a href="/products" class="btn btn-outline">Бараа үзэх</a></div>
  </div></div>`;
}
