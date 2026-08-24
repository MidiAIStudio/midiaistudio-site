'use strict';

const assert = require('assert');
const {
  buildAdminBrandedEmail,
  validateHttpUrl,
  escapeHtml,
  formatBodyHtml
} = require('./adminEmailTemplate');

assert.strictEqual(validateHttpUrl('javascript:alert(1)'), null);
assert.strictEqual(validateHttpUrl('data:text/html,hi'), null);
assert.ok(validateHttpUrl('https://midiaistudio.com/'));
assert.ok(escapeHtml('<b>x</b>').includes('&lt;b&gt;'));

const bodyHtml = formatBodyHtml('Hello <script>\n\n- one\n- two\n\n**bold** and [link](https://midiaistudio.com/)');
assert.ok(!bodyHtml.includes('<script>'));
assert.ok(bodyHtml.includes('<strong>bold</strong>'));
assert.ok(bodyHtml.includes('href="https://midiaistudio.com/"'));
assert.ok(bodyHtml.includes('<li'));

const mail = buildAdminBrandedEmail({
  subject: '이벤트 <테스트>',
  body: '본문입니다.\n둘째 줄',
  preheader: '미리보기',
  bannerEnabled: true,
  bannerEyebrow: '30% OFF',
  bannerTitle: '기간제 상품',
  bannerDescription: '할인 안내',
  ctaLabel: '가격 확인하기',
  ctaUrl: 'https://midiaistudio.com/'
});
assert.strictEqual(mail.subject, '이벤트 <테스트>');
assert.ok(mail.html.includes('MidiAI Studio'));
assert.ok(mail.html.includes('기간제 상품'));
assert.ok(mail.html.includes('가격 확인하기'));
assert.ok(mail.html.includes('https://midiaistudio.com/support.html'));
assert.ok(mail.html.includes('미리보기'));
assert.ok(!mail.html.includes('<script>'));
assert.ok(mail.text.includes('가격 확인하기:'));
assert.ok(mail.text.includes('https://midiaistudio.com/'));
assert.ok(mail.meta.hasCta);

const noCta = buildAdminBrandedEmail({
  subject: '안내',
  body: '내용만',
  bannerEnabled: false,
  ctaLabel: '',
  ctaUrl: ''
});
assert.ok(!noCta.html.includes('가격 확인하기'));

console.log('ok adminEmailTemplate');
