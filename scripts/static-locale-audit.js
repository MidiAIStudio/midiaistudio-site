'use strict';
/**
 * EN/JA Hangul residual audit — classify by content SOURCE.
 *
 * Translation error (FAIL): site static UI copy still in Korean
 *   navigation, hero, CTA, feature/workflow copy, buttons/labels,
 *   system chrome, static product/feature descriptions.
 *
 * NOT a translation error (OK):
 *   CMS / board / UGC — notice title/body, free board, tickets,
 *   usernames, admin-authored posts, other user data.
 *   Korean notices on EN/JA home are policy-OK.
 *
 * Never FAIL solely because document.body contains Hangul.
 */

const HANGUL = /[\uAC00-\uD7A3]/;

/** Containers whose Hangul is dynamic / user / CMS content (never FAIL). */
const DYNAMIC_OK_SELECTORS = [
  '#homeUpdates',
  '#homePatches',
  '#announcementList',
  '#patchList',
  '#boardList',
  '#faqList',
  '#ticketDetail',
  '#ticketList',
  '#myTicketList',
  '#notifyList',
  '#guideDetail',
  '#guideBody',
  '[data-i18n-skip]',
  '.board-post',
  '.board-post-body',
  '.board-post-title',
  '.hub-post-detail',
  '.hub-post-body',
  '.ticket-replies',
  '.ticket-thread',
  '.notify-item',
  '.notify-list',
  '.author-name',
  '.user-name',
  '.profile-name',
  '.account-display-name',
  '.comment-body',
  '.comment-author',
  // Language switcher chrome intentionally skipped by i18n walker
  '#topbarLangWrap',
  '#topbarLangMenu',
];

/**
 * Static UI regions — Hangul here on EN/JA = translation FAIL.
 * Hero H1/lead are included via .portal-hero.
 */
const STATIC_UI_ROOT_SELECTORS = [
  '.portal-hero',
  '.portal-hero-copy',
  '.portal-lead',
  '.portal-cta',
  '.portal-pill',
  '.studio-anim',
  '#mainNav',
  'header.topbar',
  '.topbar-page',
  '.sidebar-primary',
  '.sidebar-label',
  '.sidebar-nav',
  '.home-support',
  '.home-support-lead',
  '.home-support-card',
  '.home-panel-head',
  '.home-panel-link',
  '.home-workflow',
  '.feature-grid',
  '.workflow-cards',
  'footer.site-footer',
  '.footer-nav',
  '.footer-links',
];

/** Explicit leaf targets (extra precision / reporting). */
const STATIC_FAIL_SELECTORS = [
  '.portal-hero h1',
  '.portal-lead',
  '.portal-cta',
  '.portal-cta a',
  '.sidebar-primary',
  '.sidebar-label',
  '.topbar-page',
  '.home-support-lead',
  '.home-support-card > strong',
  '.home-support-card > span:not(.home-support-kicker)',
  '.home-panel-head h2',
  '.home-panel-link',
  '[data-nav]',
  '[data-hub]',
  'header.topbar .actions button',
  'header.topbar .login',
  'header.topbar .ghost:not(#langBtn)',
];

function closestMatch(el, selectors) {
  if (!el || !el.closest) return null;
  for (const sel of selectors) {
    try {
      const hit = el.closest(sel);
      if (hit) return { sel, el: hit };
    } catch (_) {
      /* invalid selector in older engines — ignore */
    }
  }
  return null;
}

function isInsideDynamic(el) {
  return !!closestMatch(el, DYNAMIC_OK_SELECTORS);
}

function isInsideStaticUi(el) {
  if (closestMatch(el, STATIC_FAIL_SELECTORS)) return true;
  if (closestMatch(el, STATIC_UI_ROOT_SELECTORS)) return true;
  // Semantic chrome tags outside dynamic islands
  if (el.closest?.('nav#mainNav, header.topbar, .portal-hero, .portal-cta')) return true;
  return false;
}

function normalizeText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify every visible Hangul-bearing text node.
 * @returns {{
 *   fail: Array<{source:'static_ui', sel:string, text:string}>,
 *   dynamicOk: Array<{source:'dynamic', sel:string, text:string}>,
 *   other: Array<{source:'other', text:string}>,
 *   failCount: number,
 *   policy: string
 * }}
 */
function auditStaticHangul(root = typeof document !== 'undefined' ? document : null) {
  const fail = [];
  const dynamicOk = [];
  const other = [];
  if (!root) {
    return {
      fail,
      dynamicOk,
      other,
      failCount: 0,
      ignoredDynamic: [],
      policy: 'static_ui_fail_dynamic_ok_no_whole_body_fail',
    };
  }

  const doc = root.ownerDocument || (root.nodeType === 9 ? root : typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createTreeWalker !== 'function') {
    return {
      fail,
      dynamicOk,
      other,
      failCount: 0,
      ignoredDynamic: [],
      policy: 'static_ui_fail_dynamic_ok_no_whole_body_fail',
      error: 'no_document',
    };
  }

  const scope = root.body || (root.nodeType === 1 ? root : doc.body);
  if (!scope) {
    return {
      fail,
      dynamicOk,
      ignoredDynamic: [],
      other,
      failCount: 0,
      policy: 'static_ui_fail_dynamic_ok_no_whole_body_fail',
    };
  }

  const NF = typeof NodeFilter !== 'undefined' ? NodeFilter : { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 };
  const walker = doc.createTreeWalker(scope, NF.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NF.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'OPTION', 'CODE', 'PRE'].includes(tag)) {
        return NF.FILTER_REJECT;
      }
      if (!node.nodeValue || !HANGUL.test(node.nodeValue)) return NF.FILTER_REJECT;
      return NF.FILTER_ACCEPT;
    },
  });

  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const text = normalizeText(node.nodeValue);
    if (!text || text.length < 1) continue;
    const key = `${parent?.tagName || ''}:${text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const dyn = closestMatch(parent, DYNAMIC_OK_SELECTORS);
    if (dyn) {
      dynamicOk.push({ source: 'dynamic', sel: dyn.sel, text: text.slice(0, 120) });
      continue;
    }

    if (isInsideStaticUi(parent)) {
      const st =
        closestMatch(parent, STATIC_FAIL_SELECTORS) ||
        closestMatch(parent, STATIC_UI_ROOT_SELECTORS) ||
        { sel: (parent.tagName || '').toLowerCase() };
      fail.push({ source: 'static_ui', sel: st.sel, text: text.slice(0, 120) });
      continue;
    }

    // Not chrome, not known CMS island — do not FAIL (avoids whole-page Hangul false positives).
    other.push({ source: 'other', text: text.slice(0, 120) });
  }

  return {
    fail,
    dynamicOk,
    ignoredDynamic: dynamicOk.map((d) => d.text),
    other,
    failCount: fail.length,
    policy: 'static_ui_fail_dynamic_ok_no_whole_body_fail',
  };
}

/** Browser E2E helper: true only when static UI still has Hangul (notices alone → false). */
function hasStaticUiHangulLeak(root) {
  return auditStaticHangul(root).failCount > 0;
}

function attachBrowserGlobal() {
  if (typeof window === 'undefined') return;
  window.__MIDIAI_STATIC_HANGUL_AUDIT__ = {
    auditStaticHangul,
    hasStaticUiHangulLeak,
    HANGUL,
    DYNAMIC_OK_SELECTORS,
    STATIC_UI_ROOT_SELECTORS,
    STATIC_FAIL_SELECTORS,
  };
}

attachBrowserGlobal();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    auditStaticHangul,
    hasStaticUiHangulLeak,
    HANGUL,
    DYNAMIC_OK_SELECTORS,
    STATIC_UI_ROOT_SELECTORS,
    STATIC_FAIL_SELECTORS,
    isInsideDynamic,
    isInsideStaticUi,
  };
}
