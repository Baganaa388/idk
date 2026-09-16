// OTP илгээх суваг. SMS/и-мэйл үйлчилгээ үзүүлэгчийг орчны хувьсагчаар холбоно.
//
//  SMS_WEBHOOK_URL   — POST {to, text} JSON хүлээн авах SMS gateway (жишээ: Unitel/MobiCom-ийн
//                       мерчант gateway-г ороосон дотоод сервис). Тохируулаагүй бол консолд хэвлэнэ.
//  EMAIL_WEBHOOK_URL — POST {to, subject, text} JSON хүлээн авах и-мэйл сервис.
//  OTP_DEV_EXPOSE=1  — хөгжүүлэлтийн үед кодыг API хариунд буцаана (production-д бүү асаа).
'use strict';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.NOTIFY_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_TOKEN}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Мэдэгдэл илгээхэд алдаа гарлаа (${res.status})`);
}

async function sendOtp(identifier, code, ttlMin) {
  const text = `Aktar Marka баталгаажуулах код: ${code}. ${ttlMin} минут хүчинтэй.`;
  if (identifier.type === 'phone' && process.env.SMS_WEBHOOK_URL) {
    return postJson(process.env.SMS_WEBHOOK_URL, { to: identifier.value, text });
  }
  if (identifier.type === 'email' && process.env.EMAIL_WEBHOOK_URL) {
    return postJson(process.env.EMAIL_WEBHOOK_URL, { to: identifier.value, subject: 'Баталгаажуулах код', text });
  }
  console.log(`[OTP] ${identifier.type}:${identifier.value} → ${code}`);
}

function exposeDevCode() {
  return process.env.OTP_DEV_EXPOSE === '1';
}

module.exports = { sendOtp, exposeDevCode };
