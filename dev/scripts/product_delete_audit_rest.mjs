/**
 * Product delete audit via public Firestore REST (products only).
 * Orders/creditPurchases require admin — uses hasPurchases doc field + heuristics.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogEngine = require(join(__dirname, '../../functions/catalogEngine.js'));

const API_KEY = 'AIzaSyAAS0fFhGk9zHz0eb3XtNob42g3OvYdDiA';
const PROJECT = 'midiaistudio';
const SEED_IDS = ['CREDIT_5', 'CREDIT_30', 'CREDIT_100', 'PASS_7D', 'PASS_30D', 'PASS_90D', 'LIFETIME'];

function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = decodeValue(val);
    return out;
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

function docToObj(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = decodeValue(v);
  const id = String(doc.name || '').split('/').pop();
  out._docId = id;
  if (!out.productId) out.productId = id === 'lifetime' ? 'LIFETIME' : id;
  return out;
}

function isSystemRequired(pid) {
  return pid === 'LIFETIME';
}

function policyDeletable(p, pid) {
  if (isSystemRequired(pid)) return { yes: false, reason: '시스템 필수 상품 (Lifetime 결제/라이선스 경로)' };
  if (p.hasPurchases === true) return { yes: false, reason: '결제 기록 있음 (hasPurchases=true)' };
  if (p.catalogDeleted === true) return { yes: false, reason: '이미 삭제됨' };
  return { yes: true, reason: SEED_IDS.includes(pid) ? 'seed · 이력 없음' : '일반 상품 · 이력 없음' };
}

function currentCodeDeletable(p, pid) {
  const isCredit = p.type === 'credit_pack' || pid.startsWith('CREDIT_') || pid.startsWith('POINT_');
  if (isCredit) return { yes: true, reason: 'isCreditCatalogProduct → always true (current code)' };
  const seed = catalogEngine.isSeedProduct?.(pid) || SEED_IDS.includes(pid);
  if (seed) return { yes: false, reason: 'isSeedProduct block' };
  if (p.hasPurchases === true) return { yes: false, reason: 'hasPurchases block' };
  return { yes: true, reason: 'non-seed, no purchases' };
}

async function main() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products?key=${API_KEY}&pageSize=100`;
  const res = await fetch(url);
  const json = await res.json();
  const products = (json.documents || []).map(docToObj)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  console.log('=== PRODUCT DELETE AUDIT (REST) ===\n');
  console.log(`Products: ${products.length}\n`);

  for (const p of products) {
    const pid = catalogEngine.normalizeProductId(p.productId || p._docId);
    const pol = policyDeletable(p, pid);
    const cur = currentCodeDeletable(p, pid);
    const testLike = /TEST|COPY|E2E|_COPY/i.test(pid);

    console.log(`${pid} (${p._docId})`);
    console.log(`  type=${p.type || '-'} status=${p.status || '-'} seed=${SEED_IDS.includes(pid)}`);
    console.log(`  hasPurchases=${p.hasPurchases === true} catalogDeleted=${p.catalogDeleted === true}`);
    console.log(`  testProduct=${testLike}`);
    console.log(`  TARGET policy deletable: ${pol.yes ? 'YES' : 'NO'} — ${pol.reason}`);
    console.log(`  CURRENT code deletable: ${cur.yes ? 'YES' : 'NO'} — ${cur.reason}`);
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
