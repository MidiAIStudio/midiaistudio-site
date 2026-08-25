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
  uploadToStorage,
  normalizeMediaWidthPct,
  normalizeMediaAspect
} from './visual-cms.js?v=slot-scale-22';
import { mountMarkdownField } from './markdown/index.js';

const COLLECTION = 'productSections';
const PAGE = (location.pathname.split('/').pop() || '') === 'product.html';
/** Client overlay: older Firestore copy yields to this SEED until admin Save. */
const SEED_REV = 20260825;

/** Firestore rejects `undefined` field values. */
function omitUndefined(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out;
}

const SEED = [
  {
    id: 'feature-studio',
    kind: 'feature',
    layout: 'normal',
    category: '가져오기 · 변환',
    title: 'YouTube / 오디오 → 피아노 MIDI',
    body: '주력은 YouTube 링크와 MP3·WAV를 피아노 MIDI로 채보하는 것입니다. 웨이브폼에서 구간을 고른 뒤 Studio에서 변환합니다. Band / Orchestra는 Preview이며, 스템을 나눈 뒤 각 스템을 MIDI로 채보합니다. 곡에 따라 결과 품질이 달라질 수 있습니다.',
    features: ['YouTube · MP3 / WAV → 피아노 MIDI', '구간 선택 · 웨이브폼 미리듣기', 'Band / Orchestra Preview · 스템 → MIDI'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-studio.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/ai-midi-converter-home.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 10,
    published: true,
    seedRevision: SEED_REV
  },
  {
    id: 'feature-midi',
    kind: 'feature',
    layout: 'reverse',
    category: 'MIDI 작업실',
    title: '변환 결과를 MIDI 프로젝트처럼 다듬기',
    body: 'MIDI Editor는 노트 한두 개를 고치는 화면이 아닙니다. 피아노 롤에서 멀티트랙을 다루고, 앱 안에서 바로 재생하며 양자화·이조·템포·벨로시티를 조정합니다.',
    features: ['Piano Roll · 멀티트랙 · Velocity', 'Quantize · Transpose · Tempo map', '재생 · GM 악기 · Mixer / CC'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-midi.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/midi-editor-piano-roll.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 20,
    published: true,
    seedRevision: SEED_REV
  },
  {
    id: 'feature-assistant',
    kind: 'feature',
    layout: 'normal',
    category: 'AI Assistant',
    title: 'MIDI를 정리하고, 연주하기 쉽게 다듬기',
    body: '채보 신경망과는 다른 보정·편곡 도구입니다. MIDI를 정리하고, 연주하기 쉬운 조를 찾고, 특정 악기에서 치기 쉬운 파트로 다시 씁니다. 모든 곡을 원하는 악기로 자동 변환하는 기능은 아닙니다.',
    features: ['Cleanup · Humanize · Optimize · Verify', 'Easy Key · White Keys — 쉬운 조, 흰건반 단순화', 'Instrument Arrange — 예: 바이올린처럼 연주하기 쉬운 파트로 재작성'],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    order: 30,
    published: true,
    seedRevision: SEED_REV
  },
  {
    id: 'feature-score-editor',
    kind: 'feature',
    layout: 'reverse',
    category: 'Score Editor · 계속 개선 중',
    title: '악보로 보고, 기보를 수정',
    body: 'MIDI를 악보로 보기만 하는 화면이 아닙니다. 음표·쉼표, 이음줄, 강약, 가사 등을 앱 안에서 고친 뒤 MusicXML·PDF로 내보냅니다. 전문 출판 악보 편집기는 아니며, 첫 실행에 실험 안내가 있습니다.',
    features: ['음표·쉼표 편집 · Grand Staff · Voice', 'Tie / Slur · Dynamics · Articulation · Lyrics', 'MusicXML · Native PDF 내보내기'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-score.mp4?v=20260720-score-gif',
    posterUrl: './assets/images/product/sheet-music-score-editor.jpg?v=20260720-score-gif',
    mediaFit: 'cover',
    order: 40,
    published: true,
    seedRevision: SEED_REV
  },
  {
    id: 'feature-score-convert',
    kind: 'feature',
    layout: 'normal',
    category: 'PDF 악보 · Beta',
    title: 'Score Editor에서 악보 PDF 가져오기',
    body: 'YouTube·오디오 변환과 같은 완성형 채보가 아닙니다. Score Editor에서 PDF 악보를 가져오면 인식해 MIDI / MusicXML로 만듭니다. 인식 품질은 악보 상태에 따라 달라지며 Beta로 제공됩니다.',
    features: ['Score Editor → PDF 가져오기', '인식 후 MIDI / MusicXML', '이후 MIDI Editor · Score Editor에서 보정'],
    mediaType: 'video',
    mediaUrl: './assets/videos/clip-score-convert.mp4?v=20260720-frames',
    posterUrl: './assets/images/product/sheet-music-pdf-musicxml-convert.jpg?v=20260720-frames',
    mediaFit: 'cover',
    order: 50,
    published: true,
    seedRevision: SEED_REV
  },
  {
    id: 'card-library',
    kind: 'card',
    layout: 'normal',
    category: '',
    title: 'Library',
    body: '단순 저장 폴더가 아닙니다. 변환·편집 결과를 다시 찾고, 미리듣고, MIDI Editor 또는 Score Editor로 다시 여는 작업 허브입니다.',
    features: [],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    order: 60,
    published: true,
    iconOnly: true,
    seedRevision: SEED_REV
  },
  {
    id: 'card-playback',
    kind: 'card',
    layout: 'normal',
    category: '',
    title: '재생 · 사운드팩',
    body: '앱 안에서 MIDI를 바로 재생하고, 선택 구간·반복 재생을 사용합니다. 고품질 사운드팩은 선택 설치입니다.',
    features: [],
    mediaType: '',
    mediaUrl: '',
    posterUrl: '',
    mediaFit: 'cover',
    order: 65,
    published: true,
    iconOnly: true,
    seedRevision: SEED_REV
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
    order: 70,
    published: true,
    seedRevision: SEED_REV
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
    order: 80,
    published: true,
    seedRevision: SEED_REV
  }
];

function applySeedRevision(loaded) {
  const byId = new Map((loaded || []).map((s) => [s.id, {
    ...s,
    features: [...(s.features || [])],
    mediaOverlays: Array.isArray(s.mediaOverlays) ? s.mediaOverlays.map((o) => ({ ...o })) : []
  }]));
  for (const seed of SEED) {
    const cur = byId.get(seed.id);
    if (!cur) {
      byId.set(seed.id, { ...seed, features: [...(seed.features || [])], mediaOverlays: [] });
      continue;
    }
    const rev = Number(cur.seedRevision) || 0;
    if (rev >= SEED_REV) continue;
    const keepMedia = !!(cur.mediaUrl && seed.mediaUrl);
    byId.set(seed.id, {
      ...cur,
      kind: seed.kind,
      layout: seed.layout,
      category: seed.category,
      title: seed.title,
      body: seed.body,
      features: [...(seed.features || [])],
      order: seed.order,
      published: seed.published !== false,
      iconOnly: !!seed.iconOnly,
      seedRevision: SEED_REV,
      mediaType: keepMedia ? (cur.mediaType || seed.mediaType) : seed.mediaType,
      mediaUrl: keepMedia ? cur.mediaUrl : (seed.mediaUrl || ''),
      posterUrl: keepMedia ? (cur.posterUrl || seed.posterUrl || '') : (seed.posterUrl || ''),
      mediaFit: cur.mediaFit || seed.mediaFit || 'cover'
    });
  }
  const out = [...byId.values()];
  out.sort((a, b) => (a.order || 0) - (b.order || 0));
  return out;
}

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
  const hasMedia = !!(sec.mediaUrl && sec.mediaType);
  section.className = `wrap product-feature${sec.layout === 'reverse' ? ' product-feature-reverse' : ''}${(!hasMedia && !editMode) ? ' product-feature-text' : ''}`;
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
  if (hasMedia || (editMode && isAdmin)) {
    section.appendChild(media);
  }

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
  if (hasMedia || (editMode && isAdmin)) {
    mountEditableMedia(media, {
      mediaType: sec.mediaType || '',
      mediaUrl: sec.mediaUrl || '',
      posterUrl: sec.posterUrl || '',
      mediaFit: sec.mediaFit || 'cover',
      mediaWidth: sec.mediaWidth || 'full',
      mediaWidthPct: sec.mediaWidthPct,
      mediaAspect: sec.mediaAspect,
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
  }

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
      mediaWidthPct: sec.mediaWidthPct,
      mediaAspect: sec.mediaAspect,
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
  if (!(editMode && isAdmin)) {
    document.dispatchEvent(new CustomEvent('midiai:static-i18n'));
  }
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
      const payload = omitUndefined({
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
        mediaWidthPct: normalizeMediaWidthPct(sec.mediaWidthPct, sec.mediaWidth),
        mediaAspect: normalizeMediaAspect(sec.mediaAspect),
        mediaOverlays: Array.isArray(sec.mediaOverlays) ? sec.mediaOverlays : [],
        order: sec.order || 0,
        published: sec.published !== false,
        iconOnly: !!sec.iconOnly,
        seedRevision: Number(sec.seedRevision) || SEED_REV,
        updatedAt: serverTimestamp()
      });
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

function hideProductFallback() {
  const fallback = document.getElementById('productStaticFallback');
  if (!fallback) return;
  fallback.hidden = true;
  fallback.setAttribute('aria-hidden', 'true');
}

function showProductFallback(errMsg) {
  const fallback = document.getElementById('productStaticFallback');
  if (!fallback) return;
  fallback.hidden = false;
  fallback.removeAttribute('aria-hidden');
  const featuresRoot = document.getElementById('productFeatures');
  if (featuresRoot) featuresRoot.innerHTML = '';
  if (errMsg) {
    const msg = document.getElementById('productCmsError');
    if (msg) {
      msg.hidden = false;
      msg.textContent = esc(errMsg);
    }
  }
}

function sectionsFingerprint(list) {
  return JSON.stringify((list || []).map((s) => ({
    id: s.id,
    kind: s.kind,
    layout: s.layout,
    category: s.category,
    title: s.title,
    body: s.body,
    features: s.features,
    mediaType: s.mediaType,
    mediaUrl: s.mediaUrl,
    posterUrl: s.posterUrl,
    mediaFit: s.mediaFit,
    mediaWidth: s.mediaWidth,
    mediaWidthPct: s.mediaWidthPct,
    mediaAspect: s.mediaAspect,
    mediaOverlays: s.mediaOverlays,
    order: s.order,
    published: s.published,
    iconOnly: s.iconOnly,
    seedRevision: s.seedRevision
  })));
}

async function initProductCms() {
  if (!PAGE) return;
  status = createSaveStatus('productCmsStatus');
  status.bindUnload();
  bindBar();

  // Paint CMS-shaped seed immediately (same aspect/slot chrome as final) so the
  // Firestore await doesn't leave a differently-sized static fallback on screen.
  draft = cloneSections(SEED);
  sections = cloneSections(SEED);
  refreshChrome();
  render();
  hideProductFallback();
  document.body.classList.add('product-cms-painted');

  try {
    const first = await waitForAdmin();
    isAdmin = first.isAdmin;
    authUid = first.user?.uid || "anon";
    if (isAdmin) await ensureSeed();
    let loaded = await loadSections();
    if (!loaded.length) loaded = cloneSections(SEED);
    loaded = applySeedRevision(loaded);
    const prevFp = sectionsFingerprint(draft);
    sections = cloneSections(loaded);
    draft = cloneSections(sections);
    refreshChrome();
    if (sectionsFingerprint(draft) !== prevFp) render();

    onAuthAdmin(async ({ user, isAdmin: admin }) => {
      isAdmin = admin;
      authUid = user?.uid || "anon";
      if (!admin) editMode = false;
      if (admin) {
        await ensureSeed();
        sections = await loadSections();
        if (!sections.length) sections = cloneSections(SEED);
        sections = applySeedRevision(sections);
        draft = cloneSections(sections);
      }
      refreshChrome();
      render();
    });
  } catch (e) {
    console.error(e);
    showProductFallback(e.message || String(e));
    document.body.classList.add('product-cms-painted');
  }
}

if (PAGE) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProductCms);
  else initProductCms();
}
