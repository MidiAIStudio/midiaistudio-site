'use strict';

/**
 * Ops: zero all creditWalletsV2 balances (general + legacy mireloBalance).
 *
 * Default is dry-run. Apply only with --apply.
 *
 *   node functions/zeroAllCreditBalances.js
 *   node functions/zeroAllCreditBalances.js --apply
 *   node functions/zeroAllCreditBalances.js --apply --out=../reports/credit_zero_reset
 *
 * Writes creditLedgerV2 rows (type=admin_zero_reset) for non-zero wallets.
 * Does NOT touch licenses, passes, purchases history, or V1 creditWallets.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT = 'midiaistudio';
const SA_EMAIL = 'firebase-adminsdk-fbsvc@midiaistudio.iam.gserviceaccount.com';
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BATCH_LIMIT = 200; // wallet + ledger = 2 writes per uid
const REASON = 'credit_unification_zero_reset';

function parseArgs(argv) {
  const out = { apply: false, dryRun: true, outDir: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    }
    if (a === '--dry-run') out.dryRun = true;
    if (a.startsWith('--out=')) out.outDir = a.slice('--out='.length);
  }
  if (out.apply) out.dryRun = false;
  return out;
}

function loadLogin() {
  const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const refreshToken = j && j.tokens && j.tokens.refresh_token;
  if (!refreshToken) throw new Error('firebase_cli_refresh_token_missing');
  return { email: j.user && j.user.email, refreshToken };
}

async function getCliAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`oauth ${res.status}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function createEphemeralSaKey(accessToken) {
  const url =
    'https://iam.googleapis.com/v1/projects/' +
    PROJECT +
    '/serviceAccounts/' +
    encodeURIComponent(SA_EMAIL) +
    '/keys';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyAlgorithm: 'KEY_ALG_RSA_2048',
      privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.privateKeyData) {
    throw new Error(`createSaKey ${res.status}: ${JSON.stringify(data)}`);
  }
  return {
    keyName: data.name,
    cred: JSON.parse(Buffer.from(data.privateKeyData, 'base64').toString('utf8'))
  };
}

async function deleteSaKey(accessToken, keyName) {
  if (!keyName) return;
  try {
    await fetch('https://iam.googleapis.com/v1/' + keyName, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch (_) {
    /* best-effort */
  }
}

function readBal(n) {
  const v = Number(n != null ? n : 0);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function maskUid(uid) {
  const s = String(uid || '');
  if (s.length <= 8) return `uid_${s.length}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function ensureOutDir(outDir) {
  const dir = path.resolve(
    outDir || path.join(__dirname, '..', 'reports', 'credit_zero_reset')
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv);
  const admin = require('firebase-admin');
  const login = loadLogin();
  const accessToken = await getCliAccessToken(login.refreshToken);
  let keyName = null;

  try {
    const sa = await createEphemeralSaKey(accessToken);
    keyName = sa.keyName;
    // New IAM keys can take several seconds to become usable.
    await new Promise((r) => setTimeout(r, 10000));
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((app) => app.delete().catch(() => {})));
    }
    admin.initializeApp({ credential: admin.credential.cert(sa.cred), projectId: PROJECT });
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    async function getWalletsWithRetry() {
      let lastErr;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          return await db.collection('creditWalletsV2').get();
        } catch (err) {
          lastErr = err;
          const code = err && (err.code === 16 || /UNAUTHENTICATED/i.test(String(err.message || '')));
          if (!code || attempt === 5) throw err;
          console.error(`wallet scan retry ${attempt}/5 after auth lag`);
          await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
      }
      throw lastErr;
    }

    const snap = await getWalletsWithRetry();
    const targets = [];
    let alreadyZero = 0;
    let sumGeneral = 0;
    let sumMirelo = 0;

    snap.forEach((doc) => {
      const d = doc.data() || {};
      const balance = readBal(d.balance);
      const mireloBalance = readBal(d.mireloBalance);
      if (balance <= 0 && mireloBalance <= 0) {
        alreadyZero += 1;
        return;
      }
      sumGeneral += balance;
      sumMirelo += mireloBalance;
      targets.push({
        uid: doc.id,
        balance,
        mireloBalance,
        purchasedTotal: Number(d.purchasedTotal || 0) || 0
      });
    });

    targets.sort((a, b) => (b.balance + b.mireloBalance) - (a.balance + a.mireloBalance));

    const summary = {
      ok: true,
      projectId: PROJECT,
      mode: args.apply ? 'APPLY' : 'DRY_RUN',
      operator: login.email || '',
      scannedWallets: snap.size,
      alreadyZero,
      toZero: targets.length,
      sumGeneralBefore: sumGeneral,
      sumMireloBefore: sumMirelo,
      reason: REASON,
      topBalances: targets.slice(0, 40).map((t) => ({
        uid: maskUid(t.uid),
        balance: t.balance,
        mireloBalance: t.mireloBalance,
        purchasedTotal: t.purchasedTotal
      })),
      applied: 0,
      failed: [],
      startedAt: new Date().toISOString()
    };

    if (!args.apply) {
      const outDir = ensureOutDir(args.outDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(outDir, `dry_run_${stamp}.json`);
      const fullPath = path.join(outDir, `dry_run_targets_${stamp}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
      fs.writeFileSync(fullPath, JSON.stringify({
        generatedAt: summary.startedAt,
        targets: targets.map((t) => ({
          uid: t.uid,
          balance: t.balance,
          mireloBalance: t.mireloBalance,
          purchasedTotal: t.purchasedTotal
        }))
      }, null, 2));
      console.log(JSON.stringify({ ...summary, reportPath, fullPath }, null, 2));
      return;
    }

    let applied = 0;
    const failed = [];
    for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
      const chunk = targets.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const t of chunk) {
        const walletRef = db.collection('creditWalletsV2').doc(t.uid);
        const ledgerRef = db.collection('creditLedgerV2').doc();
        const totalPrev = t.balance; // ledger tracks general balance path
        batch.set(walletRef, {
          uid: t.uid,
          balance: 0,
          mireloBalance: 0,
          schemaVersion: 2,
          creditSystemVersion: 2,
          updatedAt: FieldValue.serverTimestamp(),
          lastZeroResetAt: FieldValue.serverTimestamp(),
          lastZeroResetReason: REASON
        }, { merge: true });
        batch.set(ledgerRef, {
          uid: t.uid,
          createdAt: FieldValue.serverTimestamp(),
          type: 'admin_zero_reset',
          reason: REASON,
          amount: -totalPrev,
          creditAmount: -totalPrev,
          balanceBefore: t.balance,
          balanceAfter: 0,
          mireloBalanceBefore: t.mireloBalance,
          mireloBalanceAfter: 0,
          walletPool: 'general',
          creditSystemVersion: 2,
          displayTitle: `크레딧 전량 초기화 (${t.balance}+mirelo${t.mireloBalance}→0)`,
          origin: 'ops_zero_all_credit_balances',
          operatorEmail: login.email || ''
        });
      }
      try {
        await batch.commit();
        applied += chunk.length;
      } catch (err) {
        failed.push({
          from: i,
          size: chunk.length,
          message: String(err && err.message || err)
        });
      }
      console.error(`progress ${Math.min(i + chunk.length, targets.length)}/${targets.length}`);
    }

    // Verify
    const after = await db.collection('creditWalletsV2').get();
    let nonzeroAfter = 0;
    let sumAfter = 0;
    after.forEach((doc) => {
      const d = doc.data() || {};
      const b = readBal(d.balance) + readBal(d.mireloBalance);
      if (b > 0) {
        nonzeroAfter += 1;
        sumAfter += b;
      }
    });

    summary.applied = applied;
    summary.failed = failed;
    summary.nonzeroAfter = nonzeroAfter;
    summary.sumAfter = sumAfter;
    summary.finishedAt = new Date().toISOString();
    summary.ok = failed.length === 0 && nonzeroAfter === 0;

    const outDir = ensureOutDir(args.outDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(outDir, `apply_${stamp}.json`);
    const fullPath = path.join(outDir, `apply_targets_${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(fullPath, JSON.stringify({
      generatedAt: summary.finishedAt,
      targets: targets.map((t) => ({
        uid: t.uid,
        balance: t.balance,
        mireloBalance: t.mireloBalance,
        purchasedTotal: t.purchasedTotal
      }))
    }, null, 2));
    console.log(JSON.stringify({ ...summary, reportPath, fullPath }, null, 2));
    if (!summary.ok) process.exitCode = 2;
  } finally {
    await deleteSaKey(accessToken, keyName);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
