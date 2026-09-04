/**
 * MidiAI Studio Product Knowledge loader for Support AI RAG.
 * Public customer AI may only retrieve visibility:"public" + verification:"verified" + active:true.
 * Admin/internal helpers may also use visibility:"internal".
 * Never embeds secrets; docs are curated product facts only.
 */
const fs = require('fs');
const path = require('path');
const { docContentFingerprint } = require('./sourceHash');

const ROOT = __dirname;
const DEFAULT_MIN_SCORE = 3;

/** Words that appear in many docs — must not dominate scoring alone. */
const GENERIC_KEYWORDS = new Set(
  [
    '변환',
    'convert',
    'midi',
    '오디오',
    'audio',
    'studio',
    '사용',
    '설정',
    '방법',
    '확인',
    '파일',
    'file',
    '재생',
    '정지',
    '설치',
    '시작',
    '노트',
    '음표',
    '악보',
    'pdf',
    '음원',
    '사운드',
    'sound',
    '속도',
    '소리',
    '문제',
    '오류',
    '앱',
    '기능',
    '메뉴'
  ].map((w) => w.toLowerCase())
);

/**
 * Query-side synonym / intent normalization (not product invention).
 * Maps common user phrasings onto stable alias tokens present in Knowledge keywords.
 */
const QUERY_SYNONYM_RULES = [
  [/고음질/gi, '고품질'],
  [/좋은\s*음원/gi, '고품질음원'],
  [/hq\s*음원/gi, '고품질음원'],
  [/sound\s*packs?/gi, 'soundpack'],
  [/사운드\s*팩/gi, '사운드팩'],
  [/미리\s*듣기/gi, '미리듣기'],
  [/미리\s*보기/gi, '미리듣기'],
  [/웨이브\s*폼/gi, '웨이브폼'],
  [/템포\s*바꾸/gi, '템포변경'],
  [/bpm\s*바꾸/gi, 'bpm변경'],
  [/곡\s*을?\s*빠르\w*/gi, '템포'],
  [/곡\s*을?\s*느리\w*/gi, '템포'],
  [/오디오\s*를?\s*(midi|미디)\s*로?/gi, 'audiotomidi'],
  [/(로컬\s*)?오디오\s*(파일\s*)?(를\s*)?(midi|미디)/gi, 'audiotomidi'],
  [/(mp3|wav|m4a|webm).{0,12}(midi|미디|변환|convert)/gi, 'audiotomidi'],
  [/(midi|미디).{0,8}(mp3|wav|m4a|webm)/gi, 'audiotomidi'],
  [/youtube\s*to\s*midi/gi, 'youtubetomidi'],
  [/유튜브\s*(를\s*)?(midi|미디|변환)/gi, 'youtubetomidi'],
  [/유\s*튭/gi, '유튜브'],
  [/yt\s*변환/gi, 'youtubetomidi'],
  [/pdf\s*[→\-–—]?\s*(to\s*)?(midi|미디)/gi, 'pdftomidi'],
  [/pdf\s*악보/gi, 'pdftomidi'],
  [/악보\s*(를\s*)?pdf/gi, 'pdfexport'],
  [/pdf\s*내보내/gi, 'pdfexport'],
  [/설치\s*방법/gi, '설치'],
  [/다운로드\s*(방법|위치)/gi, '설치'],
  [/재생\s*(하고\s*)?정지/gi, '재생정지'],
  [/\b(band|orchestra)\b|밴드|오케스트라/gi, (m) => `${String(m)} bandorchestra`],
  [/쉬운\s*조/gi, '쉬운조'],
  [/쉬운\s*키|이지\s*키|easy\s*key|easier\s*key/gi, '쉬운조 easykey'],
  [/벨로\s*시티/gi, '벨로시티'],
  [/라이선스\s*기간|이용권\s*기간/gi, '라이선스기간'],
  // Product concept families (colloquial → stable retrieval tokens already on Knowledge docs)
  [/편곡|악기\s*나(?:누|눠)|instrument\s*arrange|guided\s*arrangement/gi, 'arrange instrumentarrange 편곡'],
  [/노트\s*정리|클린\s*업|(?:^|[^a-z])cleanup/gi, 'cleanup 정리'],
  [/휴머나이즈|사람처럼\s*연주|humanize/gi, 'humanize'],
  [/예약\s*변환|예약변환|예액\s*변환|예액변환/gi, 'reservation 예약변환 schedule'],
  [/미디\s*편집|midi\s*edit/gi, 'midieditor'],
  [/악보\s*뽑|악보\s*내보내/gi, 'pdfexport scoreeditor']
];

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('knowledge load failed', filePath, err && err.message);
    return [];
  }
}

function loadDocs(subdir) {
  const dir = path.join(ROOT, subdir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const data = readJsonSafe(path.join(dir, name));
    if (Array.isArray(data)) out.push(...data);
    else if (data && typeof data === 'object') out.push(data);
  }
  return out;
}

function isRetrievable(doc, { includeInternal = false } = {}) {
  if (!doc || doc.active === false) return false;
  if (doc.verification !== 'verified') return false;
  if (doc.visibility === 'public') return true;
  if (includeInternal && doc.visibility === 'internal') return true;
  return false;
}

function passageText(doc, locale = 'ko') {
  const loc = String(locale || 'ko').toLowerCase();
  const summary =
    (doc.summary && (doc.summary[loc] || doc.summary.ko || doc.summary.en)) ||
    (typeof doc.summary === 'string' ? doc.summary : '');
  const details =
    (doc.details && (doc.details[loc] || doc.details.ko || doc.details.en)) ||
    (typeof doc.details === 'string' ? doc.details : '');
  const steps = Array.isArray(doc.steps)
    ? doc.steps
        .map((s, i) => {
          if (typeof s === 'string') return `${i + 1}. ${s}`;
          const t = s[loc] || s.ko || s.en || '';
          return t ? `${i + 1}. ${t}` : '';
        })
        .filter(Boolean)
        .join(' ')
    : '';
  const fix = Array.isArray(doc.fixSteps)
    ? doc.fixSteps
        .map((s) => (typeof s === 'string' ? s : s[loc] || s.ko || s.en || ''))
        .filter(Boolean)
        .join(' ')
    : '';
  const feature =
    doc.featureStatus && doc.featureStatus !== 'production'
      ? `featureStatus=${doc.featureStatus}`
      : '';
  return [summary, details, steps, fix ? `확인/해결: ${fix}` : '', feature]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRetrievalDoc(doc, locale = 'ko') {
  return {
    id: doc.id,
    priority: Number(doc.priority || 2),
    title: (doc.title && (doc.title[locale] || doc.title.ko || doc.title.en || doc.title.ja)) || doc.id,
    href: doc.relatedGuideUrl || '',
    keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
    text: passageText(doc, locale),
    category: doc.category || '',
    visibility: doc.visibility || 'public',
    featureStatus: doc.featureStatus || 'production',
    verification: doc.verification || 'needs_review',
    sourceHash: doc.sourceHash || docContentFingerprint(doc),
    knowledgeUpdatedAt: doc.knowledgeUpdatedAt || null
  };
}

function expandQueryText(text) {
  let out = String(text || '');
  for (const [re, rep] of QUERY_SYNONYM_RULES) out = out.replace(re, rep);
  return out;
}

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[→←↔⇒⇐〉〈]/g, 'to')
    .replace(/[\s\-_/·•・‧]+/g, '')
    .replace(/[?？!！.。,，'"`~()[\]{}]/g, '');
}

/** Loose compact: drop common Korean particles so “오디오를midi로” ≈ “오디오midi”. */
function looseNormalize(text) {
  return normalizeForMatch(text).replace(/(을|를|이|가|은|는|로|으로|에서|까지|에게|한테|의)/g, '');
}

function isGenericKeyword(kw) {
  const k = String(kw || '').toLowerCase().trim();
  if (!k) return true;
  if (GENERIC_KEYWORDS.has(k)) return true;
  return GENERIC_KEYWORDS.has(normalizeForMatch(k));
}

function queryTokens(text) {
  const expanded = expandQueryText(text);
  const raw = String(expanded || '').toLowerCase();
  const parts = raw.split(/[\s\-_/·•]+/).filter((t) => t && t.length >= 2);
  const compact = normalizeForMatch(raw);
  const loose = looseNormalize(raw);
  return {
    parts,
    compact,
    loose,
    raw,
    expanded,
    isShort: compact.length > 0 && compact.length <= 14 && parts.length <= 3
  };
}

function docSpecificity(doc) {
  const id = String(doc.id || '');
  const cat = String(doc.category || '');
  if (/(^|-)ops$|_ops$/.test(id) || /_ops$/.test(cat)) return 3;
  if (/troubleshooting|support|error|timeout|failure/.test(id + cat)) return 2;
  if (/getting_started|installation|nav/.test(cat) || id === 'nav-workspace') return 1;
  return 0;
}

/**
 * Ranked scoring:
 * exact alias/title > phrase coverage > specific keywords > generic (weak) > partial tokens
 */
function scoreDoc(q, doc) {
  const { parts, compact, loose, raw, isShort } = queryTokens(q);
  if (!compact) return 0;
  let score = 0;
  const seen = new Set();
  const partCompacts = new Set(parts.map((p) => normalizeForMatch(p)).filter(Boolean));

  const title = String(doc.title || '').toLowerCase();
  const titleCompact = normalizeForMatch(title);
  const titleLoose = looseNormalize(title);

  for (const kw of doc.keywords || []) {
    const k = String(kw || '').toLowerCase().trim();
    if (!k || k.length < 2) continue;
    const kCompact = normalizeForMatch(k);
    const kLoose = looseNormalize(k);
    if (!kCompact || seen.has(`e:${kCompact}`)) continue;
    const generic = isGenericKeyword(k);

    if (kCompact === compact || kLoose === loose) {
      score += generic ? 10 : 42;
      seen.add(`e:${kCompact}`);
      continue;
    }

    if (isShort && kCompact.length >= 3 && (kCompact.includes(compact) || compact.includes(kCompact))) {
      const coverage = Math.min(kCompact.length, compact.length) / Math.max(kCompact.length, compact.length);
      if (coverage >= 0.55 && !generic) {
        score += coverage >= 0.85 ? 36 : 22;
        seen.add(`e:${kCompact}`);
        continue;
      }
    }

    if (!generic && kCompact.length >= 3 && (compact.includes(kCompact) || loose.includes(kLoose))) {
      score += Math.max(12, Math.min(28, kCompact.length + 8));
      seen.add(`e:${kCompact}`);
    }
  }

  if (titleCompact.length >= 4) {
    if (titleCompact === compact || titleLoose === loose) score += 30;
    else if (compact.includes(titleCompact) || loose.includes(titleLoose)) {
      // Title substring of a longer query: strong only when the query is mostly the title.
      // Avoid “MIDI Editor …” overview beating “MIDI Editor 템포 …” ops docs.
      const coverage = titleCompact.length / Math.max(compact.length, 1);
      if (coverage >= 0.9) score += 22;
      else if (coverage >= 0.7) score += 12;
      else if (coverage >= 0.45) score += 5;
      else score += 2;
    } else if (isShort && titleCompact.includes(compact) && compact.length >= 4) {
      const coverage = compact.length / titleCompact.length;
      if (coverage >= 0.35) score += 16;
    }
  }

  for (const kw of doc.keywords || []) {
    const k = String(kw || '').toLowerCase().trim();
    if (!k || k.length < 2) continue;
    const kCompact = normalizeForMatch(k);
    if (seen.has(`e:${kCompact}`) || seen.has(`k:${kCompact}`)) continue;
    const generic = isGenericKeyword(k);
    let hit = 0;

    if (raw.includes(k)) {
      hit = generic ? 2 : Math.max(4, Math.min(12, k.length));
    } else if (kCompact.length >= 3 && (compact.includes(kCompact) || loose.includes(looseNormalize(k)))) {
      if (generic) {
        // Generic words only count as whole query tokens — never as accidental substring (음원⊂고음질음원).
        if (compact === kCompact || partCompacts.has(kCompact)) hit = 3;
      } else {
        hit = Math.max(4, Math.min(11, kCompact.length));
      }
    } else if (!isShort) {
      for (const t of parts) {
        const tc = normalizeForMatch(t);
        if (tc.length < 3 || isGenericKeyword(t)) continue;
        if (kCompact === tc) hit = Math.max(hit, generic ? 1 : 5);
        else if (!generic && kCompact.length >= 4 && (kCompact.includes(tc) || tc.includes(kCompact))) {
          hit = Math.max(hit, 2);
        }
      }
    }

    if (hit) {
      seen.add(`k:${kCompact}`);
      score += hit;
    }
  }

  if (doc.category && raw.includes(String(doc.category).toLowerCase())) score += 1;
  // Tiny ops preference when aliases already matched (keeps overview from tying ops on shared words)
  if (score >= 20 && docSpecificity(doc) >= 3) score += 1;
  return score;
}

function detectLocale(question) {
  const q = String(question || '');
  if (/[가-힣]/.test(q)) return 'ko';
  if (/[\u3040-\u30ff]/.test(q) || (/[\u3400-\u9fff]/.test(q) && !/[a-zA-Z]{8,}/.test(q))) return 'ja';
  if (/[a-zA-Z]{3,}/.test(q)) return 'en';
  return 'ko';
}

function retrieveKnowledge(
  question,
  { limit = 4, includeInternal = false, locale = 'ko', minScore = DEFAULT_MIN_SCORE } = {}
) {
  const all = [...loadDocs('public'), ...(includeInternal ? loadDocs('internal') : [])];
  const ranked = all
    .filter((d) => isRetrievable(d, { includeInternal }))
    .map((d) => {
      const base = toRetrievalDoc(d, locale);
      return {
        ...base,
        summary: (d.summary && (d.summary[locale] || d.summary.ko || d.summary.en)) || '',
        details: (d.details && (d.details[locale] || d.details.ko || d.details.en)) || '',
        steps: Array.isArray(d.steps) ? d.steps : [],
        fixSteps: Array.isArray(d.fixSteps) ? d.fixSteps : []
      };
    })
    .map((d) => ({ d, score: scoreDoc(question, d) }))
    .filter((x) => x.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        docSpecificity(b.d) - docSpecificity(a.d) ||
        a.d.priority - b.d.priority
    );
  return ranked.slice(0, limit).map((x) => ({ ...x.d, score: x.score }));
}

function knowledgeStats() {
  const pub = loadDocs('public');
  const inn = loadDocs('internal');
  const count = (rows, pred) => rows.filter(pred).length;
  return {
    publicTotal: pub.length,
    publicVerified: count(pub, (d) => d.verification === 'verified' && d.active !== false),
    publicNeedsReview: count(pub, (d) => d.verification === 'needs_review'),
    internalTotal: inn.length,
    internalVerified: count(inn, (d) => d.verification === 'verified' && d.active !== false),
    internalNeedsReview: count(inn, (d) => d.verification === 'needs_review')
  };
}

function stampSourceHashesInMemory(docs) {
  const now = new Date().toISOString().slice(0, 10);
  return (docs || []).map((doc) => ({
    ...doc,
    sourceHash: docContentFingerprint(doc),
    knowledgeUpdatedAt: doc.knowledgeUpdatedAt || now
  }));
}

function listPublicVerified(locale = 'ko') {
  return loadDocs('public')
    .filter((d) => isRetrievable(d))
    .map((d) => ({
      id: d.id,
      title: (d.title && (d.title[locale] || d.title.ko || d.title.en)) || d.id,
      category: d.category || '',
      summary: (d.summary && (d.summary[locale] || d.summary.ko || d.summary.en)) || '',
      details: (d.details && (d.details[locale] || d.details.ko || d.details.en)) || '',
      steps: Array.isArray(d.steps) ? d.steps : [],
      keywords: Array.isArray(d.keywords) ? d.keywords : [],
      relatedGuide: d.relatedGuideUrl || '',
      featureStatus: d.featureStatus || 'production',
      priority: Number(d.priority || 2)
    }));
}

module.exports = {
  loadDocs,
  retrieveKnowledge,
  knowledgeStats,
  isRetrievable,
  toRetrievalDoc,
  detectLocale,
  stampSourceHashesInMemory,
  scoreDoc,
  expandQueryText,
  normalizeForMatch,
  looseNormalize,
  isGenericKeyword,
  listPublicVerified,
  docSpecificity,
  DEFAULT_MIN_SCORE
};
