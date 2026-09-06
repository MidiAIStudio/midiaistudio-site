'use strict';

/**
 * Welcome Benefit (신규 가입 혜택)
 *
 * - Config: admin_config/welcome_benefit (admin HTTPS only)
 * - Once-per-UID grant: welcome_credit_grants/{uid}
 * - Authoritative credit: creditWalletsV2 + creditLedgerV2 (type=welcome_signup)
 * - Trigger: Firebase Auth onCreate only (never login)
 * - Email failure never rolls back credit; CF retry may email-only
 */

const creditWalletV2 = require('./creditWalletV2');
const { buildAdminBrandedEmail, normalizeBrandInput } = require('./adminEmailTemplate');

const CONFIG_COLLECTION = 'admin_config';
const CONFIG_DOC_ID = 'welcome_benefit';
const GRANT_COLLECTION = 'welcome_credit_grants';
const LEDGER_TYPE = 'welcome_signup';
const LEDGER_ORIGIN = 'welcome_signup';
const PRODUCT_NAME = 'MidiAI Studio';
const MAX_CREDIT = 10000;
const SUBJECT_MAX = 200;
const BODY_MAX = 20000;
const LARGE_AMOUNT_UI = 1000;

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

async function loadConfig(db) {
  const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
  return publicConfig(snap.exists ? snap.data() : null);
}

/**
 * Atomic credit grant + grant record. Idempotent per uid.
 * Email is intentionally outside this transaction.
 */
async function grantWelcomeCreditOnce(db, FieldValue, {
  uid,
  email,
  displayName,
  config
}) {
  const grantRef = db.collection(GRANT_COLLECTION).doc(uid);
  const amount = Math.max(0, Number(config.creditAmount || 0) || 0);
  const emailEnabled = !!config.emailEnabled;
  const configVersion = Math.max(1, Number(config.configVersion || 1) || 1);

  return db.runTransaction(async (tx) => {
    const grantSnap = await tx.get(grantRef);
    if (grantSnap.exists) {
      const g = grantSnap.data() || {};
      return {
        granted: false,
        alreadyGranted: true,
        amount: Number(g.amount || 0) || 0,
        emailEnabled: !!g.emailEnabled,
        emailSent: !!g.emailSent,
        emailSubject: String(g.emailSubject || ''),
        emailBody: String(g.emailBody || ''),
        configVersion: Number(g.configVersion || 0) || 0,
        ledgerId: String(g.ledgerId || ledgerIdForUid(uid)),
        balance: null
      };
    }

    let balance = null;
    let ledgerId = '';
    if (amount > 0) {
      const walletRef = db.collection('creditWalletsV2').doc(uid);
      const ledRef = db.collection('creditLedgerV2').doc(ledgerIdForUid(uid));
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
          uid,
          prev,
          delta: amount,
          FieldValue,
          ledger: {
            type: LEDGER_TYPE,
            source: LEDGER_ORIGIN,
            reason: '신규 가입 혜택',
            displayTitle: `신규 가입 혜택 (+${amount})`,
            origin: LEDGER_ORIGIN,
            configVersion
          }
        });
        ledgerId = ledRef.id;
      }
    }

    tx.set(grantRef, {
      uid,
      email: String(email || ''),
      displayName: String(displayName || ''),
      amount,
      grantedAt: FieldValue.serverTimestamp(),
      source: LEDGER_ORIGIN,
      configVersion,
      emailEnabled,
      emailSubject: emailEnabled ? String(config.emailSubject || '').slice(0, SUBJECT_MAX) : '',
      emailBody: emailEnabled ? String(config.emailBody || '').slice(0, BODY_MAX) : '',
      emailSent: false,
      emailSentAt: null,
      emailError: '',
      ledgerId: ledgerId || (amount > 0 ? ledgerIdForUid(uid) : ''),
      creditSystemVersion: creditWalletV2.CREDIT_SYSTEM_VERSION
    });

    return {
      granted: true,
      alreadyGranted: false,
      amount,
      emailEnabled,
      emailSent: false,
      emailSubject: emailEnabled ? String(config.emailSubject || '') : '',
      emailBody: emailEnabled ? String(config.emailBody || '') : '',
      configVersion,
      ledgerId,
      balance
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

/**
 * Auth onCreate / CF retry entry. Never grants twice.
 */
async function processWelcomeForAuthUser(db, admin, user, { sendMail } = {}) {
  const uid = String((user && user.uid) || '').trim();
  if (!uid) return { ok: false, code: 'UID_REQUIRED' };

  const FieldValue = admin.firestore.FieldValue;
  const email = String((user && user.email) || '').trim();
  const displayName = String((user && (user.displayName || user.name)) || '').trim();

  const config = await loadConfig(db);
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: 'disabled', uid };
  }

  // If already granted, skip credit; optionally retry email only.
  const existing = await db.collection(GRANT_COLLECTION).doc(uid).get();
  if (existing.exists) {
    const g = existing.data() || {};
    if (g.emailSent) {
      return { ok: true, alreadyGranted: true, emailSent: true, uid, amount: Number(g.amount || 0) || 0 };
    }
    if (!g.emailEnabled) {
      return { ok: true, alreadyGranted: true, emailSkipped: true, uid, amount: Number(g.amount || 0) || 0 };
    }
    const to = await resolveRecipientEmail(admin, uid, g.email || email);
    if (!to) {
      await markEmailResult(db, FieldValue, uid, { ok: false, error: 'NO_EMAIL' });
      return { ok: true, alreadyGranted: true, emailSent: false, code: 'NO_EMAIL', uid };
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
      await markEmailResult(db, FieldValue, uid, { ok: true });
      return { ok: true, alreadyGranted: true, emailSent: true, emailRetried: true, uid };
    } catch (err) {
      const code = err.code || 'SEND_FAILED';
      await markEmailResult(db, FieldValue, uid, { ok: false, error: code });
      console.warn('welcomeBenefit.emailRetry', { uid, code, message: err.message });
      return { ok: true, alreadyGranted: true, emailSent: false, code, uid };
    }
  }

  // First pass: credit (if any) + grant record.
  const grant = await grantWelcomeCreditOnce(db, FieldValue, {
    uid,
    email,
    displayName,
    config
  });

  if (!grant.emailEnabled) {
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      amount: grant.amount,
      emailSkipped: true,
      uid,
      balance: grant.balance
    };
  }

  const to = await resolveRecipientEmail(admin, uid, email);
  if (!to) {
    await markEmailResult(db, FieldValue, uid, { ok: false, error: 'NO_EMAIL' });
    return {
      ok: true,
      granted: grant.granted,
      amount: grant.amount,
      emailSent: false,
      code: 'NO_EMAIL',
      uid,
      balance: grant.balance
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
    await markEmailResult(db, FieldValue, uid, { ok: true });
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      amount: grant.amount,
      emailSent: true,
      uid,
      balance: grant.balance
    };
  } catch (err) {
    const code = err.code || 'SEND_FAILED';
    await markEmailResult(db, FieldValue, uid, { ok: false, error: code });
    console.warn('welcomeBenefit.email', { uid, code, message: err.message });
    // Credit is kept — email failure must not roll back.
    return {
      ok: true,
      granted: grant.granted,
      alreadyGranted: grant.alreadyGranted,
      amount: grant.amount,
      emailSent: false,
      code,
      uid,
      balance: grant.balance
    };
  }
}

function createHandlers({ db, admin, cors, requireAdmin }) {
  const FieldValue = admin.firestore.FieldValue;

  async function getWelcomeBenefitConfig(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      await requireAdmin(req);
      const config = await loadConfig(db);
      return res.json({
        ok: true,
        config,
        limits: { maxCredit: MAX_CREDIT, largeAmountConfirm: LARGE_AMOUNT_UI }
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
        // First save starts at v1; later saves bump.
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
          summary: `welcome benefit v${normalized.configVersion} enabled=${normalized.enabled} credits=${normalized.creditAmount} email=${normalized.emailEnabled}`,
          after: {
            enabled: normalized.enabled,
            creditAmount: normalized.creditAmount,
            emailEnabled: normalized.emailEnabled,
            configVersion: normalized.configVersion
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

  return {
    getWelcomeBenefitConfig,
    saveWelcomeBenefitConfig,
    previewWelcomeBenefitEmail
  };
}

module.exports = {
  CONFIG_COLLECTION,
  CONFIG_DOC_ID,
  GRANT_COLLECTION,
  LEDGER_TYPE,
  LEDGER_ORIGIN,
  MAX_CREDIT,
  LARGE_AMOUNT_UI,
  PRODUCT_NAME,
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
  createHandlers
};
