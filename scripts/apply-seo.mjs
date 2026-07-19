/**
 * MidiAI Studio — SEO applicator
 * Injects unique metadata, OG/Twitter, JSON-LD, favicon/manifest links,
 * accessibility fixes, and regenerates sitemap.xml + robots.txt.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = "https://midiaistudio.com";
const OG_IMAGE = `${SITE}/assets/images/product/ai-midi-converter-home.jpg`;
const LOGO_IMAGE = `${SITE}/assets/images/symbol.png`;
const TODAY = new Date().toISOString().slice(0, 10);
const THEME = "#0b1020";

const SOFTWARE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MidiAI Studio",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows",
  description:
    "AI로 피아노 커버 영상·오디오를 MIDI로 변환하고, MIDI 편집·악보 변환까지 지원하는 Windows 소프트웨어.",
  url: SITE,
  downloadUrl: `${SITE}/downloads.html`,
  image: LOGO_IMAGE,
  offers: {
    "@type": "Offer",
    price: "90000",
    priceCurrency: "KRW",
    availability: "https://schema.org/InStock",
    url: `${SITE}/purchase.html`,
  },
};

/** @type {Record<string, object>} */
const PAGES = {
  "index.html": {
    lang: "ko",
    title: "MidiAI Studio — AI 피아노 커버를 MIDI로 변환",
    description:
      "MidiAI Studio는 피아노 커버 영상을 AI로 MIDI 파일로 변환하는 Windows 소프트웨어입니다. 공식 다운로드, Lifetime 라이선스 구매, 고객 지원.",
    keywords:
      "MidiAI Studio, MIDI 변환, 피아노 MIDI, AI MIDI, 오디오 MIDI, YouTube MIDI, 악보 변환, Windows MIDI",
    robots: "index, follow, max-image-preview:large, max-snippet:-1",
    canonical: `${SITE}/`,
    ogType: "website",
    changefreq: "weekly",
    priority: "1.0",
    sitemap: true,
    schema: [
      SOFTWARE_SCHEMA,
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "MidiAI Studio",
        url: SITE,
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "미디에이아이스튜디오",
        legalName: "미디에이아이스튜디오",
        url: SITE,
        logo: LOGO_IMAGE,
        email: "midiaistudio@gmail.com",
        telephone: "+82-10-2166-5563",
        sameAs: [],
      },
    ],
  },
  "product.html": {
    lang: "ko",
    title: "제품 소개 — MidiAI Studio AI 오디오→MIDI 변환",
    description:
      "AI 오디오→MIDI 변환, MIDI 편집, 악보 변환(MIDI↔PDF), 악보 편집기까지. MidiAI Studio 제품 기능과 라이선스 혜택을 확인하세요.",
    keywords:
      "MidiAI Studio 제품, AI MIDI 변환, MIDI 편집기, 악보 변환, MusicXML, PDF MIDI",
    robots: "index, follow",
    canonical: `${SITE}/product.html`,
    ogType: "website",
    changefreq: "monthly",
    priority: "0.9",
    sitemap: true,
    schema: [SOFTWARE_SCHEMA],
  },
  "downloads.html": {
    lang: "ko",
    title: "다운로드 — MidiAI Studio 최신 버전",
    description:
      "MidiAI Studio Windows 앱 최신 설치 파일을 다운로드하세요. 무료 체험으로 AI MIDI 변환을 바로 시작할 수 있습니다.",
    keywords: "MidiAI Studio 다운로드, MIDI 변환 프로그램 다운로드, Windows MIDI 앱",
    robots: "index, follow",
    canonical: `${SITE}/downloads.html`,
    ogType: "website",
    changefreq: "weekly",
    priority: "0.9",
    sitemap: true,
    schema: [
      {
        ...SOFTWARE_SCHEMA,
        installUrl: `${SITE}/downloads.html`,
      },
    ],
  },
  "purchase.html": {
    lang: "ko",
    title: "Lifetime 라이선스 구매 — MidiAI Studio",
    description:
      "MidiAI Studio Lifetime 라이선스(90,000원)를 구매하세요. 전체 구간 MIDI 변환, 악기 변환, MIDI·악보 편집, 1:1 문의 지원 포함.",
    keywords: "MidiAI Studio 구매, Lifetime 라이선스, MIDI 변환 프로그램 가격",
    robots: "index, follow",
    canonical: `${SITE}/purchase.html`,
    ogType: "product",
    changefreq: "monthly",
    priority: "0.9",
    sitemap: true,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "MidiAI Studio Lifetime License",
        description: "MidiAI Studio Lifetime 디지털 라이선스",
        image: OG_IMAGE,
        brand: { "@type": "Brand", name: "MidiAI Studio" },
        offers: {
          "@type": "Offer",
          price: "90000",
          priceCurrency: "KRW",
          availability: "https://schema.org/InStock",
          url: `${SITE}/purchase.html`,
        },
      },
    ],
  },
  "en/purchase.html": {
    lang: "en",
    title: "Buy Lifetime License — MidiAI Studio",
    description:
      "Purchase the MidiAI Studio Lifetime license ($65 USD). Full-song MIDI conversion, instrument conversion, MIDI & score editing, and support.",
    keywords: "MidiAI Studio purchase, lifetime license, AI MIDI converter buy",
    robots: "index, follow",
    canonical: `${SITE}/en/purchase.html`,
    ogType: "product",
    changefreq: "monthly",
    priority: "0.8",
    sitemap: true,
    assetPrefix: "../",
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "MidiAI Studio Lifetime License",
        description: "MidiAI Studio Lifetime digital license",
        image: OG_IMAGE,
        brand: { "@type": "Brand", name: "MidiAI Studio" },
        offers: {
          "@type": "Offer",
          price: "65.00",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${SITE}/en/purchase.html`,
        },
      },
    ],
  },
  "ja/purchase.html": {
    lang: "ja",
    title: "Lifetimeライセンス購入 — MidiAI Studio",
    description:
      "MidiAI Studio Lifetimeライセンスを購入。フルソングMIDI変換、楽器変換、MIDI・楽譜編集、サポート付き。",
    keywords: "MidiAI Studio 購入, Lifetime ライセンス, MIDI変換ソフト",
    robots: "index, follow",
    canonical: `${SITE}/ja/purchase.html`,
    ogType: "product",
    changefreq: "monthly",
    priority: "0.8",
    sitemap: true,
    assetPrefix: "../",
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "MidiAI Studio Lifetime License",
        description: "MidiAI Studio Lifetimeデジタルライセンス",
        image: OG_IMAGE,
        brand: { "@type": "Brand", name: "MidiAI Studio" },
        offers: {
          "@type": "Offer",
          price: "65.00",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${SITE}/ja/purchase.html`,
        },
      },
    ],
  },
  "faq.html": {
    lang: "ko",
    title: "자주 묻는 질문(FAQ) — MidiAI Studio",
    description:
      "MidiAI Studio 사용법, 라이선스, 다운로드, MIDI 변환, 환불에 대한 자주 묻는 질문과 답변을 확인하세요.",
    keywords: "MidiAI Studio FAQ, MIDI 변환 질문, 라이선스 FAQ",
    robots: "index, follow",
    canonical: `${SITE}/faq.html`,
    ogType: "website",
    changefreq: "weekly",
    priority: "0.8",
    sitemap: true,
  },
  "notices.html": {
    lang: "ko",
    title: "공지사항 — MidiAI Studio",
    description: "MidiAI Studio 공식 공지사항. 서비스 업데이트, 점검, 이벤트 소식을 확인하세요.",
    keywords: "MidiAI Studio 공지사항, 업데이트 소식",
    robots: "index, follow",
    canonical: `${SITE}/notices.html`,
    ogType: "website",
    changefreq: "weekly",
    priority: "0.7",
    sitemap: true,
  },
  "notice.html": {
    lang: "ko",
    title: "공지 상세 — MidiAI Studio",
    description: "MidiAI Studio 공지사항 상세 내용입니다.",
    keywords: "MidiAI Studio 공지",
    robots: "index, follow",
    canonical: `${SITE}/notice.html`,
    ogType: "article",
    changefreq: "weekly",
    priority: "0.5",
    sitemap: true,
  },
  "patch-notes.html": {
    lang: "ko",
    title: "패치노트 — MidiAI Studio 업데이트 기록",
    description: "MidiAI Studio 버전별 패치노트와 업데이트 내역을 확인하세요.",
    keywords: "MidiAI Studio 패치노트, 업데이트, 버전 기록",
    robots: "index, follow",
    canonical: `${SITE}/patch-notes.html`,
    ogType: "website",
    changefreq: "weekly",
    priority: "0.7",
    sitemap: true,
  },
  "patch-note.html": {
    lang: "ko",
    title: "패치노트 상세 — MidiAI Studio",
    description: "MidiAI Studio 개별 패치노트 상세 내용입니다.",
    keywords: "MidiAI Studio 패치노트",
    robots: "index, follow",
    canonical: `${SITE}/patch-note.html`,
    ogType: "article",
    changefreq: "weekly",
    priority: "0.5",
    sitemap: true,
  },
  "board.html": {
    lang: "ko",
    title: "자유게시판 — MidiAI Studio 커뮤니티",
    description:
      "MidiAI Studio 사용자 자유게시판. MIDI 공유, 작업 팁, 커뮤니티 소식을 나누세요.",
    keywords: "MidiAI Studio 자유게시판, MIDI 커뮤니티",
    robots: "index, follow",
    canonical: `${SITE}/board.html`,
    ogType: "website",
    changefreq: "daily",
    priority: "0.6",
    sitemap: true,
  },
  "board-post.html": {
    lang: "ko",
    title: "게시글 — MidiAI Studio 자유게시판",
    description: "MidiAI Studio 자유게시판 게시글입니다.",
    keywords: "MidiAI Studio 게시글",
    robots: "index, follow",
    canonical: `${SITE}/board-post.html`,
    ogType: "article",
    changefreq: "daily",
    priority: "0.4",
    sitemap: true,
  },
  "board-write.html": {
    lang: "ko",
    title: "글쓰기 — MidiAI Studio 자유게시판",
    description: "MidiAI Studio 자유게시판에 글을 작성합니다. 로그인 후 이용할 수 있습니다.",
    keywords: "MidiAI Studio 글쓰기",
    robots: "noindex, follow",
    canonical: `${SITE}/board-write.html`,
    ogType: "website",
    sitemap: false,
  },
  "support.html": {
    lang: "ko",
    title: "1:1 문의 — MidiAI Studio 고객센터",
    description:
      "MidiAI Studio 1:1 문의 고객센터. 라이선스, 다운로드, 기술 지원 문의를 남겨 주세요.",
    keywords: "MidiAI Studio 문의, 고객센터, 기술 지원",
    robots: "index, follow",
    canonical: `${SITE}/support.html`,
    ogType: "website",
    changefreq: "monthly",
    priority: "0.7",
    sitemap: true,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: "MidiAI Studio 고객센터",
        url: `${SITE}/support.html`,
      },
    ],
  },
  "my-tickets.html": {
    lang: "ko",
    title: "나의 문의 — MidiAI Studio",
    description: "로그인한 사용자의 MidiAI Studio 1:1 문의 내역을 확인합니다.",
    keywords: "MidiAI Studio 나의 문의",
    robots: "noindex, nofollow",
    canonical: `${SITE}/my-tickets.html`,
    ogType: "website",
    sitemap: false,
  },
  "ticket.html": {
    lang: "ko",
    title: "문의 상세 — MidiAI Studio",
    description: "MidiAI Studio 1:1 문의 상세 페이지입니다.",
    keywords: "MidiAI Studio 문의 상세",
    robots: "noindex, nofollow",
    canonical: `${SITE}/ticket.html`,
    ogType: "website",
    sitemap: false,
  },
  "account.html": {
    lang: "ko",
    title: "내 계정 — MidiAI Studio",
    description: "MidiAI Studio 계정, 라이선스, 로그인 정보를 관리합니다.",
    keywords: "MidiAI Studio 계정",
    robots: "noindex, nofollow",
    canonical: `${SITE}/account.html`,
    ogType: "website",
    sitemap: false,
  },
  "admin.html": {
    lang: "ko",
    title: "관리자 — MidiAI Studio",
    description: "MidiAI Studio 관리자 전용 페이지입니다.",
    keywords: "MidiAI Studio 관리자",
    robots: "noindex, nofollow",
    canonical: `${SITE}/admin.html`,
    ogType: "website",
    sitemap: false,
  },
  "terms.html": {
    lang: "ko",
    title: "이용약관 — MidiAI Studio",
    description: "MidiAI Studio 서비스 이용약관. 디지털 라이선스 및 서비스 이용 조건을 안내합니다.",
    keywords: "MidiAI Studio 이용약관, 서비스 약관",
    robots: "index, follow",
    canonical: `${SITE}/terms.html`,
    ogType: "website",
    changefreq: "yearly",
    priority: "0.3",
    sitemap: true,
  },
  "privacy.html": {
    lang: "ko",
    title: "개인정보처리방침 — MidiAI Studio",
    description:
      "MidiAI Studio 개인정보처리방침. 수집 항목, 이용 목적, 보관 및 이용자 권리를 안내합니다.",
    keywords: "MidiAI Studio 개인정보처리방침, 개인정보 보호",
    robots: "index, follow",
    canonical: `${SITE}/privacy.html`,
    ogType: "website",
    changefreq: "yearly",
    priority: "0.3",
    sitemap: true,
  },
  "refund.html": {
    lang: "ko",
    title: "환불정책 — MidiAI Studio",
    description:
      "MidiAI Studio 디지털 라이선스 환불정책. 청약철회 및 환불 조건과 절차를 안내합니다.",
    keywords: "MidiAI Studio 환불정책, 디지털 콘텐츠 환불",
    robots: "index, follow",
    canonical: `${SITE}/refund.html`,
    ogType: "website",
    changefreq: "yearly",
    priority: "0.3",
    sitemap: true,
  },
  "business-info.html": {
    lang: "ko",
    title: "사업자정보 — MidiAI Studio",
    description:
      "미디에이아이스튜디오 사업자정보. 상호, 대표자, 사업자등록번호, 통신판매업 신고번호, 연락처.",
    keywords: "MidiAI Studio 사업자정보, 미디에이아이스튜디오",
    robots: "index, follow",
    canonical: `${SITE}/business-info.html`,
    ogType: "website",
    changefreq: "yearly",
    priority: "0.3",
    sitemap: true,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "미디에이아이스튜디오",
        url: SITE,
        email: "midiaistudio@gmail.com",
        telephone: "+82-10-2166-5563",
        vatID: "332-22-02381",
      },
    ],
  },
  "404.html": {
    lang: "ko",
    title: "페이지를 찾을 수 없습니다 — MidiAI Studio",
    description: "요청하신 페이지를 찾을 수 없습니다. MidiAI Studio 홈으로 이동하세요.",
    keywords: "MidiAI Studio 404",
    robots: "noindex, follow",
    canonical: `${SITE}/404.html`,
    ogType: "website",
    sitemap: false,
  },
  "en/index.html": {
    lang: "en",
    title: "MidiAI Studio",
    description: "Redirecting to MidiAI Studio homepage.",
    keywords: "MidiAI Studio",
    robots: "noindex, follow",
    canonical: `${SITE}/`,
    ogType: "website",
    sitemap: false,
    assetPrefix: "../",
    redirectOnly: true,
  },
  "ja/index.html": {
    lang: "ja",
    title: "MidiAI Studio",
    description: "MidiAI Studioホームページへ移動します。",
    keywords: "MidiAI Studio",
    robots: "noindex, follow",
    canonical: `${SITE}/`,
    ogType: "website",
    sitemap: false,
    assetPrefix: "../",
    redirectOnly: true,
  },
  "ko/index.html": {
    lang: "ko",
    title: "MidiAI Studio",
    description: "MidiAI Studio 홈페이지로 이동합니다.",
    keywords: "MidiAI Studio",
    robots: "noindex, follow",
    canonical: `${SITE}/`,
    ogType: "website",
    sitemap: false,
    assetPrefix: "../",
    redirectOnly: true,
  },
  "ko/purchase.html": {
    lang: "ko",
    title: "구매 — MidiAI Studio",
    description: "MidiAI Studio 구매 페이지로 이동합니다.",
    keywords: "MidiAI Studio 구매",
    robots: "noindex, follow",
    canonical: `${SITE}/purchase.html`,
    ogType: "website",
    sitemap: false,
    assetPrefix: "../",
    redirectOnly: true,
  },
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHead(rel, meta, existingStylesheet) {
  const p = meta.assetPrefix || "./";
  const title = meta.title;
  const desc = meta.description;
  const schemaBlocks = (meta.schema || [])
    .map(
      (s) =>
        `  <script type="application/ld+json">\n${JSON.stringify(s, null, 2).replace(/^/gm, "  ")}\n  </script>`
    )
    .join("\n");

  const hreflang =
    rel === "purchase.html" || rel === "en/purchase.html" || rel === "ja/purchase.html"
      ? `  <link rel="alternate" hreflang="ko" href="${SITE}/purchase.html">
  <link rel="alternate" hreflang="en" href="${SITE}/en/purchase.html">
  <link rel="alternate" hreflang="ja" href="${SITE}/ja/purchase.html">
  <link rel="alternate" hreflang="x-default" href="${SITE}/purchase.html">`
      : `  <link rel="alternate" hreflang="ko" href="${meta.canonical}">
  <link rel="alternate" hreflang="x-default" href="${meta.canonical}">`;

  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="keywords" content="${esc(meta.keywords)}">
  <meta name="robots" content="${esc(meta.robots)}">
  <meta name="author" content="MidiAI Studio">
  <meta name="theme-color" content="${THEME}">
  <meta name="application-name" content="MidiAI Studio">
  <meta name="format-detection" content="telephone=no">
  <link rel="canonical" href="${esc(meta.canonical)}">
${hreflang}
  <link rel="icon" href="${p}assets/images/symbol.png" type="image/png" sizes="any">
  <link rel="apple-touch-icon" href="${p}assets/images/symbol.png">
  <link rel="manifest" href="${p}manifest.webmanifest">
  <meta property="og:type" content="${esc(meta.ogType || "website")}">
  <meta property="og:site_name" content="MidiAI Studio">
  <meta property="og:locale" content="${meta.lang === "en" ? "en_US" : meta.lang === "ja" ? "ja_JP" : "ko_KR"}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(meta.canonical)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:alt" content="MidiAI Studio — AI 피아노 커버를 MIDI로 변환">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${OG_IMAGE}">
  <meta name="twitter:image:alt" content="MidiAI Studio">
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">
  <link rel="dns-prefetch" href="https://www.googletagmanager.com">
  <link rel="dns-prefetch" href="https://www.google-analytics.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  ${existingStylesheet || `<link rel="stylesheet" href="${p}assets/css/style.css">`}
  <script defer src="${p}assets/js/analytics.js"></script>
${schemaBlocks}`;
}

function extractStylesheet(headHtml, assetPrefix) {
  const all = [...headHtml.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi)].map((m) => m[0]);
  const local = all.find((l) => /assets\/css\/style\.css/i.test(l));
  if (local) return local;
  // Prefer versioned CSS from body-adjacent remnants if head lost it
  const anyCss = all.find((l) => !/fonts\.googleapis/i.test(l));
  if (anyCss) return anyCss;
  return `<link rel="stylesheet" href="${assetPrefix || "./"}assets/css/style.css">`;
}

function improveBody(html, meta) {
  let out = html;
  const menuLabel =
    meta.lang === "en" ? "Open menu" : meta.lang === "ja" ? "メニューを開く" : "메뉴 열기";

  out = out.replace(/aria-label="menu"/gi, `aria-label="${menuLabel}"`);

  // Collapse duplicated type="button"
  out = out.replace(/(?:\s*type="button"){2,}/g, ' type="button"');

  // brand symbol dimensions + alt
  out = out.replace(
    /<img class="brand-symbol" src="([^"]+)" alt="([^"]*)"(?:\s+width="\d+")?(?:\s+height="\d+")?>/g,
    '<img class="brand-symbol" src="$1" alt="MidiAI Studio" width="40" height="40">'
  );

  // empty footer alts
  out = out.replace(
    /(<img[^>]*src="[^"]*symbol\.png"[^>]*)\salt=""([^>]*>)/g,
    '$1 alt="MidiAI Studio"$2'
  );

  // ensure width/height on footer symbols missing dimensions
  out = out.replace(/<img([^>]*src="[^"]*symbol\.png"[^>]*)>/g, (full, attrs) => {
    if (/width=/i.test(attrs) && /height=/i.test(attrs)) return full;
    if (/class="brand-symbol"/i.test(attrs)) return full;
    let a = attrs;
    if (!/alt=/i.test(a)) a += ' alt="MidiAI Studio"';
    if (!/width=/i.test(a)) a += ' width="32"';
    if (!/height=/i.test(a)) a += ' height="32"';
    return `<img${a}>`;
  });

  // lazy-load product images that lack loading
  out = out.replace(
    /<img([^>]*src="[^"]*assets\/images\/product\/[^"]+"[^>]*)>/g,
    (full, attrs) => {
      let a = attrs;
      if (!/loading=/i.test(a)) a += ' loading="lazy"';
      if (!/decoding=/i.test(a)) a += ' decoding="async"';
      if (!/width=/i.test(a)) a += ' width="1280"';
      if (!/height=/i.test(a)) a += ' height="720"';
      return `<img${a}>`;
    }
  );

  // Ensure interactive buttons have type once
  const ensureType = (id, label) => {
    const re = new RegExp(`<button([^>]*id="${id}"[^>]*)>`, "g");
    out = out.replace(re, (full, attrs) => {
      let a = attrs.replace(/(?:\s*type="button")+/g, "");
      a += ' type="button"';
      if (label && !/aria-label=/i.test(a)) a += ` aria-label="${label}"`;
      return `<button${a}>`;
    });
  };
  ensureType("menuBtn", menuLabel);
  ensureType(
    "loginBtn",
    meta.lang === "en" ? "Sign in with Google" : meta.lang === "ja" ? "Googleでログイン" : "Google 로그인"
  );
  ensureType(
    "logoutBtn",
    meta.lang === "en" ? "Sign out" : meta.lang === "ja" ? "ログアウト" : "로그아웃"
  );
  ensureType(
    "langBtn",
    meta.lang === "en" ? "Change language" : meta.lang === "ja" ? "言語を変更" : "언어 변경"
  );

  return out;
}

function replaceHead(html, newInnerHead, lang) {
  // Ensure html lang
  let out = html.replace(/<html([^>]*)>/i, (_, attrs) => {
    let a = attrs || "";
    if (/lang=/i.test(a)) a = a.replace(/lang=["'][^"']*["']/i, `lang="${lang}"`);
    else a += ` lang="${lang}"`;
    return `<html${a}>`;
  });

  if (/<head[\s>]/i.test(out) && /<\/head>/i.test(out)) {
    out = out.replace(/<head[^>]*>[\s\S]*?<\/head>/i, `<head>\n  ${newInnerHead}\n</head>`);
  }
  return out;
}

function processFile(rel) {
  const meta = PAGES[rel];
  if (!meta) return { skipped: true };
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) return { missing: true };

  let html = fs.readFileSync(filePath, "utf8");

  if (meta.redirectOnly) {
    // Light SEO for redirect stubs
    const p = meta.assetPrefix || "./";
    const stub = `<!doctype html>
<html lang="${meta.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <meta name="robots" content="${esc(meta.robots)}">
  <link rel="canonical" href="${esc(meta.canonical)}">
  <link rel="icon" href="${p}assets/images/symbol.png" type="image/png">
</head>
${html.match(/<body[\s\S]*<\/html>/i)?.[0] || "<body></body></html>"}`;
    // Preserve existing body/script from original
    const bodyMatch = html.match(/<body[\s\S]*<\/html>/i);
    const final = `<!doctype html>
<html lang="${meta.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <meta name="robots" content="${esc(meta.robots)}">
  <link rel="canonical" href="${esc(meta.canonical)}">
  <link rel="icon" href="${p}assets/images/symbol.png" type="image/png">
  ${html.includes("http-equiv") ? html.match(/<meta http-equiv[^>]*>/i)?.[0] || "" : ""}
  ${html.includes("localStorage") ? html.match(/<script>[\s\S]*?<\/script>/i)?.[0] || "" : ""}
</head>
${bodyMatch ? bodyMatch[0].replace(/<\/head>/i, "") : "<body><a href=\"" + meta.canonical + "\">MidiAI Studio</a></body></html>"}`;
    // Simpler approach for redirects:
    const scripts = [...html.matchAll(/<script>[\s\S]*?<\/script>/gi)].map((m) => m[0]).join("\n  ");
    const refresh = html.match(/<meta http-equiv=["']refresh["'][^>]*>/i)?.[0] || "";
    const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || `<body><a href="${meta.canonical}">MidiAI Studio</a></body>`;
    const redirectHtml = `<!doctype html>
<html lang="${meta.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <meta name="robots" content="${esc(meta.robots)}">
  <link rel="canonical" href="${esc(meta.canonical)}">
  <link rel="icon" href="${p}assets/images/symbol.png" type="image/png">
  ${refresh}
  ${scripts}
</head>
${body}
</html>
`;
    fs.writeFileSync(filePath, redirectHtml.replace(/\n{3,}/g, "\n\n"), "utf8");
    return { ok: true, redirect: true };
  }

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const stylesheet = extractStylesheet(headMatch ? headMatch[1] : "", meta.assetPrefix);
  const newHead = buildHead(rel, meta, stylesheet);
  let out = replaceHead(html, newHead, meta.lang);
  out = improveBody(out, meta);

  // Ensure analytics is not duplicated if script already added elsewhere incorrectly
  const analyticsCount = (out.match(/assets\/js\/analytics\.js/g) || []).length;
  if (analyticsCount > 1) {
    let seen = 0;
    out = out.replace(/<script defer src="[^"]*assets\/js\/analytics\.js"><\/script>\s*/g, (m) => {
      seen += 1;
      return seen === 1 ? m : "";
    });
  }

  fs.writeFileSync(filePath, out, "utf8");
  return { ok: true };
}

function writeSitemap() {
  const urls = Object.entries(PAGES)
    .filter(([, m]) => m.sitemap)
    .map(([rel, m]) => {
      const loc = m.canonical.endsWith("/") ? m.canonical : m.canonical;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${m.changefreq || "monthly"}</changefreq>
    <priority>${m.priority || "0.5"}</priority>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
}

function writeRobots() {
  const robots = `User-agent: *
Allow: /

# Private / app areas
Disallow: /admin.html
Disallow: /account.html
Disallow: /my-tickets.html
Disallow: /ticket.html
Disallow: /board-write.html

Sitemap: ${SITE}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, "robots.txt"), robots, "utf8");
}

function writeManifest() {
  const manifest = {
    name: "MidiAI Studio",
    short_name: "MidiAI",
    description:
      "AI로 피아노 커버를 MIDI로 변환하는 Windows 소프트웨어 공식 포털",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1020",
    theme_color: THEME,
    lang: "ko",
    icons: [
      {
        src: "/assets/images/symbol.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
  fs.writeFileSync(
    path.join(ROOT, "manifest.webmanifest"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
}

function main() {
  writeRobots();
  writeSitemap();
  writeManifest();

  const results = [];
  for (const rel of Object.keys(PAGES)) {
    results.push({ rel, ...processFile(rel) });
  }

  // Also discover any HTML not in map
  function walk(dir, base = "") {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "functions" || ent.name === "firebase") continue;
      const rel = path.join(base, ent.name).replace(/\\/g, "/");
      if (ent.isDirectory()) walk(path.join(dir, ent.name), rel);
      else if (ent.name.endsWith(".html") && !PAGES[rel]) {
        results.push({ rel, unmapped: true });
      }
    }
  }
  walk(ROOT);

  console.log(JSON.stringify(results, null, 2));
  console.log(`Processed ${results.filter((r) => r.ok).length} pages`);
}

main();
