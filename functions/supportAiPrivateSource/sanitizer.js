'use strict';

const { REDACTED } = require('./redactor');

function sanitizeInternalData(text) {
  if (!text) return { text: '', changeCount: 0, categories: [] };
  let out = String(text);
  let n = 0;
  const cats = new Set();

  function apply(re, repl, cat) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const cre = new RegExp(re.source, flags);
    const next = out.replace(cre, (...args) => {
      n += 1;
      cats.add(cat);
      return typeof repl === 'function' ? repl(...args) : repl;
    });
    out = next;
  }

  apply(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, REDACTED, 'email');
  apply(/[A-Za-z]:\\(?:Users|users)\\[^\s'"\\]+(?:\\[^\s'"]*)?/g, '[REDACTED_USER_PATH]', 'local_path');
  apply(/\/(?:home|Users)\/[A-Za-z0-9._\-]+(?:\/[^\s'"]*)?/g, '[REDACTED_USER_PATH]', 'local_path');
  apply(
    /\b(?:uid|user_id|userId)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{6,}['"]?/gi,
    'uid=[REDACTED]',
    'uid'
  );
  apply(
    /\b(?:hwid|HWID|device[_-]?id)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{6,}['"]?/gi,
    'hwid=[REDACTED]',
    'hwid'
  );
  apply(
    /\b(session[_-]?id|access[_-]?token|refresh[_-]?token|id[_-]?token)\s*[:=]\s*['"][^'"]+['"]/gi,
    (m, k) => `${k} = "${REDACTED}"`,
    'session_token'
  );
  apply(
    /\b(?:payment_id|order_id|transaction_id|imp_uid|merchant_uid)\s*[:=]\s*['"][^'"]+['"]/gi,
    'payment_id=[REDACTED]',
    'payment_id'
  );
  apply(
    /\b(?:admin_uid|adminId|operator_id)\s*[:=]\s*['"][^'"]+['"]/gi,
    'admin_id=[REDACTED]',
    'admin_id'
  );
  apply(/([?&](?:key|token|secret|access_token)=)([^&\s'"#]+)/gi, `$1${REDACTED}`, 'private_query');

  return { text: out, changeCount: n, categories: [...cats].sort() };
}

module.exports = { sanitizeInternalData };
