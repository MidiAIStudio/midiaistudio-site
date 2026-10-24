'use strict';

/**
 * Credit → Pass unification migration classifier (DRY RUN by default).
 *
 * Counts candidates for:
 *   - unused paid credits → PASS_30D (does NOT debit balances)
 *   - unused welcome signup credits → PASS_3D (does NOT reclaim credits)
 *   - mireloBalance > 0 merge candidates (report only; no auto-clear)
 *
 * Priority (same uid cannot get both 30d and 3d from overlapping credit grounds):
 *   1. Lifetime protect
 *   2. Active paid period protect (still may stack later under approval)
 *   3. Paid unused credits → 30d candidate
 *   4. Unused welcome bonus → 3d candidate
 *
 * Run:
 *   node functions/creditPassMigrationDryRun.js
 *   node functions/creditPassMigrationDryRun.js --dry-run
 *   node functions/creditPassMigrationDryRun.js --out=../reports/credit_unification
 *
 * --apply is intentionally rejected in this phase (ops approval required).
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_AUDIT = 'creditPassMigrations';
const WELCOME_GRANTS = 'welcome_credit_grants';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const out = { dryRun: true, apply: false, outDir: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    if (a === '--dry-run') out.dryRun = true;
    if (a.startsWith('--out=')) out.outDir = a.slice('--out='.length);
  }
  return out;
}

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

function planOf(lic) {
  return String((lic && lic.plan) || '').toLowerCase().trim();
}

function isLifetime(lic) {
  return planOf(lic) === 'lifetime' || planOf(lic) === 'full';
}

function isActivePeriod(lic, nowMs) {
  const plan = planOf(lic);
  const status = String((lic && lic.status) || '').toLowerCase();
  const end = toMillis(lic && lic.expiresAt);
  return (
    !!(lic && lic.licensed) &&
    ['active', 'ok', 'enabled'].includes(status) &&
    ['period', 'monthly', 'yearly', 'annual', 'subscription', 'pass', 'full_pass'].includes(plan) &&
    end > nowMs
  );
}

function maskUid(uid) {
  const s = String(uid || '');
  if (s.length <= 8) return `uid_${s.length}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function initFirestore() {
  // Prefer Application Default Credentials / FIREBASE_CONFIG when present.
  let admin;
  try {
    admin = require('firebase-admin');
  } catch (_) {
    return { ok: false, reason: 'firebase-admin_not_installed' };
  }
  let fromFirebaseConfig = '';
  if (process.env.FIREBASE_CONFIG) {
    try {
      fromFirebaseConfig = String(JSON.parse(process.env.FIREBASE_CONFIG).projectId || '');
    } catch (_) {
      fromFirebaseConfig = '';
    }
  }
  const projectId = String(
    process.env.GCLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || process.env.GCP_PROJECT
      || fromFirebaseConfig
      || ''
  ).trim();
  if (!projectId && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { ok: false, reason: 'no_project_id_or_credentials' };
  }
  try {
    if (!admin.apps.length) {
      const opts = projectId ? { projectId } : undefined;
      admin.initializeApp(opts);
    }
    return { ok: true, db: admin.firestore(), admin };
  } catch (err) {
    return { ok: false, reason: String(err && err.message || err) };
  }
}

function classifyUser({
  uid,
  license,
  wallet,
  welcomeGrant,
  paidPurchaseCredits,
  welcomeConsumed,
  migrationDoc,
  nowMs
}) {
  const result = {
    uidMasked: maskUid(uid),
    category: 'none',
    reasons: [],
    generalBalance: Number(wallet.balance || 0) || 0,
    mireloBalance: Number(wallet.mireloBalance || 0) || 0,
    paidPurchaseCredits: Number(paidPurchaseCredits || 0) || 0,
    welcomeAmount: Number((welcomeGrant && welcomeGrant.amount) || 0) || 0,
    welcomeUnused: false,
    plan: planOf(license),
    alreadyMigrated: !!(migrationDoc && migrationDoc.completed)
  };

  if (result.alreadyMigrated) {
    result.category = 'already_migrated';
    result.reasons.push('creditPassMigrations completed');
    return result;
  }
  if (isLifetime(license)) {
    result.category = 'lifetime_protect';
    result.reasons.push('lifetime');
    return result;
  }

  const welcomeGranted =
    !!(welcomeGrant && (welcomeGrant.creditGranted === true || Number(welcomeGrant.amount || 0) > 0));
  const welcomeUnused = welcomeGranted && !welcomeConsumed && Number(welcomeGrant.amount || 0) > 0;
  result.welcomeUnused = welcomeUnused;

  const paidUnused = result.paidPurchaseCredits > 0 && result.generalBalance > 0;

  if (paidUnused) {
    result.category = 'candidate_pass_30d';
    result.reasons.push('paid_credits_remaining');
    if (isActivePeriod(license, nowMs)) result.reasons.push('stack_onto_active_period');
    return result;
  }

  if (welcomeUnused && result.paidPurchaseCredits <= 0) {
    if (Number(welcomeGrant.amount) > 0 && welcomeConsumed) {
      result.category = 'excluded_partial_welcome_use';
      result.reasons.push('welcome_partially_or_fully_used');
      return result;
    }
    result.category = 'candidate_pass_3d';
    result.reasons.push('unused_welcome_credits');
    if (isActivePeriod(license, nowMs)) result.reasons.push('stack_onto_active_period');
    return result;
  }

  if (welcomeGranted && welcomeConsumed) {
    result.category = 'excluded_welcome_used';
    result.reasons.push('welcome_used');
    return result;
  }

  if (result.mireloBalance > 0) {
    result.category = 'mirelo_balance_report_only';
    result.reasons.push('mireloBalance_nonzero_no_auto_clear');
    return result;
  }

  if (isActivePeriod(license, nowMs)) {
    result.category = 'active_period';
    return result;
  }

  result.category = 'no_action';
  return result;
}

async function loadPaidPurchaseTotals(db) {
  // Sum credited, non-refunded purchases per uid (general packs only).
  const snap = await db.collection('creditPurchases').get();
  const map = new Map();
  for (const doc of snap.docs || []) {
    const d = doc.data() || {};
    const uid = String(d.uid || '').trim();
    if (!uid) continue;
    const status = String(d.status || '').toLowerCase();
    if (!(status === 'credited' || d.granted === true || d.creditsGranted === true)) continue;
    if (d.refunded === true || status === 'refunded' || status === 'cancelled' || status === 'canceled') continue;
    const pool = String(d.walletPool || 'general').toLowerCase();
    if (pool === 'mirelo') continue; // legacy mirelo packs tracked separately
    const amt = Math.max(0, Math.floor(Number(d.creditAmount || d.credits || d.points || 0) || 0));
    if (!amt) continue;
    map.set(uid, (map.get(uid) || 0) + amt);
  }
  return map;
}

async function welcomeConsumedSet(db) {
  // Any ledger spend after a welcome_signup grant for that uid ⇒ welcome was used.
  // Heuristic: if wallet consumedTotal > 0 and welcome grant exists with amount>0 and
  // balance < amount (or ledger has conversion debit), mark consumed.
  const used = new Set();
  const ledSnap = await db.collection('creditLedgerV2')
    .where('type', 'in', ['conversion', 'spend', 'debit', 'job_charge', 'authorize'])
    .limit(5000)
    .get()
    .catch(() => null);
  if (ledSnap) {
    for (const doc of ledSnap.docs || []) {
      const d = doc.data() || {};
      const uid = String(d.uid || '').trim();
      if (uid) used.add(uid);
    }
  }
  return used;
}

async function runDryRun(db) {
  const nowMs = Date.now();
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: 'dry_run',
    totals: {
      users: 0,
      wallets: 0,
      licenses: 0,
      withGeneralBalance: 0,
      withMireloBalance: 0,
      mireloBalanceSum: 0,
      lifetime: 0,
      activePeriod: 0,
      welcomeGrants: 0,
      candidatePass30d: 0,
      candidatePass3d: 0,
      excludedWelcomeUsed: 0,
      excludedPartialWelcome: 0,
      alreadyMigrated: 0,
      unclear: 0,
      lifetimeProtect: 0,
      mireloReportOnly: 0,
      noAction: 0
    },
    samples: {
      candidatePass30d: [],
      candidatePass3d: [],
      excluded: [],
      mireloBalance: []
    },
    notes: [
      'PII omitted (uids masked).',
      'No balances were modified.',
      'Paid residual → PASS_30D and unused welcome → PASS_3D require separate --apply approval.',
      'mireloBalance is never auto-cleared here.'
    ]
  };

  const [licSnap, walletSnap, welcomeSnap, migSnap, paidMap, consumed] = await Promise.all([
    db.collection('licenses').get(),
    db.collection('creditWalletsV2').get(),
    db.collection(WELCOME_GRANTS).get(),
    db.collection(MIGRATION_AUDIT).get().catch(() => ({ docs: [] })),
    loadPaidPurchaseTotals(db),
    welcomeConsumedSet(db)
  ]);

  const licenses = new Map();
  for (const doc of licSnap.docs || []) {
    licenses.set(doc.id, doc.data() || {});
  }
  const wallets = new Map();
  for (const doc of walletSnap.docs || []) {
    wallets.set(doc.id, doc.data() || {});
  }
  const welcomes = new Map();
  for (const doc of welcomeSnap.docs || []) {
    welcomes.set(doc.id, doc.data() || {});
  }
  const migrations = new Map();
  for (const doc of migSnap.docs || []) {
    migrations.set(doc.id, doc.data() || {});
  }

  const uids = new Set([
    ...licenses.keys(),
    ...wallets.keys(),
    ...welcomes.keys()
  ]);
  summary.totals.users = uids.size;
  summary.totals.wallets = wallets.size;
  summary.totals.licenses = licenses.size;
  summary.totals.welcomeGrants = welcomes.size;

  for (const uid of uids) {
    const license = licenses.get(uid) || {};
    const wallet = wallets.get(uid) || {};
    const welcomeGrant = welcomes.get(uid) || null;
    const bal = Math.max(0, Math.floor(Number(wallet.balance || 0) || 0));
    const mBal = Math.max(0, Math.floor(Number(wallet.mireloBalance || 0) || 0));
    if (bal > 0) summary.totals.withGeneralBalance += 1;
    if (mBal > 0) {
      summary.totals.withMireloBalance += 1;
      summary.totals.mireloBalanceSum += mBal;
    }
    if (isLifetime(license)) summary.totals.lifetime += 1;
    if (isActivePeriod(license, nowMs)) summary.totals.activePeriod += 1;

    // Welcome consumed heuristic: ledger spend OR balance < welcome amount while grant exists.
    let welcomeConsumed = consumed.has(uid);
    if (welcomeGrant && Number(welcomeGrant.amount || 0) > 0) {
      if (bal < Number(welcomeGrant.amount)) welcomeConsumed = true;
      if (Number(wallet.consumedTotal || 0) > 0) welcomeConsumed = true;
    }

    const row = classifyUser({
      uid,
      license,
      wallet,
      welcomeGrant,
      paidPurchaseCredits: paidMap.get(uid) || 0,
      welcomeConsumed,
      migrationDoc: migrations.get(uid),
      nowMs
    });

    switch (row.category) {
      case 'candidate_pass_30d':
        summary.totals.candidatePass30d += 1;
        if (summary.samples.candidatePass30d.length < 25) summary.samples.candidatePass30d.push(row);
        break;
      case 'candidate_pass_3d':
        summary.totals.candidatePass3d += 1;
        if (summary.samples.candidatePass3d.length < 25) summary.samples.candidatePass3d.push(row);
        break;
      case 'excluded_welcome_used':
        summary.totals.excludedWelcomeUsed += 1;
        if (summary.samples.excluded.length < 25) summary.samples.excluded.push(row);
        break;
      case 'excluded_partial_welcome_use':
        summary.totals.excludedPartialWelcome += 1;
        if (summary.samples.excluded.length < 25) summary.samples.excluded.push(row);
        break;
      case 'already_migrated':
        summary.totals.alreadyMigrated += 1;
        break;
      case 'lifetime_protect':
        summary.totals.lifetimeProtect += 1;
        break;
      case 'mirelo_balance_report_only':
        summary.totals.mireloReportOnly += 1;
        if (summary.samples.mireloBalance.length < 25) summary.samples.mireloBalance.push(row);
        break;
      case 'active_period':
        break;
      case 'no_action':
        summary.totals.noAction += 1;
        break;
      default:
        summary.totals.unclear += 1;
        break;
    }
  }

  summary.estimatedPassDaysToGrant =
    summary.totals.candidatePass30d * 30 + summary.totals.candidatePass3d * 3;
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.apply) {
    console.error('REFUSED: --apply is disabled in this phase. Dry-run only. Ops approval required.');
    process.exit(2);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOut = path.resolve(__dirname, '..', '..', 'MidiAI', 'reports', 'credit_unification');
  // Prefer MidiAI reports when present; else site-local reports.
  let outDir = args.outDir
    ? path.resolve(args.outDir)
    : (fs.existsSync(path.resolve('C:\\MidiAI\\reports'))
      ? path.resolve('C:\\MidiAI\\reports\\credit_unification')
      : path.resolve(__dirname, '..', 'reports', 'credit_unification'));
  void defaultOut;
  fs.mkdirSync(outDir, { recursive: true });

  const init = await initFirestore();
  let summary;
  if (!init.ok) {
    summary = {
      generatedAt: new Date().toISOString(),
      mode: 'dry_run_offline',
      connection: { ok: false, reason: init.reason },
      totals: null,
      notes: [
        'Firestore was not reachable from this environment.',
        'Re-run with Application Default Credentials against a READ replica / staging to fill totals.',
        'No production writes were attempted.',
        'Classifier logic is ready in creditPassMigrationDryRun.js.'
      ],
      classifier: {
        pass30d: 'paid purchase credited + non-refund + general balance > 0 + not lifetime',
        pass3d: 'welcome_credit_grants with unused credits + no paid purchases + not lifetime',
        mireloBalance: 'report only; never auto-clear without consent'
      }
    };
  } else {
    try {
      summary = await runDryRun(init.db);
      summary.connection = { ok: true };
    } catch (err) {
      summary = {
        generatedAt: new Date().toISOString(),
        mode: 'dry_run_offline',
        connection: { ok: false, reason: String(err && err.message || err) },
        totals: null,
        notes: [
          'Firestore read failed (auth/project). Classifier not executed against live data.',
          'No production writes were attempted.',
          'Re-run with valid ADC + project id when ready for ops dry-run counts.'
        ]
      };
    }
  }

  const jsonPath = path.join(outDir, `dryrun_${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, out: jsonPath, mode: summary.mode, totals: summary.totals }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  classifyUser,
  isLifetime,
  isActivePeriod,
  maskUid,
  DAY_MS
};
