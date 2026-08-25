'use strict';

const { uniqueUids, validateOperationId, claimBulkOperation, MAX_BULK_RECIPIENTS } = require('./adminCredits');
const { buildAdminBrandedEmail, normalizeBrandInput, validateHttpUrl } = require('./adminEmailTemplate');

const EMAIL_CHUNK = 20;
const SUBJECT_MAX = 200;
const BODY_MAX = 20000;
const HISTORY_COLLECTION = 'adminScheduledEmails';
const HISTORY_TIMEZONE = 'Asia/Seoul';

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

function emailHistoryStatus(successCount, failureCount) {
  if (failureCount && successCount) return 'partial';
  if (failureCount && !successCount) return 'failed';
  return 'completed';
}

function sanitizeFailedSummary(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 50)
    .map((row) => ({
      uid: String((row && row.uid) || ''),
      code: String((row && row.code) || ''),
      message: String((row && row.message) || '').slice(0, 160)
    }))
    .filter((row) => row.uid);
}

function isScheduledPipeline(auditMetadata) {
  return !!(auditMetadata && (auditMetadata.scheduledJobId || auditMetadata.scheduled));
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

function parseBulkEmailInput(body) {
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
  return { operationId, brand, subject, textBody, uids };
}

function createHandlers({ db, admin, cors, requireAdmin, sendMail, chunkSize = EMAIL_CHUNK, delayMs = 120 }) {
  const FieldValue = admin.firestore.FieldValue;

  async function ensureMailReady() {
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
  }

  async function persistImmediateEmailHistory({
    operationId,
    adminUser,
    brand,
    uids,
    status,
    successCount,
    failureCount,
    failedSummary,
    error
  }) {
    const histRef = db.collection(HISTORY_COLLECTION).doc(operationId);
    const existing = await histRef.get();
    const payload = {
      jobId: operationId,
      operationId,
      sendType: 'immediate',
      status,
      timezone: HISTORY_TIMEZONE,
      subject: String(brand.subject || '').slice(0, SUBJECT_MAX),
      body: String(brand.body || '').slice(0, BODY_MAX),
      bodyPreview: bodyPreview(brand.body),
      preheader: brand.preheader || '',
      bannerEnabled: !!brand.bannerEnabled,
      bannerEyebrow: brand.bannerEyebrow || '',
      bannerTitle: brand.bannerTitle || '',
      bannerDescription: brand.bannerDescription || '',
      ctaLabel: brand.ctaLabel || '',
      ctaUrl: brand.ctaUrl || '',
      bannerImageUrl: brand.bannerImageUrl || '',
      recipientUids: uids,
      recipientCount: uids.length,
      successCount: Number(successCount || 0),
      failureCount: Number(failureCount || 0),
      failedSummary: sanitizeFailedSummary(failedSummary),
      createdBy: adminUser.uid,
      createdByEmail: adminUser.email || '',
      updatedAt: FieldValue.serverTimestamp(),
      error: String(error || '').slice(0, 300)
    };
    if (!existing.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
      payload.startedAt = FieldValue.serverTimestamp();
    }
    if (status === 'processing' && !existing.exists) {
      payload.startedAt = FieldValue.serverTimestamp();
    }
    if (status === 'completed' || status === 'partial' || status === 'failed') {
      payload.completedAt = FieldValue.serverTimestamp();
    }
    await histRef.set(payload, { merge: true });
  }

  async function executeAdminBulkEmail({
    adminUser,
    brand,
    uids,
    operationId,
    auditMetadata
  }) {
    const subject = String(brand.subject || '').slice(0, SUBJECT_MAX);
    const textBody = String(brand.body || '').slice(0, BODY_MAX);
    const rendered = buildAdminBrandedEmail(brand);
    const scheduledSend = isScheduledPipeline(auditMetadata);
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
      const success = Number(d.successCount || 0);
      const failedN = Number(d.failureCount || 0);
      if (!scheduledSend) {
        try {
          await persistImmediateEmailHistory({
            operationId,
            adminUser,
            brand,
            uids,
            status: emailHistoryStatus(success, failedN),
            successCount: success,
            failureCount: failedN,
            failedSummary: d.failed,
            error: failedN && !success ? '메일 발송에 실패했습니다.' : (failedN ? '일부 수신자에게 발송하지 못했습니다.' : '')
          });
        } catch (err) {
          console.warn('sendAdminBulkEmail history already-completed', err && err.message);
        }
      }
      return {
        ok: true,
        code: 'ALREADY_COMPLETED',
        operationId,
        requested: Number(d.requested || uids.length),
        success,
        failed: failedN,
        failures: Array.isArray(d.failed) ? d.failed : []
      };
    }

    if (!scheduledSend) {
      try {
        await persistImmediateEmailHistory({
          operationId,
          adminUser,
          brand,
          uids,
          status: 'processing',
          successCount: 0,
          failureCount: 0,
          failedSummary: [],
          error: ''
        });
      } catch (err) {
        console.warn('sendAdminBulkEmail history start', err && err.message);
      }
    }

    const done = new Set(claim.doneUids || []);
    const sending = new Set(claim.sendingUids || []);
    const failed = Array.isArray(claim.failed) ? claim.failed.slice() : [];

    for (let i = 0; i < uids.length; i += chunkSize) {
      const chunk = uids.slice(i, i + chunkSize);
      for (const uid of chunk) {
        if (done.has(uid)) continue;
        if (sending.has(uid)) {
          done.add(uid);
          sending.delete(uid);
          await opRef.set({
            doneUids: [...done],
            sendingUids: [...sending],
            failed,
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          continue;
        }
        const looked = await lookupEmail(db, admin, uid);
        if (looked.error) {
          if (!failed.some((row) => row && row.uid === uid)) {
            failed.push({ uid, code: looked.error, message: looked.error === 'NO_EMAIL' ? '이메일 없음' : '잘못된 UID' });
          }
        } else {
          sending.add(uid);
          await opRef.set({
            sendingUids: [...sending],
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          try {
            await sendMail({
              to: looked.email,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html
            });
            done.add(uid);
            sending.delete(uid);
          } catch (err) {
            sending.delete(uid);
            const safe = sanitizeSmtpError(err);
            console.warn('sendAdminBulkEmail smtp.send', safe.code);
            if (!failed.some((row) => row && row.uid === uid)) {
              failed.push({
                uid,
                email: looked.email,
                code: safe.code,
                message: safe.message
              });
            }
          }
        }
        await opRef.set({
          doneUids: [...done],
          sendingUids: [...sending],
          failed,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        if (delayMs > 0) await sleep(delayMs);
      }
    }

    const successCount = done.size;
    const failureFinal = failed.filter((row) => row && !done.has(row.uid));
    const failureCount = failureFinal.length;
    await opRef.set({
      status: 'COMPLETED',
      type: 'EMAIL',
      successCount,
      failureCount,
      failed: failureFinal,
      requested: uids.length,
      subject,
      bodyPreview: bodyPreview(textBody),
      adminUid: adminUser.uid,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (!scheduledSend) {
      try {
        await persistImmediateEmailHistory({
          operationId,
          adminUser,
          brand,
          uids,
          status: emailHistoryStatus(successCount, failureCount),
          successCount,
          failureCount,
          failedSummary: failureFinal,
          error: failureCount && !successCount
            ? '메일 발송에 실패했습니다.'
            : (failureCount ? '일부 수신자에게 발송하지 못했습니다.' : '')
        });
      } catch (err) {
        console.warn('sendAdminBulkEmail history complete', err && err.message);
      }
    }

    try {
      await db.collection('adminAuditLogs').add({
        timestamp: FieldValue.serverTimestamp(),
        targetUserId: uids[0] || 'bulk',
        category: 'message',
        action: 'ADMIN_BULK_EMAIL',
        actorId: adminUser.uid,
        actorEmail: adminUser.email || '',
        actorType: 'admin',
        result: failureCount ? (successCount ? 'partial' : 'fail') : 'success',
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
          hasCta: !!rendered.meta.hasCta,
          ...(auditMetadata || {})
        }
      });
    } catch (err) {
      console.warn('sendAdminBulkEmail audit', err && err.message);
    }

    return {
      ok: true,
      operationId,
      requested: uids.length,
      success: successCount,
      failed: failureCount,
      failures: failureFinal.slice(0, 50),
      renderedMeta: rendered.meta
    };
  }

  async function sendAdminBulkEmail(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const adminUser = await requireAdmin(req);
      const parsed = parseBulkEmailInput(req.body || {});
      await ensureMailReady();
      const result = await executeAdminBulkEmail({
        adminUser,
        brand: parsed.brand,
        uids: parsed.uids,
        operationId: parsed.operationId
      });
      return res.json({
        ok: true,
        code: result.code,
        operationId: result.operationId,
        requested: result.requested,
        success: result.success,
        failed: result.failed,
        failures: result.failures
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'BULK_EMAIL_FAILED',
        message: err.message || '일괄 메일 발송에 실패했습니다.'
      });
    }
  }

  return { sendAdminBulkEmail, executeAdminBulkEmail, ensureMailReady };
}

module.exports = {
  createHandlers,
  parseBulkEmailInput,
  textToHtml,
  bodyPreview,
  sanitizeSmtpError,
  emailHistoryStatus,
  sanitizeFailedSummary,
  EMAIL_CHUNK,
  buildAdminBrandedEmail,
  normalizeBrandInput
};
