// QPay v2 мерчант API клиент.
//
// Орчны хувьсагч:
//   QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE — QPay-ээс олгосон мерчант мэдээлэл
//   QPAY_BASE_URL  — анхдагч https://merchant.qpay.mn (sandbox: https://merchant-sandbox.qpay.mn)
//   QPAY_MOCK=1    — мерчант мэдээлэлтэй байсан ч туршилтын (mock) горимд ажиллуулна
//
// Мерчант мэдээлэл тохируулаагүй үед mock горим: QR/банкны холбоос үүсгэж, төлбөрийг
// /pay/mock/:invoiceId хуудаснаас гараар "төлөгдсөн" болгож бүх урсгалыг туршина.
'use strict';

const crypto = require('node:crypto');
const QRCode = require('qrcode');

const BASE_URL = (process.env.QPAY_BASE_URL || 'https://merchant.qpay.mn').replace(/\/+$/, '');

function isMock() {
  if (process.env.QPAY_MOCK === '1') return true;
  return !(process.env.QPAY_USERNAME && process.env.QPAY_PASSWORD && process.env.QPAY_INVOICE_CODE);
}

let tokenCache = null; // { access_token, expiresAt }

async function request(method, path, { body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  headers.Authorization = auth || `Bearer ${await getToken()}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (res.status === 401 && !auth) tokenCache = null;
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    const err = new Error(`QPay: ${msg}`);
    err.status = 502;
    err.qpay = data;
    throw err;
  }
  return data;
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.access_token;
  const basic = Buffer.from(`${process.env.QPAY_USERNAME}:${process.env.QPAY_PASSWORD}`).toString('base64');
  const data = await request('POST', '/v2/auth/token', { auth: `Basic ${basic}` });
  // expires_in нь unix секунд (QPay) эсвэл хугацаа секундээр ирж болно — хоёуланг нь дэмжинэ
  const exp = Number(data.expires_in) || 0;
  const expiresAt = exp > 1e9 ? exp * 1000 : Date.now() + (exp || 3600) * 1000;
  tokenCache = { access_token: data.access_token, expiresAt };
  return tokenCache.access_token;
}

// Mock горимын банк/апп жагсаалт — QPay invoice хариуны urls[] бүтэцтэй ижил
// Лого: /img/pay/* (QPay-ийн qpay.mn/q/logo CDN-ээс татсан; Storepay, Pocket — info2.jpg-ээс тайрсан)
const MOCK_APPS = [
  ['qPay wallet', 'qPay хэтэвч', 'qpay-icon'],
  ['Khan bank', 'Хаан банк', 'khanbank'],
  ['State bank', 'Төрийн банк', 'statebank'],
  ['Xac bank', 'Хас банк', 'xacbank'],
  ['Trade and Development bank', 'ТДБ онлайн', 'tdbbank'],
  ['Social Pay', 'Голомт банк', 'socialpay'],
  ['Most money', 'МОСТ мони', 'most'],
  ['Chinggis khaan bank', 'Чингис хаан банк', 'ckbank'],
  ['Capitron bank', 'Капитрон банк', 'capitronbank'],
  ['Bogd bank', 'Богд банк', 'bogdbank'],
  ['Trans bank', 'Тээвэр хөгжлийн банк', 'transbank'],
  ['M bank', 'М банк', 'mbank'],
  ['Arig bank', 'Ариг банк', 'arig'],
  ['Monpay', 'Монпэй', 'monpay'],
  ['Ard App', 'Ард апп', 'ard'],
  ['Hipay', 'Hipay', 'hipay'],
  ['Pocket', 'Pocket Zero', 'pocket-app'],
  ['Storepay', 'Storepay', 'storepay-app'],
];

async function createInvoice({ orderNo, amount, description, callbackUrl, publicUrl }) {
  if (isMock()) {
    const invoiceId = `MOCK-${crypto.randomBytes(8).toString('hex')}`;
    const payUrl = `${publicUrl}/pay/mock/${invoiceId}`;
    return {
      mode: 'mock',
      invoice_id: invoiceId,
      qr_text: payUrl,
      qr_image: (await QRCode.toDataURL(payUrl, { margin: 1, width: 360 })).replace(/^data:image\/png;base64,/, ''),
      short_url: payUrl,
      urls: MOCK_APPS.map(([name, description, logo]) => ({ name, description, logo: `/img/pay/${logo}.png`, link: payUrl })),
    };
  }
  const data = await request('POST', '/v2/invoice', {
    body: {
      invoice_code: process.env.QPAY_INVOICE_CODE,
      sender_invoice_no: orderNo,
      invoice_receiver_code: 'terminal',
      invoice_description: description,
      amount,
      callback_url: callbackUrl,
    },
  });
  return {
    mode: 'live',
    invoice_id: data.invoice_id,
    qr_text: data.qr_text || '',
    qr_image: data.qr_image || '',
    short_url: data.qPay_shortUrl || '',
    urls: Array.isArray(data.urls) ? data.urls : [],
  };
}

// Төлөгдсөн дүн ба гүйлгээний дугаарыг буцаана
async function checkInvoice(payment) {
  if (payment.mode === 'mock') {
    return payment.mock_paid
      ? { paid: true, paid_amount: payment.amount, payment_id: `MOCKPAY-${payment.id}` }
      : { paid: false, paid_amount: 0, payment_id: null };
  }
  const data = await request('POST', '/v2/payment/check', {
    body: { object_type: 'INVOICE', object_id: payment.invoice_id, offset: { page_number: 1, page_limit: 100 } },
  });
  const rows = Array.isArray(data && data.rows) ? data.rows : [];
  const paidRows = rows.filter((r) => String(r.payment_status).toUpperCase() === 'PAID');
  const paidAmount = paidRows.reduce((s, r) => s + Math.round(Number(r.payment_amount) || 0), 0) || Math.round(Number(data && data.paid_amount) || 0);
  return {
    paid: paidRows.length > 0 && paidAmount >= payment.amount,
    paid_amount: paidAmount,
    payment_id: paidRows[0] ? String(paidRows[0].payment_id) : null,
  };
}

async function cancelInvoice(payment) {
  if (payment.mode === 'mock') return;
  try {
    await request('DELETE', `/v2/invoice/${encodeURIComponent(payment.invoice_id)}`);
  } catch (e) {
    console.warn(`QPay invoice цуцлах амжилтгүй (${payment.invoice_id}): ${e.message}`);
  }
}

module.exports = { isMock, createInvoice, checkInvoice, cancelInvoice, BASE_URL };
