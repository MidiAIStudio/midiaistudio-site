'use strict';

/** KRW per 1 USD. Cached in Firestore; never a live hardcoded rate. */
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FX_DOC = { collection: 'system', id: 'fxUsdKrw' };
const FX_PROVIDER = 'open.er-api.com';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_UNAVAILABLE_MESSAGE = '환율 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

function krwToUsd(krwAmount, krwPerUsd) {
  const krw = Number(krwAmount);
  const rate = Number(krwPerUsd);
  if (!Number.isFinite(krw) || krw < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((krw / rate) * 100) / 100;
}

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
}

function usdAmountsMatch(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

function unavailable(detail) {
  return {
    ok: false,
    code: 'FX_UNAVAILABLE',
    message: FX_UNAVAILABLE_MESSAGE,
    detail: detail || ''
  };
}

async function fetchLiveUsdKrw(fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  const res = await fetchFn(FX_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data && data.rates && data.rates.KRW);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX_INVALID_RATE');
  return {
    rate,
    source: FX_PROVIDER,
    fetchedAt: data.time_last_update_utc || new Date().toISOString()
  };
}

function readCachedRate(data) {
  if (!data) return null;
  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  let fetchedAt = null;
  if (typeof data.fetchedAt === 'string') fetchedAt = new Date(data.fetchedAt);
  else if (data.updatedAt && typeof data.updatedAt.toDate === 'function') fetchedAt = data.updatedAt.toDate();
  else if (data.updatedAt && Number.isFinite(Number(data.updatedAt))) fetchedAt = new Date(Number(data.updatedAt));
  return {
    rate,
    source: data.source || 'cache',
    fetchedAt: fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt.toISOString() : '',
    fetchedAtMs: fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt.getTime() : 0
  };
}

/**
 * Authoritative USD/KRW rate. Options.injectRate is for unit tests only.
 * HTTP clients must never supply the rate.
 */
async function getUsdKrwRate(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  if (options.injectRate != null && options.injectRate !== '') {
    const injected = Number(options.injectRate);
    if (!Number.isFinite(injected) || injected <= 0) return unavailable('inject');
    return {
      ok: true,
      rate: injected,
      source: 'inject',
      fetchedAt: now.toISOString(),
      cache: 'inject'
    };
  }

  const ref = db && db.collection(FX_DOC.collection).doc(FX_DOC.id);
  let cached = null;
  if (ref) {
    try {
      const snap = await ref.get();
      if (snap.exists) cached = readCachedRate(snap.data() || {});
    } catch (err) {
      console.warn('fx cache read failed', err);
    }
  }

  const fresh = cached && cached.fetchedAtMs && (now.getTime() - cached.fetchedAtMs) < FX_CACHE_TTL_MS;
  if (fresh) {
    return {
      ok: true,
      rate: cached.rate,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      cache: 'hit'
    };
  }

  try {
    const live = await fetchLiveUsdKrw(options.fetchImpl);
    if (ref) {
      try {
        await ref.set({
          rate: live.rate,
          source: live.source,
          fetchedAt: live.fetchedAt,
          updatedAt: now
        }, { merge: true });
      } catch (err) {
        console.warn('fx cache write failed', err);
      }
    }
    return { ok: true, rate: live.rate, source: live.source, fetchedAt: live.fetchedAt, cache: 'live' };
  } catch (err) {
    console.warn('fx fetch failed', err);
    if (cached && cached.rate > 0) {
      return {
        ok: true,
        rate: cached.rate,
        source: cached.source || 'cache-stale',
        fetchedAt: cached.fetchedAt,
        cache: 'stale',
        warning: String(err.message || err)
      };
    }
    return unavailable(String(err.message || err));
  }
}

module.exports = {
  FX_CACHE_TTL_MS,
  FX_UNAVAILABLE_MESSAGE,
  krwToUsd,
  krwToUsd: krwToUsd,
  formatUsd,
  usdAmountsMatch,
  usdAmountsEqual: usdAmountsMatch,
  usdAmountsEqual: usdAmountsMatch,
  getUsdKrwRate,
  getUsdKrwRate: getUsdKrwRate,
  fetchLiveUsdKrw
};
