'use strict';

/**
 * One-shot backfill: licenses.hwid → signupBonusClaims/{fingerprint}
 *
 * - Does NOT change or reclaim any credits / wallets / ledgers / licenses
 * - Does NOT change HWID, plan, startsAt, expiresAt
 * - One claim per fingerprint; logs related UID count when multiple share HWID
 * - Prefer claimant = UID that already has welcome_credit_grants with amount > 0
 *
 * Run:
 *   set SIGNUP_BONUS_HMAC_SECRET=...
 *   node functions/migrateSignupBonusClaims.js --dry-run
 *   node functions/migrateSignupBonusClaims.js
 *   node functions/migrateSignupBonusClaims.js --force
 */

const {
  normalizeHwid,
  isUsableHwid,
  deviceFingerprintFromHwid,
  configureDeviceFingerprint,
  getFingerprintSecret
} = require('./deviceFingerprint');

const CLAIM_COLLECTION = 'signupBonusClaims';
const GRANT_COLLECTION = 'welcome_credit_grants';
const MIGRATION_DOC = 'admin_config/signup_bonus_claims_migration';
const RELATED_UIDS_CAP = 40;

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

function normalizePlan(plan) {
  return String(plan || '').toLowerCase().trim();
}

/**
 * Pick which UID owns the device claim when several share a fingerprint.
 * Prefer a UID that already received welcome credits (legacy UID grant).
 */
function pickClaimant(candidates) {
  const list = Array.isArray(candidates) ? candidates.slice() : [];
  list.sort((a, b) => {
    const ag = a.hasWelcomeGrant ? 1 : 0;
    const bg = b.hasWelcomeGrant ? 1 : 0;
    if (ag !== bg) return bg - ag;
    const at = toMillis(a.grantedAt) || toMillis(a.hwidBoundAt) || 0;
    const bt = toMillis(b.grantedAt) || toMillis(b.hwidBoundAt) || 0;
    if (at !== bt) return at - bt;
    return String(a.uid).localeCompare(String(b.uid));
  });
  return list[0] || null;
}

async function loadAllLicenses(db) {
  const snap = await db.collection('licenses').get();
  const rows = [];
  for (const doc of snap.docs || []) {
    const data = doc.data() || {};
    rows.push({
      uid: String(doc.id || '').trim(),
      hwid: normalizeHwid(data.hwid),
      plan: normalizePlan(data.plan),
      status: String(data.status || ''),
      startsAt: data.startsAt || data.startAt || null,
      expiresAt: data.expiresAt || null,
      email: String(data.email || ''),
      hwidBoundAt: data.hwidBoundAt || data.updatedAt || null,
      raw: data
    });
  }
  return rows;
}

async function enrichWithGrants(db, rows) {
  const out = [];
  for (const row of rows) {
    let hasWelcomeGrant = false;
    let grantAmount = 0;
    let grantedAt = null;
    let email = row.email;
    try {
      const g = await db.collection(GRANT_COLLECTION).doc(row.uid).get();
      if (g.exists) {
        const d = g.data() || {};
        grantAmount = Number(d.amount || 0) || 0;
        hasWelcomeGrant = grantAmount > 0 || d.creditGranted === true;
        grantedAt = d.grantedAt || null;
        if (!email) email = String(d.email || '');
      }
    } catch (_) { /* optional */ }
    out.push({ ...row, email, hasWelcomeGrant, grantAmount, grantedAt });
  }
  return out;
}

function summarizeLicensePlans(allLicenses) {
  let lifetime = 0;
  let period = 0;
  let trial = 0;
  let other = 0;
  let withHwid = 0;
  for (const row of allLicenses) {
    if (isUsableHwid(row.hwid)) withHwid += 1;
    if (row.plan === 'lifetime') lifetime += 1;
    else if (row.plan === 'period') period += 1;
    else if (row.plan === 'trial') trial += 1;
    else other += 1;
  }
  return {
    totalLicenses: allLicenses.length,
    withHwid,
    lifetime,
    period,
    trial,
    other
  };
}

/**
 * @returns {Promise<object>}
 */
async function migrateSignupBonusClaims(db, {
  FieldValue,
  dryRun = false,
  force = false,
  secret,
  logger = console
} = {}) {
  if (secret) configureDeviceFingerprint({ secret });
  const hmac = getFingerprintSecret();
  if (!hmac) {
    throw Object.assign(new Error('SIGNUP_BONUS_HMAC_SECRET is required'), {
      code: 'HMAC_SECRET_MISSING'
    });
  }

  const migRef = db.doc
    ? db.doc(MIGRATION_DOC)
    : db.collection('admin_config').doc('signup_bonus_claims_migration');
  const migSnap = await migRef.get();
  if (migSnap.exists && !force && !dryRun) {
    const prev = migSnap.data() || {};
    logger.info('migrateSignupBonusClaims skipped (already completed)', {
      completedAt: prev.completedAt || null,
      created: prev.created
    });
    return {
      skipped: true,
      reason: 'already_completed',
      dryRun: false,
      scanned: 0,
      fingerprints: 0,
      created: 0,
      alreadyExisted: 0,
      multiUidFingerprints: 0,
      creditsChangedUsers: 0,
      licensesChangedUsers: 0,
      details: []
    };
  }

  const allLicenses = await enrichWithGrants(db, await loadAllLicenses(db));
  const planStats = summarizeLicensePlans(allLicenses);
  const rows = allLicenses.filter((r) => isUsableHwid(r.hwid));

  const byFp = new Map();
  for (const row of rows) {
    const fp = deviceFingerprintFromHwid(row.hwid);
    if (!fp) continue;
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(row);
  }

  let created = 0;
  let alreadyExisted = 0;
  let multiUidFingerprints = 0;
  const details = [];

  for (const [fingerprint, group] of byFp.entries()) {
    const relatedUidCount = group.length;
    if (relatedUidCount > 1) multiUidFingerprints += 1;
    const relatedUids = group.map((g) => g.uid).slice(0, RELATED_UIDS_CAP);
    const claimant = pickClaimant(group);
    if (!claimant) continue;

    const claimRef = db.collection(CLAIM_COLLECTION).doc(fingerprint);
    const existing = await claimRef.get();
    if (existing.exists) {
      alreadyExisted += 1;
      logger.info('migrateSignupBonusClaims claim exists', {
        fingerprint: fingerprint.slice(0, 12) + '…',
        relatedUidCount,
        claimedBy: (existing.data() || {}).uid
      });
      details.push({
        fingerprint,
        action: 'exists',
        relatedUidCount,
        uid: String((existing.data() || {}).uid || '')
      });
      continue;
    }

    // Migration NEVER grants or changes credits — only records the device claim.
    const payload = {
      uid: claimant.uid,
      claimedUid: claimant.uid,
      claimed: true,
      migrated: true,
      email: String(claimant.email || ''),
      deviceFingerprint: fingerprint,
      grantedAt: claimant.grantedAt || FieldValue.serverTimestamp(),
      amount: 0,
      creditGranted: false,
      // Historical welcome amount is informational only (not a new grant).
      priorWelcomeAmount: claimant.hasWelcomeGrant
        ? Number(claimant.grantAmount || 0) || 0
        : 0,
      source: 'migration_licenses_hwid',
      migratedAt: FieldValue.serverTimestamp(),
      relatedUidCount,
      relatedUids,
      licensePlan: String(claimant.plan || ''),
      // Intentionally no raw hwid / no license field writes.
      creditSystemVersion: 2
    };

    if (!dryRun) {
      await claimRef.set(payload);
    }
    created += 1;
    logger.info('migrateSignupBonusClaims claim create', {
      dryRun,
      fingerprint: fingerprint.slice(0, 12) + '…',
      uid: claimant.uid,
      relatedUidCount,
      creditGranted: false,
      amount: 0
    });
    details.push({
      fingerprint,
      action: dryRun ? 'would_create' : 'created',
      relatedUidCount,
      uid: claimant.uid,
      creditGranted: false,
      amount: 0,
      licensePlan: claimant.plan
    });
  }

  if (!dryRun) {
    await migRef.set({
      completedAt: FieldValue.serverTimestamp(),
      scanned: rows.length,
      fingerprints: byFp.size,
      created,
      alreadyExisted,
      multiUidFingerprints,
      creditsChangedUsers: 0,
      licensesChangedUsers: 0,
      planStats,
      version: 2
    }, { merge: true });
  }

  const summary = {
    skipped: false,
    dryRun: !!dryRun,
    totalLicenses: planStats.totalLicenses,
    withHwid: planStats.withHwid,
    uniqueFingerprints: byFp.size,
    multiUidFingerprints,
    lifetime: planStats.lifetime,
    period: planStats.period,
    trial: planStats.trial,
    otherPlans: planStats.other,
    claimsToCreate: created,
    alreadyExisted,
    // Hard invariant: migration never mutates wallets or licenses.
    creditsChangedUsers: 0,
    licensesChangedUsers: 0,
    scanned: rows.length,
    fingerprints: byFp.size,
    created,
    details
  };
  logger.info('migrateSignupBonusClaims done', {
    dryRun: summary.dryRun,
    totalLicenses: summary.totalLicenses,
    withHwid: summary.withHwid,
    uniqueFingerprints: summary.uniqueFingerprints,
    multiUidFingerprints: summary.multiUidFingerprints,
    lifetime: summary.lifetime,
    period: summary.period,
    trial: summary.trial,
    claimsToCreate: summary.claimsToCreate,
    creditsChangedUsers: 0,
    licensesChangedUsers: 0
  });
  return summary;
}

async function main(argv) {
  const args = argv || process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  configureDeviceFingerprint({ secret: process.env.SIGNUP_BONUS_HMAC_SECRET });
  if (!getFingerprintSecret()) {
    console.error('Set SIGNUP_BONUS_HMAC_SECRET before running migration.');
    process.exit(1);
  }
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const out = await migrateSignupBonusClaims(db, { FieldValue, dryRun, force });
  console.log(JSON.stringify({
    skipped: out.skipped,
    reason: out.reason,
    dryRun: out.dryRun,
    totalLicenses: out.totalLicenses,
    withHwid: out.withHwid,
    uniqueFingerprints: out.uniqueFingerprints,
    multiUidFingerprints: out.multiUidFingerprints,
    lifetime: out.lifetime,
    period: out.period,
    trial: out.trial,
    claimsToCreate: out.claimsToCreate,
    alreadyExisted: out.alreadyExisted,
    creditsChangedUsers: out.creditsChangedUsers,
    licensesChangedUsers: out.licensesChangedUsers
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  CLAIM_COLLECTION,
  GRANT_COLLECTION,
  MIGRATION_DOC,
  RELATED_UIDS_CAP,
  pickClaimant,
  summarizeLicensePlans,
  migrateSignupBonusClaims,
  main
};
