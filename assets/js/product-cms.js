/**
 * Product page Visual CMS — Firestore `productSections`.
 * Reuses shared visual-cms primitives.
 */
import {
  esc,
  confirmDelete,
  createSaveStatus,
  mountEditableText,
  mountEditableFeatureList,
  mountEditableMedia,
  getFirebase,
  waitForAdmin,
  onAuthAdmin,
  uploadToStorage
} from './visual-cms.js?v=media-annot-5';
import { mountMarkdownField } from './markdown/index.js';

const COLLECTION = 'productSections';
const PAGE = (location.pathname.split('/').pop() || '') === 'product.html';

const SEED = [
  {
    id: 'feature-studio',
    kind: 'feature',
    layout: 'normal',
    category: 'Studio',
    title: '영상·오디오를 MIDI로',
    body: 'YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.',
    features: ['YouTube 링크 분석', '웨이브폼 미리듣기', '출력 악기·구간 선택'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-studio.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/ai-midi-converter-home.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 10,
    published: true
  },
  {
    id: 'feature-midi',
    kind: 'feature',
    layout: 'reverse',
    category: 'MIDI 편집 PRO',
    title: '멀티트랙 피아노 롤',
    body: '변환된 MIDI를 바로 편집합니다. 128종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.',
    features: ['멀티트랙 피아노 롤', '128종 악기 지원', '벨로시티·CC 파라미터 편집'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-midi.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/midi-editor-piano-roll.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 20,
    published: true
  },
  {
    id: 'feature-score-convert',
    kind: 'feature',
    layout: 'normal',
    category: '악보 변환 · BETA',
    title: 'MIDI ↔ 악보',
    body: 'MIDI를 PDF·MusicXML 악보로 저장하고, PDF 악보를 인식해 MIDI로 다시 변환합니다. 곡 제목·작사·작곡 메타데이터까지 함께 다룰 수 있습니다.',
    features: ['MIDI → PDF / MusicXML', 'PDF → MIDI 변환', '악보 미리보기 · 결과 폴더 저장'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-score-convert.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/sheet-music-pdf-musicxml-convert.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 30,
    published: true
  },
  {
    id: 'feature-score-editor',
    kind: 'feature',
    layout: 'reverse',
    category: '악보 편집기 · BETA',
    title: '악보를 바로 수정',
    body: '변환된 악보를 페이지·연속·타임라인으로 보며 음표와 벨로시티를 편집합니다. AI 검토 제안으로 피치 점프·겹침 음표 등을 확인하고 바로 반영할 수 있습니다.',
    features: ['페이지 / 연속 / 타임라인 보기', '음표 선택·속성 편집', 'AI 검토 제안'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-score.mp4?v=20260720-score-gif',
    posterUrl: './assets/images/product/sheet-music-score-editor.jpg?v=20260720-score-gif',
    mediaFit: 'cover',
    order: 40,
    published: true
  },
  {
    id: 'card-home',
    kind: 'card',
    layout: 'normal',
    category: '',
    title: '홈 · 포털 연동',
    body: '공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.',
    features: [],
    mediaType: 'image',
    mediaUrl: './assets/images/product/ai-midi-converter-home.jpg?v=20260720-frames',
    posterUrl: '',
    mediaFit: 'cover',
    order: 50,
    published: true
  },
  {
    id: 'card-community',
    kind: 'card',
    layout: 'normal',
    category: '',
    title: '커뮤니티',
    body: 'Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.',
    features: [],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-community.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/midiai-studio-community.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 60,
    published: true
  },
  {
    id: 'card-library',
    kind: 'card',
    layout: 'normal',
    category: '',
    title: '라이브러리',
    body: '변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.',
    features: [],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    order: 70,
    published: true,
    iconOnly: true
  }
];

let isAdmin = false;
let authUid = "anon";
let editMode = false;
let sections = [];
let draft = [];
let pendingFiles = {}; // id -> { kind, file }
let status;

function cloneSections(rows) {
  return rows.map((s) => ({
    ...s,
    features: [...(s.features || [])],
    mediaOverlays: Array.isArray(s.mediaOverlays) ? s.mediaOverlays.map((o) => ({ ...o })) : []
  }));
}

/** Mark draft dirty only — persist happens on explicit Save. */
function markDirty() {
  status?.setDirty(true);
}

async function ensureSeed() {
  const { db, fs } = await getFirebase();
  const { collection, getDocs, doc, setDoc, serverTimestamp } = fs;
  const snap = await getDocs(collection(db, COLLECTION));
  if (!snap.empty) return;
  const now = serverTimestamp();
  for (const s of SEED) {
    await setDoc(doc(db, COLLECTION, s.id), { ...s, createdAt: now, updatedAt: now });
  }
}

async function loadSections() {
  const { db, fs } = await getFirebase();
  const { collection, getDocs, query, where } = fs;
  let snap;
  if (isAdmin) {
    snap = await getDocs(collection(db, COLLECTION));
  } else {
    try {
      snap = await getDocs(query(collection(db, COLLECTION), where('published', '==', true)));
    } catch (e) {
      // Older rules or missing index: fall back to full read only if rules allow.
      console.warn('productSections published query failed', e);
      snap = await getDocs(collection(db, COLLECTION));
    }
  }
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => isAdmin || s.published !== false);
  rows.sort((a, b) => (a.order || 0) - (b.order || 0));
  return rows;
}

function refreshChrome() {
  const bar = document.getElementById('productCmsBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !isAdmin);
  bar.querySelectorAll('[data-pcms]').forEach((btn) => {
    const act = btn.getAttribute('data-pcms');
    if (act === 'edit') btn.classList.toggle('hidden', editMode);
    if (act === 'preview') btn.classList.toggle('hidden', !editMode);
    if (act === 'save' || act === 'cancel') btn.disabled = !editMode;
    if (act === 'add-card') btn.classList.toggle('hidden', !editMode);
  });
  document.body.classList.toggle('product-cms-editing', editMode && isAdmin);
  document.body.classList.toggle('vcms-editing', editMode && isAdmin);
}

function featureSectionEl(sec, idx) {
  const section = document.createElement('section');
  section.className = `wrap product-feature${sec.layout === 'reverse' ? ' product-feature-reverse' : ''}`;
  section.dataset.sectionId = sec.id;
  section.dataset.kind = 'feature';

  const copy = document.createElement('div');
  copy.className = 'product-feature-copy';

  if (editMode && isAdmin) {
    const cardTools = document.createElement('div');
    cardTools.className = 'vcms-card-settings';
    cardTools.innerHTML = `<button type="button" class="ghost mini-btn" data-card-settings>카드 설정</button>`;
    cardTools.querySelector('[data-card-settings]').addEventListener('click', () => openCardSettings(sec.id));
    copy.appendChild(cardTools);
  }

  const catSlot = document.createElement('div');
  catSlot.className = 'vcms-slot-category';
  copy.appendChild(catSlot);

  const titleSlot = document.createElement('div');
  titleSlot.className = 'vcms-slot-title';
  copy.appendChild(titleSlot);

  const bodySlot = document.createElement('div');
  bodySlot.className = 'vcms-slot-body';
  copy.appendChild(bodySlot);

  const featSlot = document.createElement('div');
  featSlot.className = 'vcms-slot-features';
  copy.appendChild(featSlot);

  const media = document.createElement('div');
  media.className = 'product-feature-media';

  section.appendChild(copy);
  section.appendChild(media);

  mountEditableText(catSlot, {
    tag: 'p',
    className: 'eyebrow',
    value: sec.category || '',
    placeholder: '카테고리 작성',
    editMode, isAdmin,
    onChange: (v) => { draft[idx].category = v; markDirty(); },
    onClear: () => { draft[idx].category = ''; markDirty(); }
  });
  mountEditableText(titleSlot, {
    tag: 'h2',
    value: sec.title || '',
    placeholder: '제목 작성',
    editMode, isAdmin,
    onChange: (v) => { draft[idx].title = v; markDirty(); },
    onClear: () => { draft[idx].title = ''; markDirty(); }
  });
  mountMarkdownField(bodySlot, {
    value: sec.body || '',
    placeholder: '설명 작성',
    editMode,
    isAdmin,
    draftKey: `product:${sec.id || idx}:body`,
    storagePrefix: `cms-md/${authUid}/product`,
    onChange: (v) => { draft[idx].body = v; markDirty(); },
    onClear: () => { draft[idx].body = ''; markDirty(); }
  });
  mountEditableFeatureList(featSlot, {
    features: sec.features || [],
    editMode, isAdmin,
    onChange: (v) => { draft[idx].features = v; markDirty(); }
  });
  mountEditableMedia(media, {
    mediaType: sec.mediaType || '',
    mediaUrl: sec.mediaUrl || '',
    posterUrl: sec.posterUrl || '',
    mediaFit: sec.mediaFit || 'cover',
    mediaWidth: sec.mediaWidth || 'full',
    mediaOverlays: sec.mediaOverlays || [],
    editMode, isAdmin,
    onChange: (m) => {
      Object.assign(draft[idx], m);
      markDirty();
    },
    onFile: (f) => {
      if (f.kind === 'clear') delete pendingFiles[sec.id];
      else if (f.file) pendingFiles[sec.id] = f;
      else delete pendingFiles[sec.id];
      markDirty();
    }
  });

  return section;
}

function cardEl(sec, idx) {
  const article = document.createElement('article');
  const hasMedia = !!(sec.mediaUrl && sec.mediaType);
  article.className = `product-card${(!hasMedia && sec.iconOnly) || (!hasMedia && !editMode) ? ' product-card-text' : ''}`;
  article.dataset.sectionId = sec.id;
  article.dataset.kind = 'card';

  if (editMode && isAdmin) {
    const cardTools = document.createElement('div');
    cardTools.className = 'vcms-card-settings vcms-card-settings-abs';
    cardTools.innerHTML = `<button type="button" class="ghost mini-btn" data-card-settings>카드 설정</button>`;
    cardTools.querySelector('[data-card-settings]').addEventListener('click', () => openCardSettings(sec.id));
    article.appendChild(cardTools);
  }

  const mediaHost = document.createElement('div');
  mediaHost.className = 'product-card-media-host';
  // Keep media frame always; icon-only cards use icon as public fallback when empty.
  if (!hasMedia && !editMode && (sec.iconOnly || !isAdmin)) {
    mediaHost.innerHTML = `<div class="product-card-icon" aria-hidden="true">▣</div>`;
  } else {
    mountEditableMedia(mediaHost, {
      mediaType: sec.mediaType || '',
      mediaUrl: sec.mediaUrl || '',
      posterUrl: sec.posterUrl || '',
      mediaFit: sec.mediaFit || 'cover',
      mediaWidth: sec.mediaWidth || 'full',
      mediaOverlays: sec.mediaOverlays || [],
      editMode, isAdmin,
      videoClass: 'product-video product-card-video',
      onChange: (m) => { Object.assign(draft[idx], m); if (m.mediaUrl) draft[idx].iconOnly = false; markDirty(); },
      onFile: (f) => {
        if (f.kind === 'clear') { delete pendingFiles[sec.id]; draft[idx].iconOnly = true; }
        else if (f.file) { pendingFiles[sec.id] = f; draft[idx].iconOnly = false; }
        markDirty();
      }
    });
  }
  article.appendChild(mediaHost);

  const copy = document.createElement('div');
  const titleSlot = document.createElement('div');
  const bodySlot = document.createElement('div');
  copy.appendChild(titleSlot);
  copy.appendChild(bodySlot);
  article.appendChild(copy);

  mountEditableText(titleSlot, {
    tag: 'h3',
    value: sec.title || '',
    placeholder: '제목 작성',
    editMode, isAdmin,
    onChange: (v) => { draft[idx].title = v; markDirty(); },
    onClear: () => { draft[idx].title = ''; markDirty(); }
  });
  mountMarkdownField(bodySlot, {
    value: sec.body || '',
    placeholder: '설명 작성',
    editMode,
    isAdmin,
    draftKey: `product:${sec.id || idx}:body`,
    storagePrefix: `cms-md/${authUid}/product`,
    onChange: (v) => { draft[idx].body = v; markDirty(); },
    onClear: () => { draft[idx].body = ''; markDirty(); }
  });

  return article;
}

function openCardSettings(id) {
  const idx = draft.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const sec = draft[idx];
  const choice = prompt(
    '카드 설정\n1) 좌우 배치 전환\n2) 카드 전체 삭제\n3) 취소\n번호를 입력하세요:',
    '1'
  );
  if (choice === '1') {
    if (sec.kind !== 'feature') { alert('좌우 배치는 feature 카드만 지원합니다.'); return; }
    sec.layout = sec.layout === 'reverse' ? 'normal' : 'reverse';
    markDirty();
    render();
    return;
  }
  if (choice === '2') {
    if (!confirmDelete(`카드 "${sec.title || sec.id}" 전체를 삭제할까요?`, { double: true })) return;
    draft.splice(idx, 1);
    delete pendingFiles[id];
    markDirty();
    render();
    return;
  }
}

function render() {
  const featuresRoot = document.getElementById('productFeatures');
  const cardsRoot = document.getElementById('productCards');
  if (!featuresRoot || !cardsRoot) return;

  const rows = editMode && isAdmin ? draft : draft.filter((s) => s.published !== false);

  featuresRoot.innerHTML = '';
  cardsRoot.innerHTML = '';

  rows.forEach((sec) => {
    const idx = draft.findIndex((s) => s.id === sec.id);
    if (sec.kind === 'feature') featuresRoot.appendChild(featureSectionEl(sec, idx));
    else if (sec.kind === 'card') cardsRoot.appendChild(cardEl(sec, idx));
  });
}

async function saveAll() {
  if (!isAdmin) return;
  const { db, fs } = await getFirebase();
  const { doc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } = fs;
  const btn = document.querySelector('[data-pcms="save"]');
  if (btn) btn.disabled = true;
  try {
    for (const sec of draft) {
      const pending = pendingFiles[sec.id];
      if (pending?.file) {
        const isVid = pending.kind === 'video' || pending.file.type.startsWith('video/');
        const path = isVid
          ? `product-videos/${sec.id}/${Date.now()}_${pending.file.name.replace(/[^\w.-]+/g, '_')}`
          : `product-images/${sec.id}/${Date.now()}_${pending.file.name.replace(/[^\w.-]+/g, '_')}`;
        const url = await uploadToStorage(path, pending.file);
        sec.mediaUrl = url;
        sec.mediaType = isVid ? 'video' : 'image';
        if (isVid) sec.posterUrl = sec.posterUrl || '';
      }
      const payload = {
        kind: sec.kind || 'feature',
        layout: sec.layout || 'normal',
        category: sec.category || '',
        title: sec.title || '',
        body: sec.body || '',
        features: (sec.features || []).filter((f) => String(f || '').trim()),
        mediaType: sec.mediaType || '',
        mediaUrl: sec.mediaUrl || '',
        posterUrl: sec.posterUrl || '',
        mediaFit: sec.mediaFit || 'cover',
        mediaWidth: sec.mediaWidth || 'full',
        mediaOverlays: Array.isArray(sec.mediaOverlays) ? sec.mediaOverlays : [],
        order: sec.order || 0,
        published: sec.published !== false,
        iconOnly: !!sec.iconOnly,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, COLLECTION, sec.id), payload, { merge: true });
    }

    // hard-delete removed cards
    const snap = await getDocs(collection(db, COLLECTION));
    const keep = new Set(draft.map((s) => s.id));
    for (const d of snap.docs) {
      if (!keep.has(d.id)) await deleteDoc(d.ref);
    }

    pendingFiles = {};
    sections = cloneSections(draft);
    status?.setDirty(false);
  } catch (e) {
    console.error(e);
    alert('저장 실패: ' + (e.message || e));
  } finally {
    if (btn) btn.disabled = false;
    if (editMode) render();
  }
}

function cancelEdits() {
  if (status?.dirty && !confirm('저장되지 않은 변경사항을 버리고 취소할까요?')) return;
  draft = cloneSections(sections);
  pendingFiles = {};
  editMode = false;
  status?.setDirty(false);
  refreshChrome();
  render();
}

function addFeatureCard() {
  const id = `feature-${Date.now().toString(36)}`;
  const maxOrder = draft.reduce((m, s) => Math.max(m, s.order || 0), 0);
  draft.push({
    id,
    kind: 'feature',
    layout: 'normal',
    category: '새 카테고리',
    title: '새 제목',
    body: '설명을 작성하세요.',
    features: ['기능 1'],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    mediaWidth: 'full',
    mediaOverlays: [],
    order: maxOrder + 10,
    published: true
  });
  markDirty();
  render();
}

function bindBar() {
  const bar = document.getElementById('productCmsBar');
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pcms]');
    if (!btn || !isAdmin) return;
    const act = btn.getAttribute('data-pcms');
    if (act === 'edit') {
      editMode = true;
      draft = cloneSections(sections);
      refreshChrome();
      render();
    }
    if (act === 'preview') {
      if (status?.dirty) await saveAll();
      editMode = false;
      refreshChrome();
      render();
    }
    if (act === 'save') await saveAll();
    if (act === 'cancel') cancelEdits();
    if (act === 'add-card') addFeatureCard();
  });
}

async function initProductCms() {
  if (!PAGE) return;
  status = createSaveStatus('productCmsStatus');
  status.bindUnload();
  bindBar();

  const fallback = document.getElementById('productStaticFallback');
  try {
    const first = await waitForAdmin();
    isAdmin = first.isAdmin;
    authUid = first.user?.uid || "anon";
    if (isAdmin) await ensureSeed();
    sections = await loadSections();
    if (!sections.length) sections = cloneSections(SEED);
    draft = cloneSections(sections);
    if (fallback) {
      fallback.hidden = true;
      fallback.setAttribute('aria-hidden', 'true');
    }
    refreshChrome();
    render();

    onAuthAdmin(async ({ user, isAdmin: admin }) => {
      isAdmin = admin;
      authUid = user?.uid || "anon";
      if (!admin) editMode = false;
      if (admin) {
        await ensureSeed();
        sections = await loadSections();
        draft = cloneSections(sections);
      }
      refreshChrome();
      render();
    });
  } catch (e) {
    console.error(e);
    if (fallback) {
      fallback.hidden = false;
      const msg = document.getElementById('productCmsError');
      if (msg) msg.textContent = esc(e.message || String(e));
    }
  }
}

if (PAGE) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProductCms);
  else initProductCms();
}
