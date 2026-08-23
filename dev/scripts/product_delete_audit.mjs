/**
 * Product delete audit — lists products + order/creditPurchase counts (Admin SDK).
 * Run: node dev/scripts/product_delete_audit.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require(join(__dirname, '../../functions/node_modules/firebase-admin'));
const catalogEngine = require(join(__dirname, '../../functions/catalogEngine.js'));

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'midiaistudio' });
}
const db = admin.firestore();

function normPid(raw, docId) {
  const id = raw?.productId || docId;
  return catalogEngine.normalizeProductId(id === 'lifetime' ? 'LIFETIME' : id);
}

function isSystemRequiredProduct(p) {
  const pid = normPid(p, p._docId);
  if (pid === 'LIFETIME') return true;
  return false;
}

async function countOrdersForProduct(pid) {
  const variants = new Set([pid, pid === 'LIFETIME' ? 'lifetime' : null, pid.toLowerCase()].filter(Boolean));
  let count = 0;
  for (const v of variants) {
    try {
      const snap = await db.collection('orders').where('productId', '==', v).limit(500).get();
      count = Math.max(count, snap.size);
    } catch (_) { /* index */ }
  }
  return count;
}

async function countCreditPurchasesForProduct(pid) {
  let count = 0;
  try {
    const snap = await db.collection('creditPurchases').where('productId', '==', pid).limit(500).get();
    count = snap.size;
  } catch (_) { /* ignore */ }
  if (!count) {
    try {
      const snap2 = await db.collection('pointPurchases').where('productId', '==', pid).limit(500).get();
      count = snap2.size;
    } catch (_) { /* ignore */ }
  }
  return count;
}

async function main() {
  const prodSnap = await db.collection('products').get();
  const products = prodSnap.docs.map((d) => ({
    _docId: d.id,
    ...d.data()
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  console.log('=== PRODUCT DELETE AUDIT ===\n');
  console.log(`Total products in Firestore: ${products.length}\n`);

  const rows = [];
  for (const p of products) {
    const pid = normPid(p, p._docId);
    const orderCount = await countOrdersForProduct(pid);
    const creditCount = await countCreditPurchasesForProduct(pid);
    const hasPurchasesFlag = p.hasPurchases === true;
    const paymentHistory = orderCount > 0 || hasPurchasesFlag;
    const creditGrantHistory = creditCount > 0;
    const systemRequired = isSystemRequiredProduct({ ...p, productId: pid, _docId: p._docId });
    const seed = catalogEngine.CANONICAL_IDS?.includes(pid)
      || ['CREDIT_5', 'CREDIT_30', 'CREDIT_100', 'PASS_7D', 'PASS_30D', 'PASS_90D', 'LIFETIME'].includes(pid);

    let deletable = false;
    let reason = '';
    if (systemRequired) {
      deletable = false;
      reason = '시스템 필수 상품 (Lifetime 결제/라이선스 경로 의존)';
    } else if (paymentHistory) {
      deletable = false;
      reason = `결제 기록 ${orderCount}건${hasPurchasesFlag ? ' · hasPurchases=true' : ''}`;
    } else if (creditGrantHistory) {
      deletable = false;
      reason = `Credit 구매/지급 기록 ${creditCount}건`;
    } else {
      deletable = true;
      reason = seed ? 'seed이지만 결제/지급 이력 없음 → 삭제 가능' : '일반 상품 · 이력 없음';
    }

    rows.push({
      productId: pid,
      docId: p._docId,
      type: p.type || '-',
      status: p.status || '-',
      orderCount,
      creditCount,
      hasPurchasesFlag,
      systemRequired,
      seed,
      deletable,
      reason
    });
  }

  for (const r of rows) {
    console.log(`--- ${r.productId} (${r.docId}) ---`);
    console.log(`  type: ${r.type} | status: ${r.status}`);
    console.log(`  orders: ${r.orderCount} | creditPurchases: ${r.creditCount} | hasPurchases: ${r.hasPurchasesFlag}`);
    console.log(`  seed: ${r.seed} | systemRequired: ${r.systemRequired}`);
    console.log(`  deletable: ${r.deletable ? 'YES' : 'NO'} — ${r.reason}`);
    console.log('');
  }

  console.log('JSON:', JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
