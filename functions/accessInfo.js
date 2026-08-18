/**
 * Login/session access metadata — Geo-IP from the request, never from
 * email / nickname / browser language.
 *
 * Writes users/{uid}.accessInfo via Admin SDK. Full IP is not persisted.
 */

const ACCESS_INFO_THROTTLE_MS = 30 * 60 * 1000;

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^255\./
];

function inPrivateV4Range(ip) {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function stripIpv4Mapped(ip) {
  const s = String(ip || '').trim().replace(/^\[|\]$/g, '');
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : s;
}

function isPrivateIp(ip) {
  const s = stripIpv4Mapped(ip);
  if (!s) return true;
  if (s === '::1' || s === 'localhost') return true;
  if (PRIVATE_V4.some((re) => re.test(s)) || inPrivateV4Range(s)) return true;
  if (/^(fc|fd)/i.test(s)) return true; // unique local IPv6
  if (/^fe80:/i.test(s)) return true;
  return false;
}

function maskIp(ip) {
  const s = stripIpv4Mapped(ip);
  if (!s) return '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    const p = s.split('.');
    return `${p[0]}.${p[1]}.***.***`;
  }
  if (s.includes(':')) {
    const raw = s.split(':');
    const first = raw[0] || '';
    const second = raw[1] || '';
    if (!first) return '****:****:****:****';
    return second ? `${first}:${second}:****:****:****:****` : `${first}:****:****:****:****`;
  }
  return '';
}

function normalizeCountryCode(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === 'ZZ' || cc === 'XX') return '';
  return cc;
}

function titleCity(city) {
  const s = String(city || '').trim().replace(/\+/g, ' ');
  if (!s || s === '?' || /^zz$/i.test(s)) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function countryNameFor(code, locale = 'ko') {
  const cc = normalizeCountryCode(code);
  if (!cc) return '';
  try {
    const loc = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko';
    const name = new Intl.DisplayNames([loc], { type: 'region' }).of(cc);
    return name && name !== cc ? name : cc;
  } catch {
    return cc;
  }
}

function parseGoogleGeoHeaders(headers = {}) {
  const h = headers || {};
  const countryCode = normalizeCountryCode(
    h['x-appengine-country'] || h['x-appengine-country'.toLowerCase()] || h['x-country-code']
  );
  const city = titleCity(h['x-appengine-city'] || h['x-appengine-region'] || '');
  return { countryCode, city };
}

function firstForwardedIp(value) {
  return String(value || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)[0] || '';
}

function pickClientIp(headers = {}, fallback = '') {
  const h = headers || {};
  const candidates = [
    h['x-appengine-user-ip'],
    h['x-forwarded-for'] && firstForwardedIp(h['x-forwarded-for']),
    h['fastly-client-ip'],
    h['x-real-ip'],
    fallback
  ];
  for (const c of candidates) {
    const ip = stripIpv4Mapped(c);
    if (ip && !isPrivateIp(ip)) return ip;
  }
  const any = stripIpv4Mapped(fallback);
  return any || '';
}

function accessUpdatedAtMs(prev) {
  if (!prev || prev.updatedAt == null) return 0;
  const v = prev.updatedAt;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') {
    const t = v.toDate().getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  return 0;
}

function shouldSkipAccessWrite(prev, nowMs, throttleMs = ACCESS_INFO_THROTTLE_MS) {
  if (!prev || typeof prev !== 'object') return false;
  const last = accessUpdatedAtMs(prev);
  if (!last) return false;
  return nowMs - last < throttleMs;
}

function normalizeLanguage(value) {
  const s = String(value || '').trim().slice(0, 32);
  if (!/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(s)) return '';
  return s.replace(/_/g, '-');
}

function normalizeClientType(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'app' || s === 'studio' || s === 'desktop') return 'app';
  return 'web';
}

function lookupGeoLite(ip) {
  if (!ip || isPrivateIp(ip)) return null;
  try {
    // Lazy load — keeps tests/header-only paths free of the DB.
    const geoip = require('geoip-lite');
    const r = geoip.lookup(ip);
    if (!r || !r.country) return null;
    return {
      countryCode: normalizeCountryCode(r.country),
      city: titleCity(r.city || r.region || '')
    };
  } catch {
    return null;
  }
}

/**
 * Country comes from Google/Firebase headers or Geo-IP of the request IP.
 * language / email / displayName must never influence country.
 */
function resolveGeo({ headers, ip, lookupGeo = lookupGeoLite }) {
  const fromHeader = parseGoogleGeoHeaders(headers);
  if (fromHeader.countryCode) {
    return { countryCode: fromHeader.countryCode, city: fromHeader.city, source: 'header' };
  }
  const looked = typeof lookupGeo === 'function' ? lookupGeo(ip) : null;
  if (looked && looked.countryCode) {
    return {
      countryCode: looked.countryCode,
      city: titleCity(looked.city || ''),
      source: 'geoip'
    };
  }
  return { countryCode: '', city: '', source: '' };
}

function buildAccessInfo({ headers, ip, language, clientType, lookupGeo }) {
  const geo = resolveGeo({ headers, ip, lookupGeo });
  const masked = ip && !isPrivateIp(ip) ? maskIp(ip) : '';
  const countryCode = geo.countryCode;
  return {
    countryCode: countryCode || '',
    countryName: countryCode ? countryNameFor(countryCode, 'ko') : '',
    city: geo.city || '',
    language: normalizeLanguage(language),
    clientType: normalizeClientType(clientType),
    lastIpMasked: masked
  };
}

async function recordUserAccessInfo(db, adminNs, decoded, req, lookupGeo) {
  const uid = decoded && decoded.uid;
  if (!uid) {
    throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  }
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data() || {}).accessInfo : null;
  if (shouldSkipAccessWrite(prev, Date.now())) {
    return { updated: false, throttled: true };
  }

  const ip = pickClientIp(req.headers || {}, req.ip || '');
  const body = req.body || {};
  const accessInfo = buildAccessInfo({
    headers: req.headers || {},
    ip,
    language: body.language,
    clientType: body.clientType,
    lookupGeo
  });

  await ref.set(
    {
      uid,
      accessInfo: {
        ...accessInfo,
        updatedAt: adminNs.firestore.FieldValue.serverTimestamp()
      }
    },
    { merge: true }
  );
  return { updated: true, throttled: false };
}

module.exports = {
  ACCESS_INFO_THROTTLE_MS,
  maskIp,
  isPrivateIp,
  pickClientIp,
  parseGoogleGeoHeaders,
  shouldSkipAccessWrite,
  normalizeCountryCode,
  normalizeLanguage,
  normalizeClientType,
  countryNameFor,
  resolveGeo,
  buildAccessInfo,
  recordUserAccessInfo
};
