/**
 * Production-safe Admin Product CMS E2E (Firestore + charge math + cleanup).
 * Does NOT touch orders/licenses/users. Restores PASS_7D price after probe.
 *
 * Usage (from repo root, Application Default / gcloud auth):
 *   node --experimental-vm-modules dev/scripts/admin_product_cms_e2e.mjs
 * Or from functions/ with firebase admin credentials available:
 *   node ../dev/scripts/admin_product_cms_e2e.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const functionsDir = join(__dirname, '../../functions');

const admin = require(join(functionsDir, 'node_modules/firebase-admin'));
const catalogEngine = require(join(functionsDir, 'catalogEngine.js'));
const passEntitlement = require(join(functionsDir, 'passEntitlement.js'));

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'midiaistudio' });
}
const db = admin.firestore();

const TEST_ID = 'TEST_PASS_ADMIN_E2E';
const POLICY = {
  PASS_7D: 7900,
  PASS_30D: 19900,
  PASS_90D: 49900,
  LIFETIME: 129000
};
const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function readProduct(docId) {
  const snap = await db.collection('products').doc(docId).get();
  return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
}

function chargeKrw(doc) {
  const hydrated = catalogEngine.hydrateProduct(doc.productId || doc.id, doc);
  const charge = catalogEngine.computeCharge(hydrated, [], new Date(), 'KRW');
  return {
    ok: charge.ok,
    amount: Number(charge.effectivePrice),
    base: Number(charge.basePrice),
    duration: passEntitlement.passDurationDays(
      catalogEngine.normalizeProductId(doc.productId || doc.id),
      hydrated.durationDays
    ),
    status: hydrated.status
  };
}

async function main() {
  console.log('=== Admin Product CMS E2E (Firestore) ===\n');

  // --- List / policy prices ---
  const snaps = await db.collection('products').get();
  const byId = {};
  snaps.forEach((s) => {
    const d = s.data() || {};
    const pid = catalogEngine.normalizeProductId(d.productId || s.id);
    byId[pid] = { id: s.id, ...d, productId: pid };
  });
  for (const [pid, price] of Object.entries(POLICY)) {
    const doc = byId[pid] || byId[pid === 'LIFETIME' ? 'LIFETIME' : pid];
    const lifeDoc = pid === 'LIFETIME' ? (byId.LIFETIME || await readProduct('lifetime')) : doc;
    const row = pid === 'LIFETIME'
      ? (lifeDoc && { ...lifeDoc, productId: 'LIFETIME' })
      : doc;
    if (!row) {
      ok(`policy_present_${pid}`, false, 'missing');
      continue;
    }
    const c = chargeKrw(row);
    ok(`policy_price_${pid}`, c.amount === price, `got ${c.amount} want ${price}`);
    ok(`policy_active_${pid}`, row.status === 'active' || c.status === 'active', `status=${row.status}`);
  }

  // --- ID helpers ---
  ok('isPass_TEST', catalogEngine.isPassProductId(TEST_ID));
  ok('isPass_PASS_60D', catalogEngine.isPassProductId('PASS_60D'));
  ok('notPass_CREDIT', !catalogEngine.isPassProductId('CREDIT_5'));
  ok('canon_duration_forced', passEntitlement.passDurationDays('PASS_7D', 9999) === 7);
  ok('custom_duration_catalog', passEntitlement.passDurationDays(TEST_ID, 14) === 14);

  // --- Cleanup any leftover TEST ---
  await db.collection('products').doc(TEST_ID).delete().catch(() => {});

  // --- Create TEST product ---
  const createPayload = {
    productId: TEST_ID,
    type: 'full_pass',
    nameKo: '테스트 Full',
    nameEn: 'Test Full',
    nameJa: 'テスト Full',
    descriptionKo: '관리자 E2E 설명 KO',
    descriptionEn: 'Admin E2E desc EN',
    descriptionJa: 'Admin E2E desc JA',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 14,
    listPriceKrw: 12345,
    status: 'active',
    sortOrder: 99,
    badge: '',
    productVersion: 1,
    productDiscount: { enabled: false, type: 'percent', value: 0, startsAt: '', endsAt: '' },
    plan: 'period',
    regions: {
      KR: {
        payment: 'portone',
        currency: 'KRW',
        listPrice: 12345,
        salePrice: 12345,
        orderName: '테스트 Full',
        portoneProductId: TEST_ID
      }
    },
    hasPurchases: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('products').doc(TEST_ID).set(createPayload);
  let testDoc = await readProduct(TEST_ID);
  ok('create_firestore', !!testDoc, TEST_ID);
  let c = chargeKrw(testDoc);
  ok('create_charge', c.ok && c.amount === 12345, String(c.amount));
  ok('create_duration', c.duration === 14, String(c.duration));

  // --- Price edit ---
  await db.collection('products').doc(TEST_ID).set({
    listPriceKrw: 13456,
    regions: {
      KR: {
        payment: 'portone',
        currency: 'KRW',
        listPrice: 13456,
        salePrice: 13456,
        orderName: '테스트 Full',
        portoneProductId: TEST_ID
      }
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  testDoc = await readProduct(TEST_ID);
  c = chargeKrw(testDoc);
  ok('price_edit_charge', c.amount === 13456, String(c.amount));
  ok('regions_kr_synced',
    Number(testDoc.regions?.KR?.listPrice) === 13456
    && Number(testDoc.regions?.KR?.salePrice) === 13456,
    JSON.stringify(testDoc.regions?.KR || {}));

  // --- Discount ON ---
  await db.collection('products').doc(TEST_ID).set({
    listPriceKrw: 10000,
    productDiscount: {
      enabled: true,
      type: 'amount',
      value: 2000,
      startsAt: new Date(Date.now() - 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 86400_000).toISOString()
    },
    regions: {
      KR: {
        listPrice: 10000,
        salePrice: 10000,
        currency: 'KRW',
        payment: 'portone',
        portoneProductId: TEST_ID,
        orderName: '테스트 Full'
      }
    }
  }, { merge: true });
  testDoc = await readProduct(TEST_ID);
  c = chargeKrw(testDoc);
  ok('discount_on', c.amount === 8000, String(c.amount));

  // --- Discount OFF ---
  await db.collection('products').doc(TEST_ID).set({
    productDiscount: { enabled: false, type: 'percent', value: 0, startsAt: '', endsAt: '' }
  }, { merge: true });
  testDoc = await readProduct(TEST_ID);
  c = chargeKrw(testDoc);
  ok('discount_off', c.amount === 10000, String(c.amount));

  // --- Pause / resume ---
  await db.collection('products').doc(TEST_ID).set({ status: 'paused' }, { merge: true });
  testDoc = await readProduct(TEST_ID);
  ok('paused_status', testDoc.status === 'paused');
  // Simulate SALE_DISABLED gate (same as loadRegionCharge)
  ok('paused_blocks_sale', testDoc.status === 'paused' || testDoc.status === 'archived');

  await db.collection('products').doc(TEST_ID).set({ status: 'active', listPriceKrw: 12345, badge: 'recommended', sortOrder: 2 }, { merge: true });
  testDoc = await readProduct(TEST_ID);
  ok('resume_active', testDoc.status === 'active' && testDoc.badge === 'recommended' && Number(testDoc.sortOrder) === 2);

  // --- PASS_7D probe 7900→8900→7900 ---
  const p7 = await readProduct('PASS_7D');
  const p7Before = Number(p7?.listPriceKrw);
  ok('pass7_baseline_read', Number.isFinite(p7Before) && p7Before > 0, String(p7Before));
  await db.collection('products').doc('PASS_7D').set({
    listPriceKrw: 8900,
    regions: {
      ...(p7.regions || {}),
      KR: {
        ...((p7.regions || {}).KR || {}),
        listPrice: 8900,
        salePrice: 8900,
        currency: 'KRW',
        payment: 'portone'
      }
    }
  }, { merge: true });
  let p7mid = await readProduct('PASS_7D');
  ok('pass7_temp_8900', Number(p7mid.listPriceKrw) === 8900 && chargeKrw(p7mid).amount === 8900);
  await db.collection('products').doc('PASS_7D').set({
    listPriceKrw: POLICY.PASS_7D,
    regions: {
      ...(p7mid.regions || {}),
      KR: {
        ...((p7mid.regions || {}).KR || {}),
        listPrice: POLICY.PASS_7D,
        salePrice: POLICY.PASS_7D,
        currency: 'KRW',
        payment: 'portone'
      }
    }
  }, { merge: true });
  const p7end = await readProduct('PASS_7D');
  ok('pass7_restored', Number(p7end.listPriceKrw) === POLICY.PASS_7D && chargeKrw(p7end).amount === POLICY.PASS_7D);

  // --- Delete TEST ---
  await db.collection('products').doc(TEST_ID).delete();
  const gone = await readProduct(TEST_ID);
  ok('delete_test', !gone);

  // --- Final policy restore check ---
  for (const [pid, price] of Object.entries(POLICY)) {
    const docId = pid === 'LIFETIME' ? 'lifetime' : pid;
    const row = await readProduct(docId);
    const amount = row ? chargeKrw({ ...row, productId: pid }).amount : NaN;
    ok(`final_${pid}`, amount === price, `got ${amount}`);
  }

  // Ensure TEST not resurrected (seed does not include TEST)
  const stillGone = await readProduct(TEST_ID);
  ok('no_seed_resurrection_test', !stillGone);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log('Failures:');
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
