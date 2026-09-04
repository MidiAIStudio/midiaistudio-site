/**
 * User-initiated support chat close → full transcript purge (ticket + replies).
 * Does NOT touch payments, licenses, entitlements, accounts, or aiSupportRate.
 */
const admin = require('firebase-admin');

async function isAdminUid(db, uid) {
  if (!uid) return false;
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() || {} : {};
    const role = String(data.role || '').toLowerCase();
    return role === 'admin' || role === 'developer' || role === 'staff';
  } catch (_) {
    return false;
  }
}

/**
 * Atomically remove supportTickets/{id} and all replies (Firestore subcollections
 * are NOT deleted by parent delete alone — use recursiveDelete).
 */
async function purgeSupportTicket(db, ticketRef, { uid, ticketId } = {}) {
  // Best-effort attachment cleanup under the ticket prefix (chat content, not business records).
  if (uid && ticketId) {
    try {
      const bucket = admin.storage().bucket();
      await bucket.deleteFiles({ prefix: `support/${uid}/${ticketId}/`, force: true });
    } catch (err) {
      console.warn('supportCloseTicket storage cleanup', err && err.message);
    }
  }

  await db.recursiveDelete(ticketRef);
}

async function handleSupportCloseTicket(db, user, ticketId) {
  const id = String(ticketId || '').trim();
  if (!id) throw Object.assign(new Error('ticketId required'), { status: 400 });

  const ticketRef = db.collection('supportTickets').doc(id);
  const snap = await ticketRef.get();
  if (!snap.exists) {
    // Idempotent: already gone
    return { ok: true, alreadyDeleted: true };
  }

  const ticket = snap.data() || {};
  const ownerUid = String(ticket.uid || '');
  const isOwner = ownerUid && ownerUid === user.uid;
  const adminOk = !isOwner && (await isAdminUid(db, user.uid));
  if (!isOwner && !adminOk) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  await purgeSupportTicket(db, ticketRef, { uid: ownerUid || user.uid, ticketId: id });

  // Non-identifying operational telemetry only — no transcript copy.
  console.info(
    'SUPPORT_CHAT_CLOSED',
    JSON.stringify({
      event: 'support_chat_closed',
      count: 1,
      byAdmin: !!adminOk,
      reason: 'user_end_purge'
    })
  );

  return { ok: true, purged: true, ticketId: id };
}

function createSupportCloseHandlers({ db, cors, requireUser }) {
  async function supportCloseTicket(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const ticketId = String(req.body?.ticketId || '').trim();
      const result = await handleSupportCloseTicket(db, user, ticketId);
      return res.json(result);
    } catch (err) {
      const status = err.status || 500;
      console.error('supportCloseTicket', err && err.message);
      return res.status(status).json({
        ok: false,
        message: err.message || 'supportCloseTicket failed'
      });
    }
  }

  return { supportCloseTicket };
}

module.exports = {
  createSupportCloseHandlers,
  handleSupportCloseTicket,
  purgeSupportTicket
};
