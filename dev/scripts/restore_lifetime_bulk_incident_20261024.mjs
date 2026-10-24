/**
 * Emergency restore: Lifetime members overwritten by bulk 3-day period grant (2026-10-24).
 *
 * Evidence sources (all required for apply):
 * - adminAuditLogs before.plan === lifetime
 * - Firestore readTime snapshot plan === lifetime (pre-incident)
 * - Current doc still matches incident fingerprint (period + admin_bulk + Oct 27 expiry)
 *
 * Usage:
 *   node dev/scripts/restore_lifetime_bulk_incident_20261024.mjs           # dry-run
 *   node dev/scripts/restore_lifetime_bulk_incident_20261024.mjs --apply   # write
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
const READ_TIME = '2026-10-24T14:45:00Z';

function loadToken() {
  const p = path.join(process.env.USERPROFILE || '', '.config/configstore/firebase-tools.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  return cfg.tokens.access_token;
}

async function getDoc(token, docPath, readTime) {
  let url = `${BASE}/${docPath}`;
  if (readTime) url += `?readTime=${encodeURIComponent(readTime)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  return { status: r.status, body, updateTime: body.updateTime || null };
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

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  return { stringValue: String(v) };
}

function matchesIncidentFingerprint(cur) {
  if (!cur) return false;
  if (String(cur.plan || '').toLowerCase() !== 'period') return false;
  if (String(cur.method || '').toLowerCase() !== 'admin_bulk') return false;
  const exp = String(cur.expiresAt || '');
  if (!exp.startsWith(INCIDENT_EXPIRES_PREFIX)) return false;
  return true;
}

function isAlreadyLifetime(cur) {
  return String(cur?.plan || '').toLowerCase() === 'lifetime' && cur?.licensed === true;
}

async function commitRestore(token, uid, hist, currentUpdateTime) {
  const name = `projects/${PROJECT}/databases/(default)/documents/licenses/${uid}`;
  const fields = {
    plan: toFirestoreValue('lifetime'),
    status: toFirestoreValue('active'),
    licensed: toFirestoreValue(true),
    method: toFirestoreValue(String(hist.method || 'admin')),
    updatedAt: { timestampValue: new Date().toISOString() }
  };
  if (hist.memo != null && hist.memo !== '') {
    fields.memo = toFirestoreValue(String(hist.memo));
  }
  // Fields in updateMask but omitted from fields → deleted.
  const updateMask = {
    fieldPaths: [
      'plan',
      'status',
      'licensed',
      'method',
      'updatedAt',
      'memo',
      'startsAt',
      'expiresAt',
      'passProductId',
      'durationDays',
      'expireReason',
      'expiredAt'
    ]
  };
  if (hist.memo == null || hist.memo === '') {
    // keep current memo if hist had none (avoid wiping unrelated notes written after incident)
    updateMask.fieldPaths = updateMask.fieldPaths.filter((p) => p !== 'memo');
    delete fields.memo;
  }

  const write = {
    update: { name, fields },
    updateMask,
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
  const r = await fetch(`${BASE}/adminAuditLogs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        timestamp: { timestampValue: new Date().toISOString() },
        targetUserId: toFirestoreValue(entry.targetUserId),
        targetEmail: toFirestoreValue(entry.targetEmail || ''),
        category: toFirestoreValue('license'),
        action: toFirestoreValue('Lifetime 긴급 복구'),
        actorType: toFirestoreValue('script'),
        actorId: toFirestoreValue('restore_lifetime_bulk_incident_20261024'),
        actorEmail: toFirestoreValue('kantzz111@gmail.com'),
        before: {
          mapValue: {
            fields: {
              plan: toFirestoreValue(entry.beforePlan || ''),
              method: toFirestoreValue(entry.beforeMethod || ''),
              expiresAt: toFirestoreValue(entry.beforeExpiresAt || '')
            }
          }
        },
        after: {
          mapValue: {
            fields: {
              plan: toFirestoreValue('lifetime'),
              status: toFirestoreValue('active'),
              method: toFirestoreValue(entry.restoredMethod || ''),
              recovery: toFirestoreValue('bulk_period_overwrite_20261024')
            }
          }
        },
        result: toFirestoreValue(entry.result || 'success'),
        summary: toFirestoreValue(entry.summary || 'period → lifetime (incident restore)')
      }
    })
  });
  return r.status;
}

async function main() {
  const token = loadToken();
  const victims = JSON.parse(fs.readFileSync(path.join(OUT, 'group_A_lifetime_victims.json'), 'utf8'));
  const results = [];

  for (const row of victims) {
    const uid = row.targetUserId;
    const curRes = await getDoc(token, `licenses/${uid}`);
    const histRes = await getDoc(token, `licenses/${uid}`, READ_TIME);
    const cur = curRes.status === 200 ? decodeFields(curRes.body.fields) : null;
    const hist = histRes.status === 200 ? decodeFields(histRes.body.fields) : null;

    const item = {
      uid,
      email: row.targetEmail,
      mode: APPLY ? 'apply' : 'dry-run',
      action: 'pending',
      reason: '',
      histPlan: hist?.plan || null,
      histMethod: hist?.method || null,
      currentPlan: cur?.plan || null,
      currentMethod: cur?.method || null,
      currentExpiresAt: cur?.expiresAt || null,
      currentUpdateTime: curRes.updateTime
    };

    if (!hist || String(hist.plan || '').toLowerCase() !== 'lifetime') {
      item.action = 'skip';
      item.reason = 'historical_not_lifetime';
      results.push(item);
      continue;
    }
    if (String(row.beforePlan || '').toLowerCase() !== 'lifetime') {
      item.action = 'skip';
      item.reason = 'audit_before_not_lifetime';
      results.push(item);
      continue;
    }
    if (isAlreadyLifetime(cur)) {
      item.action = 'already_ok';
      item.reason = 'already_lifetime';
      results.push(item);
      continue;
    }
    if (!matchesIncidentFingerprint(cur)) {
      item.action = 'skip_conflict';
      item.reason = 'current_not_incident_fingerprint';
      results.push(item);
      continue;
    }
    if (hist.hwid && cur.hwid && String(hist.hwid) !== String(cur.hwid)) {
      item.action = 'skip_conflict';
      item.reason = 'hwid_mismatch';
      results.push(item);
      continue;
    }

    item.action = APPLY ? 'restore' : 'would_restore';
    item.reason = 'verified_A';
    item.restoredMethod = hist.method || 'admin';

    if (APPLY) {
      const commit = await commitRestore(token, uid, hist, curRes.updateTime);
      if (commit.status >= 200 && commit.status < 300 && !commit.body.error) {
        item.result = 'success';
        await writeAudit(token, {
          targetUserId: uid,
          targetEmail: row.targetEmail,
          beforePlan: cur.plan,
          beforeMethod: cur.method,
          beforeExpiresAt: cur.expiresAt,
          restoredMethod: item.restoredMethod,
          result: 'success',
          summary: `period → lifetime · restore after bulk 3d overwrite`
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
    total: results.length,
    would_restore: results.filter((r) => r.action === 'would_restore').length,
    restored: results.filter((r) => r.action === 'restore' && r.result === 'success').length,
    already_ok: results.filter((r) => r.action === 'already_ok').length,
    skip_conflict: results.filter((r) => r.action === 'skip_conflict').length,
    skip: results.filter((r) => r.action === 'skip').length,
    failed: results.filter((r) => r.action === 'failed').length,
    results
  };
  const outFile = path.join(OUT, APPLY ? 'restore_apply_report.json' : 'restore_dry_run_report.json');
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    apply: summary.apply,
    total: summary.total,
    would_restore: summary.would_restore,
    restored: summary.restored,
    already_ok: summary.already_ok,
    skip_conflict: summary.skip_conflict,
    skip: summary.skip,
    failed: summary.failed,
    outFile
  }, null, 2));
}

main().catch((e) => {
  console.error(String(e && e.stack || e));
  process.exit(1);
});
