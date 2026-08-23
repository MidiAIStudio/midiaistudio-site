/**
 * Locate today's cancelled 7-day PortOne payment and print safe summary.
 * If GOOGLE_APPLICATION_CREDENTIALS / ADC available, also run applyPortOneRefundSync.
 * Run: node dev/scripts/recover_cancelled_pass7.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../../functions/.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const portoneRefundSync = require(join(__dirname, '../../functions/portoneRefundSync.js'));

async function fetchPayment(id) {
  const qs = env.PORTONE_STORE_ID ? `?storeId=${encodeURIComponent(env.PORTONE_STORE_ID)}` : '';
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(id)}${qs}`, {
    headers: { Authorization: `PortOne ${env.PORTONE_API_SECRET}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function listCancelled() {
  const qs = new URLSearchParams({
    storeId: env.PORTONE_STORE_ID || '',
    'filter.status': 'CANCELLED',
    pageSize: '20',
    sortBy: 'REQUESTED_AT',
    sortOrder: 'DESCENDING'
  });
  const res = await fetch(`https://api.portone.io/payments?${qs}`, {
    headers: { Authorization: `PortOne ${env.PORTONE_API_SECRET}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `list HTTP ${res.status}`);
  return data.items || data.payments || [];
}

async function main() {
  const items = await listCancelled();
  const target = items.find((p) => {
    const name = String(p.orderName || '');
    const st = String(p.status || '');
    return st === 'CANCELLED' && /7일|7.?Day|PASS_7/i.test(name);
  }) || items.find((p) => String(p.status) === 'CANCELLED');

  if (!target) {
    console.log('NO_CANCELLED_7D_FOUND');
    process.exit(2);
  }

  const paymentId = String(target.id || target.paymentId || '');
  const payment = await fetchPayment(paymentId);
  const amounts = portoneRefundSync.parsePortOneAmounts(payment);
  console.log(JSON.stringify({
    paymentIdPrefix: paymentId.slice(0, 12) + '…',
    paymentIdLen: paymentId.length,
    orderName: payment.orderName || target.orderName || '',
    providerStatus: payment.status,
    paid: amounts.paid,
    cancelled: amounts.cancelled,
    fullCancel: amounts.paid <= 0 && amounts.cancelled > 0,
    requestedAt: payment.requestedAt || target.requestedAt || ''
  }, null, 2));

  let admin;
  try {
    admin = require(join(__dirname, '../../functions/node_modules/firebase-admin'));
    if (!admin.apps.length) admin.initializeApp({ projectId: 'midiaistudio' });
    const db = admin.firestore();
    const order = await db.collection('orders').doc(paymentId).get();
    console.log('firestore_order_exists', order.exists);
    if (order.exists) {
      const d = order.data() || {};
      console.log(JSON.stringify({
        internalStatus: d.status,
        licenseIssued: d.licenseIssued === true,
        licenseRevoked: d.licenseRevoked === true,
        productId: d.productId || '',
        uidPrefix: String(d.uid || '').slice(0, 6) + '…'
      }));
    }
    const sync = await portoneRefundSync.syncPortOnePayment({
      db,
      FieldValue: admin.firestore.FieldValue,
      Timestamp: admin.firestore.Timestamp,
      paymentId,
      payment,
      source: 'recover_script',
      actorUid: 'script'
    });
    console.log(JSON.stringify({
      syncOk: sync.ok,
      status: sync.status,
      entitlement: sync.entitlement,
      skipped: sync.skipped,
      reason: sync.reason || ''
    }));
  } catch (e) {
    console.log('FIRESTORE_SYNC_SKIPPED', String(e.message || e).slice(0, 120));
    console.log('Use admin UI: open order detail or [PortOne 상태 동기화] / [결제 취소] on already-cancelled path.');
  }
}

main().catch((e) => {
  console.error(String(e.message || e).slice(0, 200));
  process.exit(1);
});
