/**
 * Fan-out in-app notifications to all users when a notice or patch note is published.
 * Uses Admin SDK (bypasses client security rules). Idempotent via deterministic notification IDs.
 */

const admin = require('firebase-admin');

const BRAND = 'MidiAI Studio';

function plainPreview(text, max = 140) {
  const s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function prefersInApp(userData, type) {
  const prefs = userData && typeof userData.notifyPrefs === 'object' ? userData.notifyPrefs : {};
  if (prefs.inApp === false) return false;
  if (type === 'notice' && prefs.notice === false) return false;
  if (type === 'patch_note' && prefs.patchNote === false) return false;
  return true;
}

async function alreadyUserNotified(ref) {
  const snap = await ref.get();
  return !!(snap.exists && snap.data()?.userNotified === true);
}

async function claimUserNotified(ref) {
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (data.userNotified === true) return false;
    tx.set(ref, {
      userNotified: true,
      userNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
}

async function listUserTargets(type, actorUid) {
  const db = admin.firestore();
  const targets = [];
  let last = null;
  for (;;) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((doc) => {
      const uid = doc.id;
      if (!uid || uid === actorUid) return;
      if (!prefersInApp(doc.data() || {}, type)) return;
      targets.push(uid);
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 300) break;
  }
  return targets;
}

async function writeNotifications(targets, notifId, payload) {
  const db = admin.firestore();
  let created = 0;
  let skipped = 0;
  const chunk = 80;
  for (let i = 0; i < targets.length; i += chunk) {
    const slice = targets.slice(i, i + chunk);
    const results = await Promise.all(slice.map(async (uid) => {
      const ref = db.collection('users').doc(uid).collection('notifications').doc(notifId);
      try {
        await ref.create({
          ...payload,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return 'created';
      } catch (err) {
        const code = err && (err.code || err.status);
        // ALREADY_EXISTS (gRPC 6) — idempotent retry
        if (code === 6 || code === 'already-exists') return 'skipped';
        console.error('broadcastNotify create failed', { uid, notifId, message: err.message || String(err) });
        return 'error';
      }
    }));
    created += results.filter((r) => r === 'created').length;
    skipped += results.filter((r) => r === 'skipped').length;
  }
  return { created, skipped };
}

/**
 * Publish fan-out for announcements / patchNotes.
 * @param {'notice'|'patch_note'} type
 * @param {string} postId
 * @param {FirebaseFirestore.DocumentData} data
 * @param {FirebaseFirestore.DocumentReference} ref
 */
async function broadcastPublishedContent(type, postId, data, ref) {
  if (!postId || !ref) return { ok: false, reason: 'missing' };
  if (data.visible !== true) return { ok: false, reason: 'not-visible' };
  if (await alreadyUserNotified(ref)) return { ok: false, reason: 'already' };

  const title = String(data.title || (type === 'patch_note' ? data.version : '') || '').trim();
  const body = data.contentMarkdown || data.content || data.answer || '';
  const version = String(data.version || '').trim();
  const postTitle = type === 'patch_note' && version
    ? (title ? `${version} · ${title}` : version)
    : (title || (type === 'notice' ? '새 공지사항' : '새 패치노트'));

  const actorUid = String(data.authorUid || data.uid || 'system');
  const actorName = String(data.displayName || BRAND);
  const notifId = `${type}_${postId}`.slice(0, 140);

  const payload = {
    type,
    category: 'announcement',
    targetUrl: type === 'notice'
      ? `/notice.html?id=${encodeURIComponent(postId)}`
      : `/patch-note.html?id=${encodeURIComponent(postId)}`,
    postId,
    commentId: '',
    parentId: '',
    ticketId: '',
    plan: '',
    status: '',
    version,
    actorUid,
    actorName,
    postTitle: postTitle.slice(0, 120),
    preview: plainPreview(body, 140)
  };

  const targets = await listUserTargets(type, actorUid);
  const { created, skipped } = await writeNotifications(targets, notifId, payload);
  await claimUserNotified(ref);

  console.log('broadcastPublishedContent done', {
    type,
    postId,
    targets: targets.length,
    created,
    skipped
  });
  return { ok: true, targets: targets.length, created, skipped };
}

module.exports = {
  broadcastPublishedContent
};
