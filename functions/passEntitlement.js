'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

const PASS_DURATION_DAYS = Object.freeze({
  PASS_7D: 7,
  PASS_30D: 30,
  PASS_90D: 90
});

function isPassProductId(productId) {
  const pid = String(productId || '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, pid)) return true;
  if (/^PASS_[A-Z0-9_]+$/.test(pid)) return true;
  if (/^TEST_[A-Z0-9_]+$/.test(pid)) return true;
  return false;
}

function isCanonicalPassProductId(productId) {
  const pid = String(productId || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, pid);
}

/**
 * Duration SoT: canonical SKUs always use fixed map (ignore forged catalog/client days).
 * Custom CMS passes use Firestore catalogDays only.
 */
function passDurationDays(productId, catalogDays) {
  const pid = String(productId || '').trim().toUpperCase();
  if (isCanonicalPassProductId(pid)) return PASS_DURATION_DAYS[pid];
  const fromCatalog = Number(catalogDays);
  if (Number.isFinite(fromCatalog) && fromCatalog > 0) return Math.floor(fromCatalog);
  return 0;
}

function licenseTsMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') {
    const t = v.toDate().getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const sec = Number(v?.seconds || v?._seconds || 0);
  return sec ? sec * 1000 : 0;
}

function isGrantRevoked(grant) {
  if (!grant) return true;
  const st = String(grant.status || '').toLowerCase();
  if (st === 'revoked' || st === 'cancelled' || st === 'canceled') return true;
  return !!(grant.revokedAt != null && grant.revokedAt !== '');
}

function isPassGrant(grant) {
  if (!grant) return false;
  const kind = String(grant.kind || '').toLowerCase();
  if (kind === 'pass' || kind === 'period' || kind === 'full_pass') return true;
  return isPassProductId(grant.productId);
}

function grantGrantedAtMs(grant) {
  const fromGranted = licenseTsMs(grant && grant.grantedAt);
  if (fromGranted) return fromGranted;
  return licenseTsMs(grant && grant.createdAt);
}

/**
 * Stack duration onto remaining pass: base = max(now, currentExpiresAt).
 * Duration is exact N*24h from base (not calendar month arithmetic).
 */
function computePassExpiresAt(existingLicense, durationDays, now = new Date()) {
  const days = Math.max(0, Math.floor(Number(durationDays) || 0));
  if (!days) throw new Error('Invalid pass durationDays');
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const currentEnd = licenseTsMs(existingLicense && existingLicense.expiresAt);
  const plan = String((existingLicense && existingLicense.plan) || '').toLowerCase();
  const status = String((existingLicense && existingLicense.status) || '').toLowerCase();
  const licensed = !!(existingLicense && existingLicense.licensed);
  const periodActive =
    licensed &&
    ['active', 'ok', 'enabled'].includes(status) &&
    ['period', 'monthly', 'yearly', 'annual', 'subscription', 'pass', 'full_pass'].includes(plan) &&
    currentEnd > nowMs;
  const baseMs = periodActive ? Math.max(nowMs, currentEnd) : nowMs;
  return new Date(baseMs + days * DAY_MS);
}

function buildPassLicensePayload({
  user,
  passProductId,
  durationDays,
  existingLicense,
  method,
  memo,
  extra = {},
  FieldValue,
  Timestamp
}) {
  const pid = String(passProductId || '').trim().toUpperCase();
  const days = passDurationDays(pid, durationDays);
  const now = new Date();
  const expiresAtDate = computePassExpiresAt(existingLicense, days, now);
  const wasActive =
    existingLicense &&
    licenseTsMs(existingLicense.expiresAt) > now.getTime() &&
    String(existingLicense.plan || '').toLowerCase() !== 'lifetime';
  const startsAt =
    wasActive && licenseTsMs(existingLicense.startsAt)
      ? existingLicense.startsAt
      : Timestamp.fromDate(now);
  return {
    email: (user && (user.email || '')) || '',
    displayName: (user && (user.name || user.displayName || '')) || '',
    licensed: true,
    plan: 'period',
    status: 'active',
    method: method || 'kakaopay',
    memo: memo || '',
    passProductId: pid,
    startsAt,
    expiresAt: Timestamp.fromDate(expiresAtDate),
    expireReason: FieldValue.delete(),
    expiredAt: FieldValue.delete(),
    ...extra,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingLicense && existingLicense.createdAt
      ? existingLicense.createdAt
      : FieldValue.serverTimestamp()
  };
}

/**
 * Rebuild the current period entitlement from non-revoked pass grants.
 * Only grants in the active continuous chain affect startsAt/expiresAt.
 */
function recomputePeriodEntitlementFromGrants(grants, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const list = Array.isArray(grants) ? grants : [];

  const passRows = list.filter(isPassGrant);
  const activeRows = passRows.filter((g) => !isGrantRevoked(g));

  const normalized = activeRows
    .map((g) => ({
      grant: g,
      grantedAtMs: grantGrantedAtMs(g),
      durationDays: passDurationDays(g.productId, g.durationDays)
    }))
    .filter((row) => row.durationDays > 0);

  const withTime = normalized.filter((row) => row.grantedAtMs > 0);
  const missingTime = normalized.length - withTime.length;

  if (withTime.length === 0) {
    if (passRows.length > 0 && missingTime > 0) {
      return { needsReview: true, reason: 'legacy_grants_missing_granted_at' };
    }
    return {
      plan: 'trial',
      licensed: true,
      status: 'active',
      startsAt: null,
      expiresAt: null,
      passProductId: null
    };
  }

  withTime.sort((a, b) => a.grantedAtMs - b.grantedAtMs);

  let chainStartMs = null;
  let chainEndMs = null;
  let lastProductId = null;

  for (const row of withTime) {
    const { grantedAtMs, durationDays, grant } = row;
    if (chainEndMs == null || chainEndMs <= grantedAtMs) {
      chainStartMs = grantedAtMs;
      chainEndMs = grantedAtMs + durationDays * DAY_MS;
    } else {
      chainEndMs = chainEndMs + durationDays * DAY_MS;
    }
    lastProductId = String(grant.productId || '').trim().toUpperCase() || lastProductId;
  }

  if (!chainEndMs || chainEndMs <= nowMs) {
    return {
      plan: 'trial',
      licensed: true,
      status: 'active',
      startsAt: null,
      expiresAt: null,
      passProductId: null
    };
  }

  return {
    plan: 'period',
    licensed: true,
    status: 'active',
    startsAt: new Date(chainStartMs),
    expiresAt: new Date(chainEndMs),
    passProductId: lastProductId || null
  };
}

function buildPeriodLicensePatchFromRecompute(result, { FieldValue, Timestamp, extra = {} }) {
  if (!result || result.needsReview) return null;
  if (result.plan === 'trial') return null;

  const patch = {
    licensed: true,
    plan: 'period',
    status: 'active',
    startsAt: Timestamp.fromDate(result.startsAt),
    expiresAt: Timestamp.fromDate(result.expiresAt),
    passProductId: result.passProductId || FieldValue.delete(),
    expireReason: FieldValue.delete(),
    expiredAt: FieldValue.delete(),
    revokedAt: FieldValue.delete(),
    revokeReason: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  };
  return Object.assign(patch, extra);
}

module.exports = {
  DAY_MS,
  PASS_DURATION_DAYS,
  isPassProductId,
  isCanonicalPassProductId,
  passDurationDays,
  licenseTsMs,
  isGrantRevoked,
  isPassGrant,
  grantGrantedAtMs,
  computePassExpiresAt,
  buildPassLicensePayload,
  recomputePeriodEntitlementFromGrants,
  buildPeriodLicensePatchFromRecompute
};
