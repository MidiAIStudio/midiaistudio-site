'use strict';
/**
 * Print Hangul classification policy + self-check the audit module loads.
 * Live EN/JA PASS/FAIL must run in-browser AFTER applyStaticI18n(), e.g.:
 *
 *   const { auditStaticHangul } = await import('/scripts/static-locale-audit.js');
 *   // or inject script then:
 *   const r = window.__MIDIAI_STATIC_HANGUL_AUDIT__.auditStaticHangul();
 *   // r.failCount === 0  → no static UI Hangul leak
 *   // r.dynamicOk        → notices/CMS Hangul (policy OK)
 *
 * Do NOT use /[가-힣]/.test(document.body.innerText) as a FAIL gate.
 */
const path = require('path');
const audit = require(path.join(__dirname, 'static-locale-audit.js'));

console.log('policy:', 'static_ui_fail_dynamic_ok_no_whole_body_fail');
console.log('dynamic_ok_selectors:', audit.DYNAMIC_OK_SELECTORS.length);
console.log('static_ui_roots:', audit.STATIC_UI_ROOT_SELECTORS.length);
console.log('static_fail_selectors:', audit.STATIC_FAIL_SELECTORS.length);
console.log('exports_ok:', typeof audit.auditStaticHangul === 'function');
console.log(
  'reminder: body-wide Hangul must NOT fail; only static UI regions (hero/nav/CTA/…) fail.'
);
