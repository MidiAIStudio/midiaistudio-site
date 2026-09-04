/**
 * Read-only Support AI tools for account / license / payment / credits.
 * Never grants, refunds, or mutates entitlement.
 */
'use strict';

const { licenseTsMs } = require('../passEntitlement');

function tsToIso(v) {
  const ms = licenseTsMs(v);
  if (!ms) return null;
  try {
    return new Date(ms).toISOString();
  } catch (_) {
    return null;
  }
}

function safeEmail(email) {
  const s = String(email || '').trim();
  if (!s || !s.includes('@')) return null;
  const [u, d] = s.split('@');
  if (!d) return null;
  const masked = (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d;
  return masked.slice(0, 80);
}

/**
 * @returns {Promise<{ok:boolean, summary:string, facts:string[], data:object}>}
 */
async function lookupAccount(db, user) {
  const uid = user && user.uid;
  if (!uid || !db) return { ok: false, summary: 'no_user', facts: [], data: {} };
  let profile = {};
  try {
    const snap = await db.collection('users').doc(uid).get();
    profile = snap.exists ? snap.data() || {} : {};
  } catch (_) {
    profile = {};
  }
  const email = safeEmail(user.email || profile.email);
  const facts = [];
  if (email) facts.push(`account_email_masked=${email}`);
  facts.push('account_authenticated=true');
  if (profile.emailVerified === true || user.emailVerified === true) facts.push('email_verified=true');
  return {
    ok: true,
    summary: email ? `로그인 계정 확인됨 (${email})` : '로그인 계정 확인됨',
    facts,
    data: { uidPrefix: String(uid).slice(0, 6), emailMasked: email }
  };
}

async function lookupLicense(db, uid) {
  if (!db || !uid) return { ok: false, summary: 'no_user', facts: [], data: {} };
  const snap = await db.collection('licenses').doc(uid).get();
  if (!snap.exists) {
    return {
      ok: true,
      summary: '등록된 이용권/라이선스 문서 없음',
      facts: ['license_present=false'],
      data: { present: false }
    };
  }
  const d = snap.data() || {};
  const plan = String(d.plan || '').toLowerCase() || 'unknown';
  const status = String(d.status || '').toLowerCase() || 'unknown';
  const licensed = d.licensed === true;
  const expiresAt = tsToIso(d.expiresAt);
  const startsAt = tsToIso(d.startsAt);
  const now = Date.now();
  const expMs = licenseTsMs(d.expiresAt);
  const activeWindow = !expMs || expMs > now;
  const active =
    licensed && ['active', 'ok', 'enabled'].includes(status) && activeWindow && plan !== 'refunded';

  const facts = [
    `license_plan=${plan}`,
    `license_status=${status}`,
    `license_licensed=${licensed}`,
    `license_active=${active}`
  ];
  if (expiresAt) facts.push(`license_expiresAt=${expiresAt}`);
  if (startsAt) facts.push(`license_startsAt=${startsAt}`);
  if (d.passProductId) facts.push(`pass_product=${String(d.passProductId).slice(0, 40)}`);

  let summary;
  if (plan === 'lifetime' && active) {
    summary = 'Lifetime 이용권 활성';
  } else if (active && expiresAt) {
    summary = `기간 이용권 활성 (만료 ${expiresAt.slice(0, 10)})`;
  } else if (licensed && expiresAt && expMs && expMs <= now) {
    summary = `이용권 만료됨 (${expiresAt.slice(0, 10)})`;
  } else {
    summary = `이용권 상태: plan=${plan}, status=${status}, active=${active}`;
  }

  return {
    ok: true,
    summary,
    facts,
    data: {
      present: true,
      plan,
      status,
      licensed,
      active,
      expiresAt,
      startsAt,
      passProductId: d.passProductId || null
    },
    canonical: {
      type: 'license',
      found: true,
      status: active ? 'active' : status,
      plan,
      active,
      expiresAt,
      confidence: 'authoritative'
    }
  };
}

async function lookupCredits(db, uid) {
  if (!db || !uid) return { ok: false, summary: 'no_user', facts: [], data: {} };
  let balance = null;
  try {
    const v2 = await db.collection('creditWalletsV2').doc(uid).get();
    if (v2.exists) {
      balance = Number((v2.data() || {}).balance);
    } else {
      const v1 = await db.collection('creditWallets').doc(uid).get();
      if (v1.exists) balance = Number((v1.data() || {}).balance);
    }
  } catch (_) {
    return { ok: false, summary: 'credit_lookup_failed', facts: [], data: {} };
  }
  if (!Number.isFinite(balance)) {
    return {
      ok: true,
      summary: '크레딧 지갑 없음 (잔액 0으로 볼 수 있음)',
      facts: ['credit_balance=0', 'credit_wallet_present=false'],
      data: { balance: 0, present: false }
    };
  }
  return {
    ok: true,
    summary: `크레딧 잔액 ${balance}`,
    facts: [`credit_balance=${balance}`],
    data: { balance, present: true }
  };
}

/**
 * Recent purchases: creditPurchases + purchaseQuotes (read-only, limited fields).
 * Distinguishes FOUND / NOT_FOUND / QUERY_FAILED — never treat QUERY_FAILED as empty purchases.
 */
async function lookupPayment(db, uid, { limit = 5 } = {}) {
  if (!db || !uid) {
    return {
      ok: false,
      summary: 'no_user',
      facts: [],
      data: {},
      queryStatus: 'UNAUTHORIZED',
      canonical: { type: 'payment', found: false, status: 'UNAUTHORIZED', confidence: 'none' }
    };
  }
  const rows = [];
  const sourceStatus = {};

  async function pull(name, fn) {
    try {
      await fn();
      sourceStatus[name] = 'ok';
    } catch (_) {
      sourceStatus[name] = 'failed';
    }
  }

  await pull('creditPurchases', async () => {
    let cp;
    try {
      cp = await db
        .collection('creditPurchases')
        .where('uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    } catch (_) {
      cp = await db.collection('creditPurchases').where('uid', '==', uid).limit(Math.max(limit * 3, 12)).get();
    }
    const mapped = cp.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        kind: 'credit',
        id: doc.id.slice(0, 12),
        status: String(d.status || d.paymentStatus || '').slice(0, 40),
        productId: String(d.productId || d.sku || '').slice(0, 40),
        amount: d.amountKrw || d.paidAmount || d.amount || null,
        createdAt: tsToIso(d.createdAt) || tsToIso(d.paidAt)
      };
    });
    mapped.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    rows.push(...mapped.slice(0, limit));
  });

  await pull('purchaseQuotes', async () => {
    let pq;
    try {
      pq = await db
        .collection('purchaseQuotes')
        .where('uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    } catch (_) {
      pq = await db.collection('purchaseQuotes').where('uid', '==', uid).limit(Math.max(limit * 3, 12)).get();
    }
    const mapped = pq.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        kind: 'quote',
        id: doc.id.slice(0, 12),
        status: String(d.status || '').slice(0, 40),
        productId: String(d.productId || '').slice(0, 40),
        amount: d.amountKrw || d.chargeAmount || null,
        createdAt: tsToIso(d.createdAt)
      };
    });
    mapped.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    rows.push(...mapped.slice(0, limit));
  });

  // License/product orders — equality-only (no composite index required)
  await pull('orders', async () => {
    const od = await db.collection('orders').where('uid', '==', uid).limit(Math.max(limit * 3, 12)).get();
    const sorted = od.docs
      .map((doc) => {
        const d = doc.data() || {};
        return {
          kind: 'order',
          id: doc.id.slice(0, 12),
          status: String(d.status || d.paymentStatus || '').slice(0, 40),
          productId: String(d.productId || d.planId || d.sku || '').slice(0, 40),
          amount: d.amountKrw || d.paidAmount || d.amount || null,
          createdAt: tsToIso(d.createdAt) || tsToIso(d.paidAt) || tsToIso(d.completedAt)
        };
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit);
    rows.push(...sorted);
  });

  const statuses = Object.values(sourceStatus);
  const anyOk = statuses.some((s) => s === 'ok');
  const anyFailed = statuses.some((s) => s === 'failed');
  const allFailed = statuses.length > 0 && statuses.every((s) => s === 'failed');

  // No successful query at all → QUERY_FAILED (never invent empty)
  if (allFailed || (!anyOk && anyFailed)) {
    return {
      ok: false,
      summary: '결제 조회를 완료하지 못했습니다',
      facts: ['payment_query_status=QUERY_FAILED'],
      data: { recent: [], sourceStatus },
      queryStatus: 'QUERY_FAILED',
      canonical: {
        type: 'payment',
        found: false,
        status: 'QUERY_FAILED',
        confidence: 'unavailable',
        note: 'Do not tell the user that no payments exist or that payment failed.'
      }
    };
  }

  // Partial infrastructure failure with no rows: still QUERY_FAILED (incomplete), not NOT_FOUND
  if (anyFailed && !rows.length) {
    return {
      ok: false,
      summary: '결제 조회를 완료하지 못했습니다',
      facts: ['payment_query_status=QUERY_FAILED'],
      data: { recent: [], sourceStatus },
      queryStatus: 'QUERY_FAILED',
      canonical: {
        type: 'payment',
        found: false,
        status: 'QUERY_FAILED',
        confidence: 'unavailable',
        note: 'Do not tell the user that no payments exist or that payment failed.'
      }
    };
  }

  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const top = rows.slice(0, limit);
  const queryStatus = top.length ? 'FOUND' : 'NOT_FOUND';
  const facts = top.map(
    (r, i) =>
      `purchase_${i + 1}=${r.kind}:${r.productId || 'unknown'}:${r.status || 'n/a'}${
        r.createdAt ? `@${r.createdAt.slice(0, 10)}` : ''
      }`
  );
  facts.push(`payment_query_status=${queryStatus}`);
  if (anyFailed) facts.push('payment_query_partial=true');
  const summary = top.length
    ? `최근 구매/주문 ${top.length}건 확인 (최신: ${top[0].productId || top[0].kind} / ${top[0].status || 'n/a'})`
    : '이 계정에서 최근 결제·구매 기록은 확인되지 않음';

  return {
    ok: true,
    summary,
    facts,
    data: { recent: top, sourceStatus },
    queryStatus,
    canonical: {
      type: 'payment',
      found: top.length > 0,
      status: queryStatus,
      recent: top,
      confidence: 'authoritative'
    }
  };
}

async function lookupEntitlement(db, uid) {
  const lic = await lookupLicense(db, uid);
  const cred = await lookupCredits(db, uid);
  const facts = [].concat(lic.facts || [], cred.facts || []);
  return {
    ok: true,
    summary: [lic.summary, cred.summary].filter(Boolean).join(' / '),
    facts,
    data: { license: lic.data, credits: cred.data }
  };
}

const TOOL_NAMES = Object.freeze({
  LOOKUP_ACCOUNT: 'LOOKUP_ACCOUNT',
  LOOKUP_LICENSE: 'LOOKUP_LICENSE',
  LOOKUP_PAYMENT: 'LOOKUP_PAYMENT',
  LOOKUP_ENTITLEMENT: 'LOOKUP_ENTITLEMENT',
  LOOKUP_CREDITS: 'LOOKUP_CREDITS',
  SEARCH_KNOWLEDGE: 'SEARCH_KNOWLEDGE',
  ANSWER_DIRECTLY: 'ANSWER_DIRECTLY',
  ASK_DIAGNOSTIC: 'ASK_DIAGNOSTIC',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF'
});

/**
 * Execute planned read-only tools. Never writes.
 */
async function executeSupportTools(db, user, actions = []) {
  const uid = user && user.uid;
  const calls = [];
  const snapshot = {
    licenseSummary: null,
    creditSummary: null,
    paymentSummary: null,
    accountSummary: null,
    paymentQueryStatus: null,
    facts: [],
    canonicalFacts: [],
    blocks: []
  };

  const list = Array.isArray(actions) ? actions : [];
  for (const raw of list.slice(0, 4)) {
    const name = String(raw && (raw.action || raw) ? raw.action || raw : '')
      .toUpperCase()
      .trim();
    if (!name || name === TOOL_NAMES.SEARCH_KNOWLEDGE || name === TOOL_NAMES.ANSWER_DIRECTLY) continue;
    if (name === TOOL_NAMES.ASK_DIAGNOSTIC || name === TOOL_NAMES.HUMAN_HANDOFF) continue;

    let result = null;
    try {
      if (name === TOOL_NAMES.LOOKUP_ACCOUNT) result = await lookupAccount(db, user);
      else if (name === TOOL_NAMES.LOOKUP_LICENSE) result = await lookupLicense(db, uid);
      else if (name === TOOL_NAMES.LOOKUP_CREDITS) result = await lookupCredits(db, uid);
      else if (name === TOOL_NAMES.LOOKUP_PAYMENT) result = await lookupPayment(db, uid);
      else if (name === TOOL_NAMES.LOOKUP_ENTITLEMENT) result = await lookupEntitlement(db, uid);
      else continue;
    } catch (err) {
      result = {
        ok: false,
        summary: `tool_error:${name}`,
        facts: [],
        data: { error: String(err && err.message ? err.message : 'error').slice(0, 80) },
        queryStatus: 'UNAVAILABLE'
      };
    }

    calls.push({
      tool: name,
      ok: !!(result && result.ok),
      summary: result && result.summary,
      queryStatus: result && result.queryStatus
    });
    if (!result) continue;
    for (const f of result.facts || []) {
      snapshot.facts.push(f);
      snapshot.canonicalFacts.push(f);
    }
    snapshot.blocks.push(`[${name}] ${result.summary}`);
    if (result.canonical) {
      snapshot.canonicalFacts.push(
        `${result.canonical.type}:${JSON.stringify({
          found: result.canonical.found,
          status: result.canonical.status,
          plan: result.data && result.data.plan,
          active: result.data && result.data.active,
          expiresAt: result.data && result.data.expiresAt
        }).slice(0, 180)}`
      );
    }
    if (name === TOOL_NAMES.LOOKUP_LICENSE || name === TOOL_NAMES.LOOKUP_ENTITLEMENT) {
      snapshot.licenseSummary = result.summary;
      if (result.data && result.data.plan) {
        snapshot.canonicalFacts.push(
          `license_canonical=plan:${result.data.plan}|active:${!!result.data.active}|expires:${result.data.expiresAt || 'none'}`
        );
      }
      if (result.data && result.data.license) {
        const lic = result.data.license;
        snapshot.canonicalFacts.push(
          `license_canonical=plan:${lic.plan}|active:${!!lic.active}|expires:${lic.expiresAt || 'none'}`
        );
      }
    }
    if (name === TOOL_NAMES.LOOKUP_CREDITS || name === TOOL_NAMES.LOOKUP_ENTITLEMENT) {
      snapshot.creditSummary =
        result.data && result.data.credits
          ? `크레딧 잔액 ${result.data.credits.balance}`
          : result.data && Number.isFinite(result.data.balance)
            ? `크레딧 잔액 ${result.data.balance}`
            : result.summary;
    }
    if (name === TOOL_NAMES.LOOKUP_PAYMENT) {
      snapshot.paymentSummary = result.summary;
      snapshot.paymentQueryStatus = result.queryStatus || (result.ok ? 'FOUND' : 'QUERY_FAILED');
    }
    if (name === TOOL_NAMES.LOOKUP_ACCOUNT) snapshot.accountSummary = result.summary;
  }

  snapshot.canonicalFacts = [...new Set(snapshot.canonicalFacts)].slice(0, 20);
  return { calls, snapshot };
}

module.exports = {
  TOOL_NAMES,
  lookupAccount,
  lookupLicense,
  lookupCredits,
  lookupPayment,
  lookupEntitlement,
  executeSupportTools
};
