/**
 * Signup license provisioning — create-if-absent only.
 * Never overwrites an existing licenses/{uid} document (lifetime stays lifetime).
 */

function normalizeRole(role) {
  const r = String(role || 'user').toLowerCase().trim();
  if (r === 'admin' || r === 'developer' || r === 'staff') return 'admin';
  return 'user';
}

function buildSignupLicensePayload(userData, serverTimestamp) {
  const role = normalizeRole(userData && userData.role);
  if (role === 'admin') {
    return {
      licensed: true,
      plan: 'lifetime',
      status: 'active',
      method: 'admin',
      createdAt: serverTimestamp,
      updatedAt: serverTimestamp
    };
  }
  return {
    licensed: true,
    plan: 'trial',
    status: 'active',
    method: 'signup',
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp
  };
}

/**
 * Transactional create-if-absent.
 * Concurrent callers: at most one create wins; losers see exists and no-op.
 * @returns {{ created: boolean, plan?: string, existingPlan?: string }}
 */
async function createLicenseIfAbsent(db, uid, userData, FieldValue) {
  const licenseRef = db.collection('licenses').doc(uid);
  const serverTimestamp = FieldValue.serverTimestamp();
  const payload = buildSignupLicensePayload(userData || {}, serverTimestamp);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(licenseRef);
      if (snap.exists) {
        const existing = snap.data() || {};
        return {
          created: false,
          existingPlan: String(existing.plan || ''),
          plan: payload.plan
        };
      }
      tx.create(licenseRef, payload);
      return { created: true, plan: payload.plan };
    });
  } catch (err) {
    // Parallel create: second writer hits already-exists — treat as success/no-op.
    const code = err && err.code;
    const msg = String((err && err.message) || code || '');
    const already =
      code === 6 ||
      code === 'already-exists' ||
      /already[-_ ]?exists/i.test(msg) ||
      /ALREADY_EXISTS/i.test(msg);
    if (already) {
      const again = await licenseRef.get();
      const existing = again.exists ? again.data() || {} : {};
      return {
        created: false,
        existingPlan: String(existing.plan || ''),
        plan: payload.plan,
        raced: true
      };
    }
    throw err;
  }
}

module.exports = {
  normalizeRole,
  buildSignupLicensePayload,
  createLicenseIfAbsent
};
