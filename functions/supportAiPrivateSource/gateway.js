'use strict';

const { PRIVATE_SOURCE_CONFIG } = require('./config');
const { evaluatePath } = require('./pathGate');
const { redactSecrets } = require('./redactor');
const { sanitizeInternalData } = require('./sanitizer');
const { extractExcerpt, isProbablyBinary, truncatePacketBudget } = require('./excerpt');
const { CUSTOMER_SAFE_SYSTEM_RULES } = require('./customerSafe');

/**
 * Path gate → secret redaction → PII sanitize → bounded excerpt.
 * Raw source must never skip this before LLM context.
 */
function makeSafePacket(policy, filePath, bytes, hitLine) {
  const decision = evaluatePath(filePath, policy);
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, denied: true };
  }
  if (!bytes || !Buffer.isBuffer(bytes)) {
    return { ok: false, reason: 'empty_bytes' };
  }
  if (isProbablyBinary(decision.normalized, bytes)) {
    return { ok: false, reason: 'binary' };
  }
  if (bytes.length > 5_000_000) {
    return { ok: false, reason: 'too_large' };
  }
  const text = bytes.toString('utf8');
  const excerpt = extractExcerpt(text, {
    hitLine,
    contextLines: PRIVATE_SOURCE_CONFIG.contextLines,
    maxLines: PRIVATE_SOURCE_CONFIG.maxLinesPerFile
  });
  if (!excerpt.ok) return { ok: false, reason: excerpt.reason };

  const red = redactSecrets(excerpt.text);
  const san = sanitizeInternalData(red.text);
  return {
    ok: true,
    packet: {
      path: decision.normalized,
      startLine: excerpt.startLine,
      endLine: excerpt.endLine,
      hitLine: hitLine == null ? excerpt.startLine : Number(hitLine) || excerpt.startLine,
      safeText: san.text,
      pathReason: decision.reason,
      redactionCount: red.redactionCount,
      sanitizeCount: san.changeCount,
      redactionCategories: red.categories,
      sanitizeCategories: san.categories
    }
  };
}

function buildLlmContext(packets, policy) {
  const rules = CUSTOMER_SAFE_SYSTEM_RULES.concat(policy.customerSafeRules || []);
  const texts = [];
  for (let i = 0; i < packets.length; i += 1) {
    const p = packets[i];
    texts.push(
      `# SAFE_SOURCE_EXCERPT id=${i + 1} lines=${p.startLine}-${p.endLine}\n${p.safeText}`
    );
  }
  const truncated = truncatePacketBudget(texts, PRIVATE_SOURCE_CONFIG.maxTotalChars);
  const header =
    'You are using sanitized MidiAI Studio product source excerpts.\n' +
    'Follow customer-safe rules: do not quote code, paths, secrets, or internal identifiers.\n' +
    `Rules:\n- ${rules.join('\n- ')}\n`;
  return {
    llmContext: `${header}\n${truncated.join('\n\n')}`,
    systemRules: rules,
    safeExcerptChars: truncated.reduce((n, t) => n + t.length, 0)
  };
}

module.exports = {
  makeSafePacket,
  buildLlmContext,
  evaluatePath
};
