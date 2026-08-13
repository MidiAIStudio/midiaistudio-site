/**
 * Rejudge fixes: upload replacement screenshots and PATCH Firestore by section id.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = 'midiaistudio';
const BUCKET = 'midiaistudio.firebasestorage.app';
const FB_TOOLS = process.env.USERPROFILE + '\\.config\\configstore\\firebase-tools.json';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'jEQGVJjsG5rmr8z3LGQbRLrP';
const ROOT = 'c:/GitHub/midiaistudio-site/assets/images/guide';

const PATCHES = {
  'youtube-to-midi': [
    {
      id: 'sec_youtube-to-midi_링크-입력--분석',
      mediaType: 'image',
      local: 'youtube-to-midi/url-with-context.jpg',
      caption: 'YouTube URL 입력 · 분석 버튼',
    },
    {
      id: 'sec_youtube-to-midi_구간--변환-모드',
      mediaType: 'image',
      local: 'youtube-to-midi/range-and-mode.jpg',
      caption: 'Piano/Orchestra 변환 모드 · 선택 구간 파형',
    },
  ],
  'audio-to-midi': [
    {
      id: 'sec_audio-to-midi_로컬-오디오-불러오기',
      mediaType: 'image',
      local: 'audio-to-midi/drop-zone-v2.jpg',
      caption: '음성 파일 드롭 또는 선택',
    },
  ],
  'midi-editor': [
    {
      id: 'sec_midi-editor_피아노-롤에서-노트-편집',
      mediaType: 'image',
      local: 'midi-editor/roll-with-notes.jpg',
      caption: '피아노 롤 노트 편집',
    },
  ],
  'getting-started': [
    {
      id: 'sec_getting-started_첫-변환-시작',
      mediaType: 'image',
      local: 'getting-started/start-convert.jpg',
      caption: '홈에서 변환 시작',
    },
  ],
  library: [
    {
      id: 'sec_library_라이브러리에서-찾기',
      mediaType: 'image',
      local: 'library/search-list.jpg',
      caption: '라이브러리 검색 · 파일 목록',
    },
  ],
};

function fileLabel(url) {
  try {
    return decodeURIComponent(String(url).split('/o/')[1]?.split('?')[0] || '')
      .split('/')
      .pop();
  } catch {
    return '';
  }
}

async function getAccessToken() {
  const j = JSON.parse(fs.readFileSync(FB_TOOLS, 'utf8'));
  const t = j.tokens || {};
  if (t.access_token && t.expires_at && t.expires_at > Date.now() + 60_000) return t.access_token;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('oauth ' + JSON.stringify(data));
  return data.access_token;
}

function parseValue(v) {
  if (v == null) return null;
  if (v.stringValue != null) return v.stringValue;
  if (v.integerValue != null) return Number(v.integerValue);
  if (v.doubleValue != null) return v.doubleValue;
  if (v.booleanValue != null) return v.booleanValue;
  if (v.timestampValue != null) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(parseValue);
  if (v.mapValue) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = parseValue(val);
    return out;
  }
  return null;
}

function toValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined) continue;
      fields[k] = toValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function upload(access, storagePath, localPath) {
  const bytes = fs.readFileSync(localPath);
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=` +
    encodeURIComponent(storagePath) +
    '&uploadType=media';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  const meta = await res.json();
  if (!res.ok) throw new Error('upload ' + storagePath + ' ' + JSON.stringify(meta));
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${meta.downloadTokens}`;
}

async function getGuide(access, slug) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/guides/${slug}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const data = await res.json();
  if (!res.ok) throw new Error('get ' + slug + ' ' + JSON.stringify(data));
  const fields = {};
  for (const [k, v] of Object.entries(data.fields || {})) fields[k] = parseValue(v);
  return fields;
}

function sectionsToSteps(sections) {
  return sections.map((s) => ({
    title: s.title || '',
    body: s.body || '',
    image: s.mediaType === 'image' ? s.mediaUrl : '',
    video: s.mediaType === 'video' || s.mediaType === 'youtube' ? s.mediaUrl : '',
    videoType: s.mediaType === 'youtube' ? 'youtube' : s.mediaType === 'video' ? 'upload' : '',
  }));
}

async function patchGuide(access, slug, sections) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/guides/${slug}` +
    `?updateMask.fieldPaths=sections&updateMask.fieldPaths=steps&updateMask.fieldPaths=updatedAt`;
  const body = {
    fields: {
      sections: toValue(sections),
      steps: toValue(sectionsToSteps(sections)),
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('patch ' + slug + ' ' + JSON.stringify(data));
}

async function main() {
  const access = await getAccessToken();
  const ts = Date.now();
  let mediaChanged = 0;
  const report = [];

  for (const [slug, patches] of Object.entries(PATCHES)) {
    const g = await getGuide(access, slug);
    const sections = Array.isArray(g.sections) ? g.sections.map((s) => ({ ...s })) : [];
    for (const p of patches) {
      const idx = sections.findIndex((s) => s.id === p.id);
      if (idx < 0) throw new Error('missing section ' + slug + ' ' + p.id);
      const local = path.join(ROOT, p.local);
      if (!fs.existsSync(local)) throw new Error('missing file ' + local);
      const storagePath = `guide-images/${slug}/rejudge_${path.basename(p.local).replace(/\.[^.]+$/, '')}_${ts}.jpg`;
      const url = await upload(access, storagePath, local);
      const before = fileLabel(sections[idx].mediaUrl);
      sections[idx] = {
        ...sections[idx],
        mediaType: p.mediaType,
        mediaUrl: url,
        posterUrl: '',
        mediaCaption: sections[idx].mediaCaption || p.caption || '',
      };
      mediaChanged += 1;
      report.push({
        slug,
        id: p.id,
        title: sections[idx].title,
        before,
        after: fileLabel(url),
      });
      console.log('patched', slug, sections[idx].title, before, '->', fileLabel(url));
    }
    await patchGuide(access, slug, sections);
    // verify
    const v = await getGuide(access, slug);
    for (const p of patches) {
      const sec = (v.sections || []).find((s) => s.id === p.id);
      if (!sec || sec.mediaType !== 'image' || !String(sec.mediaUrl).includes('rejudge_')) {
        throw new Error('verify failed ' + p.id);
      }
    }
  }

  console.log('---REPORT---');
  console.log(JSON.stringify({ mediaChanged, report }, null, 2));
}

main().catch((e) => {
  console.error('FAIL', e.message || e);
  process.exit(1);
});
