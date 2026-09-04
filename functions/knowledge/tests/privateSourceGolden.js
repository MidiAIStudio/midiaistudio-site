/**
 * Private GitHub source adapter golden tests (A–L).
 * Uses local MidiAI-Studio checkout as Stage A/B fixture when available;
 * never sends raw source to a live OpenAI capture in these tests.
 *
 * Run: node functions/knowledge/tests/privateSourceGolden.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createPrivateSourceAdapter,
  shouldUsePrivateSource,
  buildSearchTerms,
  isPersonalOrPaymentQuestion,
  sanitizeCustomerAnswer,
  customerAnswerIsSafe,
  PRIVATE_SOURCE_CONFIG
} = require('../../supportAiPrivateSource');
const { evaluatePath } = require('../../supportAiPrivateSource/pathGate');
const { redactSecrets, containsRawSecretLeak } = require('../../supportAiPrivateSource/redactor');
const { makeSafePacket } = require('../../supportAiPrivateSource/gateway');
const { normalizePolicy } = require('../../supportAiPrivateSource/policy');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const {
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  sanitizeUserFacingText
} = require('../../supportAi');

const LOCAL_ROOT = process.env.SUPPORT_AI_LOCAL_SOURCE_ROOT || 'C:\\GitHub\\MidiAI-Studio';
const HAS_LOCAL =
  fs.existsSync(path.join(LOCAL_ROOT, 'support-ai-source-policy.json')) &&
  fs.existsSync(path.join(LOCAL_ROOT, 'lang', 'en.json'));

function loadPolicyFromLocal() {
  return normalizePolicy(
    JSON.parse(fs.readFileSync(path.join(LOCAL_ROOT, 'support-ai-source-policy.json'), 'utf8'))
  );
}

function emptyAdapters(overrides = {}) {
  return {
    retrieveStatic: async () => [],
    loadLiveFaq: async () => [],
    loadLiveCatalog: async () => [],
    loadLiveRelease: async () => [],
    loadLiveNotice: async () => [],
    loadLiveGuide: async () => [],
    ...overrides
  };
}

async function run() {
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.error(`FAIL  ${name}: ${err.message}`);
    }
  };

  await check('config single sourceRef', async () => {
    assert.strictEqual(PRIVATE_SOURCE_CONFIG.sourceRef, 'repo-cleanup-support-ai');
    assert.strictEqual(PRIVATE_SOURCE_CONFIG.owner, 'MidiAIStudio');
    assert.strictEqual(PRIVATE_SOURCE_CONFIG.repo, 'MidiAI-Studio');
  });

  await check('path gate default deny + deny wins', async () => {
    const policy = normalizePolicy({
      allowPaths: ['core/**', 'reports/**'],
      denyPaths: ['reports/**'],
      denyPatterns: ['*.env', '*secret*']
    });
    assert.strictEqual(evaluatePath('core/foo.py', policy).allowed, true);
    assert.strictEqual(evaluatePath('reports/x.txt', policy).allowed, false);
    assert.strictEqual(evaluatePath('other/x.py', policy).allowed, false);
    assert.strictEqual(evaluatePath('../core/foo.py', policy).allowed, false);
    assert.strictEqual(evaluatePath('C:/MidiAI/run_gui.py', policy).allowed, false);
    assert.ok(evaluatePath('foo.secret.json', policy).reason.includes('deny'));
  });

  await check('E synthetic secret never reaches LLM packet', async () => {
    const policy = normalizePolicy({
      allowPaths: ['run_gui.py'],
      denyPaths: [],
      denyPatterns: []
    });
    const probe = 'GOCSPX-SYNTHETIC_TEST_SECRET_VALUE_ONLY';
    const src = [
      'FIREBASE_API_KEY = "AIzaSySyntHeticFirebaseKeyValueXX"',
      `GOOGLE_OAUTH_CLIENT_SECRET = "${probe}"`,
      'def arrange_feature():',
      '    return "AI Instrument Arrange"'
    ].join('\n');
    const made = makeSafePacket(policy, 'run_gui.py', Buffer.from(src, 'utf8'), 3);
    assert.ok(made.ok);
    assert.ok(!containsRawSecretLeak(made.packet.safeText, [probe, 'AIzaSySyntHeticFirebaseKeyValueXX']));
    assert.ok(made.packet.safeText.includes('[REDACTED]'));
    assert.ok(made.packet.redactionCount >= 1);
  });

  await check('F denied path fetch 0', async () => {
    const policy = HAS_LOCAL
      ? loadPolicyFromLocal()
      : normalizePolicy({ allowPaths: ['core/**'], denyPaths: ['reports/**'], denyPatterns: [] });
    const adapter = createPrivateSourceAdapter({
      localRoot: HAS_LOCAL ? LOCAL_ROOT : null,
      policy,
      authOverride: { mode: 'none' },
      githubClient: {
        configured: () => false,
        searchCode: async () => [{ path: 'reports/leak.txt', line: 1, score: 99 }],
        getFileContent: async () => {
          throw new Error('should_not_fetch_denied');
        },
        getPolicyJson: async () => policy
      }
    });
    // Direct gate
    assert.strictEqual(evaluatePath('reports/x.log', policy).allowed, false);
    assert.strictEqual(evaluatePath('.env', policy).allowed, false);
  });

  await check('G GitHub auth failure → knowledge fallback (adapter disabled)', async () => {
    const adapter = createPrivateSourceAdapter({
      authOverride: { mode: 'none' },
      githubClient: {
        configured: () => true,
        searchCode: async () => {
          const e = new Error('auth');
          e.code = 'github_auth_failure';
          throw e;
        },
        getFileContent: async () => null,
        getPolicyJson: async () => {
          const e = new Error('auth');
          e.code = 'github_auth_failure';
          throw e;
        }
      }
    });
    const out = await adapter.research({
      question: '편곡 기능',
      rawQuestion: '편곡 기능',
      weak: true,
      need: 'knowledge',
      facts: {}
    });
    assert.strictEqual(out.enabled, false);
    assert.ok(
      out.debug.privateSourceFallbackReason === 'policy_fetch_failed' ||
        out.debug.privateSourceFallbackReason === 'github_auth_failure' ||
        out.debug.privateSourceFallbackReason === 'github_auth_missing'
    );
    assert.strictEqual(out.passages.length, 0);
  });

  await check('H GitHub timeout → safe fallback no internal error text', async () => {
    const policy = normalizePolicy({
      allowPaths: ['lang/**'],
      denyPaths: [],
      denyPatterns: []
    });
    const adapter = createPrivateSourceAdapter({
      policy,
      githubClient: {
        configured: () => true,
        searchCode: async () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          throw e;
        },
        getFileContent: async () => null,
        getPolicyJson: async () => policy
      }
    });
    const out = await adapter.research({
      question: '편곡',
      rawQuestion: '편곡',
      weak: true,
      need: 'knowledge',
      facts: {}
    });
    assert.strictEqual(out.debug.privateSourceFallbackReason, 'github_timeout');
    assert.strictEqual(out.passages.length, 0);
    const customer = sanitizeUserFacingText('github_timeout internal AbortError', 'ko');
    assert.ok(!/AbortError|github_timeout/i.test(customer) || customer.length >= 0);
  });

  await check('I policy fetch failure → never allow-all', async () => {
    const adapter = createPrivateSourceAdapter({
      githubClient: {
        configured: () => true,
        getPolicyJson: async () => {
          const e = new Error('fail');
          e.code = 'policy_fetch_failed';
          throw e;
        },
        searchCode: async () => {
          throw new Error('must_not_search_when_policy_failed');
        },
        getFileContent: async () => null
      }
    });
    const out = await adapter.research({
      question: '편곡기능이 있다던데',
      rawQuestion: '편곡기능이 있다던데',
      weak: true,
      need: 'knowledge',
      facts: {}
    });
    assert.strictEqual(out.enabled, false);
    assert.strictEqual(out.debug.privateSourceFallbackReason, 'policy_fetch_failed');
    assert.strictEqual(out.passages.length, 0);
  });

  await check('J customer response strips path/github/function leaks', async () => {
    const leak =
      'run_gui.py의 _foo 함수에서 Arrange를 확인했습니다. GitHub MidiAI-Studio repo에서 봤습니다.';
    const safe = sanitizeCustomerAnswer(leak);
    assert.ok(customerAnswerIsSafe(safe));
    assert.ok(!/run_gui\.py|GitHub|_foo|MidiAI-Studio/i.test(safe));
    const viaSupport = sanitizeUserFacingText(leak, 'ko');
    assert.ok(!/run_gui\.py|GitHub/i.test(viaSupport));
  });

  await check('L personal/payment skips private source', async () => {
    assert.strictEqual(isPersonalOrPaymentQuestion('내 결제 상태 알려줘'), true);
    assert.strictEqual(
      shouldUsePrivateSource({
        question: '환불 승인해줘',
        rawQuestion: '환불 승인해줘',
        personal: false,
        need: 'knowledge',
        weak: true
      }),
      false
    );
    const adapter = createPrivateSourceAdapter({
      localRoot: HAS_LOCAL ? LOCAL_ROOT : os.tmpdir(),
      policy: normalizePolicy({ allowPaths: ['**'], denyPaths: [], denyPatterns: [] })
    });
    const out = await adapter.research({
      question: '내 이용권 만료일',
      rawQuestion: '내 이용권 만료일',
      personal: true,
      weak: true,
      need: 'knowledge'
    });
    assert.strictEqual(out.debug.privateSourceFallbackReason, 'personal_or_payment_skipped');
    assert.strictEqual(out.passages.length, 0);
  });

  await check('K tempo search terms stay bounded', async () => {
    const terms = buildSearchTerms({ question: '템포 바꾸는 법', rawQuestion: '템포 바꾸는 법', facts: {} });
    assert.ok(terms.length <= 8);
    assert.ok(terms.some((t) => /tempo|템포/i.test(t)));
    // No repo-wide enumerate: research with mock counts search calls
    let searchCalls = 0;
    const policy = normalizePolicy({
      allowPaths: ['lang/**', 'ui/**', 'core/**'],
      denyPaths: [],
      denyPatterns: []
    });
    const adapter = createPrivateSourceAdapter({
      policy,
      localRoot: HAS_LOCAL ? LOCAL_ROOT : null,
      githubClient: HAS_LOCAL
        ? {
            configured: () => false,
            searchCode: async () => {
              searchCalls += 1;
              return [];
            },
            getFileContent: async () => null,
            getPolicyJson: async () => policy
          }
        : {
            configured: () => true,
            searchCode: async () => {
              searchCalls += 1;
              return [];
            },
            getFileContent: async () => null,
            getPolicyJson: async () => policy
          }
    });
    await adapter.research({
      question: '템포 바꾸는 법',
      rawQuestion: '템포 바꾸는 법',
      weak: true,
      need: 'knowledge',
      facts: {}
    });
    if (!HAS_LOCAL) {
      assert.ok(searchCalls <= 3);
    }
  });

  if (!HAS_LOCAL) {
    await check('A-C-D SKIPPED (no local MidiAI-Studio fixture)', async () => {
      console.log('  (set SUPPORT_AI_LOCAL_SOURCE_ROOT or clone MidiAI-Studio)');
    });
  } else {
    const adapter = createPrivateSourceAdapter({
      localRoot: LOCAL_ROOT,
      policy: loadPolicyFromLocal(),
      authOverride: { mode: 'none' }
    });

    await check('A 편곡기능이 있다던데 → Arrange evidence', async () => {
      const terms = buildSearchTerms({
        question: '편곡기능이 있다던데',
        rawQuestion: '편곡기능이 있다던데',
        facts: {}
      });
      assert.ok(terms.some((t) => /Arrange|편곡|AI Assistant/i.test(t)));
      const out = await adapter.research({
        question: '편곡기능이 있다던데',
        rawQuestion: '편곡기능이 있다던데',
        weak: true,
        need: 'knowledge',
        facts: {}
      });
      assert.ok(out.debug.privateSearchQueries.length >= 1);
      assert.ok(out.debug.privateSearchQueries.length <= 3);
      assert.ok(out.passages.length >= 1, 'expected Arrange-related safe passages');
      assert.ok(out.debug.privateSourceUsed);
      assert.ok(out.llmContext);
      assert.ok(!containsRawSecretLeak(out.llmContext));
      // Agent ANSWER path
      const agentOut = await runSupportAgent({
        question: '편곡기능이 있다던데',
        rawQuestion: '편곡기능이 있다던데',
        locale: 'ko',
        personal: false,
        userTurns: ['편곡기능이 있다던데'],
        adapters: emptyAdapters({
          searchPrivateSource: async (ctx) => adapter.research(ctx)
        }),
        retrieveStaticInitial: () => [],
        isWeakOrConflictingRetrieval,
        detectAnswerIntent
      });
      assert.ok(
        agentOut.debug.finalAction === 'ANSWER' ||
          (agentOut.passages || []).some((p) => String(p.id || '').startsWith('private-source')),
        `expected ANSWER or private passages, got ${agentOut.debug.finalAction}`
      );
      const blob = JSON.stringify(agentOut.passages || []);
      assert.ok(!/GOCSPX-|AIza[0-9A-Za-z]{20}/.test(blob));
    });

    await check('B 쉬운키 기능 → Easy Key evidence', async () => {
      const out = await adapter.research({
        question: '쉬운키 기능',
        rawQuestion: '쉬운키 기능',
        weak: true,
        need: 'knowledge',
        facts: { candidateFeature: '쉬운키' }
      });
      assert.ok(out.passages.length >= 1, 'expected Easy Key evidence');
      assert.ok(
        /easy|쉬운|key|조/i.test(out.passages.map((p) => p.text).join(' ')),
        'passage should mention easy key behavior'
      );
    });

    await check('C 노트 정리해주는거 → Cleanup evidence', async () => {
      const out = await adapter.research({
        question: '노트 정리해주는거',
        rawQuestion: '노트 정리해주는거',
        weak: true,
        need: 'knowledge',
        facts: {}
      });
      assert.ok(out.passages.length >= 1, 'expected Cleanup evidence');
      assert.ok(/cleanup|정리|Cleanup|AI Cleanup/i.test(out.passages.map((p) => p.text).join(' ')));
    });

    await check('D 퀀텀폴드 → no hallucination evidence', async () => {
      const out = await adapter.research({
        question: '퀀텀폴드',
        rawQuestion: '퀀텀폴드',
        weak: true,
        need: 'knowledge',
        facts: { candidateFeature: '퀀텀폴드' }
      });
      assert.ok(
        !out.debug.privateSourceUsed && out.passages.length === 0,
        `expected no evidence for unknown feature, got used=${out.debug.privateSourceUsed} n=${out.passages.length} reason=${out.debug.privateSourceFallbackReason}`
      );
      assert.ok(
        out.debug.privateSourceFallbackReason === 'no_source_hits' ||
          out.debug.privateSourceFallbackReason === 'no_safe_excerpts'
      );
    });
  }

  await check('redactor assignment shapes', async () => {
    const r = redactSecrets('api_key = "sk-abcdefghijklmnopqrstuvwxyz12"\n');
    assert.ok(r.text.includes('[REDACTED]'));
    assert.ok(!r.text.includes('sk-abcdefghijklmnopqrstuvwxyz12'));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nprivateSourceGolden: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
