// Админы нууц үг сэргээх: npm run admin -- <шинэ-нууц-үг>
'use strict';

const { setAdminPassword } = require('../src/auth');

const pw = process.argv[2] || '12345678';
if (pw.length < 8) {
  console.error('Нууц үг хамгийн багадаа 8 тэмдэгт байна');
  process.exit(1);
}
setAdminPassword('admin', pw);
console.log(`admin хэрэглэгчийн нууц үг шинэчлэгдлээ: ${pw}`);
process.exit(0);
