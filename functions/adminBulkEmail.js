'use strict';

const { uniqueUids, validateOperationId, claimBulkOperation, MAX_BULK_RECIPIENTS } = require('./adminCredits');
const { buildAdminBrandedEmail, normalizeBrandInput, validateHttpUrl } = require('./adminEmailTemplate');

const EMAIL_CHUNK = 20;
const SUBJECT_MAX = 200;
const BODY_MAX = 20000;

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(body) {
  return escapeHtml(body).replace(/\r\n|\n|\r/g, '<br>\n');
}

function bodyPreview(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function lookupEmail(db, admin, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return { uid, error: 'UID_INVALID' };
  const email = String((snap.data() || {}).email || '').trim();
  if (email && email.includes('@')) return { uid, email };
  try {
    const rec = await admin.auth().getUser(uid);
    const authEmail = String(rec.email || '').trim();
    if (authEmail && authEmail.includes('@')) return { uid, email: authEmail };
  } catch (_) { /* no auth record */ }
  return { uid, error: 'NO_EMAIL' };
}

function sanitizeSmtpError(err) {
  const blob = `${(err && err.code) || ''} ${(err && err.responseCode) || ''} ${(err && err.message) || ''}`;
  if (/EAUTH|535|534|BadCredentials|Invalid login|Username and Password not accepted/i.test(blob)) {
    return { code: 'SMTP_AUTH_FAILED', message: '메일 발송 설정이 올바르지 않습니다.' };
  }
  if (/ETIMEDOUT|ECONNECTION|ENOTFOUND|ESOCKET|ECONNRESET/i.test(blob)) {
    return { code: 'SMTP_UNAVAILABLE', message: '메일 서버에 연결하지 못했습니다.' };
  }
  return { code: 'SEND_FAILED', message: '메일 발송에 실패했습니다.' };
}

function createHandlers({ db, admin, cors, requireAdmin, sendMail, chunkSize = EMAIL_CHUNK, delayMs = 120 }) {
  const FieldValue = admin.firestore.FieldValue;

  async function sendAdminBulkEmail(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const adminUser = await requireAdmin(req);
      const body = req.body || {};
      const operationId = validateOperationId(body.operationId);
      const brand = normalizeBrandInput({
        subject: body.subject,
        body: body.body,
        preheader: body.preheader,
        bannerEnabled: body.bannerEnabled,
        bannerEyebrow: body.bannerEyebrow,
        bannerTitle: body.bannerTitle,
        bannerDescription: body.bannerDescription,
        ctaLabel: body.ctaLabel,
        ctaUrl: body.ctaUrl,
        bannerImageUrl: body.bannerImageUrl
      });
      const subject = brand.subject.slice(0, SUBJECT_MAX);
      const textBody = brand.body.slice(0, BODY_MAX);
      const uids = uniqueUids(body.recipientUids);
      if (!subject) throw httpError(400, 'SUBJECT_REQUIRED', '제목을 입력하세요.');
      if (!textBody) throw httpError(400, 'BODY_REQUIRED', '본문을 입력하세요.');
      if (brand.ctaLabel && !brand.ctaUrl) {
        throw httpError(400, 'CTA_URL_INVALID', 'CTA URL은 http(s) 주소여야 합니다.');
      }
      if (String(body.ctaUrl || '').trim() && !validateHttpUrl(body.ctaUrl)) {
        throw httpError(400, 'CTA_URL_INVALID', 'CTA URL은 http(s) 주소여야 합니다.');
      }
      if (String(body.bannerImageUrl || '').trim() && !validateHttpUrl(body.bannerImageUrl)) {
        throw httpError(400, 'BANNER_IMAGE_INVALID', '배너 이미지 URL은 http(s) 주소여야 합니다.');
      }
      if (!uids.length) throw httpError(400, 'RECIPIENTS_REQUIRED', '발송 대상이 없습니다.');
      if (uids.length > MAX_BULK_RECIPIENTS) {
        throw httpError(400, 'TOO_MANY_RECIPIENTS', `한 번에 최대 ${MAX_BULK_RECIPIENTS}명까지 발송할 수 있습니다.`);
      }
      if (typeof sendMail !== 'function') {
        throw httpError(503, 'MAIL_NOT_CONFIGURED', '메일 발송 설정이 완료되지 않았습니다.');
      }
      if (typeof sendMail.verify === 'function') {
        try {
          await sendMail.verify();
        } catch (err) {
          const safe = sanitizeSmtpError(err);
          console.warn('sendAdminBulkEmail smtp.verify', safe.code);
          throw httpError(503, safe.code, safe.message);
        }
      }

      const rendered = buildAdminBrandedEmail(brand);
      const opRef = db.collection('adminBulkOperations').doc(operationId);
      const claim = await claimBulkOperation(db, FieldValue, opRef, {
        type: 'EMAIL',
        adminUid: adminUser.uid,
        subject,
        bodyPreview: bodyPreview(textBody),
        requested: uids.length
      });
      if (claim.status === 'ALREADY_COMPLETED') {
        const d = claim.data || {};
        return res.json({
          ok: true,
          code: 'ALREADY_COMPLETED',
          operationId,
          requested: Number(d.requested || uids.length),
          success: Number(d.successCount || 0),
          failed: Number(d.failureCount || 0),
          failures: d.failed || []
        });
      }

      const done = new Set(claim.doneUids || []);
      const failed = Array.isArray(claim.failed) ? claim.failed.slice() : [];

      for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize);
        for (const uid of chunk) {
          if (done.has(uid)) continue;
          const looked = await lookupEmail(db, admin, uid);
          if (looked.error) {
            failed.push({ uid, code: looked.error, message: looked.error === 'NO_EMAIL' ? '이메일 없음' : '잘못된 UID' });
            continue;
          }
          try {
            await sendMail({
              to: looked.email,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html
            });
            done.add(uid);
          } catch (err) {
            const safe = sanitizeSmtpError(err);
            console.warn('sendAdminBulkEmail smtp.send', safe.code);
            failed.push({
              uid,
              email: looked.email,
              code: safe.code,
              message: safe.message
            });
          }
          if (delayMs > 0) await sleep(delayMs);
        }
        await opRef.set({
          doneUids: [...done],
          failed,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      const successCount = done.size;
      const failureCount = failed.length;
      await opRef.set({
        status: 'COMPLETED',
        type: 'EMAIL',
        successCount,
        failureCount,
        requested: uids.length,
        subject,
        bodyPreview: bodyPreview(textBody),
        adminUid: adminUser.uid,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      try {
        await db.collection('adminAuditLogs').add({
          timestamp: FieldValue.serverTimestamp(),
          targetUserId: uids[0] || 'bulk',
          category: 'message',
          action: 'ADMIN_BULK_EMAIL',
          actorId: adminUser.uid,
          actorEmail: adminUser.email || '',
          actorType: 'admin',
          result: failureCount ? 'partial' : 'success',
          summary: `일괄 메일 · ${subject}`.slice(0, 180),
          metadata: {
            operationId,
            recipientCount: uids.length,
            successCount,
            failureCount,
            subject,
            bodyPreview: bodyPreview(textBody),
            branded: true,
            bannerEnabled: !!rendered.meta.bannerEnabled,
            hasCta: !!rendered.meta.hasCta
          }
        });
      } catch (err) {
        console.warn('sendAdminBulkEmail audit', err && err.message);
      }

      return res.json({
        ok: true,
        operationId,
        requested: uids.length,
        success: successCount,
        failed: failureCount,
        failures: failed.slice(0, 50)
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'BULK_EMAIL_FAILED',
        message: err.message || '일괄 메일 발송에 실패했습니다.'
      });
    }
  }

  return { sendAdminBulkEmail };
}

module.exports = {
  createHandlers,
  textToHtml,
  bodyPreview,
  sanitizeSmtpError,
  EMAIL_CHUNK,
  buildAdminBrandedEmail,
  normalizeBrandInput
};
