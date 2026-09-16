// Дэлгүүрийн эхлэл: сайтын тохиргоо, хэрэглэгч ачаалж, router-ийг эхлүүлнэ
import { state, api, route, setNotFound, startRouter, loadUser, buttonAdd, esc } from './core.js';
import { renderLayout } from './components.js';
import { homePage, listingPage, productPage, notFoundPage } from './pages-catalog.js';
import { authPage } from './pages-auth.js';
import { cartPage, checkoutPage, payPage, mockPayPage } from './pages-checkout.js';
import { accountPage, orderDetailPage } from './pages-account.js';

route('/', homePage);
route('/products', listingPage);
route('/c/:slug', listingPage);
route('/p/:slug', productPage);
route('/login', authPage);
route('/register', authPage);
route('/cart', cartPage);
route('/checkout', checkoutPage);
route('/orders/:orderNo/pay', payPage);
route('/pay/mock/:invoiceId', mockPayPage);
route('/account', accountPage);
route('/account/loyalty', accountPage);
route('/account/profile', accountPage);
route('/account/password', accountPage);
route('/account/orders/:orderNo', orderDetailPage);
setNotFound(notFoundPage);

// Барааны карт дээрх "Сагсанд нэмэх"
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn || btn.disabled) return;
  e.preventDefault();
  await buttonAdd(btn, Number(btn.dataset.add), 1);
});

async function boot() {
  try {
    const [site] = await Promise.all([api('/store/site'), loadUser()]);
    state.site = site;
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="container"><div class="empty"><h2>Дэлгүүрийг ачаалж чадсангүй</h2><p>${esc(e.message)}</p><a href="/" class="btn btn-primary">Дахин ачаалах</a></div></div>`;
    return;
  }
  renderLayout();
  startRouter();
}

boot();
