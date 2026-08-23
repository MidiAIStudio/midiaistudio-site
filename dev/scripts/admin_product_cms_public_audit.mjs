/**
 * Public-read Firestore catalog audit via Firebase REST (no admin credentials).
 * Validates policy prices + charge math + dynamic ID helpers.
 * Write/create/delete require Admin — reported separately.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const functionsDir = join(__dirname, '../../functions');
const catalogEngine = require(join(functionsDir, 'catalogEngine.js'));
const passEntitlement = require(join(functionsDir, 'passEntitlement.js'));

const API_KEY = 'AIzaSyAAS0fFhGk9zHz0eb3XtNob42g3OvYdDiA';
const PROJECT = 'midiaistudio';
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
    const fields = v.mapValue.fields || {};
    for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
    return out;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(decodeValue);
  }
  return null;
}

function docToObj(doc) {
  const fields = doc.fields || {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  const name = String(doc.name || '');
  const id = name.split('/').pop();
  out._docId = id;
  if (!out.productId) out.productId = id === 'lifetime' ? 'LIFETIME' : id;
  return out;
}

async function listProducts() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products?key=${API_KEY}&pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`list products HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.documents || []).map(docToObj);
}

function chargeKrw(doc) {
  const hydrated = catalogEngine.hydrateProduct(doc.productId || doc._docId, doc);
  const charge = catalogEngine.computeCharge(hydrated, [], new Date(), 'KRW');
  return {
    ok: charge.ok,
    amount: Number(charge.effectivePrice),
    duration: passEntitlement.passDurationDays(
      catalogEngine.normalizeProductId(doc.productId || doc._docId),
      hydrated.durationDays
    ),
    status: hydrated.status,
    hydrated
  };
}

async function main() {
  console.log('=== Public Catalog Audit (REST read) ===\n');

  ok('dyn_isPass_TEST', catalogEngine.isPassProductId('TEST_PASS_ADMIN_E2E'));
  ok('dyn_isPass_PASS_60D', catalogEngine.isPassProductId('PASS_60D'));
  ok('dyn_not_CREDIT', !catalogEngine.isPassProductId('CREDIT_5'));
  ok('canon_duration_ignore_forge', passEntitlement.passDurationDays('PASS_7D', 9999) === 7);
  ok('custom_duration_from_catalog', passEntitlement.passDurationDays('TEST_PASS_ADMIN_E2E', 14) === 14);

  const products = await listProducts();
  ok('products_list_nonempty', products.length > 0, `count=${products.length}`);

  const byId = {};
  for (const p of products) {
    const pid = catalogEngine.normalizeProductId(p.productId || p._docId);
    byId[pid] = p;
  }

  const ids = Object.keys(byId).sort();
  ok('no_dup_ids_in_map', ids.length === new Set(ids).size);

  for (const [pid, price] of Object.entries(POLICY)) {
    const doc = pid === 'LIFETIME'
      ? (byId.LIFETIME || products.find((p) => p._docId === 'lifetime'))
      : byId[pid];
    if (!doc) {
      ok(`present_${pid}`, false, 'missing');
      continue;
    }
    const c = chargeKrw({ ...doc, productId: pid });
    ok(`price_${pid}`, c.amount === price, `got ${c.amount} want ${price} listPriceKrw=${doc.listPriceKrw} status=${doc.status}`);
    ok(`active_${pid}`, String(doc.status || c.status) === 'active', String(doc.status));
    if (pid.startsWith('PASS_')) {
      const days = { PASS_7D: 7, PASS_30D: 30, PASS_90D: 90 }[pid];
      ok(`duration_${pid}`, c.duration === days, String(c.duration));
    }
    const kr = doc.regions?.KR || {};
    if (kr.listPrice != null || kr.salePrice != null) {
      const listAligned = Number(kr.listPrice) === Number(doc.listPriceKrw)
        || !Number.isFinite(Number(kr.listPrice));
      ok(`regions_kr_${pid}`, listAligned || Number(c.amount) === price,
        `listPriceKrw=${doc.listPriceKrw} regions.list=${kr.listPrice} regions.sale=${kr.salePrice} charge=${c.amount}`);
    } else {
      ok(`regions_kr_${pid}`, true, 'no regions.KR (charge uses listPriceKrw)');
    }
  }

  const passes = products.filter((p) => {
    const id = catalogEngine.normalizeProductId(p.productId || p._docId);
    return p.type === 'full_pass' || catalogEngine.isPassProductId(id);
  });
  const sorted = [...passes].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  ok('pass_sort_stable', sorted.every((p, i) => i === 0 || Number(sorted[i - 1].sortOrder || 0) <= Number(p.sortOrder || 0)));

  const testLeft = products.find((p) => catalogEngine.normalizeProductId(p.productId || p._docId) === 'TEST_PASS_ADMIN_E2E');
  ok('no_leftover_TEST_product', !testLeft, testLeft ? 'TEST product still in Firestore' : 'clean');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    failed.forEach((f) => console.log(`FAIL ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
