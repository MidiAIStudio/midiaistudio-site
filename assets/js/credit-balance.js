/**
 * Zero-safe credit balance extraction for MidiAI Studio web.
 * Prefer ``balance`` (admin + Python authorize SoT) over ``creditBalance`` mirror.
 */
export function extractCreditBalance(payload, fallback = null) {
  if (!payload || typeof payload !== 'object') return fallback;
  if (Object.prototype.hasOwnProperty.call(payload, 'balance') && payload.balance != null && payload.balance !== '') {
    const n = Number(payload.balance);
    return Number.isFinite(n) ? n : fallback;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'creditBalance') && payload.creditBalance != null && payload.creditBalance !== '') {
    const n = Number(payload.creditBalance);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Resolve display balance when a fresh payload and a cached value compete.
 * ``0`` is a valid authoritative value and must not fall back to cache.
 */
export function resolveCreditBalance(payload, cached = null) {
  const extracted = extractCreditBalance(payload, null);
  if (extracted != null) return extracted;
  if (cached == null || cached === '') return null;
  const n = Number(cached);
  return Number.isFinite(n) ? n : null;
}
