/**
 * Guide Visual CMS — list + detail read/edit against Firestore `guides`.
 * Self-contained Firebase init (shares app with app.js via getApps).
 */

import {
  esc,
  youtubeId,
  confirmDelete
} from './visual-cms.js?v=product-cms-1';


const CONFIG = window.MIDIAI_CONFIG || {};
const FB = 'https://www.gstatic.com/firebasejs/10.12.5';
const COLLECTION = 'guides';
const AUTOSAVE_MS = 1500;

/** slug → technical workflow SEO path (null = hide CTA) */
export const GUIDE_WORKFLOW_MAP = {
  'youtube-to-midi': '/workflow/youtube-to-midi',
  'audio-to-midi': '/workflow/audio-to-midi',
  'pdf-to-midi': '/workflow/pdf-to-midi',
  'midi-editor': '/workflow/midi-editor'
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
  { slug: 'license', title: 'License', category: '계정', summary: '라이선스 구매·활성화·기기 정보를 확인합니다.', order: 90, features: ['Google 로그인', '평생 라이선스', 'HWID'], steps: [{ title: '구매', body: '구매 페이지에서 라이선스를 결제합니다.' }, { title: '활성화', body: '앱에서 Google 로그인하면 라이선스가 연결됩니다.' }], faq: [{ q: '기기를 바꾸면?', a: '계정 기준으로 관리됩니다. 문제가 있으면 1:1 문의로 HWID를 알려주세요.' }], tips: 'Installer의 Show HWID로 기기 정보를 확인할 수 있습니다.', relatedGuides: ['getting-started', 'troubleshooting'] },
  { slug: 'faq', title: 'FAQ', category: '도움말', summary: '자주 묻는 사용 질문과 답변입니다.', order: 100, features: ['변환', '편집', '라이선스'], steps: [{ title: '질문 확인', body: '아래 FAQ에서 관련 항목을 찾아보세요.' }], faq: [{ q: '변환이 느려요', a: '구간을 짧게 하고, 다른 무거운 앱을 닫은 뒤 다시 시도하세요.' }, { q: '결과가 부정확해요', a: '단선·피아노 소스에 가깝게 구간을 고르고 Editor에서 양자화·수동 보정하세요.' }], tips: '사이트 FAQ·1:1 문의도 함께 이용할 수 있습니다.', relatedGuides: ['troubleshooting', 'getting-started'] },
  { slug: 'troubleshooting', title: 'Troubleshooting', category: '도움말', summary: '설치·변환·로그인 문제를 해결합니다.', order: 110, features: ['설치 복구', '로그인', '변환 실패'], steps: [{ title: 'Installer 복구', body: 'Installer에서 Install/Update로 복구를 실행합니다.' }, { title: '로그 확인', body: 'System Check 결과를 저장해 둡니다.' }, { title: '문의', body: '1:1 문의에 로그·HWID를 첨부합니다.' }], faq: [{ q: '로그인이 안 돼요', a: '인앱 브라우저가 아닌 Chrome/Edge에서 포털에 로그인해 보세요.' }], tips: '지원 티켓에 버전·HWID·오류 메시지를 함께 보내면 해결이 빠릅니다.', relatedGuides: ['license', 'faq'] }
];

const pathBase = () => window.MIDIAI_BASE_PATH || './';
const ytId = youtubeId;

let db, auth, storage, fs, st;
let isAdmin = false;
let editMode = false;
let dirty = false;
let saveTimer = null;
let currentGuide = null;
let allGuides = [];
let pendingHeroFile = null;
let pendingStepFiles = {};

function isGuideListPage() {
  const p = location.pathname.replace(/\\/g, '/').toLowerCase();
  return /\/guide\/?(index\.html)?$/.test(p) || p.endsWith('/guide/index.html');
}
function isGuideDetailPage() {
  return (location.pathname.split('/').pop() || '') === 'guide.html';
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
  if (!el) return;
  el.textContent = dirty ? '● 저장되지 않음' : '✓ 저장 완료';
  el.classList.toggle('is-dirty', dirty);
  el.classList.toggle('is-saved', !dirty);
}

function scheduleSave() {
  if (!editMode || !isAdmin || !currentGuide) return;
  setDirty(true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveGuide().catch(console.error), AUTOSAVE_MS);
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
  });
  document.body.classList.toggle('guide-cms-editing', editMode && isAdmin);
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
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('guides orderBy fallback', e);
    const q = query(collection(db, COLLECTION), where('published', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
}

async function loadAllGuidesAdmin() {
  const { collection, getDocs } = fs;
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function loadGuideBySlug(slug) {
  const { collection, query, where, getDocs, doc, getDoc } = fs;
  try {
    const byId = await getDoc(doc(db, COLLECTION, slug));
    if (byId.exists()) return { id: byId.id, ...byId.data() };
  } catch (e) {
    console.warn('guide getById', e);
  }
  try {
    const q = query(collection(db, COLLECTION), where('slug', '==', slug));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) {
    console.error('guide getBySlug', e);
    return null;
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
  if (image) return `<div class="${cls}"${editable}><img src="${esc(image)}" alt="" loading="lazy" decoding="async"></div>`;
  if (opts.editable) return `<div class="${cls} guide-media-empty"${editable}><span>이미지/영상 추가</span></div>`;
  return '';
}

function renderList(guides) {
  allGuides = guides || [];
  const root = document.getElementById('guideList');
  if (!root) return;
  const rows = isAdmin ? allGuides : allGuides.filter((g) => g.published !== false);
  if (!rows.length) {
    root.innerHTML = `<div class="empty-card">등록된 가이드가 없습니다.</div>`;
    return;
  }
  root.innerHTML = rows.map((g) => {
    const href = `${pathBase()}guide.html?slug=${encodeURIComponent(g.slug || g.id)}`;
    const img = g.heroImage ? `<img src="${esc(g.heroImage)}" alt="" width="1280" height="720" loading="lazy">` : `<div class="product-card-icon" aria-hidden="true">▣</div>`;
    const badge = g.published === false ? `<span class="guide-draft-badge">초안</span>` : '';
    return `<a class="product-card guide-card ${g.heroImage ? '' : 'product-card-text'}" href="${esc(href)}">${img}<div><h3>${esc(g.title || g.slug)}${badge}</h3><p>${esc(g.summary || '')}</p><span class="guide-card-cat">${esc(g.category || '')}</span></div></a>`;
  }).join('');
}

function collectFromDom() {
  if (!currentGuide) return null;
  const root = document.getElementById('guideDetail');
  if (!root) return null;
  const title = root.querySelector('[data-field="title"]')?.textContent?.trim() || currentGuide.title;
  const category = root.querySelector('[data-field="category"]')?.textContent?.trim() || currentGuide.category;
  const summary = root.querySelector('[data-field="summary"]')?.textContent?.trim() || currentGuide.summary;
  const tips = root.querySelector('[data-field="tips"]')?.textContent?.trim() || '';
  const features = [...root.querySelectorAll('[data-feature]')].map((el) => el.textContent.trim()).filter(Boolean);
  const steps = [...root.querySelectorAll('[data-step]')].map((el) => ({
    title: el.querySelector('[data-step-title]')?.textContent?.trim() || '',
    body: el.querySelector('[data-step-body]')?.textContent?.trim() || '',
    image: el.dataset.image || '',
    video: el.dataset.video || '',
    videoType: el.dataset.videoType || ''
  }));
  const faq = [...root.querySelectorAll('[data-faq]')].map((el) => ({
    q: el.querySelector('[data-faq-q]')?.textContent?.trim() || '',
    a: el.querySelector('[data-faq-a]')?.textContent?.trim() || ''
  }));
  const related = [...root.querySelectorAll('[data-related]:checked')].map((el) => el.value);
  const published = root.querySelector('#guidePublished')?.checked ?? currentGuide.published !== false;
  const order = Number(root.querySelector('#guideOrder')?.value ?? currentGuide.order) || 0;
  const heroYt = root.querySelector('#guideHeroYoutube')?.value?.trim() || '';
  let heroVideo = currentGuide.heroVideo || '';
  let heroVideoType = currentGuide.heroVideoType || '';
  if (heroYt) {
    heroVideo = heroYt;
    heroVideoType = 'youtube';
  }
  return {
    ...currentGuide,
    title, category, summary, tips, features, steps, faq,
    relatedGuides: related.length ? related : (currentGuide.relatedGuides || []),
    published, order,
    heroImage: currentGuide.heroImage || '',
    heroVideo, heroVideoType
  };
}

async function uploadFile(path, file) {
  const { ref, uploadBytes, getDownloadURL } = st;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
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
      const isVid = pendingHeroFile.type.startsWith('video/');
      const path = isVid ? `guide-videos/${slug}/hero_${Date.now()}` : `guide-images/${slug}/hero_${Date.now()}`;
      const url = await uploadFile(path, pendingHeroFile);
      if (isVid) { data.heroVideo = url; data.heroVideoType = 'upload'; }
      else { data.heroImage = url; }
      pendingHeroFile = null;
    }
    for (const [idx, file] of Object.entries(pendingStepFiles)) {
      const i = Number(idx);
      const isVid = file.type.startsWith('video/');
      const path = isVid ? `guide-videos/${slug}/step-${i}_${Date.now()}` : `guide-images/${slug}/step-${i}_${Date.now()}`;
      const url = await uploadFile(path, file);
      if (!data.steps[i]) continue;
      if (isVid) { data.steps[i].video = url; data.steps[i].videoType = 'upload'; }
      else { data.steps[i].image = url; }
    }
    pendingStepFiles = {};
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
      features: data.features || [],
      steps: data.steps || [],
      faq: data.faq || [],
      relatedGuides: data.relatedGuides || [],
      published: data.published !== false,
      order: data.order || 0,
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
  if (!isAdmin) return;
  const slug = prompt('새 가이드 slug (영문-케밥):', 'new-guide');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { alert('slug 형식이 올바르지 않습니다.'); return; }
  const { doc, getDoc, setDoc, serverTimestamp } = fs;
  const ref = doc(db, COLLECTION, slug);
  if ((await getDoc(ref)).exists()) { alert('이미 존재하는 slug입니다.'); return; }
  await setDoc(ref, {
    title: '새 가이드',
    category: '일반',
    slug,
    summary: '요약을 입력하세요.',
    tips: '',
    heroImage: '',
    heroVideo: '',
    heroVideoType: '',
    features: ['기능 1'],
    steps: [{ title: '1단계', body: '설명을 입력하세요.', image: '', video: '', videoType: '' }],
    faq: [{ q: '질문', a: '답변' }],
    relatedGuides: [],
    published: false,
    order: 999,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  location.href = `${pathBase()}guide.html?slug=${encodeURIComponent(slug)}`;
}

function bindEditable(root) {
  if (!editMode || !isAdmin) return;
  root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
    el.addEventListener('input', () => scheduleSave());
  });
  root.querySelector('#guidePublished')?.addEventListener('change', () => scheduleSave());
  root.querySelector('#guideOrder')?.addEventListener('input', () => scheduleSave());
  root.querySelector('#guideHeroYoutube')?.addEventListener('change', () => scheduleSave());
  root.querySelectorAll('[data-related]').forEach((el) => el.addEventListener('change', () => scheduleSave()));

  const heroDrop = root.querySelector('[data-hero-media]');
  if (heroDrop) {
    const pick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        pendingHeroFile = f;
        scheduleSave();
        const url = URL.createObjectURL(f);
        if (f.type.startsWith('video/')) heroDrop.innerHTML = `<video src="${url}" controls playsinline></video>`;
        else heroDrop.innerHTML = `<img src="${url}" alt="">`;
      };
      input.click();
    };
    heroDrop.addEventListener('click', pick);
    heroDrop.addEventListener('dragover', (e) => { e.preventDefault(); heroDrop.classList.add('dragover'); });
    heroDrop.addEventListener('dragleave', () => heroDrop.classList.remove('dragover'));
    heroDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      heroDrop.classList.remove('dragover');
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      pendingHeroFile = f;
      scheduleSave();
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video/')) heroDrop.innerHTML = `<video src="${url}" controls playsinline></video>`;
      else heroDrop.innerHTML = `<img src="${url}" alt="">`;
    });
  }

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
        media.innerHTML = f.type.startsWith('video/') ? `<video src="${url}" controls playsinline></video>` : `<img src="${url}" alt="">`;
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
      const arr = data[kind];
      if (!arr || !arr[idx] || !arr[idx + dir]) return;
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
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
      const data = collectFromDom();
      data[kind] = (data[kind] || []).filter((_, i) => i !== idx);
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
  if (!isAdmin && g.published === false) {
    root.innerHTML = `<div class="empty-card">이 가이드는 아직 공개되지 않았습니다.</div>`;
    return;
  }
  const editing = editMode && isAdmin;
  const ce = editing ? ' contenteditable="true"' : '';
  const workflow = GUIDE_WORKFLOW_MAP[g.slug];
  const updated = g.updatedAt?.toDate ? g.updatedAt.toDate() : (g.updatedAt?.seconds ? new Date(g.updatedAt.seconds * 1000) : null);
  const features = g.features || [];
  const steps = g.steps || [];
  const faq = g.faq || [];
  const related = g.relatedGuides || [];

  const adminMeta = editing ? `<div class="guide-admin-meta">
    <label><input type="checkbox" id="guidePublished" ${g.published !== false ? 'checked' : ''}> 공개</label>
    <label>순서 <input type="number" id="guideOrder" value="${esc(g.order ?? 0)}"></label>
    <label class="guide-yt-field">Hero YouTube URL <input type="url" id="guideHeroYoutube" value="${g.heroVideoType === 'youtube' ? esc(g.heroVideo || '') : ''}" placeholder="https://www.youtube.com/watch?v=..."></label>
  </div>` : '';

  const featureItems = features.map((f, i) => editing
    ? `<li class="guide-edit-row"><span data-feature${ce}>${esc(f)}</span>
        <span class="guide-item-tools">
          <button type="button" data-move="up" data-move-kind="features" data-move-idx="${i}">↑</button>
          <button type="button" data-move="down" data-move-kind="features" data-move-idx="${i}">↓</button>
          <button type="button" data-remove="features" data-remove-idx="${i}">삭제</button>
        </span></li>`
    : `<li>${esc(f)}</li>`).join('');

  const stepBlocks = steps.map((s, i) => {
    const tools = editing ? `<div class="guide-item-tools">
      <button type="button" data-move="up" data-move-kind="steps" data-move-idx="${i}">↑</button>
      <button type="button" data-move="down" data-move-kind="steps" data-move-idx="${i}">↓</button>
      <button type="button" data-remove="steps" data-remove-idx="${i}">삭제</button>
    </div>` : '';
    const media = mediaHtml(s.image, s.video, s.videoType, { className: 'product-feature-media', editable: editing });
    return `<section class="wrap product-feature ${i % 2 ? 'product-feature-reverse' : ''}" data-step="${i}" data-image="${esc(s.image || '')}" data-video="${esc(s.video || '')}" data-video-type="${esc(s.videoType || '')}">
      <div class="product-feature-copy">
        ${tools}
        <p class="eyebrow">Step ${i + 1}</p>
        <h2 data-step-title${ce}>${esc(s.title || '')}</h2>
        <p data-step-body${ce}>${esc(s.body || '')}</p>
      </div>
      <div data-step-media>${media || (editing ? '<div class="product-feature-media guide-media-empty"><span>미디어 추가</span></div>' : '')}</div>
    </section>`;
  }).join('');

  const faqBlocks = faq.map((item, i) => editing
    ? `<div class="guide-faq-item" data-faq>
        <div class="guide-item-tools">
          <button type="button" data-move="up" data-move-kind="faq" data-move-idx="${i}">↑</button>
          <button type="button" data-move="down" data-move-kind="faq" data-move-idx="${i}">↓</button>
          <button type="button" data-remove="faq" data-remove-idx="${i}">삭제</button>
        </div>
        <h3 data-faq-q${ce}>${esc(item.q || '')}</h3>
        <p data-faq-a${ce}>${esc(item.a || '')}</p>
      </div>`
    : `<details class="guide-faq-item"><summary>${esc(item.q || '')}</summary><p>${esc(item.a || '')}</p></details>`).join('');

  const relatedPicker = editing
    ? `<div class="guide-related-picker">${allGuides.filter((x) => x.slug !== g.slug && x.id !== g.id).map((x) => {
        const val = x.slug || x.id;
        const checked = related.includes(val) || related.includes(x.id) ? 'checked' : '';
        return `<label><input type="checkbox" data-related value="${esc(val)}" ${checked}> ${esc(x.title || val)}</label>`;
      }).join('')}</div>`
    : '';

  const relatedLinks = related.map((slug) => {
    const hit = allGuides.find((x) => x.slug === slug || x.id === slug);
    const title = hit?.title || slug;
    return `<a class="product-card guide-card product-card-text" href="${pathBase()}guide.html?slug=${encodeURIComponent(slug)}"><div class="product-card-icon" aria-hidden="true">→</div><div><h3>${esc(title)}</h3></div></a>`;
  }).join('');

  root.innerHTML = `
    <section class="wrap product-hero guide-hero">
      <p class="pill portal-pill" data-field="category"${ce}>${esc(g.category || 'Guide')}</p>
      <h1 data-field="title"${ce}>${esc(g.title || '')}</h1>
      <p class="portal-lead" data-field="summary"${ce}>${esc(g.summary || '')}</p>
      ${adminMeta}
      <div class="guide-hero-media" data-hero-media>${mediaHtml(g.heroImage, g.heroVideo, g.heroVideoType, { className: 'guide-media', editable: editing }) || (editing ? '<div class="guide-media guide-media-empty"><span>Hero 이미지/영상</span></div>' : '')}</div>
    </section>
    <section class="wrap guide-features">
      <h2>주요 기능</h2>
      <ul class="product-points">${featureItems || '<li class="muted">기능 목록이 없습니다.</li>'}</ul>
      ${editing ? '<button type="button" class="secondary mini-btn" data-add-feature>기능 추가</button>' : ''}
    </section>
    <div class="guide-steps">${stepBlocks || (editing ? '' : '<p class="wrap muted">단계 설명이 없습니다.</p>')}</div>
    ${editing ? '<div class="wrap"><button type="button" class="secondary mini-btn" data-add-step>단계 추가</button></div>' : ''}
    ${(g.tips || editing) ? `<section class="wrap guide-tips"><h2>팁</h2><p data-field="tips"${ce}>${esc(g.tips || (editing ? '팁을 입력하세요.' : ''))}</p></section>` : ''}
    <section class="wrap guide-faq"><h2>FAQ</h2>${faqBlocks}${editing ? '<button type="button" class="secondary mini-btn" data-add-faq>FAQ 추가</button>' : ''}</section>
    <section class="wrap guide-related"><h2>관련 가이드</h2>${relatedPicker}<div class="product-grid">${relatedLinks}</div></section>
    ${workflow ? `<div class="wrap workflow-seo-cta"><a class="secondary" href="${pathBase()}${workflow.replace(/^\//, '')}">기술적인 Workflow 설명 보기</a></div>` : ''}
    ${updated ? `<p class="wrap muted guide-updated">업데이트: ${updated.toLocaleDateString('ko-KR')}</p>` : ''}
  `;

  document.title = `${g.title || 'Guide'} — MidiAI Studio`;
  bindEditable(root);
}

function bindCmsBar() {
  const bar = document.getElementById('guideCmsBar');
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cms]');
    if (!btn || !isAdmin) return;
    const act = btn.getAttribute('data-cms');
    if (act === 'edit') { editMode = true; refreshAdminChrome(); if (currentGuide) renderDetail(currentGuide); }
    if (act === 'preview') {
      if (dirty) await saveGuide();
      editMode = false;
      refreshAdminChrome();
      if (currentGuide) renderDetail(currentGuide);
    }
    if (act === 'save') await saveGuide();
    if (act === 'delete') await deleteGuide();
    if (act === 'add') await addGuide();
  });
}

export async function initGuideCms() {
  if (!isGuideListPage() && !isGuideDetailPage()) return;
  bindCmsBar();
  try {
    await initFirebase();
    if (isAdmin) await ensureSeed();
    allGuides = isAdmin
      ? await loadAllGuidesAdmin()
      : await loadPublishedGuides();
    if (isGuideListPage()) {
      renderList(allGuides);
      refreshAdminChrome();
      return;
    }
    const slug = new URLSearchParams(location.search).get('slug') || '';
    if (!slug) {
      document.getElementById('guideDetail').innerHTML = `<div class="empty-card">slug가 없습니다. <a href="${pathBase()}guide/index.html">목록으로</a></div>`;
      return;
    }
    const g = await loadGuideBySlug(slug);
    if (!g) {
      document.getElementById('guideDetail').innerHTML = `<div class="empty-card">가이드를 찾을 수 없습니다. <a href="${pathBase()}guide/index.html">목록으로</a></div>`;
      return;
    }
    renderDetail(g);
    refreshAdminChrome();
    setDirty(false);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('guideList') || document.getElementById('guideDetail');
    if (el) el.innerHTML = `<div class="empty-card">가이드를 불러오지 못했습니다. Firestore 규칙을 배포했는지 확인하세요.<br><span class="muted">${esc(e.message || e)}</span></div>`;
  }
}

if (isGuideListPage() || isGuideDetailPage()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initGuideCms());
  else initGuideCms();
}
