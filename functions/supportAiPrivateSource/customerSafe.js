'use strict';

const CUSTOMER_SAFE_SYSTEM_RULES = [
  'Do not quote or paste source code to the customer.',
  'Do not mention source file paths, repositories, or line numbers.',
  'Do not expose internal function, class, module, or Firebase collection names.',
  'Do not expose credential, env, API key, OAuth, or secret names or values.',
  'Do not expose private endpoints, admin operations, or raw payment identifiers.',
  'Rewrite findings as user-facing product behavior, usage steps, or troubleshooting.',
  'Never say "코드 분석", "source code", "GitHub", "repository", or "from the codebase" to the customer.'
];

const PATH_LEAK_RE =
  /\b(?:run_gui\.py|core\/[A-Za-z0-9_./\-]+\.py|ui\/[A-Za-z0-9_./\-]+\.py|score_editor(?:_v2)?\/|C:\\MidiAI|GitHub\/MidiAI|\/support_ai_gateway\/|MidiAI-Studio)\b/gi;
const INTERNAL_ID_RE =
  /\b(?:FIREBASE_API_KEY|GOOGLE_OAUTH_CLIENT_SECRET|CLIENT_SECRET|process\.env|firestore\.googleapis|licenses\/\{uid\}|collection\(|onRequest\()\b/gi;
const SECRET_SHAPE_RE = /\b(?:AIza[0-9A-Za-z_\-]{10,}|GOCSPX-[0-9A-Za-z_\-]{8,}|sk-[A-Za-z0-9]{10,})\b/g;
const GITHUB_LEAK_RE = /\b(?:github\.com|GitHub App|installation token|private source|repo-cleanup-support-ai|\bGitHub\b)\b/gi;

function sanitizeCustomerAnswer(text) {
  if (!text) return '';
  let out = String(text);
  out = out.replace(SECRET_SHAPE_RE, '[REDACTED]');
  out = out.replace(PATH_LEAK_RE, '[internal]');
  out = out.replace(INTERNAL_ID_RE, '[internal]');
  out = out.replace(GITHUB_LEAK_RE, '[internal]');
  out = out.replace(/\b_[A-Za-z][A-Za-z0-9_]{2,}\b/g, '[internal]');
  return out;
}

function customerAnswerIsSafe(text, extraForbidden) {
  if (!text) return true;
  if (SECRET_SHAPE_RE.test(text)) return false;
  SECRET_SHAPE_RE.lastIndex = 0;
  if (PATH_LEAK_RE.test(text)) return false;
  PATH_LEAK_RE.lastIndex = 0;
  if (INTERNAL_ID_RE.test(text)) return false;
  INTERNAL_ID_RE.lastIndex = 0;
  if (GITHUB_LEAK_RE.test(text)) return false;
  GITHUB_LEAK_RE.lastIndex = 0;
  for (const item of extraForbidden || []) {
    if (item && String(text).includes(item)) return false;
  }
  return true;
}

module.exports = {
  CUSTOMER_SAFE_SYSTEM_RULES,
  sanitizeCustomerAnswer,
  customerAnswerIsSafe
};
