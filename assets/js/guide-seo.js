/** Generated from scripts/guide-seo-data.mjs — do not edit by hand. */
export const GUIDE_SEO = {
  "getting-started": {
    "title": "MidiAI Studio 시작하기 — 설치부터 첫 MIDI 변환",
    "description": "MidiAI Studio 설치, Google 로그인, 무료 체험으로 첫 MIDI 변환까지. YouTube·음원 변환 전에 확인할 시작 가이드입니다.",
    "canonical": "https://midiaistudio.com/guide/getting-started/",
    "h1": "MidiAI Studio 시작하기"
  },
  "youtube-to-midi": {
    "title": "유튜브 MIDI 변환 가이드 | MidiAI Studio",
    "description": "유튜브 음악·피아노 커버를 MIDI로 변환하는 방법. URL 검색, 구간 선택, AI 변환, 피아노롤 편집까지 MidiAI Studio 화면 기준으로 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/youtube-to-midi/",
    "h1": "유튜브 → MIDI 사용법 (MidiAI Studio)"
  },
  "audio-to-midi": {
    "title": "음원·MP3를 MIDI로 변환하는 방법 | MidiAI Studio",
    "description": "MP3, WAV 등 음원을 MIDI로 변환하는 방법. 파일 업로드, 구간·악기 선택, AI 채보 후 피아노롤 편집까지 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/audio-to-midi/",
    "h1": "음원 → MIDI 사용법 (MidiAI Studio)"
  },
  "pdf-to-midi": {
    "title": "PDF → MIDI 사용 가이드 | MidiAI Studio",
    "description": "악보 PDF를 인식해 편집 가능한 MIDI로 만드는 방법. 스캔 악보 팁, MIDI·악보 편집 연동을 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/pdf-to-midi/",
    "h1": "악보 PDF → MIDI 사용법 (MidiAI Studio)"
  },
  "midi-editor": {
    "title": "MIDI 편집 및 피아노롤 사용법 | MidiAI Studio",
    "description": "변환된 MIDI를 멀티트랙 피아노롤에서 편집하는 방법. 노트, 벨로시티, 악기 변경, 양자화까지 MidiAI Studio MIDI 에디터 가이드입니다.",
    "canonical": "https://midiaistudio.com/guide/midi-editor/",
    "h1": "MIDI 편집·피아노롤 사용법 (MidiAI Studio)"
  },
  "score-editor": {
    "title": "악보 편집기 사용법 | MidiAI Studio",
    "description": "변환된 악보를 페이지·타임라인에서 수정하는 방법. 음표 속성과 AI 검토, PDF·MusicXML 내보내기를 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/score-editor/",
    "h1": "Score Editor로 악보 다듬기"
  },
  "ai-assistant": {
    "title": "AI 채보 보조 — AI Assistant | MidiAI Studio",
    "description": "AI로 변환·편집한 MIDI를 검토하는 방법. 자동 채보 결과를 다듬을 때 쓰는 MidiAI Studio AI Assistant 가이드입니다.",
    "canonical": "https://midiaistudio.com/guide/ai-assistant/",
    "h1": "AI Assistant 사용법 (MidiAI Studio)"
  },
  "library": {
    "title": "라이브러리에서 MIDI 다시 열기 | MidiAI Studio",
    "description": "변환·편집한 MIDI를 라이브러리에 모아 두고 다시 열어 작업을 이어가는 방법을 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/library/",
    "h1": "라이브러리 사용법"
  },
  "license": {
    "title": "라이선스 활성화 가이드 | MidiAI Studio",
    "description": "MidiAI Studio Lifetime 라이선스 구매 후 Google 로그인으로 활성화하고 기기(HWID)를 확인하는 방법입니다.",
    "canonical": "https://midiaistudio.com/guide/license/",
    "h1": "라이선스 구매와 활성화"
  },
  "troubleshooting": {
    "title": "문제 해결 | MidiAI Studio",
    "description": "설치 복구, 로그인 실패, MIDI 변환 오류를 해결하는 방법. 로그와 HWID를 1:1 문의에 첨부하는 팁을 안내합니다.",
    "canonical": "https://midiaistudio.com/guide/troubleshooting/",
    "h1": "설치·변환·로그인 문제 해결"
  }
};

export function guideSlugFromLocation() {
  const q = new URLSearchParams(location.search).get('slug');
  if (q) return q.trim();
  const p = location.pathname.replace(/\\/g, '/');
  const m = p.match(/\/guide\/([a-z0-9-]+)(?:\.html)?\/?$/i);
  if (m && m[1].toLowerCase() !== 'index') return m[1];
  return '';
}

export function prettyGuidePath(slug) {
  return 'guide/' + encodeURIComponent(slug) + '/';
}

function upsertMeta(attr, key, value) {
  if (!value) return;
  let el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLinkRel(rel, href) {
  let el = document.head.querySelector('link[rel="' + rel + '"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyGuideDocumentSeo(slug, liveTitle) {
  const seo = GUIDE_SEO[slug];
  const title = seo?.title
    || ((liveTitle && String(liveTitle).trim()) ? (liveTitle + ' | MidiAI Studio') : 'Guide — MidiAI Studio');
  document.title = title;
  const desc = seo?.description || '';
  const canon = seo?.canonical || (location.origin + location.pathname);
  if (desc) {
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('name', 'twitter:description', desc);
  }
  upsertMeta('property', 'og:title', title);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('property', 'og:url', canon);
  upsertLinkRel('canonical', canon);
}

export function hideGuideSeoFallback() {
  const el = document.getElementById('guideSeoFallback');
  if (el) el.hidden = true;
}

export function mediaAltForGuide(g, section) {
  const gTitle = (g && (g.title || g.slug)) || 'MidiAI Studio';
  const sTitle = section && (section.title || section.id);
  if (sTitle) return 'MidiAI Studio ' + gTitle + ' — ' + sTitle;
  return 'MidiAI Studio ' + gTitle + ' 화면';
}
