const PREFIX = 'midiai_md_draft:';

export function draftKey(...parts) {
  return PREFIX + parts.filter(Boolean).join(':');
}

export function saveDraft(key, value) {
  if (!key) return;
  try {
    const payload = { value: String(value ?? ''), savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn('draft save failed', e);
  }
}

export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.value !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearDraft(key) {
  if (!key) return;
  try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
}

export function createDraftAutosave(key, getValue, { delay = 800 } = {}) {
  let timer = null;
  const flush = () => {
    timer = null;
    if (!key) return;
    saveDraft(key, getValue());
  };
  const touch = () => {
    if (!key) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };
  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };
  return { touch, flush, stop };
}
