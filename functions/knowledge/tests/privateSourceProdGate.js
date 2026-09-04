/**
 * Production-gate validation for GITHUB_SUPPORT_AI_TOKEN.
 * Never prints token values or raw secret material.
 *
 * Run from functions/: node knowledge/tests/privateSourceProdGate.js
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const {
  createPrivateSourceAdapter,
  PRIVATE_SOURCE_CONFIG,
  shouldUsePrivateSource
} = require('../../supportAiPrivateSource');
const { containsRawSecretLeak: leakCheck } = require('../../supportAiPrivateSource/redactor');
const { evaluatePath } = require('../../supportAiPrivateSource/pathGate');
const { normalizePolicy } = require('../../supportAiPrivateSource/policy');

function loadTokenQuietly() {
  if (process.env.GITHUB_SUPPORT_AI_TOKEN) {
    return String(process.env.GITHUB_SUPPORT_AI_TOKEN).trim();
  }
  const siteRoot = path.resolve(__dirname, '../../..');
  const out = execSync('npx firebase functions:secrets:access GITHUB_SUPPORT_AI_TOKEN', {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return String(out || '').trim();
}

async function main() {
  const report = {
    tokenConfigured: false,
    metadataRead: false,
    policyRead: false,
    allowlistedRead: false,
    stageA: false,
    writeUsed: false,
    rawLeak: false,
    deniedFetch: 0,
    searchCalls: 0,
    filesFetched: 0,
    personalSkip: false,
    sourceRef: PRIVATE_SOURCE_CONFIG.sourceRef
  };

  let token;
  try {
    token = loadTokenQuietly();
  } catch (err) {
    console.error('FAIL token_load');
    process.exit(1);
  }
  if (!token || token.length < 8) {
    console.error('FAIL token_empty');
    process.exit(1);
  }
  report.tokenConfigured = true;
  process.env.GITHUB_SUPPORT_AI_TOKEN = token;

  const adapter = createPrivateSourceAdapter({
    env: process.env,
    authOverride: { mode: 'pat', token }
  });

  // Metadata read (GET /repos/...)
  const metaRes = await fetch(`https://api.github.com/repos/${PRIVATE_SOURCE_CONFIG.owner}/${PRIVATE_SOURCE_CONFIG.repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'midiai-support-ai-gate',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!metaRes.ok) {
    console.error('FAIL metadata_read', metaRes.status);
    process.exit(1);
  }
  report.metadataRead = true;

  // Policy on main
  const policy = await adapter.github.getPolicyJson();
  if (!policy || !Array.isArray(policy.allowPaths) || !policy.allowPaths.length) {
    console.error('FAIL policy_read');
    process.exit(1);
  }
  report.policyRead = true;

  // Allowlisted source read
  const file = await adapter.github.getFileContent('lang/en.json', { ref: 'main' });
  if (!file || !file.bytes || file.bytes.length < 10) {
    console.error('FAIL allowlisted_read');
    process.exit(1);
  }
  report.allowlistedRead = true;

  // Denied path must not be fetched into safe packet
  const denied = evaluatePath('reports/secret.log', normalizePolicy(policy));
  if (denied.allowed) {
    console.error('FAIL denied_path_allowed');
    process.exit(1);
  }

  // Stage A + safety gateway via adapter
  const out = await adapter.research({
    question: '편곡기능이 있다던데',
    rawQuestion: '편곡기능이 있다던데',
    weak: true,
    need: 'knowledge',
    facts: {}
  });
  report.searchCalls = (out.debug.privateSearchQueries || []).length;
  report.filesFetched = out.debug.privateFilesFetched || 0;
  if (report.searchCalls > 3 || report.filesFetched > 5) {
    console.error('FAIL bounds', report.searchCalls, report.filesFetched);
    process.exit(1);
  }
  if (!out.debug.privateSourceUsed || !out.passages.length) {
    console.error('FAIL stageA_or_evidence', out.debug.privateSourceFallbackReason);
    process.exit(1);
  }
  report.stageA = true;

  const ctx = out.llmContext || '';
  if (leakCheck(ctx) || /GOCSPX-|AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9]{20,}/.test(ctx)) {
    report.rawLeak = true;
    console.error('FAIL raw_secret_leak');
    process.exit(1);
  }
  if (out.debug.privateSafeExcerptChars > 80000) {
    console.error('FAIL token_budget');
    process.exit(1);
  }

  // Personal payment must skip
  const skip = await adapter.research({
    question: '내 결제 상태 알려줘',
    rawQuestion: '내 결제 상태 알려줘',
    personal: true,
    weak: true,
    need: 'knowledge',
    facts: {}
  });
  if (
    skip.debug.privateSourceFallbackReason !== 'personal_or_payment_skipped' ||
    skip.passages.length !== 0 ||
    shouldUsePrivateSource({
      question: '내 결제 상태 알려줘',
      personal: true,
      need: 'knowledge',
      weak: true
    })
  ) {
    console.error('FAIL personal_skip');
    process.exit(1);
  }
  report.personalSkip = true;
  report.writeUsed = false;

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceRef: report.sourceRef,
        tokenConfigured: report.tokenConfigured,
        metadataRead: report.metadataRead,
        policyRead: report.policyRead,
        allowlistedRead: report.allowlistedRead,
        stageA: report.stageA,
        writeUsed: report.writeUsed,
        rawLeak: report.rawLeak,
        searchCalls: report.searchCalls,
        filesFetched: report.filesFetched,
        safeExcerptChars: out.debug.privateSafeExcerptChars,
        personalSkip: report.personalSkip,
        queries: out.debug.privateSearchQueries,
        hitHints: out.debug.privateSourceHits
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('FAIL', err && err.code ? err.code : 'error');
  process.exit(1);
});
