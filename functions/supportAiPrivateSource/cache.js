'use strict';

/**
 * Tiny TTL cache. Never store credentials or raw secret values.
 */
function createTtlCache({ ttlMs = 5 * 60 * 1000, maxEntries = 200 } = {}) {
  const map = new Map();

  function get(key) {
    const hit = map.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function set(key, value) {
    if (map.size >= maxEntries) {
      const first = map.keys().next().value;
      map.delete(first);
    }
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function clear() {
    map.clear();
  }

  function invalidatePrefix(prefix) {
    for (const k of [...map.keys()]) {
      if (String(k).startsWith(prefix)) map.delete(k);
    }
  }

  return { get, set, clear, invalidatePrefix };
}

module.exports = { createTtlCache };
