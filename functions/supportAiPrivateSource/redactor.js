'use strict';

const REDACTED = '[REDACTED]';

const SECRET_KEY_NAMES =
  'client_secret|CLIENT_SECRET|oauth_client_secret|GOOGLE_OAUTH_CLIENT_SECRET|' +
  'api[_-]?key|API[_-]?KEY|FIREBASE_API_KEY(?:_DEFAULT)?|' +
  'access[_-]?token|refresh[_-]?token|id[_-]?token|bearer|' +
  'password|passwd|pwd|secret|token|' +
  'private[_-]?key|PRIVATE_KEY|' +
  'dropbox[_-]?token|DROPBOX|' +
  'paypal[_-]?client[_-]?secret|portone[_-]?api[_-]?secret|kakao[_-]?secret|' +
  'authorization|AUTH_HEADER|' +
  'service[_-]?account|credentials';

const VALUE_PATTERNS = [
  ['google_api_key', /\bAIza[0-9A-Za-z_\-]{20,}\b/g],
  ['oauth_gocspx', /\bGOCSPX-[0-9A-Za-z_\-]{10,}\b/g],
  ['openai_sk', /\bsk-[A-Za-z0-9]{20,}\b/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9\-_\.=]{12,}/gi],
  [
    'pem_block',
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g
  ],
  ['aws_like', /\bAKIA[0-9A-Z]{16}\b/g]
];

function redactNamedAssignments(text) {
  let count = 0;
  const cats = new Set();
  let out = text;

  const assignRe = new RegExp(
    `(^|\\n)([ \\t]*(?:const|let|var)?[ \\t]*(?:export[ \\t]+)?(${SECRET_KEY_NAMES})[ \\t]*[=:][ \\t]*)(['"])([\\s\\S]*?)\\4`,
    'gim'
  );
  out = out.replace(assignRe, (m, lead, prefix, _key, q) => {
    count += 1;
    cats.add('named_assignment');
    return `${lead}${prefix}${q}${REDACTED}${q}`;
  });

  const jsonRe = new RegExp(
    `("(${SECRET_KEY_NAMES})"\\s*:\\s*)(['"])([\\s\\S]*?)\\3`,
    'gi'
  );
  out = out.replace(jsonRe, (m, prefix, _key, q) => {
    count += 1;
    cats.add('json_secret_field');
    return `${prefix}${q}${REDACTED}${q}`;
  });

  out = out.replace(
    /(Authorization\s*[:=]\s*)(['"]?)(Bearer\s+)([^\s'"]+)(['"]?)/gi,
    (m, p1, q1, bearer, _tok, q2) => {
      count += 1;
      cats.add('authorization_header');
      return `${p1}${q1 || ''}${bearer}${REDACTED}${q2 || ''}`;
    }
  );

  const envRe = new RegExp(
    `^([ \\t]*(?:export[ \\t]+)?)(${SECRET_KEY_NAMES})=(\\S+)`,
    'gim'
  );
  out = out.replace(envRe, (m, prefix, key, val) => {
    if (val === REDACTED || val === 'null' || val === 'None') return m;
    count += 1;
    cats.add('env_assignment');
    return `${prefix}${key}=${REDACTED}`;
  });

  return { text: out, count, cats };
}

function redactSecrets(text) {
  if (!text) return { text: '', redactionCount: 0, categories: [] };
  let out = String(text);
  let total = 0;
  const cats = new Set();

  const named = redactNamedAssignments(out);
  out = named.text;
  total += named.count;
  for (const c of named.cats) cats.add(c);

  for (const [name, re] of VALUE_PATTERNS) {
    out = out.replace(re, () => {
      total += 1;
      cats.add(name);
      if (name === 'pem_block') {
        return `-----BEGIN PRIVATE KEY-----\n${REDACTED}\n-----END PRIVATE KEY-----`;
      }
      if (name === 'bearer') return `Bearer ${REDACTED}`;
      return REDACTED;
    });
  }

  return { text: out, redactionCount: total, categories: [...cats].sort() };
}

function containsRawSecretLeak(text, probes) {
  if (!text) return false;
  if (Array.isArray(probes)) {
    for (const p of probes) {
      if (p && p !== REDACTED && String(text).includes(p)) return true;
    }
  }
  for (const [, re] of VALUE_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const cre = new RegExp(re.source, flags);
    if (cre.test(text)) return true;
  }
  return false;
}

module.exports = {
  REDACTED,
  redactSecrets,
  containsRawSecretLeak
};
