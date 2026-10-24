/**
 * Cross-check incident victims (124) against web orders + admin audits + hist license.
 * Read-only. Writes reports under dev/backups/lifetime_incident_20261024/
 *
 *   node dev/scripts/crosscheck_payment_license_incident_20261024.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../backups/lifetime_incident_20261024');
const PROJECT = 'midiaistudio';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const READ_TIME = '2026-10-24T14:45:00Z';
const INCIDENT_START = '2026-10-24T14:45:00Z';

function loadToken() {
  const p = path.join(process.env.USERPROFILE || '', '.config/configstore/firebase-tools.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).tokens.access_token;
}

function decodeFields(fields) {
  if (!fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue != null) out[k] = v.stringValue;
    else if (v.booleanValue != null) out[k] = v.booleanValue;
    else if (v.integerValue != null) out[k] = Number(v.integerValue);
    else if (v.doubleValue != null) out[k] = v.doubleValue;
    else if (v.timestampValue != null) out[k] = v.timestampValue;
    else if (v.nullValue !== undefined) out[k] = null;
    else if (v.mapValue) out[k] = decodeFields(v.mapValue.fields || {});
    else if (v.arrayValue) {
      out[k] = (v.arrayValue.values || []).map((x) => {
        if (x.stringValue != null) return x.stringValue;
        if (x.timestampValue != null) return x.timestampValue;
        if (x.integerValue != null) return Number(x.integerValue);
        return x;
      });
    } else out[k] = v;
  }
  return out;
}

async function runQuery(token, structuredQuery) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery })
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function getDoc(token, docPath, readTime) {
  let url = `${BASE}/${docPath}`;
  if (readTime) url += `?readTime=${encodeURIComponent(readTime)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  return { status: r.status, data: r.status === 200 ? decodeFields(body.fields) : null, updateTime: body.updateTime, error: body.error?.message };
}

function normPid(raw) {
  return String(raw || '').trim().toUpperCase();
}

function isLifetimePid(pid) {
  const p = normPid(pid);
  return p === 'LIFETIME' || p.includes('LIFETIME');
}

function isPassPid(pid) {
  const p = normPid(pid);
  return /^PASS_/.test(p) || p === 'FULL_PASS';
}

function isCreditPid(pid) {
  const p = normPid(pid);
  return /^CREDIT_/.test(p) || p.includes('CREDIT') || p.includes('MIRELO');
}

function orderWhen(o) {
  return o.completedAt || o.verifiedAt || o.issuedAt || o.paidAt || o.createdAt || o.updatedAt || '';
}

function isPaidOrderStatus(st) {
  const s = String(st || '').toLowerCase();
  if (!s) return false;
  if (['completed', 'paid', 'verified', 'active', 'success'].includes(s)) return true;
  if (s.includes('refund')) return false;
  if (['cancelled', 'canceled', 'failed', 'created', 'open', 'pending'].includes(s)) return false;
  return false;
}

function isRefundedStatus(st) {
  const s = String(st || '').toLowerCase();
  return s.includes('refund') || s === 'cancelled' || s === 'canceled';
}

function isManualProvider(o) {
  const blob = `${o.provider || ''} ${o.source || ''} ${o.paymentMethod || ''} ${o.method || ''} ${o.verificationStatus || ''}`.toLowerCase();
  return blob.includes('manual') || blob.includes('bank') || blob.includes('admin_manual') || blob.includes('계좌');
}

function classifyOrder(o) {
  const pid = normPid(o.productId || o.productCanonicalId || o.productDocId);
  const st = String(o.status || '');
  const refunded = isRefundedStatus(st) || Number(o.refundedAmount || 0) > 0 && !isPaidOrderStatus(st);
  const paidOk = isPaidOrderStatus(st) && !refunded;
  let kind = 'other';
  if (isLifetimePid(pid) || String(o.plan || '').toLowerCase() === 'lifetime') kind = 'lifetime';
  else if (isPassPid(pid) || String(o.plan || '').toLowerCase() === 'period') kind = 'period';
  else if (isCreditPid(pid) || String(o.plan || '').toLowerCase() === 'credits') kind = 'credits';
  return {
    id: o.id || o.paymentId || '',
    productId: pid,
    productName: o.productName || o.orderName || '',
    plan: o.plan || '',
    status: st,
    amount: o.amount ?? o.paidAmount ?? null,
    currency: o.currency || 'KRW',
    method: o.paymentMethod || o.method || o.provider || '',
    provider: o.provider || '',
    source: o.source || '',
    licenseIssued: o.licenseIssued === true,
    durationDays: o.durationDays != null ? Number(o.durationDays) : null,
    when: orderWhen(o),
    memo: o.memo || o.adminMemo || '',
    manual: isManualProvider(o),
    paidOk,
    refunded,
    kind
  };
}

async function fetchOrdersForUid(token, uid) {
  // Prefer equality filter; fall back empty on index/errors.
  try {
    const rows = await runQuery(token, {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: uid }
        }
      },
      limit: 50
    });
    return rows
      .filter((x) => x.document)
      .map((x) => ({ id: x.document.name.split('/').pop(), ...decodeFields(x.document.fields) }));
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function fetchAuditsForUid(token, uid) {
  try {
    const rows = await runQuery(token, {
      from: [{ collectionId: 'adminAuditLogs' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'targetUserId' },
          op: 'EQUAL',
          value: { stringValue: uid }
        }
      },
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
      limit: 40
    });
    return rows
      .filter((x) => x.document)
      .map((x) => {
        const d = decodeFields(x.document.fields) || {};
        return {
          id: x.document.name.split('/').pop(),
          action: d.action,
          category: d.category,
          summary: d.summary,
          timestamp: d.timestamp,
          before: d.before || null,
          after: d.after || null,
          result: d.result
        };
      });
  } catch (e) {
    // composite index may be missing — try without orderBy
    try {
      const rows = await runQuery(token, {
        from: [{ collectionId: 'adminAuditLogs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'targetUserId' },
            op: 'EQUAL',
            value: { stringValue: uid }
          }
        },
        limit: 40
      });
      return rows
        .filter((x) => x.document)
        .map((x) => {
          const d = decodeFields(x.document.fields) || {};
          return {
            id: x.document.name.split('/').pop(),
            action: d.action,
            category: d.category,
            summary: d.summary,
            timestamp: d.timestamp,
            before: d.before || null,
            after: d.after || null,
            result: d.result
          };
        });
    } catch (e2) {
      return [];
    }
  }
}

function paidLicenseEvidence(orders, audits) {
  const classified = (Array.isArray(orders) ? orders : []).map(classifyOrder);
  const paidLifetime = classified.filter((o) => o.paidOk && o.kind === 'lifetime');
  const paidPeriod = classified.filter((o) => o.paidOk && o.kind === 'period');
  const refundedLicense = classified.filter((o) => o.refunded && (o.kind === 'lifetime' || o.kind === 'period'));
  const manualLifetime = paidLifetime.filter((o) => o.manual);
  const manualPeriod = paidPeriod.filter((o) => o.manual);
  const webLife = paidLifetime.filter((o) => !o.manual);
  const webPeriod = paidPeriod.filter((o) => !o.manual);

  const licenseAudits = (audits || []).filter((a) => {
    const act = String(a.action || '');
    const cat = String(a.category || '');
    return cat === 'license' || /지급|라이선스|이용권|수기/.test(act);
  });
  const manualLicenseAudits = licenseAudits.filter((a) => {
    const act = String(a.action || '');
    const method = String(a.after?.method || a.before?.method || '');
    return /수동|수기|manual|계좌|기간제|Lifetime|체험/.test(act + method + String(a.summary || ''));
  });

  return {
    orders: classified,
    paidLifetime,
    paidPeriod,
    refundedLicense,
    manualLifetime,
    manualPeriod,
    webLife,
    webPeriod,
    hasPaidLifetime: paidLifetime.length > 0,
    hasPaidPeriod: paidPeriod.length > 0,
    hasAnyPaidLicense: paidLifetime.length + paidPeriod.length > 0,
    licenseAudits: licenseAudits.slice(0, 15),
    manualLicenseAudits: manualLicenseAudits.slice(0, 15)
  };
}

function decideBucket(incidentGroup, histPlan, evidence) {
  const hist = String(histPlan || '').toLowerCase();
  const auditBefore = String(incidentGroup || '').toLowerCase(); // lifetime|trial|period from audit

  // Strong paid lifetime evidence always A-like
  if (evidence.hasPaidLifetime || hist === 'lifetime' || auditBefore === 'lifetime') {
    if (hist && hist !== 'lifetime' && evidence.hasPaidLifetime) {
      return { bucket: 'REVIEW_CONFLICT', reason: 'paid_lifetime_vs_hist_not_lifetime' };
    }
    return { bucket: 'A_LIFETIME', reason: evidence.hasPaidLifetime ? 'paid_lifetime_order' : 'hist_or_audit_lifetime' };
  }

  if (evidence.hasPaidPeriod || hist === 'period' || auditBefore === 'period') {
    // If audit said trial but paid period exists → reclassify
    if (auditBefore === 'trial' && evidence.hasPaidPeriod) {
      return { bucket: 'B_RECLASS_PAID_PERIOD', reason: 'audit_trial_but_paid_period_orders' };
    }
    if (hist === 'trial' && evidence.hasPaidPeriod) {
      return { bucket: 'REVIEW_CONFLICT', reason: 'hist_trial_but_paid_period' };
    }
    return { bucket: 'C_PERIOD', reason: evidence.hasPaidPeriod ? 'paid_period_order' : 'hist_or_audit_period' };
  }

  // trial / welcome path
  if (auditBefore === 'trial' || hist === 'trial' || !hist) {
    return { bucket: 'B_TRIAL_OK', reason: 'no_paid_license_orders' };
  }

  return { bucket: 'REVIEW_UNKNOWN', reason: `hist=${hist} audit=${auditBefore}` };
}

async function main() {
  const token = loadToken();
  const victims = JSON.parse(fs.readFileSync(path.join(OUT, 'audit_all.json'), 'utf8'));
  const cHistCached = fs.existsSync(path.join(OUT, 'group_C_historical_vs_current.json'))
    ? JSON.parse(fs.readFileSync(path.join(OUT, 'group_C_historical_vs_current.json'), 'utf8'))
    : [];
  const cHistMap = new Map(cHistCached.map((r) => [r.uid, r]));

  const rows = [];
  let i = 0;
  for (const v of victims) {
    i += 1;
    const uid = v.targetUserId;
    process.stdout.write(`\r[${i}/${victims.length}] ${uid.slice(0, 8)}…`);
    const ordersRaw = await fetchOrdersForUid(token, uid);
    const audits = await fetchAuditsForUid(token, uid);
    const cur = await getDoc(token, `licenses/${uid}`);
    let hist = cHistMap.get(uid)?.historical
      ? { status: 200, data: {
          plan: cHistMap.get(uid).historical.plan,
          method: cHistMap.get(uid).historical.method,
          startsAt: cHistMap.get(uid).historical.startsAt,
          expiresAt: cHistMap.get(uid).historical.expiresAt,
          passProductId: cHistMap.get(uid).historical.passProductId,
          memo: cHistMap.get(uid).historical.memo,
          hwid: cHistMap.get(uid).historical.hwid,
          licensed: cHistMap.get(uid).historical.licensed,
          status: cHistMap.get(uid).historical.statusLic
        } }
      : await getDoc(token, `licenses/${uid}`, READ_TIME);

    // Prefer live readTime when available
    if (!cHistMap.has(uid)) {
      const liveHist = await getDoc(token, `licenses/${uid}`, READ_TIME);
      if (liveHist.status === 200 && liveHist.data) hist = liveHist;
    } else {
      const liveHist = await getDoc(token, `licenses/${uid}`, READ_TIME);
      if (liveHist.status === 200 && liveHist.data) hist = liveHist;
    }

    const evidence = paidLicenseEvidence(Array.isArray(ordersRaw) ? ordersRaw : [], audits);
    const decision = decideBucket(v.beforePlan, hist.data?.plan, evidence);

    rows.push({
      uid,
      email: v.targetEmail,
      incidentAudit: {
        beforePlan: v.beforePlan,
        afterPlan: v.afterPlan,
        afterDays: v.afterDays,
        summary: v.summary,
        timestamp: v.timestamp
      },
      histLicense: hist.status === 200 ? {
        plan: hist.data?.plan || null,
        method: hist.data?.method || null,
        startsAt: hist.data?.startsAt || null,
        expiresAt: hist.data?.expiresAt || null,
        passProductId: hist.data?.passProductId || null,
        memo: hist.data?.memo || null,
        hwid: hist.data?.hwid || null,
        licensed: hist.data?.licensed ?? null,
        status: hist.data?.status || null
      } : { error: hist.error || `status_${hist.status}` },
      currentLicense: cur.status === 200 ? {
        plan: cur.data?.plan || null,
        method: cur.data?.method || null,
        startsAt: cur.data?.startsAt || null,
        expiresAt: cur.data?.expiresAt || null,
        passProductId: cur.data?.passProductId || null,
        durationDays: cur.data?.durationDays ?? null,
        hwid: cur.data?.hwid || null,
        updateTime: cur.updateTime
      } : { error: cur.error || `status_${cur.status}` },
      evidence: {
        hasPaidLifetime: evidence.hasPaidLifetime,
        hasPaidPeriod: evidence.hasPaidPeriod,
        hasAnyPaidLicense: evidence.hasAnyPaidLicense,
        webLifeCount: evidence.webLife.length,
        manualLifetimeCount: evidence.manualLifetime.length,
        webPeriodCount: evidence.webPeriod.length,
        manualPeriodCount: evidence.manualPeriod.length,
        paidLifetime: evidence.paidLifetime,
        paidPeriod: evidence.paidPeriod,
        refundedLicense: evidence.refundedLicense,
        manualLicenseAudits: evidence.manualLicenseAudits
      },
      decision
    });
  }
  process.stdout.write('\n');

  const byBucket = {};
  for (const r of rows) {
    const b = r.decision.bucket;
    byBucket[b] = (byBucket[b] || 0) + 1;
  }

  // Global payment stats among victims
  const stats = {
    victims: rows.length,
    webPaidLifetimeUsers: rows.filter((r) => r.evidence.webLifeCount > 0).length,
    manualPaidLifetimeUsers: rows.filter((r) => r.evidence.manualLifetimeCount > 0).length,
    webPaidPeriodUsers: rows.filter((r) => r.evidence.webPeriodCount > 0).length,
    manualPaidPeriodUsers: rows.filter((r) => r.evidence.manualPeriodCount > 0).length,
    anyPaidLicenseUsers: rows.filter((r) => r.evidence.hasAnyPaidLicense).length,
    buckets: byBucket,
    bReclass: rows.filter((r) => r.decision.bucket === 'B_RECLASS_PAID_PERIOD'),
    reviewConflict: rows.filter((r) => r.decision.bucket === 'REVIEW_CONFLICT' || r.decision.bucket === 'REVIEW_UNKNOWN'),
    periodRestoreCandidates: rows.filter((r) => r.decision.bucket === 'C_PERIOD' || r.decision.bucket === 'B_RECLASS_PAID_PERIOD')
  };

  fs.writeFileSync(path.join(OUT, 'payment_crosscheck_all.json'), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT, 'payment_crosscheck_summary.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    readTime: READ_TIME,
    incidentStart: INCIDENT_START,
    stats,
    bReclassEmails: stats.bReclass.map((r) => ({ uid: r.uid, email: r.email, reason: r.decision.reason, paidPeriod: r.evidence.paidPeriod })),
    reviewEmails: stats.reviewConflict.map((r) => ({ uid: r.uid, email: r.email, bucket: r.decision.bucket, reason: r.decision.reason })),
    periodCandidates: stats.periodRestoreCandidates.map((r) => ({
      uid: r.uid,
      email: r.email,
      bucket: r.decision.bucket,
      histExpires: r.histLicense.expiresAt,
      histPass: r.histLicense.passProductId,
      histMethod: r.histLicense.method,
      currentExpires: r.currentLicense.expiresAt,
      paidPeriod: r.evidence.paidPeriod
    }))
  }, null, 2));

  console.log(JSON.stringify({
    victims: stats.victims,
    buckets: stats.buckets,
    webPaidLifetimeUsers: stats.webPaidLifetimeUsers,
    manualPaidLifetimeUsers: stats.manualPaidLifetimeUsers,
    webPaidPeriodUsers: stats.webPaidPeriodUsers,
    manualPaidPeriodUsers: stats.manualPaidPeriodUsers,
    anyPaidLicenseUsers: stats.anyPaidLicenseUsers,
    bReclassCount: stats.bReclass.length,
    reviewCount: stats.reviewConflict.length,
    periodCandidateCount: stats.periodRestoreCandidates.length
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
