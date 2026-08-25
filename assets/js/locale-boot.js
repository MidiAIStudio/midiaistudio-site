/**
 * Early locale bootstrap (sync, head).
 * Priority: saved midiai_lang → browser → cached country → ko
 * Redirects home/purchase to the matching locale URL before body paint.
 * Does not force language from IP/country alone.
 */
(function () {
  'use strict';
  var LANG_KEY = 'midiai_lang';
  var COUNTRY_KEY = 'midiai_country';
  var LOCALES = { ko: 1, en: 1, ja: 1 };

  function normLang(v) {
    var s = String(v || '').toLowerCase().replace(/_/g, '-');
    if (LOCALES[s]) return s;
    var primary = s.split('-')[0];
    return LOCALES[primary] ? primary : '';
  }

  function savedLang() {
    try {
      return normLang(localStorage.getItem(LANG_KEY));
    } catch (_) {
      return '';
    }
  }

  function browserLang() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        for (var i = 0; i < navigator.languages.length; i++) list.push(navigator.languages[i]);
      }
    } catch (_) {}
    try {
      if (navigator.language) list.push(navigator.language);
    } catch (_) {}
    for (var j = 0; j < list.length; j++) {
      var hit = normLang(list[j]);
      if (hit) return hit;
    }
    return '';
  }

  function countryLang() {
    var code = '';
    try {
      code = String(localStorage.getItem(COUNTRY_KEY) || '').trim().toUpperCase();
    } catch (_) {}
    if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ' || code === 'XX') return '';
    if (code === 'JP') return 'ja';
    if (code === 'KR' || code === 'KP') return 'ko';
    if (
      code === 'US' || code === 'GB' || code === 'AU' || code === 'CA' ||
      code === 'NZ' || code === 'IE' || code === 'SG' || code === 'PH' ||
      code === 'IN' || code === 'ZA' || code === 'MY'
    ) return 'en';
    return '';
  }

  function preferredLang() {
    return savedLang() || browserLang() || countryLang() || 'ko';
  }

  function pathLang(pathname) {
    var p = String(pathname || '').toLowerCase();
    if (p.indexOf('/en/') !== -1 || /\/en$/i.test(p)) return 'en';
    if (p.indexOf('/ja/') !== -1 || /\/ja$/i.test(p)) return 'ja';
    if (p.indexOf('/ko/') !== -1 || /\/ko$/i.test(p)) return 'ko';
    return 'ko';
  }

  function isHomePath(pathname) {
    var p = String(pathname || '').replace(/\/+$/, '') || '/';
    var lower = p.toLowerCase();
    // Only site locale homes — not nested */index.html (e.g. /guide/index.html).
    return (
      lower === '' ||
      lower === '/' ||
      lower === '/index.html' ||
      lower === '/en' ||
      lower === '/en/index.html' ||
      lower === '/ja' ||
      lower === '/ja/index.html' ||
      lower === '/ko' ||
      lower === '/ko/index.html'
    );
  }

  function isPurchasePath(pathname) {
    var p = String(pathname || '').toLowerCase();
    if (/\/guide\//.test(p)) return false;
    return /purchase\.html$/i.test(p) || /\/purchase\/?$/i.test(p);
  }

  function homeHref(lang) {
    if (lang === 'en') return '/en/';
    if (lang === 'ja') return '/ja/';
    return '/';
  }

  function purchaseHref(lang, search) {
    var q = search || '';
    if (lang === 'en') return '/en/purchase.html' + q;
    if (lang === 'ja') return '/ja/purchase.html' + q;
    return '/purchase.html' + q;
  }

  function persistLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (_) {}
  }

  var path = location.pathname || '/';
  var current = pathLang(path);
  var hadSaved = !!savedLang();
  var preferred = preferredLang();
  // Persist first auto pick so next visit uses saved priority (never overwrite an existing choice).
  if (!hadSaved) persistLang(preferred);

  window.__MIDIAI_PREFERRED_LANG__ = preferred;
  window.__MIDIAI_PATH_LANG__ = current;

  try {
    document.documentElement.lang = preferred;
  } catch (_) {}

  var onLocaleHomeOrPurchase = isHomePath(path) || isPurchasePath(path);
  if (onLocaleHomeOrPurchase && current !== preferred) {
    var target = isPurchasePath(path)
      ? purchaseHref(preferred, location.search || '')
      : homeHref(preferred);
    location.replace(target);
    return;
  }

  // Prevent KO source flash until applyStaticI18n marks i18n-ready.
  if (preferred !== 'ko' || current === 'en' || current === 'ja') {
    try {
      document.documentElement.classList.add('locale-pending');
    } catch (_) {}
  }
})();
