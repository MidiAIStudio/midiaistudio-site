/**
 * Early theme bootstrap (sync, head) — prevents dark FOUC when preference is light.
 * Preference: midiai_theme = system | light | dark (default system).
 * Effective: html[data-theme="light"|"dark"], html[data-theme-preference="..."]
 */
(function () {
  'use strict';
  var KEY = 'midiai_theme';
  var VALID = { system: 1, light: 1, dark: 1 };

  function readPref() {
    try {
      var v = String(localStorage.getItem(KEY) || '').toLowerCase();
      return VALID[v] ? v : 'system';
    } catch (_) {
      return 'system';
    }
  }

  function systemTheme() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (_) {}
    return 'dark';
  }

  function resolve(pref) {
    return pref === 'light' || pref === 'dark' ? pref : systemTheme();
  }

  function apply(pref, effective) {
    var root = document.documentElement;
    try {
      root.setAttribute('data-theme-preference', pref);
      root.setAttribute('data-theme', effective);
      root.style.colorScheme = effective;
    } catch (_) {}
    try {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      var color = effective === 'light' ? '#e8ecf3' : '#0b1020';
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', color);
    } catch (_) {}
  }

  var pref = readPref();
  var effective = resolve(pref);
  window.__MIDIAI_THEME_PREF__ = pref;
  window.__MIDIAI_THEME__ = effective;
  apply(pref, effective);
})();
