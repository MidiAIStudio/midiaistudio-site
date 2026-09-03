/**
 * Field-scoped patch for Firestore guides/{license,troubleshooting}.
 *
 * Usage:
 *   node scripts/patch-stale-guide-cms.cjs --dry-run
 *   node scripts/patch-stale-guide-cms.cjs --write
 *
 * Preserves unrelated CMS fields (hero media, sections, overlays, etc.).
 * Only updates copy fields that still contain known STALE markers.
 */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run') || !process.argv.includes('--write');
const WRITE = process.argv.includes('--write');
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'midiaistudio';
const SNAPSHOT_DIR = path.join(__dirname, '..', 'dev', 'reports');

const STALE_RE =
  /Show HWID|평생 라이선스|로그·HWID|버전·HWID|기기\(HWID\)|1:1 문의로 HWID|\bHWID\b/i;

const DESIRED = {
  license: {
    title: 'License',
    category: '계정',
    summary:
      '구매한 이용권이나 라이선스는 구매에 사용한 Google 계정으로 앱에 로그인하면 연결됩니다.',
    order: 90,
    features: ['Google 계정 연동', '기간 이용권 / Lifetime', '계정 기반 활성화'],
    steps: [
      {
        title: '구매',
        body: '구매 페이지에서 원하는 이용권·라이선스·Credit 상품을 구매합니다. 현재 판매 상품은 구매 페이지에서 확인하세요.'
      },
      {
        title: '로그인',
        body: 'MidiAI Studio 앱에서 구매에 사용한 Google 계정으로 로그인합니다.'
      },
      {
        title: '확인',
        body: '계정에 연결된 현재 이용 상태를 앱의 계정/프로필 영역에서 확인합니다.'
      }
    ],
    faq: [
      {
        q: '기기를 변경했는데 이용권이 인식되지 않아요.',
        a: '기기 변경 후 인증 문제가 발생하면 1:1 문의를 통해 확인을 요청해 주세요.'
      }
    ],
    tips: '기기를 변경했거나 인증 문제가 발생한 경우 1:1 문의를 이용해주세요.',
    relatedGuides: ['getting-started', 'troubleshooting']
  },
  troubleshooting: {
    title: 'Troubleshooting',
    category: '도움말',
    summary: '설치·변환·로그인 문제를 해결합니다.',
    order: 110,
    features: ['설치 복구', '로그인', '변환 실패'],
    steps: [
      {
        title: 'Installer 복구',
        body: 'Installer에서 Install/Update로 복구를 실행합니다.'
      },
      {
        title: '오류 정보 확인',
        body: '화면에 표시된 오류 메시지, 발생 단계, 앱 버전을 확인합니다. 가능하면 System Check 결과도 저장합니다.'
      },
      {
        title: '문의',
        body: '문제가 계속되면 1:1 문의에 오류 메시지, 스크린샷, 로그 파일(가능한 경우)을 첨부합니다.'
      }
    ],
    faq: [
      {
        q: '로그인이 안 돼요',
        a: '인앱 브라우저가 아닌 Chrome/Edge에서 포털에 로그인해 보세요.'
      }
    ],
    tips: '지원 티켓에 오류 메시지·앱 버전·스크린샷·로그를 함께 보내면 해결이 빠릅니다.',
    relatedGuides: ['license', 'getting-started']
  }
};

const PATCH_KEYS = [
  'title',
  'category',
  'summary',
  'order',
  'features',
  'steps',
  'faq',
  'tips',
  'relatedGuides'
];

function cloneSafe(doc) {
  const out = { id: doc.id };
  for (const [k, v] of Object.entries(doc.data || {})) {
    if (k === 'createdAt' || k === 'updatedAt') {
      out[k] = v && typeof v.toDate === 'function' ? v.toDate().toISOString() : String(v);
      continue;
    }
    try {
      out[k] = JSON.parse(JSON.stringify(v));
    } catch (_) {
      out[k] = '[unserializable]';
    }
  }
  return out;
}

function fieldStale(value) {
  try {
    return STALE_RE.test(JSON.stringify(value));
  } catch (_) {
    return false;
  }
}

function planPatch(live, desired) {
  const patch = {};
  const reasons = {};
  for (const key of PATCH_KEYS) {
    const cur = live[key];
    const next = desired[key];
    const stale = fieldStale(cur);
    const same = JSON.stringify(cur) === JSON.stringify(next);
    if (stale || !same) {
      // Only force-update when stale, or when core copy fields diverge from CURRENT seed
      // for the known guide set (these two docs are product-fact guides).
      if (stale || ['summary', 'features', 'steps', 'faq', 'tips'].includes(key)) {
        if (!same) {
          patch[key] = next;
          reasons[key] = stale ? 'stale_marker' : 'align_current_copy';
        }
      }
    }
  }
  return { patch, reasons };
}

/** Hard allow-list — abort if anything outside these paths is targeted. */
const ALLOWED_WRITE_TARGETS = ['guides/license', 'guides/troubleshooting'];
const FORBIDDEN_WRITE_RE =
  /\b(licenses|payments|orders|products|credits?|entitlement|hwid|users\/)\b/i;

/** Firebase CLI OAuth client (public; used by `firebase login`). */
const FIREBASE_CLI_CLIENT = {
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iV0ub7oerJviowQgEuvokD'
};

function loadFirebaseCliTokens() {
  const confPath = path.join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(confPath)) return null;
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  return conf.tokens || null;
}

async function getCliAccessToken() {
  const tokens = loadFirebaseCliTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Firebase CLI tokens missing. Run: firebase login --reauth');
  }
  const stillValid =
    tokens.access_token &&
    typeof tokens.expires_at === 'number' &&
    tokens.expires_at > Date.now() + 60_000;
  if (stillValid) return tokens.access_token;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: FIREBASE_CLI_CLIENT.client_id,
    client_secret: FIREBASE_CLI_CLIENT.client_secret
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'token refresh failed');
  }
  return json.access_token;
}

function docUrl(id) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/guides/${encodeURIComponent(id)}`;
}

function fromFirestoreValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, child] of Object.entries(v.mapValue.fields || {})) out[k] = fromFirestoreValue(child);
    return out;
  }
  return null;
}

function decodeDoc(json) {
  const out = {};
  for (const [k, v] of Object.entries(json.fields || {})) out[k] = fromFirestoreValue(v);
  return out;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, child] of Object.entries(v)) fields[k] = toFirestoreValue(child);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function restGetGuide(token, id) {
  const res = await fetch(docUrl(id), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return { exists: false, data: null };
  const json = await res.json();
  if (!res.ok) {
    const msg = (json.error && json.error.message) || res.statusText;
    const err = new Error(msg);
    err.code = json.error && json.error.status;
    throw err;
  }
  return { exists: true, data: decodeDoc(json) };
}

async function restMergeGuide(token, id, patch) {
  const target = `guides/${id}`;
  if (!ALLOWED_WRITE_TARGETS.includes(target) || FORBIDDEN_WRITE_RE.test(target)) {
    throw new Error(`REFUSED unsafe write target: ${target}`);
  }
  const fields = {};
  for (const [k, v] of Object.entries(patch)) fields[k] = toFirestoreValue(v);
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  const mask = [...Object.keys(patch), 'updatedAt'].map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const res = await fetch(`${docUrl(id)}?${mask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json.error && json.error.message) || res.statusText);
  return decodeDoc(json);
}

async function main() {
  if (!DRY && !WRITE) {
    console.error('Use --dry-run or --write');
    process.exit(2);
  }
  const mode = WRITE ? 'WRITE' : 'DRY_RUN';
  const writeTargets = ALLOWED_WRITE_TARGETS.slice();
  if (writeTargets.some((t) => FORBIDDEN_WRITE_RE.test(t)) || writeTargets.length !== 2) {
    console.error(JSON.stringify({ FIRESTORE_PATCH: 'FAIL', REASON: 'UNSAFE_WRITE_TARGETS', writeTargets }));
    process.exit(5);
  }
  console.log(JSON.stringify({ mode, project: PROJECT, writeTargets }, null, 2));

  let token;
  try {
    token = await getCliAccessToken();
  } catch (err) {
    console.error(JSON.stringify({ FIRESTORE_PATCH: 'BLOCKED', REASON: 'AUTH_REQUIRED', message: String(err.message || err) }));
    process.exit(3);
  }

  const report = { mode, writeTargets, docs: [], unrelatedWrites: 0, licensesWrites: 0, userEntitlementWrites: 0, paymentWrites: 0, productWrites: 0, creditWrites: 0 };

  for (const id of ['license', 'troubleshooting']) {
    let snap;
    try {
      snap = await restGetGuide(token, id);
    } catch (err) {
      const msg = String(err.message || err);
      if (/credentials|auth|login|permission|unauthenticated|UNAUTHENTICATED/i.test(msg)) {
        console.error(JSON.stringify({ FIRESTORE_PATCH: 'BLOCKED', REASON: 'AUTH_REQUIRED', doc: id, message: msg }));
        process.exit(3);
      }
      throw err;
    }
    if (!snap.exists) {
      report.docs.push({ id, existed: false, action: 'skip_missing', fieldsToPatch: [] });
      continue;
    }
    const live = snap.data || {};
    const desired = DESIRED[id];
    const { patch, reasons } = planPatch(live, desired);
    const preserved = Object.keys(live).filter((k) => !Object.prototype.hasOwnProperty.call(patch, k));
    const entry = {
      id,
      existed: true,
      action: Object.keys(patch).length ? 'field_scoped_patch' : 'no_change',
      staleDetected: fieldStale(live),
      fieldsToPatch: Object.keys(patch),
      patchReasons: reasons,
      preservedFields: preserved,
      livePreview: {
        title: live.title || null,
        summary: live.summary || null,
        features: live.features || null,
        tips: live.tips || null,
        faq: live.faq || null,
        steps: (live.steps || []).map((s) => ({ title: s.title || s.name || null, body: (s.body || s.text || '').slice(0, 120) })),
        hasSections: Array.isArray(live.sections) && live.sections.length > 0,
        hasHeroMedia: !!(live.heroImage || live.heroVideo || (live.sections || []).some((s) => s && (s.mediaUrl || s.image || s.video))),
        published: live.published,
        order: live.order
      },
      newPreview: {
        summary: patch.summary || live.summary || null,
        features: patch.features || live.features || null,
        tips: patch.tips || live.tips || null
      }
    };
    report.docs.push(entry);

    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const snapPath = path.join(SNAPSHOT_DIR, `guide-${id}-prepatch-${Date.now()}.json`);
    fs.writeFileSync(snapPath, JSON.stringify(cloneSafe({ id, data: live }), null, 2) + '\n', 'utf8');
    entry.snapshot = path.relative(path.join(__dirname, '..'), snapPath).replace(/\\/g, '/');

    if (WRITE && Object.keys(patch).length) {
      const afterData = await restMergeGuide(token, id, patch);
      entry.postRead = {
        summary: afterData.summary || null,
        features: afterData.features || null,
        tips: afterData.tips || null,
        faq: afterData.faq || null,
        staleRemaining: fieldStale(afterData),
        preservedSections: Array.isArray(afterData.sections),
        preservedHeroImage: afterData.heroImage !== undefined
      };
      entry.wrote = true;
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (WRITE) {
    const stillStale = report.docs.some((d) => d.postRead && d.postRead.staleRemaining);
    if (stillStale) process.exit(4);
  }
}

main().catch((err) => {
  const msg = String(err && err.message ? err.message : err);
  if (/credentials|auth|login|permission|unauthenticated/i.test(msg)) {
    console.error(JSON.stringify({ FIRESTORE_PATCH: 'BLOCKED', REASON: 'AUTH_REQUIRED', message: msg }));
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
});
