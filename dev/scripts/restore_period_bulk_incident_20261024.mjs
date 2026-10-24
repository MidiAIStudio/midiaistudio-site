/**
 * Restore period licenses overwritten by bulk 3-day grant (2026-10-24).
 * Uses payment_crosscheck_all.json + hist snapshot. Does NOT touch Lifetime.
 *
 *   node dev/scripts/restore_period_bulk_incident_20261024.mjs
 *   node dev/scripts/restore_period_bulk_incident_20261024.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../backups/lifetime_incident_20261024');
const APPLY = process.argv.includes('--apply');
const PROJECT = 'midiaistudio';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const INCIDENT_EXPIRES_PREFIX = '2026-10-27T';

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
    else out[k] = v;
  }
  return out;
}

async function getDoc(token, docPath) {
  const r = await fetch(`${BASE}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  return { status: r.status, data: r.status === 200 ? decodeFields(body.fields) : null, updateTime: body.updateTime, error: body.error?.message };
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') {
    // ISO timestamp strings for startsAt/expiresAt
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return { timestampValue: v };
    return { stringValue: v };
  }
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  return { stringValue: String(v) };
}

function matchesIncidentFingerprint(cur) {
  if (!cur) return false;
  if (String(cur.plan || '').toLowerCase() !== 'period') return false;
  if (String(cur.method || '').toLowerCase() !== 'admin_bulk') return false;
  if (!String(cur.expiresAt || '').startsWith(INCIDENT_EXPIRES_PREFIX)) return false;
  return true;
}

function alreadyRestored(cur, hist) {
  if (!cur || !hist) return false;
  if (String(cur.plan || '').toLowerCase() !== 'period') return false;
  if (String(cur.method || '').toLowerCase() === 'admin_bulk') return false;
  return String(cur.expiresAt || '') === String(hist.expiresAt || '')
    && String(cur.method || '') === String(hist.method || '');
}

function buildCandidates(all) {
  const out = [];
  for (const r of all) {
    const bucket = r.decision?.bucket;
    const hist = r.histLicense || {};
    if (hist.error) continue;

    // C group: restore hist period snapshot
    if (bucket === 'C_PERIOD' && String(hist.plan || '').toLowerCase() === 'period' && hist.expiresAt) {
      const paid = (r.evidence?.paidPeriod || []).length > 0;
      const manualGrant = (r.evidence?.manualLicenseAudits || []).some((a) => String(a.action || '').includes('PASS_ADMIN') || String(a.after?.method || '') === 'manual');
      const welcome = String(hist.method || '') === 'welcome_signup';
      out.push({
        uid: r.uid,
        email: r.email,
        action: 'restore_hist_period',
        evidence: paid ? 'paid_order+hist' : (manualGrant ? 'admin_manual_grant+hist' : (welcome ? 'welcome_hist' : 'hist_snapshot')),
        hist,
        current: r.currentLicense,
        paidPeriod: r.evidence?.paidPeriod || [],
        skip: false
      });
      continue;
    }

    // Paid period order but hist already trial (expired entitlement) → keep current 3d, do not invent expiry
    if (bucket === 'B_RECLASS_PAID_PERIOD') {
      out.push({
        uid: r.uid,
        email: r.email,
        action: 'keep_current',
        evidence: 'paid_period_expired_before_incident_hist_was_trial',
        hist,
        current: r.currentLicense,
        paidPeriod: r.evidence?.paidPeriod || [],
        skip: true,
        reason: 'hist_plan_trial_paid_30d_already_elapsed'
      });
    }
  }
  return out;
}

async function commitRestore(token, uid, hist, currentUpdateTime) {
  const name = `projects/${PROJECT}/databases/(default)/documents/licenses/${uid}`;
  const fields = {
    plan: toValue('period'),
    status: toValue(hist.status || 'active'),
    licensed: toValue(hist.licensed !== false),
    method: toValue(String(hist.method || 'manual')),
    updatedAt: { timestampValue: new Date().toISOString() }
  };
  const mask = ['plan', 'status', 'licensed', 'method', 'updatedAt', 'startsAt', 'expiresAt', 'passProductId', 'durationDays', 'memo'];

  if (hist.startsAt) fields.startsAt = toValue(hist.startsAt);
  if (hist.expiresAt) fields.expiresAt = toValue(hist.expiresAt);
  if (hist.passProductId) fields.passProductId = toValue(hist.passProductId);
  if (hist.memo != null && hist.memo !== '') fields.memo = toValue(String(hist.memo));
  else {
    // omit memo from mask → keep current memo
    const i = mask.indexOf('memo');
    if (i >= 0) mask.splice(i, 1);
  }
  // durationDays always delete (bulk artifact)
  // startsAt/expiresAt/passProductId: if hist missing, delete
  if (!hist.startsAt) { /* in mask, absent from fields → delete */ }
  if (!hist.expiresAt) throw new Error('hist expiresAt required');
  if (!hist.passProductId) { /* delete passProductId */ }

  const write = {
    update: { name, fields },
    updateMask: { fieldPaths: mask },
    currentDocument: { updateTime: currentUpdateTime }
  };
  const r = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [write] })
  });
  const body = await r.json();
  return { status: r.status, body };
}

async function writeAudit(token, entry) {
  await fetch(`${BASE}/adminAuditLogs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        timestamp: { timestampValue: new Date().toISOString() },
        targetUserId: toValue(entry.uid),
        targetEmail: toValue(entry.email || ''),
        category: toValue('license'),
        action: toValue('기간제 긴급 복구'),
        actorType: toValue('script'),
        actorId: toValue('restore_period_bulk_incident_20261024'),
        actorEmail: toValue('kantzz111@gmail.com'),
        before: {
          mapValue: {
            fields: {
              plan: toValue(entry.beforePlan || ''),
              method: toValue(entry.beforeMethod || ''),
              expiresAt: toValue(entry.beforeExpires || '')
            }
          }
        },
        after: {
          mapValue: {
            fields: {
              plan: toValue('period'),
              method: toValue(entry.afterMethod || ''),
              expiresAt: toValue(entry.afterExpires || ''),
              passProductId: toValue(entry.afterPass || ''),
              recovery: toValue('bulk_period_overwrite_20261024')
            }
          }
        },
        result: toValue(entry.result || 'success'),
        summary: toValue(entry.summary || 'admin_bulk 3d → hist period restore')
      }
    })
  });
}

async function main() {
  const token = loadToken();
  const all = JSON.parse(fs.readFileSync(path.join(OUT, 'payment_crosscheck_all.json'), 'utf8'));
  const candidates = buildCandidates(all);
  const results = [];

  for (const c of candidates) {
    const item = {
      uid: c.uid,
      email: c.email,
      intendedAction: c.action,
      evidence: c.evidence,
      histExpires: c.hist.expiresAt || null,
      histMethod: c.hist.method || null,
      histPass: c.hist.passProductId || null,
      mode: APPLY ? 'apply' : 'dry-run',
      action: 'pending',
      reason: c.reason || ''
    };

    if (c.skip || c.action === 'keep_current') {
      item.action = 'keep_current';
      item.reason = c.reason || 'skip';
      results.push(item);
      continue;
    }

    const curRes = await getDoc(token, `licenses/${c.uid}`);
    const cur = curRes.data;
    item.currentPlan = cur?.plan || null;
    item.currentMethod = cur?.method || null;
    item.currentExpires = cur?.expiresAt || null;

    // Never touch lifetime
    if (String(cur?.plan || '').toLowerCase() === 'lifetime') {
      item.action = 'skip';
      item.reason = 'current_is_lifetime';
      results.push(item);
      continue;
    }

    if (alreadyRestored(cur, c.hist)) {
      item.action = 'already_ok';
      item.reason = 'already_matches_hist';
      results.push(item);
      continue;
    }

    if (!matchesIncidentFingerprint(cur)) {
      item.action = 'skip_conflict';
      item.reason = 'current_not_incident_fingerprint';
      results.push(item);
      continue;
    }

    if (c.hist.hwid && cur.hwid && String(c.hist.hwid) !== String(cur.hwid)) {
      item.action = 'skip_conflict';
      item.reason = 'hwid_mismatch';
      results.push(item);
      continue;
    }

    item.action = APPLY ? 'restore' : 'would_restore';
    item.restoreTo = {
      plan: 'period',
      method: c.hist.method,
      startsAt: c.hist.startsAt,
      expiresAt: c.hist.expiresAt,
      passProductId: c.hist.passProductId,
      memo: c.hist.memo
    };

    if (APPLY) {
      const commit = await commitRestore(token, c.uid, c.hist, curRes.updateTime);
      if (commit.status >= 200 && commit.status < 300 && !commit.body.error) {
        item.result = 'success';
        await writeAudit(token, {
          uid: c.uid,
          email: c.email,
          beforePlan: cur.plan,
          beforeMethod: cur.method,
          beforeExpires: cur.expiresAt,
          afterMethod: c.hist.method,
          afterExpires: c.hist.expiresAt,
          afterPass: c.hist.passProductId || '',
          result: 'success',
          summary: `admin_bulk 3d → ${c.hist.method} · expires ${c.hist.expiresAt}`
        });
      } else {
        item.action = 'failed';
        item.result = 'fail';
        item.error = JSON.stringify(commit.body).slice(0, 400);
      }
    }
    results.push(item);
  }

  const summary = {
    apply: APPLY,
    totalCandidates: candidates.length,
    would_restore: results.filter((r) => r.action === 'would_restore').length,
    restored: results.filter((r) => r.action === 'restore' && r.result === 'success').length,
    keep_current: results.filter((r) => r.action === 'keep_current').length,
    already_ok: results.filter((r) => r.action === 'already_ok').length,
    skip_conflict: results.filter((r) => r.action === 'skip_conflict').length,
    skip: results.filter((r) => r.action === 'skip').length,
    failed: results.filter((r) => r.action === 'failed').length,
    results
  };
  const outFile = path.join(OUT, APPLY ? 'period_restore_apply_report.json' : 'period_restore_dry_run_report.json');
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

  // Human-readable comparison table
  const table = results.map((r) => ({
    email: r.email,
    evidence: r.evidence,
    before: { plan: r.currentPlan, method: r.currentMethod, expires: r.currentExpires },
    hist: { method: r.histMethod, expires: r.histExpires, pass: r.histPass },
    action: r.action,
    restoreTo: r.restoreTo || null,
    reason: r.reason || ''
  }));
  fs.writeFileSync(path.join(OUT, APPLY ? 'period_restore_apply_table.json' : 'period_restore_dry_run_table.json'), JSON.stringify(table, null, 2));

  console.log(JSON.stringify({
    apply: summary.apply,
    would_restore: summary.would_restore,
    restored: summary.restored,
    keep_current: summary.keep_current,
    already_ok: summary.already_ok,
    skip_conflict: summary.skip_conflict,
    failed: summary.failed,
    outFile,
    table
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
