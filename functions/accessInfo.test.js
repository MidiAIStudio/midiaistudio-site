/**
 * Unit tests for access-info helpers (no emulator).
 * Run: node accessInfo.test.js
 */
const assert = require('assert');
const {
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
  recordUserAccessInfo,
  ACCESS_INFO_THROTTLE_MS
} = require('./accessInfo');

function testMaskIp() {
  assert.strictEqual(maskIp('123.45.67.89'), '123.45.***.***');
  assert.strictEqual(maskIp('::ffff:123.45.67.89'), '123.45.***.***');
  assert.strictEqual(maskIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:****:****:****:****');
  assert.ok(!maskIp('8.8.8.8').includes('8.8.8.8'));
  assert.ok(!String(maskIp('8.8.8.8')).split('.').slice(2).some((p) => p !== '***' && /^\d+$/.test(p)));
  console.log('ok maskIp');
}

function testPrivateIp() {
  assert.strictEqual(isPrivateIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('10.0.0.1'), true);
  assert.strictEqual(isPrivateIp('192.168.0.1'), true);
  assert.strictEqual(isPrivateIp('172.16.0.1'), true);
  assert.strictEqual(isPrivateIp('172.31.255.255'), true);
  assert.strictEqual(isPrivateIp('8.8.8.8'), false);
  assert.strictEqual(isPrivateIp('123.45.67.89'), false);
  console.log('ok privateIp');
}

function testPickClientIp() {
  assert.strictEqual(
    pickClientIp({ 'x-forwarded-for': '123.45.67.89, 10.0.0.1' }, '127.0.0.1'),
    '123.45.67.89'
  );
  assert.strictEqual(
    pickClientIp({ 'x-forwarded-for': '10.0.0.1, 123.45.67.89, 35.191.0.2' }, '127.0.0.1'),
    '123.45.67.89'
  );
  assert.strictEqual(
    pickClientIp({ 'x-forwarded-for': '123.45.67.89, 35.191.0.2' }, '35.191.0.2'),
    '123.45.67.89'
  );
  assert.strictEqual(
    pickClientIp({ 'x-appengine-user-ip': '8.8.8.8' }, '127.0.0.1'),
    '8.8.8.8'
  );
  assert.strictEqual(
    pickClientIp({ 'x-forwarded-for': '35.191.12.1, 169.254.1.1' }, '35.191.12.1'),
    ''
  );
  console.log('ok pickClientIp');
}

function testGoogleHeaders() {
  const geo = parseGoogleGeoHeaders({
    'x-appengine-country': 'KR',
    'x-appengine-city': 'seoul'
  });
  assert.strictEqual(geo.countryCode, 'KR');
  assert.strictEqual(geo.city, 'Seoul');
  assert.strictEqual(parseGoogleGeoHeaders({ 'x-appengine-country': 'ZZ' }).countryCode, '');
  console.log('ok googleHeaders');
}

function testThrottle() {
  const now = Date.now();
  assert.strictEqual(shouldSkipAccessWrite(null, now), false);
  assert.strictEqual(shouldSkipAccessWrite({}, now), false);
  assert.strictEqual(
    shouldSkipAccessWrite({ updatedAt: { seconds: Math.floor((now - 5 * 60 * 1000) / 1000) } }, now),
    true
  );
  assert.strictEqual(
    shouldSkipAccessWrite({ updatedAt: { seconds: Math.floor((now - 40 * 60 * 1000) / 1000) } }, now),
    false
  );
  assert.strictEqual(
    shouldSkipAccessWrite(
      { countryCode: 'KR', updatedAt: { seconds: Math.floor((now - 40 * 60 * 1000) / 1000) } },
      now
    ),
    false
  );
  assert.ok(ACCESS_INFO_THROTTLE_MS === 30 * 60 * 1000);
  console.log('ok throttle');
}

function testCountryFromIpNotLanguage() {
  const lookupGeo = () => ({ countryCode: 'JP', city: 'Tokyo' });
  const geo = resolveGeo({
    headers: {},
    ip: '203.0.113.10',
    lookupGeo
  });
  assert.strictEqual(geo.countryCode, 'JP');

  const spoof = buildAccessInfo({
    headers: {},
    ip: '',
    language: 'ko-KR',
    clientType: 'web',
    lookupGeo: () => null
  });
  assert.strictEqual(spoof.countryCode, '');
  assert.strictEqual(spoof.language, 'ko-KR');
  assert.strictEqual(spoof.clientType, 'web');

  const fromHeader = buildAccessInfo({
    headers: { 'x-appengine-country': 'DE', 'x-appengine-city': 'berlin' },
    ip: '1.2.3.4',
    language: 'ko-KR',
    clientType: 'app',
    lookupGeo: () => ({ countryCode: 'US', city: 'Dallas' })
  });
  assert.strictEqual(fromHeader.countryCode, 'DE');
  assert.strictEqual(fromHeader.city, 'Berlin');
  assert.strictEqual(fromHeader.clientType, 'app');
  assert.ok(fromHeader.countryName);
  assert.strictEqual(fromHeader.lastIpMasked, '1.2.***.***');
  assert.ok(!JSON.stringify(fromHeader).includes('1.2.3.4'));
  console.log('ok countryFromIpNotLanguage');
}

function testNormalize() {
  assert.strictEqual(normalizeCountryCode('kr'), 'KR');
  assert.strictEqual(normalizeCountryCode('ZZ'), '');
  assert.strictEqual(normalizeLanguage('ko-KR'), 'ko-KR');
  assert.strictEqual(normalizeLanguage('<script>'), '');
  assert.strictEqual(normalizeClientType('APP'), 'app');
  assert.strictEqual(normalizeClientType('browser'), 'web');
  assert.ok(countryNameFor('KR', 'ko').includes('대한') || countryNameFor('KR', 'ko') === 'KR');
  console.log('ok normalize');
}

async function testRecordWriteMasksIp() {
  const writes = [];
  const db = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: true, data: () => ({ uid: 'u1', role: 'user' }) };
            },
            async set(data, opts) {
              writes.push({ data, opts });
            }
          };
        }
      };
    }
  };
  const adminNs = { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } };
  await recordUserAccessInfo(
    db,
    adminNs,
    { uid: 'u1' },
    {
      headers: { 'x-forwarded-for': '123.45.67.89' },
      ip: '123.45.67.89',
      body: { language: 'ko-KR', clientType: 'web' }
    },
    () => ({ countryCode: 'KR', city: 'Seoul' })
  );
  assert.strictEqual(writes.length, 1);
  const stored = JSON.stringify(writes[0].data);
  assert.ok(!stored.includes('123.45.67.89'));
  assert.strictEqual(writes[0].data.accessInfo.lastIpMasked, '123.45.***.***');
  assert.strictEqual(writes[0].data.accessInfo.countryCode, 'KR');
  assert.strictEqual(writes[0].opts.merge, true);
  console.log('ok recordWriteMasksIp');

  const writes2 = [];
  const dbThrottled = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return {
                exists: true,
                data: () => ({
                  uid: 'u1',
                  accessInfo: { updatedAt: { seconds: Math.floor(Date.now() / 1000) } }
                })
              };
            },
            async set(data) { writes2.push(data); }
          };
        }
      };
    }
  };
  const skipped = await recordUserAccessInfo(
    dbThrottled,
    adminNs,
    { uid: 'u1' },
    { headers: { 'x-forwarded-for': '123.45.67.89' }, body: {} },
    () => ({ countryCode: 'KR', city: 'Seoul' })
  );
  assert.strictEqual(skipped.throttled, true);
  assert.strictEqual(writes2.length, 0);
  console.log('ok recordThrottled');
}

function testLiveGeoip() {
  let geoip;
  try { geoip = require('geoip-lite'); } catch { console.log('skip liveGeoip'); return; }
  const looked = geoip.lookup('8.8.8.8');
  assert.ok(looked && looked.country);
  const info = buildAccessInfo({ headers: {}, ip: '8.8.8.8', language: 'en-US', clientType: 'web' });
  assert.strictEqual(info.countryCode, looked.country);
  assert.ok(!JSON.stringify(info).includes('8.8.8.8'));
  assert.strictEqual(info.lastIpMasked, '8.8.***.***');
  console.log('ok liveGeoip', info.countryCode);

  const krLooked = geoip.lookup('211.115.80.1');
  assert.ok(krLooked && krLooked.country === 'KR');
  const krInfo = buildAccessInfo({ headers: {}, ip: '211.115.80.1', language: 'ko-KR', clientType: 'app' });
  assert.strictEqual(krInfo.countryCode, 'KR');
  assert.ok(!JSON.stringify(krInfo).includes('211.115.80.1'));
  assert.strictEqual(krInfo.clientType, 'app');
  console.log('ok liveGeoipKR', krInfo.countryCode, krInfo.city || '(no city)');
}

async function testIgnoresClientCountryAndUid() {
  const writes = [];
  const db = {
    collection() {
      return {
        doc(uid) {
          assert.strictEqual(uid, 'token-uid');
          return {
            async get() {
              return { exists: true, data: () => ({ uid: 'token-uid' }) };
            },
            async set(data, opts) {
              writes.push({ data, opts });
            }
          };
        }
      };
    }
  };
  const adminNs = { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } };
  await recordUserAccessInfo(
    db,
    adminNs,
    { uid: 'token-uid' },
    {
      headers: { 'x-forwarded-for': '211.115.80.1' },
      ip: '211.115.80.1',
      body: { uid: 'attacker-uid', countryCode: 'US', countryName: 'United States', ip: '9.9.9.9' }
    },
    () => ({ countryCode: 'KR', city: 'Seoul' })
  );
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].data.uid, 'token-uid');
  assert.strictEqual(writes[0].data.accessInfo.countryCode, 'KR');
  assert.ok(!JSON.stringify(writes[0].data).includes('9.9.9.9'));
  assert.ok(!JSON.stringify(writes[0].data).includes('attacker-uid'));
  console.log('ok ignoresClientCountryAndUid');
}

async function testKeepsPreviousCountryOnGeoFail() {
  const writes = [];
  const db = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return {
                exists: true,
                data: () => ({
                  uid: 'u1',
                  accessInfo: {
                    countryCode: 'KR',
                    countryName: '대한민국',
                    city: 'Seoul',
                    lastIpMasked: '211.115.***.***',
                    updatedAt: { seconds: Math.floor((Date.now() - 40 * 60 * 1000) / 1000) }
                  }
                })
              };
            },
            async set(data) { writes.push(data); }
          };
        }
      };
    }
  };
  const adminNs = { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } };
  await recordUserAccessInfo(
    db,
    adminNs,
    { uid: 'u1' },
    { headers: {}, ip: '127.0.0.1', body: { clientType: 'app', language: 'ko-KR' } },
    () => null
  );
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].accessInfo.countryCode, 'KR');
  assert.strictEqual(writes[0].accessInfo.clientType, 'app');
  console.log('ok keepsPreviousCountryOnGeoFail');
}

testMaskIp();
testPrivateIp();
testPickClientIp();
testGoogleHeaders();
testThrottle();
testCountryFromIpNotLanguage();
testNormalize();
testLiveGeoip();
testRecordWriteMasksIp()
  .then(testIgnoresClientCountryAndUid)
  .then(testKeepsPreviousCountryOnGeoFail)
  .then(() => {
  console.log('accessInfo tests passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
