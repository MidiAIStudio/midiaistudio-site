/**
 * MidiAI Studio site theme (system / light / dark).
 * Preference persisted in localStorage midiai_theme.
 */
'use strict';

const THEME_KEY = 'midiai_theme';
const VALID = new Set(['system', 'light', 'dark']);

function readPreference() {
  try {
    const v = String(localStorage.getItem(THEME_KEY) || '').toLowerCase();
    return VALID.has(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function writePreference(pref) {
  const v = VALID.has(pref) ? pref : 'system';
  try {
    localStorage.setItem(THEME_KEY, v);
  } catch {
    /* ignore */
  }
  return v;
}

function systemTheme() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {
    /* ignore */
  }
  return 'dark';
}

function resolveEffective(pref = readPreference()) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemTheme();
}

function updateThemeColorMeta(effective) {
  const color = effective === 'light' ? '#e8ecf3' : '#0b1020';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

function applyTheme(pref = readPreference()) {
  const preference = VALID.has(pref) ? pref : 'system';
  const effective = resolveEffective(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme-preference', preference);
  root.setAttribute('data-theme', effective);
  root.style.colorScheme = effective;
  updateThemeColorMeta(effective);
  window.__MIDIAI_THEME_PREF__ = preference;
  window.__MIDIAI_THEME__ = effective;
  try {
    window.dispatchEvent(
      new CustomEvent('midiai:theme', { detail: { preference, effective } })
    );
  } catch {
    /* ignore */
  }
  return { preference, effective };
}

function setThemePreference(pref) {
  const preference = writePreference(pref);
  return applyTheme(preference);
}

let mediaBound = false;
function bindSystemListener() {
  if (mediaBound || typeof window === 'undefined' || !window.matchMedia) return;
  mediaBound = true;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => {
    if (readPreference() === 'system') applyTheme('system');
  };
  try {
    mq.addEventListener('change', onChange);
  } catch {
    try {
      mq.addListener(onChange);
    } catch {
      /* ignore */
    }
  }
}

function initTheme() {
  applyTheme(readPreference());
  bindSystemListener();
}

export {
  THEME_KEY,
  readPreference,
  writePreference,
  resolveEffective,
  applyTheme,
  setThemePreference,
  initTheme,
  systemTheme
};
