/**
 * Guide Visual CMS — list + detail read/edit against Firestore `guides`.
 * Self-contained Firebase init (shares app with app.js via getApps).
 */

import {
  esc,
  youtubeId,
  confirmDelete,
  mountEditableText,
  mountEditableFeatureList,
  mountEditableMedia,
  uploadToStorage,
  normalizeMediaWidthPct,
  normalizeMediaAspect
} from './visual-cms.js?v=slot-scale-22';
import { mountMarkdownField, ensureMarkdownCss } from './markdown/index.js';
import {
  buildCategoryChips,
  renderGuideCard,
  guideMatchesQuery,
  guideMatchesChip,
  sectionTocItems,
  padStep,
  chaptersHtml,
  bindScrollSpy,
  bindGuideImageZoom
} from './guide-learn.js?v=guide-edit-ux-1';
import {
  applyGuideDocumentSeo,
  guideSlugFromLocation,
  hideGuideSeoFallback,
  mediaAltForGuide,
  guidePagePath
} from './guide-seo.js?v=guide-unify-1';


const CONFIG = window.MIDIAI_CONFIG || {};
const FB = 'https://www.gstatic.com/firebasejs/10.12.5';
const COLLECTION = 'guides';

/** slug → public conversion guide (null = hide CTA) */
export const GUIDE_PILLAR_MAP = {
  'youtube-to-midi': '/guides/youtube-to-midi.html',
  'audio-to-midi': '/guides/audio-to-midi.html',
  'pdf-to-midi': '/guides/pdf-to-midi.html',
  'midi-editor': '/guides/midi-editor.html',
  'ai-assistant': '/guides/ai-transcription.html'
};

const SEED_GUIDES = [
  { slug: 'getting-started', title: 'Getting Started', category: '시작', summary: 'MidiAI Studio 설치부터 첫 변환까지.', order: 10, features: ['설치·실행', 'Google 로그인', '첫 MIDI 변환'], steps: [{ title: '앱 설치', body: '다운로드 페이지에서 Installer를 받아 설치합니다.' }, { title: '로그인', body: 'Google 계정으로 로그인하고 라이선스를 확인합니다.' }, { title: '첫 변환', body: 'Studio에서 YouTube 또는 오디오를 불러와 MIDI로 변환합니다.' }], faq: [{ q: '체험판으로 시작할 수 있나요?', a: '네. 다운로드 후 로그인하면 체험 기능을 확인할 수 있습니다.' }], tips: '변환 전 구간을 짧게 잡아 결과를 먼저 확인하세요.', relatedGuides: ['youtube-to-midi', 'audio-to-midi'] },
  { slug: 'youtube-to-midi', title: 'YouTube → MIDI', category: '변환', summary: 'YouTube 링크로 피아노 커버·영상을 MIDI로 변환합니다.', order: 20, features: ['URL 붙여넣기', '웨이브폼 구간', '악기 선택'], steps: [{ title: '링크 입력', body: 'Studio에 YouTube URL을 붙여넣거나 검색합니다.' }, { title: '구간 선택', body: '웨이브폼에서 변환할 구간을 지정합니다.' }, { title: '변환·편집', body: 'MIDI를 생성한 뒤 Editor에서 노트를 다듬습니다.' }], faq: [{ q: '모든 영상이 되나요?', a: '공개 영상이 기본입니다. 제한·비공개 영상은 실패할 수 있습니다.' }], tips: '피아노·솔로 연주 영상이 결과가 좋은 편입니다.', relatedGuides: ['midi-editor', 'audio-to-midi'] },
  { slug: 'audio-to-midi', title: 'Audio → MIDI', category: '변환', summary: 'MP3·WAV 등 로컬 오디오를 AI MIDI로 변환합니다.', order: 30, features: ['파일 업로드', '미리듣기', '출력 악기'], steps: [{ title: '파일 불러오기', body: 'MP3, WAV 등 오디오를 Studio에 올립니다.' }, { title: '구간·악기', body: '미리듣기로 확인하고 출력 악기를 고릅니다.' }, { title: '변환', body: '변환 후 MIDI Editor로 이어집니다.' }], faq: [{ q: '어떤 포맷을 지원하나요?', a: '일반적인 오디오 포맷(MP3, WAV 등)을 지원합니다. 앱 버전별 목록은 패치노트를 확인하세요.' }], tips: '노이즈가 적고 피치가 뚜렷한 소스가 유리합니다.', relatedGuides: ['youtube-to-midi', 'midi-editor'] },
  { slug: 'pdf-to-midi', title: 'PDF → MIDI', category: '변환', summary: '악보 PDF를 인식해 편집 가능한 MIDI로 만듭니다.', order: 40, features: ['PDF 인식', 'MIDI 복원', '악보 편집 연동'], steps: [{ title: 'PDF 열기', body: '악보 PDF를 불러옵니다.' }, { title: '인식', body: '페이지를 분석해 음표를 MIDI로 매핑합니다.' }, { title: '보정', body: 'Editor·Score Editor에서 오류를 수정합니다.' }], faq: [{ q: '스캔 악보도 되나요?', a: '가능하지만 해상도·대비가 좋을수록 인식률이 높습니다.' }], tips: '기울어진 스캔은 먼저 보정하면 결과가 좋아집니다.', relatedGuides: ['score-editor', 'midi-editor'] },
  { slug: 'midi-editor', title: 'MIDI Editor', category: '편집', summary: '멀티트랙 피아노 롤에서 노트·벨로시티·CC를 편집합니다.', order: 50, features: ['멀티트랙', '128종 악기', '양자화'], steps: [{ title: 'MIDI 열기', body: '변환 결과 또는 라이브러리 MIDI를 엽니다.' }, { title: '노트 편집', body: '피치·길이·벨로시티를 조정합니다.' }, { title: '저장·내보내기', body: '저장하거나 악보로 내보냅니다.' }], faq: [{ q: '실행취소가 되나요?', a: '네. 일반적인 편집 작업에 실행취소/다시실행을 지원합니다.' }], tips: '트랙별로 멜로디와 반주를 나눠 작업하세요.', relatedGuides: ['score-editor', 'library'] },
  { slug: 'score-editor', title: 'Score Editor', category: '편집', summary: '악보를 페이지·타임라인으로 보고 음표를 수정합니다.', order: 60, features: ['페이지/연속 보기', '음표 속성', 'AI 검토'], steps: [{ title: '악보 열기', body: '변환된 악보 또는 MusicXML을 엽니다.' }, { title: '편집', body: '음표를 선택해 피치·길이 등을 수정합니다.' }, { title: '검토', body: 'AI 검토 제안으로 이상 음을 확인합니다.' }], faq: [{ q: 'PDF로 다시 저장되나요?', a: '네. 편집 후 PDF·MusicXML로 내보낼 수 있습니다.' }], tips: '변환 직후 AI 검토를 한 번 돌리면 수정 포인트가 빨리 보입니다.', relatedGuides: ['pdf-to-midi', 'midi-editor'] },
  { slug: 'ai-assistant', title: 'AI Assistant', category: '기능', summary: '변환·편집 중 AI 도움으로 품질을 다듬습니다.', order: 70, features: ['검토 제안', '작업 힌트'], steps: [{ title: '제안 열기', body: '편집 화면에서 AI 검토를 실행합니다.' }, { title: '적용', body: '제안 항목을 확인한 뒤 반영합니다.' }], faq: [{ q: '항상 정확한가요?', a: '제안은 보조입니다. 최종 판단은 연주·청취로 확인하세요.' }], tips: '피치 점프·겹침 음표 위주로 먼저 확인하세요.', relatedGuides: ['score-editor', 'midi-editor'] },
  { slug: 'library', title: 'Library', category: '관리', summary: '변환·편집한 MIDI를 모아 다시 엽니다.', order: 80, features: ['프로젝트 목록', '다시 열기'], steps: [{ title: '저장', body: '작업물을 라이브러리에 저장합니다.' }, { title: '다시 열기', body: '목록에서 선택해 Editor로 이어갑니다.' }], faq: [{ q: '클라우드 동기화인가요?', a: '라이브러리는 앱 로컬 저장을 기준으로 합니다. 버전별 동작은 패치노트를 확인하세요.' }], tips: '파일명에 곡명·날짜를 넣으면 찾기 쉽습니다.', relatedGuides: ['midi-editor', 'getting-started'] },
  { slug: 'license', title: 'License', category: '계정', summary: '구매한 이용권이나 라이선스는 구매에 사용한 Google 계정으로 앱에 로그인하면 연결됩니다.', order: 90, features: ['Google 계정 연동', '기간 이용권 / Lifetime', '계정 기반 활성화'], steps: [{ title: '구매', body: '구매 페이지에서 원하는 이용권·라이선스·Credit 상품을 구매합니다. 현재 판매 상품은 구매 페이지에서 확인하세요.' }, { title: '로그인', body: 'MidiAI Studio 앱에서 구매에 사용한 Google 계정으로 로그인합니다.' }, { title: '확인', body: '계정에 연결된 현재 이용 상태를 앱의 계정/프로필 영역에서 확인합니다.' }], faq: [{ q: '기기를 변경했는데 이용권이 인식되지 않아요.', a: '기기 변경 후 인증 문제가 발생하면 1:1 문의를 통해 확인을 요청해 주세요.' }], tips: '기기를 변경했거나 인증 문제가 발생한 경우 1:1 문의를 이용해주세요.', relatedGuides: ['getting-started', 'troubleshooting'] },
  { slug: 'troubleshooting', title: 'Troubleshooting', category: '도움말', summary: '설치·변환·로그인 문제를 해결합니다.', order: 110, features: ['설치 복구', '로그인', '변환 실패'], steps: [{ title: 'Installer 복구', body: 'Installer에서 Install/Update로 복구를 실행합니다.' }, { title: '오류 정보 확인', body: '화면에 표시된 오류 메시지, 발생 단계, 앱 버전을 확인합니다. 가능하면 System Check 결과도 저장합니다.' }, { title: '문의', body: '문제가 계속되면 1:1 문의에 오류 메시지, 스크린샷, 로그 파일(가능한 경우)을 첨부합니다.' }], faq: [{ q: '로그인이 안 돼요', a: '인앱 브라우저가 아닌 Chrome/Edge에서 포털에 로그인해 보세요.' }], tips: '지원 티켓에 오류 메시지·앱 버전·스크린샷·로그를 함께 보내면 해결이 빠릅니다.', relatedGuides: ['license', 'getting-started'] }
];

const pathBase = () => window.MIDIAI_BASE_PATH || './';
const ytId = youtubeId;

function newSectionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyProductSection(layout = 'normal') {
  return {
    id: newSectionId(),
    layout,
    category: 'Studio',
    title: '새 제목',
    body: '설명을 입력하세요.',
    features: ['기능 1', '기능 2', '기능 3'],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    mediaWidth: 'full',
    mediaWidthPct: 100,
    mediaAspect: 1.6,
    mediaOverlays: [],
    mediaCaption: ''
  };
}

/**
 * Normalize one CMS section/step into a stable object.
 * Media is owned by the section — never inherited from hero or siblings.
 */
function normalizeSection(s = {}, i = 0, fromStep = false) {
  let mediaType = '';
  let mediaUrl = '';
  let posterUrl = '';

  if (fromStep) {
    // Legacy steps[]: prefer explicit image/video on the step itself.
    if (s.video) {
      mediaType = s.videoType === 'youtube' ? 'youtube' : 'video';
      mediaUrl = s.video;
    } else if (s.image) {
      mediaType = 'image';
      mediaUrl = s.image;
    }
  } else {
    mediaType = s.mediaType || '';
    mediaUrl = s.mediaUrl || '';
    posterUrl = s.posterUrl || '';
    // Optional explicit fields (newer docs) win when present.
    if (s.image && (!mediaUrl || mediaType === 'image' || !mediaType)) {
      mediaType = 'image';
      mediaUrl = s.image;
    }
    if (s.video && (!mediaUrl || mediaType === 'video' || mediaType === 'youtube' || !mediaType)) {
      mediaType = s.videoType === 'youtube' || mediaType === 'youtube' ? 'youtube' : 'video';
      mediaUrl = s.video;
    }
  }

  // Guard: empty type with url → infer; type without url → clear.
  if (mediaUrl && !mediaType) mediaType = 'image';
  if (!mediaUrl) {
    mediaType = '';
    posterUrl = '';
  }

  return {
    id: s.id || s.sectionId || newSectionId(),
    layout: s.layout || (i % 2 ? 'reverse' : 'normal'),
    category: s.category || (fromStep ? `Step ${i + 1}` : ''),
    title: s.title || '',
    body: s.body || '',
    features: Array.isArray(s.features) ? [...s.features] : [],
    mediaType,
    mediaUrl,
    posterUrl,
    mediaFit: s.mediaFit || 'cover',
    mediaWidth: s.mediaWidth || 'full',
    mediaWidthPct: normalizeMediaWidthPct(s.mediaWidthPct, s.mediaWidth),
    mediaAspect: normalizeMediaAspect(s.mediaAspect),
    mediaOverlays: Array.isArray(s.mediaOverlays) ? s.mediaOverlays.map((o) => ({ ...o })) : [],
    mediaCaption: s.mediaCaption || ''
  };
}

function guideSlugOf(g) {
  return String(g?.id || g?.slug || '').trim();
}

/** Fallback only — Firestore sections should already carry stable ids. */
function deterministicSectionId(slug, title, i) {
  const t = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-가-힣]/g, '')
    .slice(0, 48);
  return `sec_${slug || 'guide'}_${t || i}`;
}

/** Product-style feature cards (same template as product.html). Migrates legacy steps. */
function getSections(g) {
  const slug = guideSlugOf(g);
  if (Array.isArray(g?.sections) && g.sections.length) {
    return g.sections.map((s, i) => {
      const n = normalizeSection(s, i, false);
      if (!s.id && !s.sectionId) n.id = deterministicSectionId(slug, n.title, i);
      return n;
    });
  }
  return (g?.steps || []).map((s, i) => {
    const n = normalizeSection(s, i, true);
    if (!s.id && !s.sectionId) n.id = deterministicSectionId(slug, n.title, i);
    return n;
  });
}

/** Only this section's own media — never hero / sibling / index guessing. */
function resolveSectionMedia(sec) {
  if (!sec) return null;
  const url = String(sec.mediaUrl || '').trim();
  const type = String(sec.mediaType || '').trim();
  if (!url || !type) return null;
  if (type !== 'image' && type !== 'video' && type !== 'youtube') return null;
  return {
    mediaType: type,
    mediaUrl: url,
    posterUrl: sec.posterUrl || '',
    mediaFit: sec.mediaFit || 'cover',
    mediaWidth: sec.mediaWidth || 'full',
    mediaWidthPct: sec.mediaWidthPct,
    mediaAspect: sec.mediaAspect,
    mediaOverlays: Array.isArray(sec.mediaOverlays) ? sec.mediaOverlays : [],
    mediaCaption: sec.mediaCaption || ''
  };
}

function mediaFileLabel(url) {
  if (!url) return '';
  try {
    const path = decodeURIComponent(String(url).split('/o/')[1]?.split('?')[0] || url);
    return path.split('/').pop() || url;
  } catch {
    return String(url).slice(-40);
  }
}

function findDuplicateMediaIds(sections) {
  const map = new Map();
  (sections || []).forEach((s, i) => {
    const u = String(s.mediaUrl || '').trim();
    if (!u) return;
    if (!map.has(u)) map.set(u, []);
    map.get(u).push(i);
  });
  return [...map.values()].filter((arr) => arr.length > 1);
}

function sectionsToSteps(sections) {
  return (sections || []).map((s) => {
    const media = resolveSectionMedia(s);
    return {
      id: s.id,
      title: s.title || '',
      body: s.body || '',
      image: media?.mediaType === 'image' ? media.mediaUrl : '',
      video: (media?.mediaType === 'video' || media?.mediaType === 'youtube') ? media.mediaUrl : '',
      videoType: media?.mediaType === 'youtube' ? 'youtube' : (media?.mediaType === 'video' ? 'upload' : '')
    };
  });
}


let db, auth, storage, fs, st;
let isAdmin = false;
let editMode = false;
let dirty = false;
let currentGuide = null;
let allGuides = [];
let pendingHeroFile = null;
let pendingStepFiles = {};
let pendingSectionFiles = {};
let hubFilter = { q: '', chip: 'all' };
let learnSpyDisconnect = null;

function isGuideListPage() {
  const p = location.pathname.replace(/\\/g, '/').toLowerCase();
  return /\/guide\/?(index\.html)?$/.test(p) || p.endsWith('/guide/index.html');
}
function isGuideDetailPage() {
  const p = location.pathname.replace(/\\/g, '/');
  if ((p.split('/').pop() || '') === 'guide.html') return true;
  return /\/guide\/[a-z0-9-]+(?:\.html)?\/?$/i.test(p) && !/\/guide\/index\.html$/i.test(p) && !/\/guide\/?$/i.test(p);
}

function guideHref(slug) {
  return `${pathBase()}${guidePagePath(slug)}`;
}

async function resolveAdmin(user) {
  isAdmin = false;
  if (!user) return;
  try {
    const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
    isAdmin = snap.exists() && snap.data()?.role === 'admin';
  } catch (e) { console.error(e); }
}

async function initFirebase() {
  if (!CONFIG.firebase?.apiKey) throw new Error('Firebase config missing');
  const [{ initializeApp, getApps, getApp }, authMod, fsMod, stMod] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-storage.js`)
  ]);
  const app = getApps().length ? getApp() : initializeApp(CONFIG.firebase);
  auth = authMod.getAuth(app);
  db = fsMod.getFirestore(app);
  storage = stMod.getStorage(app);
  fs = fsMod;
  st = stMod;
  await new Promise((resolve) => {
    const unsub = authMod.onAuthStateChanged(auth, async (user) => {
      unsub();
      await resolveAdmin(user);
      resolve();
    });
  });
  authMod.onAuthStateChanged(auth, async (user) => {
    await resolveAdmin(user);
    if (!editMode || !isAdmin) editMode = false;
    try {
      if (isAdmin) {
        await ensureSeed();
        allGuides = await loadAllGuidesAdmin();
      } else {
        allGuides = await loadPublishedGuides();
      }
    } catch (e) { console.error(e); }
    refreshAdminChrome();
    if (isGuideDetailPage() && currentGuide) {
      const fresh = allGuides.find((g) => g.id === currentGuide.id || g.slug === currentGuide.slug);
      renderDetail(fresh || currentGuide);
    }
    if (isGuideListPage()) renderList(allGuides);
  });
}

function setDirty(v) {
  dirty = !!v;
  const el = document.getElementById('guideCmsStatus');
  if (el) {
    el.textContent = dirty ? '● 저장되지 않음' : '✓ 저장 완료';
    el.classList.toggle('is-dirty', dirty);
    el.classList.toggle('is-saved', !dirty);
  }
  const saveBtn = document.querySelector('#guideCmsBar [data-cms="save"]');
  if (saveBtn) {
    saveBtn.disabled = !editMode;
    saveBtn.textContent = dirty && editMode ? '저장 *' : '저장';
    saveBtn.classList.toggle('is-dirty-save', !!(dirty && editMode));
  }
}

function shouldStartEditing() {
  try {
    const q = new URLSearchParams(location.search || '');
    if (q.get('edit') === '1') return true;
  } catch (_) { /* ignore */ }
  return location.hash === '#edit';
}

function clearEditQuery() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('edit') !== '1' && location.hash !== '#edit') return;
    url.searchParams.delete('edit');
    history.replaceState(null, '', url.pathname + url.search + (url.hash === '#edit' ? '' : url.hash));
  } catch (_) { /* ignore */ }
}

function suggestSlug(title) {
  const s = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[가-힣]+/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || `guide-${Date.now().toString(36)}`;
}

function ensureGuideCreateDialog() {
  let el = document.getElementById('guideCreateDialog');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'guideCreateDialog';
  el.className = 'guide-create-dialog hidden';
  el.innerHTML = `
    <div class="guide-create-backdrop" data-create-close="1"></div>
    <form class="guide-create-panel" novalidate>
      <header class="guide-create-head">
        <h3>가이드 추가</h3>
        <button type="button" class="ghost mini-btn" data-create-close="1" aria-label="닫기">닫기</button>
      </header>
      <div class="guide-create-body">
        <label>제목
          <input name="title" type="text" required maxlength="80" placeholder="예: 라이브러리 사용법" autocomplete="off">
        </label>
        <label>메뉴 slug (영문-케밥)
          <input name="slug" type="text" required maxlength="64" placeholder="예: library-tips" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autocomplete="off">
        </label>
        <label>카테고리
          <input name="category" type="text" maxlength="32" value="일반" placeholder="시작 / 변환 / 편집">
        </label>
        <label class="guide-create-check"><input name="template" type="checkbox"> 제품 카드(Step) 템플릿 2칸으로 시작</label>
        <label class="guide-create-check"><input name="published" type="checkbox"> 바로 공개</label>
        <p class="muted small">추가 후 상세 페이지에서 사진·영상·본문을 바로 편집합니다.</p>
      </div>
      <footer class="guide-create-foot">
        <button type="button" class="ghost mini-btn" data-create-close="1">취소</button>
        <button type="submit" class="primary mini-btn">만들고 편집</button>
      </footer>
    </form>`;
  document.body.appendChild(el);
  const form = el.querySelector('form');
  const titleInput = form.querySelector('[name="title"]');
  const slugInput = form.querySelector('[name="slug"]');
  let slugTouched = false;
  slugInput.addEventListener('input', () => { slugTouched = true; });
  titleInput.addEventListener('input', () => {
    if (!slugTouched || !slugInput.value.trim()) {
      slugInput.value = suggestSlug(titleInput.value);
      slugTouched = false;
    }
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-create-close]')) {
      e.preventDefault();
      closeGuideCreateDialog();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const slug = String(fd.get('slug') || '').trim().toLowerCase();
    const category = String(fd.get('category') || '일반').trim() || '일반';
    const template = !!form.elements.template?.checked;
    const published = !!form.elements.published?.checked;
    if (!title) { alert('제목을 입력하세요.'); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      alert('slug 형식이 올바르지 않습니다. 예: getting-started');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await createGuideDoc({ title, slug, category, template, published });
      closeGuideCreateDialog();
      location.href = `${guideHref(slug)}?edit=1`;
    } catch (err) {
      alert(err.message || err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.classList.contains('hidden')) closeGuideCreateDialog();
  });
  return el;
}

function openGuideCreateDialog(opts = {}) {
  if (!isAdmin) return;
  const el = ensureGuideCreateDialog();
  const form = el.querySelector('form');
  form.reset();
  form.elements.category.value = '일반';
  form.elements.template.checked = !!opts.template;
  form.elements.published.checked = false;
  form.elements.slug.value = '';
  el.classList.remove('hidden');
  document.body.classList.add('guide-create-open');
  setTimeout(() => form.elements.title?.focus(), 30);
}

function closeGuideCreateDialog() {
  const el = document.getElementById('guideCreateDialog');
  if (!el) return;
  el.classList.add('hidden');
  document.body.classList.remove('guide-create-open');
}

async function createGuideDoc({ title, slug, category, template, published }) {
  const { doc, getDoc, setDoc, serverTimestamp } = fs;
  const ref = doc(db, COLLECTION, slug);
  if ((await getDoc(ref)).exists()) throw new Error('이미 존재하는 slug입니다.');
  const s1 = emptyProductSection('normal');
  s1.category = category || 'Studio';
  s1.title = title || '새 제목';
  s1.body = '설명을 입력하세요.';
  const sections = [s1];
  if (template) {
    const s2 = emptyProductSection('reverse');
    s2.category = 'MIDI 편집 PRO';
    s2.title = '멀티트랙 피아노 롤';
    sections.push(s2);
  }
  await setDoc(ref, {
    title,
    category,
    slug,
    summary: '요약을 입력하세요.',
    tips: '',
    heroImage: '',
    heroVideo: '',
    heroVideoType: '',
    heroOverlays: [],
    features: template ? [] : ['기능 1'],
    steps: sectionsToSteps(sections),
    sections,
    faq: template ? [] : [{ q: '질문', a: '답변' }],
    relatedGuides: [],
    published: !!published,
    order: 999,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/** Mark draft dirty only — persist happens on explicit Save. */
function scheduleSave() {
  if (!editMode || !isAdmin || !currentGuide) return;
  setDirty(true);
}

function refreshAdminChrome() {
  const bar = document.getElementById('guideCmsBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !isAdmin);
  bar.querySelectorAll('[data-cms]').forEach((btn) => {
    const act = btn.getAttribute('data-cms');
    if (act === 'edit') btn.classList.toggle('hidden', editMode);
    if (act === 'preview') btn.classList.toggle('hidden', !editMode);
    if (act === 'save') btn.disabled = !editMode;
    if (act === 'delete') btn.classList.toggle('hidden', !isGuideDetailPage());
    if (act === 'add') btn.classList.toggle('hidden', !isGuideListPage());
    if (act === 'add-template') btn.classList.toggle('hidden', !isGuideListPage());
    if (act === 'add-section') btn.classList.toggle('hidden', !(isGuideDetailPage() && editMode));
  });
  document.body.classList.toggle('guide-cms-editing', editMode && isAdmin);
  document.body.classList.toggle('vcms-editing', editMode && isAdmin);
}

async function ensureSeed() {
  const { collection, getDocs, doc, setDoc, serverTimestamp } = fs;
  const snap = await getDocs(collection(db, COLLECTION));
  if (!snap.empty) return;
  const now = serverTimestamp();
  for (const g of SEED_GUIDES) {
    const id = g.slug;
    await setDoc(doc(db, COLLECTION, id), {
      ...g,
      heroImage: '',
      heroVideo: '',
      heroVideoType: '',
      heroOverlays: [],
      published: true,
      createdAt: now,
      updatedAt: now
    });
  }
}

async function loadPublishedGuides() {
  const { collection, query, where, getDocs, orderBy } = fs;
  try {
    const q = query(collection(db, COLLECTION), where('published', '==', true), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => sanitizeStaleGuideCopy({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('guides orderBy fallback', e);
    const q = query(collection(db, COLLECTION), where('published', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => sanitizeStaleGuideCopy({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
}

async function loadAllGuidesAdmin() {
  const { collection, getDocs } = fs;
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => sanitizeStaleGuideCopy({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Legacy STALE defense only — replace fields that still contain known stale markers. */
function sanitizeStaleGuideCopy(data) {
  if (!data) return data;
  const slug = data.slug || data.id;
  if (slug !== 'license' && slug !== 'troubleshooting') return data;
  const seed = SEED_GUIDES.find((g) => g.slug === slug);
  if (!seed) return data;
  const staleRe =
    /Show HWID|평생 라이선스|로그·HWID|버전·HWID|기기\(HWID\)|1:1 문의로 HWID|(^|[^\w])HWID([^\w]|$)/i;
  const isStale = (v) => {
    try {
      return staleRe.test(JSON.stringify(v));
    } catch (_) {
      return false;
    }
  };
  const out = { ...data };
  let changed = false;
  for (const key of ['summary', 'features', 'steps', 'faq', 'tips']) {
    if (isStale(out[key]) && seed[key] !== undefined) {
      out[key] = seed[key];
      changed = true;
    }
  }
  // Title/category only if they themselves look Lifetime/HWID-era.
  if (isStale(out.title) && seed.title) {
    out.title = seed.title;
    changed = true;
  }
  if (changed) out._staleCmsSanitized = true;
  return out;
}

async function repairStaleGuideDocsIfAdmin() {
  if (!isAdmin || !fs) return;
  const { doc, setDoc, serverTimestamp, getDoc } = fs;
  for (const slug of ['license', 'troubleshooting']) {
    const seed = SEED_GUIDES.find((g) => g.slug === slug);
    if (!seed) continue;
    try {
      const ref = doc(db, COLLECTION, slug);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const raw = { id: snap.id, ...snap.data() };
      const cleaned = sanitizeStaleGuideCopy(raw);
      if (!cleaned._staleCmsSanitized) continue;
      const patch = {};
      for (const key of ['summary', 'features', 'steps', 'faq', 'tips', 'title']) {
        if (JSON.stringify(raw[key]) !== JSON.stringify(cleaned[key])) patch[key] = cleaned[key];
      }
      if (!Object.keys(patch).length) continue;
      await setDoc(
        ref,
        {
          ...patch,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      console.info('[guide-cms] repaired stale guide fields', slug, Object.keys(patch));
    } catch (e) {
      console.warn('[guide-cms] repair failed', slug, e);
    }
  }
}

async function loadGuideBySlug(slug) {
  const { collection, query, where, getDocs, doc, getDoc } = fs;
  try {
    const byId = await getDoc(doc(db, COLLECTION, slug));
    if (byId.exists()) {
      const data = sanitizeStaleGuideCopy({ id: byId.id, ...byId.data() });
      if (!isAdmin && data.published === false) return null;
      return data;
    }
  } catch (e) {
    console.warn('guide getById', e);
  }
  try {
    // Guests must constrain published for list rules; admins may search all.
    const q = isAdmin
      ? query(collection(db, COLLECTION), where('slug', '==', slug))
      : query(collection(db, COLLECTION), where('slug', '==', slug), where('published', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return SEED_GUIDES.find((g) => g.slug === slug) || null;
    const d = snap.docs[0];
    return sanitizeStaleGuideCopy({ id: d.id, ...d.data() });
  } catch (e) {
    console.error('guide getBySlug', e);
    return SEED_GUIDES.find((g) => g.slug === slug) || null;
  }
}

function mediaHtml(image, video, videoType, opts = {}) {
  const cls = opts.className || 'guide-media';
  const editable = opts.editable ? ' data-editable-media="1"' : '';
  if (video && videoType === 'youtube') {
    const id = ytId(video);
    if (id) return `<div class="${cls}"${editable}><iframe src="https://www.youtube.com/embed/${esc(id)}" title="video" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (video && videoType === 'upload') {
    return `<div class="${cls}"${editable}><video src="${esc(video)}" controls playsinline></video></div>`;
  }
  const alt = opts.alt || '';
  if (image) return `<div class="${cls}"${editable}><img src="${esc(image)}" alt="${esc(alt)}" loading="lazy" decoding="async"></div>`;
  if (opts.editable) return `<div class="${cls} guide-media-empty"${editable}><span>이미지/영상 추가</span></div>`;
  return '';
}

function renderList(guides) {
  allGuides = guides || [];
  const root = document.getElementById('guideList');
  if (!root) return;
  const rows = (isAdmin ? allGuides : allGuides.filter((g) => g.published !== false))
    .filter((g) => guideMatchesChip(g, hubFilter.chip))
    .filter((g) => guideMatchesQuery(g, hubFilter.q));

  bindHubChrome(isAdmin ? allGuides : allGuides.filter((g) => g.published !== false));

  const status = document.getElementById('guideFilterStatus');
  if (status) {
    const total = (isAdmin ? allGuides : allGuides.filter((g) => g.published !== false)).length;
    status.textContent = rows.length === total
      ? `${total}개 가이드`
      : `${rows.length} / ${total}개 표시`;
  }

  const qs = document.getElementById('guideQuickStartLink');
  if (qs) qs.href = guideHref('getting-started');

  if (!rows.length) {
    root.innerHTML = `<div class="empty-card">조건에 맞는 가이드가 없습니다.</div>`;
    return;
  }
  root.innerHTML = rows.map((g) => renderGuideCard(g, pathBase(), { isAdmin })).join('');
  if (isAdmin && !root.dataset.editBound) {
    root.dataset.editBound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-guide-edit]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const slug = btn.getAttribute('data-guide-edit');
      if (slug) location.href = `${guideHref(slug)}?edit=1`;
    });
  }
}

function bindHubChrome(guides) {
  const chipsHost = document.getElementById('guideCatChips');
  const search = document.getElementById('guideSearch');
  if (chipsHost && !chipsHost.dataset.bound) {
    chipsHost.dataset.bound = '1';
    chipsHost.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chip]');
      if (!btn) return;
      hubFilter.chip = btn.getAttribute('data-chip') || 'all';
      chipsHost.querySelectorAll('[data-chip]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderList(allGuides);
    });
  }
  if (chipsHost) {
    const chips = buildCategoryChips(guides || []);
    chipsHost.innerHTML = chips.map((c) => {
      const active = hubFilter.chip === c.id;
      return `<button type="button" class="guide-hub-chip${active ? ' is-active' : ''}" data-chip="${esc(c.id)}" role="tab" aria-selected="${active ? 'true' : 'false'}">${esc(c.label)}</button>`;
    }).join('');
  }
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', () => {
      hubFilter.q = search.value.trim();
      renderList(allGuides);
    });
  }
}

function collectFromDom() {
  if (!currentGuide) return null;
  const root = document.getElementById('guideDetail');
  if (!root) return null;
  const title = root.querySelector('[data-field="title"]')?.textContent?.trim() || currentGuide.title;
  const category = root.querySelector('[data-field="category"]')?.textContent?.trim() || currentGuide.category;
  const summary = root.querySelector('[data-field="summary"]')?.textContent?.trim() || currentGuide.summary;
  const tipsEl = root.querySelector('[data-field="tips"]');
  const tips = (tipsEl?._mdField?.getValue?.() ?? tipsEl?.textContent ?? currentGuide.tips ?? '').toString().trim();
  const features = [...root.querySelectorAll('[data-feature]')].map((el) => el.textContent.trim()).filter(Boolean);
  const steps = [...root.querySelectorAll('[data-step]')].map((el) => {
    const bodyEl = el.querySelector('[data-step-body]');
    return {
      title: el.querySelector('[data-step-title]')?.textContent?.trim() || '',
      body: String(bodyEl?._mdField?.getValue?.() ?? bodyEl?.textContent ?? '').trim(),
      image: el.dataset.image || '',
      video: el.dataset.video || '',
      videoType: el.dataset.videoType || ''
    };
  });
  const faq = [...root.querySelectorAll('[data-faq]')].map((el) => {
    const aEl = el.querySelector('[data-faq-a]');
    return {
      q: el.querySelector('[data-faq-q]')?.textContent?.trim() || '',
      a: String(aEl?._mdField?.getValue?.() ?? aEl?.textContent ?? '').trim()
    };
  });
  const related = [...root.querySelectorAll('[data-related]:checked')].map((el) => el.value);
  const published = root.querySelector('#guidePublished')?.checked ?? currentGuide.published !== false;
  const order = Number(root.querySelector('#guideOrder')?.value ?? currentGuide.order) || 0;
  const level = root.querySelector('#guideLevel')?.value?.trim() ?? currentGuide.level ?? '';
  const duration = root.querySelector('#guideDuration')?.value?.trim() ?? currentGuide.duration ?? '';
  const chaptersRaw = root.querySelector('#guideChapters')?.value?.trim() ?? '';
  let chapters = Array.isArray(currentGuide.chapters) ? currentGuide.chapters : [];
  if (root.querySelector('#guideChapters')) {
    chapters = parseChaptersInput(chaptersRaw);
  }
  const heroYt = root.querySelector('#guideHeroYoutube')?.value?.trim() || '';
  let heroVideo = currentGuide.heroVideo || '';
  let heroVideoType = currentGuide.heroVideoType || '';
  if (heroYt) {
    heroVideo = heroYt;
    heroVideoType = 'youtube';
  }
  const sections = getSections({ ...currentGuide, sections: currentGuide.sections });
  return {
    ...currentGuide,
    title, category, summary, tips, features, steps, faq,
    sections,
    relatedGuides: related.length ? related : (currentGuide.relatedGuides || []),
    published, order,
    level, duration, chapters,
    heroImage: currentGuide.heroImage || '',
    heroVideo, heroVideoType,
    heroOverlays: Array.isArray(currentGuide.heroOverlays) ? currentGuide.heroOverlays : [],
    heroMediaWidthPct: normalizeMediaWidthPct(currentGuide.heroMediaWidthPct, 'full'),
    heroMediaAspect: normalizeMediaAspect(currentGuide.heroMediaAspect)
  };
}

/** Optional CMS field: one chapter per line — `초:제목` or `초 제목` */
function parseChaptersInput(raw) {
  return String(raw || '').split(/\n+/).map((line) => {
    const m = line.trim().match(/^(\d+(?:\.\d+)?)\s*[:：\s]\s*(.+)$/);
    if (!m) return null;
    return { start: Number(m[1]), title: m[2].trim() };
  }).filter(Boolean);
}

function chaptersToInput(chapters) {
  if (!Array.isArray(chapters) || !chapters.length) return '';
  return chapters.map((c) => `${Number(c.start) || 0}: ${c.title || ''}`).join('\n');
}

function guessContentType(file, kind) {
  const t = String(file?.type || '').trim();
  if (t) return t;
  const name = String(file?.name || '').toLowerCase();
  if (kind === 'video' || /\.(mp4|webm|mov|m4v|ogg)$/.test(name)) {
    if (name.endsWith('.webm')) return 'video/webm';
    if (name.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

function isVideoFile(file) {
  if (!file) return false;
  if (String(file.type || '').startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name || '');
}

async function uploadFile(path, file, kind = 'image') {
  const { ref, uploadBytes, getDownloadURL } = st;
  const contentType = guessContentType(file, kind);
  const ext = contentType.includes('png') ? '.png'
    : contentType.includes('webp') ? '.webp'
      : contentType.includes('gif') ? '.gif'
        : contentType.includes('webm') ? '.webm'
          : contentType.startsWith('video/') ? '.mp4'
            : '.jpg';
  const fullPath = /\.[a-z0-9]+$/i.test(path) ? path : `${path}${ext}`;
  const r = ref(storage, fullPath);
  await uploadBytes(r, file, { contentType });
  return getDownloadURL(r);
}

async function saveGuide() {
  if (!currentGuide || !isAdmin) return;
  const data = collectFromDom();
  if (!data) return;
  const slug = data.slug || data.id;
  const btn = document.querySelector('[data-cms="save"]');
  if (btn) btn.disabled = true;
  try {
    if (pendingHeroFile) {
      const isVid = isVideoFile(pendingHeroFile);
      const path = isVid ? `guide-videos/${slug}/hero_${Date.now()}` : `guide-images/${slug}/hero_${Date.now()}`;
      const url = await uploadFile(path, pendingHeroFile, isVid ? 'video' : 'image');
      if (isVid) {
        data.heroVideo = url;
        data.heroVideoType = 'upload';
        data.heroImage = '';
        data.heroOverlays = [];
      } else {
        data.heroImage = url;
        data.heroVideo = '';
        data.heroVideoType = '';
      }
      pendingHeroFile = null;
    }
    for (const [idx, file] of Object.entries(pendingStepFiles)) {
      const i = Number(idx);
      const isVid = isVideoFile(file);
      const path = isVid ? `guide-videos/${slug}/step-${i}_${Date.now()}` : `guide-images/${slug}/step-${i}_${Date.now()}`;
      const url = await uploadFile(path, file, isVid ? 'video' : 'image');
      if (!data.steps[i]) continue;
      if (isVid) { data.steps[i].video = url; data.steps[i].videoType = 'upload'; }
      else { data.steps[i].image = url; }
    }
    pendingStepFiles = {};
    if (!Array.isArray(data.sections)) data.sections = getSections(data);
    else data.sections = data.sections.map((s, i) => normalizeSection(s, i, false));
    for (const [sid, file] of Object.entries(pendingSectionFiles)) {
      if (!file) continue;
      const i = data.sections.findIndex((s) => s.id === sid || String(s.id) === String(sid));
      // Legacy fallback: numeric keys from older sessions
      const idx = i >= 0 ? i : (/^\d+$/.test(sid) ? Number(sid) : -1);
      if (idx < 0 || !data.sections[idx]) continue;
      const isVid = isVideoFile(file);
      const path = isVid
        ? `guide-videos/${slug}/section-${data.sections[idx].id || idx}_${Date.now()}`
        : `guide-images/${slug}/section-${data.sections[idx].id || idx}_${Date.now()}`;
      const url = await uploadFile(path, file, isVid ? 'video' : 'image');
      if (isVid) {
        data.sections[idx].mediaType = 'video';
        data.sections[idx].mediaUrl = url;
        data.sections[idx].posterUrl = '';
      } else {
        data.sections[idx].mediaType = 'image';
        data.sections[idx].mediaUrl = url;
      }
    }
    pendingSectionFiles = {};
    data.steps = sectionsToSteps(data.sections);
    const { doc, setDoc, serverTimestamp } = fs;
    const payload = {
      title: data.title,
      category: data.category,
      slug,
      summary: data.summary,
      tips: data.tips || '',
      heroImage: data.heroImage || '',
      heroVideo: data.heroVideo || '',
      heroVideoType: data.heroVideoType || '',
      heroOverlays: Array.isArray(data.heroOverlays) ? data.heroOverlays : [],
      heroMediaWidthPct: normalizeMediaWidthPct(data.heroMediaWidthPct, 'full'),
      heroMediaAspect: normalizeMediaAspect(data.heroMediaAspect),
      features: data.features || [],
      steps: data.steps || [],
      sections: data.sections || [],
      faq: data.faq || [],
      relatedGuides: data.relatedGuides || [],
      published: data.published !== false,
      order: data.order || 0,
      level: data.level || '',
      duration: data.duration || '',
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      updatedAt: serverTimestamp()
    };
    if (!data.createdAt) payload.createdAt = serverTimestamp();
    await setDoc(doc(db, COLLECTION, data.id || slug), payload, { merge: true });
    currentGuide = { ...data, ...payload, id: data.id || slug };
    setDirty(false);
  } catch (e) {
    console.error(e);
    alert('저장 실패: ' + (e.message || e));
  } finally {
    if (btn) btn.disabled = false;
    if (editMode) renderDetail(currentGuide);
  }
}

async function deleteGuide() {
  if (!currentGuide || !isAdmin) return;
  if (!confirmDelete(`가이드 "${currentGuide.title || currentGuide.slug}"를 삭제할까요?`, { double: true })) return;
  const { doc, deleteDoc } = fs;
  await deleteDoc(doc(db, COLLECTION, currentGuide.id));
  location.href = `${pathBase()}guide/index.html`;
}

async function addGuide() {
  openGuideCreateDialog({ template: false });
}

async function addProductTemplateGuide() {
  openGuideCreateDialog({ template: true });
}

function addSectionTemplate() {
  if (!currentGuide || !editMode || !isAdmin) return;
  const sections = getSections(currentGuide);
  const layout = sections.length % 2 ? 'reverse' : 'normal';
  sections.push(emptyProductSection(layout));
  currentGuide = { ...currentGuide, sections, steps: sectionsToSteps(sections) };
  setDirty(true);
  renderDetail(currentGuide);
  scheduleSave();
}


function bindEditable(root) {
  if (!editMode || !isAdmin) return;
  root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
    el.addEventListener('input', () => scheduleSave());
  });
  root.querySelector('#guidePublished')?.addEventListener('change', () => scheduleSave());
  root.querySelector('#guideOrder')?.addEventListener('input', () => scheduleSave());
  root.querySelectorAll('[data-related]').forEach((el) => el.addEventListener('change', () => scheduleSave()));

  root.querySelector('#guideHeroYoutube')?.addEventListener('change', () => {
    const v = root.querySelector('#guideHeroYoutube')?.value?.trim() || '';
    if (!currentGuide) return;
    if (v) {
      currentGuide.heroVideo = v;
      currentGuide.heroVideoType = 'youtube';
      currentGuide.heroImage = '';
      pendingHeroFile = null;
    } else if (currentGuide.heroVideoType === 'youtube') {
      currentGuide.heroVideo = '';
      currentGuide.heroVideoType = '';
    }
    scheduleSave();
    mountHeroMedia(root, currentGuide, true);
  });

  root.querySelectorAll('[data-step]').forEach((stepEl) => {
    const idx = Number(stepEl.dataset.step);
    const media = stepEl.querySelector('[data-step-media]');
    if (!media) return;
    media.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        pendingStepFiles[idx] = f;
        scheduleSave();
        const url = URL.createObjectURL(f);
        media.innerHTML = f.type.startsWith('video/') ? `<video src="${url}" controls playsinline></video>` : `<img src="${url}" alt="${esc(mediaAltForGuide(currentGuide, currentGuide))}">`;
      };
      input.click();
    });
  });

  root.querySelector('[data-add-feature]')?.addEventListener('click', () => {
    const data = collectFromDom();
    data.features = [...(data.features || []), '새 기능'];
    currentGuide = data;
    setDirty(true);
    renderDetail(data);
    scheduleSave();
  });
  root.querySelector('[data-add-step]')?.addEventListener('click', () => {
    const data = collectFromDom();
    data.steps = [...(data.steps || []), { title: '새 단계', body: '설명을 입력하세요.', image: '', video: '', videoType: '' }];
    currentGuide = data;
    setDirty(true);
    renderDetail(data);
    scheduleSave();
  });
  root.querySelector('[data-add-faq]')?.addEventListener('click', () => {
    const data = collectFromDom();
    data.faq = [...(data.faq || []), { q: '새 질문', a: '답변' }];
    currentGuide = data;
    setDirty(true);
    renderDetail(data);
    scheduleSave();
  });

  root.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.moveKind;
      const idx = Number(btn.dataset.moveIdx);
      const dir = btn.dataset.move === 'up' ? -1 : 1;
      const data = collectFromDom();
      if (kind === 'sections') data.sections = getSections(data);
      const arr = data[kind];
      if (!arr || !arr[idx] || !arr[idx + dir]) return;
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      if (kind === 'sections') data.steps = sectionsToSteps(arr);
      currentGuide = data;
      setDirty(true);
      renderDetail(data);
      scheduleSave();
    });
  });
  root.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.remove;
      const idx = Number(btn.dataset.removeIdx);
      if (kind === 'sections' && !confirmDelete('이 카드 템플릿을 삭제할까요? (슬롯만 제거, 가이드는 유지)')) return;
      const data = collectFromDom();
      if (kind === 'sections') data.sections = getSections(data);
      if (kind === 'sections' && data.sections[idx]) {
        const sid = data.sections[idx].id;
        if (sid) delete pendingSectionFiles[sid];
        delete pendingSectionFiles[idx];
      }
      data[kind] = (data[kind] || []).filter((_, i) => i !== idx);
      if (kind === 'sections') data.steps = sectionsToSteps(data.sections);
      currentGuide = data;
      setDirty(true);
      renderDetail(data);
      scheduleSave();
    });
  });
}

function renderDetail(g) {
  currentGuide = g;
  const root = document.getElementById('guideDetail');
  if (!root || !g) return;
  hideGuideSeoFallback();
  if (!isAdmin && g.published === false) {
    root.innerHTML = `<div class="empty-card">이 가이드는 아직 공개되지 않았습니다.</div>`;
    return;
  }
  if (learnSpyDisconnect) {
    try { learnSpyDisconnect(); } catch (_) {}
    learnSpyDisconnect = null;
  }
  // One screen for view + edit (no separate complex editor page).
  renderDetailPublic(root, g, editMode && isAdmin);
}

function neighborGuides(g) {
  const rows = (allGuides.length
    ? allGuides
    : []).filter((x) => x.published !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = rows.findIndex((x) => (x.slug || x.id) === (g.slug || g.id));
  return {
    prev: idx > 0 ? rows[idx - 1] : null,
    next: idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null,
    related: (g.relatedGuides || [])
      .map((slug) => rows.find((x) => (x.slug || x.id) === slug))
      .filter(Boolean)
      .slice(0, 3)
  };
}

function renderDetailPublic(root, g, editing = false) {
  const sections = getSections(g);
  currentGuide = { ...g, sections };
  const features = g.features || [];
  const toc = sectionTocItems(sections);
  const { prev, next, related } = neighborGuides(g);
  const workflow = GUIDE_PILLAR_MAP[g.slug];
  const hasHeroMedia = !!(g.heroImage || g.heroVideo) || editing;
  const hasVideo = g.heroVideoType === 'upload' || g.heroVideoType === 'youtube';
  const ce = editing ? ' contenteditable="true"' : '';
  const metaBits = [];
  if (!editing && g.category) metaBits.push(esc(g.category));
  if (!editing && g.level) metaBits.push(esc(g.level));
  if (!editing && g.duration) metaBits.push(esc(g.duration));
  if (toc.length) metaBits.push(`${toc.length}단계`);

  const adminMeta = editing ? `<details class="guide-admin-meta">
    <summary>게시 설정 <span class="muted small">공개 · 순서</span></summary>
    <div class="guide-admin-meta-grid">
      <label><input type="checkbox" id="guidePublished" ${g.published !== false ? 'checked' : ''}> 공개</label>
      <label>순서 <input type="number" id="guideOrder" value="${esc(g.order ?? 0)}"></label>
      <label>난이도 <input type="text" id="guideLevel" value="${esc(g.level || '')}" placeholder="초급"></label>
      <label>소요 시간 <input type="text" id="guideDuration" value="${esc(g.duration || '')}" placeholder="3분"></label>
    </div>
  </details>` : '';

  const stepRail = (!editing && toc.length)
    ? `<nav class="guide-step-rail" aria-label="단계 바로가기">
        ${toc.map((t, i) => `<a href="#${esc(t.id)}" data-step-link="${i}"><b>${padStep(i)}</b><span>${esc(t.label)}</span></a>`).join('<i aria-hidden="true"></i>')}
      </nav>`
    : '';

  const tocNav = `<nav class="guide-learn-toc" aria-label="목차">
      <p class="guide-learn-toc-title">${esc(g.title || 'Guide')}</p>
      <a href="#guide-intro" data-toc-link>소개</a>
      ${toc.map((t) => `<a href="#${esc(t.id)}" data-toc-link>${esc(t.label)}</a>`).join('')}
      ${(g.tips || editing) ? '<a href="#guide-tips" data-toc-link>팁</a>' : ''}
      ${editing ? '' : '<a href="#guide-help" data-toc-link>도움말</a>'}
    </nav>
    <details class="guide-learn-toc-mobile">
      <summary>목차</summary>
      <div class="guide-learn-toc-mobile-links">
        <a href="#guide-intro">소개</a>
        ${toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.label)}</a>`).join('')}
        ${(g.tips || editing) ? '<a href="#guide-tips">팁</a>' : ''}
        ${editing ? '' : '<a href="#guide-help">도움말</a>'}
      </div>
    </details>`;

  const featureItems = editing
    ? features.map((f, i) => `<li class="guide-edit-row"><span data-feature${ce}>${esc(f)}</span>
        <span class="guide-item-tools">
          <button type="button" class="ghost mini-btn" data-move="up" data-move-kind="features" data-move-idx="${i}">위로</button>
          <button type="button" class="ghost mini-btn" data-move="down" data-move-kind="features" data-move-idx="${i}">아래로</button>
          <button type="button" class="ghost mini-btn" data-remove="features" data-remove-idx="${i}">삭제</button>
        </span></li>`).join('')
    : features.map((f) => `<li>${esc(f)}</li>`).join('');

  const sectionShells = sections.map((s, i) => {
    const media = resolveSectionMedia(s);
    const hasMedia = !!media || editing;
    const isVid = media?.mediaType === 'video' || media?.mediaType === 'youtube';
    const tools = editing ? `<div class="guide-item-tools guide-inline-step-tools">
      <button type="button" class="ghost mini-btn" data-move="up" data-move-kind="sections" data-move-idx="${i}">위로</button>
      <button type="button" class="ghost mini-btn" data-move="down" data-move-kind="sections" data-move-idx="${i}">아래로</button>
      <button type="button" class="ghost mini-btn danger-btn" data-remove="sections" data-remove-idx="${i}">삭제</button>
    </div>` : '';
    return `<section class="guide-learn-step${isVid ? ' has-video' : ''}${editing ? ' is-editing' : ''}" id="guide-step-${i}" data-guide-section="${i}" data-section-id="${esc(s.id)}">
      <header class="guide-learn-step-head">
        <span class="guide-learn-step-num">${padStep(i)}</span>
        <div class="guide-learn-step-head-main">
          ${editing
            ? `<div data-sec-cat class="guide-learn-badge-slot"></div><div data-sec-title></div>`
            : `${s.category ? `<p class="guide-learn-badge">${esc(s.category)}</p>` : ''}<h2 data-sec-title-slot>${esc(s.title || `단계 ${i + 1}`)}</h2>`}
        </div>
        ${tools}
      </header>
      <div class="guide-learn-step-grid${hasMedia ? '' : ' is-text-only'}">
        <div class="guide-learn-step-copy">
          <div data-sec-body></div>
          <div data-sec-features></div>
        </div>
        ${hasMedia ? `<figure class="guide-learn-step-media" data-bound-media="${esc(media?.mediaUrl || '')}">
          <div data-sec-media class="product-feature-media" data-section-id="${esc(s.id)}"></div>
          ${!editing && media?.mediaCaption ? `<figcaption>${esc(media.mediaCaption)}</figcaption>` : (!editing && s.title ? `<figcaption>${esc(s.title)}</figcaption>` : '')}
        </figure>` : ''}
      </div>
    </section>`;
  }).join('');

  const relatedHtml = (!editing && related.length)
    ? `<div class="guide-related-mini">${related.map((r) => `<a class="guide-learn-card" href="${guideHref(r.slug || r.id)}"><span>${esc(r.category || '관련')}</span><b>${esc(r.title || r.slug)}</b></a>`).join('')}</div>`
    : '';

  root.innerHTML = `
    <div class="guide-learn-shell wrap${editing ? ' is-editing' : ''}">
      <aside class="guide-learn-aside">${tocNav}</aside>
      <div class="guide-learn-main">
        <header class="guide-learn-hero" id="guide-intro">
          <p class="pill portal-pill" data-field="category"${ce}>${esc(g.category || 'Guide')}</p>
          <h1 data-field="title"${ce}>${esc(g.title || '')}</h1>
          <p class="portal-lead" data-field="summary"${ce}>${esc(g.summary || '')}</p>
          ${adminMeta}
          ${metaBits.length ? `<div class="guide-learn-meta">${metaBits.map((b) => `<em>${b}</em>`).join('')}</div>` : ''}
          ${stepRail}
          ${(features.length || editing) ? `<ul class="product-points guide-learn-features">${featureItems || ''}</ul>${editing ? '<button type="button" class="secondary mini-btn" data-add-feature>기능 추가</button>' : ''}` : ''}
        </header>

        ${hasHeroMedia ? `<section class="guide-learn-hero-media-wrap${hasVideo ? ' is-video' : ''}">
          <div class="guide-learn-hero-media" data-hero-media></div>
          ${hasVideo && !editing ? `<div class="guide-learn-hero-side">
            <p class="guide-learn-badge">가이드 영상</p>
            <h2>${esc(g.title || '')}</h2>
            <p>${esc(g.summary || '화면을 따라 가며 기능을 확인하세요.')}</p>
            ${chaptersHtml(g.chapters)}
          </div>` : ''}
        </section>` : '<div class="hidden" data-hero-media></div>'}

        <div id="guideSections" class="guide-learn-steps">${sectionShells || `<p class="muted">${editing ? '아래 + Step 추가로 단계를 만드세요.' : '등록된 단계가 없습니다.'}</p>`}</div>
        ${editing ? `<div class="wrap guide-template-actions"><button type="button" class="primary mini-btn" data-cms-inline="add-section">+ Step 추가</button><span class="muted small">사진·영상은 각 Step 오른쪽(또는 아래) 칸에서 바로 넣습니다.</span></div>` : ''}

        ${(g.tips || editing) ? `<section class="guide-learn-tips" id="guide-tips"><h2>팁</h2><div data-field="tips" class="guide-md-slot"></div></section>` : ''}

        ${editing ? '' : `<section class="guide-learn-help" id="guide-help">
          <h2>문제가 해결되지 않았나요?</h2>
          <p>사용 방법은 Guide에서, 자주 묻는 질문과 오류는 아래 메뉴를 이용하세요.</p>
          <div class="guide-learn-help-actions">
            <a class="guide-learn-btn" href="${guideHref('troubleshooting')}">문제 해결</a>
            <a class="guide-learn-btn" href="${pathBase()}faq.html">FAQ</a>
            ${workflow ? `<a class="guide-learn-btn" href="${pathBase()}${workflow.replace(/^\//, '')}">변환 가이드</a>` : ''}
          </div>
        </section>`}

        ${editing ? '' : `<nav class="guide-learn-pager" aria-label="이전 다음 가이드">
          ${prev ? `<a class="guide-learn-card guide-pager-prev" href="${guideHref(prev.slug || prev.id)}"><span>← 이전 가이드</span><b>${esc(prev.title || prev.slug)}</b></a>` : '<span></span>'}
          ${next ? `<a class="guide-learn-card guide-pager-next" href="${guideHref(next.slug || next.id)}"><span>다음 가이드 →</span><b>${esc(next.title || next.slug)}</b></a>` : '<span></span>'}
        </nav>
        ${relatedHtml}
        <p class="guide-more-all"><a href="${pathBase()}guide/index.html">전체 Guide</a></p>`}
      </div>
    </div>
  `;

  applyGuideDocumentSeo(g.slug || g.id, g.title);
  hideGuideSeoFallback();
  mountHeroMedia(root, g, editing);
  if (editing) {
    bindEditable(root);
    mountGuideSections(root, sections, true);
    mountGuideMarkdownFields(root, g, true);
    root.querySelector('[data-cms-inline="add-section"]')?.addEventListener('click', () => addSectionTemplate());
  } else {
    mountGuideSectionsPublic(root, sections);
    mountGuideMarkdownFields(root, g, false);
    bindGuideImageZoom(root);
    bindChapterSeek(root);
    learnSpyDisconnect = bindScrollSpy(root, '[data-toc-link], [data-step-link]');
  }
}

function mountGuideSectionsPublic(root, sections) {
  sections.forEach((sec, i) => {
    const block = root.querySelector(`[data-guide-section="${i}"]`);
    if (!block) return;
    const body = block.querySelector('[data-sec-body]');
    const feats = block.querySelector('[data-sec-features]');
    const media = block.querySelector('[data-sec-media]');
    if (body) {
      if (sec.body) mountMarkdownField(body, { value: sec.body, editMode: false, isAdmin: false });
      else body.innerHTML = '';
    }
    const fl = (sec.features || []).filter((f) => String(f || '').trim());
    if (feats) {
      feats.innerHTML = fl.length
        ? `<ul class="product-points">${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
        : '';
    }
    const resolved = resolveSectionMedia(sec);
    if (!media || !resolved) {
      // No media for this step — leave empty; never borrow another step/hero.
      return;
    }
    // Bind exactly this section's media URL (assert data attribute matches).
    media.setAttribute('data-bound-url', resolved.mediaUrl);
    mountEditableMedia(media, {
      mediaType: resolved.mediaType,
      mediaUrl: resolved.mediaUrl,
      posterUrl: resolved.posterUrl || '',
      mediaFit: resolved.mediaFit || 'cover',
      mediaWidth: resolved.mediaWidth || 'full',
      mediaWidthPct: resolved.mediaWidthPct,
      mediaAspect: resolved.mediaAspect,
      mediaOverlays: resolved.mediaOverlays || [],
      editMode: false,
      isAdmin: false,
      videoClass: 'product-video',
      mediaAlt: mediaAltForGuide(currentGuide, sec)
    });
  });
}

function bindChapterSeek(root) {
  const video = root.querySelector('.guide-learn-hero-media video');
  root.querySelectorAll('[data-chapter-start]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const start = Number(btn.getAttribute('data-chapter-start'));
      if (!video || !Number.isFinite(start)) return;
      video.currentTime = start;
      video.play?.().catch(() => {});
      root.querySelectorAll('[data-chapter-start]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
}


function heroMediaState(g) {
  if (g.heroVideoType === 'youtube' && g.heroVideo) {
    return { mediaType: 'youtube', mediaUrl: g.heroVideo };
  }
  if (g.heroVideoType === 'upload' && g.heroVideo) {
    return { mediaType: 'video', mediaUrl: g.heroVideo };
  }
  if (g.heroImage) {
    return { mediaType: 'image', mediaUrl: g.heroImage };
  }
  return { mediaType: '', mediaUrl: '' };
}

function mountHeroMedia(root, g, editing) {
  const host = root.querySelector('[data-hero-media]');
  if (!host) return;
  const { mediaType, mediaUrl } = heroMediaState(g);
  if (!editing && !mediaUrl) {
    host.classList.remove('vcms-media-slot', 'product-feature-media', 'has-media', 'is-empty');
    host.innerHTML = '';
    return;
  }
  mountEditableMedia(host, {
    mediaType,
    mediaUrl,
    mediaFit: 'cover',
    mediaWidth: 'full',
    mediaWidthPct: g.heroMediaWidthPct,
    mediaAspect: g.heroMediaAspect,
    mediaOverlays: Array.isArray(g.heroOverlays) ? g.heroOverlays : [],
    editMode: !!editing,
    isAdmin: !!editing,
    videoClass: 'product-video',
    mediaAlt: mediaAltForGuide(g, { title: '대표 화면' }),
    onChange: (m) => {
      if (!currentGuide || !editing) return;
      currentGuide.heroMediaWidthPct = normalizeMediaWidthPct(m.mediaWidthPct, m.mediaWidth);
      currentGuide.heroMediaAspect = normalizeMediaAspect(m.mediaAspect);
      if (m.mediaType === 'image') {
        currentGuide.heroImage = m.mediaUrl || '';
        currentGuide.heroVideo = '';
        currentGuide.heroVideoType = '';
        currentGuide.heroOverlays = Array.isArray(m.mediaOverlays) ? m.mediaOverlays : [];
        const yt = document.getElementById('guideHeroYoutube');
        if (yt) yt.value = '';
      } else if (m.mediaType === 'video') {
        currentGuide.heroVideo = m.mediaUrl || '';
        currentGuide.heroVideoType = 'upload';
        currentGuide.heroImage = '';
        currentGuide.heroOverlays = [];
        const yt = document.getElementById('guideHeroYoutube');
        if (yt) yt.value = '';
      } else if (m.mediaType === 'youtube') {
        currentGuide.heroVideo = m.mediaUrl || '';
        currentGuide.heroVideoType = 'youtube';
        currentGuide.heroImage = '';
        currentGuide.heroOverlays = [];
        const yt = document.getElementById('guideHeroYoutube');
        if (yt) yt.value = m.mediaUrl || '';
      } else {
        currentGuide.heroImage = '';
        currentGuide.heroVideo = '';
        currentGuide.heroVideoType = '';
        currentGuide.heroOverlays = [];
        pendingHeroFile = null;
        const yt = document.getElementById('guideHeroYoutube');
        if (yt) yt.value = '';
      }
      scheduleSave();
    },
    onFile: (f) => {
      if (!editing) return;
      if (f.kind === 'clear' || f.kind === 'youtube') pendingHeroFile = null;
      else if (f.file) pendingHeroFile = f.file;
      scheduleSave();
    }
  });
}

function mountGuideMarkdownFields(root, g, editing) {
  ensureMarkdownCss();
  const uid = auth?.currentUser?.uid || 'anon';
  const prefix = `cms-md/${uid}/guide/${g.slug || g.id || 'draft'}`;
  const tipsSlot = root.querySelector('[data-field="tips"]');
  if (tipsSlot) {
    mountMarkdownField(tipsSlot, {
      value: g.tips || '',
      placeholder: '팁 본문 작성',
      editMode: editing,
      isAdmin: editing,
      draftKey: `guide:${g.id || g.slug}:tips`,
      storagePrefix: prefix,
      onChange: (v) => { currentGuide.tips = v; scheduleSave(); },
      onClear: () => { currentGuide.tips = ''; scheduleSave(); }
    });
  }
  (g.faq || []).forEach((item, i) => {
    const slot = root.querySelectorAll('[data-faq-a]')[i];
    if (!slot) return;
    mountMarkdownField(slot, {
      value: item.a || '',
      placeholder: 'FAQ 답변 작성',
      editMode: editing,
      isAdmin: editing,
      draftKey: `guide:${g.id || g.slug}:faq:${i}`,
      storagePrefix: prefix,
      onChange: (v) => {
        if (!currentGuide.faq[i]) return;
        currentGuide.faq[i].a = v;
        scheduleSave();
      },
      onClear: () => {
        if (!currentGuide.faq[i]) return;
        currentGuide.faq[i].a = '';
        scheduleSave();
      }
    });
  });
}

function mountGuideSections(root, sections, editing) {
  sections.forEach((sec, i) => {
    const block = root.querySelector(`[data-guide-section="${i}"]`);
    if (!block) return;
    const cat = block.querySelector('[data-sec-cat]');
    const title = block.querySelector('[data-sec-title]');
    const body = block.querySelector('[data-sec-body]');
    const feats = block.querySelector('[data-sec-features]');
    const media = block.querySelector('[data-sec-media]');
    const sectionId = sec.id;

    const refreshThumb = (s) => {
      const host = root.querySelector(`[data-step-thumb="${CSS.escape(sectionId)}"]`);
      const fileEl = block.querySelector('.guide-step-media-file');
      const resolved = resolveSectionMedia(s);
      if (host) {
        if (resolved?.mediaType === 'image') {
          host.innerHTML = `<img src="${esc(resolved.mediaUrl)}" alt="${esc(mediaAltForGuide(currentGuide, s))}" loading="lazy" decoding="async">`;
        } else if (resolved?.mediaType === 'video') {
          host.innerHTML = `<video src="${esc(resolved.mediaUrl)}" muted playsinline preload="metadata"></video>`;
        } else if (resolved?.mediaType === 'youtube') {
          host.innerHTML = `<span class="guide-step-media-yt">YouTube</span>`;
        } else {
          host.innerHTML = `<span class="guide-step-media-empty">미디어 없음</span>`;
        }
      }
      if (fileEl) {
        fileEl.textContent = resolved
          ? `${resolved.mediaType} · ${mediaFileLabel(resolved.mediaUrl)}`
          : '이미지/영상을 아래에서 이 Step에만 지정하세요.';
      }
    };

    if (!editing) {
      if (cat) {
        if (sec.category) cat.innerHTML = `<p class="guide-learn-badge">${esc(sec.category)}</p>`;
        else cat.innerHTML = '';
      }
      if (title) title.innerHTML = sec.title ? `<h2>${esc(sec.title)}</h2>` : '';
      if (body) {
        if (sec.body) mountMarkdownField(body, { value: sec.body, editMode: false, isAdmin: false });
        else body.innerHTML = '';
      }
      const fl = (sec.features || []).filter((f) => String(f || '').trim());
      if (feats) {
        feats.innerHTML = fl.length
          ? `<ul class="product-points">${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          : '';
      }
      const resolved = resolveSectionMedia(sec);
      if (media && resolved) {
        mountEditableMedia(media, {
          mediaType: resolved.mediaType,
          mediaUrl: resolved.mediaUrl,
          posterUrl: resolved.posterUrl || '',
          mediaFit: resolved.mediaFit || 'cover',
          mediaWidth: resolved.mediaWidth || 'full',
          mediaWidthPct: resolved.mediaWidthPct,
          mediaAspect: resolved.mediaAspect,
          mediaOverlays: resolved.mediaOverlays || [],
          editMode: false,
          isAdmin: false
        });
      }
      return;
    }

    mountEditableText(cat, {
      tag: 'p', className: 'guide-learn-badge', value: sec.category || '', placeholder: '카테고리 작성',
      editMode: true, isAdmin: true,
      onChange: (v) => { currentGuide.sections[i].category = v; scheduleSave(); },
      onClear: () => { currentGuide.sections[i].category = ''; scheduleSave(); }
    });
    mountEditableText(title, {
      tag: 'h2', value: sec.title || '', placeholder: '제목 작성',
      editMode: true, isAdmin: true,
      onChange: (v) => { currentGuide.sections[i].title = v; scheduleSave(); },
      onClear: () => { currentGuide.sections[i].title = ''; scheduleSave(); }
    });
    mountMarkdownField(body, {
      value: sec.body || '',
      placeholder: '설명 작성',
      editMode: true,
      isAdmin: true,
      draftKey: `guide:${currentGuide.id || currentGuide.slug}:sec:${sectionId}:body`,
      storagePrefix: `cms-md/${(typeof auth !== 'undefined' && auth?.currentUser?.uid) || 'anon'}/guide/${currentGuide.slug || currentGuide.id || 'draft'}`,
      onChange: (v) => { currentGuide.sections[i].body = v; scheduleSave(); },
      onClear: () => { currentGuide.sections[i].body = ''; scheduleSave(); }
    });
    mountEditableFeatureList(feats, {
      features: sec.features || [],
      editMode: true, isAdmin: true,
      onChange: (v) => { currentGuide.sections[i].features = v; scheduleSave(); }
    });

    const resolved = resolveSectionMedia(sec) || {
      mediaType: '', mediaUrl: '', posterUrl: '', mediaFit: 'cover',
      mediaWidth: 'full', mediaWidthPct: 100, mediaAspect: 1.6, mediaOverlays: []
    };
    mountEditableMedia(media, {
      mediaType: resolved.mediaType,
      mediaUrl: resolved.mediaUrl,
      posterUrl: resolved.posterUrl || '',
      mediaFit: resolved.mediaFit || 'cover',
      mediaWidth: resolved.mediaWidth || 'full',
      mediaWidthPct: resolved.mediaWidthPct,
      mediaAspect: resolved.mediaAspect,
      mediaOverlays: resolved.mediaOverlays || [],
      editMode: true, isAdmin: true,
      onChange: (m) => {
        const target = currentGuide.sections.find((x) => x.id === sectionId) || currentGuide.sections[i];
        if (!target) return;
        target.mediaType = m.mediaType || '';
        target.mediaUrl = m.mediaUrl || '';
        target.posterUrl = m.posterUrl || '';
        target.mediaFit = m.mediaFit || 'cover';
        target.mediaWidth = m.mediaWidth || 'full';
        target.mediaWidthPct = m.mediaWidthPct;
        target.mediaAspect = m.mediaAspect;
        target.mediaOverlays = Array.isArray(m.mediaOverlays) ? m.mediaOverlays : [];
        refreshThumb(target);
        scheduleSave();
      },
      onFile: (f) => {
        if (f.kind === 'clear' || f.kind === 'youtube') delete pendingSectionFiles[sectionId];
        else if (f.file) pendingSectionFiles[sectionId] = f.file;
        scheduleSave();
      }
    });

    block.querySelector(`[data-section-flip="${i}"]`)?.addEventListener('click', () => {
      const target = currentGuide.sections.find((x) => x.id === sectionId) || currentGuide.sections[i];
      if (!target) return;
      target.layout = target.layout === 'reverse' ? 'normal' : 'reverse';
      setDirty(true);
      renderDetail(currentGuide);
      scheduleSave();
    });
  });
}

function bindCmsBar() {
  const bar = document.getElementById('guideCmsBar');
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  // List page: keep one primary add action; template option lives in the dialog.
  if (isGuideListPage()) {
    const addTpl = bar.querySelector('[data-cms="add-template"]');
    if (addTpl) addTpl.classList.add('hidden');
    const addBtn = bar.querySelector('[data-cms="add"]');
    if (addBtn) addBtn.textContent = '+ 가이드 추가';
    if (!bar.querySelector('.guide-cms-hint')) {
      const hint = document.createElement('span');
      hint.className = 'guide-cms-hint muted small';
      hint.textContent = '카드의 편집으로 바로 수정';
      bar.appendChild(hint);
    }
  }
  if (isGuideDetailPage() && !bar.querySelector('.guide-cms-hint')) {
    const hint = document.createElement('span');
    hint.className = 'guide-cms-hint muted small';
    hint.textContent = 'Ctrl+S 저장';
    bar.appendChild(hint);
  }
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cms]');
    if (!btn || !isAdmin) return;
    const act = btn.getAttribute('data-cms');
    if (act === 'edit') { editMode = true; refreshAdminChrome(); if (currentGuide) renderDetail(currentGuide); setDirty(dirty); }
    if (act === 'preview') {
      if (dirty) await saveGuide();
      editMode = false;
      refreshAdminChrome();
      if (currentGuide) renderDetail(currentGuide);
      setDirty(false);
    }
    if (act === 'save') await saveGuide();
    if (act === 'delete') await deleteGuide();
    if (act === 'add') await addGuide();
    if (act === 'add-template') await addProductTemplateGuide();
    if (act === 'add-section') addSectionTemplate();
  });
  if (!document.documentElement.dataset.guideCmsKeys) {
    document.documentElement.dataset.guideCmsKeys = '1';
    document.addEventListener('keydown', (e) => {
      if (!isAdmin) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && String(e.key || '').toLowerCase() === 's') {
        if (!isGuideDetailPage() || !editMode) return;
        e.preventDefault();
        saveGuide();
      }
      if (mod && String(e.key || '').toLowerCase() === 'e') {
        if (!isGuideDetailPage() || editMode || !currentGuide) return;
        e.preventDefault();
        editMode = true;
        refreshAdminChrome();
        renderDetail(currentGuide);
        setDirty(dirty);
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (dirty && editMode) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
}

function bootDetailShell() {
  if (!isGuideDetailPage()) return;
  document.body.classList.add('guide-cms-active');
  hideGuideSeoFallback();
}

export async function initGuideCms() {
  if (!isGuideListPage() && !isGuideDetailPage()) return;
  bootDetailShell();
  bindCmsBar();
  try {
    await initFirebase();
    if (isAdmin) {
      await ensureSeed();
      await repairStaleGuideDocsIfAdmin();
    }
    allGuides = isAdmin
      ? await loadAllGuidesAdmin()
      : await loadPublishedGuides();
    // Public list: if Firestore is empty or blocked, still show built-in menus.
    if (!allGuides.length) {
      allGuides = SEED_GUIDES.map((g) => ({ ...g, id: g.slug, published: true }));
    }
    if (isGuideListPage()) {
      renderList(allGuides);
      refreshAdminChrome();
      return;
    }
    const slug = guideSlugFromLocation();
    applyGuideDocumentSeo(slug);
    hideGuideSeoFallback();
    if (!slug) {
      document.getElementById('guideDetail').innerHTML = `<div class="empty-card">slug가 없습니다. <a href="${pathBase()}guide/index.html">목록으로</a></div>`;
      return;
    }
    const g = await loadGuideBySlug(slug);
    if (!g) {
      const seeded = SEED_GUIDES.find((x) => x.slug === slug);
      if (seeded) {
        renderDetail(seeded);
        if (isAdmin && shouldStartEditing()) {
          editMode = true;
          clearEditQuery();
          renderDetail(currentGuide || seeded);
        }
        refreshAdminChrome();
        setDirty(false);
        return;
      }
      hideGuideSeoFallback();
      document.getElementById('guideDetail').innerHTML = `<div class="empty-card">가이드를 찾을 수 없습니다. <a href="${pathBase()}guide/index.html">목록으로</a></div>`;
      return;
    }
    renderDetail(g);
    if (isAdmin && shouldStartEditing()) {
      editMode = true;
      clearEditQuery();
      renderDetail(currentGuide || g);
    }
    refreshAdminChrome();
    setDirty(false);
  } catch (e) {
    console.error(e);
    hideGuideSeoFallback();
    const el = document.getElementById('guideList') || document.getElementById('guideDetail');
    if (el) el.innerHTML = `<div class="empty-card">가이드를 불러오지 못했습니다. Firestore 규칙을 배포했는지 확인하세요.<br><span class="muted">${esc(e.message || e)}</span></div>`;
  }
}

bootDetailShell();
if (isGuideListPage() || isGuideDetailPage()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initGuideCms());
  else initGuideCms();
}
