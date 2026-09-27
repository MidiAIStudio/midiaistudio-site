'use strict';

/**
 * Welcome Benefit (신규 가입 혜택) — device-once abuse prevention
 *
 * - Config: admin_config/welcome_benefit (admin HTTPS only)
 * - Device claim: signupBonusClaims/{deviceFingerprint} (HWID hash, never raw HWID)
 * - Per-UID record: welcome_credit_grants/{uid} (email retry / idempotency)
 * - Authoritative credit: creditWalletsV2 + creditLedgerV2 (type=welcome_signup)
 * - Grant path: first usable device HWID (license bind / claimSignupBonus) — not Auth login
 * - Auth onCreate alone never grants credits (no HWID yet)
 * - Email failure never rolls back credit; CF retry may email-only
 */

const creditWalletV2 = require('./creditWalletV2');
const {
  normalizeHwid,
  isUsableHwid,
  deviceFingerprintFromHwid
} = require('./deviceFingerprint');
const { buildAdminBrandedEmail, normalizeBrandInput } = require('./adminEmailTemplate');
const { maskIp, pickClientIp } = require('./accessInfo');

const CONFIG_COLLECTION = 'admin_config';
const CONFIG_DOC_ID = 'welcome_benefit';
const GRANT_COLLECTION = 'welcome_credit_grants';
const CLAIM_COLLECTION = 'signupBonusClaims';
const LEDGER_TYPE = 'welcome_signup';
const LEDGER_ORIGIN = 'welcome_signup';
const PRODUCT_NAME = 'MidiAI Studio';
const MAX_CREDIT = 10000;
const SUBJECT_MAX = 200;
const BODY_MAX = 20000;
const LARGE_AMOUNT_UI = 1000;
const ACTION_GRANTED = 'SIGNUP_BONUS_GRANTED';
const ACTION_SKIPPED = 'SIGNUP_BONUS_SKIPPED_DEVICE_ALREADY_CLAIMED';

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function defaultConfig() {
  return {
    enabled: false,
    creditAmount: 0,
    emailEnabled: false,
    emailSubject: '',
    emailBody: '',
    configVersion: 1,
    updatedAt: null,
    updatedBy: '',
    updatedByEmail: ''
  };
}

function parseNonNegInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function normalizeConfigInput(body, { bumpVersion, prevVersion } = {}) {
  const src = body && typeof body === 'object' ? body : {};
  const creditAmount = parseNonNegInt(src.creditAmount);
  if (creditAmount == null) {
    throw httpError(400, 'AMOUNT_INVALID', '크레딧 수량은 0 이상의 정수여야 합니다.');
  }
  if (creditAmount > MAX_CREDIT) {
    throw httpError(400, 'AMOUNT_TOO_LARGE', `최대 ${MAX_CREDIT} Credits까지 설정할 수 있습니다.`);
  }
  const brand = normalizeBrandInput({
    subject: src.emailSubject,
    body: src.emailBody
  });
  const emailEnabled = !!src.emailEnabled;
  if (emailEnabled) {
    if (!brand.subject) throw httpError(400, 'SUBJECT_REQUIRED', '환영 메일 제목을 입력하세요.');
    if (!brand.body) throw httpError(400, 'BODY_REQUIRED', '환영 메일 본문을 입력하세요.');
  }
  const enabled = !!src.enabled;
  const nextVersion = bumpVersion
    ? Math.max(1, Number(prevVersion || 0) + 1)
    : Math.max(1, Number(src.configVersion || prevVersion || 1) || 1);
  return {
    enabled,
    creditAmount,
    emailEnabled,
    emailSubject: brand.subject.slice(0, SUBJECT_MAX),
    emailBody: brand.body.slice(0, BODY_MAX),
    configVersion: nextVersion
  };
}

function publicConfig(raw) {
  const base = defaultConfig();
  const d = raw && typeof raw === 'object' ? raw : {};
  const creditAmount = parseNonNegInt(d.creditAmount);
  return {
    ...base,
    enabled: !!d.enabled,
    creditAmount: creditAmount == null ? 0 : creditAmount,
    emailEnabled: !!d.emailEnabled,
    emailSubject: String(d.emailSubject || '').slice(0, SUBJECT_MAX),
    emailBody: String(d.emailBody || '').slice(0, BODY_MAX),
    configVersion: Math.max(1, Number(d.configVersion || 1) || 1),
    updatedAt: d.updatedAt || null,
    updatedBy: String(d.updatedBy || ''),
    updatedByEmail: String(d.updatedByEmail || '')
  };
}

function displayNameFallback(name, langHint) {
  const n = String(name || '').trim();
  if (n) return n;
  const hint = String(langHint || '').toLowerCase();
  if (hint.startsWith('ja')) return 'ユーザー';
  if (hint.startsWith('en')) return 'Member';
  return '회원';
}

function applyTemplate(text, vars) {
  const map = {
    name: String(vars.name || ''),
    email: String(vars.email || ''),
    credits: String(vars.credits != null ? vars.credits : ''),
    product_name: String(vars.product_name || PRODUCT_NAME)
  };
  return String(text || '').replace(/\{\{\s*(name|email|credits|product_name)\s*\}\}/gi, (_, key) => {
    const k = String(key || '').toLowerCase();
    return map[k] != null ? map[k] : '';
  });
}

function ledgerIdForUid(uid) {
  return `welcome_${String(uid || '').trim()}`;
}

function auditIdFor(action, uid, fingerprint) {
  const fp = String(fingerprint || '').slice(0, 24);
  return `signup_bonus_${action}_${String(uid || '').slice(0, 40)}_${fp}`.slice(0, 140);
}

async function loadConfig(db) {
  const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
  return publicConfig(snap.exists ? snap.data() : null);
}

/**
 * Find sibling UIDs that already received a welcome credit (legacy UID grants
 * before device claims). Uses stored HWID equality — same physical device.
 */
async function findLegacyDeviceClaimant(db, normalizedHwid, excludeUid) {
  if (!normalizedHwid) return null;
  try {
    const licSnap = await db.collection('licenses')
      .where('hwid', '==', normalizedHwid)
      .limit(25)
      .get();
    for (const doc of licSnap.docs || []) {
      const sibUid = String(doc.id || '').trim();
      if (!sibUid || sibUid === excludeUid) continue;
      const g = await db.collection(GRANT_COLLECTION).doc(sibUid).get();
      if (!g.exists) continue;
      const amount = Number((g.data() || {}).amount || 0) || 0;
      if (amount > 0 || (g.data() || {}).creditGranted === true) {
        return {
          uid: sibUid,
          amount,
          grantedAt: (g.data() || {}).grantedAt || null,
          legacy: true
        };
      }
    }
  } catch (err) {
    console.warn('welcomeBenefit.legacyClaimScan', err && err.message);
  }
  return null;
}

async function writeSignupBonusAudit(db, FieldValue, {
  action,
  uid,
  fingerprint,
  amount,
  claimedByUid,
  ipMasked,
  summary
}) {
  const auditRef = db.collection('adminAuditLogs').doc(auditIdFor(action, uid, fingerprint));
  try {
    const existing = await auditRef.get();
    if (existing.exists) return false;
    await auditRef.set({
      timestamp: FieldValue.serverTimestamp(),
      targetUserId: uid,
      category: 'credit',
      action,
      actorId: 'system',
      actorEmail: '',
      actorType: 'system',
      result: action === ACTION_GRANTED ? 'success' : 'skipped',
      summary: summary || action,
      after: {
        amount: Number(amount || 0) || 0,
        deviceFingerprint: String(fingerprint || ''),
        claimedByUid: String(claimedByUid || uid || ''),
        ipMasked: String(ipMasked || ''),
        source: LEDGER_ORIGIN
      }
    });
    return true;
  } catch (err) {
    console.warn('welcomeBenefit.audit', action, err && err.message);
    return false;
  }
}

/**
 * Atomic device claim + optional credit grant + per-UID grant record.
 * Server is source of truth — client cannot force a grant.
 */
async function grantWelcomeCreditOnce(db, FieldValue, {
  uid,
  email,
  displayName,
  config,
  deviceFingerprint,
  normalizedHwid,
  ipMasked,
  legacyClaimant
}) {
  const uidKey = String(uid || '').trim();
  const fingerprint = String(deviceFingerprint || '').trim();
  if (!uidKey) throw httpError(400, 'UID_REQUIRED', 'uid required');
  if (!fingerprint) throw httpError(400, 'DEVICE_REQUIRED', 'device fingerprint required');

  const grantRef = db.collection(GRANT_COLLECTION).doc(uidKey);
  const claimRef = db.collection(CLAIM_COLLECTION).doc(fingerprint);
  const userRef = db.collection('users').doc(uidKey);
  const amount = Math.max(0, Number(config.creditAmount || 0) || 0);
  const emailEnabled = !!config.emailEnabled;
  const configVersion = Math.max(1, Number(config.configVersion || 1) || 1);
  const legacyUid = legacyClaimant && legacyClaimant.uid ? String(legacyClaimant.uid) : '';

  return db.runTransaction(async (tx) => {
    const [grantSnap, claimSnap] = await Promise.all([
      tx.get(grantRef),
      tx.get(claimRef)
    ]);

    if (grantSnap.exists) {
      const g = grantSnap.data() || {};
      return {
        granted: false,
        alreadyGranted: true,
        skippedDeviceClaimed: false,
        amount: Number(g.amount || 0) || 0,
        emailEnabled: !!g.emailEnabled,
        emailSent: !!g.emailSent,
        emailSubject: String(g.emailSubject || ''),
        emailBody: String(g.emailBody || ''),
        configVersion: Number(g.configVersion || 0) || 0,
        ledgerId: String(g.ledgerId || ledgerIdForUid(uidKey)),
        balance: null,
        deviceFingerprint: fingerprint,
        claimedByUid: String(g.deviceClaimUid || g.uid || uidKey)
      };
    }

    const existingClaim = claimSnap.exists ? (claimSnap.data() || {}) : null;
    const claimedByOther = !!(
      (existingClaim && existingClaim.uid && String(existingClaim.uid) !== uidKey)
      || (legacyUid && legacyUid !== uidKey)
    );

    if (claimedByOther) {
      const claimedByUid = String(
        (existingClaim && existingClaim.uid) || legacyUid || ''
      );
      // Ensure claim doc exists (adopt legacy) without granting credits.
      if (!claimSnap.exists && legacyUid) {
        tx.set(claimRef, {
          uid: legacyUid,
          deviceFingerprint: fingerprint,
          grantedAt: FieldValue.serverTimestamp(),
          amount: Number((legacyClaimant && legacyClaimant.amount) || 0) || 0,
          source: LEDGER_ORIGIN,
          adoptedFromLegacy: true,
          creditSystemVersion: creditWalletV2.CREDIT_SYSTEM_VERSION
        });
      }
      tx.set(grantRef, {
        uid: uidKey,
        email: String(email || ''),
        displayName: String(displayName || ''),
        amount: 0,
        creditGranted: false,
        skippedDeviceClaimed: true,
        deviceFingerprint: fingerprint,
        deviceClaimUid: claimedByUid,
        grantedAt: FieldValue.serverTimestamp(),
        source: LEDGER_ORIGIN,
        configVersion,
        emailEnabled,
        emailSubject: emailEnabled ? String(config.emailSubject || '').slice(0, SUBJECT_MAX) : '',
        emailBody: emailEnabled ? String(config.emailBody || '').slice(0, BODY_MAX) : '',
        emailSent: false,
        emailSentAt: null,
        emailError: '',
        ledgerId: '',
        creditSystemVersion: creditWalletV2.CREDIT_SYSTEM_VERSION,
        ipMasked: String(ipMasked || '')
      });
      tx.set(userRef, {
        uid: uidKey,
        deviceFingerprint: fingerprint,
        signupBonusStatus: 'skipped_device_claimed',
        signupBonusGranted: false,
        signupBonusClaimedBy: claimedByUid,
        signupBonusCheckedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        granted: false,
        alreadyGranted: false,
        skippedDeviceClaimed: true,
        amount: 0,
        emailEnabled,
        emailSent: false,
        emailSubject: emailEnabled ? String(config.emailSubject || '') : '',
        emailBody: emailEnabled ? String(config.emailBody || '') : '',
        configVersion,
        ledgerId: '',
        balance: null,
        deviceFingerprint: fingerprint,
        claimedByUid
      };
    }

    // First claim for this device (or claim already owned by this uid).
    let balance = null;
    let ledgerId = '';
    const creditGranted = amount > 0;
    if (creditGranted) {
      const walletRef = db.collection('creditWalletsV2').doc(uidKey);
      const ledRef = db.collection('creditLedgerV2').doc(ledgerIdForUid(uidKey));
      const ledSnap = await tx.get(ledRef);
      const walletSnap = await tx.get(walletRef);
      const prev = creditWalletV2.readBalanceV2(walletSnap.exists ? walletSnap.data() : {});
      if (ledSnap.exists) {
        balance = prev;
        ledgerId = ledRef.id;
      } else {
        balance = creditWalletV2.writeWalletLedgerV2(tx, {
          walletRef,
          ledgerRef: ledRef,
          uid: uidKey,
          prev,
          delta: amount,
          FieldValue,
          ledger: {
            type: LEDGER_TYPE,
            source: LEDGER_ORIGIN,
            reason: '신규 가입 혜택',
            displayTitle: `신규 가입 혜택 (+${amount})`,
            origin: LEDGER_ORIGIN,
            configVersion,
            deviceFingerprint: fingerprint
          }
        });
        ledgerId = ledRef.id;
      }
    }

    if (!claimSnap.exists) {
      tx.set(claimRef, {
        uid: uidKey,
        email: String(email || ''),
        deviceFingerprint: fingerprint,
        grantedAt: FieldValue.serverTimestamp(),
        amount: creditGranted ? amount : 0,
        creditGranted,
        source: LEDGER_ORIGIN,
        configVersion,
        creditSystemVersion: creditWalletV2.CREDIT_SYSTEM_VERSION,
        ipMasked: String(ipMasked || '')
        // Intentionally no raw hwid field.
      });
    }

    tx.set(grantRef, {
      uid: uidKey,
      email: String(email || ''),
      displayName: String(displayName || ''),
      amount: creditGranted ? amount : 0,
      creditGranted,
      skippedDeviceClaimed: false,
      deviceFingerprint: fingerprint,
      deviceClaimUid: uidKey,
      grantedAt: FieldValue.serverTimestamp(),
      source: LEDGER_ORIGIN,
      configVersion,
      emailEnabled,
      emailSubject: emailEnabled ? String(config.emailSubject || '').slice(0, SUBJECT_MAX) : '',
      emailBody: emailEnabled ? String(config.emailBody || '').slice(0, BODY_MAX) : '',
      emailSent: false,
      emailSentAt: null,
      emailError: '',
      ledgerId: ledgerId || (creditGranted ? ledgerIdForUid(uidKey) : ''),
      creditSystemVersion: creditWalletV2.CREDIT_SYSTEM_VERSION,
      ipMasked: String(ipMasked || '')
    });

    tx.set(userRef, {
      uid: uidKey,
      deviceFingerprint: fingerprint,
      signupBonusStatus: creditGranted ? 'granted' : 'granted_zero',
      signupBonusGranted: creditGranted,
      signupBonusClaimedBy: uidKey,
      signupBonusCheckedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      granted: true,
      alreadyGranted: false,
      skippedDeviceClaimed: false,
      amount: creditGranted ? amount : 0,
      emailEnabled,
      emailSent: false,
      emailSubject: emailEnabled ? String(config.emailSubject || '') : '',
      emailBody: emailEnabled ? String(config.emailBody || '') : '',
      configVersion,
      ledgerId,
      balance,
      deviceFingerprint: fingerprint,
      claimedByUid: uidKey
    };
  });
}

async function markEmailResult(db, FieldValue, uid, { ok, error }) {
  const grantRef = db.collection(GRANT_COLLECTION).doc(uid);
  if (ok) {
    await grantRef.set({
      emailSent: true,
      emailSentAt: FieldValue.serverTimestamp(),
      emailError: ''
    }, { merge: true });
    return;
  }
  await grantRef.set({
    emailSent: false,
    emailError: String(error || 'SEND_FAILED').slice(0, 300)
  }, { merge: true });
}

async function sendWelcomeEmail({
  sendMail,
  to,
  subjectTemplate,
  bodyTemplate,
  name,
  email,
  credits
}) {
  if (typeof sendMail !== 'function') {
    throw httpError(503, 'MAIL_NOT_CONFIGURED', '메일 발송 설정이 완료되지 않았습니다.');
  }
  const vars = {
    name: displayNameFallback(name),
    email: String(email || to || ''),
    credits: Number(credits || 0) || 0,
    product_name: PRODUCT_NAME
  };
  const subject = applyTemplate(subjectTemplate, vars).slice(0, SUBJECT_MAX);
  const body = applyTemplate(bodyTemplate, vars).slice(0, BODY_MAX);
  if (!subject || !body) {
    throw httpError(400, 'EMAIL_TEMPLATE_EMPTY', '메일 제목/본문이 비어 있습니다.');
  }
  const rendered = buildAdminBrandedEmail({ subject, body });
  await sendMail({
    to,
    subject: rendered.subject || subject,
    text: rendered.text || body,
    html: rendered.html
  });
  return { subject, body };
}

async function resolveRecipientEmail(admin, uid, fallbackEmail) {
  const direct = String(fallbackEmail || '').trim();
  if (direct.includes('@')) return direct;
  try {
    const rec = await admin.auth().getUser(uid);
    const authEmail = String(rec.email || '').trim();
    if (authEmail.includes('@')) return authEmail;
  } catch (_) { /* ignore */ }
  return '';
}

async function resolveUserProfile(db, admin, uid, fallback = {}) {
  let email = String((fallback && fallback.email) || '').trim();
  let displayName = String((fallback && (fallback.displayName || fallback.name)) || '').trim();
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.exists) {
      const d = userSnap.data() || {};
      if (!email) email = String(d.email || '').trim();
      if (!displayName) displayName = String(d.displayName || d.name || '').trim();
    }
  } catch (_) { /* optional */ }
  if (!email || !displayName) {
    try {
      const rec = await admin.auth().getUser(uid);
      if (!email) email = String(rec.email || '').trim();
      if (!displayName) displayName = String(rec.displayName || '').trim();
    } catch (_) { /* optional */ }
  }
  return { email, displayName };
}

/**
 * Auth onCreate entry — never grants credits (device HWID unknown).
 * Kept so CF retries / email-only paths remain stable; device path owns grants.
 */
async function processWelcomeForAuthUser(db, admin, user, { sendMail } = {}) {
  const uid = String((user && user.uid) || '').trim();
  if (!uid) return { ok: false, code: 'UID_REQUIRED' };

  // Prefer device path if HWID already bound (rare race with bindDeviceHwid).
  try {
    const licSnap = await db.collection('licenses').doc(uid).get();
    const hwid = licSnap.exists ? String((licSnap.data() || {}).hwid || '') : '';
    if (isUsableHwid(hwid)) {
      return processWelcomeForDevice(db, admin, {
        uid,
        hwid,
        email: user && user.email,
        displayName: user && (user.displayName || user.name),
        sendMail
      });
    }
  } catch (_) { /* fall through */ }

  return {
    ok: true,
    skipped: true,
    reason: 'waiting_for_device',
    uid
  };
}

/**
 * Authoritative grant path — requires usable HWID from app identity logic.
 */
async function processWelcomeForDevice(db, admin, {
  uid,
  hwid,
  email: emailIn,
  displayName: nameIn,
  sendMail,
  ipMasked,
  req
} = {}) {
  const uidKey = String(uid || '').trim();
  if (!uidKey) return { ok: false, code: 'UID_REQUIRED' };

  const FieldValue = admin.firestore.FieldValue;
  const normalized = normalizeHwid(hwid);
  const fingerprint = deviceFingerprintFromHwid(normalized);
  if (!fingerprint) {
    return { ok: true, skipped: true, reason: 'invalid_hwid', uid: uidKey };
  }

  const config = await loadConfig(db);
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: 'disabled', uid: uidKey, deviceFingerprint: fingerprint };
  }

  const profile = await resolveUserProfile(db, admin, uidKey, {
    email: emailIn,
    displayName: nameIn
  });
  const email = profile.email;
  const displayName = profile.displayName;
  const masked = String(ipMasked || (req ? maskIp(pickClientIp(req.headers || {}, req.ip || '')) : '') || '');

  // If already granted for this uid, skip credit; optionally retry email only.
  const existing = await db.collection(GRANT_COLLECTION).doc(uidKey).get();
  if (existing.exists) {
    const g = existing.data() || {};
    if (g.emailSent) {
      return {
        ok: true,
        alreadyGranted: true,
        emailSent: true,
        uid: uidKey,
        amount: Number(g.amount || 0) || 0,
        skippedDeviceClaimed: !!g.skippedDeviceClaimed,
        deviceFingerprint: fingerprint
      };
    }
    if (!g.emailEnabled) {
      return {
        ok: true,
        alreadyGranted: true,
        emailSkipped: true,
        uid: uidKey,
        amount: Number(g.amount || 0) || 0,
        skippedDeviceClaimed: !!g.skippedDeviceClaimed,
        deviceFingerprint: fingerprint
      };
    }
    const to = await resolveRecipientEmail(admin, uidKey, g.email || email);
    if (!to) {
      await markEmailResult(db, FieldValue, uidKey, { ok: false, error: 'NO_EMAIL' });
      return {
        ok: true,
        alreadyGranted: true,
        emailSent: false,
        code: 'NO_EMAIL',
        uid: uidKey,
        amount: Number(g.amount || 0) || 0,
        deviceFingerprint: fingerprint
      };
    }
    try {
      await sendWelcomeEmail({
        sendMail,
        to,
        subjectTemplate: g.emailSubject || config.emailSubject,
        bodyTemplate: g.emailBody || config.emailBody,
        name: g.displayName || displayName,
        email: to,
        credits: Number(g.amount || 0) || 0
      });
      await markEmailResult(db, FieldValue, uidKey, { ok: true });
      return {
        ok: true,
        alreadyGranted: true,
        emailSent: true,
        emailRetried: true,
        uid: uidKey,
        amount: Number(g.amount || 0) || 0,
        deviceFingerprint: fingerprint
      };
    } catch (err) {
      const code = err.code || 'SEND_FAILED';
      await markEmailResult(db, FieldValue, uidKey, { ok: false, error: code });
      console.warn('welcomeBenefit.emailRetry', { uid: uidKey, code, message: err.message });
      return {
        ok: true,
        alreadyGranted: true,
        emailSent: false,
        code,
        uid: uidKey,
        amount: Number(g.amount || 0) || 0,
        deviceFingerprint: fingerprint
      };
    }
  }

  const legacyClaimant = await findLegacyDeviceClaimant(db, normalized, uidKey);

  const grant = await grantWelcomeCreditOnce(db, FieldValue, {
    uid: uidKey,
    email,
    displayName,
    config,
    deviceFingerprint: fingerprint,
    normalizedHwid: normalized,
    ipMasked: masked,
    legacyClaimant
  });

  if (grant.granted) {
    await writeSignupBonusAudit(db, FieldValue, {
      action: ACTION_GRANTED,
      uid: uidKey,
      fingerprint,
      amount: grant.amount,
      claimedByUid: uidKey,
      ipMasked: masked,
      summary: `신규 가입 혜택 +${grant.amount} Credits (device)`
    });
  } else if (grant.skippedDeviceClaimed) {
    await writeSignupBonusAudit(db, FieldValue, {
      action: ACTION_SKIPPED,
      uid: uidKey,
      fingerprint,
      amount: 0,
      claimedByUid: grant.claimedByUid,
      ipMasked: masked,
      summary: `동일 기기 보너스 이미 지급됨 (claimedBy=${grant.claimedByUid || '-'})`
    });
  }

  if (!grant.emailEnabled) {
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      skippedDeviceClaimed: !!grant.skippedDeviceClaimed,
      amount: grant.amount,
      emailSkipped: true,
      uid: uidKey,
      balance: grant.balance,
      deviceFingerprint: fingerprint,
      claimedByUid: grant.claimedByUid
    };
  }

  // Skipped device claim: still allow welcome email with 0 credits if configured.
  const to = await resolveRecipientEmail(admin, uidKey, email);
  if (!to) {
    await markEmailResult(db, FieldValue, uidKey, { ok: false, error: 'NO_EMAIL' });
    return {
      ok: true,
      granted: grant.granted,
      skippedDeviceClaimed: !!grant.skippedDeviceClaimed,
      amount: grant.amount,
      emailSent: false,
      code: 'NO_EMAIL',
      uid: uidKey,
      balance: grant.balance,
      deviceFingerprint: fingerprint
    };
  }

  try {
    await sendWelcomeEmail({
      sendMail,
      to,
      subjectTemplate: grant.emailSubject || config.emailSubject,
      bodyTemplate: grant.emailBody || config.emailBody,
      name: displayName,
      email: to,
      credits: grant.amount
    });
    await markEmailResult(db, FieldValue, uidKey, { ok: true });
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      skippedDeviceClaimed: !!grant.skippedDeviceClaimed,
      amount: grant.amount,
      emailSent: true,
      uid: uidKey,
      balance: grant.balance,
      deviceFingerprint: fingerprint,
      claimedByUid: grant.claimedByUid
    };
  } catch (err) {
    const code = err.code || 'SEND_FAILED';
    await markEmailResult(db, FieldValue, uidKey, { ok: false, error: code });
    console.warn('welcomeBenefit.email', { uid: uidKey, code, message: err.message });
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      skippedDeviceClaimed: !!grant.skippedDeviceClaimed,
      amount: grant.amount,
      emailSent: false,
      code,
      uid: uidKey,
      balance: grant.balance,
      deviceFingerprint: fingerprint,
      claimedByUid: grant.claimedByUid
    };
  }
}

/**
 * Firestore licenses/{uid} HWID first-bind → attempt device-once welcome grant.
 */
async function processWelcomeOnLicenseHwidWrite(db, admin, {
  uid,
  beforeData,
  afterData,
  sendMail
} = {}) {
  const uidKey = String(uid || '').trim();
  if (!uidKey || !afterData) return { ok: true, skipped: true, reason: 'missing' };
  const beforeHwid = normalizeHwid(beforeData && beforeData.hwid);
  const afterHwid = normalizeHwid(afterData.hwid);
  if (!isUsableHwid(afterHwid)) return { ok: true, skipped: true, reason: 'no_hwid' };
  // Only act when HWID newly appears or changes from empty.
  if (beforeHwid && beforeHwid === afterHwid) {
    return { ok: true, skipped: true, reason: 'unchanged' };
  }
  if (beforeHwid && beforeHwid !== afterHwid) {
    // HWID change after reset — still try (uid grant doc blocks re-credit).
  }
  return processWelcomeForDevice(db, admin, {
    uid: uidKey,
    hwid: afterHwid,
    sendMail
  });
}

function createHandlers({ db, admin, cors, requireAdmin, requireUser, sendMail }) {
  const FieldValue = admin.firestore.FieldValue;
  const mailFn = typeof sendMail === 'function' ? sendMail : null;

  async function getWelcomeBenefitConfig(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      await requireAdmin(req);
      const config = await loadConfig(db);
      return res.json({
        ok: true,
        config,
        limits: { maxCredit: MAX_CREDIT, largeAmountConfirm: LARGE_AMOUNT_UI },
        policy: {
          oncePer: 'device',
          claimCollection: CLAIM_COLLECTION,
          storesRawHwid: false
        }
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'CONFIG_READ_FAILED',
        message: err.message || '설정을 불러오지 못했습니다.'
      });
    }
  }

  async function saveWelcomeBenefitConfig(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const adminUser = await requireAdmin(req);
      const prevSnap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
      const prev = publicConfig(prevSnap.exists ? prevSnap.data() : null);
      const normalized = normalizeConfigInput(req.body || {}, {
        bumpVersion: true,
        prevVersion: prevSnap.exists ? prev.configVersion : 0
      });
      const payload = {
        ...normalized,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
        updatedByEmail: String(adminUser.email || '')
      };
      await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).set(payload, { merge: true });
      try {
        await db.collection('adminAuditLogs').add({
          timestamp: FieldValue.serverTimestamp(),
          targetUserId: '',
          category: 'ops',
          action: 'WELCOME_BENEFIT_CONFIG',
          actorId: adminUser.uid,
          actorEmail: String(adminUser.email || ''),
          actorType: 'admin',
          result: 'success',
          summary: `welcome benefit v${normalized.configVersion} enabled=${normalized.enabled} credits=${normalized.creditAmount} email=${normalized.emailEnabled} oncePer=device`,
          after: {
            enabled: normalized.enabled,
            creditAmount: normalized.creditAmount,
            emailEnabled: normalized.emailEnabled,
            configVersion: normalized.configVersion,
            oncePer: 'device'
          }
        });
      } catch (auditErr) {
        console.warn('welcomeBenefit.audit', auditErr && auditErr.message);
      }
      return res.json({ ok: true, config: publicConfig({ ...payload, updatedAt: new Date().toISOString() }) });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'CONFIG_SAVE_FAILED',
        message: err.message || '설정을 저장하지 못했습니다.'
      });
    }
  }

  async function previewWelcomeBenefitEmail(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      await requireAdmin(req);
      const body = req.body || {};
      const name = displayNameFallback(body.name);
      const email = String(body.email || 'user@example.com');
      const credits = parseNonNegInt(body.credits != null ? body.credits : body.creditAmount);
      const vars = {
        name,
        email,
        credits: credits == null ? 0 : credits,
        product_name: PRODUCT_NAME
      };
      const subject = applyTemplate(body.emailSubject || body.subject || '', vars);
      const textBody = applyTemplate(body.emailBody || body.body || '', vars);
      const rendered = buildAdminBrandedEmail({ subject, body: textBody });
      return res.json({
        ok: true,
        subject: rendered.subject || subject,
        text: rendered.text || textBody,
        html: rendered.html || '',
        vars
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'PREVIEW_FAILED',
        message: err.message || '미리보기에 실패했습니다.'
      });
    }
  }

  /**
   * Authenticated app/client may submit HWID; server decides grant vs skip.
   * Does not trust client "shouldGrant" flags.
   */
  async function claimSignupBonus(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      if (typeof requireUser !== 'function') {
        throw httpError(500, 'AUTH_NOT_CONFIGURED', 'requireUser missing');
      }
      const user = await requireUser(req);
      const body = req.body || {};
      const hwid = String(body.hwid || body.deviceId || body.deviceHwid || '').trim();
      if (!isUsableHwid(hwid)) {
        return res.status(400).json({
          ok: false,
          code: 'HWID_REQUIRED',
          message: '유효한 기기 HWID가 필요합니다.'
        });
      }
      const out = await processWelcomeForDevice(db, admin, {
        uid: user.uid,
        hwid,
        sendMail: mailFn || undefined,
        req
      });
      return res.json({
        ok: true,
        granted: !!out.granted,
        alreadyGranted: !!out.alreadyGranted,
        skippedDeviceClaimed: !!out.skippedDeviceClaimed,
        skipped: !!out.skipped,
        reason: out.reason || '',
        amount: Number(out.amount || 0) || 0,
        deviceFingerprint: out.deviceFingerprint || deviceFingerprintFromHwid(hwid),
        claimedByUid: out.claimedByUid || '',
        balance: out.balance
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'CLAIM_FAILED',
        message: err.message || '가입 보너스 처리에 실패했습니다.'
      });
    }
  }

  return {
    getWelcomeBenefitConfig,
    saveWelcomeBenefitConfig,
    previewWelcomeBenefitEmail,
    claimSignupBonus
  };
}

module.exports = {
  CONFIG_COLLECTION,
  CONFIG_DOC_ID,
  GRANT_COLLECTION,
  CLAIM_COLLECTION,
  LEDGER_TYPE,
  LEDGER_ORIGIN,
  MAX_CREDIT,
  LARGE_AMOUNT_UI,
  PRODUCT_NAME,
  ACTION_GRANTED,
  ACTION_SKIPPED,
  defaultConfig,
  publicConfig,
  normalizeConfigInput,
  applyTemplate,
  displayNameFallback,
  ledgerIdForUid,
  loadConfig,
  grantWelcomeCreditOnce,
  markEmailResult,
  sendWelcomeEmail,
  processWelcomeForAuthUser,
  processWelcomeForDevice,
  processWelcomeOnLicenseHwidWrite,
  findLegacyDeviceClaimant,
  createHandlers
};
