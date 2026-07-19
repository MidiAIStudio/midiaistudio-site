import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT, "guides", "articles");
const OUT_PATH = path.join(ROOT, "guides", "articles-uniqueness-report.json");

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;|&ndash;|&#821[12];/gi, "-")
    .replace(/&#?\w+;/g, " ");
}

function normalizeWs(text) {
  return stripTags(text).replace(/\s+/g, " ").trim();
}

function extractAttr(html, attr) {
  const re = new RegExp(`<meta[^>]+name=["']${attr}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${attr}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? normalizeWs(m[1]) : "";
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normalizeWs(m[1]) : "";
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? normalizeWs(m[1]) : "";
}

function extractH2s(html) {
  const out = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = normalizeWs(m[1]);
    if (t) out.push(t);
  }
  return out;
}

function extractParagraphs(html) {
  // Prefer main article region: from first h1 to footer/nav end if present
  let body = html;
  const h1 = html.search(/<h1[\s>]/i);
  if (h1 >= 0) body = html.slice(h1);
  const cut = body.search(/<footer[\s>]|class=["']site-footer|<\/main>/i);
  if (cut > 0) body = body.slice(0, cut);

  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(body))) {
    const full = m[0];
    // Skip TOC/meta/nav-ish short CTAs if class suggests non-body
    if (/\b(seo-meta|portal-pill|pill)\b/i.test(full)) continue;
    const text = normalizeWs(m[1]);
    if (!text) continue;
    // Skip very short crumbs / link-only lines under ~40 chars unless substantial words
    if (text.length < 40) continue;
    paras.push(text);
  }
  return paras;
}

function extractFaqQuestions(html) {
  const qs = new Set();
  // HTML details/summary
  const sumRe = /<summary[^>]*>([\s\S]*?)<\/summary>/gi;
  let m;
  while ((m = sumRe.exec(html))) {
    const t = normalizeWs(m[1]);
    if (t) qs.add(t);
  }
  // JSON-LD FAQ
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (node && node["@type"] === "FAQPage" && Array.isArray(node.mainEntity)) {
          for (const q of node.mainEntity) {
            const name = normalizeWs(q?.name || "");
            if (name) qs.add(name);
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return [...qs];
}

function tokenizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(words, n = 5) {
  const set = new Set();
  if (words.length < n) {
    if (words.length) set.add(words.join(" "));
    return set;
  }
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function primaryKeyword(h1, title) {
  const base = h1 || title || "";
  // Drop common suffixes after colon / for / —
  let k = base
    .replace(/\s*[|:–—-]\s*.*$/, "")
    .replace(/\b(guide|for|what|how|to|the|a|an|and|with|in|on|of)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Prefer longest meaningful phrase from H1 before colon
  const beforeColon = (h1 || title || "").split(/[:|]/)[0].trim();
  if (beforeColon.length >= 8) k = beforeColon;
  // Soft cleanup of trailing fluff
  k = k
    .replace(/\b(what it can and cannot do|step[- ]by[- ]step|complete guide|ultimate guide)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return k || beforeColon || base;
}

function loadArticles() {
  const files = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort();
  return files.map((file) => {
    const html = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf8");
    const slug = file.replace(/\.html$/i, "");
    const title = extractTitle(html);
    const h1 = extractH1(html);
    const h2s = extractH2s(html);
    const metaDescription = extractAttr(html, "description");
    const paragraphs = extractParagraphs(html);
    const faqQuestions = extractFaqQuestions(html);
    const keyword = primaryKeyword(h1, title);
    const allParaText = paragraphs.join(" ");
    const wordSet = new Set(tokenizeWords(allParaText));
    const shingleSet = shingles(tokenizeWords(allParaText), 5);
    return {
      slug,
      file,
      title,
      h1,
      h2s,
      metaDescription,
      paragraphs,
      faqQuestions,
      primaryKeyword: keyword,
      wordSet,
      shingleSet,
    };
  });
}

function main() {
  const articles = loadArticles();
  const articleCount = articles.length;

  // --- Duplicate paragraphs ---
  /** @type {Map<string, Set<string>>} */
  const paraMap = new Map();
  let totalParas = 0;
  for (const a of articles) {
    const seenInArticle = new Set();
    for (const p of a.paragraphs) {
      totalParas++;
      const key = normalizeWs(p);
      if (seenInArticle.has(key)) continue; // count article once per unique para text
      seenInArticle.add(key);
      if (!paraMap.has(key)) paraMap.set(key, new Set());
      paraMap.get(key).add(a.slug);
    }
  }

  const duplicateParagraphs = [...paraMap.entries()]
    .filter(([, slugs]) => slugs.size >= 2)
    .map(([text, slugs]) => ({
      text: text.length > 280 ? text.slice(0, 277) + "..." : text,
      fullLength: text.length,
      count: slugs.size,
      slugs: [...slugs].sort(),
    }))
    .sort((a, b) => b.count - a.count || b.fullLength - a.fullLength)
    .slice(0, 30);

  const parasIn2Plus = [...paraMap.values()].filter((s) => s.size >= 2).length;
  const uniqueParaTexts = paraMap.size;
  const pctParasIn2Plus =
    uniqueParaTexts === 0 ? 0 : Math.round((parasIn2Plus / uniqueParaTexts) * 1000) / 10;
  const parasIn10Plus = [...paraMap.values()].filter((s) => s.size >= 10).length;

  // --- Duplicate H2 ---
  /** @type {Map<string, Set<string>>} */
  const h2Map = new Map();
  for (const a of articles) {
    for (const h of a.h2s) {
      const key = normalizeWs(h);
      if (!key) continue;
      if (!h2Map.has(key)) h2Map.set(key, new Set());
      h2Map.get(key).add(a.slug);
    }
  }
  const duplicateHeadings = [...h2Map.entries()]
    .filter(([, slugs]) => slugs.size >= 2)
    .map(([heading, slugs]) => ({
      heading,
      count: slugs.size,
      slugs: [...slugs].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.heading.localeCompare(b.heading));

  // --- Pairwise Jaccard on 5-word shingles (fallback word-set if tiny) ---
  const pairs = [];
  let simSum = 0;
  let pairCount = 0;
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const A = articles[i];
      const B = articles[j];
      const useShingles = A.shingleSet.size >= 5 && B.shingleSet.size >= 5;
      const sim = useShingles
        ? jaccard(A.shingleSet, B.shingleSet)
        : jaccard(A.wordSet, B.wordSet);
      simSum += sim;
      pairCount++;
      if (sim > 0.55) {
        pairs.push({
          a: A.slug,
          b: B.slug,
          similarity: Math.round(sim * 1000) / 1000,
          method: useShingles ? "shingles5" : "wordSet",
          keywords: [A.primaryKeyword, B.primaryKeyword],
        });
      }
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity);
  const highSimilarityPairs = pairs.slice(0, 40);
  const avgPairwiseSimilarity =
    pairCount === 0 ? 0 : Math.round((simSum / pairCount) * 10000) / 10000;

  const report = {
    generatedAt: new Date().toISOString(),
    articleCount,
    summary: {
      totalParagraphOccurrences: totalParas,
      uniqueParagraphTexts: uniqueParaTexts,
      paragraphsAppearingIn2PlusArticles: parasIn2Plus,
      percentParagraphsIn2PlusArticles: pctParasIn2Plus,
      paragraphsAppearingIn10PlusArticles: parasIn10Plus,
      duplicateH2Count: duplicateHeadings.length,
      pairsAbove055: pairs.length,
      avgPairwiseSimilarityEstimate: avgPairwiseSimilarity,
      pairwiseComparisons: pairCount,
    },
    duplicateParagraphs,
    duplicateHeadings,
    highSimilarityPairs,
    articles: articles.map((a) => ({
      slug: a.slug,
      title: a.title,
      h1: a.h1,
      primaryKeyword: a.primaryKeyword,
      h2Count: a.h2s.length,
      paragraphCount: a.paragraphs.length,
      faqQuestionCount: a.faqQuestions.length,
      metaDescription: a.metaDescription,
      h2s: a.h2s,
      faqQuestions: a.faqQuestions,
    })),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("=== Article uniqueness summary ===");
  console.log(`Articles analyzed: ${articleCount}`);
  console.log(`Paragraphs appearing in 10+ articles: ${parasIn10Plus}`);
  console.log(`Duplicate H2 headings (shared by 2+ articles): ${duplicateHeadings.length}`);
  console.log(`Article pairs with similarity > 0.55: ${pairs.length}`);
  console.log(`Avg pairwise similarity (estimate): ${avgPairwiseSimilarity}`);
  console.log(`% unique para texts in 2+ articles: ${pctParasIn2Plus}%`);
  console.log(`Report: ${OUT_PATH}`);
}

main();
