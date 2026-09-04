'use strict';

const CUSTOMER_SAFE_SYSTEM_RULES = [
  'Do not quote or paste source code to the customer.',
  'Do not mention source file paths, repositories, or line numbers.',
  'Do not expose internal function, class, module, or Firebase collection names.',
  'Do not expose credential, env, API key, OAuth, or secret names or values.',
  'Do not expose private endpoints, admin operations, or raw payment identifiers.',
  'Rewrite findings as user-facing product behavior, usage steps, or troubleshooting.',
  'Never say "코드 분석", "source code", "GitHub", "repository", or "from the codebase" to the customer.',
  'Never list localization keys (midi_ai_*, score_editor_*) or JSON key/value dumps.'
];

const PATH_LEAK_RE =
  /\b(?:run_gui\.py|core\/[A-Za-z0-9_./\-]+\.py|ui\/[A-Za-z0-9_./\-]+\.py|score_editor(?:_v2)?\/|C:\\MidiAI|GitHub\/MidiAI|\/support_ai_gateway\/|MidiAI-Studio)\b/gi;
const INTERNAL_ID_RE =
  /\b(?:FIREBASE_API_KEY|GOOGLE_OAUTH_CLIENT_SECRET|CLIENT_SECRET|process\.env|firestore\.googleapis|licenses\/\{uid\}|collection\(|onRequest\()\b/gi;
const SECRET_SHAPE_RE = /\b(?:AIza[0-9A-Za-z_\-]{10,}|GOCSPX-[0-9A-Za-z_\-]{8,}|sk-[A-Za-z0-9]{10,})\b/g;
const GITHUB_LEAK_RE = /\b(?:github\.com|GitHub App|installation token|private source|repo-cleanup-support-ai|\bGitHub\b)\b/gi;
const LOC_KEY_RE = /\b(?:midi_ai_|score_editor_|studio_|convert_mode_|wizard_|launcher_)[a-z0-9_]+\b/i;
const JSON_KV_RE = /"[a-z0-9_]+"\s*:\s*"/gi;
const CODE_SHAPE_RE = /\b(?:def |class |const |let |var |function |export )\w+/i;

function looksLikeSourceDump(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  if (LOC_KEY_RE.test(s)) return true;
  LOC_KEY_RE.lastIndex = 0;
  const kv = s.match(JSON_KV_RE);
  JSON_KV_RE.lastIndex = 0;
  if (kv && kv.length >= 3) return true;
  if (CODE_SHAPE_RE.test(s)) return true;
  if (/score_editor_palette|barline|palette_lines/i.test(s)) return true;
  if ((s.match(/midi_ai_/gi) || []).length >= 2) return true;
  return false;
}

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
  if (looksLikeSourceDump(text)) return false;
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
  customerAnswerIsSafe,
  looksLikeSourceDump
};
