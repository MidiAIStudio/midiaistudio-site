/**
 * One-shot: list recent PortOne CANCELLED payments (no secrets printed).
 * Does NOT write Firestore — use admin "PortOne 상태 동기화" after identifying.
 * Run from repo root: node dev/scripts/portone_list_cancelled.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

const secret = env.PORTONE_API_SECRET;
const storeId = env.PORTONE_STORE_ID;
if (!secret) {
  console.error('PORTONE_API_SECRET missing');
  process.exit(1);
}

async function main() {
  // PortOne V2 payment filter — recent cancelled
  const qs = new URLSearchParams({
    storeId: storeId || '',
    'filter.status': 'CANCELLED',
    pageSize: '20',
    sortBy: 'REQUESTED_AT',
    sortOrder: 'DESCENDING'
  });
  const url = `https://api.portone.io/payments?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `PortOne ${secret}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('PortOne list failed', res.status, data.type || data.message || '');
    process.exit(1);
  }
  const items = data.items || data.payments || [];
  console.log('cancelled_count', items.length);
  for (const p of items.slice(0, 10)) {
    const id = String(p.id || p.paymentId || '');
    const amount = p.amount || {};
    const custom = p.customData || {};
    console.log(JSON.stringify({
      paymentIdPrefix: id.slice(0, 10) + '…',
      status: p.status,
      paid: amount.paid,
      cancelled: amount.cancelled ?? amount.canceled,
      total: amount.total,
      orderName: p.orderName || '',
      productHint: custom.productId || custom.productCanonicalId || '',
      requestedAt: p.requestedAt || p.paidAt || ''
    }));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
