'use strict';

function tokens(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[\s,?!.|/]+/)
    .filter((t) => t.length > 1)
    .slice(0, 16);
}

function scoreText(query, hay) {
  const h = String(hay || '').toLowerCase();
  let score = 0;
  for (const t of tokens(query)) {
    if (h.includes(t)) score += 2;
  }
  return score;
}

function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds) return Number(v.seconds) * 1000;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
}

function extractVersion(text) {
  const m = String(text || '').match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  return m ? m[1] : '';
}

function toPassage({ prefix, id, title, href, text, score, version, sourceKind }) {
  const summary = String(text || '').slice(0, 420);
  return {
    id: `${prefix}-${id}`,
    priority: 2,
    title: String(title || sourceKind).slice(0, 80),
    href,
    keywords: [],
    text: summary,
    summary,
    details: String(text || '').slice(0, 900),
    steps: [],
    fixSteps: [],
    score,
    visibility: 'public',
    featureStatus: 'production',
    verification: 'live',
    sourceKind,
    version: version || extractVersion(`${title} ${text}`)
  };
}

async function loadLivePatchPassages(db, question, { limit = 3, version = '', preferLatest = false } = {}) {
  if (!db) return [];
  try {
    const snap = await db.collection('patchNotes').where('visible', '==', true).limit(40).get();
    const qVersion = version || extractVersion(question);
    const latestHint = preferLatest || /(최근|최신|요즘|마지막|latest|recent)/i.test(String(question || ''));
    const scored = [];
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const title = String(data.title || '');
      const body = String(data.content || data.contentMarkdown || data.body || '');
      const ver = String(data.version || extractVersion(title) || '');
      let score = scoreText(question, `${title} ${body} ${ver}`);
      if (qVersion && (ver === qVersion || title.includes(qVersion) || body.includes(qVersion))) score += 24;
      if (latestHint) score += Math.min(12, Math.floor(tsMs(data.createdAt) / 1e11));
      if (latestHint) score += 6;
      if (score < 2 && !(latestHint || qVersion)) return;
      scored.push({
        d,
        data,
        title,
        body,
        ver,
        score: score || (latestHint ? 8 : 0),
        created: tsMs(data.createdAt)
      });
    });
    scored.sort((a, b) => {
      if (latestHint && !qVersion) return b.created - a.created || b.score - a.score;
      return b.score - a.score || b.created - a.created;
    });
    const pick = (latestHint && !qVersion ? scored.slice(0, Math.max(limit, 1)) : scored.slice(0, limit)).filter(
      (x) => x.score > 0 || latestHint || qVersion
    );
    return pick.map((x) =>
      toPassage({
        prefix: 'patch',
        id: x.d.id,
        title: x.ver ? `v${x.ver} ${x.title}` : x.title,
        href: '/patch-notes.html',
        text: x.body || x.title,
        score: Math.max(x.score, latestHint ? 14 : x.score),
        version: x.ver,
        sourceKind: 'release'
      })
    );
  } catch (err) {
    console.warn('loadLivePatchPassages', err && err.message);
    return [];
  }
}

async function loadLiveNoticePassages(db, question, { limit = 2 } = {}) {
  if (!db) return [];
  try {
    const snap = await db.collection('announcements').where('visible', '==', true).limit(40).get();
    const scored = [];
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const title = String(data.title || '');
      const body = String(data.content || data.contentMarkdown || '');
      const score = scoreText(question, `${title} ${body}`);
      if (score < 2 && !/(공지|notice)/i.test(String(question || ''))) return;
      scored.push({ d, title, body, score: score || 6, created: tsMs(data.createdAt) });
    });
    scored.sort((a, b) => b.score - a.score || b.created - a.created);
    return scored.slice(0, limit).map((x) =>
      toPassage({
        prefix: 'notice',
        id: x.d.id,
        title: x.title,
        href: '/notices.html',
        text: x.body || x.title,
        score: Math.max(x.score, 10),
        sourceKind: 'notice'
      })
    );
  } catch (err) {
    console.warn('loadLiveNoticePassages', err && err.message);
    return [];
  }
}

async function loadLiveGuidePassages(db, question, { limit = 2 } = {}) {
  if (!db) return [];
  try {
    const snap = await db.collection('guides').where('published', '==', true).limit(40).get();
    const scored = [];
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const title = String(data.title || data.name || '');
      const body = String(data.content || data.body || data.markdown || '');
      const score = scoreText(question, `${title} ${body}`);
      if (score < 3) return;
      scored.push({ d, title, body, score });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) =>
      toPassage({
        prefix: 'guide',
        id: x.d.id,
        title: x.title || 'Guide',
        href: '/guide/',
        text: x.body || x.title,
        score: x.score,
        sourceKind: 'guide'
      })
    );
  } catch (err) {
    console.warn('loadLiveGuidePassages', err && err.message);
    return [];
  }
}

module.exports = {
  loadLivePatchPassages,
  loadLiveNoticePassages,
  loadLiveGuidePassages,
  extractVersion
};
