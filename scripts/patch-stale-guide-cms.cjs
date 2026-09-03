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
const { createRequire } = require('module');
const requireFromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));

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

async function getAdmin() {
  const admin = requireFromFunctions('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT });
  }
  return admin;
}

async function main() {
  if (!DRY && !WRITE) {
    console.error('Use --dry-run or --write');
    process.exit(2);
  }
  const mode = WRITE ? 'WRITE' : 'DRY_RUN';
  console.log(JSON.stringify({ mode, project: PROJECT }, null, 2));

  let admin;
  try {
    admin = await getAdmin();
  } catch (err) {
    console.error(JSON.stringify({ FIRESTORE_PATCH: 'BLOCKED', REASON: 'AUTH_REQUIRED', message: String(err.message || err) }));
    process.exit(3);
  }

  const db = admin.firestore();
  const report = { mode, docs: [] };

  for (const id of ['license', 'troubleshooting']) {
    const ref = db.collection('guides').doc(id);
    let snap;
    try {
      snap = await ref.get();
    } catch (err) {
      console.error(JSON.stringify({ FIRESTORE_PATCH: 'BLOCKED', REASON: 'AUTH_REQUIRED', doc: id, message: String(err.message || err) }));
      process.exit(3);
    }
    if (!snap.exists) {
      report.docs.push({ id, existed: false, action: 'skip_missing' });
      continue;
    }
    const live = snap.data() || {};
    const desired = DESIRED[id];
    const { patch, reasons } = planPatch(live, desired);
    const preserved = Object.keys(live).filter((k) => !Object.prototype.hasOwnProperty.call(patch, k));
    const entry = {
      id,
      existed: true,
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
      await ref.set(
        {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      const after = await ref.get();
      const afterData = after.data() || {};
      entry.postRead = {
        summary: afterData.summary || null,
        features: afterData.features || null,
        tips: afterData.tips || null,
        faq: afterData.faq || null,
        staleRemaining: fieldStale(afterData),
        preservedSections: Array.isArray(afterData.sections),
        preservedHeroImage: afterData.heroImage !== undefined
      };
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
