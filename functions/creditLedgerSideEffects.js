'use strict';

/**
 * Durable post-commit side effects for admin credit ledger rows.
 * Triggered by creditLedger onCreate — not from the HTTP grant critical path.
 *
 * Only Node site-admin grants set origin=site_admin / site_admin_bulk.
 * Conversion (type=conversion), purchase, and Python-origin admin rows are ignored
 * so existing notify paths cannot double-fire.
 */

const NOTIFY_TYPES = new Set(['admin_grant', 'admin_bulk_credit', 'welcome_signup']);
const AUDIT_TYPES = new Set(['admin_grant', 'admin_deduct', 'welcome_signup']);
const ORIGINS = new Set(['site_admin', 'site_admin_bulk', 'welcome_signup']);

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

async function processCreditLedgerCreated({
  db,
  admin,
  userNotify,
  ledgerId,
  data
}) {
  const row = data && typeof data === 'object' ? data : {};
  const origin = String(row.origin || '');
  const type = String(row.type || '');
  const isAdminLedger = NOTIFY_TYPES.has(type) || AUDIT_TYPES.has(type);
  if (!ORIGINS.has(origin) && !isAdminLedger) {
    return { skipped: true, reason: 'origin' };
  }
  const uid = String(row.uid || '').trim();
  const amount = Number(row.amount || row.creditAmount || 0);
  const FieldValue = admin.firestore.FieldValue;
  const out = { skipped: false, notified: false, audited: false, ledgerId };

  if (NOTIFY_TYPES.has(type) && amount > 0 && uid && userNotify && userNotify.notifyAdminCreditGrant) {
    const n = await userNotify.notifyAdminCreditGrant(db, FieldValue, {
      uid,
      amount,
      operationId: row.operationId || '',
      adminUid: row.adminUid || '',
      ledgerId
    });
    out.notified = !!(n && n.created);
  }

  if (type === 'admin_deduct' && amount < 0 && uid && userNotify && userNotify.notifyAdminCreditDeduct) {
    const n = await userNotify.notifyAdminCreditDeduct(db, FieldValue, {
      uid,
      amount: Math.abs(amount),
      adminUid: row.adminUid || '',
      ledgerId
    });
    out.notified = out.notified || !!(n && n.created);
  }

  if (AUDIT_TYPES.has(type) && uid) {
    const auditId = `credit_ledger_${String(ledgerId || '').slice(0, 120)}`;
    const auditRef = db.collection('adminAuditLogs').doc(auditId);
    const existing = await auditRef.get();
    if (!existing.exists) {
      let actorEmail = '';
      const adminUid = String(row.adminUid || '').trim();
      if (adminUid) {
        try {
          const adminSnap = await db.collection('users').doc(adminUid).get();
          actorEmail = String((adminSnap.exists && adminSnap.data() && adminSnap.data().email) || '');
        } catch (_) { /* optional */ }
      }
      const signLabel = amount > 0 ? '+' : '-';
      const isWelcome = type === 'welcome_signup' || origin === 'welcome_signup';
      await auditRef.set({
        timestamp: FieldValue.serverTimestamp(),
        targetUserId: uid,
        category: 'credit',
        action: isWelcome
          ? 'WELCOME_SIGNUP_GRANT'
          : (amount > 0 ? 'CREDIT_GRANT' : 'CREDIT_DEDUCT'),
        actorId: adminUid || (isWelcome ? 'system' : ''),
        actorEmail,
        actorType: isWelcome ? 'system' : 'admin',
        result: 'success',
        summary: isWelcome
          ? `신규 가입 혜택 ${signLabel}${Math.abs(amount)} Credits`
          : `${signLabel}${Math.abs(amount)} Credits`,
        after: {
          amount,
          reason: row.reason || '',
          balance: row.balanceAfter != null ? row.balanceAfter : null,
          ledgerId,
          source: isWelcome ? 'welcome_signup' : (row.source || '')
        },
        ledgerCreatedAtMs: toMillis(row.createdAt)
      });
      out.audited = true;
    }
  }

  return out;
}

module.exports = {
  processCreditLedgerCreated,
  NOTIFY_TYPES,
  AUDIT_TYPES
};
