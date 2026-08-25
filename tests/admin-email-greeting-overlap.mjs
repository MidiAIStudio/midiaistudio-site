import assert from 'assert';
import {
  detectAutoGreetingOverlap,
  buildAdminBrandedEmail,
  BULK_MESSAGE_PRESETS
} from '../assets/js/admin-email-template.js';

const normalBody = `MidiAI Studio를 이용해 주시는 분들께 감사의 마음을 담아
보너스 10 크레딧을 지급해 드렸습니다. 🎁`;
const headerDup = `안녕하세요, MidiAI Studio입니다.

보너스 10 크레딧을 지급했습니다.`;
const footerDup = `보너스 10 크레딧을 지급했습니다.

감사합니다.
MidiAI Studio`;

assert.deepStrictEqual(detectAutoGreetingOverlap(normalBody), {
  header: { duplicate: false },
  footer: { duplicate: false }
});
assert.equal(detectAutoGreetingOverlap(headerDup).header.duplicate, true);
assert.equal(detectAutoGreetingOverlap(headerDup).footer.duplicate, false);
assert.equal(detectAutoGreetingOverlap(footerDup).footer.duplicate, true);
assert.equal(detectAutoGreetingOverlap('').header.duplicate, false);
assert.equal(detectAutoGreetingOverlap('').footer.duplicate, false);

const mail = buildAdminBrandedEmail({ subject: '보너스 안내', body: normalBody });
assert.equal((mail.html.match(/안녕하세요/g) || []).length, 1);
assert.equal((mail.html.match(/감사합니다/g) || []).length, 1);
assert.ok(mail.html.includes('보너스 10 크레딧을 지급해 드렸습니다'));

for (const p of BULK_MESSAGE_PRESETS) {
  const hit = detectAutoGreetingOverlap(p.body || '');
  assert.equal(hit.header.duplicate, false, `preset ${p.id} should not start with auto greeting`);
}

console.log('admin-email-greeting-overlap: PASS');
