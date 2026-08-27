import { applyGuidesI18n } from './guides-i18n.js?v=20260720-drop-zone';
import {
  ensurePricing,
  checkoutContext,
  isSelling,
  formatMoney,
  getDefaultProduct,
  isDiscountCampaignActive,
  isPromoPopupActive,
  promoBadgeText,
  getActiveHomepagePromotions,
  getPricingCache,
  isPricingCatalogReady
} from './pricing.js?v=promo-multi-popup-5';
import {
  loadCreditProducts,
  getCreditProduct,
  getCreditProducts,
  formatCreditPrice,
  formatKrw,
  creditOrderName,
  creditTagline,
  packCredits,
  normalizeCreditProductId,
  applyPublicCreditCatalog,
  applyCreditCatalogSession,
  isCreditCatalogReady
} from './credit-catalog.js?v=purchase-cards-2';
import { extractCreditBalance } from './credit-balance.js?v=credit-sot-1';
import {
  publicProductView,
  starterUnitFromProducts,
  localizePromo,
  isPassProductId,
  isLicenseProductId,
  isCreditProductId,
  isStorefrontSellableProduct,
  normalizeProductId as normalizeCatalogProductId,
  setCatalogFxRate,
  getCatalogFxRate,
  formatUsd,
  krwToUsd
} from './catalog-engine.js?v=credit-save-onsale-1';
import { openBulkMessageComposer } from './admin-bulk-composer.js?v=email-hist-1';
import {
  getPassProducts,
  getPassProduct,
  passDurationDays,
  applyPublicPassCatalog,
  hydratePassCatalogFromPublic,
  getPassCatalogSource,
  isPassCatalogReady,
  useSeedPassFallback
} from './pass-catalog.js?v=paypal-auto-fx-3';
import {
  renderProductCard,
  purchaseCardFeaturesHtml,
  renderPromotionPopupHtml,
  buildPromotionPopupCopy,
  resolvePromotionProducts,
  storefrontUiCopy,
  PROMO_POPUP_MAX_VISIBLE
} from './storefront-render.js?v=credit-live-sale-1';
import {
  renderMarkdown,
  renderMarkdownInto,
  bindMarkdownInteractions,
  mountMarkdownEditor,
  openMarkdownPreview,
  ensureMarkdownCss,
  pickMarkdownSource,
  clearDraft
} from './markdown/index.js?v=board-edit-1';
import { renderMidiPreviewWav as renderMidiPreviewEngine } from './board-midi-preview.js?v=gm-preview-1';
import { patchNoteType, patchNoteVersion, patchNoteWriteFields } from './patch-note-type.js?v=patch-type-1';
import {
  configureAdminUserLogs,
  initAdminUserLogs,
  writeAdminAuditLog,
  refreshAdminUserLogsUsers,
  formatAdminLogLabel
} from './admin-user-logs.js?v=admin-logs-detail-1';

const CONFIG = window.MIDIAI_CONFIG || {};
function isCreditSalesKilled(){
  return CONFIG.CREDIT_SALES_KILL_SWITCH === true || CONFIG.creditSalesKillSwitch === true;
}
function isCreditPurchaseEnabled(){
  return !isCreditSalesKilled();
}
function purchaseActionsLocked(){
  return !!currentLicenseLifetime;
}
/** True after first real onAuthStateChanged (not the boot setAuthUiSignedOut). */
let authStateResolved = false;
const $ = (id) => document.getElementById(id);
const qs = (s, root = document) => root.querySelector(s);
const page = location.pathname.split('/').pop() || 'index.html';
const pathLower = location.pathname.toLowerCase();
const pathLang = (/\/en(\/|$)/.test(pathLower) ? 'en'
  : /\/ja(\/|$)/.test(pathLower) ? 'ja'
  : /\/ko(\/|$)/.test(pathLower) ? 'ko'
  : '');
const isPurchasePage = page === 'purchase.html' || pathLower.endsWith('/purchase') || pathLower.endsWith('/purchase/');
const isRootKoreanPurchasePage = isPurchasePage && !pathLang;
let selectedPurchaseId = 'PASS_30D';
let pendingPaypalQuoteId = '';
let purchaseMode = 'lifetime';
let selectedPointProductId = 'CREDIT_30';
if(isPurchasePage){
  const purchaseQuery = new URLSearchParams(location.search);
  const productParam = String(purchaseQuery.get('product') || purchaseQuery.get('mode') || '').toLowerCase();
  const packRaw = String(purchaseQuery.get('pack') || '').trim().toUpperCase();
  const packParam = normalizeCreditProductId(packRaw);
  if(isPassProductId(packRaw) || isPassProductId(packParam)){
    selectedPurchaseId = isPassProductId(packRaw) ? packRaw : packParam;
  } else if(packParam.startsWith('CREDIT_') && isCreditPurchaseEnabled()){
    selectedPurchaseId = packParam;
  } else if(productParam === 'credits' || productParam === 'credit' || productParam === 'points' || productParam === 'point' || packParam.startsWith('POINT_') || packParam.startsWith('CREDIT_')){
    selectedPurchaseId = 'PASS_30D';
  } else if(productParam === 'lifetime' || productParam === 'unlimited'){
    selectedPurchaseId = 'LIFETIME';
  } else if(productParam === 'pass' || productParam === 'period'){
    selectedPurchaseId = 'PASS_30D';
  }
  purchaseMode = selectedPurchaseId.startsWith('CREDIT_') ? 'credits' : (isPassProductId(selectedPurchaseId) ? 'pass' : 'lifetime');
  if(purchaseMode === 'credits') selectedPointProductId = selectedPurchaseId;
}

function readSavedSiteLang(){
  try{
    const v = String(localStorage.getItem('midiai_lang') || '').toLowerCase();
    return ['ko','en','ja'].includes(v) ? v : '';
  }catch(_){ return ''; }
}
function readCachedCountryLang(){
  try{
    const code = String(localStorage.getItem('midiai_country') || '').trim().toUpperCase();
    if(!/^[A-Z]{2}$/.test(code) || code === 'ZZ' || code === 'XX') return '';
    if(code === 'JP') return 'ja';
    if(code === 'KR' || code === 'KP') return 'ko';
    if(['US','GB','AU','CA','NZ','IE','SG','PH','IN','ZA','MY'].includes(code)) return 'en';
  }catch(_){}
  return '';
}
function detectBrowserSiteLang(){
  const list = [];
  try{ if(navigator.languages?.length) list.push(...navigator.languages); }catch(_){}
  try{ if(navigator.language) list.push(navigator.language); }catch(_){}
  for(const raw of list){
    const primary = String(raw || '').toLowerCase().replace(/_/g,'-').split('-')[0];
    if(['ko','en','ja'].includes(primary)) return primary;
  }
  return '';
}
function resolvePreferredSiteLang(){
  if(typeof window !== 'undefined' && window.__MIDIAI_PREFERRED_LANG__){
    const boot = String(window.__MIDIAI_PREFERRED_LANG__).toLowerCase();
    if(['ko','en','ja'].includes(boot)) return boot;
  }
  return readSavedSiteLang() || detectBrowserSiteLang() || readCachedCountryLang() || 'ko';
}
let lang = pathLang || resolvePreferredSiteLang();
if (!['ko','en','ja'].includes(lang)) lang = 'ko';
// Korean checkout page forces KO UI for payments only — do not persist over user locale.
if (isRootKoreanPurchasePage) lang = 'ko';
let auth = null;
let firebaseSignOut = null;
let topbarGoogleLogin = null;
let db = null;
let currentUser = null;
let currentUserDoc = null;
let isAdminUser = false;
const BRAND_AUTHOR = 'MidiAI Studio';
let firestoreApi = {};
let storage = null;
let storageApi = {};
const unsubscribers = [];
const publicUnsubscribers = [];
let publicRouteBound = false;
let adminNoticeRows = [];
let adminPatchRows = [];
let adminFaqRows = [];
let adminTicketRows = [];
let adminUserRows = [];
let adminLicenseRows = [];
let adminLicenseCache = {};
/** @type {Record<string, {userDocId:string, fieldUid:string, canonicalUid:string, license:any, licenseState:string, conflict:boolean, error:boolean, errorCode?:string}>} */
let adminIdentityCache = {};
let adminLicensesLoaded = false;
/** Collection listener health for CRM sections (independent of license resolve). */
let adminOrdersListenError = null;
let adminTicketsListenError = null;
let adminUsersListenError = null;
let adminOrderRows = [];
let adminOrdersLoaded = false;
let adminBoardRows = [];
let adminCmsTab = 'notices';
let adminCmsStatusApplied = 'all';
let adminCmsDrawerState = { mode:'view', kind:'notices', id:'' };
let adminCmsFormApi = null;
let selectedAdminUid = null;
let adminCrmSelected = new Set();
let adminCreditWalletByUid = {};
let adminCrmPostSelected = new Set();
let adminCrmFilteredRows = [];
let adminCrmPage = 1;
let adminCrmSearchTimer = null;
let adminCrmMemoTimer = null;
let adminCrmExpandedHwid = new Set();
let adminCrmOrderOpen = new Set();
let adminCrmOrderDrawerOpen = null;
let adminCrmLicenseOpen = '';
const ADMIN_CRM_PAGE_SIZE = 15;
const ADMIN_CRM_ROW_H = 48;
let adminCrmHwidRevealed = false;
let adminCrmDirty = false;
let adminCrmBaseline = null;
let adminCrmDetailTimer = null;
let adminCrmRecentFeed = [];
/** Extra list filter from stats cards: '' | 'active' | 'today' | 'idle7' | 'idle30' */
let adminCrmQuickFilter = '';
let adminCrmStatKey = 'all';
let adminBulkBusy = false;
let adminLicenseWorkTab = 'all';
let adminLicenseExpiringDays = 30;
let adminOrderWorkTab = 'all';
try{ adminCrmRecentFeed = JSON.parse(localStorage.getItem('midiai_admin_crm_feed')||'[]'); }catch{ adminCrmRecentFeed = []; }
if(!Array.isArray(adminCrmRecentFeed)) adminCrmRecentFeed = [];
let activeBoardPost = null;
let activeBoardComments = [];
let likedActivePost = false;
let latestDownloadData = null;
let downloadAdminExpanded = false;
let ticketNotifyUnsub = null;
let unreadReplyCount = 0;
const ticketNotifyInFlight = new Set();
const ticketReadInFlight = new Set();
const toastedReplyKeys = new Set();
let ticketReplyObserver = null;
let pendingTicketOpenId = '';
let adminTicketNotifyUnsub = null;
let unreadAdminTicketCount = 0;
const adminTicketNotifyInFlight = new Set();
const adminTicketReadInFlight = new Set();
const toastedAdminTicketKeys = new Set();
let pendingAdminTicketOpenId = '';
let userNotifyUnsub = null;
let userNotifyRows = [];
let userNotifyPanelOpen = false;
let userNotifyFilter = 'all';
let boardCommentFocusDone = false;
let userNotifyPrefs = { inApp:true, email:false, boardComment:true, ticketReply:true, licenseChange:true };

const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const I18N = {
  en: {
    '번호':'No.','글쓴이':'Author','작성일':'Date','포털':'Portal','커뮤니티':'Community','고객지원':'Support','지원':'Support','계정':'Account','홈':'Home','제품':'Product','다운로드':'Downloads','구매':'Purchase','변환가이드':'Conversion Guides','전체 가이드':'All Guides','변환 가이드':'Conversion Guides','MIDI 변환 가이드':'MIDI Conversion Guides','변환 FAQ':'Conversion FAQ','가이드':'Guides','준비중':'Coming soon','소개':'About','회사·제작자':'Company / Creator','지원하는 워크플로':'Supported workflows','무엇을 MIDI로 변환할 수 있나요':'What you can convert to MIDI','제품 보기':'View product','입력부터 편집·악보까지 MidiAI Studio 한 앱에서 이어집니다.':'From input to editing and scores — all in one MidiAI Studio app.','입력':'Input','코어':'Core','결과':'Output','피아노 커버·영상 링크를 분석해 MIDI로 변환':'Analyze piano covers and video links into MIDI','MP3 / Audio → MIDI':'MP3 / Audio → MIDI','MP3·WAV 등 오디오 파일을 AI로 변환':'Convert MP3, WAV, and other audio with AI','악보 PDF를 인식해 편집 가능한 MIDI로':'Recognize score PDFs into editable MIDI','AI MIDI 변환':'AI MIDI conversion','MidiAI Studio가 입력을 MIDI로 변환하는 중심 엔진':'The core engine that turns inputs into MIDI','멀티트랙 피아노 롤에서 노트·벨로시티 편집':'Edit notes and velocity in a multi-track piano roll','MusicXML / PDF 악보':'MusicXML / PDF scores','MIDI ↔ 악보 변환과 악보 워크플로':'MIDI ↔ score conversion and score workflows','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','변환된 MIDI를 인쇄용 PDF·MusicXML 악보로':'Turn converted MIDI into printable PDF and MusicXML scores','라이브러리 저장':'Library save','변환·편집한 MIDI를 모아 다시 열어 작업':'Collect converted MIDI and reopen to keep working','YouTube URL을 붙여넣거나 검색해 피아노 커버·연주 영상을 불러옵니다. 웨이브폼으로 구간을 고른 뒤 AI가 MIDI로 변환합니다.':'Paste a YouTube URL or search for piano covers and performances. Pick a range on the waveform, then convert to MIDI with AI.','MP3, WAV 등 로컬 오디오를 업로드해 변환합니다. 미리듣기로 구간을 확인한 뒤 원하는 악기로 MIDI를 받을 수 있습니다.':'Upload local audio such as MP3 or WAV. Preview the range, then export MIDI for your chosen instrument.','스캔·인쇄용 악보 PDF를 인식해 편집 가능한 MIDI로 바꿉니다. 추출된 음표는 MIDI 편집·악보 워크플로로 바로 이어집니다.':'Recognize scanned or print-ready score PDFs into editable MIDI. Extracted notes flow straight into MIDI editing and score workflows.','YouTube·오디오·PDF 입력을 MIDI로 바꾸는 중심 엔진입니다. 악기 선택, 구간 지정, 변환 진행을 한곳에서 처리합니다.':'The core engine that turns YouTube, audio, and PDF inputs into MIDI. Choose instruments, set ranges, and track conversion in one place.','변환된 MIDI를 멀티트랙 피아노 롤에서 바로 편집합니다. 노트, 벨로시티, CC, 양자화까지 프로 편집이 가능합니다.':'Edit converted MIDI right away in a multi-track piano roll — notes, velocity, CC, and quantize included.','변환·편집한 MIDI를 인쇄용 PDF 악보와 MusicXML로 내보냅니다. 악보 미리보기와 결과 폴더 저장을 지원합니다.':'Export converted MIDI as printable PDF scores and MusicXML, with score preview and save-to-results support.','변환·편집한 MIDI를 라이브러리에 모아 두고, 나중에 다시 열어 편집·악보 변환을 이어갈 수 있습니다.':'Keep converted MIDI in the library and reopen later to continue editing or score conversion.','PDF·YouTube·MP3·Audio·MusicXML·MIDI→PDF 변환 가이드와 심화 아티클을 모았습니다.':'Practical conversion guides and in-depth articles for PDF, YouTube, MP3, Audio, MusicXML, and MIDI→PDF.','PDF·YouTube·MP3·Audio·MusicXML 변환 가이드와 심화 아티클을 모았습니다.':'Practical conversion guides and in-depth articles for PDF, YouTube, MP3, Audio, and MusicXML.','PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — 검색 의에 맞춘 실용 가이드와 50개 심화 아티클.':'PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — practical guides and 50 in-depth articles matched to search intent.','공지사항':'Notices','패치노트 목록':'Patch notes list','운영 안내, 이벤트, 중요 공지를 확인합니다.':'Check service notices, events, and important updates.','패치노트':'Patch notes','업데이트':'Updates','FAQ':'FAQ','자유게시판':'Free board','글쓰기':'Write','댓글':'Comments','댓글 등록':'Post comment','답글':'Reply','추천':'Like','조회':'Views','1:1 문의':'Support','1:1 문의 작성':'Create ticket','나의 문의':'My tickets','내 계정':'Account','관리자':'Admin','로그아웃':'Logout','문의 작성':'Create ticket','전체 보기':'View all',
    '7월 31일까지 할인 진행중':'Discount available until July 31','피아노 커버를':'Piano covers','프로 MIDI':'pro MIDI','로':'into MIDI','MIDI로 바꾸는':'into MIDI','가장 쉬운 방법':'made easy','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'The easiest way to turn piano covers into MIDI','MidiAI Studio 공식 포털입니다.':'MidiAI Studio official portal.','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'Use purchase, downloads, notices, patch notes, and 1:1 support.','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio official portal. The home page focuses on product, purchase, and downloads; notices, patch notes, and private support are separated into board-style pages.',
    '라이선스 구매하기':'Buy license','무료 체험 다운로드':'Download free trial','1:1 문의하기':'Contact support','Windows 지원':'Windows support','Google 계정 연동':'Google account linked','비공개 문의':'Private support','업데이트, 이벤트, 운영 안내를 확인합니다.':'Check updates, events, and service notices.','버전별 변경 사항을 확인합니다.':'Check changes by version.','비공개 문의를 작성하고 답변을 확인합니다.':'Create private tickets and check replies.','라이선스 상태와 로그인 정보를 확인합니다.':'Check license status and login details.','바로가기':'Open','문의하기':'Contact','확인하기':'View','최신 설치 파일':'Latest installer','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Shows the latest version from Firestore downloads/latest.','불러오는 중...':'Loading...','최신 설치 파일과 버전 정보를 확인합니다.':'Check the latest installer and version info.',
    'Google 로그인':'Sign in with Google','로그인 전':'Not signed in','Google 로그인으로 라이선스 확인 준비':'Sign in with Google to check your license','라이선스 확인 전':'License not checked',
    '공지 상세':'Notice detail','자주 묻는 질문':'FAQ','비공개 1:1 문의':'Private support','문의 등록':'Submit ticket','문의 상세':'Ticket detail','라이선스 구매':'Buy license','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'Add patch note','공지 등록':'Add notice','FAQ 등록':'Add FAQ','라이선스 저장':'Save license','문의 답변':'Ticket replies','공지 작성':'Write notice','패치노트 작성':'Write patch note','FAQ 작성':'Write FAQ','라이선스 지급/수정':'Grant/edit license',
    '제목':'Title','내용':'Content','검색':'Search','버전':'Version','질문':'Question','답변':'Answer','순서':'Order','상단 고정':'Pin to top','플랜':'Plan','상태':'Status','메모':'Memo','사용자 UID':'User UID','등록':'Submit','저장':'Save','문의 내용을 자세히 적어주세요.':'Please describe your issue in detail.','로그인 오류 / 라이선스 문의':'Login issue / license question','로그인이 필요합니다.':'Sign-in required.','내가 작성한 비공개 문의와 답변을 확인합니다.':'View your private tickets and replies.','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'Only you and the admin can view this ticket. Please sign in first.','role=admin 계정만 사용할 수 있습니다.':'Only role=admin accounts can use this page.',
    '답변 완료':'Answered','종료':'Closed','접수':'Open','권한이 없습니다.':'You do not have permission.','관리자 로그인이 필요합니다.':'Admin sign-in required.','표시할 내용이 없습니다.':'Nothing to show.','확인 실패':'Check failed','저장 완료':'Saved','수정':'Edit','삭제':'Delete','종료 처리':'Close','관리':'Manage','상세 보기':'Open detail','공지 관리':'Manage notices','패치노트 관리':'Manage patch notes','FAQ 관리':'Manage FAQ','정말 삭제할까요?':'Delete this item?','수정 완료':'Updated','삭제 완료':'Deleted','문의가 등록되었습니다.':'Ticket created.',
    '이용약관':'Terms of use','개인정보처리방침':'Privacy policy','환불정책':'Refund policy','사업자정보':'Business info','고객센터':'Support','AI 기반 MIDI 변환 소프트웨어':'AI-powered MIDI conversion software','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AI-powered MIDI conversion software · digital license',
    '피아노 커버 작업실':'Piano cover studio','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'Load a YouTube link or audio file and convert it to MIDI with AI.','변환·편집·악보 변환·악보 편집까지 한 앱에서 이어집니다.':'Conversion, editing, score conversion, and score editing — all in one app.','영상·오디오를 MIDI로':'Video & audio to MIDI','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'Start with a YouTube link, local upload, or song search. Preview the waveform, pick a range, and export MIDI for your instrument.','YouTube 링크 분석':'YouTube link analysis','웨이브폼 미리듣기':'Waveform preview','출력 악기·구간 선택':'Choose instrument & range','MIDI 편집 PRO':'MIDI Editor PRO','멀티트랙 피아노 롤':'Multi-track piano roll','변환된 MIDI를 바로 편집합니다. 128종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'Edit converted MIDI right away — 128 instruments, velocity/pitch bend/modulation, undo/copy/quantize.','128종 악기 지원':'128 instruments','벨로시티·CC 파라미터 편집':'Velocity & CC editing','악보 변환 · BETA':'Score conversion · BETA','MIDI ↔ 악보':'MIDI ↔ Score','MIDI를 PDF·MusicXML 악보로 저장하고, PDF 악보를 인식해 MIDI로 다시 변환합니다. 곡 제목·작사·작곡 메타데이터까지 함께 다룰 수 있습니다.':'Save MIDI as PDF/MusicXML scores, and recognize PDF scores back into MIDI — with title, lyricist, and composer metadata.','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','PDF → MIDI 변환':'PDF → MIDI conversion','악보 미리보기 · 결과 폴더 저장':'Score preview · save to results folder','악보 편집기 · BETA':'Score editor · BETA','악보를 바로 수정':'Edit scores directly','변환된 악보를 페이지·연속·타임라인으로 보며 음표와 벨로시티를 편집합니다. AI 검토 제안으로 피치 점프·겹침 음표 등을 확인하고 바로 반영할 수 있습니다.':'View converted scores in page, continuous, or timeline mode and edit notes and velocity. Use AI review suggestions for pitch jumps and overlapping notes.','페이지 / 연속 / 타임라인 보기':'Page / continuous / timeline views','음표 선택·속성 편집':'Note selection & property editing','AI 검토 제안':'AI review suggestions','홈 · 포털 연동':'Home · portal sync','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'Check notices, patch notes, and license status in-app, then jump into Studio.','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'After Google sign-in, browse and post on the free board from the app.','라이브러리':'Library','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'Manage converted and edited MIDI files in the library and reopen them anytime.','정식 라이선스 혜택':'Full license benefits','전체 구간 MIDI 변환':'Full-song MIDI conversion','악기 변환':'Instrument conversion','제한 없는 저장 · full song export':'Unlimited save · full song export','MIDI 편집 기능':'MIDI editing features','악보 변환 · MIDI ↔ PDF':'Score conversion · MIDI ↔ PDF','악보 편집기':'Score editor',
    '공식 설치 · 업데이트 프로그램':'Official installer & updater','MidiAI Installer는 MidiAI Studio의 설치·업데이트·복구와 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다. Install / Update 한 번으로 자동 설치 또는 업데이트가 진행됩니다.':'MidiAI Installer is a Windows tool for install, update, repair, and runtime checks in one screen. One Install / Update action automatically installs or updates.','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installer is a Windows tool for install, update, repair, and runtime checks.','설치 방법':'How to install','실행 · 업데이트 방법':'How to run & update','결제 정보':'Payment details','주문자 정보':'Buyer','휴대폰 번호':'Phone number','결제수단':'Payment method','상품명':'Product','판매가격':'Price','결제형태':'Payment type','단건 결제':'One-time payment','서비스 제공기간':'Service delivery','결제 완료 후 즉시 라이선스 발급':'License issued immediately after payment','Google 로그인 계정 기준':'Based on your Google account','Google 로그인 후 자동 입력':'Filled after Google sign-in','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'Buyer contact required for Korean card checkout.','결제 버튼을 준비하고 있습니다.':'Preparing payment buttons.','라이선스 안내':'License guide','계좌 입금 안내':'Bank transfer guide','사이트 메뉴':'Site menu','언어 선택':'Language','게시판 메뉴':'Board menu',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'A place to share questions, reviews, and tips freely.','게시글 목록':'Posts','공지 목록':'Notices','공지':'Notice','← 목록':'← Back','목록':'Back','유형':'Type','(제목 없음)':'(No title)','로그인 후 게시글을 작성할 수 있습니다.':'Sign in to write a post.','자주 묻는 질문과 답변을 빠르게 확인하세요.':'Quick answers to common questions.','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Check your Google sign-in and license status.',
    '신규':'New','개선':'Improved','수정':'Fixed','변경':'Changed','변경 사항':'Changes','내용이 없습니다.':'No content.','목차':'Contents','최신':'Newer','이전':'Older','버전 이동':'Version navigation','공유':'Share','전체 패치노트':'All patch notes','문의':'Support',
    '소식':'News','패치':'Patch','피아노 커버·오디오·악보를':'Piano covers, audio & scores','MidiAI Studio는 Windows용 AI MIDI 변환 소프트웨어입니다. YouTube·MP3·오디오를 MIDI로 바꾸고, PDF/MusicXML 악보 워크플로까지 이어갑니다.':'MidiAI Studio is Windows AI MIDI conversion software. Turn YouTube, MP3, and audio into MIDI, then continue into PDF/MusicXML score workflows.','음원과 YouTube 음악을 AI로 MIDI로 변환':'Convert audio and YouTube music to MIDI with AI','MidiAI Studio는 Windows용 AI MIDI 변환·자동 채보 소프트웨어입니다. MP3·오디오, YouTube, 악보 PDF를 MIDI로 바꾸고 피아노롤에서 편집합니다.':'MidiAI Studio is Windows AI MIDI conversion and transcription software. Turn MP3, audio, YouTube, and score PDFs into MIDI and edit them in a piano roll.','입력부터 편집·악보까지 한 앱에서 이어집니다.':'From input to editing and scores — all in one app.','유튜브 MIDI 변환':'YouTube to MIDI','음원 MIDI 변환':'Audio to MIDI','악보 PDF MIDI':'Score PDF to MIDI','MIDI 편집':'MIDI editing','AI 채보':'AI transcription','제품 소개':'Product','분석':'Analyze','풍선':'Balloon','god Best 피아노 모음 · 04:36:46':'god Best Piano Collection · 04:36:46','선택 정보':'Selection','길이 04:36:45':'Length 04:36:45','MIDI 변환':'MIDI convert','MIDI로 변환':'Convert to MIDI','YouTube 검색 중...':'Searching YouTube...','길이와 제목 정보 분석 중...':'Analyzing length and title...','미리듣기 오디오/웨이브폼 준비 중...':'Preparing preview audio / waveform...','트랙 범위':'Track range','미리듣기':'Preview','정지':'Stop','초기화':'Reset',
    'YouTube 링크나 MP3/오디오를 불러와 AI가 MIDI로 변환합니다.':'Load a YouTube link or MP3/audio and convert it to MIDI with AI.','PDF·MusicXML 악보 변환과 MIDI 편집까지 한 앱에서 이어집니다.':'Continue into PDF/MusicXML score conversion and MIDI editing in one app.','PDF / YouTube / MP3 가이드':'PDF / YouTube / MP3 guides','관련 변환 가이드':'Related conversion guides','가이드 허브':'Guide hub',
    'MidiAI Studio를 만드는 사람들':'The people behind MidiAI Studio','MidiAI Studio는 피아노 커버·오디오·악보를 MIDI로 변환하고 편집하는 Windows 소프트웨어입니다. 이 페이지는 Google과 사용자가 제품을 신뢰할 수 있도록 ':'MidiAI Studio is Windows software for converting and editing piano covers, audio, and scores to MIDI. This page clearly discloses ','제작자, 회사, 연락처, 업데이트, 지원':'author, company, contact, updates, and support',' 정보를 명확히 공개합니다.':' information so Google and users can trust the product.','제작자 · Author':'Author',' — 대표 · Product Lead. AI MIDI 변환, MIDI 편집, 악보(MusicXML/PDF) 워크플로를 실제 연주자·제작자 관점에서 설계합니다.':' — Founder & Product Lead. Designs AI MIDI conversion, MIDI editing, and score (MusicXML/PDF) workflows from a performer/creator perspective.','문의:':'Contact:','회사 정보 · Organization':'Organization','상세:':'Details:','제품 신뢰 · Software credibility':'Software credibility','MidiAI Studio는 브라우저 일회성 도구가 아니라 ':'MidiAI Studio is not a one-off browser tool — it is an ','설치형 Windows 앱':'installed Windows app','입니다. Google 로그인 라이선스, 공식 다운로드, Lifetime 구매, 버전별 패치노트를 제공합니다.':'. It provides Google sign-in licensing, official downloads, Lifetime purchase, and versioned patch notes.','제품 기능':'Product features',' — AI 오디오→MIDI, MIDI 편집, 악보 변환':' — AI audio→MIDI, MIDI editing, score conversion',' — 최신 설치 파일':' — Latest installer',' — Lifetime 라이선스':' — Lifetime license',' — 업데이트·버전 이력':' — Updates & version history','SEO 가이드':'SEO guides','고객 지원 · Support':'Support','MIDI 변환 FAQ (20+)':'MIDI converter FAQ (20+)','를 운영합니다.':' are available.','법적 고지':'Legal','지금 시작하기':'Get started','무료 체험으로 YouTube·오디오→MIDI 변환을 확인하세요.':'Try the free trial to convert YouTube/audio to MIDI.','개인정보':'Privacy',
    '← 나의 문의':'← My tickets','새 문의':'New ticket','게시글':'Post','댓글을 입력하세요':'Write a comment','댓글 불러오는 중...':'Loading comments...','사진/영상/MIDI 첨부':'Attach photo / video / MIDI','JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 파일당 50MB · 최대 5개':'JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 50MB each · max 5','첨부한 파일이 없습니다.':'No files attached.','이모티콘':'Emoji','이모티콘 선택':'Choose emoji',    '이모티콘을 눌러 내용에 삽입합니다.':'Tap an emoji to insert it into the post.',
    '접속 정보':'Access information','국가':'Country','지역':'Region','최근 접속':'Last seen','IP':'IP','언어':'Language','접속 환경':'Client','국가 정보 없음':'Location unavailable','MidiAI Studio App':'MidiAI Studio App'
  },
  ja: {
    '번호':'番号','글쓴이':'投稿者','작성일':'作成日','포털':'ポータル','커뮤니티':'コミュニティ','고객지원':'サポート','지원':'サポート','계정':'アカウント','홈':'ホーム','제품':'製品','다운로드':'ダウンロード','구매':'購入','변환가이드':'変換ガイド','전체 가이드':'ガイド一覧','변환 가이드':'変換ガイド','MIDI 변환 가이드':'MIDI変換ガイド','변환 FAQ':'変換FAQ','가이드':'ガイド','준비중':'準備中','소개':'紹介','회사·제작자':'会社・制作','지원하는 워크플로':'対応ワークフロー','무엇을 MIDI로 변환할 수 있나요':'MIDIに変換できるもの','제품 보기':'製品を見る','입력부터 편집·악보까지 MidiAI Studio 한 앱에서 이어집니다.':'入力から編集・楽譜まで、MidiAI Studioひとつでつながります。','입력':'入力','코어':'コア','결과':'結果','피아노 커버·영상 링크를 분석해 MIDI로 변환':'ピアノカバーや動画リンクを解析してMIDIに変換','MP3 / Audio → MIDI':'MP3 / Audio → MIDI','MP3·WAV 등 오디오 파일을 AI로 변환':'MP3・WAVなどのオーディオをAIで変換','악보 PDF를 인식해 편집 가능한 MIDI로':'楽譜PDFを認識して編集可能なMIDIに','AI MIDI 변환':'AI MIDI変換','MidiAI Studio가 입력을 MIDI로 변환하는 중심 엔진':'入力をMIDIに変換するMidiAI Studioの中核エンジン','멀티트랙 피아노 롤에서 노트·벨로시티 편집':'マルチトラックピアノロールでノート・ベロシティを編集','MusicXML / PDF 악보':'MusicXML / PDF楽譜','MIDI ↔ 악보 변환과 악보 워크플로':'MIDI ↔ 楽譜変換と楽譜ワークフロー','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','변환된 MIDI를 인쇄용 PDF·MusicXML 악보로':'変換したMIDIを印刷用PDF・MusicXML楽譜に','라이브러리 저장':'ライブラリ保存','변환·편집한 MIDI를 모아 다시 열어 작업':'変換・編集したMIDIをまとめて再度開いて作業','YouTube URL을 붙여넣거나 검색해 피아노 커버·연주 영상을 불러옵니다. 웨이브폼으로 구간을 고른 뒤 AI가 MIDI로 변환합니다.':'YouTubeのURLを貼るか検索してピアノカバー・演奏動画を読み込みます。波形で区間を選び、AIがMIDIに変換します。','MP3, WAV 등 로컬 오디오를 업로드해 변환합니다. 미리듣기로 구간을 확인한 뒤 원하는 악기로 MIDI를 받을 수 있습니다.':'MP3やWAVなどのローカル音声をアップロードして変換。プレビューで区間を確認し、希望の楽器でMIDIを取得できます。','스캔·인쇄용 악보 PDF를 인식해 편집 가능한 MIDI로 바꿉니다. 추출된 음표는 MIDI 편집·악보 워크플로로 바로 이어집니다.':'スキャンや印刷用の楽譜PDFを認識して編集可能なMIDIに変換。抽出した音符はMIDI編集・楽譜ワークフローへそのまま続きます。','YouTube·오디오·PDF 입력을 MIDI로 바꾸는 중심 엔진입니다. 악기 선택, 구간 지정, 변환 진행을 한곳에서 처리합니다.':'YouTube・音声・PDF入力をMIDIに変える中核エンジン。楽器選択、区間指定、変換進行を一か所で処理します。','변환된 MIDI를 멀티트랙 피아노 롤에서 바로 편집합니다. 노트, 벨로시티, CC, 양자화까지 프로 편집이 가능합니다.':'変換したMIDIをマルチトラックピアノロールですぐ編集。ノート、ベロシティ、CC、クオンタイズまでプロ編集が可能です。','변환·편집한 MIDI를 인쇄용 PDF 악보와 MusicXML로 내보냅니다. 악보 미리보기와 결과 폴더 저장을 지원합니다.':'変換・編集したMIDIを印刷用PDF楽譜とMusicXMLで書き出します。楽譜プレビューと結果フォルダ保存に対応します。','변환·편집한 MIDI를 라이브러리에 모아 두고, 나중에 다시 열어 편집·악보 변환을 이어갈 수 있습니다.':'変換・編集したMIDIをライブラリにまとめ、あとで再度開いて編集・楽譜変換を続けられます。','PDF·YouTube·MP3·Audio·MusicXML·MIDI→PDF 변환 가이드와 심화 아티클을 모았습니다.':'PDF・YouTube・MP3・Audio・MusicXML・MIDI→PDFの変換ガイドと詳細記事をまとめています。','PDF·YouTube·MP3·Audio·MusicXML 변환 가이드와 심화 아티클을 모았습니다.':'PDF・YouTube・MP3・Audio・MusicXMLの変換ガイドと詳細記事をまとめています。','PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — 검색 의에 맞춘 실용 가이드와 50개 심화 아티클.':'PDF to MIDI、YouTube to MIDI、MP3 to MIDI、Audio to MIDI、MusicXML — 検索意図に合わせた実践ガイドと50本の詳細記事。','공지사항':'お知らせ','패치노트 목록':'パッチノート一覧','운영 안내, 이벤트, 중요 공지를 확인합니다.':'運営案内、イベント、重要なお知らせを確認できます。','패치노트':'パッチノート','업데이트':'アップデート','FAQ':'FAQ','자유게시판':'自由掲示板','글쓰기':'投稿','댓글':'コメント','댓글 등록':'コメント投稿','답글':'返信','추천':'いいね','조회':'閲覧','1:1 문의':'お問い合わせ','1:1 문의 작성':'問い合わせ作成','나의 문의':'マイ問い合わせ','내 계정':'アカウント','관리자':'管理者','로그아웃':'ログアウト','문의 작성':'問い合わせ作成','전체 보기':'すべて見る',
    '7월 31일까지 할인 진행중':'7月31日まで割引中','피아노 커버를':'ピアノカバーを','프로 MIDI':'プロMIDI','로':'に','MIDI로 바꾸는':'MIDIに変える','가장 쉬운 방법':'一番簡単な方法','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'ピアノカバーをMIDIに変える一番簡単な方法','MidiAI Studio 공식 포털입니다.':'MidiAI Studio公式ポータルです。','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'購入・ダウンロード・お知らせ・パッチノート・お問い合わせをご利用いただけます。','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio公式ポータルです。ホームは紹介・購入・ダウンロードを中心にし、お知らせ・パッチノート・非公開問い合わせは別ページに分けました。',
    '라이선스 구매하기':'ライセンス購入','무료 체험 다운로드':'無料体験ダウンロード','1:1 문의하기':'問い合わせる','Windows 지원':'Windows対応','Google 계정 연동':'Googleアカウント連携','비공개 문의':'非公開問い合わせ','업데이트, 이벤트, 운영 안내를 확인합니다.':'アップデート、イベント、運営案内を確認できます。','버전별 변경 사항을 확인합니다.':'バージョン別の変更内容を確認できます。','비공개 문의를 작성하고 답변을 확인합니다.':'非公開問い合わせを作成し、返信を確認できます。','라이선스 상태와 로그인 정보를 확인합니다.':'ライセンス状態とログイン情報を確認できます。','바로가기':'開く','문의하기':'問い合わせ','확인하기':'確認','최신 설치 파일':'最新インストーラー','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Firestore downloads/latest を基準に最新バージョンを表示します。','불러오는 중...':'読み込み中...','최신 설치 파일과 버전 정보를 확인합니다.':'最新インストーラーとバージョン情報を確認できます。',
    'Google 로그인':'Googleログイン','로그인 전':'未ログイン','Google 로그인으로 라이선스 확인 준비':'Googleログインでライセンス確認','라이선스 확인 전':'ライセンス未確認',
    '공지 상세':'お知らせ詳細','자주 묻는 질문':'よくある質問','비공개 1:1 문의':'非公開お問い合わせ','문의 등록':'送信','문의 상세':'問い合わせ詳細','라이선스 구매':'ライセンス購入','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'パッチノート登録','공지 등록':'お知らせ登録','FAQ 등록':'FAQ登録','라이선스 저장':'ライセンス保存','문의 답변':'問い合わせ返信','공지 작성':'お知らせ作成','패치노트 작성':'パッチノート作成','FAQ 작성':'FAQ作成','라이선스 지급/수정':'ライセンス付与/修正',
    '제목':'タイトル','내용':'内容','검색':'検索','버전':'バージョン','질문':'質問','답변':'回答','순서':'順序','상단 고정':'上部固定','플랜':'プラン','상태':'状態','메모':'メモ','사용자 UID':'ユーザーUID','등록':'登録','저장':'保存','문의 내용을 자세히 적어주세요.':'お問い合わせ内容を詳しく入力してください。','로그인 오류 / 라이선스 문의':'ログインエラー / ライセンス問い合わせ','로그인이 필요합니다.':'ログインが必要です。','내가 작성한 비공개 문의와 답변을 확인합니다.':'自分の非公開問い合わせと返信を確認します。','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。','role=admin 계정만 사용할 수 있습니다.':'role=adminアカウントのみ使用できます。',
    '답변 완료':'回答済み','종료':'終了','접수':'受付','권한이 없습니다.':'権限がありません。','관리자 로그인이 필요합니다.':'管理者ログインが必要です。','표시할 내용이 없습니다.':'表示する内容がありません。','확인 실패':'確認失敗','저장 완료':'保存完了','수정':'編集','삭제':'削除','종료 처리':'終了にする','관리':'管理','상세 보기':'詳細を見る','공지 관리':'お知らせ管理','패치노트 관리':'パッチノート管理','FAQ 관리':'FAQ管理','정말 삭제할까요?':'本当に削除しますか？','수정 완료':'更新しました','삭제 완료':'削除しました','문의가 등록되었습니다.':'問い合わせを登録しました。',
    '이용약관':'利用規約','개인정보처리방침':'プライバシーポリシー','환불정책':'返金ポリシー','사업자정보':'事業者情報','고객센터':'サポート','AI 기반 MIDI 변환 소프트웨어':'AIベースMIDI変換ソフト','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AIベースMIDI変換ソフト · デジタルライセンス商品',
    '피아노 커버 작업실':'ピアノカバー作業室','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'YouTubeリンクやオーディオファイルを読み込み、AIがMIDIに変換します。','변환·편집·악보 변환·악보 편집까지 한 앱에서 이어집니다.':'変換・編集・楽譜変換・楽譜編集まで1つのアプリで続けられます。','영상·오디오를 MIDI로':'映像・オーディオをMIDIに','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'YouTubeリンクの貼り付け、ローカルアップロード、曲検索で作業を開始。波形プレビューと区間選択後、希望の楽器でMIDIを取得できます。','YouTube 링크 분석':'YouTubeリンク解析','웨이브폼 미리듣기':'波形プレビュー','출력 악기·구간 선택':'出力楽器・区間選択','MIDI 편집 PRO':'MIDI編集 PRO','멀티트랙 피아노 롤':'マルチトラックピアノロール','변환된 MIDI를 바로 편집합니다. 128종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'変換したMIDIをすぐ編集。128種楽器、ベロシティ・ピッチベンド・モジュレーション、元に戻す/コピー/クオンタイズまで対応。','128종 악기 지원':'128種楽器対応','벨로시티·CC 파라미터 편집':'ベロシティ・CC編集','악보 변환 · BETA':'楽譜変換 · BETA','MIDI ↔ 악보':'MIDI ↔ 楽譜','MIDI를 PDF·MusicXML 악보로 저장하고, PDF 악보를 인식해 MIDI로 다시 변환합니다. 곡 제목·작사·작곡 메타데이터까지 함께 다룰 수 있습니다.':'MIDIをPDF・MusicXML楽譜として保存し、PDF楽譜を認識してMIDIに再変換。曲名・作詞・作曲メタデータにも対応。','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','PDF → MIDI 변환':'PDF → MIDI変換','악보 미리보기 · 결과 폴더 저장':'楽譜プレビュー・結果フォルダ保存','악보 편집기 · BETA':'楽譜エディター · BETA','악보를 바로 수정':'楽譜をその場で編集','변환된 악보를 페이지·연속·타임라인으로 보며 음표와 벨로시티를 편집합니다. AI 검토 제안으로 피치 점프·겹침 음표 등을 확인하고 바로 반영할 수 있습니다.':'変換した楽譜をページ・連続・タイムライン表示で確認し、音符とベロシティを編集。AIレビュー提案でピッチジャンプや重なり音符をすぐ反映できます。','페이지 / 연속 / 타임라인 보기':'ページ / 連続 / タイムライン表示','음표 선택·속성 편집':'音符選択・属性編集','AI 검토 제안':'AIレビュー提案','홈 · 포털 연동':'ホーム・ポータル連携','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'お知らせ、パッチノート、ライセンス状態をアプリ内で確認しStudioへ移動できます。','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'Googleログイン後、自由掲示板の投稿をアプリで確認・作成できます。','라이브러리':'ライブラリ','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'変換・編集したMIDIをライブラリで管理し、再度開いて作業を続けられます。','정식 라이선스 혜택':'正式ライセンス特典','전체 구간 MIDI 변환':'全曲MIDI変換','악기 변환':'楽器変換','제한 없는 저장 · full song export':'無制限保存 · full song export','MIDI 편집 기능':'MIDI編集機能','악보 변환 · MIDI ↔ PDF':'楽譜変換 · MIDI ↔ PDF','악보 편집기':'楽譜エディター',
    '공식 설치 · 업데이트 프로그램':'公式インストール・更新プログラム','MidiAI Installer는 MidiAI Studio의 설치·업데이트·복구와 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다. Install / Update 한 번으로 자동 설치 또는 업데이트가 진행됩니다.':'MidiAI Installerは、インストール・更新・修復とランタイム確認を1画面で行うWindows専用ツールです。Install / Updateを一度押すだけで自動インストールまたは更新が進みます。','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installerは、インストール・更新・修復とランタイム確認を1画面で行うWindows専用ツールです。','설치 방법':'インストール方法','실행 · 업데이트 방법':'実行・更新方法','결제 정보':'決済情報','주문자 정보':'購入者情報','휴대폰 번호':'携帯電話番号','결제수단':'決済手段','상품명':'商品名','판매가격':'販売価格','결제형태':'決済形態','단건 결제':'単発決済','서비스 제공기간':'サービス提供','결제 완료 후 즉시 라이선스 발급':'決済完了後すぐにライセンス発行','Google 로그인 계정 기준':'Googleログインアカウント基準','Google 로그인 후 자동 입력':'Googleログイン後に表示','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'韓国カード決済時に必要な連絡先です。','결제 버튼을 준비하고 있습니다.':'決済ボタンを準備しています。','라이선스 안내':'ライセンス案内','계좌 입금 안내':'銀行振込案内','사이트 메뉴':'サイトメニュー','언어 선택':'言語','게시판 메뉴':'掲示板メニュー',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'質問・レビュー・情報を自由に共有する場所です。','게시글 목록':'投稿一覧','공지 목록':'お知らせ一覧','공지':'お知らせ','← 목록':'← 一覧','목록':'一覧','유형':'種類','(제목 없음)':'（タイトルなし）','로그인 후 게시글을 작성할 수 있습니다.':'ログイン後に投稿できます。','자주 묻는 질문과 답변을 빠르게 확인하세요.':'よくある質問と回答を素早く確認できます。','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Googleログイン情報とライセンス状態を確認できます。',
    '신규':'新規','개선':'改善','수정':'修正','변경':'変更','변경 사항':'変更内容','내용이 없습니다.':'内容がありません。','목차':'目次','최신':'新しい版','이전':'前の版','버전 이동':'バージョン移動','공유':'共有','전체 패치노트':'パッチノート一覧','문의':'問い合わせ',
    '소식':'ニュース','패치':'パッチ','피아노 커버·오디오·악보를':'ピアノカバー・オーディオ・楽譜を','MidiAI Studio는 Windows용 AI MIDI 변환 소프트웨어입니다. YouTube·MP3·오디오를 MIDI로 바꾸고, PDF/MusicXML 악보 워크플로까지 이어갑니다.':'MidiAI StudioはWindows向けAI MIDI変換ソフトです。YouTube・MP3・オーディオをMIDIに変え、PDF/MusicXML楽譜ワークフローまでつなげます。','음원과 YouTube 음악을 AI로 MIDI로 변환':'音源とYouTube音楽をAIでMIDIに変換','MidiAI Studio는 Windows용 AI MIDI 변환·자동 채보 소프트웨어입니다. MP3·오디오, YouTube, 악보 PDF를 MIDI로 바꾸고 피아노롤에서 편집합니다.':'MidiAI StudioはWindows向けAI MIDI変換・自動採譜ソフトです。MP3・オーディオ、YouTube、楽譜PDFをMIDIに変え、ピアノロールで編集します。','입력부터 편집·악보까지 한 앱에서 이어집니다.':'入力から編集・楽譜まで、ひとつのアプリでつながります。','유튜브 MIDI 변환':'YouTube → MIDI','음원 MIDI 변환':'音源 → MIDI','악보 PDF MIDI':'楽譜PDF → MIDI','MIDI 편집':'MIDI編集','AI 채보':'AI採譜','제품 소개':'製品紹介','분석':'解析','풍선':'風船','god Best 피아노 모음 · 04:36:46':'god Best ピアノコレクション · 04:36:46','선택 정보':'選択情報','길이 04:36:45':'長さ 04:36:45','MIDI 변환':'MIDI変換','MIDI로 변환':'MIDIに変換','YouTube 검색 중...':'YouTube検索中...','길이와 제목 정보 분석 중...':'長さとタイトル情報を解析中...','미리듣기 오디오/웨이브폼 준비 중...':'プレビュー音声/波形を準備中...','트랙 범위':'トラック範囲','미리듣기':'プレビュー','정지':'停止','초기화':'初期化',
    'YouTube 링크나 MP3/오디오를 불러와 AI가 MIDI로 변환합니다.':'YouTubeリンクやMP3/オーディオを読み込み、AIがMIDIに変換します。','PDF·MusicXML 악보 변환과 MIDI 편집까지 한 앱에서 이어집니다.':'PDF・MusicXML楽譜変換とMIDI編集まで1つのアプリで続けられます。','PDF / YouTube / MP3 가이드':'PDF / YouTube / MP3ガイド','관련 변환 가이드':'関連変換ガイド','가이드 허브':'ガイドハブ',
    'MidiAI Studio를 만드는 사람들':'MidiAI Studioをつくる人たち','MidiAI Studio는 피아노 커버·오디오·악보를 MIDI로 변환하고 편집하는 Windows 소프트웨어입니다. 이 페이지는 Google과 사용자가 제품을 신뢰할 수 있도록 ':'MidiAI Studioはピアノカバー・オーディオ・楽譜をMIDIに変換・編集するWindowsソフトです。このページはGoogleとユーザーが製品を信頼できるよう ','제작자, 회사, 연락처, 업데이트, 지원':'制作者・会社・連絡先・更新・サポート',' 정보를 명확히 공개합니다.':'情報を明確に公開します。','제작자 · Author':'制作者 · Author',' — 대표 · Product Lead. AI MIDI 변환, MIDI 편집, 악보(MusicXML/PDF) 워크플로를 실제 연주자·제작자 관점에서 설계합니다.':' — 代表 · Product Lead。AI MIDI変換、MIDI編集、楽譜(MusicXML/PDF)ワークフローを演奏者・制作者の視点で設計します。','문의:':'お問い合わせ:','회사 정보 · Organization':'会社情報 · Organization','상세:':'詳細:','제품 신뢰 · Software credibility':'製品信頼 · Software credibility','MidiAI Studio는 브라우저 일회성 도구가 아니라 ':'MidiAI Studioはブラウザの使い捨てツールではなく ','설치형 Windows 앱':'インストール型Windowsアプリ','입니다. Google 로그인 라이선스, 공식 다운로드, Lifetime 구매, 버전별 패치노트를 제공합니다.':'です。Googleログインライセンス、公式ダウンロード、Lifetime購入、バージョン別パッチノートを提供します。','제품 기능':'製品機能',' — AI 오디오→MIDI, MIDI 편집, 악보 변환':' — AIオーディオ→MIDI、MIDI編集、楽譜変換',' — 최신 설치 파일':' — 最新インストーラー',' — Lifetime 라이선스':' — Lifetimeライセンス',' — 업데이트·버전 이력':' — 更新・バージョン履歴','SEO 가이드':'SEOガイド','고객 지원 · Support':'カスタマーサポート · Support','MIDI 변환 FAQ (20+)':'MIDI変換FAQ (20+)','를 운영합니다.':'を運営しています。','법적 고지':'法的告知','지금 시작하기':'今すぐ始める','무료 체험으로 YouTube·오디오→MIDI 변환을 확인하세요.':'無料トライアルでYouTube・オーディオ→MIDI変換を確認してください。','개인정보':'プライバシー',
    '← 나의 문의':'← マイ問い合わせ','새 문의':'新しい問い合わせ','게시글':'投稿','댓글을 입력하세요':'コメントを入力','댓글 불러오는 중...':'コメント読み込み中...','사진/영상/MIDI 첨부':'写真/動画/MIDI添付','JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 파일당 50MB · 최대 5개':'JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 各50MB · 最大5件','첨부한 파일이 없습니다.':'添付ファイルはありません。','이모티콘':'絵文字','이모티콘 선택':'絵文字を選択',    '이모티콘을 눌러 내용에 삽입します.':'絵文字を押して本文に挿入します。',
    '접속 정보':'接続情報','국가':'国','지역':'地域','최근 접속':'最終接続','IP':'IP','언어':'言語','접속 환경':'接続環境','국가 정보 없음':'位置情報なし','MidiAI Studio App':'MidiAI Studio App'
  }
};

Object.assign(I18N.en, {
  '프로그램 사용 가이드':'App usage guide',
  'Windows MIDI 작업 도구':'Windows MIDI workstation',
  '변환에서 악보까지':'From conversion to score',
  '단순 변환기가 아닙니다':'Not just a converter',
  'MidiAI Studio는 YouTube·MP3/WAV를 피아노 MIDI로 변환하고, MIDI Editor에서 다듬고, AI Assistant로 정리·편곡하고, Score Editor에서 악보를 수정한 뒤 MIDI·MusicXML·PDF로 내보내는 Windows 프로그램입니다.':'MidiAI Studio converts YouTube and MP3/WAV into piano MIDI, then you edit in MIDI Editor, tidy and arrange with AI Assistant, revise notation in Score Editor, and export MIDI, MusicXML, or PDF.',
  '작업 흐름':'Workflow',
  '입력 → MIDI → 편집 → 악보 → 출력':'Input → MIDI → edit → score → export',
  '오디오·YouTube 변환과 PDF 악보 가져오기는 경로가 다릅니다. PDF는 Score Editor의 Beta 인식입니다.':'Audio/YouTube conversion and PDF score import use different paths. PDF recognition is Beta in Score Editor.',
  '가져오기':'Import',
  'YouTube / MP3·WAV. PDF 악보는 Score Editor · Beta':'YouTube / MP3·WAV. PDF scores go through Score Editor · Beta',
  '주력은 피아노 MIDI 채보':'Main path: piano MIDI transcription',
  '피아노 롤에서 프로젝트처럼 다듬기':'Shape it like a MIDI project in the piano roll',
  'AI 보정·편곡':'AI tidy / arrange',
  '정리, 쉬운 조, 악기 파트 재작성':'Cleanup, easier keys, instrument-part rewrite',
  '악보 편집':'Score editing',
  'Score Editor에서 기보 수정':'Edit notation in Score Editor',
  '내보내기':'Export',
  'MIDI · MusicXML · PDF · Score project':'MIDI · MusicXML · PDF · Score project',
  '가져오기 · 변환':'Import · convert',
  'YouTube / 오디오 → 피아노 MIDI':'YouTube / audio → piano MIDI',
  '주력은 YouTube 링크와 MP3·WAV를 피아노 MIDI로 채보하는 것입니다. 웨이브폼에서 구간을 고른 뒤 Studio에서 변환합니다. Band / Orchestra는 Preview이며, 스템을 나눈 뒤 각 스템을 MIDI로 채보합니다. 곡에 따라 결과 품질이 달라질 수 있습니다.':'The main path transcribes YouTube links and MP3/WAV to piano MIDI. Pick a range on the waveform, then convert in Studio. Band / Orchestra is Preview: stems are split, then each stem is transcribed to MIDI. Quality varies by source.',
  'YouTube · MP3 / WAV → 피아노 MIDI':'YouTube · MP3 / WAV → piano MIDI',
  '구간 선택 · 웨이브폼 미리듣기':'Range select · waveform preview',
  'Band / Orchestra Preview · 스템 → MIDI':'Band / Orchestra Preview · stems → MIDI',
  'MIDI 작업실':'MIDI workshop',
  '변환 결과를 MIDI 프로젝트처럼 다듬기':'Shape conversion results like a MIDI project',
  'MIDI Editor는 노트 한두 개를 고치는 화면이 아닙니다. 피아노 롤에서 멀티트랙을 다루고, 앱 안에서 바로 재생하며 양자화·이조·템포·벨로시티를 조정합니다.':'MIDI Editor is not a tiny note-fix screen. Work multi-track in the piano roll, play in-app, and adjust quantize, transpose, tempo, and velocity.',
  'Piano Roll · 멀티트랙 · Velocity':'Piano Roll · multi-track · Velocity',
  'Quantize · Transpose · Tempo map':'Quantize · Transpose · Tempo map',
  '재생 · GM 악기 · Mixer / CC':'Playback · GM instruments · Mixer / CC',
  'MIDI를 정리하고, 연주하기 쉽게 다듬기':'Tidy MIDI and make it easier to play',
  '채보 신경망과는 다른 보정·편곡 도구입니다. MIDI를 정리하고, 연주하기 쉬운 조를 찾고, 특정 악기에서 치기 쉬운 파트로 다시 씁니다. 모든 곡을 원하는 악기로 자동 변환하는 기능은 아닙니다.':'These are correction and arrangement tools, not the transcription network. Clean up MIDI, find an easier key, and rewrite a part so it is easier to play on a chosen instrument — for example violin. It does not auto-convert every song to every instrument.',
  'Cleanup · Humanize · Optimize · Verify':'Cleanup · Humanize · Optimize · Verify',
  'Easy Key · White Keys — 쉬운 조, 흰건반 단순화':'Easy Key · White Keys — easier keys, white-key simplification',
  'Instrument Arrange — 예: 바이올린처럼 연주하기 쉬운 파트로 재작성':'Instrument Arrange — e.g. rewrite a part that is easier to play on violin',
  'Score Editor · 계속 개선 중':'Score Editor · still improving',
  '악보로 보고, 기보를 수정':'View as notation and edit it',
  'MIDI를 악보로 보기만 하는 화면이 아닙니다. 음표·쉼표, 이음줄, 강약, 가사 등을 앱 안에서 고친 뒤 MusicXML·PDF로 내보냅니다. 전문 출판 악보 편집기는 아니며, 첫 실행에 실험 안내가 있습니다.':'This is not view-only. Edit notes, rests, ties, dynamics, and lyrics in-app, then export MusicXML or PDF. It is not a professional publishing suite; a first-run experimental notice is shown.',
  '음표·쉼표 편집 · Grand Staff · Voice':'Note/rest editing · Grand Staff · Voice',
  'Tie / Slur · Dynamics · Articulation · Lyrics':'Tie / Slur · Dynamics · Articulation · Lyrics',
  'MusicXML · Native PDF 내보내기':'MusicXML · native PDF export',
  'PDF 악보 · Beta':'PDF score · Beta',
  'Score Editor에서 악보 PDF 가져오기':'Import a score PDF in Score Editor',
  'YouTube·오디오 변환과 같은 완성형 채보가 아닙니다. Score Editor에서 PDF 악보를 가져오면 인식해 MIDI / MusicXML로 만듭니다. 인식 품질은 악보 상태에 따라 달라지며 Beta로 제공됩니다.':'This is not the same mature path as YouTube/audio transcription. Import a score PDF in Score Editor to recognize MIDI/MusicXML. Quality depends on the score, and it is offered as Beta.',
  'Score Editor → PDF 가져오기':'Score Editor → import PDF',
  '인식 후 MIDI / MusicXML':'Then MIDI / MusicXML',
  '이후 MIDI Editor · Score Editor에서 보정':'Then correct in MIDI Editor or Score Editor',
  '단순 저장 폴더가 아닙니다. 변환·편집 결과를 다시 찾고, 미리듣고, MIDI Editor 또는 Score Editor로 다시 여는 작업 허브입니다.':'Not just a dump folder. Relocate conversion/edit results, preview them, and reopen in MIDI Editor or Score Editor.',
  '재생 · 사운드팩':'Playback · sound packs',
  '앱 안에서 MIDI를 바로 재생하고, 선택 구간·반복 재생을 사용합니다. 고품질 사운드팩은 선택 설치입니다.':'Play MIDI in-app, including a selected range and loop. High-quality sound packs are optional installs.'
});
Object.assign(I18N.ja, {
  '프로그램 사용 가이드':'プログラム使い方ガイド',
  'Windows MIDI 작업 도구':'Windows MIDI作業ツール',
  '변환에서 악보까지':'変換から楽譜まで',
  '단순 변환기가 아닙니다':'単なる変換ツールではありません',
  'MidiAI Studio는 YouTube·MP3/WAV를 피아노 MIDI로 변환하고, MIDI Editor에서 다듬고, AI Assistant로 정리·편곡하고, Score Editor에서 악보를 수정한 뒤 MIDI·MusicXML·PDF로 내보내는 Windows 프로그램입니다.':'MidiAI StudioはYouTube・MP3/WAVをピアノMIDIに変換し、MIDI Editorで整え、AI Assistantで整理・編曲し、Score Editorで楽譜を直してからMIDI・MusicXML・PDFに書き出すWindowsプログラムです。',
  '작업 흐름':'作業の流れ',
  '입력 → MIDI → 편집 → 악보 → 출력':'入力 → MIDI → 編集 → 楽譜 → 書き出し',
  '오디오·YouTube 변환과 PDF 악보 가져오기는 경로가 다릅니다. PDF는 Score Editor의 Beta 인식입니다.':'オーディオ／YouTube変換とPDF楽譜の取り込みは経路が違います。PDF認識はScore EditorのBetaです。',
  '가져오기':'取り込み',
  'YouTube / MP3·WAV. PDF 악보는 Score Editor · Beta':'YouTube / MP3・WAV。PDF楽譜はScore Editor · Beta',
  '주력은 피아노 MIDI 채보':'主経路はピアノMIDI採譜',
  '피아노 롤에서 프로젝트처럼 다듬기':'ピアノロールでプロジェクトのように整える',
  'AI 보정·편곡':'AI補正・編曲',
  '정리, 쉬운 조, 악기 파트 재작성':'整理、弾きやすい調、楽器パートの書き直し',
  '악보 편집':'楽譜編集',
  'Score Editor에서 기보 수정':'Score Editorで記譜を修正',
  '내보내기':'書き出し',
  'MIDI · MusicXML · PDF · Score project':'MIDI · MusicXML · PDF · Score project',
  '가져오기 · 변환':'取り込み · 変換',
  'YouTube / 오디오 → 피아노 MIDI':'YouTube / オーディオ → ピアノMIDI',
  '주력은 YouTube 링크와 MP3·WAV를 피아노 MIDI로 채보하는 것입니다. 웨이브폼에서 구간을 고른 뒤 Studio에서 변환합니다. Band / Orchestra는 Preview이며, 스템을 나눈 뒤 각 스템을 MIDI로 채보합니다. 곡에 따라 결과 품질이 달라질 수 있습니다.':'主経路はYouTubeリンクとMP3/WAVをピアノMIDIに採譜することです。波形で区間を選んでStudioで変換します。Band / OrchestraはPreviewで、ステムに分けてから各ステムをMIDIに採譜します。曲によって品質は変わります。',
  'YouTube · MP3 / WAV → 피아노 MIDI':'YouTube · MP3 / WAV → ピアノMIDI',
  '구간 선택 · 웨이브폼 미리듣기':'区間選択 · 波形プレビュー',
  'Band / Orchestra Preview · 스템 → MIDI':'Band / Orchestra Preview · ステム → MIDI',
  'MIDI 작업실':'MIDI作業室',
  '변환 결과를 MIDI 프로젝트처럼 다듬기':'変換結果をMIDIプロジェクトのように整える',
  'MIDI Editor는 노트 한두 개를 고치는 화면이 아닙니다. 피아노 롤에서 멀티트랙을 다루고, 앱 안에서 바로 재생하며 양자화·이조·템포·벨로시티를 조정합니다.':'MIDI Editorは音符を少し直す画面ではありません。ピアノロールでマルチトラックを扱い、アプリ内再生しながらクオンタイズ・移調・テンポ・ベロシティを調整します。',
  'Piano Roll · 멀티트랙 · Velocity':'Piano Roll · マルチトラック · Velocity',
  'Quantize · Transpose · Tempo map':'Quantize · Transpose · Tempo map',
  '재생 · GM 악기 · Mixer / CC':'再生 · GM楽器 · Mixer / CC',
  'MIDI를 정리하고, 연주하기 쉽게 다듬기':'MIDIを整理し、演奏しやすく整える',
  '채보 신경망과는 다른 보정·편곡 도구입니다. MIDI를 정리하고, 연주하기 쉬운 조를 찾고, 특정 악기에서 치기 쉬운 파트로 다시 씁니다. 모든 곡을 원하는 악기로 자동 변환하는 기능은 아닙니다.':'採譜ネットワークとは別の補正・編曲ツールです。MIDIを整理し、弾きやすい調を探し、特定の楽器で演奏しやすいパートに書き直します。すべての曲を希望の楽器へ自動変換する機能ではありません。',
  'Cleanup · Humanize · Optimize · Verify':'Cleanup · Humanize · Optimize · Verify',
  'Easy Key · White Keys — 쉬운 조, 흰건반 단순화':'Easy Key · White Keys — 弾きやすい調、白鍵への単純化',
  'Instrument Arrange — 예: 바이올린처럼 연주하기 쉬운 파트로 재작성':'Instrument Arrange — 例: バイオリンで演奏しやすいパートへ書き直し',
  'Score Editor · 계속 개선 중':'Score Editor · 改善継続中',
  '악보로 보고, 기보를 수정':'楽譜として見て、記譜を直す',
  'MIDI를 악보로 보기만 하는 화면이 아닙니다. 음표·쉼표, 이음줄, 강약, 가사 등을 앱 안에서 고친 뒤 MusicXML·PDF로 내보냅니다. 전문 출판 악보 편집기는 아니며, 첫 실행에 실험 안내가 있습니다.':'表示だけではありません。音符・休符、タイ、強弱、歌詞などをアプリ内で直してからMusicXML・PDFに書き出します。専門の出版楽譜エディターではなく、初回起動時に実験案内があります。',
  '음표·쉼표 편집 · Grand Staff · Voice':'音符・休符編集 · Grand Staff · Voice',
  'Tie / Slur · Dynamics · Articulation · Lyrics':'Tie / Slur · Dynamics · Articulation · Lyrics',
  'MusicXML · Native PDF 내보내기':'MusicXML · Native PDF書き出し',
  'PDF 악보 · Beta':'PDF楽譜 · Beta',
  'Score Editor에서 악보 PDF 가져오기':'Score Editorで楽譜PDFを取り込む',
  'YouTube·오디오 변환과 같은 완성형 채보가 아닙니다. Score Editor에서 PDF 악보를 가져오면 인식해 MIDI / MusicXML로 만듭니다. 인식 품질은 악보 상태에 따라 달라지며 Beta로 제공됩니다.':'YouTube・オーディオ変換と同じ完成度の採譜ではありません。Score EditorでPDF楽譜を取り込むとMIDI / MusicXMLに認識します。品質は楽譜の状態により、Beta提供です。',
  'Score Editor → PDF 가져오기':'Score Editor → PDF取り込み',
  '인식 후 MIDI / MusicXML':'認識後 MIDI / MusicXML',
  '이후 MIDI Editor · Score Editor에서 보정':'その後 MIDI Editor · Score Editorで補正',
  '단순 저장 폴더가 아닙니다. 변환·편집 결과를 다시 찾고, 미리듣고, MIDI Editor 또는 Score Editor로 다시 여는 작업 허브입니다.':'単なる保存フォルダではありません。変換・編集結果を探し、プレビューし、MIDI EditorまたはScore Editorで再び開く作業ハブです。',
  '재생 · 사운드팩':'再生 · サウンドパック',
  '앱 안에서 MIDI를 바로 재생하고, 선택 구간·반복 재생을 사용합니다. 고품질 사운드팩은 선택 설치입니다.':'アプリ内でMIDIを再生し、選択区間・リピート再生が使えます。高品質サウンドパックは選択インストールです。'
});

function isInAppBrowser(){
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER|DaumApps|wv\)|; wv|WebView/i.test(ua);
}

function showOAuthBrowserNotice(){
  if(!isInAppBrowser() || document.querySelector('.oauth-browser-notice')) return;
  const notice = document.createElement('div');
  notice.className = 'oauth-browser-notice';
  notice.innerHTML = `
    <div>
      <b>Google 로그인 안내</b>
      <span>카카오톡·디스코드·인스타 내부 브라우저에서는 Google 로그인이 차단될 수 있어요. Chrome/Safari/삼성 인터넷으로 열어주세요.</span>
    </div>
    <button type="button" class="ghost oauth-copy-url">주소 복사</button>
  `;
  const header = document.querySelector('.topbar');
  if(header && header.parentNode) header.parentNode.insertBefore(notice, header.nextSibling);
  else document.body.prepend(notice);
  notice.querySelector('.oauth-copy-url')?.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(location.href);
      alert('주소를 복사했어요. Chrome/Safari/삼성 인터넷 주소창에 붙여넣어 주세요.');
    }catch(e){
      prompt('아래 주소를 복사해서 Chrome/Safari/삼성 인터넷에서 열어주세요.', location.href);
    }
  });
}

function dict(){ return I18N[lang] || {}; }
function normalize(s){ return String(s || '').replace(/\s+/g, ' ').trim(); }
function tt(ko){
  if(lang === 'ko') return ko;
  const d = dict();
  const key = normalize(ko);
  return d[key] || d[key.replace(/\s+/g,'')] || ko;
}
function hubNoticeHeadHtml(){
  return `<div class="hub-list-head hub-notice-head"><span>${esc(tt('번호'))}</span><span>${esc(tt('제목'))}</span><span>${esc(tt('글쓴이'))}</span><span>${esc(tt('작성일'))}</span><span>${esc(tt('조회'))}</span></div>`;
}
function hubTicketHeadHtml(){
  return `<div class="hub-list-head hub-ticket-head"><span>${esc(tt('제목'))}</span><span>${esc(tt('유형'))}</span><span>${esc(tt('상태'))}</span><span>${esc(tt('작성일'))}</span></div>`;
}
function translate(s){
  const raw = String(s ?? '');
  const trimmed = normalize(raw);
  if (!trimmed || lang === 'ko') return raw;
  const d = dict();
  if (d[trimmed]) return raw.replace(trimmed, d[trimmed]);
  const compact = trimmed.replace(/\s+/g,'');
  for (const [k,v] of Object.entries(d)) {
    if (k.replace(/\s+/g,'') === compact) return raw.replace(trimmed, v);
  }
  return raw;
}

function updatePurchaseLinks(){
  const target = lifetimePurchaseHref();
  document.querySelectorAll('a[href*="purchase.html"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const pathOnly = href.split('#')[0].split('?')[0];
    if(!/(?:^|\/)purchase\.html$/i.test(pathOnly)) return;
    const qIdx = href.indexOf('?');
    const hIdx = href.indexOf('#');
    const qs = qIdx >= 0 ? href.slice(qIdx, hIdx >= 0 && hIdx > qIdx ? hIdx : undefined) : '';
    const hash = hIdx >= 0 ? href.slice(hIdx) : '';
    a.setAttribute('href', target + qs + hash);
  });
}

function persistSiteLang(next){
  const v = ['ko','en','ja'].includes(next) ? next : 'ko';
  try{ localStorage.setItem('midiai_lang', v); }catch(_){}
}
function cacheAccessCountryCode(code){
  const c = String(code || '').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(c) || c === 'ZZ' || c === 'XX') return;
  try{ localStorage.setItem('midiai_country', c); }catch(_){}
}
function applyStaticI18n(){
  document.documentElement.lang = lang;
  // Persist path locale / preferred UI language, but never overwrite saved choice
  // just because the KR checkout page forced lang='ko' for payment UI.
  if(!(isRootKoreanPurchasePage && !pathLang)){
    persistSiteLang(pathLang || lang);
  }
  document.documentElement.classList.remove('locale-pending');
  document.documentElement.classList.add('i18n-ready');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = lang === 'ko' ? key : (dict()[key] || key);
    el.textContent = val;
  });

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest?.('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);
    const original = textOriginals.get(node);
    node.nodeValue = lang === 'ko' ? original : translate(original);
  });

  document.querySelectorAll('input[placeholder], textarea[placeholder], button[title], a[title], [aria-label]').forEach(el => {
    for (const attr of ['placeholder','title','aria-label']) {
      if (!el.hasAttribute(attr)) continue;
      let map = attrOriginals.get(el);
      if (!map) { map = {}; attrOriginals.set(el, map); }
      if (!map[attr]) map[attr] = el.getAttribute(attr);
      el.setAttribute(attr, lang === 'ko' ? map[attr] : translate(map[attr]));
    }
  });

  updatePurchaseLinks();
  refreshTopbarActionLabels();
  refreshTopbarPageTitle();
  applySupportI18n();
  applyDownloadsI18n();
  applyFooterI18n();
  updatePurchaseI18n();
  paintProfileCreditStrip();
}
function resolveTopbarPageTitle(){
  if(page === 'support.html') return supportLocaleText().title;
  if(page === 'downloads.html') return downloadLocaleText().title;
  const path = location.pathname.replace(/\\/g,'/').toLowerCase();
  if(/\/guide\/?(index\.html)?$/.test(path) || path.endsWith('/guide/index.html')) return tt('가이드');
  if(page === 'guide.html'){
    const h1 = document.querySelector('#guideDetail h1')?.textContent?.trim();
    if(h1) return h1.length > 34 ? `${h1.slice(0,32)}…` : h1;
    return tt('가이드');
  }
  if(path.includes('/guides')){
    if(/\/guides\/?$/.test(path) || path.endsWith('/guides/index.html')) return tt('가이드');
    const h1 = document.querySelector('.seo-prose h1')?.textContent?.trim();
    if(h1) return h1.length > 34 ? `${h1.slice(0,32)}…` : h1;
  }
  const raw = (document.title || 'MidiAI Studio').trim();
  const short = raw.split(/\s+[—–-]\s+/)[0].trim();
  const title = short || 'MidiAI Studio';
  return lang === 'ko' ? title : (translate(title) || title);
}
function refreshTopbarPageTitle(){
  const el = document.querySelector('.topbar-page');
  if(!el) return;
  el.textContent = resolveTopbarPageTitle();
}
function downloadLocaleText(){
  if(lang === 'en') return {
    title:'Downloads',
    desc:'Check the latest installer and version info.',
    guideTitle:'Official installer & updater',
    guideLead:'MidiAI Installer is a Windows tool for install, update, repair, and runtime checks in one screen. One Install / Update action automatically installs or updates.',
    setupTitle:'How to install',
    runTitle:'How to run & update',
    setupSteps:[
      'Use the <strong>Download</strong> button above to get <code>MidiAI Installer.exe</code>.',
      'Run the installer and confirm the install path. The default is <code>C:\\MidiAI</code>.',
      'Click <strong>Install / Update</strong>. If MidiAI is not installed yet, a full install runs; if it is already installed, update or repair runs automatically.',
      'Progress follows Core → Media → Library → Runtime → Check. Check status in the Installation Log below.',
      'When verification finishes, open the install folder with <strong>Open Folder</strong>.'
    ],
    runSteps:[
      'If already installed, run the Installer again and click <strong>Install / Update</strong> to refresh or repair the app.',
      'If launch fails or files are missing, run the same <strong>Install / Update</strong> action again for automatic repair.',
      'After install, launch MidiAI Studio from the <code>C:\\MidiAI</code> folder.',
      'License activation happens after launch by signing in with your Google account.',
      'If issues continue, attach Installer <strong>System Check</strong> and <strong>Show HWID</strong> results to a 1:1 support ticket.'
    ],
    mandatory:'Required update',
    officialInstaller:'Official installer',
    buyLicense:'Buy license',
    patchNotes:'Patch notes'
  };
  if(lang === 'ja') return {
    title:'ダウンロード',
    desc:'最新インストーラーとバージョン情報を確認できます。',
    guideTitle:'公式インストール・更新プログラム',
    guideLead:'MidiAI Installerは、インストール・更新・修復とランタイム確認を1画面で行うWindows専用ツールです。Install / Updateを一度押すだけで自動インストールまたは更新が進みます。',
    setupTitle:'インストール方法',
    runTitle:'実行・更新方法',
    setupSteps:[
      '上の<strong>ダウンロード</strong>ボタンで<code>MidiAI Installer.exe</code>を取得します。',
      'インストーラーを実行し、インストール先を確認します。既定パスは<code>C:\\MidiAI</code>です。',
      '<strong>Install / Update</strong>を押します。未インストールならフルインストール、既に入っている場合は更新・修復が自動で進みます。',
      'Core → Media → Library → Runtime → Check の順で進み、下部のInstallation Logで状態を確認します。',
      '最終確認が終わると<strong>Open Folder</strong>でインストールフォルダを開けます。'
    ],
    runSteps:[
      'すでにインストール済みの場合はInstallerを再実行し、<strong>Install / Update</strong>でアプリを更新または修復します。',
      '起動エラーやファイル欠損がある場合も、同じ<strong>Install / Update</strong>で自動修復を試します。',
      'インストール後は<code>C:\\MidiAI</code>フォルダからMidiAI Studioを起動します。',
      'ライセンス認証はアプリ起動後、Googleアカウントでログインして行います。',
      '問題が続く場合はInstallerの<strong>System Check</strong>と<strong>Show HWID</strong>結果を1:1問い合わせに添付してください。'
    ],
    mandatory:'必須アップデート',
    officialInstaller:'公式インストーラー',
    buyLicense:'ライセンス購入',
    patchNotes:'パッチノート'
  };
  return {
    title:'다운로드',
    desc:'최신 설치 파일과 버전 정보를 확인합니다.',
    guideTitle:'공식 설치 · 업데이트 프로그램',
    guideLead:'MidiAI Installer는 MidiAI Studio의 설치·업데이트·복구와 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다. Install / Update 한 번으로 자동 설치 또는 업데이트가 진행됩니다.',
    setupTitle:'설치 방법',
    runTitle:'실행 · 업데이트 방법',
    setupSteps:[
      '위 <strong>다운로드</strong> 버튼으로 <code>MidiAI Installer.exe</code>를 받습니다.',
      '설치 파일을 실행하고 설치 경로를 확인합니다. 기본 경로는 <code>C:\\MidiAI</code>입니다.',
      '<strong>Install / Update</strong>를 누릅니다. 미설치면 전체 설치, 이미 설치된 경우 업데이트·복구가 자동으로 진행됩니다.',
      'Core → Media → Library → Runtime → Check 순서로 진행되며, 하단 Installation Log에서 상태를 확인합니다.',
      '최종 점검이 완료되면 <strong>Open Folder</strong>로 설치 폴더를 열 수 있습니다.'
    ],
    runSteps:[
      '이미 설치된 경우 Installer를 다시 실행한 뒤 <strong>Install / Update</strong>로 앱을 갱신하거나 복구합니다.',
      '실행 오류나 파일 누락이 있어도 같은 <strong>Install / Update</strong>로 자동 복구를 시도합니다.',
      '설치 후 <code>C:\\MidiAI</code> 폴더에서 MidiAI Studio를 실행합니다.',
      '라이선스 인증은 앱 실행 후 Google 계정으로 로그인해 진행합니다.',
      '문제가 계속되면 Installer의 <strong>System Check</strong>와 <strong>Show HWID</strong> 결과를 1:1 문의에 첨부해 주세요.'
    ],
    mandatory:'필수 업데이트',
    officialInstaller:'공식 설치 프로그램',
    buyLicense:'라이선스 구매',
    patchNotes:'패치노트'
  };
}
function applyDownloadsI18n(){
  if(page !== 'downloads.html') return;
  const t = downloadLocaleText();
  const h1 = document.querySelector('.hub-topline h1');
  const desc = document.querySelector('.hub-topline .hub-desc');
  if(h1) h1.textContent = t.title;
  if(desc) desc.textContent = t.desc;
  const guideH2 = document.querySelector('.download-guide-intro h2');
  const guideLead = document.querySelector('.download-guide-lead');
  if(guideH2) guideH2.textContent = t.guideTitle;
  if(guideLead) guideLead.textContent = t.guideLead;
  const blocks = document.querySelectorAll('.download-guide-block');
  const setupH3 = blocks[0]?.querySelector('h3');
  const runH3 = blocks[1]?.querySelector('h3');
  if(setupH3) setupH3.textContent = t.setupTitle;
  if(runH3) runH3.textContent = t.runTitle;
  const setupLis = blocks[0]?.querySelectorAll('.guide-step-text') || [];
  setupLis.forEach((el,i)=>{ if(t.setupSteps[i]) el.innerHTML = t.setupSteps[i]; });
  const runLis = blocks[1]?.querySelectorAll('.guide-step-text') || [];
  runLis.forEach((el,i)=>{ if(t.runSteps[i]) el.innerHTML = t.runSteps[i]; });
  const pill = document.querySelector('.portal-mandatory-pill');
  if(pill) pill.textContent = t.mandatory;
  const meta = document.querySelector('.download-card-meta-row span:last-child');
  if(meta && /공식|Official|公式/.test(meta.textContent||'')) meta.textContent = t.officialInstaller;
  document.querySelectorAll('.portal-download-actions a.secondary').forEach(a=>{
    if(/패치노트|Patch notes|パッチノート/.test(a.textContent||'') || (a.getAttribute('href')||'').includes('patch-notes')) a.textContent = t.patchNotes;
    if(/라이선스|Buy license|ライセンス購入/.test(a.textContent||'') || (a.getAttribute('href')||'').includes('purchase')) a.textContent = t.buyLicense;
  });
  refreshTopbarPageTitle();
}
function applyFooterI18n(){
  const box = document.querySelector('.business-box');
  if(!box) return;
  if(!box.dataset.koHtml) box.dataset.koHtml = box.innerHTML;
  if(lang === 'en'){
    box.innerHTML = `
      <span>Business name: MidiAI Studio</span>
      <span>CEO: Jeonghwan Choi</span>
      <span>Business registration: 332-22-02381</span>
      <span>Address: 1101, 47 Changwondae-ro 780beon-gil, Seongsan-gu, Changwon-si, Gyeongsangnam-do, Korea</span>
      <span>Phone: 010-2166-5563</span>
      <span>Mail-order registration: 2026-Changwon Seongsan-0312</span>
      <span>Support: 1:1 Support board</span>
      <span>Email: midiaistudio@gmail.com</span>`;
  } else if(lang === 'ja'){
    box.innerHTML = `
      <span>商号: MidiAI Studio</span>
      <span>代表者: チェ・ジョンファン</span>
      <span>事業者登録番号: 332-22-02381</span>
      <span>所在地: 慶尚南道昌原市城山区昌原大路780番街47、1101号</span>
      <span>電話: 010-2166-5563</span>
      <span>通信販売業届出: 第2026-昌原城山-0312号</span>
      <span>サポート: お問い合わせ掲示板</span>
      <span>メール: midiaistudio@gmail.com</span>`;
  } else {
    box.innerHTML = box.dataset.koHtml;
  }
}
function tr(k){
  const KO = {
    login:'Google 로그인', logout:'로그아웃', guest:'로그인 전', guest_desc:'Google 로그인으로 라이선스 확인 준비',
    license_wait:'라이선스 확인 전', active:'라이선스 활성화됨', none:'라이선스 없음', checking:'라이선스 확인 중',
    check_failed:'확인 실패', empty:'표시할 내용이 없습니다.', saved:'저장 완료', ticket_created:'문의가 등록되었습니다.', privacy_required:'개인정보 수집·이용에 동의해주세요.',
    need_login:'로그인이 필요합니다.', download:'다운로드', admin_required:'관리자 로그인이 필요합니다.',
    no_permission:'권한이 없습니다.', answered:'답변 완료', closed:'종료', open:'접수', reply_placeholder:'답변 또는 추가 내용 입력',
    submit:'등록', edit:'수정', del:'삭제', close:'종료 처리', updated:'수정 완료', deleted:'삭제 완료', manage:'관리', confirm_delete:'정말 삭제할까요?',
    reply_toast_title:'💬 문의 답변이 등록되었습니다.', reply_toast_body:'문의하신 내용에 답변이 작성되었습니다.', reply_toast_action:'답변 보기',
    admin_ticket_toast_title:'💬 새로운 문의가 등록되었습니다.', admin_ticket_toast_body:'새 1:1 문의가 접수되었습니다.', admin_ticket_toast_action:'문의 보기',
    admin_reply_toast_title:'💬 문의에 새 덧글이 등록되었습니다.', admin_reply_toast_body:'기존 문의에 사용자 덧글이 추가되었습니다.', admin_reply_toast_action:'문의 보기',
    notify_title:'알림', notify_empty:'새 알림이 없습니다.', notify_mark_all:'모두 읽음', notify_clear_all:'모두 삭제', notify_clear_confirm:'알림을 모두 삭제할까요?', notify_delete_aria:'알림 삭제', notify_login:'로그인하면 알림을 확인할 수 있습니다.',
    notify_board_comment:'님이 회원님의 글에 댓글을 남겼습니다.', notify_ticket_reply:'문의에 답변이 등록되었습니다.', notify_license_change:'라이선스가 변경되었습니다.', notify_payment_complete:'결제가 완료되었습니다.', notify_payment_cancel:'결제가 취소되었습니다.', notify_payment_partial:'부분 환불이 적용되었습니다.', notify_refund_review:'환불 검토가 필요합니다.', notify_admin_message:'관리자 쪽지', notify_notice:'새 공지사항이 등록되었습니다.', notify_patch_note:'새 패치노트가 등록되었습니다.', notify_aria:'알림',
    notify_filter_all:'전체', notify_filter_payment:'결제', notify_filter_license:'라이선스', notify_filter_inquiry:'문의', notify_filter_community:'커뮤니티', notify_filter_other:'기타',
    notify_credit_purchase:'크레딧 충전 완료', notify_credit_purchase_body:'{n} 크레딧이 지급되었습니다.', notify_credit_grant:'크레딧 지급', notify_credit_grant_body:'관리자가 {n} 크레딧을 지급했습니다.', notify_credit_deduct:'크레딧 조정', notify_credit_deduct_body:'{n} 크레딧이 회수되었습니다.', notify_reservation_complete:'예약 변환이 완료되었습니다.', notify_reservation_failed:'예약 변환이 실패했습니다.', notify_time_just_now:'방금', notify_time_minutes:'{n}분 전', notify_time_hours:'{n}시간 전', notify_time_yesterday:'어제',
    profile_menu_aria:'계정 메뉴', profile_my_account:'내 계정', profile_my_tickets:'나의 문의', profile_my_posts:'내 작성글', profile_notify_settings:'알림 설정',
    credit_label:'Credit', credit_balance:'보유 크레딧', credit_buy:'크레딧 충전', credit_history:'크레딧 사용내역',
    credit_history_all:'전체 사용내역', credit_history_more:'더 보기', credit_refresh:'새로고침',
    credit_unlimited:'AI 변환 무제한', credit_no_deduct:'Credit 차감 없음',
    credit_lifetime_note:'이 계정은 Lifetime 라이선스를 사용 중입니다.',
    credit_lifetime_unused:'Lifetime 이용 중에는 사용되지 않습니다.',
    credit_recent:'최근 사용내역', credit_empty:'사용내역이 없습니다.', credit_failed:'잔액을 불러오지 못했습니다.',
    credit_using:'Lifetime 이용 중', credit_ledger_refund:'변환 실패 반환',
    credit_ledger_purchase:'크레딧 구매', credit_ledger_grant:'관리자 크레딧 지급',
    credit_ledger_deduct:'관리자 크레딧 회수', credit_ledger_conversion:'AI 변환',
    credit_col_date:'날짜', credit_col_item:'내용', credit_col_delta:'증감', credit_col_balance:'잔액',
    board_mine_title:'내 작성글', board_mine_desc:'내가 작성한 자유게시판 글만 표시합니다.', board_mine_all:'전체 글 보기', board_mine_only:'내 글만',
    notify_settings_title:'알림 설정', notify_pref_inapp:'앱 알림', notify_pref_email:'이메일 알림', notify_pref_saved:'저장됨'
  };
  const EN = {
    login:'Sign in with Google', logout:'Logout', guest:'Not signed in', guest_desc:'Sign in with Google to check license',
    license_wait:'Not checked yet', active:'License active', none:'No license', checking:'Checking license',
    check_failed:'Check failed', empty:'Nothing to show.', saved:'Saved', ticket_created:'Ticket created.', privacy_required:'Please agree to the privacy policy.',
    need_login:'Sign-in required.', download:'Download', admin_required:'Admin sign-in required.',
    no_permission:'You do not have permission.', answered:'Answered', closed:'Closed', open:'Open', reply_placeholder:'Reply or add more details',
    submit:'Submit', edit:'Edit', del:'Delete', close:'Close', updated:'Updated', deleted:'Deleted', manage:'Manage', confirm_delete:'Delete this item?',
    reply_toast_title:'💬 A reply was posted on your ticket.', reply_toast_body:'An admin replied to your support request.', reply_toast_action:'View reply',
    admin_ticket_toast_title:'💬 A new support ticket was submitted.', admin_ticket_toast_body:'A new 1:1 inquiry has been received.', admin_ticket_toast_action:'View ticket',
    admin_reply_toast_title:'💬 A new reply was added to a ticket.', admin_reply_toast_body:'A user posted a follow-up on an existing ticket.', admin_reply_toast_action:'View ticket',
    notify_title:'Notifications', notify_empty:'No new notifications.', notify_mark_all:'Mark all read', notify_clear_all:'Clear all', notify_clear_confirm:'Delete all notifications?', notify_delete_aria:'Delete notification', notify_login:'Sign in to see notifications.',
    notify_board_comment:' commented on your post.', notify_ticket_reply:'A reply was posted on your ticket.', notify_license_change:'Your license was updated.', notify_payment_complete:'Payment completed.', notify_payment_cancel:'Payment was cancelled.', notify_payment_partial:'Partial refund applied.', notify_refund_review:'Refund review required.', notify_admin_message:'Admin message', notify_notice:'A new notice was published.', notify_patch_note:'A new patch note was published.', notify_aria:'Notifications',
    notify_filter_all:'All', notify_filter_payment:'Payment', notify_filter_license:'License', notify_filter_inquiry:'Support', notify_filter_community:'Community', notify_filter_other:'Other',
    notify_credit_purchase:'Credit purchase complete', notify_credit_purchase_body:'{n} credits were added.', notify_credit_grant:'Credits granted', notify_credit_grant_body:'An admin granted {n} credits.', notify_credit_deduct:'Credit adjustment', notify_credit_deduct_body:'{n} credits were deducted.', notify_reservation_complete:'Scheduled conversion finished.', notify_reservation_failed:'Scheduled conversion failed.', notify_time_just_now:'Just now', notify_time_minutes:'{n} min ago', notify_time_hours:'{n} hr ago', notify_time_yesterday:'Yesterday',
    profile_menu_aria:'Account menu', profile_my_account:'Account', profile_my_tickets:'My tickets', profile_my_posts:'My posts', profile_notify_settings:'Notification settings',
    credit_label:'Credit', credit_balance:'Credit Balance', credit_buy:'Buy Credits', credit_history:'Credit History',
    credit_history_all:'View All', credit_history_more:'Load more', credit_refresh:'Refresh',
    credit_unlimited:'Unlimited AI Conversions', credit_no_deduct:'No Credit Deduction',
    credit_lifetime_note:'This account uses a Lifetime license.',
    credit_lifetime_unused:'Credits are not deducted while Lifetime is active.',
    credit_recent:'Recent activity', credit_empty:'No credit history yet.', credit_failed:'Could not load credit balance.',
    credit_using:'Lifetime active', credit_ledger_refund:'Conversion refund',
    credit_ledger_purchase:'Credit purchase', credit_ledger_grant:'Admin credit grant',
    credit_ledger_deduct:'Admin credit recovery', credit_ledger_conversion:'AI conversion',
    credit_col_date:'Date', credit_col_item:'Details', credit_col_delta:'Change', credit_col_balance:'Balance',
    board_mine_title:'My posts', board_mine_desc:'Showing only posts you wrote on the free board.', board_mine_all:'All posts', board_mine_only:'My posts',
    notify_settings_title:'Notifications', notify_pref_inapp:'App alerts', notify_pref_email:'Email alerts', notify_pref_saved:'Saved'
  };
  const JA = {
    login:'Googleログイン', logout:'ログアウト', guest:'未ログイン', guest_desc:'Googleログインでライセンス確認',
    license_wait:'未確認', active:'ライセンス有効', none:'ライセンスなし', checking:'確認中',
    check_failed:'確認失敗', empty:'表示する内容がありません。', saved:'保存完了', ticket_created:'問い合わせを登録しました。', privacy_required:'個人情報の収集・利用に同意してください。',
    need_login:'ログインが必要です。', download:'ダウンロード', admin_required:'管理者ログインが必要です。',
    no_permission:'権限がありません。', answered:'回答済み', closed:'終了', open:'受付', reply_placeholder:'返信または追加内容を入力',
    submit:'登録', edit:'編集', del:'削除', close:'終了にする', updated:'更新しました', deleted:'削除しました', manage:'管理', confirm_delete:'本当に削除しますか？',
    reply_toast_title:'💬 お問い合わせに返信がありました。', reply_toast_body:'ご質問への回答が登録されました。', reply_toast_action:'返信を見る',
    admin_ticket_toast_title:'💬 新しいお問い合わせが登録されました。', admin_ticket_toast_body:'新しい1:1問い合わせが届きました。', admin_ticket_toast_action:'問い合わせを見る',
    admin_reply_toast_title:'💬 お問い合わせに新しい返信が追加されました。', admin_reply_toast_body:'既存の問い合わせにユーザー返信が追加されました。', admin_reply_toast_action:'問い合わせを見る',
    notify_title:'通知', notify_empty:'新しい通知はありません。', notify_mark_all:'すべて既読', notify_clear_all:'すべて削除', notify_clear_confirm:'通知をすべて削除しますか？', notify_delete_aria:'通知を削除', notify_login:'ログインすると通知を確認できます。',
    notify_board_comment:'さんがあなたの投稿にコメントしました。', notify_ticket_reply:'お問い合わせに返信がありました。', notify_license_change:'ライセンスが変更されました。', notify_payment_complete:'お支払いが完了しました。', notify_payment_cancel:'お支払いがキャンセルされました。', notify_payment_partial:'一部返金が適用されました。', notify_refund_review:'返金の確認が必要です。', notify_admin_message:'管理者メッセージ', notify_notice:'新しいお知らせが登録されました。', notify_patch_note:'新しいパッチノートが登録されました。', notify_aria:'通知',
    notify_filter_all:'すべて', notify_filter_payment:'決済', notify_filter_license:'ライセンス', notify_filter_inquiry:'問い合わせ', notify_filter_community:'コミュニティ', notify_filter_other:'その他',
    notify_credit_purchase:'クレジット購入完了', notify_credit_purchase_body:'{n} クレジットが付与されました。', notify_credit_grant:'クレジット付与', notify_credit_grant_body:'管理者が {n} クレジットを付与しました。', notify_credit_deduct:'クレジット調整', notify_credit_deduct_body:'{n} クレジットが回収されました。', notify_reservation_complete:'予約変換が完了しました。', notify_reservation_failed:'予約変換に失敗しました。', notify_time_just_now:'たった今', notify_time_minutes:'{n}分前', notify_time_hours:'{n}時間前', notify_time_yesterday:'昨日',
    profile_menu_aria:'アカウントメニュー', profile_my_account:'アカウント', profile_my_tickets:'マイ問い合わせ', profile_my_posts:'自分の投稿', profile_notify_settings:'通知設定',
    credit_label:'Credit', credit_balance:'保有クレジット', credit_buy:'クレジット購入', credit_history:'クレジット利用履歴',
    credit_history_all:'全履歴', credit_history_more:'さらに表示', credit_refresh:'更新',
    credit_unlimited:'AI変換 無制限', credit_no_deduct:'Credit消費なし',
    credit_lifetime_note:'このアカウントはLifetimeライセンスです。',
    credit_lifetime_unused:'Lifetime利用中はクレジットは消費されません。',
    credit_recent:'最近の利用', credit_empty:'利用履歴はありません。', credit_failed:'残高を取得できませんでした。',
    credit_using:'Lifetime利用中', credit_ledger_refund:'変換失敗の返還',
    credit_ledger_purchase:'クレジット購入', credit_ledger_grant:'管理者による付与',
    credit_ledger_deduct:'管理者による回収', credit_ledger_conversion:'AI変換',
    credit_col_date:'日時', credit_col_item:'内容', credit_col_delta:'増減', credit_col_balance:'残高',
    board_mine_title:'自分の投稿', board_mine_desc:'自由掲示板で自分が書いた投稿だけを表示します。', board_mine_all:'すべての投稿', board_mine_only:'自分の投稿',
    notify_settings_title:'通知設定', notify_pref_inapp:'アプリ通知', notify_pref_email:'メール通知', notify_pref_saved:'保存しました'
  };
  const T = lang === 'en' ? EN : lang === 'ja' ? JA : KO;
  return T[k] || KO[k] || k;
}

function fmtDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d ? d.toLocaleString(lang==='ja'?'ja-JP':lang==='en'?'en-US':'ko-KR') : ''; } catch { return ''; } }
function fmtNotifyWhen(v){
  try{
    const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
    if(!d || Number.isNaN(d.getTime())) return fmtDate(v);
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    const fill = (key, n) => String(tr(key) || '').replace('{n}', String(n));
    if(sec < 60) return tr('notify_time_just_now');
    if(sec < 3600) return fill('notify_time_minutes', Math.floor(sec / 60));
    if(sec < 86400) return fill('notify_time_hours', Math.floor(sec / 3600));
    if(sec < 172800) return tr('notify_time_yesterday');
    return fmtDate(v);
  }catch{
    return fmtDate(v);
  }
}
function licenseTsMs(v){
  if(v==null || v==='') return 0;
  if(typeof v==='number' && Number.isFinite(v)) return v>1e12 ? v : v*1000;
  if(typeof v?.toMillis==='function') return v.toMillis();
  if(typeof v?.toDate==='function'){ const t=v.toDate().getTime(); return Number.isFinite(t)?t:0; }
  const sec=Number(v?.seconds||v?._seconds||0);
  if(sec) return sec*1000;
  if(v instanceof Date){ const t=v.getTime(); return Number.isFinite(t)?t:0; }
  const d=new Date(v);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}
function fmtListDate(v){
  try{
    const ms=licenseTsMs(v);
    if(!ms) return '-';
    const d=new Date(ms);
    if(!Number.isFinite(d.getTime())) return '-';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
  }catch{ return '-'; }
}
function fmtListDateTime(v){
  try{
    const ms=licenseTsMs(v);
    if(!ms) return '-';
    const d=new Date(ms);
    if(!Number.isFinite(d.getTime())) return '-';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return '-'; }
}
function countryFlagEmoji(code){
  const cc=String(code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(cc) || cc==='ZZ' || cc==='XX') return '';
  return String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
}
function localizedCountryName(code){
  const cc=String(code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(cc) || cc==='ZZ' || cc==='XX') return '';
  try{
    const loc = lang==='ja'?'ja':lang==='en'?'en':'ko';
    const name = new Intl.DisplayNames([loc],{type:'region'}).of(cc);
    return name && name!==cc ? name : cc;
  }catch{
    return cc;
  }
}
function maskIpForDisplay(ip){
  const s=String(ip||'').trim();
  if(!s) return '';
  if(s.includes('*')) return s;
  const mapped=s.replace(/^::ffff:/i,'');
  if(/^\d+\.\d+\.\d+\.\d+$/.test(mapped)){
    const p=mapped.split('.');
    return `${p[0]}.${p[1]}.***.***`;
  }
  if(s.includes(':')){
    const raw=s.split(':');
    return `${raw[0]||'****'}:${raw[1]||'****'}:****:****:****:****`;
  }
  return '';
}
function adminAccessInfo(user){
  const info = user && typeof user.accessInfo==='object' && user.accessInfo ? user.accessInfo : null;
  if(!info) return null;
  const countryCode = String(info.countryCode||'').trim().toUpperCase();
  const validCode = /^[A-Z]{2}$/.test(countryCode) && countryCode!=='ZZ' && countryCode!=='XX' ? countryCode : '';
  return {
    countryCode: validCode,
    countryName: localizedCountryName(validCode) || String(info.countryName||'').trim(),
    city: String(info.city||info.region||'').trim(),
    language: String(info.language||'').trim(),
    clientType: String(info.clientType||'').trim().toLowerCase(),
    lastIpMasked: maskIpForDisplay(info.lastIpMasked || ''),
    lastSeenAt: info.updatedAt || user.lastLogin || user.lastSeenAt
  };
}
function adminAccessCountryLine(user){
  const info = adminAccessInfo(user);
  if(!info || !info.countryCode) return '';
  const flag = countryFlagEmoji(info.countryCode);
  const name = info.countryName || info.countryCode;
  return `${flag ? flag+' ' : ''}${name}`.trim();
}
function adminAccessClientLabel(clientType){
  if(clientType==='app') return tt('MidiAI Studio App');
  if(clientType==='web') return 'Web';
  return clientType || '-';
}
function licenseDateBoundsActive(d, nowMs=Date.now()){
  if(!d) return false;
  // Explicit lifetime ignores leftover date fields.
  if(String(d.plan||'').toLowerCase().trim()==='lifetime') return true;
  const startMs=licenseTsMs(d.startsAt);
  const endMs=licenseTsMs(d.expiresAt);
  if(startMs && nowMs < startMs) return false;
  if(endMs && nowMs > endMs) return false;
  return true;
}
/** Canonical role / plan / status (storage + UI). Legacy values are normalized on read/write. */
function normalizeRole(role){
  const r=String(role||'').toLowerCase().trim();
  if(r==='admin' || r==='developer' || r==='staff') return 'admin';
  return 'user';
}
function normalizePlan(lic){
  const plan=String(lic?.plan||'').toLowerCase().trim();
  // Explicit lifetime always wins — admin save clears dates; leftover bounds must not flip type.
  if(plan==='lifetime') return 'lifetime';
  // Revoked period must not stay "period" for paid badges / filters.
  if(lic?.revokedAt && (plan==='period' || plan==='monthly')) return 'trial';
  if(plan==='monthly') return 'period';
  if(!plan && licenseTsMs(lic?.expiresAt) && !lic?.revokedAt) return 'period';
  if(plan==='trial' || plan==='period') return plan;
  // developer/admin were mistaken "plans"; missing/unknown → trial
  return 'trial';
}
function normalizeStatus(lic){
  if(!lic) return 'active';
  const status=String(lic.status||'').toLowerCase().trim();
  const plan=String(lic.plan||'').toLowerCase().trim();
  if(status==='banned' || status==='suspended') return 'banned';
  if(status==='expired' || status==='refunded' || status==='revoked') return 'expired';
  // PortOne cancel revoke left a paid plan flag with revokedAt — not usable even if expiresAt is future.
  if(lic.revokedAt && (plan==='period' || plan==='lifetime' || plan==='monthly')) return 'expired';
  if((status==='active' || !status || status==='none' || status==='inactive') && !licenseDateBoundsActive(lic) && licenseTsMs(lic.expiresAt)){
    return 'expired';
  }
  return 'active';
}
function isLifetimeLicense(d){
  return !!d && normalizePlan(d)==='lifetime' && normalizeStatus(d)==='active';
}
/** License usable when status is active (and within date bounds via normalizeStatus). */
function isLicenseCurrentlyActive(d){
  if(!d) return false;
  return normalizeStatus(d)==='active';
}
function licenseNeedsMigration(lic){
  if(!lic) return true;
  const rawPlan=String(lic.plan||'').toLowerCase();
  const rawStatus=String(lic.status||'').toLowerCase();
  const plan=normalizePlan(lic);
  const status=normalizeStatus(lic);
  if(rawPlan!==plan) return true;
  if(rawStatus!==status) return true;
  if(status==='active' && lic.licensed!==true) return true;
  if(status!=='active' && lic.licensed===true) return true;
  return false;
}
function toDateInputValue(v){
  const ms=licenseTsMs(v);
  if(!ms) return '';
  const d=new Date(ms);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function dateInputToStartTimestamp(yyyyMmDd){
  if(!yyyyMmDd || !firestoreApi?.Timestamp) return null;
  const d=new Date(`${yyyyMmDd}T00:00:00`);
  if(!Number.isFinite(d.getTime())) return null;
  return firestoreApi.Timestamp.fromDate(d);
}
function dateInputToEndTimestamp(yyyyMmDd){
  if(!yyyyMmDd || !firestoreApi?.Timestamp) return null;
  const d=new Date(`${yyyyMmDd}T23:59:59.999`);
  if(!Number.isFinite(d.getTime())) return null;
  return firestoreApi.Timestamp.fromDate(d);
}

function normalizeAdminLicensePlanForSave(plan, expiresAtVal, startsAtVal){
  const p=String(plan||'lifetime').toLowerCase();
  // Admin choice wins for trial/lifetime (dates are cleared separately).
  if(p==='trial' || p==='lifetime' || p==='period') return p;
  if(expiresAtVal || startsAtVal) return 'period';
  return 'trial';
}
/** When admin fills start/expiry dates, switch license dropdown to 기간제. */
function syncAdminLicensePlanFromDates(){
  const startVal=$('adminLicenseStartsAt')?.value||'';
  const endVal=$('adminLicenseExpiresAt')?.value||'';
  const sel=$('adminLicensePlan');
  if(!sel) return false;
  if(!(startVal || endVal)) return false;
  if(sel.value==='period') return false;
  sel.value='period';
  return true;
}
/** Trial / lifetime have no period bounds — clear start & expiry inputs. */
function clearAdminLicenseDatesIfNonPeriod(plan){
  const p=String(plan||'').toLowerCase();
  if(p!=='trial' && p!=='lifetime') return false;
  let cleared=false;
  const startEl=$('adminLicenseStartsAt');
  const endEl=$('adminLicenseExpiresAt');
  if(startEl && startEl.value){ startEl.value=''; cleared=true; }
  if(endEl && endEl.value){ endEl.value=''; cleared=true; }
  return cleared;
}
function buildAdminLicenseDateFields(opts={}){
  const {deleteField}=firestoreApi;
  const clearDates = !!opts.clearDates;
  const startVal=clearDates ? '' : ($('adminLicenseStartsAt')?.value||'');
  const endVal=clearDates ? '' : ($('adminLicenseExpiresAt')?.value||'');
  const startsAt=dateInputToStartTimestamp(startVal);
  const expiresAt=dateInputToEndTimestamp(endVal);
  return {
    startsAt: startsAt || deleteField(),
    expiresAt: expiresAt || deleteField()
  };
}
/** Patch CRM license caches so detail/list update immediately after write. */
function adminLicenseCacheNow(){
  return { seconds: Math.floor(Date.now()/1000) };
}
function patchAdminLicenseCache(uid, patch){
  const s=String(uid||'');
  if(!s || !patch) return;
  const prev = licenseForUid(s) || {};
  const next = { ...prev, ...patch };
  if(Object.prototype.hasOwnProperty.call(patch, 'startsAt') && !patch.startsAt) delete next.startsAt;
  if(Object.prototype.hasOwnProperty.call(patch, 'expiresAt') && !patch.expiresAt) delete next.expiresAt;
  if(Object.prototype.hasOwnProperty.call(patch, 'passProductId') && !patch.passProductId) delete next.passProductId;
  adminLicenseCache[s] = next;
  Object.values(adminIdentityCache).forEach(idn=>{
    if(!idn) return;
    if(idn.canonicalUid===s || idn.userDocId===s || idn.fieldUid===s){
      idn.license = next;
      idn.licenseState = 'ok';
      idn.conflict = false;
      idn.error = false;
    }
  });
  const idx = adminLicenseRows.findIndex(x=>x===prev || x?.id===s || x?.uid===s);
  if(idx>=0) adminLicenseRows[idx]=next;
  else adminLicenseRows.push(next);
  adminLicensesLoaded = true;
  try{ authorLicenseCache.delete(s); }catch(_){ /* ignore */ }
}

/** Re-read licenses/{uid} after refund/sync so CRM badges do not keep stale "7일 Full". */
async function refreshAdminLicenseFromServer(uid){
  const s=String(uid||'').trim();
  if(!s || !db || !firestoreApi?.doc || !firestoreApi?.getDoc) return null;
  const {doc,getDoc}=firestoreApi;
  const aliases = [...adminUidAliases(s)];
  const ids = aliases.length ? aliases : [s];
  let chosen = null;
  let chosenId = s;
  for(const id of ids){
    try{
      const snap = await getDoc(doc(db,'licenses', id));
      if(snap.exists()){
        chosen = snap.data() || {};
        chosenId = id;
        break;
      }
    }catch(_){ /* try next alias */ }
  }
  if(!chosen){
    // Clear stale paid badge if doc missing after revoke.
    patchAdminLicenseCache(s, {
      plan: 'trial',
      status: 'active',
      licensed: true,
      passProductId: null,
      startsAt: null,
      expiresAt: null,
      updatedAt: adminLicenseCacheNow()
    });
    return licenseForUid(s);
  }
  const next = { ...chosen, id: chosenId, uid: chosenId };
  patchAdminLicenseCache(chosenId, next);
  if(chosenId !== s) patchAdminLicenseCache(s, next);
  return next;
}

function refreshAdminLicenseViews(uid){
  const s=String(uid||'').trim();
  try{
    if(selectedAdminUid && (selectedAdminUid===s || adminUidAliases(selectedAdminUid).has(s))){
      renderAdminCrmDetail(selectedAdminUid, { keepTab: true });
    }
  }catch(_){ /* ignore */ }
  try{
    if(typeof paintAdminCrmPagedList==='function') paintAdminCrmPagedList();
    else renderAdminUserTable({ keepOrder: true });
  }catch(_){
    try{ renderAdminUserTable({ keepOrder: true }); }catch(__){ /* ignore */ }
  }
}
function fmtCompactDateTime(v){
  try{
    const d=v?.toDate?v.toDate():(v?new Date(v):null);
    if(!d||Number.isNaN(d.getTime())) return '-';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return '-'; }
}
function fmtShortDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); if(!d)return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; } catch { return fmtDate(v); } }
function isAdminAuthor(x){ return !!(x && (x.authorRole === 'admin' || x.role === 'admin')); }
function contentAuthor(x){
  if(isAdminAuthor(x)) return BRAND_AUTHOR;
  return x?.displayName || x?.email?.split('@')[0] || BRAND_AUTHOR;
}
function authorAvatarInitial(x){
  const name = contentAuthor(x);
  return name === BRAND_AUTHOR ? 'M' : String(x?.displayName || x?.email || 'U').slice(0, 1).toUpperCase();
}
function noticeAuthor(){ return BRAND_AUTHOR; }

const authorLicenseCache = new Map();
let currentLicenseActive = false;
let currentLicenseLifetime = false;
let accountLicenseDoc = null;
let accountOrderRows = [];
let accountOrdersStatus = '';
let accountOrdersUid = '';
let kakaoPayInFlight = false;

function authorKind(x){
  if(isAdminAuthor(x) || contentAuthor(x) === BRAND_AUTHOR) return 'admin';
  const uid = x?.uid || x?.authorUid || '';
  if(x?._licensed === true || x?.authorLicensed === true) return 'buyer';
  if(uid && authorLicenseCache.has(uid)) return authorLicenseCache.get(uid) ? 'buyer' : 'guest';
  return 'guest';
}

function authorKindLabel(kind){
  if(kind==='admin') return lang==='en' ? 'Admin' : lang==='ja' ? '管理者' : '관리자';
  if(kind==='buyer') return lang==='en' ? 'License holder' : lang==='ja' ? '購入者' : '구매자';
  return lang==='en' ? 'Guest' : lang==='ja' ? '未購入' : '비구매자';
}

function authorKindIcon(kind){
  if(kind==='admin'){
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.9 7.8 7 9 4.1-1.2 7-4.5 7-9V6l-7-3z"/><path d="m9.2 12.2 1.9 1.9 3.7-3.8"/></svg>`;
  }
  if(kind==='buyer'){
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.8 12.2 2.1 2.1 4.3-4.4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.2" r="3.2"/><path d="M5.5 19.2c1.6-3.1 4-4.6 6.5-4.6s4.9 1.5 6.5 4.6"/></svg>`;
}

function authorCellHtml(x){
  const kind = authorKind(x);
  const label = authorKindLabel(kind);
  return `<div class="hub-col-author"><span class="author-badge is-${kind}" title="${esc(label)}" aria-label="${esc(label)}">${authorKindIcon(kind)}</span><span class="author-name">${esc(contentAuthor(x))}</span></div>`;
}

async function fetchAuthorLicenses(uids){
  if(!db || !firestoreApi?.doc) return;
  const missing = [...new Set((uids||[]).filter(Boolean))].filter(uid => !authorLicenseCache.has(uid));
  if(!missing.length) return;
  const {doc,getDoc}=firestoreApi;
  await Promise.all(missing.map(async uid=>{
    try{
      const snap=await getDoc(doc(db,'licenses',uid));
      const d=snap.exists()?snap.data():null;
      const active=isLicenseCurrentlyActive(d);
      authorLicenseCache.set(uid, active);
    }catch(_){
      authorLicenseCache.set(uid, false);
    }
  }));
}

async function enrichRowsWithAuthorLicense(rows){
  const list = Array.isArray(rows) ? rows : [];
  const uids = list.filter(x=>!isAdminAuthor(x)).map(x=>x.uid||x.authorUid).filter(Boolean);
  await fetchAuthorLicenses(uids);
  return list.map(x=>{
    if(isAdminAuthor(x)) return { ...x, _licensed:false };
    const uid = x.uid || x.authorUid || '';
    return { ...x, _licensed: uid ? !!authorLicenseCache.get(uid) : !!x.authorLicensed };
  });
}
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
function isMarkdownContent(srcOrDoc){
  if(srcOrDoc && typeof srcOrDoc === 'object'){
    if(srcOrDoc.contentFormat === 'markdown') return true;
    return isMarkdownContent(srcOrDoc.content ?? srcOrDoc.answer ?? '');
  }
  const s = String(srcOrDoc || '');
  if(!s.trim()) return false;
  return /(^#{1,6}\s)|```|>\s*\[!|\|\||^:::|^\|.+\|/m.test(s) || /(\*\*|__|`[^`]|\[.+\]\()/m.test(s);
}
function mdBodyHtml(src, className=''){
  ensureMarkdownCss();
  const html = renderMarkdown(pickMarkdownSource(src) || '');
  return className ? html.replace('class="md-prose"', `class="md-prose ${className}"`) : html;
}
function bindMdIn(root){
  if(!root) return;
  bindMarkdownInteractions(root);
}
function patchChangeType(text){
  const t = String(text || '');
  if(/추가|신규|도입|새로운|새 |new|added?/i.test(t)) return { key:'new', label: tt('신규') };
  if(/개선|향상|강화|업데이트|improv|enhanc|optim/i.test(t)) return { key:'improve', label: tt('개선') };
  if(/수정|버그|오류|해결|fix|bug|패치|복구/i.test(t)) return { key:'fix', label: tt('수정') };
  return { key:'change', label: tt('변경') };
}
function patchItemDisplayText(text){
  return String(text || '').replace(/^(신규|개선|수정|변경|New|Improved?|Fixed?|Changed?)\s*[-–—:·]\s*/i, '').trim() || String(text || '').trim();
}
function parsePatchContent(raw){
  const text = String(raw || '').trim();
  if(!text) return { sections:[], totalItems:0 };
  const lines = text.split(/\r?\n/);
  const sections = [];
  let cur = null;
  const bulletRe = /^[•·\-\*]\s*/;
  const emojiHeaderRe = /^[\p{Extended_Pictographic}\uFE0F]/u;
  const isHeader = (t)=> emojiHeaderRe.test(t) || (t.includes(' / ') && t.length < 90);
  for(const line of lines){
    const t = line.trim();
    if(!t) continue;
    if(bulletRe.test(t)){
      const item = t.replace(bulletRe, '').trim();
      if(!cur){ cur = { title: tt('변경 사항'), items:[] }; sections.push(cur); }
      cur.items.push(item);
      continue;
    }
    if(isHeader(t)){
      cur = { title:t, items:[] };
      sections.push(cur);
      continue;
    }
    if(!cur){ cur = { title: tt('변경 사항'), items:[] }; sections.push(cur); }
    cur.items.push(t);
  }
  const totalItems = sections.reduce((n,s)=>n+s.items.length,0);
  return { sections, totalItems };
}
function patchContentHtml(sections){
  if(!sections.length) return `<p class="patch-empty muted">${esc(tt('내용이 없습니다.'))}</p>`;
  const renderItems = (items)=> items.map(it=>{
    const type = patchChangeType(it);
    const body = patchItemDisplayText(it);
    return `<li class="is-${type.key}"><span class="patch-change-text">${esc(body)}</span></li>`;
  }).join('');
  if(sections.length === 1){
    const s = sections[0];
    const isDefault = s.title === '변경 사항' || s.title === tt('변경 사항');
    const title = isDefault ? '' : `<h2 class="patch-section-title">${esc(s.title)}</h2>`;
    return `<div class="patch-changelog is-flat">${title}<ul class="patch-section-list">${renderItems(s.items)}</ul></div>`;
  }
  return `<div class="patch-changelog">${sections.map((s,i)=>`<section class="patch-section" id="patch-section-${i}"><h2 class="patch-section-title">${esc(s.title)}</h2>${s.items.length?`<ul class="patch-section-list">${renderItems(s.items)}</ul>`:''}</section>`).join('')}</div>`;
}
function patchTocHtml(sections){
  // Dense emoji pill clouds make long notes look messy — skip TOC for cluttered notes.
  if(sections.length <= 1 || sections.length > 6) return '';
  return `<nav class="patch-toc" aria-label="${esc(tt('목차'))}"><ol>${sections.map((s,i)=>`<li><a href="#patch-section-${i}">${esc(s.title.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '') || s.title)}</a></li>`).join('')}</ol></nav>`;
}
function patchBadgeHtml(kind, text, extraClass=''){
  const cls = extraClass ? ` ${extraClass}` : '';
  return `<span class="patch-badge patch-badge--${kind}${cls}">${text}</span>`;
}
function patchKindBadgeHtml(item, extraClass=''){
  const type = patchNoteType(item);
  return patchBadgeHtml(type, type === 'web' ? 'WEB' : 'APP', extraClass);
}
function patchListTitleHtml(x){
  const ver = patchNoteVersion(x);
  return `${patchKindBadgeHtml(x)}${ver?patchBadgeHtml('version', `v${esc(ver)}`):''}<span class="hub-col-title-text">${esc(x.title)}</span>`;
}
function patchNavLabel(item){
  const ver = patchNoteVersion(item);
  return ver ? `v${ver}` : (item?.title || '');
}
function patchNoteFormFields(d={}, extra=[]){
  return [
    {name:'type', label:'구분', type:'segment', value:patchNoteType(d) || 'app', options:[{value:'app', label:'APP'},{value:'web', label:'WEB'}]},
    {name:'version', label:'버전', value:d.version||'', required:true, showWhen:{name:'type', value:'app'}},
    {name:'title', label:'제목', value:d.title||'', required:true},
    {name:'content', label:'내용', type:'markdown', value:d.contentValue ?? '', required:true, draftKey:d.draftKey || 'hub:patchNotes:new'},
    ...extra
  ];
}
function normalizePatchNoteWrite(data){
  const result = patchNoteWriteFields(data);
  if(!result.ok){
    alert('버전을 입력하세요.');
    return null;
  }
  const out = {...data, ...result.fields};
  if(result.type !== 'app') delete out.version;
  return out;
}
function patchNavHtml(nav){
  if(!nav || (!nav.prev && !nav.next)) return '';
  const newer = nav.prev ? `<a class="patch-nav-link is-newer" href="./patch-note.html?id=${encodeURIComponent(nav.prev.id)}"><span>${esc(tt('최신'))}</span><b>${esc(patchNavLabel(nav.prev))}</b></a>` : '';
  const older = nav.next ? `<a class="patch-nav-link is-older" href="./patch-note.html?id=${encodeURIComponent(nav.next.id)}"><span>${esc(tt('이전'))}</span><b>${esc(patchNavLabel(nav.next))}</b></a>` : '';
  return `<nav class="patch-detail-nav" aria-label="${esc(tt('버전 이동'))}">${newer}${older}</nav>`;
}
function patchDetailHtml(d, nav=null){
  const version = patchNoteVersion(d);
  let bodyHtml = '';
  let toc = '';
  if(isMarkdownContent(d)){
    bodyHtml = `<div class="patch-prose">${mdBodyHtml(d.content || '')}</div>`;
  } else {
    const parsed = parsePatchContent(d.content);
    const { sections } = parsed;
    bodyHtml = sections.length ? patchContentHtml(sections) : `<div class="patch-prose">${mdBodyHtml(d.content || '')}</div>`;
    toc = patchTocHtml(sections);
  }
  return `<article class="hub-post-detail hub-patch-detail">
    <header class="patch-toolbar">
      <a class="patch-back-link" href="./patch-notes.html">← ${esc(tt('패치노트'))}</a>
      <div class="patch-toolbar-actions">
        <button type="button" class="ghost mini-btn" data-share-patch>${esc(tt('공유'))}</button>
        ${hubAdminManageHtml('patchNotes', d.id)}
      </div>
    </header>
    <div class="patch-head">
      <div class="patch-head-main">
        <div class="patch-head-kicker">${patchKindBadgeHtml(d)}${version?patchBadgeHtml('version', `v${esc(version)}`):''}</div>
        <h1 class="patch-detail-title">${esc(d.title || '')}</h1>
        <p class="patch-meta-line"><span>${esc(noticeAuthor(d))}</span><span>${esc(fmtListDate(d.createdAt))}</span><span>${esc(tt('조회'))} ${Number(d.viewCount || 0)}</span></p>
        ${toc}
      </div>
      <a class="primary patch-download-btn" href="./downloads.html">${esc(tr('download'))}</a>
    </div>
    <div class="patch-detail-body">${bodyHtml}</div>
    <footer class="patch-detail-footer">
      <a class="patch-footer-link" href="./patch-notes.html">${esc(tt('전체 패치노트'))}</a>
      <a class="patch-footer-link" href="./faq.html">FAQ</a>
      <a class="patch-footer-link" href="./support.html">${esc(tt('문의'))}</a>
    </footer>
  </article>`;
}
function bindPatchDetailActions(root=document){
  bindAdminPostActions(root);
  const shareBtn=root.querySelector('[data-share-patch]');
  if(shareBtn && !shareBtn.dataset.bound){
    shareBtn.dataset.bound='1';
    shareBtn.addEventListener('click',async()=>{
      const url=location.href;
      try{
        if(navigator.share){ await navigator.share({title:document.title,url}); return; }
        await navigator.clipboard.writeText(url);
        shareBtn.textContent='복사됨';
        setTimeout(()=>{ shareBtn.textContent='공유'; },1200);
      }catch{}
    });
  }
}
function getParam(k){ return new URLSearchParams(location.search).get(k); }
function configuredFirebase(){ const f = CONFIG.firebase || {}; return f.apiKey && f.authDomain && f.projectId && !String(f.apiKey).startsWith('PASTE_') && !String(f.projectId).startsWith('PASTE_'); }
function addUnsub(fn){ if (typeof fn === 'function') unsubscribers.push(fn); return fn; }
function addPublicUnsub(fn){ if (typeof fn === 'function') publicUnsubscribers.push(fn); return fn; }
function clearUnsubs(){ while(unsubscribers.length){ try{unsubscribers.pop()();}catch{} } }




function isKoreanCheckout(){
  return isPurchasePage && (isRootKoreanPurchasePage || pathLang === 'ko');
}
function purchaseCheckout(){
  const uiLang = isKoreanCheckout() ? 'ko' : (pathLang || lang || 'en');
  return checkoutContext(uiLang, isKoreanCheckout());
}
function isPointCheckout(){
  if(purchaseActionsLocked()) return false;
  const id = normalizeCreditProductId(selectedPurchaseId);
  return isPurchasePage && String(id || '').startsWith('CREDIT_');
}
function isPassCheckout(){
  if(purchaseActionsLocked()) return false;
  return isPurchasePage && isPassProductId(selectedPurchaseId);
}
function selectedPassPack(){
  return getPassProduct(selectedPurchaseId);
}
function selectedPointPack(){
  return getCreditProduct(selectedPointProductId || selectedPurchaseId);
}
function pointCheckoutCurrency(){
  return isKoreanCheckout() ? 'KRW' : 'USD';
}
function creditPackKrw(pack){
  return Number(pack?.effectivePrice != null ? pack.effectivePrice : pack?.krw || 0);
}
function creditCheckoutPriceText(pack){
  const krw = creditPackKrw(pack);
  if(isKoreanCheckout()) return formatKrw(krw);
  const usd = krwToUsd(krw, getCatalogFxRate());
  return usd != null ? formatUsd(usd) : (pointCopy().fxError || '—');
}
function pointCopy(){
  if(lang === 'en') return {
    buy:'Buy',
    recommended:'Recommended',
    uses:(n)=>`Full access for the selected period`,
    perUse:(price)=>price,
    perUseApprox:(price)=>price,
    save:(n)=>`About ${n}% off`,
    unlimitedTitle:'Lifetime Full',
    unlimitedUses:'Unlimited AI conversion · Full features',
    unlimitedUnit:'Lifetime · one-time · no auto-renewal',
    lifetimeOwnedHint:'You already have a Lifetime Full license. Extra Pass purchases are not required.',
    notes:[
      'Period Pass: unlimited conversions · Full features · no auto-renewal',
      'Lifetime Full: permanent Full access after purchase',
      'No recurring billing'
    ],
    accountTitle:'Sign in with Google before purchasing.',
    signedOut:'After payment, the license is assigned to the signed-in Google account.',
    signedIn:(id)=>`After payment, the license will be assigned to <b>${id}</b>.`,
    serviceValue:'License activated immediately after payment',
    noteTitle:'Pass guide',
    licenseGuide:[
      {title:'Period Full Pass',desc:'Unlimited AI conversions and Full features for the selected period. No auto-renewal.'},
      {title:'Lifetime Full',desc:'Permanent Full access after purchase. Extra Pass purchases are not required.'},
      {title:'MIDI Editor PRO',desc:'Edit multi-track piano rolls with velocity and CC.'},
      {title:'AI Assistant',desc:'Tidy and arrange MIDI with correction tools, not generative transcription.'},
      {title:'Score features',desc:'Edit scores and export MusicXML/PDF. PDF score import is Beta.'}
    ],
    grantLabel:'Grant',
    grantValue:(n)=>`Access granted after payment is confirmed`,
    successTitle:'Purchase complete.',
    successLead:'Your license was assigned to the signed-in Google account.',
    balanceLabel:'Current balance',
    creditedLabel:'Added',
    kakaoVerifying:'Verifying payment...',
    kakaoComplete:'Payment complete. Your license is active.',
    kakaoVerifyFail:'Payment completed, but confirmation is required. Please keep your payment ID.',
    verifying:'Verifying payment...',
    complete:'Payment complete. Your license is active.',
    heroLead:'Choose a period Full Pass or Lifetime Full.',
    heroLeadOwned:'You are using a Lifetime Full license.',
    comingSoon:'This product is not available for purchase.',
    ownedBannerTitle:'Lifetime Full active',
    ownedBannerBody:'You can use all AI conversions and Full features without limits.',
    ownedBanner:'Lifetime Full active. You can use all AI conversions and Full features without limits.',
    btnNoNeed:'No extra purchase needed',
    btnCurrentPlan:'Currently using',
    ownedBadge:'Current plan',
    usageTitle:'Pass guide',
    lifetimeUsageTitle:'Lifetime Full guide',
    usageCredit:[
      {title:'Period Full Pass', value:'Included', desc:'Unlimited conversions and Full features for the selected period'},
      {title:'Lifetime Full', value:'Included', desc:'Permanent Full access after purchase'},
      {title:'Auto-renewal', value:'None', desc:'One-time payment'}
    ],
    usageLifetime:[
      {title:'AI conversion', value:'Unlimited', desc:'YouTube, Audio, Piano, PDF, and other AI conversions'},
      {title:'Band / Orchestra Preview', value:'Included', desc:'Stem separation, then MIDI transcription per stem. Quality varies by source.'},
      {title:'Full features', value:'Included', desc:'Editors, Assistant, and score tools'},
      {title:'Term', value:'No time limit', desc:'Permanent use after purchase'},
      {title:'Auto-renewal', value:'None', desc:'One-time purchase'}
    ],
    confirmCredits:(n)=>`Confirm purchase`,
    confirmLifetime:'Buy Lifetime Full',
    confirmPass:(days)=>`Buy ${days}-Day Full`,
    payAmountLabel:'Amount',
    listPriceLabel:'List price',
    discountLabel:'Discount',
    payUsdLabel:'Amount (USD)',
    fxNote:'Automatically converted from the KRW price',
    fxError:'Could not load the exchange rate. Please try again shortly.',
    chargedUsdNote:'Charged in USD',
    grantLabelShort:'Grant',
    licenseLabel:'License',
    aiUnlimited:'Unlimited',
    termLabel:'Term',
    termPermanent:'No time limit',
    termDays:(days)=>`${days} days`,
    payMethod:'Payment method',
    payAccount:'Account',
    kakaoPay:'KakaoPay',
    confirmLeadCredits:(n)=>`After payment, access will be assigned to this account.`,
    confirmLeadLifetime:'After payment, a Lifetime Full license will be assigned to this account.',
    confirmLeadPass:(days)=>`After payment, a ${days}-day Full Pass will be assigned to this account.`,
    cancel:'Cancel',
    payNow:(price)=>`Pay ${price}`,
    openingPay:'Opening checkout...',
    needLogin:'Google sign-in is required to purchase.',
    googleLogin:'Google sign-in',
    viewAccount:'View in My Account',
    close:'Close',
    successPaid:'Payment complete.',
    trialTitle:'Free trial',
    trialPrice:'Free · Start without payment',
    trialItems:[
      'MIDI editing available',
      'AI conversion trial',
      'Convert & export up to 1 minute',
      'Full conversion after buying a Full Pass'
    ],
    trialBtnStart:'Sign in to start',
    trialBtnCurrent:'Current plan',
    cardFeaturesCredit:[
      ['Conversions','Unlimited'],
      ['Full features','Included'],
      ['Auto-renewal','None']
    ],
    cardFeaturesPass:[
      ['Conversions','Unlimited'],
      ['Full features','Included'],
      ['Auto-renewal','None']
    ],
    cardFeaturesLife:[
      ['Conversions','Unlimited'],
      ['Full features','Included'],
      ['Time limit','None'],
      ['Auto-renewal','None']
    ],
    compactNote:'',
    detailsToggle:'Pass details',
    detailsItems:[
      {title:'Period Full Pass', desc:'Unlimited conversions and Full features for 7 / 30 / 90 days. No auto-renewal.'},
      {title:'Lifetime Full', desc:'Permanent Full access after purchase'},
      {title:'MIDI editing / playback', desc:'Included with Full access'},
      {title:'AI Assistant', desc:'Included with Full access'},
      {title:'Score conversion & editing', desc:'Included with Full access'},
      {title:'Lifetime owners', desc:'Extra Pass purchases are not required'}
    ]
  };
  if(lang === 'ja') return {
    buy:'購入する',
    recommended:'おすすめ',
    uses:(n)=>`選択期間のFull利用`,
    perUse:(price)=>price,
    perUseApprox:(price)=>price,
    save:(n)=>`約${n}%お得`,
    unlimitedTitle:'Lifetime Full',
    unlimitedUses:'AI変換 無制限 · Full機能',
    unlimitedUnit:'永久利用 · 1回払い · 自動更新なし',
    lifetimeOwnedHint:'Lifetime Fullを保有中です。追加の期間利用権購入は不要です。',
    notes:[
      '期間Full利用権: 変換回数制限なし · Full機能 · 自動更新なし',
      'Lifetime Full: 購入後ずっとFull利用',
      '自動課金はありません'
    ],
    accountTitle:'Googleログイン後に購入できます。',
    signedOut:'決済後、ログイン中のGoogleアカウントにライセンスが付与されます。',
    signedIn:(id)=>`決済完了後、<b>${id}</b> にライセンスが付与されます。`,
    serviceValue:'決済完了後すぐにライセンス付与',
    noteTitle:'利用権のご案内',
    licenseGuide:[
      {title:'期間Full利用権',desc:'選択した期間中、AI変換回数制限なしでFull機能を利用できます。自動更新はありません。'},
      {title:'Lifetime Full',desc:'購入後ずっとFull利用できます。追加の期間利用権購入は不要です。'},
      {title:'MIDI編集 PRO',desc:'マルチトラックのピアノロールでベロシティやCCを編集します。'},
      {title:'AIアシスタント',desc:'生成採譜ではなく、MIDIを整える補正・編曲ツールです。'},
      {title:'楽譜機能',desc:'楽譜を編集しMusicXML/PDFに書き出します。PDF楽譜の取り込みはBetaです。'}
    ],
    grantLabel:'付与',
    grantValue:(n)=>`決済確認後に利用権を付与`,
    successTitle:'購入が完了しました。',
    successLead:'ライセンスがログイン中のGoogleアカウントに付与されました。',
    balanceLabel:'現在の残高',
    creditedLabel:'付与',
    kakaoVerifying:'決済を確認しています...',
    kakaoComplete:'決済完了。ライセンスを付与しました。',
    kakaoVerifyFail:'決済は完了しましたが、確認が必要です。paymentIdを控えてください。',
    verifying:'決済を確認しています...',
    complete:'決済が完了しました。ライセンスが付与されました。',
    heroLead:'期間Full利用権またはLifetime Fullを選択してください。',
    heroLeadOwned:'Lifetime Fullをご利用中です。',
    comingSoon:'この商品は現在購入できません。',
    ownedBannerTitle:'Lifetime Full保有中',
    ownedBannerBody:'すべてのAI変換とFull機能を制限なく利用できます。',
    ownedBanner:'Lifetime Full保有中。すべてのAI変換とFull機能を制限なく利用できます。',
    btnNoNeed:'追加購入は不要',
    btnCurrentPlan:'現在利用中',
    ownedBadge:'現在のプラン',
    usageTitle:'利用権のご案内',
    lifetimeUsageTitle:'Lifetime Full利用案内',
    usageCredit:[
      {title:'期間Full利用権', value:'利用可能', desc:'選択期間中、変換回数制限なしでFull機能を利用'},
      {title:'Lifetime Full', value:'利用可能', desc:'購入後ずっとFull利用'},
      {title:'自動更新', value:'なし', desc:'1回払い'}
    ],
    usageLifetime:[
      {title:'AI変換', value:'無制限', desc:'YouTube・Audio・Piano・PDFなどのAI変換'},
      {title:'Band / Orchestra Preview', value:'含む', desc:'ステム分離のあと、各ステムをMIDIに採譜します。曲によって品質は変わります。'},
      {title:'Full機能', value:'利用可能', desc:'編集・Assistant・楽譜機能を含む'},
      {title:'利用期間', value:'期間制限なし', desc:'購入後ずっと利用できます'},
      {title:'自動更新', value:'なし', desc:'1回払い'}
    ],
    confirmCredits:(n)=>`購入を確認`,
    confirmLifetime:'Lifetime Full を購入',
    confirmPass:(days)=>`${days}日 Full を購入`,
    payAmountLabel:'支払金額',
    listPriceLabel:'定価',
    discountLabel:'割引',
    payUsdLabel:'支払額 (USD)',
    fxNote:'韓国価格を基準に自動換算',
    fxError:'為替レートを取得できませんでした。しばらくしてから再度お試しください。',
    chargedUsdNote:'実際の請求通貨は USD です',
    grantLabelShort:'付与',
    licenseLabel:'ライセンス',
    aiUnlimited:'無制限',
    termLabel:'利用期間',
    termPermanent:'期間制限なし',
    termDays:(days)=>`${days}日`,
    payMethod:'決済手段',
    payAccount:'アカウント',
    kakaoPay:'KakaoPay',
    confirmLeadCredits:(n)=>`決済完了後、このアカウントに利用権が付与されます。`,
    confirmLeadLifetime:'決済完了後、このアカウントに Lifetime Fullが付与されます。',
    confirmLeadPass:(days)=>`決済完了後、このアカウントに ${days}日 Full利用権が付与されます。`,
    cancel:'キャンセル',
    payNow:(price)=>`${price} を支払う`,
    openingPay:'決済画面を開いています...',
    needLogin:'購入するにはGoogleログインが必要です。',
    googleLogin:'Googleログイン',
    viewAccount:'マイアカウントで確認',
    close:'閉じる',
    successPaid:'決済が完了しました。',
    trialTitle:'無料体験',
    trialPrice:'無料 · 決済なしで開始',
    trialItems:[
      'MIDI編集が利用可能',
      'AI変換の無料体験',
      '変換・書き出しは最大1分',
      'Full利用権購入後に全区間変換'
    ],
    trialBtnStart:'ログインして開始',
    trialBtnCurrent:'現在のプラン',
    cardFeaturesCredit:[
      ['変換回数','制限なし'],
      ['Full機能','利用可能'],
      ['自動更新','なし']
    ],
    cardFeaturesPass:[
      ['変換回数','制限なし'],
      ['Full機能','利用可能'],
      ['自動更新','なし']
    ],
    cardFeaturesLife:[
      ['変換回数','制限なし'],
      ['Full機能','利用可能'],
      ['期間制限','なし'],
      ['自動更新','なし']
    ],
    compactNote:'',
    detailsToggle:'利用権の詳細',
    detailsItems:[
      {title:'期間Full利用権', desc:'7 / 30 / 90日間、変換回数制限なしでFull機能を利用。自動更新なし'},
      {title:'Lifetime Full', desc:'購入後ずっとFull利用'},
      {title:'MIDI編集・再生', desc:'Full利用に含まれます'},
      {title:'AIアシスタント', desc:'Full利用に含まれます'},
      {title:'楽譜変換・編集', desc:'Full利用に含まれます'},
      {title:'Lifetime保有者', desc:'追加の期間利用権購入は不要です'}
    ]
  };
  return {
    buy:'구매하기',
    recommended:'추천',
    uses:(n)=>`선택한 기간 동안 Full 이용`,
    perUse:(price)=>price,
    perUseApprox:(price)=>price,
    save:(n)=>`약 ${n}% 절약`,
    unlimitedTitle:'Lifetime Full',
    unlimitedUses:'AI 변환 무제한 · Full 기능',
    unlimitedUnit:'영구 이용 · 1회 결제 · 자동결제 없음',
    lifetimeOwnedHint:'Lifetime Full을 이용 중입니다. 추가 기간 이용권 구매가 필요하지 않습니다.',
    notes:[
      '기간 Full 이용권: 변환 횟수 제한 없음 · Full 기능 이용 · 자동결제 없음',
      'Lifetime Full: 구매 후 영구 Full 이용',
      '자동결제는 없습니다'
    ],
    accountTitle:'Google 로그인 후 구매할 수 있습니다.',
    signedOut:'결제 완료 후 로그인한 Google 계정에 이용권이 지급됩니다.',
    signedIn:(id)=>`결제 완료 시 <b>${id}</b> 계정에 이용권이 지급됩니다.`,
    serviceValue:'결제 완료 후 즉시 이용권 지급',
    noteTitle:'이용권 안내',
    licenseGuide:[
      {title:'기간 Full 이용권',desc:'선택한 기간 동안 AI 변환 횟수 제한 없이 Full 기능을 이용합니다. 자동결제는 없습니다.'},
      {title:'Lifetime Full',desc:'구매 후 영구 Full 이용. 추가 기간 이용권 구매가 필요하지 않습니다.'},
      {title:'MIDI 편집 PRO',desc:'멀티트랙 피아노 롤에서 벨로시티·CC 등을 편집합니다.'},
      {title:'AI 어시스턴트',desc:'생성형 채보가 아니라 MIDI를 다듬는 보정·편곡 도구입니다.'},
      {title:'악보 기능',desc:'악보를 편집하고 MusicXML/PDF로 내보냅니다. PDF 악보 가져오기는 Beta입니다.'}
    ],
    grantLabel:'지급',
    grantValue:(n)=>`결제 확인 후 이용권 지급`,
    successTitle:'구매가 완료되었습니다.',
    successLead:'이용권이 로그인한 Google 계정에 지급되었습니다.',
    balanceLabel:'현재 잔액',
    creditedLabel:'지급',
    kakaoVerifying:'결제를 검증하는 중입니다...',
    kakaoComplete:'결제가 완료되었습니다. 이용권이 지급되었습니다.',
    kakaoVerifyFail:'결제는 완료되었으나 확인이 필요합니다. 주문번호를 보관해 주세요.',
    verifying:'결제를 검증하는 중입니다...',
    complete:'결제가 완료되었습니다. 이용권이 지급되었습니다.',
    heroLead:'기간 Full 이용권 또는 Lifetime Full을 선택하세요.',
    heroLeadOwned:'Lifetime Full을 이용 중입니다.',
    comingSoon:'현재 구매할 수 없는 상품입니다.',
    ownedBannerTitle:'Lifetime Full 보유 중',
    ownedBannerBody:'모든 AI 변환과 Full 기능을 제한 없이 이용할 수 있습니다.',
    ownedBanner:'Lifetime Full 보유 중. 모든 AI 변환과 Full 기능을 제한 없이 이용할 수 있습니다.',
    btnNoNeed:'추가 구매 불필요',
    btnCurrentPlan:'현재 이용 중',
    ownedBadge:'현재 플랜',
    usageTitle:'이용권 안내',
    lifetimeUsageTitle:'Lifetime Full 이용 안내',
    cardFeaturesPass:[
      ['변환 횟수','제한 없음'],
      ['Full 기능','이용 가능'],
      ['자동결제','없음']
    ],
    usageCredit:[
      {title:'기간 Full 이용권', value:'이용 가능', desc:'선택한 기간 동안 변환 횟수 제한 없이 Full 기능 이용'},
      {title:'Lifetime Full', value:'이용 가능', desc:'구매 후 영구 Full 이용'},
      {title:'자동결제', value:'없음', desc:'1회 결제'}
    ],
    usageLifetime:[
      {title:'AI 변환', value:'무제한', desc:'YouTube·Audio·Piano·PDF 등 AI 변환'},
      {title:'Band / Orchestra Preview', value:'포함', desc:'스템을 나눈 뒤 각 스템을 MIDI로 채보합니다. 곡에 따라 품질이 달라질 수 있습니다.'},
      {title:'Full 기능', value:'이용 가능', desc:'편집·Assistant·악보 기능 포함'},
      {title:'이용기간', value:'기간 제한 없음', desc:'구매 후 계속 이용할 수 있습니다.'},
      {title:'자동결제', value:'없음', desc:'1회 결제'}
    ],
    confirmCredits:(n)=>`구매 확인`,
    confirmLifetime:'Lifetime Full 구매',
    confirmPass:(days)=>`${days}일 Full 구매`,
    payAmountLabel:'결제금액',
    listPriceLabel:'정가',
    discountLabel:'할인',
    payUsdLabel:'결제금액 (USD)',
    fxNote:'KRW 가격 기준 자동 환산',
    fxError:'환율 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    chargedUsdNote:'실제 청구 통화는 USD입니다',
    grantLabelShort:'지급',
    licenseLabel:'라이선스',
    aiUnlimited:'무제한',
    termLabel:'이용기간',
    termPermanent:'기간 제한 없음',
    termDays:(days)=>`${days}일`,
    payMethod:'결제수단',
    payAccount:'결제 계정',
    kakaoPay:'카카오페이',
    confirmLeadCredits:(n)=>`결제 완료 후 해당 계정에 이용권이 지급됩니다.`,
    confirmLeadLifetime:'결제 완료 후 해당 계정에 Lifetime Full이 지급됩니다.',
    confirmLeadPass:(days)=>`결제 완료 후 해당 계정에 ${days}일 Full 이용권이 지급됩니다.`,
    cancel:'취소',
    payNow:(price)=>`${price} 결제`,
    openingPay:'결제창 여는 중...',
    needLogin:'구매하려면 Google 로그인이 필요합니다.',
    googleLogin:'Google 로그인',
    viewAccount:'내 계정에서 확인',
    close:'닫기',
    successPaid:'결제가 완료되었습니다.',
    trialTitle:'무료 체험',
    trialPrice:'0원 · 결제 없이 시작',
    trialItems:[
      'MIDI 편집 기능 이용 가능',
      'AI 변환 무료 체험',
      '변환·내보내기 최대 1분',
      'Full 이용권 구매 후 전체 변환 가능'
    ],
    trialBtnStart:'로그인하여 시작',
    trialBtnCurrent:'현재 플랜',
    cardFeaturesCredit:[
      ['변환 횟수','제한 없음'],
      ['Full 기능','이용 가능'],
      ['자동결제','없음']
    ],
    cardFeaturesLife:[
      ['변환 횟수','제한 없음'],
      ['Full 기능','이용 가능'],
      ['기간 제한','없음'],
      ['자동결제','없음']
    ],
    compactNote:'',
    detailsToggle:'이용권 안내 자세히 보기',
    detailsItems:[
      {title:'기간 Full 이용권', desc:'7 / 30 / 90일 동안 변환 횟수 제한 없이 Full 기능 이용 · 자동결제 없음'},
      {title:'Lifetime Full', desc:'구매 후 영구 Full 이용'},
      {title:'MIDI 편집/재생', desc:'Full 이용권에 포함'},
      {title:'AI Assistant', desc:'Full 이용권에 포함'},
      {title:'악보 변환·편집', desc:'Full 이용권에 포함'},
      {title:'Lifetime 보유자', desc:'추가 기간 이용권 구매가 필요하지 않습니다'}
    ]
  };
}
function syncPurchaseUrl(){
  if(!isPurchasePage || !history.replaceState) return;
  const url = new URL(location.href);
  if(isPointCheckout()){
    url.searchParams.set('product', 'credits');
    url.searchParams.set('pack', selectedPurchaseId);
  } else if(isPassCheckout()){
    url.searchParams.set('product', 'pass');
    url.searchParams.set('pack', selectedPurchaseId);
  } else {
    url.searchParams.delete('product');
    url.searchParams.delete('pack');
  }
  history.replaceState({}, '', url);
}
/** Purchase grid paints only after Firestore SoT (or explicit fallback) — blocks API 6-card flash. */
let purchaseStorefrontReady = false;
function markPurchaseStorefrontReady(){
  purchaseStorefrontReady = true;
}
function isPurchaseCatalogReady(){
  // Wait for Firestore settle + pass/credit so we never paint stale API 6-packs or partial grids.
  if(isPurchasePage && !purchaseStorefrontReady) return false;
  if(!isPassCatalogReady()) return false;
  if(isCreditPurchaseEnabled() && !isCreditCatalogReady()) return false;
  return true;
}
function renderPurchasePlanGrid(){
  const grid = $('purchasePlanGrid');
  if(!grid) return;
  const pt = pointCopy();
  const locked = purchaseActionsLocked();
  // Compact loader only — never paint incomplete catalog (3 cards → 4 cards flash).
  if(!isPurchaseCatalogReady()){
    grid.setAttribute('aria-busy', 'true');
    grid.classList.add('is-catalog-loading');
    const loadingLabel = lang==='en' ? 'Loading prices…' : (lang==='ja' ? '価格を読み込み中…' : '가격 불러오는 중…');
    grid.innerHTML = `<p class="purchase-plan-loading" role="status">${esc(loadingLabel)}</p>`;
    return;
  }
  grid.classList.remove('is-catalog-loading');
  grid.removeAttribute('aria-busy');
  const passFeatures = pt.cardFeaturesPass || [
    ['변환 횟수', '제한 없음'],
    ['Full 기능', '이용 가능'],
    ['자동결제', '없음']
  ];
  const sfUi = storefrontUiCopy(lang);
  const creditPacks = isCreditPurchaseEnabled() ? getCreditProducts() : [];
  const passPacks = getPassProducts();
  const packs = [...creditPacks, ...passPacks].sort((a, b) => {
    const so = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (so) return so;
    return String(a.productId || '').localeCompare(String(b.productId || ''));
  });
  const cards = packs.map((pack)=>{
    const selected = !locked && selectedPurchaseId === pack.productId;
    const isCredit = isCreditProductId(pack.productId) || pack.type === 'credit_pack';
    return renderProductCard(pack, {
      lang,
      selected,
      locked,
      features: isCredit ? (sfUi.creditFeatures || []) : passFeatures,
      buyLabel: locked ? (pt.btnNoNeed || '추가 구매 불필요') : pt.buy,
      ui: {
        recommended: pt.recommended || sfUi.recommended || '추천',
        buy: pt.buy,
        paused: '',
        archived: '',
        btnPaused: '',
        passFeatures,
        lifeFeatures: pt.cardFeaturesLife,
        creditFeatures: sfUi.creditFeatures,
        unitPass: (days) => (lang === 'en'
          ? `${days}-day Full Pass · one-time`
          : (lang === 'ja' ? `${days}日 Full 利用権 · 1回払い` : `${days}일 Full 이용권 · 1회 결제`)),
        unitLife: pt.unlimitedUnit || 'Lifetime Full · 1회 결제',
        unitCredit: sfUi.unitCredit,
        hideToday: '',
        close: '',
        defaultCta: ''
      }
    });
  });
  const lifeSelected = locked || selectedPurchaseId === 'LIFETIME';
  const lifeBtn = locked ? (pt.btnCurrentPlan || '현재 이용 중') : pt.buy;
  const lifeView = buildPurchaseLifetimeView();
  const lifeRaw = findLifetimeCatalogProduct(getPricingCache().products || []);
  let showLifetime = false;
  if(locked) showLifetime = true;
  else if(!isPricingCatalogReady()) showLifetime = true; // hold slot — never paint 129000 fallback
  else if(lifeRaw) showLifetime = isSelling(lifeRaw);
  else if(lifeView) showLifetime = lifeView.status !== 'archived' && lifeView.saleOk !== false;
  if(showLifetime){
    if(!lifeView){
      cards.push(renderLifetimeLoadingCard(pt));
    } else {
      cards.push(renderProductCard(lifeView, {
        lang,
        selected: lifeSelected,
        locked,
        features: pt.cardFeaturesLife,
        buyLabel: lifeBtn,
        extraClass: locked ? 'is-current-plan' : '',
        ui: {
          recommended: pt.recommended || '추천',
          buy: pt.buy,
          paused: '',
          archived: '',
          btnPaused: '',
          passFeatures,
          lifeFeatures: pt.cardFeaturesLife,
          unitPass: () => '',
          unitLife: pt.unlimitedUnit || 'Lifetime Full · 1회 결제',
          hideToday: '',
          close: '',
          defaultCta: ''
        }
      }));
    }
  }
  grid.innerHTML = cards.join('');
}
function renderPurchaseTrialRow(){
  const el = $('purchaseTrialRow');
  if(!el) return;
  const pt = pointCopy();
  const lifetime = purchaseActionsLocked();
  const signedIn = !!currentUser;
  let ctaHtml = '';
  let stateClass = '';
  if(lifetime){
    stateClass = ' is-muted is-lifetime';
  } else if(!signedIn){
    ctaHtml = `<button type="button" class="purchase-trial-cta" data-purchase-trial="login">${esc(pt.trialBtnStart)}</button>`;
  } else {
    ctaHtml = `<button type="button" class="purchase-trial-cta is-current" disabled aria-disabled="true">${esc(pt.trialBtnCurrent)}</button>`;
  }
  el.className = `purchase-trial-row${stateClass}`;
  el.innerHTML = `<div class="purchase-trial-copy">
      <div class="purchase-trial-head">
        <h2>${esc(pt.trialTitle)}</h2>
        <p>${esc(pt.trialPrice)}</p>
      </div>
      <ul class="purchase-trial-items">
        ${(pt.trialItems || []).map((item)=>`<li>${esc(item)}</li>`).join('')}
      </ul>
    </div>
    ${ctaHtml ? `<div class="purchase-trial-action">${ctaHtml}</div>` : ''}`;
}
function applyPurchaseModeUi(){
  if(!isPurchasePage) return;
  const locked = purchaseActionsLocked();
  const points = isPointCheckout();
  const pt = pointCopy();
  document.body.classList.toggle('is-points', points);
  document.body.classList.toggle('is-lifetime-owned', locked);
  renderPurchasePlanGrid();
  renderPurchaseTrialRow();
  const eyebrow = document.querySelector('.purchase-hero .eyebrow');
  if(eyebrow){
    eyebrow.hidden = true;
    eyebrow.textContent = '';
  }
  if($('purchaseHeroLead')){
    $('purchaseHeroLead').textContent = locked ? (pt.heroLeadOwned || pt.heroLead) : pt.heroLead;
  }
  const bank = $('bankTransferNotice');
  if(bank) bank.classList.toggle('hidden', locked || points || lang !== 'ko');
  const owned = $('purchaseLifetimeNotice');
  if(owned){
    owned.hidden = !locked;
    if(locked){
      owned.innerHTML = `<strong>${esc(pt.ownedBannerTitle || 'Lifetime 라이선스 보유 중')}</strong><span>${esc(pt.ownedBannerBody || '')}</span>`;
    } else {
      owned.textContent = '';
    }
  }
  renderPurchaseUsageGuide();
  if(locked) closePurchaseConfirmModal();
  applyPurchaseLifetimeGate();
}
function selectPurchasePlan(id, opts={}){
  if(purchaseActionsLocked()){
    selectedPurchaseId = 'LIFETIME';
    purchaseMode = 'lifetime';
    syncPurchaseUrl();
    applyPurchaseModeUi();
    return;
  }
  const raw = String(id || 'PASS_30D').trim().toUpperCase();
  const next = normalizeCreditProductId(raw);
  if(isPassProductId(next) || next === 'PASS_30D' || isPassProductId(raw)){
    const pid = isPassProductId(next) ? next : (isPassProductId(raw) ? raw : 'PASS_30D');
    selectedPurchaseId = getPassProduct(pid)?.productId || pid;
    purchaseMode = 'pass';
  } else if(next === 'LIFETIME' || raw === 'LIFETIME' || raw === 'UNLIMITED'){
    selectedPurchaseId = 'LIFETIME';
    purchaseMode = 'lifetime';
  } else if(String(next).startsWith('CREDIT_')){
    if(isCreditPurchaseEnabled()){
      selectedPurchaseId = next;
      purchaseMode = 'credits';
      selectedPointProductId = selectedPurchaseId;
    } else {
      selectedPurchaseId = 'PASS_30D';
      purchaseMode = 'pass';
    }
  } else {
    selectedPurchaseId = 'PASS_30D';
    purchaseMode = 'pass';
  }
  syncPurchaseUrl();
  applyPurchaseModeUi();
  const resultBox = $('purchaseResultBox');
  if(resultBox && !resultBox.querySelector('.purchase-success-card')){
    resultBox.classList.add('hidden');
    resultBox.innerHTML = '';
  }
  if(opts.scroll) $('purchaseCheckout')?.scrollIntoView({behavior:'smooth', block:'start'});
  if(opts.confirm) openPurchaseConfirmModal();
}
function setPurchaseMode(mode, packId){
  if((mode === 'points' || mode === 'credits') && !purchaseActionsLocked()) selectPurchasePlan(packId || 'CREDIT_30');
  else selectPurchasePlan('LIFETIME');
}
function bindPurchaseModeUi(){
  if(!isPurchasePage || document.body.dataset.purchaseModeBound === '1') return;
  document.body.dataset.purchaseModeBound = '1';
  $('purchasePlanGrid')?.addEventListener('click', (e)=>{
    if(purchaseActionsLocked()){
      e.preventDefault();
      return;
    }
    const buy = e.target.closest('[data-purchase-buy]');
    if(buy){
      if(buy.disabled) return;
      selectPurchasePlan(buy.getAttribute('data-purchase-buy'), {confirm:true});
      return;
    }
    const card = e.target.closest('[data-purchase-id]');
    if(card) selectPurchasePlan(card.getAttribute('data-purchase-id'));
  });
  $('purchaseTrialRow')?.addEventListener('click', (e)=>{
    const login = e.target.closest('[data-purchase-trial="login"]');
    if(!login) return;
    if(typeof topbarGoogleLogin === 'function') topbarGoogleLogin();
  });
}
const PASS_CATALOG_SESSION_KEY = 'midiai_pass_catalog_session_v3';
let sessionLifetimeView = null;

function findLifetimeCatalogProduct(products = []) {
  return products.find((p) => normalizeCatalogProductId(p?.productId || p?.id || '') === 'LIFETIME')
    || products.find((p) => String(p?.id || '').toLowerCase() === 'lifetime');
}

function buildPurchaseLifetimeView() {
  const pricing = getPricingCache();
  const all = pricing.products || [];
  const promos = pricing.promotions || [];
  if (isPricingCatalogReady()) {
    const raw = findLifetimeCatalogProduct(all);
    if (!raw) return sessionLifetimeView;
    const view = publicProductView(raw, promos, new Date(), lang, starterUnitFromProducts(all), all);
    sessionLifetimeView = view;
    return view;
  }
  return sessionLifetimeView;
}

function renderLifetimeLoadingCard(pt) {
  const title = pt.unlimitedTitle || 'Lifetime Full';
  const loadingLabel = lang === 'en' ? 'Loading price…' : (lang === 'ja' ? '価格を読み込み中…' : '가격 불러오는 중…');
  return `<article class="purchase-plan-card is-loading" aria-busy="true" data-purchase-id="LIFETIME" role="listitem">
    <div class="purchase-plan-head"><h3>${esc(title)}</h3></div>
    <p class="purchase-plan-uses">${esc(loadingLabel)}</p>
    <div class="purchase-plan-price-block">
      <div class="purchase-plan-price-was purchase-plan-price-was-spacer" aria-hidden="true">&nbsp;</div>
      <div class="purchase-plan-price-row"><div class="purchase-plan-price purchase-plan-price-skeleton">······</div></div>
    </div>
    <p class="purchase-plan-unit">&nbsp;</p>
    <button type="button" class="purchase-plan-buy" disabled aria-disabled="true">&nbsp;</button>
  </article>`;
}

function rememberPassCatalogSession(){
  if(!isPurchaseCatalogReady()) return;
  try{
    const lifetime = buildPurchaseLifetimeView();
    sessionStorage.setItem(PASS_CATALOG_SESSION_KEY, JSON.stringify({
      at: Date.now(),
      products: getPassProducts(),
      credits: isCreditPurchaseEnabled() ? getCreditProducts() : [],
      lifetime: lifetime || null
    }));
  }catch(_){}
}

function restorePassCatalogSession(){
  try{
    const raw = sessionStorage.getItem(PASS_CATALOG_SESSION_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!Array.isArray(data?.products) || !data.products.length) return false;
    // Short TTL — avoid stale promo prices for long-lived tabs.
    if(Date.now() - Number(data.at || 0) > 30 * 60 * 1000) return false;
    applyPublicPassCatalog(data.products);
    if(isCreditPurchaseEnabled() && Array.isArray(data.credits)){
      applyCreditCatalogSession(data.credits);
    }
    if(data.lifetime) sessionLifetimeView = data.lifetime;
    return isPurchaseCatalogReady();
  }catch(_){
    return false;
  }
}

async function initPurchasePoints(){
  if(!isPurchasePage) return;
  bindPurchaseModeUi();
  // Warm caches only — do not mark storefront ready (avoids session→stale-API→Firestore card-count flash).
  restorePassCatalogSession();
  applyPurchaseModeUi(); // loader until Firestore SoT
  try{
    // Purchase grid uses Firestore catalog. Stale getCreditProducts returns CREDIT_5/30/100
    // without status and would paint 6 cards before CREDIT_10 settles.
    await loadCreditProducts(CONFIG.functionsBaseUrl, { sideEffectsOnly: true });
  }catch(_){}
  for(let i = 0; i < 40 && !(db && firestoreApi); i += 1){
    await new Promise((r)=>setTimeout(r, 50));
  }
  if(db && firestoreApi){
    try{ await refreshPricingUi(); }catch(_){}
  }
  if(!isPassCatalogReady()){
    useSeedPassFallback('initPurchasePoints_no_catalog');
  } else if(getPassCatalogSource() !== 'firestore'){
    console.warn('CATALOG_FALLBACK_USED', { reason: 'initPurchasePoints', source: getPassCatalogSource() });
  }
  if(!isCreditCatalogReady() && isCreditPurchaseEnabled()){
    try{ await loadCreditProducts(CONFIG.functionsBaseUrl); }catch(_){}
  }
  markPurchaseStorefrontReady();
  rememberPassCatalogSession();
  if(purchaseActionsLocked()){
    selectedPurchaseId = 'LIFETIME';
    purchaseMode = 'lifetime';
    applyPurchaseModeUi();
    return;
  }
  if(isPointCheckout() && (!isCreditPurchaseEnabled() || !getCreditProducts().some((p)=>p.productId===selectedPurchaseId))){
    selectPurchasePlan('PASS_30D');
    return;
  }
  applyPurchaseModeUi();
}
const PENDING_PURCHASE_KEY = 'midiai_pending_purchase_id';
function rememberPendingPurchase(id){
  try{ sessionStorage.setItem(PENDING_PURCHASE_KEY, String(id || '')); }catch(_){}
}
function takePendingPurchase(){
  try{
    const id = sessionStorage.getItem(PENDING_PURCHASE_KEY) || '';
    sessionStorage.removeItem(PENDING_PURCHASE_KEY);
    return id;
  }catch(_){
    return '';
  }
}
function resumePendingPurchase(){
  if(!isPurchasePage || purchaseActionsLocked() || !currentUser) return;
  const id = takePendingPurchase();
  if(!id) return;
  selectPurchasePlan(id, {confirm:true});
}
function renderPurchaseUsageGuide(){
  const el = $('purchaseUsageGuide');
  if(!el) return;
  const locked = purchaseActionsLocked();
  if(locked){
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const pt = pointCopy();
  const details = pt.detailsItems || pt.usageLifetime || [];
  el.hidden = false;
  el.className = 'purchase-usage-note';
  el.innerHTML = `<details class="purchase-usage-more">
      <summary>${esc(pt.detailsToggle || '이용권 안내 자세히 보기')}</summary>
      <ul class="purchase-usage-details">
        ${details.map((item)=>`<li><b>${esc(item.title || '')}</b><span>${esc(item.desc || '')}</span></li>`).join('')}
      </ul>
    </details>`;
}
function purchaseUsesKakao(){
  return isKoreanCheckout();
}
function purchaseAccountHref(){
  return `${window.MIDIAI_BASE_PATH || './'}account.html`;
}
function ensurePurchaseModal(){
  let wrap = $('purchaseConfirmModal');
  if(wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'purchaseConfirmModal';
  wrap.className = 'purchase-modal-backdrop hidden';
  wrap.innerHTML = `<div class="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchaseModalTitle">
    <div id="purchaseModalBody" class="purchase-modal-body"></div>
  </div>`;
  wrap.addEventListener('click', (e)=>{
    if(e.target === wrap && !kakaoPayInFlight) closePurchaseConfirmModal();
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && !wrap.classList.contains('hidden') && !kakaoPayInFlight) closePurchaseConfirmModal();
  });
  wrap.addEventListener('click', (e)=>{
    const act = e.target.closest('[data-purchase-modal]');
    if(!act) return;
    const kind = act.getAttribute('data-purchase-modal');
    if(kind === 'cancel' || kind === 'close'){
      if(!kakaoPayInFlight) closePurchaseConfirmModal();
    } else if(kind === 'login'){
      rememberPendingPurchase(selectedPurchaseId || 'CREDIT_30');
      if(typeof topbarGoogleLogin === 'function') topbarGoogleLogin();
    } else if(kind === 'pay'){
      if(kakaoPayInFlight) return;
      window.midiaiKakaoPay && window.midiaiKakaoPay();
    }
  });
  document.body.appendChild(wrap);
  return wrap;
}
function closePurchaseConfirmModal(){
  const wrap = $('purchaseConfirmModal');
  if(!wrap) return;
  wrap.classList.add('hidden');
  wrap.setAttribute('aria-hidden', 'true');
  const shell = document.querySelector('.purchase-shell');
  const mount = $('purchasePayMount');
  if(shell && mount && mount.parentElement !== shell) shell.appendChild(mount);
  if(mount) mount.hidden = true;
}
function setPurchasePayBusy(busy){
  const pt = pointCopy();
  const btn = $('kakaoPayBtn');
  if(!btn) return;
  btn.disabled = !!busy;
  btn.setAttribute('aria-disabled', busy ? 'true' : 'false');
  btn.classList.toggle('is-disabled', !!busy);
  const label = btn.querySelector('strong');
  if(label){
    label.textContent = busy ? (pt.openingPay || '결제창 여는 중...') : (btn.getAttribute('data-pay-label') || label.textContent);
  }
}
function openPurchaseConfirmModal(){
  if(!isPurchasePage || purchaseActionsLocked()) return;
  const wrap = ensurePurchaseModal();
  const body = $('purchaseModalBody');
  if(!body) return;
  const pt = pointCopy();
  const points = isPointCheckout();
  const pass = isPassCheckout();
  const creditPack = points ? selectedPointPack() : null;
  const passPack = pass ? selectedPassPack() : null;
  const credits = packCredits(creditPack);
  const days = pass ? passDurationDays(passPack || { productId: selectedPurchaseId }) : 0;
  const packList = points
    ? Number(creditPack?.listPriceKrw || creditPack?.basePrice || creditPack?.krw || 0)
    : (pass ? Number(passPack?.listPriceKrw || passPack?.krw || 0) : 0);
  const packSale = points
    ? Number(creditPack?.effectivePrice != null ? creditPack.effectivePrice : creditPack?.krw || 0)
    : (pass ? Number(passPack?.effectivePrice != null ? passPack.effectivePrice : passPack?.krw || 0) : 0);
  const packDiscounted = (points || pass)
    && Number((points ? creditPack : passPack)?.discountPercent || 0) > 0
    && packSale < packList;
  const lifeCtx = (points || pass) ? null : purchaseCheckout();
  const lifeDiscounted = !points && !pass && Number(lifeCtx?.discount || 0) > 0 && Number(lifeCtx.salePrice) < Number(lifeCtx.listPrice);
  const email = currentUser?.email || currentUser?.uid || '';
  const passTitle = typeof pt.confirmPass === 'function'
    ? pt.confirmPass(days || passDurationDays({ productId: selectedPurchaseId }))
    : `${days}일 Full 구매`;
  const modalTitle = points
    ? pt.confirmCredits(credits)
    : (pass ? passTitle : pt.confirmLifetime);
  const pendingId = selectedPurchaseId
    || (points ? creditPack?.productId : (pass ? 'PASS_30D' : 'LIFETIME'));
  wrap.classList.remove('hidden');
  wrap.setAttribute('aria-hidden', 'false');
  if(!currentUser){
    rememberPendingPurchase(pendingId);
    body.innerHTML = `<h3 id="purchaseModalTitle">${esc(modalTitle)}</h3>
      <p class="purchase-modal-lead">${esc(pt.needLogin)}</p>
      <div class="purchase-modal-actions">
        <button type="button" class="ghost" data-purchase-modal="cancel">${esc(pt.cancel)}</button>
        <button type="button" class="primary" data-purchase-modal="login">${esc(pt.googleLogin)}</button>
      </div>`;
    return;
  }
  const passLicenseLabel = lang==='en'
    ? `${days}-Day Full`
    : (lang==='ja' ? `${days}日 Full` : `${days}일 Full`);
  const termValue = pass
    ? (typeof pt.termDays === 'function' ? pt.termDays(days) : `${days}일`)
    : pt.termPermanent;
  const paypalCheckout = !purchaseUsesKakao();
  const listLabel = pt.listPriceLabel || (lang==='ja' ? '定価' : lang==='en' ? 'List price' : '정가');
  const discLabel = pt.discountLabel || (lang==='ja' ? '割引' : lang==='en' ? 'Discount' : '할인');
  const payLabelKey = paypalCheckout ? (pt.payUsdLabel || pt.payAmountLabel) : pt.payAmountLabel;
  const fxNote = pt.fxNote || '';
  const confirmingLabel = lang==='en' ? 'Confirming…' : (lang==='ja' ? '確認中…' : '확인 중…');
  // PayPal USD: never paint KRW numbers as $X before server quote (prevents $7900 flash).
  const creditPriceText = points
    ? (paypalCheckout
      ? (getCatalogFxRate() ? creditCheckoutPriceText(creditPack) : confirmingLabel)
      : creditCheckoutPriceText(creditPack))
    : '';
  const passPriceText = pass
    ? (paypalCheckout
      ? (krwToUsd(packSale || passPack?.krw || 0, getCatalogFxRate()) != null
        ? formatUsd(krwToUsd(packSale || passPack?.krw || 0, getCatalogFxRate()))
        : confirmingLabel)
      : formatKrw(packSale || passPack?.krw || 0))
    : '';
  const priceText = points
    ? creditPriceText
    : (pass ? passPriceText : (paypalCheckout && !getCatalogFxRate() ? confirmingLabel : purchaseDisplayPrice()));
  const rows = points
    ? [
        ...(packDiscounted && !paypalCheckout ? [[ listLabel, formatKrw(packList) ], [ discLabel, `${creditPack.discountPercent}%` ]] : []),
        [payLabelKey, priceText],
        [pt.grantLabelShort || pt.grantLabel || '지급', `${credits} Credits`],
        [pt.payMethod, paypalCheckout ? 'PayPal' : pt.kakaoPay],
        [pt.payAccount, email]
      ]
    : pass
      ? [
          ...(packDiscounted ? [[ listLabel, formatKrw(packList) ], [ discLabel, `${passPack.discountPercent}%` ]] : []),
          [payLabelKey, priceText],
          [pt.licenseLabel, passLicenseLabel],
          [pt.usageLifetime?.[0]?.title || (lang==='ja' ? 'AI変換' : lang==='en' ? 'AI conversion' : 'AI 변환'), pt.aiUnlimited],
          [pt.termLabel, termValue],
          [pt.payMethod, paypalCheckout ? 'PayPal' : pt.kakaoPay],
          [pt.payAccount, email]
        ]
      : [
          ...(lifeDiscounted ? [[ listLabel, lifeCtx.displayList ], [ discLabel, `${lifeCtx.discount}%` ]] : []),
          [payLabelKey, priceText],
          [pt.licenseLabel, pt.unlimitedTitle || 'Lifetime Full'],
          [pt.usageLifetime?.[0]?.title || (lang==='ja' ? 'AI変換' : lang==='en' ? 'AI conversion' : 'AI 변환'), pt.aiUnlimited],
          [pt.termLabel, pt.termPermanent],
          [pt.payMethod, paypalCheckout ? 'PayPal' : pt.kakaoPay],
          [pt.payAccount, email]
        ];
  const lead = points
    ? pt.confirmLeadCredits(credits)
    : (pass
      ? (typeof pt.confirmLeadPass === 'function' ? pt.confirmLeadPass(days) : pt.confirmLeadLifetime)
      : pt.confirmLeadLifetime);
  const payLabel = pt.payNow(priceText);
  const kakaoPayHtml = purchaseUsesKakao()
    ? `<button id="kakaoPayBtn" class="primary purchase-kakao-btn" type="button" data-purchase-modal="pay" data-pay-label="${esc(payLabel)}">
        <span class="kakao-mark">pay</span><strong>${esc(payLabel)}</strong>
      </button>`
    : '';
  const paypalPane = paypalCheckout
    ? `<div class="purchase-modal-paypal-pane">
        <p class="purchase-modal-paypal-amount">${esc(priceText)}</p>
        ${fxNote ? `<p class="purchase-modal-fx-note">${esc(fxNote)}</p>` : ''}
        ${pt.chargedUsdNote ? `<p class="purchase-modal-fx-note">${esc(pt.chargedUsdNote)}</p>` : ''}
        <div id="purchaseModalPaypalSlot" class="purchase-modal-paypal-slot"></div>
        <p id="purchaseModalPaypalStatus" class="muted small"></p>
      </div>`
    : '';
  const modalEl = document.querySelector('#purchaseConfirmModal .purchase-modal');
  if(modalEl) modalEl.classList.toggle('is-paypal', paypalCheckout);
  body.innerHTML = `<h3 id="purchaseModalTitle">${esc(modalTitle)}</h3>
    <dl class="purchase-modal-rows">
      ${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
    <p class="purchase-modal-lead">${esc(lead)}</p>
    <p id="purchaseModalStatus" class="muted small"></p>
    ${paypalPane}
    <div class="purchase-modal-actions">
      ${kakaoPayHtml}
      <button type="button" class="ghost purchase-modal-cancel" data-purchase-modal="cancel">${esc(pt.cancel)}</button>
    </div>`;
  if(paypalCheckout){
    const slot = $('purchaseModalPaypalSlot');
    const mount = $('purchasePayMount');
    if(slot && mount){
      slot.appendChild(mount);
      mount.hidden = false;
    }
    preparePaypalQuoteForModal();
  }
}
async function createUsdCheckoutQuote(pid){
  const id = String(pid || selectedPurchaseId || '');
  let quote;
  if(isPointCheckout() || String(normalizeCreditProductId(id) || '').startsWith('CREDIT_')){
    quote = await callFunctionJsonFallback(['createCreditPurchaseQuote', 'createPurchaseQuote'], { productId: id, currency: 'USD' });
  } else {
    quote = await callFunctionJson('createPurchaseQuote', { productId: id, currency: 'USD' });
  }
  assertUsdCheckoutQuote(quote);
  return quote;
}
function assertUsdCheckoutQuote(quote){
  const pt = pointCopy();
  if(!quote || !(quote.ok || quote.quoteId)){
    throw Object.assign(new Error(quote?.message || pt.fxError || 'quote failed'), { code: quote?.code || 'QUOTE_FAILED' });
  }
  if(String(quote.currency || '').toUpperCase() !== 'USD'){
    throw Object.assign(
      new Error(pt.currencyInvalid || 'The PayPal payment currency is invalid.'),
      { code: 'QUOTE_CURRENCY' }
    );
  }
  const usd = Number(quote.payAmountUsd != null ? quote.payAmountUsd : NaN);
  if(!Number.isFinite(usd) || !(usd > 0)){
    throw Object.assign(
      new Error(pt.currencyInvalid || 'The PayPal payment currency is invalid.'),
      { code: 'QUOTE_CURRENCY' }
    );
  }
  // Detect KRW amount leaked as USD (7900 KRW shown as $7900.00).
  const krw = Number(quote.effectivePriceKrw || quote.listPriceKrw || 0);
  if(Number.isFinite(krw) && krw >= 100 && Math.abs(usd - krw) < 0.011){
    throw Object.assign(
      new Error(pt.currencyInvalid || 'The PayPal payment currency is invalid.'),
      { code: 'QUOTE_CURRENCY' }
    );
  }
  return quote;
}
async function preparePaypalQuoteForModal(){
  pendingPaypalQuoteId = '';
  const pt = pointCopy();
  const statusEl = $('purchaseModalPaypalStatus') || $('purchaseModalStatus');
  const amountEl = document.querySelector('.purchase-modal-paypal-amount');
  if(!currentUser){
    if(statusEl) statusEl.textContent = pt.needLogin || '';
    return;
  }
  const pid = selectedPurchaseId || 'LIFETIME';
  if(statusEl) statusEl.textContent = lang==='ja' ? '金額を確定しています…' : lang==='en' ? 'Confirming amount…' : '결제 금액을 확인하고 있습니다…';
  try{
    const quote = await createUsdCheckoutQuote(pid);
    pendingPaypalQuoteId = String(quote.quoteId || '');
    const usd = Number(quote.payAmountUsd);
    const text = formatUsd(usd);
    if(amountEl) amountEl.textContent = text;
    document.querySelectorAll('.purchase-modal-rows div').forEach((row)=>{
      const dt = row.querySelector('dt');
      const dd = row.querySelector('dd');
      if(dt && dd && /USD|支払額|Amount|결제금액/.test(dt.textContent || '')) dd.textContent = text;
    });
    if(statusEl) statusEl.textContent = '';
  }catch(err){
    console.warn('paypal quote', err);
    pendingPaypalQuoteId = '';
    const mapped = err?.code === 'QUOTE_CURRENCY'
      ? (pt.currencyInvalid || err.message)
      : (err?.code === 'FX_UNAVAILABLE' || /환율|exchange|FX/i.test(String(err?.message||''))
        ? (pt.fxError || err.message)
        : (err?.message || pt.fxError));
    if(amountEl) amountEl.textContent = '—';
    document.querySelectorAll('.purchase-modal-rows div').forEach((row)=>{
      const dt = row.querySelector('dt');
      const dd = row.querySelector('dd');
      if(dt && dd && /USD|支払額|Amount|결제금액/.test(dt.textContent || '')) dd.textContent = '—';
    });
    if(statusEl) statusEl.textContent = mapped;
  }
}
function fillPurchaseSuccessModal(html){
  const wrap = ensurePurchaseModal();
  const body = $('purchaseModalBody');
  const pt = pointCopy();
  wrap.classList.remove('hidden');
  if(!body) return;
  body.innerHTML = `${html}
    <div class="purchase-modal-actions">
      <a class="ghost" href="${esc(purchaseAccountHref())}">${esc(pt.viewAccount)}</a>
      <button type="button" class="primary" data-purchase-modal="close">${esc(pt.close)}</button>
    </div>`;
}
function purchaseDisplayPrice(){
  return purchaseCheckout().displaySale || (isKoreanCheckout() ? (CONFIG.priceDisplayKr || '129,000원') : (CONFIG.priceDisplayGlobal || '$89 USD'));
}
function purchaseAmountValue(){
  const ctx = purchaseCheckout();
  if(isKoreanCheckout() || ctx.currency === 'KRW') return Number(ctx.salePrice || CONFIG.priceValueKr || 129000);
  if(ctx.currency === 'JPY') return String(Math.round(Number(ctx.salePrice)));
  return Number(ctx.salePrice).toFixed(2);
}
function purchaseCurrency(){
  if(isKoreanCheckout()) return 'KRW';
  return 'USD';
}
function updateBankTransferAmount(){
  const labelEl = $('bankTransferAmountLabel');
  const amountEl = $('bankTransferAmount');
  if(!labelEl && !amountEl) return;
  const ctx = purchaseCheckout();
  const discountOn = isDiscountCampaignActive();
  // Charge amount always comes from admin salePrice; label flips with campaign.
  if(labelEl) labelEl.textContent = discountOn ? '할인금액' : '금액';
  if(amountEl) amountEl.textContent = ctx.displaySale || purchaseDisplayPrice();
}
function applyPurchaseSellGate(){
  if(!isPurchasePage) return;
  if(purchaseActionsLocked()){
    const kakao = $('kakaoPayBtn');
    const paypal = $('paypalButtons');
    $('purchasePausedNote')?.remove();
    if(kakao && !kakaoPayInFlight){
      kakao.disabled = true;
      kakao.setAttribute('aria-disabled', 'true');
      kakao.classList.add('is-disabled');
    }
    paypal?.classList.add('is-paused');
    return;
  }
  if(isPointCheckout()){
    const kakao = $('kakaoPayBtn');
    const paypal = $('paypalButtons');
    $('purchasePausedNote')?.remove();
    paypal?.classList.remove('is-paused');
    if(kakao && !kakaoPayInFlight) kakao.disabled = false;
    return;
  }
  const selling = isSelling(getDefaultProduct());
  const ctx = purchaseCheckout();
  const pausedMsg = lang==='en' ? 'Temporarily unavailable' : lang==='ja' ? '一時販売停止' : '일시 판매중지';
  const kakao = $('kakaoPayBtn');
  const paypal = $('paypalButtons');
  const discountOn = isDiscountCampaignActive();
  const badge = document.querySelector('.purchase-badge.sale');
  if(badge){
    const showBadge = discountOn && !!(ctx.badge || '').trim();
    badge.hidden = !showBadge;
    badge.classList.toggle('hidden', !showBadge);
    if(showBadge) badge.textContent = ctx.badge;
  }
  const untilEl = $('purchaseSaleUntil');
  if(untilEl){
    const untilTxt = promoBadgeText(isKoreanCheckout() ? 'ko' : (pathLang || lang || 'en'));
    const showUntil = discountOn && !!untilTxt;
    untilEl.hidden = !showUntil;
    untilEl.classList.toggle('hidden', !showUntil);
    if(untilTxt) untilEl.textContent = untilTxt;
  }
  updateBankTransferAmount();
  const title = document.querySelector('.purchase-price-row h2');
  if(title && ctx.name) title.textContent = ctx.name;
  if(!selling){
    if(kakao){ kakao.disabled = true; kakao.textContent = pausedMsg; }
    if(paypal) paypal.classList.add('is-paused');
    let note = $('purchasePausedNote');
    if(!note){
      note = document.createElement('p');
      note.id = 'purchasePausedNote';
      note.className = 'purchase-paused-note';
      document.querySelector('.purchase-checkout')?.prepend(note);
    }
    if(note) note.textContent = lang==='en' ? 'This product is temporarily unavailable for purchase.' : lang==='ja' ? '現在この商品は一時的に販売を停止しています。' : '현재 이 상품은 일시 판매중지 상태입니다. 결제가 차단됩니다.';
  } else {
    $('purchasePausedNote')?.remove();
    paypal?.classList.remove('is-paused');
  }
}
function paymentId(prefix='midiai'){
  const rand = (window.crypto?.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
  return `${prefix}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

/** Unique PortOne paymentId — no email/PII; safe as Firestore doc id. */
function makeKakaoPaymentId(uid){
  const uidPart = String(uid || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
  const ts = Date.now().toString(36);
  const rand = (window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8);
  return `midiai-kakao-${uidPart}-${ts}-${rand}`.slice(0, 64);
}

function maskEmail(email){
  const s = String(email || '');
  const at = s.indexOf('@');
  if(at <= 1) return s ? '***' : '';
  const name = s.slice(0, at);
  const domain = s.slice(at);
  const keep = Math.min(2, name.length);
  return `${name.slice(0, keep)}${'*'.repeat(Math.max(1, name.length - keep))}${domain}`;
}

function requirePurchaseAuth(){
  if(!auth || !currentUser || !currentUser.uid){
    return { ok:false, message: purchaseLocaleText().loginAlert || 'Google 로그인 후 결제해주세요.' };
  }
  if(!currentUser.email){
    return { ok:false, message: 'Google 계정 이메일을 확인할 수 없습니다. 다시 로그인해 주세요.' };
  }
  return { ok:true };
}

function renderPurchaseSuccess(result){
  const pt = pointCopy();
  const isCredits = result?.kind === 'points' || result?.kind === 'credits';
  const amount = result?.amount;
  const amountText = result?.currency === 'USD'
    ? `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${Number(amount || CONFIG.priceValueKr || 129000).toLocaleString('ko-KR')}원`;
  const added = result?.creditedPoints ?? result?.credits ?? result?.points ?? '-';
  const html = isCredits
    ? `<h3 id="purchaseModalTitle">${esc(pt.successPaid || pt.successTitle)}</h3>
      <p class="purchase-modal-lead"><strong>${esc(pt.successLead || '')}</strong></p>
      <p class="purchase-modal-lead">${esc(pt.balanceLabel)}: ${esc(String(result?.balance ?? '-'))}</p>`
    : `<h3 id="purchaseModalTitle">${esc(pt.successPaid || '결제가 완료되었습니다.')}</h3>
      <p class="purchase-modal-lead">${esc(pt.confirmLeadLifetime)}</p>
      <p class="purchase-modal-lead">${esc(amountText)}</p>`;
  fillPurchaseSuccessModal(html);
  const box = $('purchaseResultBox');
  if(box){
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

function renderPurchaseOwnedNotice(){
  const box = $('purchaseResultBox');
  if(!box) return;
  const t = purchaseLocaleText();
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="purchase-owned-card">
      <h3>${esc(t.alreadyOwnedTitle || 'Lifetime 라이선스 보유')}</h3>
      <p>${esc(t.alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.')}</p>
    </div>`;
}

function applyPurchaseLifetimeGate(){
  if(!isPurchasePage) return;
  const locked = purchaseActionsLocked();
  const kakaoBtn = $('kakaoPayBtn');
  const cardBtn = $('inicisCardPayBtn');
  const checkout = $('purchaseCheckout');
  const paypal = $('paypalButtons');
  const t = purchaseLocaleText();
  document.body.classList.toggle('is-lifetime-owned', locked);
  if(checkout){
    checkout.classList.toggle('is-locked', locked);
    if(locked) checkout.setAttribute('aria-disabled', 'true');
    else checkout.removeAttribute('aria-disabled');
  }
  if(locked){
    if(kakaoBtn){
      kakaoBtn.disabled = true;
      kakaoBtn.setAttribute('aria-disabled', 'true');
      kakaoBtn.classList.add('is-disabled');
    }
    if(cardBtn){
      cardBtn.disabled = true;
      cardBtn.setAttribute('aria-disabled', 'true');
      cardBtn.classList.add('is-disabled');
    }
    paypal?.classList.add('is-paused');
    applyPurchaseSellGate();
    return;
  }
  paypal?.classList.remove('is-paused');
  if(kakaoBtn && !kakaoPayInFlight){
    kakaoBtn.disabled = false;
    kakaoBtn.removeAttribute('aria-disabled');
    kakaoBtn.classList.remove('is-disabled');
    const label = kakaoBtn.querySelector('strong');
    const payLabel = kakaoBtn.getAttribute('data-pay-label');
    if(label && payLabel) label.textContent = payLabel;
  }
  if(cardBtn){
    cardBtn.disabled = false;
    cardBtn.removeAttribute('aria-disabled');
    cardBtn.classList.remove('is-disabled');
  }
  applyPurchaseSellGate();
}

function purchaseLocaleText(){
  if(lang === 'en') return {
    saleUntil:'Until July 31',
    noteTitle:'License Guide',
    checkoutTitle:'Payment details',
    buyerLabel:'Buyer',
    buyerGuest:'Filled after Google sign-in',
    phoneLabel:'Phone number',
    phoneHelp:'Required for Korean card checkout.',
    paymentLabel:'Payment method',
    productLabel:'Product',
    productName:'MidiAI Studio Lifetime digital license',
    priceLabel:'Price',
    paymentTypeLabel:'Payment type',
    paymentTypeValue:'One-time payment',
    serviceLabel:'Service delivery',
    serviceValue:'License issued immediately after payment',
    preparingPayment:'Preparing payment buttons.',
    licenseGuide:[
      {title:'Full-song MIDI conversion',desc:'Convert entire YouTube links or audio files to MIDI with AI.'},
      {title:'Band / Orchestra Preview',desc:'Preview: split stems and transcribe each stem to MIDI. Not a full orchestration model.'},
      {title:'MIDI Editor PRO',desc:'Edit multi-track piano rolls with velocity and CC parameters.'},
      {title:'AI Assistant',desc:'Tidy MIDI with cleanup, easier keys, and instrument-part rewrite tools — not generative transcription.'},
      {title:'Score export',desc:'Export MIDI as PDF/MusicXML. PDF score import is a Score Editor Beta.'},
      {title:'Score Editor',desc:'Edit notation in-app and export MusicXML or PDF. Still improving; not a publishing suite.'}
    ],
    benefits:['Linked to your Google account','Available on your registered PC','Support via 1:1 Support'],
    accountTitle:'Sign in with Google before purchasing.',
    signedOut:'After signing in, the Lifetime license will be assigned automatically to your Google account after payment.',
    signedIn:(id)=>`After payment, a Lifetime license will be assigned automatically to <b>${id}</b>.`,
    paypalReady:'PayPal buttons will appear after the Client ID and Functions URL are configured.',
    kakaoReady:'KakaoPay checkout is available for Korean checkout.',
    kakaoButton:'Pay with KakaoPay',
    kakaoPreparing:'Opening KakaoPay checkout...',
    kakaoVerifying:'Verifying payment and assigning your license...',
    kakaoComplete:'Payment and license registration complete.',
    kakaoCancel:'Payment was canceled.',
    kakaoVerifyFail:'Payment completed, but license confirmation is required. Please keep your payment ID.',
    alreadyOwned:'You already have a Lifetime license. No additional payment is needed.',
    alreadyOwnedTitle:'Lifetime license already owned',
    alreadyOwnedButton:'Already purchased',
    duplicateRefunded:'You already have a Lifetime license. The duplicate payment was automatically canceled and refunded.',
    duplicateRefundFailed:'You already have a Lifetime license. Automatic refund failed — please contact support with your payment ID.',
    purchaseInProgress:'A checkout is already in progress. Please wait a moment and try again.',
    loginAlert:'Please sign in with Google before purchasing.',
    paypalAccount:(id)=>`Payment account: ${id}`,
    creating:'Creating PayPal order...',
    opening:'Opening PayPal checkout...',
    verifying:'Verifying payment...',
    complete:'Payment complete.',
    cancel:'Payment canceled.',
    error:'PayPal payment error: ',
    currencyInvalid:'The PayPal payment currency is invalid.'
  };
  if(lang === 'ja') return {
    saleUntil:'7月31日まで',
    noteTitle:'ライセンス案内',
    checkoutTitle:'決済情報',
    buyerLabel:'購入者情報',
    buyerGuest:'Googleログイン後に表示',
    phoneLabel:'携帯電話番号',
    phoneHelp:'韓国カード決済時に必要な連絡先です。',
    paymentLabel:'決済手段',
    productLabel:'商品名',
    productName:'MidiAI Studio Lifetime デジタルライセンス',
    priceLabel:'販売価格',
    paymentTypeLabel:'決済形態',
    paymentTypeValue:'単発決済',
    serviceLabel:'サービス提供',
    serviceValue:'決済完了後すぐにライセンス発行',
    preparingPayment:'決済ボタンを準備しています。',
    licenseGuide:[
      {title:'全曲MIDI変換',desc:'YouTubeリンクやオーディオファイルをAIでMIDIに変換します。'},
      {title:'Band / Orchestra Preview',desc:'Previewです。ステムに分けてから各ステムをMIDIに採譜します。専用のオーケストラモデルではありません。'},
      {title:'MIDI編集 PRO',desc:'マルチトラックピアノロールでベロシティやCCを編集できます。'},
      {title:'AIアシスタント',desc:'整理・弾きやすい調・楽器パートの書き直しなど、MIDIを整える補正/編曲ツールです。'},
      {title:'楽譜書き出し',desc:'MIDIをPDF/MusicXMLに書き出します。PDF楽譜の認識はScore EditorのBetaです。'},
      {title:'Score Editor',desc:'アプリ内で記譜を直し、MusicXML・PDFに書き出せます。改善継続中です。'}
    ],
    benefits:['Googleアカウントにライセンス連携','登録済みPCで利用可能','サイト内お問い合わせサポート'],
    accountTitle:'Googleアカウントでログイン後、ご購入いただけます。',
    signedOut:'ログイン後に決済すると、LifetimeライセンスがGoogleアカウントへ自動付与されます。',
    signedIn:(id)=>`決済完了後、<b>${id}</b> にLifetimeライセンスが自動付与されます。`,
    paypalReady:'PayPal Client IDとFunctions URLの設定後、決済ボタンが表示されます。',
    kakaoReady:'KakaoPay決済が利用できます。',
    kakaoButton:'KakaoPayで決済',
    kakaoPreparing:'KakaoPay決済画面を開いています...',
    kakaoVerifying:'決済を確認し、ライセンスを付与しています...',
    kakaoComplete:'決済とライセンス登録が完了しました。',
    kakaoCancel:'決済がキャンセルされました。',
    kakaoVerifyFail:'決済は完了しましたが、ライセンス確認が必要です。paymentIdを控えてください。',
    alreadyOwned:'すでにLifetimeライセンスを保有しています。追加の決済は不要です。',
    alreadyOwnedTitle:'Lifetimeライセンス保有中',
    alreadyOwnedButton:'購入済み',
    duplicateRefunded:'すでにLifetimeライセンスを保有しているため、重複決済は自動キャンセル（全額返金）されました。',
    duplicateRefundFailed:'すでにLifetimeライセンスがあります。自動キャンセルに失敗したため、管理者確認が必要です。paymentIdを控えてください。',
    purchaseInProgress:'別の決済が進行中です。しばらくしてから再度お試しください。',
    loginAlert:'Googleログイン後に決済してください。',
    paypalAccount:(id)=>`決済アカウント: ${id}`,
    creating:'PayPal注文を作成しています...',
    opening:'PayPal決済画面を開いています...',
    verifying:'決済を確認しています...',
    complete:'決済が完了しました。',
    cancel:'決済がキャンセルされました。',
    error:'PayPal決済エラー: ',
    currencyInvalid:'PayPal決済通貨が正しくありません。'
  };
  return {
    saleUntil:'7월 31일까지',
    noteTitle:'라이선스 안내',
    checkoutTitle:'결제 정보',
    buyerLabel:'주문자 정보',
    buyerGuest:'Google 로그인 후 자동 입력',
    phoneLabel:'휴대폰 번호',
    phoneHelp:'KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.',
    paymentLabel:'결제수단',
    productLabel:'상품명',
    productName:'MidiAI Studio Lifetime 디지털 라이선스',
    priceLabel:'판매가격',
    paymentTypeLabel:'결제형태',
    paymentTypeValue:'단건 결제',
    serviceLabel:'서비스 제공기간',
    serviceValue:'결제 완료 후 즉시 라이선스 발급',
    preparingPayment:'결제 버튼을 준비하고 있습니다.',
    licenseGuide:[
      {title:'전체 구간 MIDI 변환',desc:'YouTube 링크·오디오 파일 전체를 AI로 MIDI로 변환합니다.'},
      {title:'Band / Orchestra Preview',desc:'Preview 기능입니다. 스템 분리 후 각 스템을 MIDI로 채보하며, 전용 오케스트라 모델은 아닙니다.'},
      {title:'MIDI 편집 PRO',desc:'멀티트랙 피아노 롤에서 벨로시티·CC 파라미터를 편집합니다.'},
      {title:'AI 어시스턴트',desc:'정리·쉬운 조·악기 파트 재작성 등 MIDI를 다듬는 보정/편곡 도구입니다.'},
      {title:'악보 내보내기',desc:'MIDI를 PDF/MusicXML로 내보냅니다. PDF 악보 인식은 Score Editor의 Beta입니다.'},
      {title:'Score Editor',desc:'앱 안에서 기보를 수정하고 MusicXML·PDF로 내보냅니다. 계속 개선 중입니다.'}
    ],
    benefits:['Google 계정 라이선스 연결','등록된 PC에서 사용 가능','홈페이지 1:1 문의 지원'],
    accountTitle:'Google 로그인 후 결제할 수 있습니다.',
    signedOut:'결제 전 로그인하면 해당 Google 계정 UID에 라이선스가 자동 지급됩니다.',
    signedIn:(id)=>`결제 완료 시 <b>${id}</b> 계정에 Lifetime 라이선스가 자동 지급됩니다.`,
    paypalReady:'PayPal Client ID와 Functions URL 설정 후 결제 버튼이 표시됩니다.',
    kakaoReady:'카카오페이 결제를 사용할 수 있습니다.',
    kakaoButton:'카카오페이로 구매',
    kakaoPreparing:'카카오페이 결제창을 여는 중입니다...',
    kakaoVerifying:'결제를 검증하고 라이선스를 등록하는 중입니다...',
    kakaoComplete:'결제 및 라이선스 등록이 완료되었습니다.',
    kakaoCancel:'결제가 취소되었습니다.',
    kakaoVerifyFail:'결제는 완료되었으나 라이선스 확인이 필요합니다. 주문번호를 보관해 주세요.',
    alreadyOwned:'이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.',
    alreadyOwnedTitle:'Lifetime 라이선스 보유',
    alreadyOwnedButton:'구매 완료',
    duplicateRefunded:'이미 Lifetime 라이선스를 보유하고 있어 중복 결제가 자동 취소(전액 환불)되었습니다.',
    duplicateRefundFailed:'이미 Lifetime 라이선스가 있습니다. 중복 결제 자동 취소에 실패해 관리자 확인이 필요합니다. 주문번호를 보관해 주세요.',
    purchaseInProgress:'이미 진행 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요.',
    loginAlert:'Google 로그인 후 결제해주세요.',
    paypalAccount:(id)=>`결제 계정: ${id}`,
    creating:'PayPal 주문을 생성하는 중입니다...',
    opening:'PayPal 결제창을 여는 중입니다...',
    verifying:'결제를 검증하는 중입니다...',
    complete:'결제가 완료되었습니다.',
    cancel:'결제가 취소되었습니다.',
    error:'PayPal 결제 오류: ',
    currencyInvalid:'PayPal 결제 통화가 올바르지 않습니다.'
  };
}
function updatePurchaseI18n(){
  if(!document.body) return;
  const t = purchaseLocaleText();
  if($('purchasePrice')) $('purchasePrice').textContent = purchaseDisplayPrice();
  updatePurchaseReviewPanel();
  {
    const discountOn = isDiscountCampaignActive();
    const untilTxt = promoBadgeText(isKoreanCheckout() ? 'ko' : (pathLang || lang || 'en')) || t.saleUntil;
    if($('purchaseSaleUntil')){
      const showUntil = discountOn && !!untilTxt;
      $('purchaseSaleUntil').hidden = !showUntil;
      $('purchaseSaleUntil').classList.toggle('hidden', !showUntil);
      if(untilTxt) $('purchaseSaleUntil').textContent = untilTxt;
    }
    document.querySelectorAll('.purchase-badge.sale').forEach(el=>{
      el.hidden = !discountOn;
      el.classList.toggle('hidden', !discountOn);
    });
  }
  if($('purchaseBenefitList')) $('purchaseBenefitList').innerHTML = t.benefits.map(x=>`<li>${esc(x)}</li>`).join('');
  if($('purchaseAccountTitle')) $('purchaseAccountTitle').textContent = t.accountTitle;
  const bank = $('bankTransferNotice');
  if(bank) bank.classList.toggle('hidden', lang !== 'ko');
  updateBankTransferAmount();
  const note = document.querySelector('.purchase-final-note');
  if(note){
    const guide = t.licenseGuide || [];
    note.innerHTML = `<h3>${esc(t.noteTitle || '라이선스 안내')}</h3>
      <ul class="license-benefit-list">
        ${guide.map(item=>`<li><b>${esc(item.title)}</b><span>${esc(item.desc)}</span></li>`).join('')}
      </ul>`;
  }
  if($('purchaseHeroLead') && !purchaseActionsLocked()){
    const pt = pointCopy();
    $('purchaseHeroLead').textContent = pt.heroLead;
  } else if($('purchaseHeroLead') && purchaseActionsLocked()){
    const pt = pointCopy();
    $('purchaseHeroLead').textContent = pt.heroLeadOwned || pt.heroLead;
  }
  const checkoutTitle = document.querySelector('.checkout-order-head h3');
  if(checkoutTitle) checkoutTitle.textContent = t.checkoutTitle || checkoutTitle.textContent;
  const orderItems = document.querySelectorAll('.checkout-order-item');
  if(orderItems[0]){
    const dt = orderItems[0].querySelector('dt');
    if(dt) dt.textContent = t.buyerLabel;
  }
  // payment method row (phone field removed)
  const payRow = [...orderItems].find(el => el.querySelector('#purchasePaymentMethod')) || orderItems[1];
  if(payRow){
    const dt = payRow.querySelector('dt');
    if(dt) dt.textContent = t.paymentLabel;
  }
  const specItems = document.querySelectorAll('.purchase-spec-item');
  if(specItems[0]){
    const span = specItems[0].querySelector('span');
    const strong = specItems[0].querySelector('strong');
    if(span) span.textContent = t.productLabel;
    if(strong && !strong.id) strong.textContent = t.productName;
  }
  if(specItems[1]){
    const span = specItems[1].querySelector('span');
    if(span) span.textContent = t.priceLabel;
  }
  if(specItems[2]){
    const span = specItems[2].querySelector('span');
    const strong = specItems[2].querySelector('strong');
    if(span) span.textContent = t.paymentTypeLabel;
    if(strong) strong.textContent = t.paymentTypeValue;
  }
  if(specItems[3]){
    const span = specItems[3].querySelector('span');
    const strong = specItems[3].querySelector('strong');
    if(span) span.textContent = t.serviceLabel;
    if(strong) strong.textContent = t.serviceValue;
  }
  const paypal = $('paypalButtons');
  if(paypal){
    const onlyPrep = paypal.querySelector('p') && paypal.children.length === 1;
    const txt = paypal.textContent || '';
    if(onlyPrep && (/준비|Preparing|準備|Client ID/.test(txt))) paypal.innerHTML = `<p>${esc(t.preparingPayment || t.paypalReady)}</p>`;
  }
  updatePurchaseAccountBox();
  applyPurchaseSellGate();
  applyPurchaseModeUi();
}

function updatePurchaseAccountBox(){
  const box = $('purchaseAccountBox');
  const text = $('purchaseAccountText');
  if(!box || !text) return;
  const t = purchaseLocaleText();
  if($('purchaseAccountTitle')) $('purchaseAccountTitle').textContent = t.accountTitle;
  if(currentUser){
    box.classList.add('is-signed-in');
    text.innerHTML = t.signedIn(esc(currentUser.email || currentUser.uid));
  } else {
    box.classList.remove('is-signed-in');
    text.textContent = t.signedOut;
  }
  updatePurchaseReviewPanel();
}

function renderPurchasePaymentTags(){
  const box = $('purchasePaymentMethod');
  if(!box) return;
  if(isKoreanCheckout()){
    box.innerHTML = '<span class="checkout-pay-chip is-kakao">카카오페이</span>';
  } else {
    box.innerHTML = '<span class="checkout-pay-chip is-paypal">PayPal</span>';
  }
}
function updatePurchaseReviewPanel(){
  if($('purchaseReviewPrice')){
    $('purchaseReviewPrice').textContent = isPointCheckout()
      ? creditCheckoutPriceText(selectedPointPack())
      : purchaseDisplayPrice();
  }
  renderPurchasePaymentTags();
  if($('purchaseBuyerInfo')){
    if(currentUser){
      $('purchaseBuyerInfo').textContent = currentUser.email || currentUser.displayName || currentUser.uid;
    } else {
      $('purchaseBuyerInfo').textContent = purchaseLocaleText().buyerGuest || (isKoreanCheckout() ? 'Google 로그인 후 자동 입력' : 'Filled after Google sign-in');
    }
  }
}

function paypalStatus(msg, type=''){
  ['paypalStatus','purchaseModalStatus'].forEach((id)=>{
    const el = $(id);
    if(!el) return;
    el.className = 'muted small paypal-status ' + type;
    el.textContent = msg || '';
  });
}

function setAdminGate(html){
  const gate=$('adminGate');
  const admin=$('admin');
  if(!gate||!admin) return;
  gate.innerHTML=html;
  admin.classList.add('admin-locked');
}
function unlockAdminPanel(){
  $('admin')?.classList.remove('admin-locked');
  try {
    window.__midiaiPricingAdmin?.setPricingAdminAuth({ db, firestoreApi, isAdmin: true });
  } catch (e) { console.warn('pricing-admin auth', e); }
  try{
    configureAdminUserLogs({
      db,
      firestoreApi,
      isAdmin: () => !!isAdminUser,
      getActor: () => ({ uid: currentUser?.uid || '', email: currentUser?.email || '' }),
      getUsers: () => adminUserRows || [],
      getLicense: (uid) => licenseForUid(uid),
      getOrders: (uid) => adminOrdersForUid(uid),
      getTickets: (uid) => adminTicketsForUid(uid)
    });
    initAdminUserLogs();
  }catch(e){ console.warn('admin-user-logs', e); }
}

function updateBoardPinnedUi(){
  const wrap=$('boardPinnedWrap');
  if(!wrap) return;
  const show=!!isAdminUser;
  wrap.style.display=show?'flex':'none';
  wrap.hidden=!show;
  if(!show && $('boardPostPinned')) $('boardPostPinned').checked=false;
}
function setAdminNavVisible(show){
  document.querySelectorAll('#adminNav').forEach(el=>{
    el.classList.toggle('hidden', !show);
    el.hidden = !show;
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  });
  const profileAdmin = $('topbarProfileAdmin');
  if(profileAdmin) profileAdmin.hidden = !show;
  syncBoardAdminUi();
  if(show) updateAdminTicketUnreadBadges(unreadAdminTicketCount);
  else updateAdminTicketUnreadBadges(0);
}

function hubAdminLabels(){
  if(lang==='en') return { write:'Write', edit:'Edit', del:'Delete', writeNotice:'New notice', writePatch:'New patch note', writeFaq:'New FAQ' };
  if(lang==='ja') return { write:'作成', edit:'編集', del:'削除', writeNotice:'お知らせ作成', writePatch:'パッチノート作成', writeFaq:'FAQ作成' };
  return { write:'글쓰기', edit:'수정', del:'삭제', writeNotice:'공지 작성', writePatch:'패치노트 작성', writeFaq:'FAQ 작성' };
}

function ensureHubAdminTools(toolbar){
  if(!toolbar) return null;
  let tools = toolbar.querySelector('.hub-tools');
  if(tools) return tools;
  tools = document.createElement('div');
  tools.className = 'hub-tools';
  [...toolbar.children].forEach(child=>{
    if(child.tagName === 'H2') return;
    tools.appendChild(child);
  });
  toolbar.appendChild(tools);
  return tools;
}

function syncBoardAdminUi(){
  if(syncBoardAdminUi._busy) return;
  syncBoardAdminUi._busy = true;
  try{
  const labels = hubAdminLabels();
  const configs = [
    { match: page==='notices.html', kind:'announcements', label: labels.writeNotice || labels.write, toolbarSel:'.hub-toolbar' },
    { match: page==='patch-notes.html', kind:'patchNotes', label: labels.writePatch || labels.write, toolbarSel:'.hub-toolbar' },
    { match: page==='faq.html', kind:'faq', label: labels.writeFaq || labels.write, toolbarSel:'.hub-card, .hub-topline' }
  ];
  configs.forEach(cfg=>{
    const existing = document.getElementById(`hubAdminWrite_${cfg.kind}`);
    if(!cfg.match){
      existing?.remove();
      return;
    }
    if(!isAdminUser){
      existing?.remove();
      return;
    }
    if(existing) return;
    let host = null;
    if(cfg.kind === 'faq'){
      const card = document.querySelector('.hub-card');
      if(card){
        let bar = card.querySelector('.hub-toolbar');
        if(!bar){
          bar = document.createElement('div');
          bar.className = 'hub-toolbar';
          bar.innerHTML = `<h2>FAQ</h2>`;
          card.prepend(bar);
        }
        host = ensureHubAdminTools(bar);
      }
    } else {
      host = ensureHubAdminTools(document.querySelector(cfg.toolbarSel));
    }
    if(!host) return;
    const btn = document.createElement('button');
    btn.id = `hubAdminWrite_${cfg.kind}`;
    btn.type = 'button';
    btn.className = 'primary';
    btn.textContent = cfg.label;
    btn.addEventListener('click', ()=>createHubAdminPost(cfg.kind));
    host.appendChild(btn);
  });

  // Re-render detail/list manage actions after auth resolves
  if(page==='notice.html' && window.__lastNoticeDetail) renderNoticeDetail(window.__lastNoticeDetail);
  if(page==='patch-note.html' && window.__lastPatchDetail) renderPatchDetail(window.__lastPatchDetail);
  if(page==='faq.html' && Array.isArray(window.__lastFaqRows)) renderFaq(window.__lastFaqRows);
  if(page==='board-post.html' && activeBoardPost) renderBoardPost(activeBoardPost);

  // Re-bind manage buttons if detail/list already rendered
  bindAdminPostActions(document);
  } finally {
    syncBoardAdminUi._busy = false;
  }
}

function hubAdminManageHtml(collectionName, id){
  if(!isAdminUser || !id) return '';
  const labels = hubAdminLabels();
  return `<div class="hub-admin-actions post-actions">
    <button type="button" class="post-action-btn post-edit-btn secondary mini-btn" data-admin-edit="${esc(collectionName)}:${esc(id)}">${esc(labels.edit)}</button>
    <button type="button" class="post-action-btn post-delete-btn ghost mini-btn danger-btn" data-admin-delete="${esc(collectionName)}:${esc(id)}">${esc(labels.del)}</button>
  </div>`;
}

async function createHubAdminPost(kind){
  if(!isAdminUser) return alert(tr('no_permission'));
  try{
    let data = null;
    if(kind==='announcements'){
      data = await openEditModal(hubAdminLabels().writeNotice, [
        {name:'title', label:'제목', value:'', required:true},
        {name:'content', label:'내용', type:'markdown', value:'', required:true, draftKey:'hub:announcements:new'},
        {name:'pinned', label:'상단 고정', type:'checkbox', value:false}
      ]);
      if(!data) return;
      const id = await adminAdd('announcements',{title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', pinned:!!data.pinned, viewCount:0, email:currentUser?.email||''});
      if(id && !openAdminCmsAfterWrite('notices', id)) location.href = `./notice.html?id=${encodeURIComponent(id)}`;
      return;
    }
    if(kind==='patchNotes'){
      data = await openEditModal(hubAdminLabels().writePatch, patchNoteFormFields({type:'app', contentValue:'', draftKey:'hub:patchNotes:new'}));
      if(!data) return;
      data = normalizePatchNoteWrite(data);
      if(!data) return;
      const payload = {type:data.type, title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', viewCount:0, email:currentUser?.email||''};
      if(data.type === 'app') payload.version = data.version;
      const id = await adminAdd('patchNotes', payload);
      if(id && !openAdminCmsAfterWrite('patches', id)) location.href = `./patch-note.html?id=${encodeURIComponent(id)}`;
      return;
    }
    if(kind==='faq'){
      data = await openEditModal(hubAdminLabels().writeFaq, [
        {name:'question', label:'질문', value:'', required:true},
        {name:'answer', label:'답변', type:'markdown', value:'', required:true, draftKey:'hub:faq:new'},
        {name:'order', label:'순서', type:'number', value:1}
      ]);
      if(!data) return;
      const faqId = await adminAdd('faq',{question:data.question, answer:data.answer, contentMarkdown:data.answer, contentFormat:'markdown', order:Number(data.order||1)});
      adminFlash(tr('saved'));
      if(faqId) openAdminCmsAfterWrite('faq', faqId);
      return;
    }
  }catch(e){
    alert(e.message || e);
  }
}
function setAuthUiSignedOut(){
  stopTicketNotifyListener();
  stopAdminTicketNotifyListener();
  // Auth-scoped listeners only. Public catalog listeners must survive guest
  // onAuthStateChanged(null), which otherwise tears down downloads/notices/FAQ/board.
  clearUnsubs();
  clearTicketReplyObserver();
  dismissAllAppToasts();
  updateTicketUnreadBadges(0);
  updateAdminTicketUnreadBadges(0);
  stopUserNotifications();
  setNotifyBellVisible(false);
  updateTopbarLicensePeriod(null);
  pendingTicketOpenId = '';
  pendingAdminTicketOpenId = '';
  userNotifyPrefs = defaultNotifyPrefs();
  currentUser = null; currentUserDoc = null; isAdminUser = false;
  currentLicenseActive = false;
  currentLicenseLifetime = false;
  accountLicenseDoc = null;
  resetAccountOrders();
  resetCreditAccountState();
  setAdminNavVisible(false);
  syncTopbarProfileAuthUi(false);
  syncSidebarAuthUi({
    signedIn:false,
    name:tr('guest'),
    email:tr('guest_desc'),
    avatar:'?',
    licenseClass:'pending',
    licenseText:tr('license_wait')
  });
  if ($('avatar')){ $('avatar').textContent='?'; $('avatar').classList.remove('has-photo'); }
  if ($('userName')) $('userName').textContent=tr('guest');
  if ($('userEmail')) $('userEmail').textContent=tr('guest_desc');
  if ($('licenseBadge')) { $('licenseBadge').className='badge pending'; $('licenseBadge').textContent=tr('license_wait'); }
  updateAccountProfileBadges(null);
  if ($('accountMeta')) renderAccountDashboard('', null, null);
  if (page==='my-tickets.html' && $('myTicketList')) $('myTicketList').innerHTML=`<div class="empty-card">${tr('need_login')}</div>`;
  if (page==='ticket.html' && $('ticketDetail')) $('ticketDetail').innerHTML=`<div class="empty-card">${tr('need_login')}</div>`;
  if (page==='admin.html') setAdminGate(`<p>${tr('need_login')}</p><p class="muted">Google 로그인 후 role=admin 계정만 접근할 수 있습니다.</p>`);
  downloadAdminExpanded = false;
  refreshDownloadCard(true);
  updateBoardPinnedUi();
  syncBoardAdminUi();
  if(isPurchasePage){
    const resultBox = $('purchaseResultBox');
    if(resultBox && resultBox.querySelector('.purchase-owned-card')){
      resultBox.classList.add('hidden');
      resultBox.innerHTML = '';
    }
    applyPurchaseModeUi();
  }
  updatePurchaseAccountBox();
  updateSupportFormUi();
  if(db && firestoreApi) routeLoadPublic();
}

function syncSidebarAuthUi({signedIn, name, email, avatar, licenseClass, licenseText}){
  const card=$('sidebarUserCard');
  if(card) card.classList.toggle('is-signed-in', !!signedIn);
  if($('sidebarAvatar')){
    // keep text fallback; photo handled separately in topbar profile
    if(!$('sidebarAvatar').querySelector('img')) $('sidebarAvatar').textContent=avatar||'?';
  }
  if($('sidebarUserName')) $('sidebarUserName').textContent=name||tr('guest');
  if($('sidebarUserEmail')){
    $('sidebarUserEmail').textContent=email||'';
    $('sidebarUserEmail').title=email||'';
  }
  const badge=$('sidebarLicenseBadge');
  if(badge){
    badge.className='badge sidebar-license-badge '+(licenseClass||'pending');
    badge.textContent=licenseText||tr('license_wait');
  }
  const pName=$('topbarProfileName');
  const pEmail=$('topbarProfileEmail');
  const pBadge=$('topbarProfileLicense');
  if(pName && signedIn) pName.textContent=name||tr('guest');
  if(pEmail && signedIn){ pEmail.textContent=email||''; pEmail.title=email||''; }
  if(pBadge){
    pBadge.className='badge topbar-profile-license '+(licenseClass||'pending');
    pBadge.textContent=licenseText||tr('license_wait');
    pBadge.hidden = !signedIn;
  }
  const adminLink=$('topbarProfileAdmin');
  if(adminLink) adminLink.hidden = !(signedIn && isAdminUser);
}

function metaCard(k,v){ return `<div class="stat-card"><b>${esc(k)}</b><span>${esc(v || '-')}</span></div>`; }

function accountField(label, value){
  return `<div class="account-field"><span class="account-field-label">${esc(label)}</span><strong class="account-field-value">${esc(value || '-')}</strong></div>`;
}

function resetAccountOrders(){
  accountOrderRows = [];
  accountOrdersStatus = '';
  accountOrdersUid = '';
}

function accountOrderWhenMs(o){
  return licenseTsMs(o?.completedAt || o?.verifiedAt || o?.issuedAt || o?.createdAt || o?.updatedAt);
}

function accountOrderVisible(o){
  const s=String(o?.status||'').toLowerCase();
  if(s==='created' || s==='open') return false;
  return true;
}

function accountOrderProductLabel(o){
  const pid=String(o?.productId || o?.productDocId || '').trim().toUpperCase();
  if(pid==='PASS_7D' || pid==='PASS_7D' || pid==='PASS_7DAY') return lang==='en'?'7-Day Full':lang==='ja'?'7日 Full':'7일 Full';
  if(pid==='PASS_30D' || pid==='PASS_30D') return lang==='en'?'30-Day Full':lang==='ja'?'30日 Full':'30일 Full';
  if(pid==='PASS_90D' || pid==='PASS_90D') return lang==='en'?'90-Day Full':lang==='ja'?'90日 Full':'90일 Full';
  if(pid==='LIFETIME' || pid.includes('LIFETIME')) return 'Lifetime Full';
  const named=o?.productName || o?.orderName || o?.plan;
  if(named) return String(named);
  const plan=String(o?.plan||'').toLowerCase();
  if(plan==='lifetime') return 'Lifetime Full';
  if(plan==='period') return lang==='en'?'Full Pass':lang==='ja'?'期間 Full':'기간 Full';
  return lang==='en'?'License':lang==='ja'?'ライセンス':'라이선스';
}

function accountOrderAmountLabel(o){
  if(o?.amount==null || o?.amount==='') return '-';
  const n=Number(o.amount);
  const cur=String(o.currency||'KRW').toUpperCase();
  if(!Number.isFinite(n)) return String(o.amount);
  if(cur==='KRW' || cur==='원') return `${Math.round(n).toLocaleString('ko-KR')}원`;
  if(cur==='USD') return `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  return `${n.toLocaleString()} ${cur}`;
}

function accountOrderMethodLabel(o){
  const raw=String(o?.paymentMethod || o?.provider || o?.method || '').toLowerCase();
  if(raw.includes('kakao')) return lang==='en'?'Kakao Pay':lang==='ja'?'Kakao Pay':'카카오페이';
  if(raw.includes('paypal')) return 'PayPal';
  if(raw.includes('inicis') || raw==='card') return lang==='en'?'Card':lang==='ja'?'カード':'카드';
  if(raw==='admin' || raw==='manual') return lang==='en'?'Admin grant':lang==='ja'?'管理者付与':'관리자 지급';
  if(raw==='portone') return lang==='en'?'Kakao Pay':lang==='ja'?'Kakao Pay':'카카오페이';
  const fallback=o?.paymentMethod || o?.provider || o?.method;
  return fallback ? String(fallback) : '-';
}

function accountOrderStatusInfo(o){
  const s=String(o?.status||'').toLowerCase();
  if(s==='completed' || s==='paid' || s==='verified'){
    return { key:'paid', label: lang==='en'?'Paid':lang==='ja'?'支払済み':'결제완료' };
  }
  if(s==='refund_review_required'){
    return { key:'review', label: lang==='en'?'Refund review':lang==='ja'?'返金確認':'환불검토필요' };
  }
  if(s==='partially_refunded'){
    return { key:'refund', label: lang==='en'?'Partial refund':lang==='ja'?'一部返金':'부분환불' };
  }
  if(s==='refunded' || s==='duplicate_refunded' || s.includes('refund')){
    return { key:'refund', label: lang==='en'?'Refunded':lang==='ja'?'返金':'전액환불' };
  }
  if(s==='cancelled' || s==='canceled'){
    return { key:'refund', label: lang==='en'?'Canceled':lang==='ja'?'キャンセル':'취소' };
  }
  if(s==='failed'){
    return { key:'failed', label: lang==='en'?'Failed':lang==='ja'?'失敗':'실패' };
  }
  if(s==='pending' || s==='created' || s==='open'){
    return { key:'pending', label: lang==='en'?'Pending':lang==='ja'?'処理中':'대기' };
  }
  return { key:'other', label: o?.status ? String(o.status) : '-' };
}

function accountOrdersCardHtml(){
  const title = 'Payment history';
  const count = accountOrdersStatus==='ok' && accountOrderRows.length
    ? `<span class="account-orders-count">${accountOrderRows.length}${lang==='en'?' receipts':lang==='ja'?'件':'건'}</span>`
    : '';
  let body = '';
  if(accountOrdersStatus==='error'){
    body = `<p class="muted account-orders-empty">${esc(lang==='en'?'Could not load payment history.':lang==='ja'?'支払い履歴を読み込めませんでした。':'결제 내역을 불러오지 못했습니다.')}</p>`;
  } else if(accountOrdersStatus!=='ok'){
    body = `<p class="muted account-orders-empty">${esc(lang==='en'?'Loading payment history…':lang==='ja'?'支払い履歴を読み込み中…':'결제 내역을 불러오는 중...')}</p>`;
  } else if(!accountOrderRows.length){
    const buy = lang==='en'?'View plans':lang==='ja'?'利用券を見る':'이용권 보기';
    body = `<p class="muted account-orders-empty">${esc(lang==='en'?'No payments yet.':lang==='ja'?'支払い履歴はまだありません。':'결제 내역이 없습니다.')}</p>
      <div class="account-panel-actions"><a class="secondary mini-btn account-btn account-btn-secondary" href="./purchase.html">${esc(buy)}</a></div>`;
  } else {
    body = `<ul class="account-orders-list">${accountOrderRows.map(o=>{
      const st=accountOrderStatusInfo(o);
      const when=fmtListDate(o.completedAt || o.verifiedAt || o.issuedAt || o.createdAt || o.updatedAt);
      const method=accountOrderMethodLabel(o);
      const meta=[when, method].filter(v=>v && v!=='-').join(' · ');
      return `<li class="account-order-row">
        <div class="account-order-main">
          <b>${esc(accountOrderProductLabel(o))}</b>
          <span>${esc(meta || '-')}</span>
        </div>
        <div class="account-order-side">
          <strong>${esc(accountOrderAmountLabel(o))}</strong>
          <em class="account-order-status is-${esc(st.key)}">${esc(st.label)}</em>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }
  return `<article class="hub-card account-panel account-panel-orders account-panel-full" id="accountOrdersPanel">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">▣</span><h2>${esc(title)}</h2>${count}</header>
    <div class="account-panel-body" id="accountOrdersBody">${body}</div>
  </article>`;
}

function paintAccountOrdersPanel(){
  const panel=$('accountOrdersPanel');
  if(!panel) return;
  const wrap=document.createElement('div');
  wrap.innerHTML=accountOrdersCardHtml();
  const next=wrap.firstElementChild;
  if(next) panel.replaceWith(next);
}

async function loadAccountOrders(uid){
  if(!uid || !db || !firestoreApi) return;
  if(accountOrdersUid===uid && (accountOrdersStatus==='ok' || accountOrdersStatus==='loading')) return;
  accountOrdersUid = uid;
  accountOrdersStatus = 'loading';
  accountOrderRows = [];
  paintAccountOrdersPanel();
  try{
    const {collection, query, where, getDocs, limit}=firestoreApi;
    const base=[collection(db,'orders'), where('uid','==', uid)];
    const q = typeof limit==='function' ? query(...base, limit(40)) : query(...base);
    const snap=await getDocs(q);
    if(currentUser?.uid !== uid) return;
    accountOrderRows = snap.docs
      .map(d=>({id:d.id, ...d.data()}))
      .filter(accountOrderVisible)
      .sort((a,b)=>accountOrderWhenMs(b)-accountOrderWhenMs(a))
      .slice(0, 20);
    accountOrdersStatus = 'ok';
  }catch(err){
    console.warn('account orders', err);
    if(currentUser?.uid !== uid) return;
    accountOrdersStatus = 'error';
    accountOrderRows = [];
  }
  paintAccountOrdersPanel();
}

function accountLoginMethodLabel(){
  const providers = currentUser?.providerData || [];
  if(providers.some(p=>String(p?.providerId||'').includes('google'))) return 'Google';
  if(providers.length) return providers[0].providerId || 'Google';
  return 'Google';
}

function accountLicensePlanLabel(d){
  const plan=normalizePlan(d);
  if(plan==='lifetime') return lang==='en' ? 'Lifetime Full' : lang==='ja' ? 'Lifetime Full' : 'Lifetime Full';
  if(plan==='period'){
    const pid = String(d?.passProductId || '').toUpperCase();
    if(pid === 'PASS_7D') return lang==='en' ? '7-Day Full' : lang==='ja' ? '7日 Full' : '7일 Full';
    if(pid === 'PASS_30D') return lang==='en' ? '30-Day Full' : lang==='ja' ? '30日 Full' : '30일 Full';
    if(pid === 'PASS_90D') return lang==='en' ? '90-Day Full' : lang==='ja' ? '90日 Full' : '90일 Full';
    return lang==='en' ? 'Full Pass' : lang==='ja' ? '期間 Full' : '기간 Full';
  }
  return lang==='en' ? 'Free trial' : lang==='ja' ? '無料体験' : '무료 체험';
}

function accountLicensePlanTitle(d){
  const plan=normalizePlan(d);
  if(plan==='lifetime') return 'Lifetime Full';
  if(plan==='period'){
    const label = accountLicensePlanLabel(d);
    const end = d?.expiresAt ? fmtListDate(d.expiresAt) : '';
    const leftMs = licenseTsMs(d?.expiresAt) - Date.now();
    const leftDays = leftMs > 0 ? Math.ceil(leftMs / 86400000) : 0;
    if(lang==='en') return end ? `${label} · ${leftDays}d left · until ${end}` : label;
    if(lang==='ja') return end ? `${label} · 残り${leftDays}日 · ${end}まで` : label;
    return end ? `${label} · 남은 ${leftDays}일 · ${end}까지` : label;
  }
  return lang==='en' ? 'Free trial' : lang==='ja' ? '無料体験' : '무료 체험';
}

function accountLicenseStatusLabel(d){
  const status=normalizeStatus(d);
  if(status==='banned') return lang==='en' ? 'Banned' : lang==='ja' ? 'ブロック' : '차단';
  if(status==='expired') return lang==='en' ? 'Expired' : lang==='ja' ? '期限切れ' : '만료';
  return lang==='en' ? 'Active' : lang==='ja' ? '有効' : '활성';
}

function accountRoleLabel(){
  const role=normalizeRole(currentUserDoc?.role || (isAdminUser?'admin':'user'));
  if(role==='admin') return lang==='en' ? 'Admin' : lang==='ja' ? '管理者' : '관리자';
  return lang==='en' ? 'User' : lang==='ja' ? 'ユーザー' : '사용자';
}

function accountDateValue(d){
  const src = d?.startsAt || d?.purchasedAt || d?.createdAt || currentUserDoc?.createdAt || d?.updatedAt;
  return src ? fmtListDate(src) : '-';
}

function accountExpiryValue(d){
  const plan=normalizePlan(d);
  if(plan==='lifetime') return lang==='en' ? 'No time limit' : lang==='ja' ? '期限なし' : '기간 제한 없음';
  if(d?.expiresAt) return fmtListDate(d.expiresAt);
  return '-';
}

function accountDateLabel(d){
  const plan=normalizePlan(d);
  if(plan==='trial') return lang==='en' ? 'Joined' : lang==='ja' ? '登録日' : '가입일';
  return lang==='en' ? 'Purchased' : lang==='ja' ? '購入日' : '구매일';
}

function accountProfileBadgesHtml(d){
  const status=normalizeStatus(d);
  const plan=normalizePlan(d);
  const statusLabel=accountLicenseStatusLabel(d);
  const planLabel=accountLicensePlanLabel(d);
  return `<span class="account-chip is-status-${esc(status)}">${esc(statusLabel)}</span><span class="account-chip is-plan-${esc(plan)}">${esc(planLabel)}</span>`;
}

function updateAccountProfileBadges(d){
  const box=$('accountProfileBadges');
  if(!box) return;
  if(!currentUser || !d){
    box.innerHTML = `<span class="account-chip is-pending">${esc(tr('license_wait'))}</span>`;
    return;
  }
  box.innerHTML = accountProfileBadgesHtml(d);
}

function creditPurchaseHref(){
  // Credit packs are discontinued for sale; CTA routes to Pass / Lifetime purchase.
  return lifetimePurchaseHref();
}

function lifetimePurchaseHref(){
  // Already on a locale purchase document: keep same folder (never hop ko↔en↔ja).
  if(isPurchasePage) return './purchase.html';
  const preferred = readSavedSiteLang() || lang;
  const use = ['ko','en','ja'].includes(preferred) ? preferred : 'ko';
  const base = window.MIDIAI_BASE_PATH || './';
  if(use==='en') return `${base}en/purchase.html`;
  if(use==='ja') return `${base}ja/purchase.html`;
  return `${base}purchase.html`;
}

function localeHomeHref(nextLang){
  const use = (typeof normalizeSiteLang === 'function')
    ? normalizeSiteLang(nextLang || readSavedSiteLang() || lang)
    : (['ko','en','ja'].includes(nextLang) ? nextLang : (readSavedSiteLang() || lang || 'ko'));
  const base = window.MIDIAI_BASE_PATH || './';
  if(use === 'en') return `${base}en/`;
  if(use === 'ja') return `${base}ja/`;
  return `${base}index.html`;
}

function isSiteHomePage(){
  const p = pathLower.replace(/\/+$/, '') || '/';
  return page === 'index.html' || p === '' || p === '/' || p === '/en' || p === '/ja' || p === '/ko' || /\/(en|ja|ko)$/i.test(p);
}

function accountPageHref(hash){
  const base = window.MIDIAI_BASE_PATH || './';
  return `${base}account.html${hash || ''}`;
}

function updateAccountCtas({plan, lifetime, downloadUrl}){
  const el=$('accountHeroCta');
  const creditEl=$('accountHeroCreditCta');
  const isLife = !!(lifetime || plan==='lifetime');
  const isPeriod = plan === 'period';
  // Public: never expose Credit purchase CTA (button reused as Full Pass CTA when needed).
  if(creditEl){
    if(currentUser && !isLife && !isPeriod && !isAdminUser){
      creditEl.classList.remove('hidden');
      creditEl.textContent = lang==='en' ? 'View plans' : lang==='ja' ? '利用券を見る' : '이용권 보기';
      creditEl.setAttribute('href', lifetimePurchaseHref());
    } else {
      creditEl.classList.add('hidden');
    }
  }
  if(!el) return;
  el.classList.remove('hidden', 'is-status');
  el.removeAttribute('target');
  el.removeAttribute('rel');
  el.removeAttribute('aria-disabled');
  if(isAdminUser){
    el.textContent = lang==='en' ? 'Admin page' : lang==='ja' ? '管理ページ' : '관리자 페이지';
    el.setAttribute('href', './admin.html');
    return;
  }
  if(isLife){
    el.textContent = lang==='en' ? 'Lifetime Full' : lang==='ja' ? 'Lifetime Full' : 'Lifetime Full';
    el.classList.add('is-status');
    el.setAttribute('href', accountPageHref('#plan'));
    el.setAttribute('aria-disabled', 'true');
    return;
  }
  if(isPeriod){
    el.textContent = lang==='en' ? 'Manage plan' : lang==='ja' ? '利用券を管理' : '이용권 관리';
    el.setAttribute('href', lifetimePurchaseHref());
    return;
  }
  el.textContent = lang==='en' ? 'View plans' : lang==='ja' ? '利用券を見る' : '이용권 보기';
  el.setAttribute('href', lifetimePurchaseHref());
}

function accountSupportDiscordHref(){
  const url = String(CONFIG?.supportDiscordUrl || '').trim();
  return url || './support.html';
}

let creditAccountState = {
  uid: '',
  balance: null,
  items: null,
  nextPageToken: '',
  fetchedAt: 0,
  error: false,
  loading: false,
  fetchSeq: 0
};
let creditFocusAt = 0;

function emptyCreditState(){
  return { uid:'', balance:null, items:null, nextPageToken:'', fetchedAt:0, error:false, loading:false, fetchSeq:0 };
}

function logWebCreditState(source, oldVal, newVal, extra={}){
  try{
    const enabled = String(localStorage.getItem('midiai_web_credit_log') || '1') !== '0';
    if(!enabled) return;
    const line = {
      t: Date.now(),
      source: String(source || ''),
      old: oldVal,
      new: newVal,
      uid: String(currentUser?.uid || '').slice(0, 12),
      ...extra
    };
    console.info('[WEB_CREDIT_STATE]', line);
  }catch(_){}
}

function extractOwnCreditBalance(payload){
  return extractCreditBalance(payload, null);
}

function applyOwnCreditBalance(nextBalance, { source='', seq=null }={}){
  if(seq != null && Number(seq) !== Number(creditAccountState.fetchSeq)){
    logWebCreditState(source || 'stale_discard', creditAccountState.balance, nextBalance, { seq, applied:false });
    return false;
  }
  const oldVal = creditAccountState.balance;
  creditAccountState.balance = nextBalance;
  creditAccountState.fetchedAt = Date.now();
  creditAccountState.error = false;
  logWebCreditState(source || 'apply', oldVal, nextBalance, { seq, applied:true });
  return true;
}

function resetCreditAccountState(){
  creditAccountState = emptyCreditState();
  closeCreditHistoryModal();
  paintProfileCreditStrip();
}

function currentAccountIsLifetime(){
  return isLifetimeLicense(accountLicenseDoc) || currentLicenseLifetime === true;
}

function sanitizeCreditDisplayTitle(raw){
  let text = String(raw || '').replace(/\\/g, '/').trim();
  if(!text) return '';
  if(/^[A-Za-z]:\//.test(text) || text.startsWith('/Users/') || text.startsWith('/home/') || text.includes('/Users/') || text.includes('/home/')){
    text = text.split('/').filter(Boolean).pop() || text;
  } else if(text.includes('/') && /\.(mp3|wav|mid|midi|pdf|mp4|m4a|flac|ogg)$/i.test(text)){
    text = text.split('/').filter(Boolean).pop() || text;
  }
  text = text.replace(/\b(jobId|paymentId|uid)\s*[:=]\s*\S+/ig, '').trim();
  return text.slice(0, 120);
}

function fmtCreditStamp(v){
  try{
    const ms = licenseTsMs(v);
    if(!ms) return '—';
    const d = new Date(ms);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{
    return '—';
  }
}

function formatCreditDelta(amount){
  const n = Number(amount);
  if(!Number.isFinite(n) || n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function creditBalanceText(balance){
  if(balance == null || balance === '') return '—';
  const n = Number(balance);
  if(!Number.isFinite(n)) return '—';
  return `${n} Credits`;
}

function creditLedgerTitle(item){
  const type = String(item?.type || '').toLowerCase();
  const title = sanitizeCreditDisplayTitle(item?.displayTitle || '');
  if(type === 'refund') return tr('credit_ledger_refund');
  if(type === 'admin_grant' || type === 'admin_bulk_credit') return title || tr('credit_ledger_grant');
  if(type === 'admin_deduct' || type === 'admin_bulk_deduct') return title || tr('credit_ledger_deduct');
  if(type === 'purchase') return title || tr('credit_ledger_purchase');
  return title || tr('credit_ledger_conversion');
}

async function callOwnCreditJson(names, payload, freshToken){
  if(!currentUser) throw new Error('need_login');
  const base = String(CONFIG.functionsBaseUrl || '').replace(/\/$/, '');
  if(!base || base.includes('PASTE_')) throw new Error('functions_url');
  const token = await currentUser.getIdToken(!!freshToken);
  let lastErr = null;
  for(const name of names){
    try{
      const res = await fetch(`${base}/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload || {})
      });
      const text = await res.text();
      let data = {};
      try{ data = text ? JSON.parse(text) : {}; }catch{ data = {}; }
      if(res.status === 404){
        lastErr = new Error('404');
        continue;
      }
      if(!res.ok){
        throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, data });
      }
      const uid = String(data.uid || '');
      if(uid && currentUser && uid !== currentUser.uid) throw new Error('uid_mismatch');
      return data;
    }catch(err){
      lastErr = err;
      if(Number(err?.status) === 404) continue;
      throw err;
    }
  }
  throw lastErr || new Error('credit_failed');
}

async function fetchOwnCreditBalance(freshToken){
  const data = await callOwnCreditJson(['getCreditBalance', 'getPointBalance'], {}, freshToken);
  const n = extractOwnCreditBalance(data);
  return n == null ? 0 : n;
}

async function fetchOwnCreditLedger({limit=5, pageToken='', freshToken=false}={}){
  const data = await callOwnCreditJson(
    ['listCreditLedger', 'listPointLedger'],
    { limit: Math.max(1, Math.min(Number(limit) || 5, 50)), pageToken: String(pageToken || '') },
    freshToken
  );
  const items = Array.isArray(data.items) ? data.items : [];
  return { items, nextPageToken: String(data.nextPageToken || '') };
}

function paintProfileCreditStrip(){
  ensureTopbarProfileCreditSlot();
  const box = $('topbarProfileCredit');
  if(!box) return;
  const signedIn = !!currentUser;
  box.hidden = !signedIn;
  if(!signedIn){
    box.innerHTML = '';
    return;
  }
  const d = accountLicenseDoc;
  const plan = normalizePlan(d);
  const active = isLicenseCurrentlyActive(d);
  const buyHref = lifetimePurchaseHref();
  const accountHref = accountPageHref('#plan');
  const kicker = lang==='en' ? 'Current plan' : lang==='ja' ? '現在の利用券' : '현재 이용권';
  const bal = creditAccountState.balance;
  const resolvedBal = bal != null && bal !== '' && Number.isFinite(Number(bal));
  const showBal = resolvedBal && Number(bal) > 0;
  const balHtml = resolvedBal
    ? `<span class="topbar-profile-credit-balance">${esc(creditBalanceText(bal))}</span>`
    : '';
  if(plan === 'lifetime' && active){
    box.innerHTML = `<a class="topbar-profile-credit-main" href="${esc(accountHref)}">
      <span class="topbar-profile-credit-kicker">${esc(kicker)}</span>
      <strong>Lifetime Full</strong>
      <span>${esc(lang==='en' ? 'No time limit' : lang==='ja' ? '期限なし' : '기간 제한 없음')}</span>
      ${balHtml}
    </a>`;
    return;
  }
  if(plan === 'period' && active){
    const label = accountLicensePlanLabel(d);
    const end = d?.expiresAt ? fmtListDate(d.expiresAt) : '';
    const detail = end
      ? (lang==='en' ? `Until ${end}` : lang==='ja' ? `${end}まで` : `${end}까지`)
      : '';
    box.innerHTML = `<a class="topbar-profile-credit-main" href="${esc(accountHref)}">
      <span class="topbar-profile-credit-kicker">${esc(kicker)}</span>
      <strong>${esc(label)}</strong>
      ${detail ? `<span>${esc(detail)}</span>` : ''}
      ${balHtml}
    </a>`;
    return;
  }
  if(showBal){
    box.innerHTML = `<a class="topbar-profile-credit-main" href="${esc(accountHref)}">
      <span class="topbar-profile-credit-kicker">${esc(lang==='en' ? 'Credits' : lang==='ja' ? 'クレジット' : '보유 크레딧')}</span>
      <strong>${esc(creditBalanceText(bal))}</strong>
      <span>${esc(lang==='en' ? '1 Credit per AI conversion' : lang==='ja' ? 'AI変換1回=1クレジット' : 'AI 변환 1회 = 1 크레딧')}</span>
    </a>
    <a class="topbar-profile-credit-buy" href="${esc(buyHref)}">${esc(lang==='en' ? 'View plans' : lang==='ja' ? '利用券を購入' : '이용권 구매')}</a>`;
    return;
  }
  box.innerHTML = `<a class="topbar-profile-credit-main" href="${esc(accountHref)}">
      <span class="topbar-profile-credit-kicker">${esc(kicker)}</span>
      <strong>${esc(lang==='en' ? 'Free trial' : lang==='ja' ? '無料体験' : '무료 체험')}</strong>
    </a>
    <a class="topbar-profile-credit-buy" href="${esc(buyHref)}">${esc(lang==='en' ? 'View plans' : lang==='ja' ? '利用券を購入' : '이용권 구매')}</a>`;
}

function accountCreditCardHtml(){
  const bal = creditAccountState.balance;
  const showBal = bal != null && bal !== '' && Number.isFinite(Number(bal));
  if(!showBal) return '';
  const kicker = lang==='en' ? 'Credits' : lang==='ja' ? 'クレジット' : '보유 크레딧';
  const historyLabel = lang==='en' ? 'Credit history' : lang==='ja' ? 'クレジット履歴' : '사용 내역';
  return `<article class="hub-card account-panel account-panel-credit" id="accountCreditPanel">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">◆</span><h2>Credit</h2></header>
    <div class="account-panel-body" id="accountCreditBody">
      <p class="account-credit-kicker">${esc(kicker)}</p>
      <p class="account-license-title">${esc(creditBalanceText(bal))}</p>
      <div class="account-panel-actions">
        <button type="button" class="secondary mini-btn account-btn account-btn-secondary" id="accountCreditHistoryBtn">${esc(historyLabel)}</button>
      </div>
    </div>
  </article>`;
}

function paintAccountCreditPanel(){
  const grid = $('accountMeta')?.querySelector('.account-dashboard-grid');
  if(!grid) return;
  const html = accountCreditCardHtml();
  const existing = $('accountCreditPanel');
  if(!html){
    existing?.remove();
    return;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const next = wrap.firstElementChild;
  if(!next) return;
  if(existing) existing.replaceWith(next);
  else {
    const accountPanel = grid.querySelector('.account-panel-account');
    if(accountPanel) accountPanel.after(next);
    else {
      const orders = $('accountOrdersPanel');
      if(orders) orders.before(next);
      else grid.append(next);
    }
  }
  bindAccountCreditCard();
}

function bindAccountCreditCard(){
  const btn = $('accountCreditHistoryBtn');
  if(!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', ()=> openCreditHistoryModal());
}

function onCreditHistoryEsc(e){
  if(e.key === 'Escape') closeCreditHistoryModal();
}

function closeCreditHistoryModal(){
  document.documentElement.classList.remove('credit-history-open');
  document.removeEventListener('keydown', onCreditHistoryEsc);
  const backdrop = $('creditHistoryBackdrop');
  if(backdrop) backdrop.remove();
}

function openCreditHistoryModal(){
  closeCreditHistoryModal();
  if(!currentUser){
    alert(tr('need_login') || '로그인이 필요합니다.');
    return;
  }
  const title = lang==='en' ? 'Credit history' : lang==='ja' ? 'クレジット履歴' : 'Credit 사용 내역';
  const balLabel = lang==='en' ? 'Current balance' : lang==='ja' ? '現在の残高' : '현재 잔액';
  const backdrop = document.createElement('div');
  backdrop.id = 'creditHistoryBackdrop';
  backdrop.className = 'credit-history-backdrop';
  backdrop.innerHTML = `<div class="credit-history-modal" role="dialog" aria-modal="true" aria-labelledby="creditHistoryTitle">
    <header class="credit-history-head">
      <h3 id="creditHistoryTitle">${esc(title)}</h3>
      <button type="button" class="credit-history-x" id="creditHistoryClose" aria-label="${esc(lang==='en' ? 'Close' : lang==='ja' ? '閉じる' : '닫기')}">×</button>
    </header>
    <div class="credit-history-balance">
      <span class="credit-history-balance-label">${esc(balLabel)}</span>
      <strong class="credit-history-balance-value" id="creditHistoryBalance">${esc(creditBalanceText(creditAccountState.balance))}</strong>
    </div>
    <div class="credit-history-body" id="creditHistoryList"><p class="muted small">${esc(lang==='en' ? 'Loading…' : '불러오는 중…')}</p></div>
  </div>`;
  document.documentElement.appendChild(backdrop);
  document.documentElement.classList.add('credit-history-open');
  document.addEventListener('keydown', onCreditHistoryEsc);
  backdrop.addEventListener('click', (e)=>{ if(e.target === backdrop) closeCreditHistoryModal(); });
  $('creditHistoryClose')?.addEventListener('click', closeCreditHistoryModal);
  loadCreditHistoryModal();
}

function creditHistoryRowsHtml(items){
  const rows = Array.isArray(items) ? items : [];
  if(!rows.length){
    return `<p class="muted small">${esc(lang==='en' ? 'No credit history yet.' : lang==='ja' ? '履歴がありません。' : '사용 내역이 없습니다.')}</p>`;
  }
  return `<ul class="credit-history-ul">${rows.map((item)=>{
    const amt = Number(item?.amount || 0);
    const deltaClass = amt > 0 ? 'is-plus' : amt < 0 ? 'is-minus' : '';
    return `<li>
      <span class="credit-history-when">${esc(fmtCreditStamp(item?.createdAt))}</span>
      <span class="credit-history-title">${esc(creditLedgerTitle(item))}</span>
      <strong class="credit-history-delta ${deltaClass}">${esc(formatCreditDelta(amt))}</strong>
    </li>`;
  }).join('')}</ul>`;
}

async function loadCreditHistoryModal(){
  const list = $('creditHistoryList');
  if(!list) return;
  try{
    const { items } = await fetchOwnCreditLedger({ limit: 30, freshToken: false });
    creditAccountState.items = items;
    list.innerHTML = creditHistoryRowsHtml(items);
  }catch(err){
    list.innerHTML = `<p class="muted small">${esc(err?.message || 'failed')}</p>`;
  }
}

async function refreshOwnCredits({ freshToken=false, ledger=false, reason='' }={}){
  if(!currentUser){
    resetCreditAccountState();
    return;
  }
  const uid = currentUser.uid;
  if(creditAccountState.uid && creditAccountState.uid !== uid){
    creditAccountState = emptyCreditState();
    paintProfileCreditStrip();
  }
  creditAccountState.uid = uid;
  creditAccountState.fetchSeq = Number(creditAccountState.fetchSeq || 0) + 1;
  const mySeq = creditAccountState.fetchSeq;
  creditAccountState.loading = true;
  if(isPurchasePage) renderPurchaseTrialRow();
  try{
    const bal = await fetchOwnCreditBalance(freshToken);
    if(!currentUser || currentUser.uid !== uid) return;
    if(!applyOwnCreditBalance(bal, { source: reason || 'refresh', seq: mySeq })) return;
    if(ledger){
      try{
        const data = await fetchOwnCreditLedger({ limit: 10, freshToken: false });
        if(currentUser && currentUser.uid === uid && mySeq === creditAccountState.fetchSeq){
          creditAccountState.items = data.items;
        }
      }catch(_){ /* history optional */ }
    }
  }catch(err){
    console.warn('credit refresh', reason, err);
    if(!currentUser || currentUser.uid !== uid) return;
    if(mySeq === creditAccountState.fetchSeq) creditAccountState.error = true;
  }finally{
    if(currentUser && currentUser.uid === uid && mySeq === creditAccountState.fetchSeq){
      creditAccountState.loading = false;
    }
    paintProfileCreditStrip();
    if(isPurchasePage) renderPurchaseTrialRow();
    if($('accountMeta')) paintAccountCreditPanel();
  }
}

function bindCreditAccountListeners(){
  if(document.body.dataset.creditAccountBound === '1') return;
  document.body.dataset.creditAccountBound = '1';
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState !== 'visible' || !currentUser) return;
    const now = Date.now();
    if(now - creditFocusAt < 2500) return;
    creditFocusAt = now;
    refreshOwnCredits({ freshToken:true, ledger: !!$('accountMeta'), reason:'focus' });
  });
  window.addEventListener('focus', ()=>{
    if(!currentUser) return;
    const now = Date.now();
    if(now - creditFocusAt < 2500) return;
    creditFocusAt = now;
    refreshOwnCredits({ freshToken:true, ledger: !!$('accountMeta'), reason:'window-focus' });
  });
}

function ensureTopbarProfileCreditSlot(){
  const panel = $('topbarProfilePanel');
  if(!panel) return;
  if($('topbarProfileCredit')) return;
  const slot = document.createElement('div');
  slot.id = 'topbarProfileCredit';
  slot.className = 'topbar-profile-credit';
  slot.hidden = true;
  const links = panel.querySelector('.topbar-profile-links');
  if(links) panel.insertBefore(slot, links);
  else panel.appendChild(slot);
}

function renderAccountDashboard(uid, d, downloadData){
  const box = $('accountMeta'); if(!box) return;
  if(!currentUser){
    box.innerHTML = `<div class="account-login-card hub-card"><p class="muted">${esc(tr('need_login'))}</p></div>`;
    updateAccountCtas({plan:'trial', lifetime:false, downloadUrl:''});
    updateAccountProfileBadges(null);
    return;
  }
  const plan = normalizePlan(d);
  const lifetime = isLifetimeLicense(d) || (plan==='lifetime' && normalizeStatus(d)==='active');
  const downloadUrl = downloadData?.url || '';
  const planTitle = accountLicensePlanTitle(d);
  const statusLabel = accountLicenseStatusLabel(d);
  const roleLabel = accountRoleLabel();
  const dateLabel = accountDateLabel(d);
  const dateValue = accountDateValue(d);
  const expiryValue = accountExpiryValue(d);
  const name = currentUser.displayName || 'Google User';
  const email = currentUser.email || '-';
  const loginMethod = accountLoginMethodLabel();
  const discordHref = accountSupportDiscordHref();

  updateAccountCtas({plan, lifetime, downloadUrl});
  updateAccountProfileBadges(d);

  const licenseCard = `<article class="hub-card account-panel account-panel-license">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">♙</span><h2>License</h2></header>
    <div class="account-panel-body">
      <p class="account-license-title is-plan-${esc(plan)}">${esc(planTitle)}</p>
      ${accountField(lang==='en'?'Role':lang==='ja'?'権限':'권한', roleLabel)}
      ${accountField(lang==='en'?'Status':lang==='ja'?'状態':'상태', statusLabel)}
      ${accountField(dateLabel, dateValue)}
      ${accountField(lang==='en'?'Expires':lang==='ja'?'有効期限':'만료일', expiryValue)}
    </div>
  </article>`;

  const accountCard = `<article class="hub-card account-panel account-panel-account">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">♟</span><h2>Account</h2></header>
    <div class="account-panel-body">
      ${accountField(lang==='en'?'Name':lang==='ja'?'名前':'이름', name)}
      ${accountField(lang==='en'?'Email':lang==='ja'?'メール':'이메일', email)}
      ${accountField(lang==='en'?'Sign-in':lang==='ja'?'ログイン方式':'로그인 방식', loginMethod)}
    </div>
  </article>`;

  const supportLabel = lang==='en'?'Support':lang==='ja'?'サポート':'고객센터';
  const contactLabel = lang==='en'?'Contact':lang==='ja'?'お問い合わせ':'문의하기';
  const discordAttrs = discordHref.startsWith('http') ? ' target="_blank" rel="noopener"' : '';

  const ordersCard = accountOrdersCardHtml();

  const supportCard = `<article class="hub-card account-panel account-panel-support account-panel-full">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">💬</span><h2>Support</h2></header>
    <div class="account-panel-body account-support-grid">
      <a class="account-support-link" href="./support.html">${esc(supportLabel)}</a>
      <a class="account-support-link" href="./faq.html">FAQ</a>
      <a class="account-support-link" href="${esc(discordHref)}"${discordAttrs}>Discord</a>
      <a class="account-support-link" href="./support.html">${esc(contactLabel)}</a>
    </div>
  </article>`;

  let developerCard = '';
  if(isAdminUser){
    const syncAt = currentUserDoc?.lastLogin || currentUserDoc?.lastSeenAt || d?.updatedAt || '';
    const syncLabel = lang==='en'?'Last sync':lang==='ja'?'最終同期':'마지막 동기화';
    const devTitle = lang==='en' ? 'Developer Console' : lang==='ja' ? 'Developer Console' : '관리자 전용 정보';
    developerCard = `<article class="hub-card account-panel account-panel-developer account-panel-full">
      <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">🛠</span><h2>${esc(devTitle)}</h2></header>
      <div class="account-panel-body account-dev-grid">
        ${accountField('UID', uid)}
        ${accountField('Role', normalizeRole(currentUserDoc?.role || 'admin'))}
        ${accountField('Method', d?.method || '-')}
        ${accountField('Firestore ID', `licenses/${uid}`)}
        ${accountField(syncLabel, syncAt ? fmtCompactDateTime(syncAt) : '-')}
        ${accountField('Plan (raw)', d?.plan || '-')}
        ${accountField('Status (raw)', d?.status || '-')}
        ${accountField('Licensed', d?.licensed===true ? 'true' : 'false')}
      </div>
    </article>`;
  }

  box.innerHTML = `<div class="account-dashboard-grid">${licenseCard}${accountCard}${ordersCard}${supportCard}${developerCard}</div>`;
  paintAccountCreditPanel();
  bindCreditAccountListeners();
  loadAccountOrders(uid);
  if(location.hash === '#credit' || location.hash === '#plan'){
    queueMicrotask(()=> $('accountCreditPanel')?.scrollIntoView({behavior:'smooth', block:'start'}));
  } else if(location.hash === '#orders' || location.hash === '#payments'){
    queueMicrotask(()=> $('accountOrdersPanel')?.scrollIntoView({behavior:'smooth', block:'start'}));
  }
}

async function fetchAccountDownloadData(){
  if(latestDownloadData) return latestDownloadData;
  if(!db || !firestoreApi) return null;
  try{
    const {doc,getDoc}=firestoreApi;
    const snap=await getDoc(doc(db,'downloads','latest'));
    if(snap.exists()){
      latestDownloadData = snap.data();
      return latestDownloadData;
    }
  }catch(e){ console.warn('account download fetch', e); }
  return null;
}

async function setAuthUiSignedIn(user){
  if(creditAccountState.uid && creditAccountState.uid !== user.uid){
    resetCreditAccountState();
  }
  currentUser=user;
  creditAccountState.uid = user.uid;
  creditAccountState.balance = null;
  creditAccountState.items = null;
  creditAccountState.error = false;
  creditAccountState.fetchSeq = Number(creditAccountState.fetchSeq || 0) + 1;
  paintProfileCreditStrip();
  const name=user.displayName||'Google User';
  const email=user.email||'';
  const avatar=(user.displayName||user.email||'?').slice(0,1).toUpperCase();
  const avatarEl=$('avatar');
  if (avatarEl){
    if(user.photoURL){
      avatarEl.innerHTML=`<img src="${esc(user.photoURL)}" alt="" width="56" height="56" loading="lazy" referrerpolicy="no-referrer">`;
      avatarEl.classList.add('has-photo');
    }else{
      avatarEl.textContent=avatar;
      avatarEl.classList.remove('has-photo');
    }
  }
  if ($('userName')) $('userName').textContent=name;
  if ($('userEmail')) $('userEmail').textContent=email;
  syncSidebarAuthUi({
    signedIn:true,
    name,
    email,
    avatar,
    licenseClass:'pending',
    licenseText:tr('checking')
  });
  updateTopbarProfile(user);
  syncTopbarProfileAuthUi(true);
  await upsertUser(user);
  recordAccessInfoQuiet();
  await loadLicense(user.uid);
  resumePendingPurchase();
  listenTicketNotifications();
  listenAdminTicketNotifications();
  listenUserNotifications();
  setNotifyBellVisible(true);
  if (page==='my-tickets.html') listenMyTickets();
  if (page==='ticket.html') listenTicketDetail();
  if (page==='board-write.html') initBoardPostEditor();
  if (page==='board-post.html'){ refreshBoardPostActions(); maybeFocusBoardCommentFromQuery(); }
  if (page==='admin.html') {
    if (isAdminUser) {
      unlockAdminPanel();
      listenAdminUsers(); listenAdminTickets();
    } else {
      setAdminGate(`<p>${tr('no_permission')}</p><p class="muted">${tr('admin_required')}</p>`);
    }
  }
  updateBoardPinnedUi();
  syncBoardAdminUi();
  refreshDownloadCard(true);
  updatePurchaseAccountBox();
  updateSupportFormUi();
  if(page==='board.html') applyBoardMineModeUi();
  refreshOwnCredits({ freshToken:true, ledger: !!$('accountMeta'), reason:'signin' });
}

async function upsertUser(user){
  try {
    const {doc,getDoc,setDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'users',user.uid);
    const snap=await getDoc(ref);
    const old=snap.exists()?snap.data():{};
    const data={uid:user.uid,email:user.email||'',displayName:user.displayName||'',photoURL:user.photoURL||'',lastLogin:serverTimestamp(),lastSeenAt:serverTimestamp()};
    if(!snap.exists()){
      data.createdAt=serverTimestamp();
      data.role='user';
    }
    await setDoc(ref,data,{merge:true});
    currentUserDoc={...old,...data};
    userNotifyPrefs = normalizeNotifyPrefs(old.notifyPrefs || data.notifyPrefs || currentUserDoc.notifyPrefs);
    isAdminUser=normalizeRole(old.role || data.role)==='admin';
    setAdminNavVisible(isAdminUser);
    // Reuse accessInfo country for anonymous locale fallback later — never overwrite midiai_lang.
    try{
      const code = currentUserDoc?.accessInfo?.countryCode || old?.accessInfo?.countryCode;
      if(code) cacheAccessCountryCode(code);
    }catch(_){}
    await ensureUserLicenseDoc(user.uid, { role: data.role || old.role || 'user' });
  } catch(e) {
    console.error('user upsert',e);
    isAdminUser=false;
    setAdminNavVisible(false);
  }
}
const ACCESS_INFO_CLIENT_THROTTLE_MS = 30 * 60 * 1000;
const ACCESS_INFO_LS_PREFIX = 'midiai_accessInfo_at:';
function accessInfoLsKey(uid){
  return ACCESS_INFO_LS_PREFIX + String(uid || '');
}
function detectAccessClientType(){
  const ua = navigator.userAgent || '';
  if(/MidiAIStudio|MidiAI Studio|Electron/i.test(ua)) return 'app';
  return 'web';
}
function shouldRecordAccessInfoClient(uid){
  if(!uid) return false;
  const info = currentUserDoc && currentUserDoc.accessInfo;
  const code = String(info && info.countryCode || '').trim().toUpperCase();
  const hasCountry = /^[A-Z]{2}$/.test(code) && code !== 'ZZ' && code !== 'XX';
  try{
    const at = Number(localStorage.getItem(accessInfoLsKey(uid)) || 0);
    const age = at ? Date.now() - at : Infinity;
    if(!hasCountry && !info){
      return age >= 15000;
    }
    if(at && age < ACCESS_INFO_CLIENT_THROTTLE_MS) return false;
  }catch(_){}
  return true;
}
function markAccessInfoClientAttempt(uid, ok){
  if(!uid) return;
  try{
    const value = ok
      ? String(Date.now())
      : String(Date.now() - ACCESS_INFO_CLIENT_THROTTLE_MS + 10*60*1000);
    localStorage.setItem(accessInfoLsKey(uid), value);
    try{ localStorage.removeItem('midiai_accessInfo_at'); }catch(_){}
  }catch(_){}
}
/** Fire-and-forget: never blocks login / license. Server also throttles writes. */
function recordAccessInfoQuiet(){
  const uid = currentUser && currentUser.uid;
  if(!currentUser || !uid || !shouldRecordAccessInfoClient(uid)) return;
  (async ()=>{
    try{
      const base = String(CONFIG.functionsBaseUrl || '').replace(/\/$/, '');
      if(!base || base.includes('PASTE_')) return;
      const token = await currentUser.getIdToken();
      const res = await fetch(`${base}/recordAccessInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          language: String(navigator.language || '').slice(0, 32),
          clientType: detectAccessClientType()
        })
      });
      markAccessInfoClientAttempt(uid, !!res.ok);
      if(res.ok && firestoreApi?.getDoc && db){
        try{
          const {doc,getDoc} = firestoreApi;
          const snap = await getDoc(doc(db,'users',uid));
          const code = snap.exists() ? snap.data()?.accessInfo?.countryCode : '';
          if(code){
            cacheAccessCountryCode(code);
            if(currentUserDoc) currentUserDoc = { ...currentUserDoc, accessInfo: snap.data().accessInfo };
          }
        }catch(_){}
      }
    }catch(e){
      console.warn('recordAccessInfo');
      markAccessInfoClientAttempt(uid, false);
    }
  })();
}
/**
 * Resolve licenses/{uid} without client writes for normal users.
 * Trial create is Cloud Function only (create-if-absent on users/{uid} write).
 * Existing docs are returned as-is — never overwritten with trial.
 */
async function ensureUserLicenseDoc(uid, opts={}){
  if(!uid || !firestoreApi || !db) return null;
  const {doc,getDoc}=firestoreApi;
  const ref=doc(db,'licenses',uid);
  try{
    let snap=await getDoc(ref);
    if(snap.exists()) return snap.data();

    // Wait briefly for ensureTrialLicenseOnUserWrite (create-if-absent).
    const delays = [200, 400, 800, 1200];
    for(const ms of delays){
      await new Promise(r=>setTimeout(r, ms));
      snap=await getDoc(ref);
      if(snap.exists()) return snap.data();
    }
    return null;
  }catch(e){
    console.warn('ensureUserLicenseDoc', e);
    return null;
  }
}
async function loadLicense(uid){
  const badge=$('licenseBadge');
  const sideBadge=$('sidebarLicenseBadge');
  if(badge){ badge.className='badge pending'; badge.textContent=tr('checking'); }
  if(sideBadge){ sideBadge.className='badge sidebar-license-badge pending'; sideBadge.textContent=tr('checking'); }
  try{
    const {doc,getDoc}=firestoreApi;
    const snap=await getDoc(doc(db,'licenses',uid));
    let d=snap.exists()?snap.data():null;
    if(!d){
      d = await ensureUserLicenseDoc(uid);
    }
    // Existing docs (trial/lifetime/period) are never rewritten on login.
    const active=isLicenseCurrentlyActive(d);
    const lifetime=isLifetimeLicense(d);
    const statusKey=normalizeStatus(d);
    currentLicenseActive = active;
    currentLicenseLifetime = lifetime;
    accountLicenseDoc = d;
    if(uid) authorLicenseCache.set(uid, active);
    const licenseClass=statusKey==='active'?'active':(statusKey==='banned'?'none':'none');
    const licenseText=adminLicenseStatusLabel(statusKey);
    if(badge){ badge.className='badge '+licenseClass; badge.textContent=licenseText; }
    if(sideBadge){ sideBadge.className='badge sidebar-license-badge '+licenseClass; sideBadge.textContent=licenseText; }
    const pBadge=$('topbarProfileLicense');
    if(pBadge){ pBadge.hidden=false; pBadge.className='badge topbar-profile-license '+licenseClass; pBadge.textContent=licenseText; }
    updateTopbarLicensePeriod(d);
    updateAccountProfileBadges(d);
    if($('accountMeta')){
      const downloadData = await fetchAccountDownloadData();
      renderAccountDashboard(uid, d, downloadData);
    }
    applyPurchaseModeUi();
    paintProfileCreditStrip();
    refreshOwnCredits({ ledger: !!$('accountMeta'), reason:'license' });
  } catch(e) {
    console.error(e);
    currentLicenseLifetime = false;
    applyPurchaseModeUi();
    if(badge){ badge.className='badge none'; badge.textContent=tr('check_failed'); }
    if(sideBadge){ sideBadge.className='badge sidebar-license-badge none'; sideBadge.textContent=tr('check_failed'); }
    updateTopbarLicensePeriod(null);
    if($('accountMeta') && currentUser) renderAccountDashboard(uid, null, latestDownloadData);
    paintProfileCreditStrip();
    refreshOwnCredits({ ledger: !!$('accountMeta'), reason:'license-fail' });
  }
}

async function initAuth(){
  const clearAuthPending=()=>document.documentElement.classList.remove('auth-pending');
  if(!configuredFirebase()){ console.error('Firebase config missing or invalid',CONFIG.firebase); authStateResolved = true; clearAuthPending(); return; }
  try{
    const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged},fs,st]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js')
    ]);
    const app=initializeApp(CONFIG.firebase);
    auth=getAuth(app);
    firebaseSignOut=signOut;
    db=fs.getFirestore(app);
    storage=st.getStorage(app);
    firestoreApi=fs;
    storageApi=st;
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('email');
    provider.addScope('profile');

    async function loginWithGoogle(){
      if(isInAppBrowser()){
        showOAuthBrowserNotice();
        alert('현재 브라우저에서는 Google 로그인이 제한될 수 있습니다.\n\n카카오톡·디스코드·인스타 내부 브라우저가 아닌 Chrome, Safari 또는 삼성 인터넷에서 다시 열어주세요.');
        return;
      }
      try{
        await signInWithPopup(auth, provider);
      }catch(e){
        if(e.code==='auth/web-storage-unsupported'||e.code==='auth/popup-blocked'||/disallowed_useragent/i.test(String(e.message||''))){
          showOAuthBrowserNotice();
          alert('현재 브라우저에서는 Google 로그인이 제한됩니다.\n\nChrome, Safari 또는 삼성 인터넷에서 다시 열어주세요.');
          return;
        }
        console.error('Google login failed', {
          code:e.code,
          message:e.message,
          origin:location.origin,
          authDomain:CONFIG.firebase && CONFIG.firebase.authDomain,
          apiKeyHead:CONFIG.firebase && CONFIG.firebase.apiKey ? CONFIG.firebase.apiKey.slice(0,10) : ''
        });
        const msg = [
          'Google 로그인 실패',
          '',
          'code: ' + (e.code || 'unknown'),
          'message: ' + (e.message || ''),
          '',
          '확인할 것:',
          '1) Firebase Authentication > 승인된 도메인에 현재 도메인 추가',
          '2) Google Cloud API Key 웹사이트 제한사항에 현재 도메인과 firebaseapp.com 추가',
          '3) assets/js/config.js의 Firebase Web API Key가 실제 Firebase Web App 설정과 일치하는지 확인',
          '',
          'origin: ' + location.origin,
          'authDomain: ' + (CONFIG.firebase && CONFIG.firebase.authDomain || '')
        ].join('\n');
        alert(msg);
      }
    }

    topbarGoogleLogin = loginWithGoogle;
    bindTopbarLoginButton();
    ensureTopbarProfile();
    $('logoutBtn') && ($('logoutBtn').onclick=()=>{ doLogout(); });
    onAuthStateChanged(auth,u=>{
      authStateResolved = true;
      clearAuthPending();
      if(u) setAuthUiSignedIn(u);
      else setAuthUiSignedOut();
    });
    routeLoadPublic();
  }catch(e){
    console.error('initAuth failed', e);
    authStateResolved = true;
    clearAuthPending();
  }
}

function listenDoc(collectionName, documentId, render){
  const {doc,onSnapshot}=firestoreApi;
  return addPublicUnsub(onSnapshot(doc(db,collectionName,documentId), snap => render(snap.exists()?{id:snap.id,...snap.data()}:null), err => { console.error(collectionName, err); render(null, err); }));
}
function listenVisibleDocs(collectionName, render, orderField='createdAt', direction='desc'){
  const {collection,query,where,orderBy,onSnapshot,getDocs}=firestoreApi;
  const q=query(collection(db,collectionName),where('visible','==',true),orderBy(orderField,direction));
  return addPublicUnsub(onSnapshot(q,
    snap => render(snap.docs.map(d=>({id:d.id,...d.data()}))),
    async err => {
      console.warn(collectionName+' realtime failed', err);
      try {
        const q2=query(collection(db,collectionName),where('visible','==',true));
        const s=await getDocs(q2);
        render(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b[orderField]?.seconds||0)-(a[orderField]?.seconds||0)));
      } catch(e) { console.error(e); render([], e); }
    }
  ));
}
function isGuideCmsListPath(){
  const path = location.pathname.replace(/\\/g,'/').toLowerCase();
  return /\/guide\/?(index\.html)?$/.test(path) || path.endsWith('/guide/index.html');
}
async function refreshPublicFxRate(){
  try{
    const base = String(CONFIG.functionsBaseUrl || '').replace(/\/$/, '');
    if(!base || base.includes('PASTE_')) return null;
    const res = await fetch(`${base}/getPublicFxRate`);
    const data = await res.json().catch(()=>({}));
    if(data && data.ok && Number(data.rate) > 0){
      setCatalogFxRate(data.rate);
      return data;
    }
  }catch(err){
    console.warn('public fx', err);
  }
  return null;
}
async function refreshPricingUi(){
  if(!db || !firestoreApi) return;
  try{
    await refreshPublicFxRate();
    await ensurePricing(db, firestoreApi);
    const pricing = getPricingCache();
    const all = pricing.products || [];
    const creditProducts = all.filter((p) => (
      isCreditProductId(p.productId || p.id) || p.type === 'credit_pack'
    ));
    const passProducts = all.filter((p) => {
      const id = String(p.productId || p.id || '').toUpperCase();
      return p.type === 'full_pass'
        || p.entitlement === 'full_pass'
        || isPassProductId(id)
        || id.startsWith('PASS_')
        || id.startsWith('TEST_');
    });
    const starter = starterUnitFromProducts(all);
    if (creditProducts.length) {
      applyPublicCreditCatalog(creditProducts.map((p) => publicProductView(p, pricing.promotions || [], new Date(), lang, starter, all)));
    }
    if (passProducts.length) {
      applyPublicPassCatalog(passProducts.map((p) => publicProductView(p, pricing.promotions || [], new Date(), lang, starter, all)));
      rememberPassCatalogSession();
    } else {
      console.warn('CATALOG_FALLBACK_USED', { reason: 'no_pass_products_in_firestore' });
      hydratePassCatalogFromPublic({ passes: [] });
    }
    updatePurchaseI18n();
    applyPurchaseSellGate();
    // Re-render purchase cards from Firestore-backed catalog (not seed/API fallback).
    if(isPurchasePage){
      markPurchaseStorefrontReady();
      applyPurchaseModeUi();
    }
    maybeShowSalePromo();
  }catch(e){
    console.warn('CATALOG_FALLBACK_USED', { reason: 'ensurePricing_failed', error: String(e?.message || e) });
    console.warn('refreshPricingUi', e);
    if(isPurchasePage && !isPassCatalogReady()){
      useSeedPassFallback('ensurePricing_failed');
      markPurchaseStorefrontReady();
      applyPurchaseModeUi();
    }
  }
}
function routeLoadPublic(){
  if(!db) return;
  if(publicRouteBound) return;
  publicRouteBound = true;
  refreshPricingUi();
  if(['downloads.html','purchase.html'].includes(page) || (page==='index.html' && $('downloadBox')) || (page==='' && $('downloadBox'))) listenDownload();
  if((page==='' || page==='index.html') && !isGuideCmsListPath()) initHomePage();
  if(page==='notices.html') listenAnnouncements();
  if(page==='notice.html') listenNoticeDetail();
  if(page==='patch-notes.html') listenPatchNotes();
  if(page==='patch-note.html') listenPatchDetail();
  if(page==='faq.html') listenFaq();
  if(page==='board.html') listenBoardPosts();
  if(page==='board-post.html') listenBoardPostDetail();
  if(page==='board-write.html') initBoardPostEditor();
}
function downloadAdminPanelHtml(d){
  if(!isAdminUser) return '';
  const toggleLabel = downloadAdminExpanded ? '닫기' : tr('edit');
  const toggle = `<button type="button" class="secondary mini-btn download-admin-toggle" data-dl-admin="toggle">${esc(toggleLabel)}</button>`;
  if(!downloadAdminExpanded) return `<div class="download-admin-bar">${toggle}</div>`;
  const v = d||{};
  return `<div class="download-admin-bar">${toggle}</div>
  <div class="download-admin-panel" role="region" aria-label="다운로드 설정 수정">
    <p class="download-admin-hint">관리자만 보입니다. 저장하면 모든 사용자에게 바로 반영됩니다.</p>
    <div class="download-admin-grid">
      <label class="download-admin-field"><span>버전</span><input id="dlAdminVersion" type="text" value="${esc(v.version||'')}" placeholder="예: 1.5.7" autocomplete="off"></label>
      <label class="download-admin-field"><span>파일명</span><input id="dlAdminFilename" type="text" value="${esc(v.filename||'')}" placeholder="MidiAI Installer.exe" autocomplete="off"></label>
      <label class="download-admin-field download-admin-field-full"><span>다운로드 URL</span><input id="dlAdminUrl" type="url" value="${esc(v.url||'')}" placeholder="https://..." autocomplete="off"></label>
      <label class="download-admin-field download-admin-field-full"><span>업데이트 설명</span><textarea id="dlAdminNotes" rows="6" placeholder="업데이트 설명 (줄바꿈 가능)">${esc(v.notes||v.description||'')}</textarea></label>
      <label class="check download-admin-check"><input id="dlAdminMandatory" type="checkbox" ${v.mandatory?'checked':''}> 필수 업데이트</label>
    </div>
    <div class="download-admin-actions">
      <button type="button" class="primary" data-dl-admin="save">${tt('저장')}</button>
      <button type="button" class="secondary" data-dl-admin="cancel">취소</button>
    </div>
  </div>`;
}
function bindDownloadAdminUi(box){
  if(!box || !isAdminUser) return;
  box.querySelector('[data-dl-admin="toggle"]')?.addEventListener('click',()=>{
    downloadAdminExpanded = !downloadAdminExpanded;
    refreshDownloadCard(true);
  });
  box.querySelector('[data-dl-admin="cancel"]')?.addEventListener('click',()=>{
    downloadAdminExpanded = false;
    refreshDownloadCard(true);
  });
  box.querySelector('[data-dl-admin="save"]')?.addEventListener('click',()=>saveDownloadFromInline());
}
function refreshDownloadCard(force=false){
  if(!$('downloadBox')) return;
  renderDownload(latestDownloadData, {force});
}
function renderDownload(d, opts={}){
  const box=$('downloadBox'); if(!box)return;
  latestDownloadData = d || null;
  if(downloadAdminExpanded && !opts.force && box.querySelector('.download-admin-panel')) return;
  const t = downloadLocaleText();
  const adminHtml = downloadAdminPanelHtml(d);
  if(!d){
    box.innerHTML=`<div class="portal-download-inner download-card-pro portal-download-empty"><div class="download-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></div><div class="portal-download-meta"><h3>MidiAI Studio</h3><p class="muted">${tr('empty')}</p></div><div class="portal-download-actions"><a class="secondary" href="${esc(lifetimePurchaseHref())}">${esc(t.buyLicense)}</a></div></div>${adminHtml}`;
    bindDownloadAdminUi(box);
    return;
  }
  const mandatory = d.mandatory ? `<span class="portal-mandatory-pill">${esc(t.mandatory)}</span>` : '';
  const notes = d.notes||d.description ? `<p class="portal-download-notes">${esc(d.notes||d.description)}</p>` : '';
  box.innerHTML=`<div class="portal-download-inner download-card-pro">
    <div class="download-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg></div>
    <div class="portal-download-meta">
      <div class="download-card-main-row">
        <div class="download-card-line download-card-line-top">
          <div class="portal-download-badges"><span class="portal-version-pill">v${esc(d.version||'-')}</span>${mandatory}<span class="download-platform-pill">Windows</span></div>
          <h3>MidiAI Studio</h3>
        </div>
        <div class="download-card-line download-card-line-bottom">
          <p class="portal-download-file"><span class="download-file-ext">EXE</span>${esc(d.filename||'MidiAI Installer.exe')}</p>
          <div class="download-card-meta-row"><span>${esc(fmtDate(d.releaseDate)||'')}</span><span>${esc(t.officialInstaller)}</span></div>
        </div>
      </div>
      ${notes}
    </div>
    <div class="portal-download-actions">
      ${d.url?`<a class="primary download-cta" href="${esc(d.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>${tr('download')}</span></a>`:''}
      <a class="secondary" href="./patch-notes.html">${esc(t.patchNotes)}</a>
    </div>
  </div>${adminHtml}`;
  bindDownloadAdminUi(box);
}
function listenDownload(){ if(!$('downloadBox')) return; listenDoc('downloads','latest',renderDownload); }
async function persistDownloadLatest({version, filename, url, notes, mandatory}){
  if(!isAdminUser) throw new Error(tr('no_permission'));
  const {doc,setDoc,serverTimestamp}=firestoreApi;
  await setDoc(doc(db,'downloads','latest'),{
    version:String(version||'').trim(),
    filename:String(filename||'').trim(),
    url:String(url||'').trim(),
    notes:String(notes||'').trim(),
    mandatory:!!mandatory,
    releaseDate:serverTimestamp(),
    updatedAt:serverTimestamp()
  },{merge:true});
}
async function saveDownloadFromInline(){
  if(!isAdminUser) return alert(tr('no_permission'));
  const btn = document.querySelector('[data-dl-admin="save"]');
  if(btn){ btn.disabled=true; btn.textContent='저장 중...'; }
  try{
    await persistDownloadLatest({
      version:$('dlAdminVersion')?.value||'',
      filename:$('dlAdminFilename')?.value||'',
      url:$('dlAdminUrl')?.value||'',
      notes:$('dlAdminNotes')?.value||'',
      mandatory:!!$('dlAdminMandatory')?.checked
    });
    downloadAdminExpanded = false;
    refreshDownloadCard(true);
    alert(tr('saved'));
  }catch(e){
    alert(e.message||e);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=tt('저장'); }
  }
}
function renderHomeUpdates(rows, err){
  const box=$('homeUpdates'); if(!box) return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!rows?.length){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<div class="home-updates-list">${rows.map(x=>`<a class="home-update-item" href="./notice.html?id=${encodeURIComponent(x.id)}"><span class="home-update-tag">${x.pinned?tt('공지'):tt('소식')}</span><b>${esc(x.title)}</b><em>${esc(fmtListDate(x.createdAt))}</em></a>`).join('')}</div>`;
}
function renderHomePatches(rows, err){
  const box=$('homePatches'); if(!box) return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!rows?.length){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<div class="home-updates-list">${rows.map(x=>{
    const kind=patchNoteType(x);
    const ver=patchNoteVersion(x);
    const tag=kind==='app' && ver ? `v${esc(ver)}` : (kind==='web' ? 'WEB' : tt('패치'));
    const tagClass=kind==='web' ? 'is-web' : 'is-patch';
    return `<a class="home-update-item" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><span class="home-update-tag ${tagClass}">${tag}</span><b>${esc(x.title)}</b><em>${esc(fmtListDate(x.createdAt))}</em></a>`;
  }).join('')}</div>`;
}
async function initHomePage(){
  if(!db) return;
  const updatesBox=$('homeUpdates');
  const patchesBox=$('homePatches');
  if(updatesBox){
    try{
      const {collection,query,where,orderBy,getDocs,limit}=firestoreApi;
      const q=query(collection(db,'announcements'),where('visible','==',true),orderBy('createdAt','desc'),limit(4));
      const snap=await getDocs(q);
      renderHomeUpdates(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){
      try{
        const {collection,query,where,getDocs}=firestoreApi;
        const snap=await getDocs(query(collection(db,'announcements'),where('visible','==',true)));
        const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.pinned===true)-(a.pinned===true)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))).slice(0,4);
        renderHomeUpdates(rows);
      }catch(e2){ renderHomeUpdates([],e2); }
    }
  }
  if(patchesBox){
    try{
      const {collection,query,where,orderBy,getDocs,limit}=firestoreApi;
      const q=query(collection(db,'patchNotes'),where('visible','==',true),orderBy('createdAt','desc'),limit(4));
      const snap=await getDocs(q);
      renderHomePatches(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){
      try{
        const {collection,query,where,getDocs}=firestoreApi;
        const snap=await getDocs(query(collection(db,'patchNotes'),where('visible','==',true)));
        const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,4);
        renderHomePatches(rows);
      }catch(e2){ renderHomePatches([],e2); }
    }
  }
}
const HUB_LIST_PAGE_SIZE = 10;
const hubListPage = { board: 1, notices: 1 };

function hubPaginate(rows, kind){
  const list = Array.isArray(rows) ? rows : [];
  const pages = Math.max(1, Math.ceil(list.length / HUB_LIST_PAGE_SIZE));
  let page = Number(hubListPage[kind] || 1);
  if(page > pages) page = pages;
  if(page < 1) page = 1;
  hubListPage[kind] = page;
  const start = (page - 1) * HUB_LIST_PAGE_SIZE;
  return { list, page, pages, start, slice: list.slice(start, start + HUB_LIST_PAGE_SIZE), total: list.length };
}
function hubListRowNo(fullList, globalIndex, item){
  if(item?.pinned) return null;
  const totalNormal = fullList.filter(x=>!x.pinned).length;
  const before = fullList.slice(0, globalIndex).filter(x=>!x.pinned).length;
  return totalNormal - before;
}
function hubPagerHtml(kind, page, pages, total){
  if(pages <= 1) return '';
  const maxButtons = 7;
  let from = Math.max(1, page - Math.floor(maxButtons / 2));
  let to = Math.min(pages, from + maxButtons - 1);
  from = Math.max(1, to - maxButtons + 1);
  const nums = [];
  for(let i = from; i <= to; i++) nums.push(i);
  return `<div class="hub-list-pager" data-hub-pager="${esc(kind)}">
    <button type="button" class="ghost mini-btn" data-hub-page="prev" ${page<=1?'disabled':''}>이전</button>
    ${nums.map(n=>`<button type="button" class="ghost mini-btn${n===page?' is-active':''}" data-hub-page="${n}">${n}</button>`).join('')}
    <button type="button" class="ghost mini-btn" data-hub-page="next" ${page>=pages?'disabled':''}>다음</button>
    <span class="hub-list-pager-info muted">${esc(String((page-1)*HUB_LIST_PAGE_SIZE+1))}–${esc(String(Math.min(total, page*HUB_LIST_PAGE_SIZE)))} · ${esc(String(total))}</span>
  </div>`;
}
function bindHubPager(root, kind, onPage){
  const pager = root?.querySelector?.(`[data-hub-pager="${kind}"]`);
  if(!pager || pager.dataset.bound) return;
  pager.dataset.bound = '1';
  pager.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-hub-page]');
    if(!btn || btn.disabled) return;
    const act = btn.getAttribute('data-hub-page');
    const pages = Math.max(1, Number(pager.dataset.pages) || Math.ceil((Number(pager.dataset.total)||0) / HUB_LIST_PAGE_SIZE));
    let next = hubListPage[kind] || 1;
    if(act === 'prev') next -= 1;
    else if(act === 'next') next += 1;
    else next = Number(act) || next;
    next = Math.min(pages, Math.max(1, next));
    if(next === hubListPage[kind]) return;
    hubListPage[kind] = next;
    onPage?.();
  });
}

function noticeFilteredSorted(rows){
  const q=($('boardSearch')?.value||'').trim().toLowerCase();
  let out=(rows||[]).filter(x=>x.visible!==false);
  out.sort((a,b)=>(b.pinned===true)-(a.pinned===true)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  if(!q) return out;
  return out.filter(x=>{
    const hay=[x.title,x.content,noticeAuthor(x),x.email].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function renderAnnouncements(rows, err){
  const list=$('announcementList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(rows) window.__noticeRows = rows;
  const filtered = noticeFilteredSorted(window.__noticeRows || []);
  if(!filtered.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  const { page, pages, start, slice, total } = hubPaginate(filtered, 'notices');
  list.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${slice.map((x,i)=>{
    const globalIndex = start + i;
    const rowNo = hubListRowNo(filtered, globalIndex, x);
    const no = x.pinned
      ? `<div class="hub-col-no is-pinned-no">${esc(tt('공지'))}</div>`
      : `<div class="hub-col-no">${rowNo}</div>`;
    return `<a class="hub-list-row hub-notice-row ${x.pinned?'is-pinned':''}" href="./notice.html?id=${encodeURIComponent(x.id)}">${no}<div class="hub-col-title"><b>${x.pinned?'📌 ':''}<span class="hub-col-title-text">${esc(x.title)}</span></b></div>${authorCellHtml({...x, authorRole:'admin', displayName:noticeAuthor(x)})}<div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`;
  }).join('')}</div>${hubPagerHtml('notices', page, pages, total)}`;
  const pager = list.querySelector('[data-hub-pager="notices"]');
  if(pager){ pager.dataset.total = String(total); pager.dataset.pages = String(pages); }
  bindHubPager(list, 'notices', ()=>renderAnnouncements());
  const search=$('boardSearch');
  if(search && !search.dataset.noticeBound){
    search.dataset.noticeBound='1';
    search.addEventListener('input',()=>{ hubListPage.notices = 1; renderAnnouncements(); });
  }
}
function listenAnnouncements(){
  if(!$('announcementList')) return;
  listenVisibleDocs('announcements',(rows,err)=>{
    window.__noticeRows = rows || [];
    hubListPage.notices = 1;
    renderAnnouncements(window.__noticeRows, err);
  });
}
function renderNoticeDetail(d,err){
  const box=$('noticeDetail'); if(!box)return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!d){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  window.__lastNoticeDetail = d;
  box.innerHTML=`<article class="hub-post-detail"><div class="post-nav-row"><a class="secondary mini-btn" href="./notices.html">${esc(tt('← 목록'))}</a></div><div class="post-card-head"><div class="post-kicker">${esc(tt('공지사항'))}</div><h1>${esc(d.title)}</h1><div class="post-meta-grid"><span><em>${esc(tt('글쓴이'))}</em><b>${esc(noticeAuthor(d))}</b></span><span><em>${esc(tt('작성일'))}</em><b>${fmtDate(d.createdAt)}</b></span><span><em>${esc(tt('조회'))}</em><b>${Number(d.viewCount||0)}</b></span></div></div><div class="post-body-content">${mdBodyHtml(d.content)}</div>${hubAdminManageHtml('announcements', d.id)}</article>`;
  bindMdIn(box);
  bindAdminPostActions(box);
}
function markContentViewOnce(kind, id){
  const postId=String(id||'').trim();
  if(!postId) return false;
  const memKey=kind+':'+postId;
  if(!window.__midiaiViewed) window.__midiaiViewed=new Set();
  if(window.__midiaiViewed.has(memKey)) return false;
  const storageKey='midiai_views_'+kind;
  try{
    const raw=localStorage.getItem(storageKey);
    const arr=raw?JSON.parse(raw):[];
    const set=new Set(Array.isArray(arr)?arr:[]);
    try{
      const legacy={
        board:'midiai_view_'+postId,
        notice:'midiai_notice_view_'+postId,
        patch:'midiai_patch_view_'+postId
      }[kind];
      if(legacy && sessionStorage.getItem(legacy)) set.add(postId);
    }catch{}
    if(set.has(postId)){
      window.__midiaiViewed.add(memKey);
      return false;
    }
    set.add(postId);
    let out=[...set];
    if(out.length>800) out=out.slice(-800);
    localStorage.setItem(storageKey, JSON.stringify(out));
  }catch{}
  window.__midiaiViewed.add(memKey);
  return true;
}

async function incrementNoticeViewOnce(id){
  if(!markContentViewOnce('notice', id)) return;
  try{ const {doc,updateDoc,increment}=firestoreApi; await updateDoc(doc(db,'announcements',id),{viewCount:increment(1)}); }catch(e){ console.warn('notice view increment failed',e); }
}
function listenNoticeDetail(){ const box=$('noticeDetail'); if(!box)return; const id=getParam('id'); if(!id){box.innerHTML=`<p class="muted">${tr('empty')}</p>`;return} incrementNoticeViewOnce(id); listenDoc('announcements',id,renderNoticeDetail); }
function renderPatchNotes(rows,err){
  const list=$('patchList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  let no=rows.length;
  list.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${rows.map(x=>`<a class="hub-list-row hub-notice-row" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><div class="hub-col-no">${no--}</div><div class="hub-col-title"><b>${patchListTitleHtml(x)}</b></div>${authorCellHtml({...x, authorRole:'admin', displayName:noticeAuthor(x)})}<div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`).join('')}</div>`;
  bindSearch(list);
}
function listenPatchNotes(){ if($('patchList')) listenVisibleDocs('patchNotes',renderPatchNotes); }
let patchNotesIndex = [];
async function loadPatchNotesIndex(){
  if(patchNotesIndex.length || !db) return patchNotesIndex;
  try{
    const {collection,getDocs,query,where}=firestoreApi;
    const q=query(collection(db,'patchNotes'), where('visible','==',true));
    const snap=await getDocs(q);
    patchNotesIndex=snap.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  }catch(e){ console.warn('patch index load failed',e); }
  return patchNotesIndex;
}
function patchNeighbors(id){
  const idx=patchNotesIndex.findIndex(p=>p.id===id);
  if(idx<0) return { prev:null, next:null };
  return { prev: idx>0 ? patchNotesIndex[idx-1] : null, next: idx<patchNotesIndex.length-1 ? patchNotesIndex[idx+1] : null };
}
function renderPatchDetail(d,err){
  const box=$('patchDetail'); if(!box)return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!d){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  window.__lastPatchDetail = d;
  const nav=patchNeighbors(d.id);
  box.innerHTML = patchDetailHtml({...d,id:d.id}, nav);
  bindMdIn(box);
  bindPatchDetailActions(box);
}
async function incrementPatchViewOnce(id){
  if(!markContentViewOnce('patch', id)) return;
  try{ const {doc,updateDoc,increment}=firestoreApi; await updateDoc(doc(db,'patchNotes',id),{viewCount:increment(1)}); }catch(e){ console.warn('patch view increment failed',e); }
}
function listenPatchDetail(){
  const box=$('patchDetail'); if(!box)return;
  const id=getParam('id');
  if(!id){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  incrementPatchViewOnce(id);
  loadPatchNotesIndex().then(()=>listenDoc('patchNotes',id,renderPatchDetail));
}
function renderFaq(rows,err){
  const list=$('faqList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  window.__lastFaqRows = rows || [];
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; syncBoardAdminUi(); return; }
  rows.sort((a,b)=>Number(a.order||999)-Number(b.order||999));
  list.innerHTML=rows.map(x=>`<article class="faq-item" data-faq-id="${esc(x.id)}"><h3>${esc(x.question)}</h3><div class="content">${mdBodyHtml(x.answer)}</div>${hubAdminManageHtml('faq', x.id)}</article>`).join('');
  bindMdIn(list);
  bindAdminPostActions(list);
  syncBoardAdminUi();
}
function listenFaq(){ if($('faqList')) listenVisibleDocs('faq',renderFaq,'order','asc'); }
function bindSearch(list){ const input=$('boardSearch'); if(!input || input.dataset.bound) return; input.dataset.bound='1'; input.addEventListener('input',()=>{ const q=input.value.trim().toLowerCase(); list.querySelectorAll('.hub-list-row, .list-item').forEach(el=>{el.style.display=el.textContent.toLowerCase().includes(q)?'':'none'}); }); }

const TICKET_CATEGORIES=[
  {value:'login',labelKey:'cat_login'},
  {value:'license',labelKey:'cat_license'},
  {value:'payment',labelKey:'cat_payment'},
  {value:'bug',labelKey:'cat_bug'},
  {value:'feature',labelKey:'cat_feature'},
  {value:'other',labelKey:'cat_other'},
];
function supportLocaleText(){
  if(lang === 'en') return {
    title:'1:1 Support',
    desc:'Only you and the admin can view this ticket. Please sign in first.',
    guideTitle:'Before you contact us',
    guide:[
      'Tickets and replies are private — visible only to you and the admin.',
      'We usually reply within 1–2 business days, in order received.',
      'For login, license, or payment issues, include your Google account email.',
      'For bugs, attach app version, Windows version, and screenshots/logs when possible.'
    ],
    faqFirst:'Check FAQ first',
    myTickets:'View my tickets',
    needLoginTitle:'Google sign-in required',
    needLoginDesc:'You must be signed in to create tickets and view replies.',
    accountLabel:'Support account',
    category:'Category',
    titleLabel:'Title',
    contentLabel:'Details',
    titlePh:'Login issue / license question',
    contentPh:'Describe your issue in detail. For bugs, include steps to reproduce, error messages, and screenshot notes.',
    attachments:'Attachments',
    attachHint:'Screenshots, video, PDF, logs, ZIP · 20MB each · max 5 files',
    noAttach:'No files attached.',
    appVersion:'App version',
    os:'Operating system',
    optional:'(optional)',
    select:'Select',
    other:'Other',
    email:'Contact email',
    emailPh:'Filled after Google sign-in',
    privacyHtml:'I agree to the collection and use of information for support under the <a href="./privacy.html" target="_blank" rel="noopener">Privacy policy</a>.',
    submit:'Submit ticket',
    cat_login:'Login / Account',
    cat_license:'License',
    cat_payment:'Payment / Refund',
    cat_bug:'Bug / Error',
    cat_feature:'Feature question',
    cat_other:'Other',
    appVersionPh:'e.g. 1.5.7',
    badge_video:'Video',
    badge_image:'Image',
    badge_audio:'Audio',
    badge_pdf:'PDF',
    badge_archive:'Archive',
    badge_text:'Text',
    badge_file:'File',
    download:'Download',
    attachUnsupported:'Unsupported file type. Use image, video, PDF, TXT, CSV, LOG, or ZIP.',
    attachTooBig:'Each file can be up to 20MB.',
    attachMax:'Up to 5 attachments per ticket.',
    uploading:(i,n)=>`Uploading attachment... ${i}/${n}`,
  };
  if(lang === 'ja') return {
    title:'お問い合わせ',
    desc:'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。',
    guideTitle:'お問い合わせ前のご案内',
    guide:[
      '問い合わせと返信は作成者と管理者のみ閲覧できる非公開掲示板です。',
      '平日基準で1〜2営業日以内に順次返信します。',
      'ログイン・ライセンス・決済のご質問はGoogleアカウントのメールをご確認ください。',
      '不具合の場合はアプリ版・Windows版・スクリーンショット/ログを添付すると確認が早くなります。'
    ],
    faqFirst:'FAQを先に確認',
    myTickets:'マイ問い合わせを見る',
    needLoginTitle:'Googleログインが必要です',
    needLoginDesc:'問い合わせ登録と返信確認はログインしたアカウントでのみ可能です。',
    accountLabel:'問い合わせアカウント',
    category:'問い合わせ種類',
    titleLabel:'件名',
    contentLabel:'内容',
    titlePh:'ログインエラー / ライセンス問い合わせ',
    contentPh:'お問い合わせ内容を詳しく入力してください。不具合の場合は再現手順、メッセージ、スクリーンショットの説明を含めてください。',
    attachments:'添付ファイル',
    attachHint:'スクリーンショット・動画・PDF・ログ・ZIP · 1ファイル20MB · 最大5個',
    noAttach:'添付ファイルはありません。',
    appVersion:'アプリ版',
    os:'OS',
    optional:'（任意）',
    select:'選択',
    other:'その他',
    email:'連絡用メール',
    emailPh:'Googleログイン後に表示',
    privacyHtml:'<a href="./privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>に従い、問い合わせ対応のための情報収集・利用に同意します。',
    submit:'送信',
    cat_login:'ログイン/アカウント',
    cat_license:'ライセンス',
    cat_payment:'決済/返金',
    cat_bug:'不具合/バグ',
    cat_feature:'機能について',
    cat_other:'その他',
    appVersionPh:'例: 1.5.7',
    badge_video:'動画',
    badge_image:'画像',
    badge_audio:'音声',
    badge_pdf:'PDF',
    badge_archive:'圧縮',
    badge_text:'テキスト',
    badge_file:'ファイル',
    download:'ダウンロード',
    attachUnsupported:'対応していない形式です。画像/動画/PDF/TXT/CSV/LOG/ZIPのみアップロードできます。',
    attachTooBig:'1ファイルあたり最大20MBまでです。',
    attachMax:'問い合わせあたり添付は最大5個までです。',
    uploading:(i,n)=>`添付ファイルをアップロード中... ${i}/${n}`,
  };
  return {
    title:'1:1 문의',
    desc:'문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.',
    guideTitle:'문의 전 안내',
    guide:[
      '문의와 답변은 작성자와 관리자만 볼 수 있는 비공개 게시판입니다.',
      '평일 기준 1~2영업일 내 답변을 드리며, 순차적으로 처리됩니다.',
      '로그인·라이선스·결제 문의는 Google 계정 이메일을 꼭 확인해주세요.',
      '오류 문의 시 앱 버전·Windows 버전·스크린샷/로그를 함께 첨부해주시면 빠른 확인이 가능합니다.'
    ],
    faqFirst:'FAQ 먼저 확인',
    myTickets:'나의 문의 보기',
    needLoginTitle:'Google 로그인이 필요합니다.',
    needLoginDesc:'문의 등록과 답변 확인은 로그인한 계정으로만 가능합니다.',
    accountLabel:'문의 계정',
    category:'문의 유형',
    titleLabel:'제목',
    contentLabel:'내용',
    titlePh:'로그인 오류 / 라이선스 문의',
    contentPh:'문의 내용을 자세히 적어주세요. 오류의 경우 재현 방법, 메시지, 스크린샷 설명을 포함해주세요.',
    attachments:'첨부파일',
    attachHint:'스크린샷·영상·PDF·로그·ZIP · 파일당 20MB · 최대 5개',
    noAttach:'첨부한 파일이 없습니다.',
    appVersion:'앱 버전',
    os:'운영체제',
    optional:'(선택)',
    select:'선택',
    other:'기타',
    email:'연락 이메일',
    emailPh:'Google 로그인 후 자동 입력',
    privacyHtml:'<a href="./privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 따라 문의 처리를 위한 정보 수집·이용에 동의합니다.',
    submit:'문의 등록',
    cat_login:'로그인/계정',
    cat_license:'라이선스',
    cat_payment:'결제/환불',
    cat_bug:'오류/버그',
    cat_feature:'기능 문의',
    cat_other:'기타',
    appVersionPh:'예: 1.5.7',
    badge_video:'영상',
    badge_image:'사진',
    badge_audio:'오디오',
    badge_pdf:'PDF',
    badge_archive:'압축파일',
    badge_text:'텍스트',
    badge_file:'파일',
    download:'다운로드',
    attachUnsupported:'지원하지 않는 파일 형식입니다. 이미지/영상/PDF/TXT/CSV/LOG/ZIP만 업로드할 수 있어요.',
    attachTooBig:'파일당 최대 20MB까지 업로드할 수 있어요.',
    attachMax:'문의당 첨부는 최대 5개까지 가능합니다.',
    uploading:(i,n)=>`첨부파일 업로드 중... ${i}/${n}`,
  };
}
function ticketCategoryLabel(v){
  const t = supportLocaleText();
  const item = TICKET_CATEGORIES.find(x=>x.value===v);
  return item ? (t[item.labelKey] || item.labelKey) : t.cat_other;
}
function ticketOsLabel(v){
  const t = supportLocaleText();
  return ({windows11:'Windows 11',windows10:'Windows 10',other:t.other})[v]||'';
}
function applySupportI18n(){
  if(page !== 'support.html') return;
  const t = supportLocaleText();
  const h1 = document.querySelector('.hub-topline h1');
  const desc = document.querySelector('.hub-topline .hub-desc');
  if(h1) h1.textContent = t.title;
  if(desc) desc.textContent = t.desc;
  const guideTitle = document.querySelector('.support-info h3');
  if(guideTitle) guideTitle.textContent = t.guideTitle;
  const guideLis = document.querySelectorAll('.support-info ul li');
  guideLis.forEach((li,i)=>{ if(t.guide[i]) li.textContent = t.guide[i]; });
  const links = document.querySelectorAll('.support-info-links a');
  if(links[0]) links[0].textContent = t.faqFirst;
  if(links[1]) links[1].textContent = t.myTickets;
  const gate = $('supportLoginGate');
  if(gate){
    const ps = gate.querySelectorAll('p');
    if(ps[0]) ps[0].innerHTML = `<b>${esc(t.needLoginTitle)}</b>`;
    if(ps[1]) ps[1].textContent = t.needLoginDesc;
    const btn = $('supportLoginBtn');
    if(btn) btn.textContent = tr('login');
  }
  const accountLabel = document.querySelector('.support-account-label');
  if(accountLabel) accountLabel.textContent = t.accountLabel;
  const catLabel = document.querySelector('label[for="ticketCategory"]');
  if(catLabel) catLabel.textContent = t.category;
  const cat = $('ticketCategory');
  if(cat){
    const cur = cat.value;
    cat.innerHTML = TICKET_CATEGORIES.map(x=>`<option value="${x.value}">${esc(t[x.labelKey])}</option>`).join('');
    if(cur) cat.value = cur;
  }
  const titleLabel = document.querySelector('label[for="ticketTitle"]');
  if(titleLabel) titleLabel.textContent = t.titleLabel;
  const contentLabel = document.querySelector('label[for="ticketContent"]');
  if(contentLabel) contentLabel.textContent = t.contentLabel;
  if($('ticketTitle')) $('ticketTitle').placeholder = t.titlePh;
  if($('ticketContent')) $('ticketContent').placeholder = t.contentPh;
  const attachLabel = document.querySelector('label[for="ticketAttachments"]');
  if(attachLabel) attachLabel.textContent = t.attachments;
  const attachHint = document.querySelector('.support-upload-box .small-copy');
  if(attachHint) attachHint.textContent = t.attachHint;
  const appLabel = document.querySelector('label[for="ticketAppVersion"]');
  if(appLabel) appLabel.innerHTML = `${esc(t.appVersion)} <span class="muted">${esc(t.optional)}</span>`;
  const osLabel = document.querySelector('label[for="ticketOs"]');
  if(osLabel) osLabel.innerHTML = `${esc(t.os)} <span class="muted">${esc(t.optional)}</span>`;
  if($('ticketAppVersion')) $('ticketAppVersion').placeholder = t.appVersionPh;
  const os = $('ticketOs');
  if(os){
    const cur = os.value;
    os.innerHTML = `<option value="">${esc(t.select)}</option><option value="windows11">Windows 11</option><option value="windows10">Windows 10</option><option value="other">${esc(t.other)}</option>`;
    if(cur) os.value = cur;
  }
  const emailLabel = document.querySelector('label[for="ticketEmail"]');
  if(emailLabel) emailLabel.textContent = t.email;
  if($('ticketEmail') && !currentUser) $('ticketEmail').placeholder = t.emailPh;
  const privacySpan = document.querySelector('.support-check span');
  if(privacySpan) privacySpan.innerHTML = t.privacyHtml;
  const submit = document.querySelector('#ticketForm button[type="submit"]');
  if(submit) submit.textContent = t.submit;
  renderTicketAttachmentPreview();
  refreshTopbarPageTitle();
}

const TICKET_MAX_ATTACHMENTS = 5;
const TICKET_MAX_FILE_SIZE = 20 * 1024 * 1024;
const TICKET_ALLOWED_MIME = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|webm)|application\/pdf|text\/(plain|csv|log)|application\/(zip|x-zip-compressed))$/i;
let selectedTicketFiles = [];

function ticketFileExt(fileOrAttachment){
  const name = String(fileOrAttachment?.name || fileOrAttachment?.fileName || '');
  const m = name.match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : '';
}
function ticketFileType(fileOrAttachment){
  const mime = String(fileOrAttachment?.mime || fileOrAttachment?.type || '').toLowerCase();
  const ext = ticketFileExt(fileOrAttachment);
  if(mime.startsWith('video/') || ['mp4','webm','mov','mkv'].includes(ext)) return 'video';
  if(mime.startsWith('image/') || ['jpg','jpeg','png','webp','gif','bmp'].includes(ext)) return 'image';
  if(mime.startsWith('audio/') || ['mp3','wav','flac','m4a','ogg','aac'].includes(ext)) return 'audio';
  if(mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if(
    mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('compressed')
    || ['zip','rar','7z','alz','egg','tar','gz'].includes(ext)
  ) return 'archive';
  if(
    mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')
    || ['txt','log','csv','md','json','xml'].includes(ext)
  ) return 'text';
  return 'file';
}
function ticketFileIcon(type){
  return ({video:'▶',image:'▣',audio:'♪',pdf:'PDF',archive:'ZIP',text:'TXT',file:'FILE'})[type] || 'FILE';
}
function ticketAttachmentBadge(type){
  const t = supportLocaleText();
  return ({
    video:t.badge_video,
    image:t.badge_image,
    audio:t.badge_audio,
    pdf:t.badge_pdf,
    archive:t.badge_archive,
    text:t.badge_text,
    file:t.badge_file
  })[type] || t.badge_file;
}
function formatTicketFileSize(bytes){
  const n = Number(bytes);
  if(!Number.isFinite(n) || n <= 0) return '';
  if(n < 1024) return `${n} B`;
  if(n < 1024 * 1024) return `${(n/1024).toFixed(n < 10*1024 ? 1 : 0)} KB`;
  return `${(n/(1024*1024)).toFixed(n < 10*1024*1024 ? 1 : 0)} MB`;
}
function ticketFileExtLabel(fileOrAttachment, type){
  const ext = ticketFileExt(fileOrAttachment);
  if(ext) return ext.toUpperCase();
  return ({video:'VIDEO',image:'IMG',audio:'AUDIO',pdf:'PDF',archive:'ZIP',text:'TXT',file:'FILE'})[type] || 'FILE';
}
function ticketAttachmentItemHtml(a, idx, editable=false){
  const type = ticketFileType(a);
  const rawName = a.name || a.fileName || 'attachment';
  const name = esc(rawName);
  const url = esc(a.url || '');
  const sizeLabel = formatTicketFileSize(a.size);
  const kindLabel = ticketAttachmentBadge(type);
  const extLabel = ticketFileExtLabel(a, type);
  const metaBits = [kindLabel, sizeLabel].filter(Boolean).join(' · ');
  const remove = editable
    ? `<button type="button" class="secondary mini-btn danger-btn file-attach-remove" data-remove-ticket-attachment="${idx}">삭제</button>`
    : '';
  const t = supportLocaleText();

  if(type === 'image' || type === 'video'){
    const media = type === 'video'
      ? `<video controls preload="metadata" src="${url}"></video>`
      : `<img src="${url}" alt="${name}" loading="lazy" data-lightbox-src="${url}">`;
    return `<figure class="board-attachment-item board-attachment-${type} file-attach-media">
      ${media}
      <figcaption class="file-attach-caption">
        <span class="file-attach-kind is-${type}">${esc(extLabel)}</span>
        <span class="file-attach-copy"><b title="${name}">${name}</b>${metaBits?`<small>${esc(metaBits)}</small>`:''}</span>
        <a class="file-attach-link" href="${url}" target="_blank" rel="noopener noreferrer" download>${esc(t.download || '다운로드')}</a>
        ${remove}
      </figcaption>
    </figure>`;
  }

  const card = `<a class="file-attach-card is-${type}" href="${url}" target="_blank" rel="noopener noreferrer" download title="${name}">
    <span class="file-attach-icon is-${type}" aria-hidden="true"><em>${esc(extLabel)}</em></span>
    <span class="file-attach-copy">
      <b>${name}</b>
      <small>${esc(metaBits || kindLabel)}</small>
    </span>
    <span class="file-attach-action">${esc(t.download || '다운로드')}</span>
  </a>`;
  return remove ? `<div class="file-attach-row">${card}${remove}</div>` : card;
}
function ticketAttachmentsHtml(list){
  const arr = Array.isArray(list) ? list.filter(x=>x && x.url) : [];
  if(!arr.length) return '';
  return `<div class="file-attach-list ticket-attachments">${arr.map((a,i)=>ticketAttachmentItemHtml(a,i,false)).join('')}</div>`;
}
function renderTicketAttachmentPreview(){
  const box = $('ticketAttachmentPreview');
  if(!box) return;
  const fresh = selectedTicketFiles.map((file,i)=>{
    const type = ticketFileType(file);
    const ext = ticketFileExtLabel(file, type);
    const sizeLabel = formatTicketFileSize(file.size);
    return `<div class="file-attach-card is-${type} is-preview">
      <span class="file-attach-icon is-${type}" aria-hidden="true"><em>${esc(ext)}</em></span>
      <span class="file-attach-copy"><b title="${esc(file.name)}">${esc(file.name)}</b><small>${esc([ticketAttachmentBadge(type), sizeLabel].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="secondary mini-btn danger-btn file-attach-remove" data-remove-new-ticket-attachment="${i}">삭제</button>
    </div>`;
  }).join('');
  box.innerHTML = fresh ? `<div class="file-attach-list is-preview">${fresh}</div>` : `<p class="muted">${esc(supportLocaleText().noAttach)}</p>`;
  box.querySelectorAll('[data-remove-new-ticket-attachment]').forEach(btn=>btn.onclick=()=>{
    selectedTicketFiles.splice(Number(btn.dataset.removeNewTicketAttachment),1);
    const input = $('ticketAttachments');
    if(input) input.value = '';
    renderTicketAttachmentPreview();
  });
}
function showTicketAttachmentMsg(text){
  const el = $('ticketFormMsg');
  if(el){ el.textContent = text; el.style.color = '#ff9aac'; }
}
function addTicketFiles(files){
  const incoming = Array.from(files || []);
  const t = supportLocaleText();
  for(const file of incoming){
    if(!TICKET_ALLOWED_MIME.test(file.type || '')){ showTicketAttachmentMsg(t.attachUnsupported); continue; }
    if(file.size > TICKET_MAX_FILE_SIZE){ showTicketAttachmentMsg(t.attachTooBig); continue; }
    if(selectedTicketFiles.length >= TICKET_MAX_ATTACHMENTS){ showTicketAttachmentMsg(t.attachMax); break; }
    selectedTicketFiles.push(file);
  }
  renderTicketAttachmentPreview();
}
function bindTicketAttachmentPicker(){
  const input = $('ticketAttachments');
  const drop = qs('.support-upload-box');
  if(input && !input.dataset.bound){
    input.dataset.bound = '1';
    input.addEventListener('change', ()=>addTicketFiles(input.files));
  }
  if(drop && !drop.dataset.bound){
    drop.dataset.bound = '1';
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{ e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{ e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e=>addTicketFiles(e.dataTransfer?.files));
  }
  renderTicketAttachmentPreview();
}
function resetTicketAttachments(){
  selectedTicketFiles = [];
  const input = $('ticketAttachments');
  if(input) input.value = '';
  renderTicketAttachmentPreview();
}
async function uploadTicketAttachments(ticketId){
  if(!selectedTicketFiles.length) return [];
  if(!storage || !storageApi?.ref) throw new Error('Firebase Storage 초기화에 실패했습니다.');
  const {ref, uploadBytes, getDownloadURL} = storageApi;
  const uploaded = [];
  for(let i=0;i<selectedTicketFiles.length;i++){
    const file = selectedTicketFiles[i];
    showFormMsg(supportLocaleText().uploading(i+1, selectedTicketFiles.length), true);
    const safeName = boardSafeFilename(file.name);
    const path = `support/${currentUser.uid}/${ticketId}/${Date.now()}_${i}_${safeName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    const url = await getDownloadURL(fileRef);
    uploaded.push({ type: ticketFileType(file), mime: file.type, name: file.name, size: file.size, path, url });
  }
  return uploaded;
}

function updateSupportFormUi(){
  if(page!=='support.html') return;
  const gate=$('supportLoginGate');
  const form=$('ticketForm');
  const account=$('supportAccount');
  const loginBtn=$('supportLoginBtn');
  if(!form) return;
  const fields=form.querySelectorAll('input,textarea,select,button[type=submit]');
  if(!currentUser){
    gate?.classList.remove('hidden');
    account?.classList.add('hidden');
    form.classList.remove('is-disabled');
    fields.forEach(el=>{
      if(el.id==='ticketEmail'){ el.value=''; el.disabled=true; return; }
      el.disabled=false;
    });
    if(loginBtn && !loginBtn.dataset.bound){
      loginBtn.dataset.bound='1';
      loginBtn.addEventListener('click',()=>$('loginBtn')?.click());
    }
    bindTicketAttachmentPicker();
    return;
  }
  gate?.classList.add('hidden');
  account?.classList.remove('hidden');
  form.classList.remove('is-disabled');
  fields.forEach(el=>{
    if(el.id==='ticketEmail'){ el.value=currentUser.email||''; el.disabled=true; return; }
    el.disabled=false;
  });
  if($('supportAccountName')) $('supportAccountName').textContent=currentUser.displayName||'Google User';
  if($('supportAccountEmail')) $('supportAccountEmail').textContent=currentUser.email||'';
  bindTicketAttachmentPicker();
}


function hasUnreadTicketReply(t){
  return !!(t && t.replyRead === false && t.replyAt);
}
function ticketReplyFocusHref(ticketId){
  const base = window.MIDIAI_BASE_PATH || './';
  return `${base}my-tickets.html?open=${encodeURIComponent(ticketId)}`;
}
function ticketDetailFocusHref(ticketId){
  const base = window.MIDIAI_BASE_PATH || './';
  return `${base}ticket.html?id=${encodeURIComponent(ticketId)}&focus=reply`;
}
function ensureToastHost(){
  let host = document.getElementById('appToastHost');
  if(host) return host;
  host = document.createElement('div');
  host.id = 'appToastHost';
  host.className = 'app-toast-host';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}
function dismissAllAppToasts(){
  document.querySelectorAll('.app-toast').forEach(el => {
    try{ el._dismissToast?.(true); }catch{}
    el.remove();
  });
}
function showAppToast({title, body, actionLabel, onAction}={}){
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = 'app-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p class="app-toast-title">${esc(title||'')}</p><p class="app-toast-body">${esc(body||'')}</p><div class="app-toast-actions">${actionLabel?`<button type="button" class="primary" data-toast-action>${esc(actionLabel)}</button>`:''}<button type="button" class="app-toast-close" data-toast-close aria-label="close">×</button></div>`;
  host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('is-in'));
  let closed = false;
  const dismiss = (immediate=false) => {
    if(closed) return;
    closed = true;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    const remove = () => { try{ el.remove(); }catch{} };
    if(immediate) remove();
    else setTimeout(remove, 280);
  };
  el._dismissToast = dismiss;
  el.querySelector('[data-toast-close]')?.addEventListener('click', ()=>dismiss(false));
  el.querySelector('[data-toast-action]')?.addEventListener('click', ()=>{
    try{ onAction?.(); }catch(e){ console.error(e); }
    dismiss(false);
  });
  return el;
}
function updateTicketUnreadBadges(count){
  unreadReplyCount = Math.max(0, Number(count)||0);
  const targets = document.querySelectorAll('#mainNav [data-hub="tickets"], #mainNav [data-hub="support"], .hub-subnav [data-hub="tickets"], .hub-subnav [data-hub="support"], #mainNav a[href*="my-tickets.html"]');
  targets.forEach(link => {
    if(link.classList.contains('mini-btn') || link.classList.contains('secondary')) return;
    let badge = link.querySelector('[data-ticket-unread-badge]');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'nav-unread-badge';
      badge.setAttribute('data-ticket-unread-badge', '');
      badge.hidden = true;
      link.appendChild(badge);
    }
    if(unreadReplyCount > 0){
      badge.hidden = false;
      badge.textContent = String(unreadReplyCount > 99 ? '99+' : unreadReplyCount);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  });
}
function stopTicketNotifyListener(){
  if(ticketNotifyUnsub){
    try{ ticketNotifyUnsub(); }catch{}
    ticketNotifyUnsub = null;
  }
  ticketNotifyInFlight.clear();
  ticketReadInFlight.clear();
  toastedReplyKeys.clear();
}
function clearTicketReplyObserver(){
  if(ticketReplyObserver){
    try{ ticketReplyObserver.disconnect(); }catch{}
    ticketReplyObserver = null;
  }
}
async function markTicketReplyNotified(ticketId){
  if(!currentUser || !ticketId || !firestoreApi?.updateDoc) return;
  try{
    const {doc, updateDoc} = firestoreApi;
    await updateDoc(doc(db,'supportTickets',ticketId), { replyNotified:true });
  }catch(e){ console.error('markTicketReplyNotified', e); }
}
async function markTicketReplyRead(ticketId){
  if(!currentUser || !ticketId || !firestoreApi?.updateDoc) return;
  if(ticketReadInFlight.has(ticketId)) return;
  ticketReadInFlight.add(ticketId);
  try{
    const {doc, updateDoc, serverTimestamp} = firestoreApi;
    await updateDoc(doc(db,'supportTickets',ticketId), { replyRead:true, replyNotified:true });
    const bellMatches = userNotifyRows.filter(n => n.type === 'ticket_reply' && n.ticketId === ticketId && n.read !== true);
    if(bellMatches.length){
      await Promise.all(bellMatches.map(n =>
        updateDoc(doc(db,'users',currentUser.uid,'notifications',n.id), { read:true, readAt:serverTimestamp() })
      ));
    }
  }catch(e){ console.error('markTicketReplyRead', e); }
  finally{ ticketReadInFlight.delete(ticketId); }
}
function ticketToastKey(t){
  const at = t?.replyAt?.seconds || t?.replyAt?._seconds || t?.replyAt || '';
  return `${t?.id||''}:${at}`;
}
function showTicketReplyToast(ticket){
  if(!ticket?.id) return;
  if(!isNotifyTypeEnabled('ticket_reply')){
    markTicketReplyNotified(ticket.id);
    return;
  }
  const key = ticketToastKey(ticket);
  if(!key || toastedReplyKeys.has(key) || ticketNotifyInFlight.has(ticket.id)) return;
  toastedReplyKeys.add(key);
  ticketNotifyInFlight.add(ticket.id);
  showAppToast({
    title: tr('reply_toast_title'),
    body: tr('reply_toast_body'),
    actionLabel: tr('reply_toast_action'),
    onAction: ()=>{ location.href = ticketReplyFocusHref(ticket.id); }
  });
  markTicketReplyNotified(ticket.id).finally(()=>{ ticketNotifyInFlight.delete(ticket.id); });
}
function processTicketNotifications(rows){
  const unread = (rows||[]).filter(hasUnreadTicketReply);
  updateTicketUnreadBadges(unread.length);
  const toNotify = unread
    .filter(t => t.replyNotified !== true && !toastedReplyKeys.has(ticketToastKey(t)) && !ticketNotifyInFlight.has(t.id))
    .sort((a,b)=>(b.replyAt?.seconds||b.updatedAt?.seconds||0)-(a.replyAt?.seconds||a.updatedAt?.seconds||0));
  toNotify.forEach(t => showTicketReplyToast(t));
}
function listenTicketNotifications(){
  stopTicketNotifyListener();
  if(!currentUser || !firestoreApi?.onSnapshot) {
    updateTicketUnreadBadges(0);
    return;
  }
  const {collection, query, where, onSnapshot} = firestoreApi;
  const q = query(collection(db,'supportTickets'), where('uid','==', currentUser.uid));
  ticketNotifyUnsub = onSnapshot(q, snap => {
    const rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    processTicketNotifications(rows);
  }, err => {
    console.error('ticket notifications', err);
  });
}
function observeTicketReplyVisibility(ticketId, target){
  clearTicketReplyObserver();
  if(!ticketId || !target || !currentUser) return;
  if(typeof IntersectionObserver !== 'function'){
    markTicketReplyRead(ticketId);
    return;
  }
  ticketReplyObserver = new IntersectionObserver((entries)=>{
    if(entries.some(e => e.isIntersecting && e.intersectionRatio > 0.2)){
      clearTicketReplyObserver();
      markTicketReplyRead(ticketId);
    }
  }, { threshold:[0.2, 0.5, 1], rootMargin:'0px 0px -10% 0px' });
  ticketReplyObserver.observe(target);
}
function focusTicketReplySection(root=document){
  const panel = root.querySelector?.('.hub-replies-panel') || root;
  if(!panel) return;
  panel.classList.add('is-focus-target');
  const lastAdmin = panel.querySelector?.('.reply.is-admin:last-of-type') || panel.querySelector?.('[data-replies]');
  const target = lastAdmin || panel;
  try{ target.scrollIntoView({ behavior:'smooth', block:'center' }); }catch{ target.scrollIntoView(true); }
  setTimeout(()=>panel.classList.remove('is-focus-target'), 1800);
}
function maybeOpenTicketFromQuery(){
  if(page !== 'my-tickets.html') return;
  const openId = getParam('open') || '';
  if(!openId) return;
  pendingTicketOpenId = openId;
}
function consumePendingTicketOpen(listRoot){
  if(!pendingTicketOpenId || !listRoot) return;
  const id = pendingTicketOpenId;
  const row = listRoot.querySelector(`a.hub-ticket-row[data-ticket-id="${CSS.escape(id)}"]`);
  if(row){
    row.classList.add('is-focus');
    try{ row.scrollIntoView({ behavior:'smooth', block:'center' }); }catch{ row.scrollIntoView(true); }
  }
  pendingTicketOpenId = '';
  setTimeout(()=>{ location.href = ticketDetailFocusHref(id); }, 450);
}


function hasUnreadAdminTicket(t){
  return !!(t && t.adminRead === false);
}
function adminTicketFocusHref(ticketId){
  const base = window.MIDIAI_BASE_PATH || './';
  return `${base}admin.html?tab=tickets&open=${encodeURIComponent(ticketId)}`;
}
function updateAdminTicketUnreadBadges(count){
  unreadAdminTicketCount = Math.max(0, Number(count)||0);
  const targets = document.querySelectorAll('#adminNav, [data-admin-tab="tickets"]');
  targets.forEach(link => {
    if(link.classList.contains('hidden') || link.hidden) {
      // still attach badge so it appears when shown
    }
    let badge = link.querySelector('[data-admin-ticket-unread-badge]');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'nav-unread-badge';
      badge.setAttribute('data-admin-ticket-unread-badge', '');
      badge.hidden = true;
      link.appendChild(badge);
    }
    if(unreadAdminTicketCount > 0){
      badge.hidden = false;
      badge.textContent = String(unreadAdminTicketCount > 99 ? '99+' : unreadAdminTicketCount);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  });
}
function stopAdminTicketNotifyListener(){
  if(adminTicketNotifyUnsub){
    try{ adminTicketNotifyUnsub(); }catch{}
    adminTicketNotifyUnsub = null;
  }
  adminTicketNotifyInFlight.clear();
  adminTicketReadInFlight.clear();
  toastedAdminTicketKeys.clear();
}
async function markAdminTicketNotified(ticketId){
  if(!currentUser || !isAdminUser || !ticketId || !firestoreApi?.updateDoc) return;
  try{
    const {doc, updateDoc} = firestoreApi;
    await updateDoc(doc(db,'supportTickets',ticketId), { adminNotified:true });
  }catch(e){ console.error('markAdminTicketNotified', e); }
}
async function markAdminTicketRead(ticketId){
  if(!currentUser || !isAdminUser || !ticketId || !firestoreApi?.updateDoc) return;
  if(adminTicketReadInFlight.has(ticketId)) return;
  adminTicketReadInFlight.add(ticketId);
  try{
    const {doc, updateDoc} = firestoreApi;
    await updateDoc(doc(db,'supportTickets',ticketId), { adminRead:true, adminNotified:true });
  }catch(e){ console.error('markAdminTicketRead', e); }
  finally{ adminTicketReadInFlight.delete(ticketId); }
}
function adminTicketToastKey(t){
  const at = t?.adminNotifyAt?.seconds || t?.adminNotifyAt?._seconds || t?.updatedAt?.seconds || t?.createdAt?.seconds || t?.createdAt || '';
  const kind = t?.adminNotifyKind || 'ticket';
  return `admin:${t?.id||''}:${kind}:${at}`;
}
function showAdminTicketToast(ticket){
  if(!ticket?.id || !isAdminUser) return;
  const key = adminTicketToastKey(ticket);
  if(!key || toastedAdminTicketKeys.has(key) || adminTicketNotifyInFlight.has(ticket.id)) return;
  toastedAdminTicketKeys.add(key);
  adminTicketNotifyInFlight.add(ticket.id);
  const isReply = ticket.adminNotifyKind === 'reply';
  const bodyBase = tr(isReply ? 'admin_reply_toast_body' : 'admin_ticket_toast_body');
  const body = ticket.title ? `${bodyBase} · ${ticket.title}` : bodyBase;
  showAppToast({
    title: tr(isReply ? 'admin_reply_toast_title' : 'admin_ticket_toast_title'),
    body,
    actionLabel: tr(isReply ? 'admin_reply_toast_action' : 'admin_ticket_toast_action'),
    onAction: ()=>{ location.href = adminTicketFocusHref(ticket.id); }
  });
  markAdminTicketNotified(ticket.id).finally(()=>{ adminTicketNotifyInFlight.delete(ticket.id); });
}
function processAdminTicketNotifications(rows){
  if(!isAdminUser){
    updateAdminTicketUnreadBadges(0);
    return;
  }
  const unread = (rows||[]).filter(hasUnreadAdminTicket);
  updateAdminTicketUnreadBadges(unread.length);
  const toNotify = unread
    .filter(t => t.adminNotified !== true && !toastedAdminTicketKeys.has(adminTicketToastKey(t)) && !adminTicketNotifyInFlight.has(t.id))
    .sort((a,b)=>(b.createdAt?.seconds||b.updatedAt?.seconds||0)-(a.createdAt?.seconds||a.updatedAt?.seconds||0));
  toNotify.forEach(t => showAdminTicketToast(t));
}
function listenAdminTicketNotifications(){
  stopAdminTicketNotifyListener();
  if(!currentUser || !isAdminUser || !firestoreApi?.onSnapshot){
    updateAdminTicketUnreadBadges(0);
    return;
  }
  const {collection, onSnapshot} = firestoreApi;
  adminTicketNotifyUnsub = onSnapshot(collection(db,'supportTickets'), snap => {
    const rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    processAdminTicketNotifications(rows);
  }, err => {
    console.error('admin ticket notifications', err);
  });
  if(page==='admin.html') applyAdminTicketDeepLink();
}
function applyAdminTicketDeepLink(){
  if(page !== 'admin.html' || !isAdminUser) return;
  const tab = getParam('tab');
  const openId = getParam('open') || '';
  if(tab === 'tickets' || openId){
    const tabBtn = document.querySelector('[data-admin-tab="tickets"]');
    if(tabBtn) tabBtn.click();
    else {
      const tickets = $('adminTicketsSection');
      const crm = $('adminCrm');
      const pricing = $('adminPricingSection');
      if(crm) crm.hidden = true;
      if(pricing) pricing.hidden = true;
      if(tickets) tickets.hidden = false;
      document.querySelectorAll('[data-admin-tab]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-admin-tab')==='tickets'));
    }
  }
  if(openId) pendingAdminTicketOpenId = openId;
}
function consumePendingAdminTicketOpen(box){
  if(!box || !pendingAdminTicketOpenId) return;
  const id = pendingAdminTicketOpenId;
  pendingAdminTicketOpenId = '';
  box.dataset.openTicketId = id;
  markAdminTicketRead(id);
  requestAnimationFrame(()=>{
    const row = box.querySelector(`[data-ticket-row="${CSS.escape(id)}"]`);
    if(row){
      row.classList.add('is-focus');
      try{ row.scrollIntoView({ behavior:'smooth', block:'center' }); }catch{ row.scrollIntoView(true); }
    }
  });
}

async function createTicket(e){
  e.preventDefault();
  if(!currentUser){
    showFormMsg('need_login',false);
    $('supportLoginBtn')?.focus();
    $('loginBtn')?.click();
    return;
  }
  if(!$('ticketPrivacy')?.checked){ showFormMsg('privacy_required',false); return; }
  const title=$('ticketTitle').value.trim();
  const content=$('ticketContent').value.trim();
  const category=$('ticketCategory')?.value||'other';
  const appVersion=$('ticketAppVersion')?.value?.trim()||'';
  const os=$('ticketOs')?.value||'';
  if(!title||!content)return;
  const form = $('ticketForm');
  const submitBtn = form?.querySelector('button[type=submit]');
  if(submitBtn) submitBtn.disabled = true;
  try{
    const {collection,addDoc,doc,updateDoc,serverTimestamp}=firestoreApi;
    const ref = await addDoc(collection(db,'supportTickets'),{
      uid:currentUser.uid,
      email:currentUser.email||'',
      displayName:currentUser.displayName||'',
      category,appVersion,os,
      title,content,status:'open',private:true,attachments:[],
      adminRead:false,
      adminNotified:false,
      adminNotifyKind:'ticket',
      adminNotifyAt:serverTimestamp(),
      createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    const uploaded = await uploadTicketAttachments(ref.id);
    if(uploaded.length){
      await updateDoc(doc(db,'supportTickets',ref.id),{attachments:uploaded,updatedAt:serverTimestamp()});
    }
    $('ticketTitle').value='';
    $('ticketContent').value='';
    if($('ticketAppVersion')) $('ticketAppVersion').value='';
    if($('ticketOs')) $('ticketOs').value='';
    if($('ticketPrivacy')) $('ticketPrivacy').checked=false;
    resetTicketAttachments();
    showFormMsg('ticket_created',true);
    setTimeout(()=>location.href='./my-tickets.html',700);
  } catch(e){ console.error(e); showFormMsg(e.message || 'check_failed',false); }
  finally{ if(submitBtn) submitBtn.disabled = !currentUser; }
}
function showFormMsg(key,ok=true){ const el=$('ticketFormMsg'); if(el){ el.textContent=tr(key)===key?key:tr(key); el.style.color=ok?'#8ff3c5':'#ff9aac'; } }
function statusBadge(st){ const key=st==='answered'?'answered':st==='closed'?'closed':'open'; return `<span class="badge ${esc(st||'open')}">${tr(key)}</span>`; }
function ticketShell(t, detail=false, admin=false){
  const canManage = admin || detail;
  const metaExtra=[
    t.category?`<span><em>유형</em><b>${esc(ticketCategoryLabel(t.category))}</b></span>`:'',
    t.appVersion?`<span><em>버전</em><b>${esc(t.appVersion)}</b></span>`:'',
    t.os?`<span><em>OS</em><b>${esc(ticketOsLabel(t.os))}</b></span>`:'',
    t.email?`<span><em>이메일</em><b>${esc(t.email)}</b></span>`:'',
  ].join('');
  if(detail){
    const form=(admin||detail)?`<form class="reply-form hub-reply-form" data-ticket="${esc(t.id)}"><input placeholder="${esc(tr('reply_placeholder'))}" required><button class="primary" type="submit">${tr('submit')}</button></form>`:'';
    const actions=canManage?`<div class="post-actions hub-post-actions"><button class="secondary mini-btn" data-ticket-edit="${esc(t.id)}">${tr('edit')}</button><button class="secondary mini-btn" data-ticket-close="${esc(t.id)}">${tr('close')}</button><button class="secondary mini-btn danger-btn" data-ticket-delete="${esc(t.id)}">${tr('del')}</button></div>`:'';
    return `<article class="hub-post-detail"><div class="post-card-head"><div class="post-kicker">1:1 문의</div><h1>${esc(t.title||'')}</h1><div class="post-meta-grid"><span>${statusBadge(t.status)}</span><span><em>작성일</em><b>${esc(fmtShortDate(t.createdAt))}</b></span>${metaExtra}</div></div><div class="post-body-content hub-post-body">${nl2br(t.content||'')}</div>${ticketAttachmentsHtml(t.attachments)}${actions}<section class="hub-replies-panel" id="ticketReplies"><h3>답변</h3><div class="ticket-replies hub-reply-list" data-replies="${esc(t.id)}"></div>${form}</section></article>`;
  }
  const href=`./ticket.html?id=${encodeURIComponent(t.id)}${hasUnreadTicketReply(t)?'&focus=reply':''}`;
  const unreadCls = hasUnreadTicketReply(t) ? ' is-unread' : '';
  return `<a class="hub-list-row hub-ticket-row${unreadCls}" href="${href}" data-ticket-id="${esc(t.id)}"><div class="hub-col-title"><b>${esc(t.title||'(제목 없음)')}</b></div><div class="hub-col-cat">${esc(ticketCategoryLabel(t.category))}</div><div class="hub-col-badge">${statusBadge(t.status)}</div><div class="hub-col-date">${esc(fmtListDate(t.createdAt))}</div></a>`;
}
function listenReplies(ticketId, container, {adminView=false}={}){
  const {collection,query,orderBy,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets',ticketId,'replies'),orderBy('createdAt','asc'));
  return addUnsub(onSnapshot(q, snap => {
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    container.innerHTML=rows.length
      ? rows.map(r=>ticketReplyItemHtml(r, ticketId, {adminView})).join('')
      : '';
    bindTicketReplyActions(container);
  }, err => { console.error('replies',err); container.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
function ticketReplyItemHtml(r, ticketId, {adminView=false}={}){
  const author = r.role==='admin' ? BRAND_AUTHOR : (r.displayName||r.email||'user');
  const when = fmtDate(r.createdAt);
  const edited = r.edited ? ' · 수정됨' : '';
  const manage = isAdminUser
    ? `<div class="ticket-reply-actions"><button type="button" class="secondary mini-btn" data-reply-edit data-ticket="${esc(ticketId)}" data-reply="${esc(r.id)}">${tr('edit')}</button><button type="button" class="secondary mini-btn danger-btn" data-reply-delete data-ticket="${esc(ticketId)}" data-reply="${esc(r.id)}">${tr('del')}</button></div>`
    : '';
  if(adminView){
    return `<div class="admin-ticket-reply ${r.role==='admin'?'is-admin':''}" data-reply-id="${esc(r.id)}"><b>${esc(author)} · ${esc(when)}${edited}</b><p>${nl2br(r.content||'')}</p>${manage}</div>`;
  }
  return `<div class="reply ${r.role==='admin'?'is-admin':''}" data-reply-id="${esc(r.id)}"><b>${esc(author)} · ${esc(when)}${edited}</b><p>${nl2br(r.content||'')}</p>${manage}</div>`;
}
function bindTicketReplyActions(root=document){
  root.querySelectorAll('[data-reply-edit]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound='1';
    btn.addEventListener('click', ()=>editTicketReply(btn.dataset.ticket, btn.dataset.reply));
  });
  root.querySelectorAll('[data-reply-delete]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound='1';
    btn.addEventListener('click', ()=>deleteTicketReply(btn.dataset.ticket, btn.dataset.reply));
  });
}
async function editTicketReply(ticketId, replyId){
  if(!currentUser || !isAdminUser){ alert(tr('no_permission')); return; }
  if(!ticketId || !replyId) return;
  try{
    const {doc,getDoc,updateDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'supportTickets',ticketId,'replies',replyId);
    const snap=await getDoc(ref);
    if(!snap.exists()){ alert(tr('empty')); return; }
    const r=snap.data()||{};
    const data=await openEditModal('답변 수정', [
      {name:'content', label:'내용', type:'textarea', value:r.content||'', required:true, rows:8}
    ]);
    if(!data) return;
    const content=String(data.content||'').trim();
    if(!content) return;
    await updateDoc(ref,{content, edited:true, updatedAt:serverTimestamp()});
    await updateDoc(doc(db,'supportTickets',ticketId),{updatedAt:serverTimestamp()});
  }catch(e){ console.error(e); alert(e.message || tr('check_failed')); }
}
async function deleteTicketReply(ticketId, replyId){
  if(!currentUser || !isAdminUser){ alert(tr('no_permission')); return; }
  if(!ticketId || !replyId) return;
  if(!confirm(tr('confirm_delete'))) return;
  try{
    const {doc,getDoc,deleteDoc,updateDoc,collection,getDocs,query,orderBy,serverTimestamp}=firestoreApi;
    await deleteDoc(doc(db,'supportTickets',ticketId,'replies',replyId));
    const ticketRef=doc(db,'supportTickets',ticketId);
    const ticketSnap=await getDoc(ticketRef);
    const curStatus=ticketSnap.exists() ? (ticketSnap.data()?.status || 'open') : 'open';
    const snap=await getDocs(query(collection(db,'supportTickets',ticketId,'replies'),orderBy('createdAt','asc')));
    const hasAdminReply=snap.docs.some(d=>(d.data()?.role)==='admin');
    const patch={updatedAt:serverTimestamp()};
    if(curStatus!=='closed') patch.status = hasAdminReply ? 'answered' : 'open';
    await updateDoc(ticketRef, patch);
  }catch(e){ console.error(e); alert(e.message || tr('check_failed')); }
}
function bindReplyForms(root=document){ root.querySelectorAll('.reply-form').forEach(f=>{ if(f.dataset.bound) return; f.dataset.bound='1'; f.addEventListener('submit',ticketReply); }); bindTicketActions(root); bindTicketReplyActions(root); }
function bindTicketActions(root=document){
  root.querySelectorAll('[data-ticket-edit]').forEach(btn=>{ if(btn.dataset.bound) return; btn.dataset.bound='1'; btn.addEventListener('click',()=>editTicket(btn.dataset.ticketEdit)); });
  root.querySelectorAll('[data-ticket-delete]').forEach(btn=>{ if(btn.dataset.bound) return; btn.dataset.bound='1'; btn.addEventListener('click',()=>deleteTicket(btn.dataset.ticketDelete)); });
  root.querySelectorAll('[data-ticket-close]').forEach(btn=>{ if(btn.dataset.bound) return; btn.dataset.bound='1'; btn.addEventListener('click',()=>closeTicket(btn.dataset.ticketClose)); });
}

function modalEscapeClose(root, handler){
  const onKey = (e) => { if (e.key === 'Escape') handler(null); };
  document.addEventListener('keydown', onKey, {once:false});
  root._cleanup = () => document.removeEventListener('keydown', onKey);
}
function openEditModal(title, fields, opts={}){
  try{ hideAdminFlash(); }catch(_){}
  const hasMarkdown = fields.some(f => f.type === 'markdown');
  const submitLabel = opts.submitLabel || (hasMarkdown ? '완료' : '저장');
  return new Promise(async resolve => {
    ensureMarkdownCss();
    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-backdrop';
    const form = document.createElement('form');
    form.className = 'edit-modal' + (hasMarkdown ? ' md-edit-modal' : '') + (opts.modalClass ? ` ${opts.modalClass}` : '');
    const actionHtml = hasMarkdown
      ? `<button type="button" class="secondary" data-cancel>취소</button><button type="button" class="secondary" data-preview>미리보기</button><button type="submit" class="primary">${esc(submitLabel)}</button>`
      : `<button type="button" class="secondary" data-cancel>취소</button><button type="submit" class="primary">${esc(submitLabel)}</button>`;
    const subtitle = opts.subtitle
      ? `<p class="edit-modal-sub">${esc(opts.subtitle)}</p>`
      : '';
    form.innerHTML = `<div class="edit-modal-head"><div class="edit-modal-head-copy"><h3>${esc(title)}</h3>${subtitle}</div><button type="button" class="edit-modal-x" aria-label="close">×</button></div><div class="edit-modal-body"></div><div class="edit-modal-actions">${actionHtml}</div>`;
    const body = form.querySelector('.edit-modal-body');
    const mdHosts = {};
    const mdEditors = {};

    // Build DOM first (including markdown hosts) — mount editors only after visible
    for (const f of fields) {
      const row = document.createElement(f.type === 'markdown' || f.type === 'segment' || f.type === 'note' ? 'div' : 'label');
      row.className = 'edit-field' + (f.type === 'markdown' ? ' edit-field-markdown' : '') + (f.type === 'segment' ? ' edit-field-segment' : '');
      row.dataset.field = f.name;
      row.innerHTML = `<span>${esc(f.label || f.name)}</span>`;
      let input;
      if (f.type === 'note') {
        row.classList.add('edit-field-note');
        const note = document.createElement('div');
        note.className = 'edit-note muted small';
        note.dataset.noteField = f.name;
        note.innerHTML = f.html || '';
        row.appendChild(note);
        body.appendChild(row);
        continue;
      } else if (f.type === 'markdown') {
        const host = document.createElement('div');
        host.dataset.mdField = f.name;
        host.className = 'md-modal-editor-host';
        row.appendChild(host);
        body.appendChild(row);
        mdHosts[f.name] = { host, field: f };
        continue;
      } else if (f.type === 'segment') {
        const wrap = document.createElement('div');
        wrap.className = 'edit-segment';
        wrap.setAttribute('role', 'radiogroup');
        wrap.setAttribute('aria-label', f.label || f.name);
        const selected = String(f.value || (f.options?.[0]?.value || ''));
        (f.options || []).forEach(opt => {
          const lab = document.createElement('label');
          lab.className = 'edit-segment-opt';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = f.name;
          radio.value = opt.value;
          if (String(opt.value) === selected) radio.checked = true;
          const cap = document.createElement('span');
          cap.textContent = opt.label || opt.value;
          lab.appendChild(radio);
          lab.appendChild(cap);
          wrap.appendChild(lab);
        });
        row.appendChild(wrap);
        body.appendChild(row);
        continue;
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = f.rows || 7;
        input.value = f.value || '';
      } else if (f.type === 'checkbox') {
        row.classList.add('edit-field-check');
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!f.value;
      } else if (f.type === 'select') {
        input = document.createElement('select');
        (f.options || []).forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label || opt.value;
          if (String(opt.value) === String(f.value)) o.selected = true;
          input.appendChild(o);
        });
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        input.value = f.value ?? '';
      }
      input.name = f.name;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required && !f.showWhen) input.required = true;
      row.appendChild(input);
      body.appendChild(row);
    }

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    if (typeof opts.onReady === 'function') {
      try { opts.onReady(form, overlay); } catch (err) { console.error(err); }
    }

    const fieldControlValue = (name) => {
      const el = form.elements[name];
      if(!el) return '';
      return String(el.value || '');
    };
    const syncConditionalFields = () => {
      fields.forEach(f => {
        if(!f.showWhen) return;
        const show = fieldControlValue(f.showWhen.name) === f.showWhen.value;
        const row = body.querySelector(`[data-field="${CSS.escape(f.name)}"]`);
        if(row) row.classList.toggle('hidden', !show);
        const input = form.elements[f.name];
        if(input && input instanceof HTMLElement){
          if(show && f.required) input.required = true;
          else input.removeAttribute('required');
        }
      });
    };
    syncConditionalFields();
    form.addEventListener('change', e => {
      if(fields.some(f => f.showWhen && f.showWhen.name === e.target?.name)) syncConditionalFields();
    });

    // Wait until modal is painted, then mount editors
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const uid = currentUser?.uid || 'anon';
    for (const name of Object.keys(mdHosts)) {
      const { host, field } = mdHosts[name];
      try {
        if (host._mdApi) host._mdApi.destroy();
        mdEditors[name] = await mountMarkdownEditor(host, {
          value: pickMarkdownSource(field.value),
          height: 380,
          draftKey: field.draftKey || `modal:${name}`,
          storagePrefix: `cms-md/${uid}/hub`,
          showActions: false,
          preferToast: false
        });
        mdEditors[name].setMarkdown(pickMarkdownSource(field.value));
        mdEditors[name].refreshLayout();
      } catch (e) {
        console.error('markdown mount failed', e);
        alert('본문 편집기를 열 수 없습니다: ' + (e.message || e));
      }
    }

    const close = (value) => {
      Object.values(mdEditors).forEach(ed => { try { ed.destroy(); } catch (_) {} });
      Object.keys(mdEditors).forEach(k => { delete mdEditors[k]; });
      overlay._cleanup && overlay._cleanup();
      overlay.remove();
      resolve(value);
    };
    const collect = () => {
      const data = {};
      fields.forEach(f => {
        if (f.type === 'markdown') {
          const ed = mdEditors[f.name];
          data[f.name] = String(ed?.getMarkdown?.() || ed?.getValue?.() || '').trim();
          data.contentMarkdown = data[f.name];
          return;
        }
        if (f.type === 'note') return;
        const input = form.elements[f.name];
        if (!input) return;
        if (f.type === 'checkbox') data[f.name] = !!input.checked;
        else if (f.type === 'number') data[f.name] = Number(input.value || 0);
        else data[f.name] = String(input.value || '').trim();
      });
      return data;
    };
    form.addEventListener('submit', e => {
      e.preventDefault();
      try {
        const data = collect();
        if (hasMarkdown) {
          const mdField = fields.find(f => f.type === 'markdown' && f.required);
          if (mdField && !data[mdField.name]) { alert('내용을 입력하세요.'); return; }
          if (mdField && !mdEditors[mdField.name]) { alert('편집기가 준비되지 않았습니다.'); return; }
        }
        const missing = fields.find(f => f.required && f.showWhen && fieldControlValue(f.showWhen.name) === f.showWhen.value && !data[f.name]);
        if (missing) { alert(`${missing.label || missing.name}을(를) 입력하세요.`); return; }
        close(data);
      } catch (err) {
        console.error(err);
        alert(err.message || String(err));
      }
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    form.querySelector('.edit-modal-x').addEventListener('click', () => close(null));
    form.querySelector('[data-preview]')?.addEventListener('click', async () => {
      const mdField = fields.find(f => f.type === 'markdown');
      const ed = mdField ? mdEditors[mdField.name] : null;
      const md = ed ? (ed.getMarkdown?.() || ed.getValue?.() || '') : '';
      await openMarkdownPreview({ markdown: md, title: '미리보기' });
      ed?.refreshLayout?.();
      ed?.focus?.();
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    modalEscapeClose(overlay, close);
    const first = form.querySelector('.edit-field:not(.hidden) input:not([type=checkbox]):not([type=radio]), .edit-field:not(.hidden) textarea, .edit-field:not(.hidden) select');
    if (first) setTimeout(() => first.focus(), 40);
    else {
      const firstMd = Object.values(mdEditors)[0];
      setTimeout(() => { firstMd?.refreshLayout?.(); firstMd?.focus?.(); }, 80);
    }
  });
}


async function editTicket(ticketId){
  if(!currentUser)return;
  try{
    const {doc,getDoc,updateDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'supportTickets',ticketId); const snap=await getDoc(ref); if(!snap.exists())return;
    const t=snap.data(); if(!isAdminUser && t.uid!==currentUser.uid){ alert(tr('no_permission')); return; }
    const data = await openEditModal('문의 수정', [
      {name:'title', label:'제목', value:t.title||'', required:true},
      {name:'content', label:'내용', type:'textarea', value:t.content||'', required:true},
      {name:'status', label:'상태', type:'select', value:t.status||'open', options:[{value:'open',label:'접수'},{value:'answered',label:'답변 완료'},{value:'closed',label:'종료'}]}
    ]);
    if(!data)return;
    await updateDoc(ref,{title:data.title,content:data.content,status:data.status,updatedAt:serverTimestamp()});
    alert(tr('updated'));
  }catch(e){ alert(e.message); }
}
async function deleteTicket(ticketId){
  if(!currentUser || !confirm(tr('confirm_delete')))return;
  try{
    const {doc,getDoc,deleteDoc}=firestoreApi;
    const ref=doc(db,'supportTickets',ticketId); const snap=await getDoc(ref); if(!snap.exists())return;
    const t=snap.data(); if(!isAdminUser && t.uid!==currentUser.uid){ alert(tr('no_permission')); return; }
    await deleteDoc(ref); alert(tr('deleted')); if(page==='ticket.html') location.href='./my-tickets.html';
  }catch(e){ alert(e.message); }
}
async function closeTicket(ticketId){
  if(!currentUser)return;
  try{
    const {doc,getDoc,updateDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'supportTickets',ticketId); const snap=await getDoc(ref); if(!snap.exists())return;
    const t=snap.data(); if(!isAdminUser && t.uid!==currentUser.uid){ alert(tr('no_permission')); return; }
    await updateDoc(ref,{status:'closed',updatedAt:serverTimestamp()});
  }catch(e){ alert(e.message); }
}
function listenMyTickets(){
  const list=$('myTicketList'); if(!list)return;
  if(!currentUser){ list.innerHTML=`<div class="empty-card">${tr('need_login')}</div>`; return; }
  maybeOpenTicketFromQuery();
  const {collection,query,where,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets'),where('uid','==',currentUser.uid));
  addUnsub(onSnapshot(q, snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
    if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
    list.innerHTML=`${hubTicketHeadHtml()}<div class="hub-list-body">${rows.map(t=>ticketShell(t,false,false)).join('')}</div>`;
    bindTicketActions(list);
    if(pendingTicketOpenId) consumePendingTicketOpen(list);
  }, err=>{ console.error(err); list.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
function listenTicketDetail(){
  const box=$('ticketDetail'); if(!box||!currentUser)return;
  const id=getParam('id'); if(!id){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  const {doc,onSnapshot}=firestoreApi;
  let renderedKey = '';
  let detailRepliesUnsub = null;
  addUnsub(onSnapshot(doc(db,'supportTickets',id), snap=>{
    if(!snap.exists()){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
    const t={id:snap.id,...snap.data()};
    if(!isAdminUser && t.uid!==currentUser.uid){ box.innerHTML=`<p class="muted">${tr('no_permission')}</p>`; return; }
    if(isAdminUser && hasUnreadAdminTicket(t)) markAdminTicketRead(id);
    const key = [t.title,t.content,t.status,t.updatedAt?.seconds||t.updatedAt,t.replyAt?.seconds||t.replyAt,(t.attachments||[]).length].join('|');
    if(key !== renderedKey){
      renderedKey = key;
      clearTicketReplyObserver();
      if(detailRepliesUnsub){ try{ detailRepliesUnsub(); }catch{} detailRepliesUnsub=null; }
      box.innerHTML=ticketShell(t,true,isAdminUser);
      const replyBox=box.querySelector(`[data-replies="${CSS.escape(id)}"]`);
      if(replyBox){
        const {collection,query,orderBy,onSnapshot:onRepliesSnap}=firestoreApi;
        const rq=query(collection(db,'supportTickets',id,'replies'),orderBy('createdAt','asc'));
        detailRepliesUnsub = onRepliesSnap(rq, replySnap => {
          const rows=replySnap.docs.map(d=>({id:d.id,...d.data()}));
          replyBox.innerHTML=rows.length
            ? rows.map(r=>ticketReplyItemHtml(r, id, {adminView:false})).join('')
            : '';
          bindTicketReplyActions(replyBox);
          const panel = replyBox.closest('.hub-replies-panel') || replyBox;
          const shouldFocus = getParam('focus') === 'reply' || location.hash === '#ticketReplies';
          if(shouldFocus) requestAnimationFrame(()=>focusTicketReplySection(panel));
          const isOwner = currentUser && t.uid === currentUser.uid;
          if(isOwner && hasUnreadTicketReply(t) && rows.some(r => r.role === 'admin')){
            const watchTarget = panel.querySelector('.reply.is-admin:last-of-type') || panel;
            observeTicketReplyVisibility(id, watchTarget);
          }
        }, err => { console.error('replies',err); replyBox.innerHTML=`<p class="muted">${esc(err.message)}</p>`; });
        addUnsub(detailRepliesUnsub);
      }
      bindReplyForms(box);
    } else if(currentUser && t.uid === currentUser.uid && hasUnreadTicketReply(t)){
      const panel = box.querySelector('.hub-replies-panel');
      const watchTarget = panel?.querySelector('.reply.is-admin:last-of-type') || panel;
      if(watchTarget) observeTicketReplyVisibility(id, watchTarget);
    }
  }, err=>{ console.error(err); box.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
async function ticketReply(e){
  e.preventDefault();
  if(!currentUser)return;
  const form=e.currentTarget;
  const input=form.querySelector('textarea,input');
  if(!input)return;
  const content=input.value.trim();
  const ticketId=form.dataset.ticket;
  if(!content)return;
  try{
    const {collection,addDoc,doc,updateDoc,serverTimestamp}=firestoreApi;
    const replyRef = await addDoc(collection(db,'supportTickets',ticketId,'replies'),{uid:currentUser.uid,role:isAdminUser?'admin':'user',displayName:isAdminUser?BRAND_AUTHOR:(currentUser.displayName||''),content,createdAt:serverTimestamp()});
    const ticketPatch = {status:isAdminUser?'answered':'open', updatedAt:serverTimestamp()};
    if(isAdminUser){
      ticketPatch.replyRead = false;
      ticketPatch.replyNotified = false;
      ticketPatch.replyAt = serverTimestamp();
    } else {
      ticketPatch.adminRead = false;
      ticketPatch.adminNotified = false;
      ticketPatch.adminNotifyKind = 'reply';
      ticketPatch.adminNotifyAt = serverTimestamp();
    }
    await updateDoc(doc(db,'supportTickets',ticketId), ticketPatch);
    if(isAdminUser){
      notifyTicketOwnerReply(ticketId, content, replyRef.id).catch(err=>console.error(err));
    }
    input.value='';
  }catch(e){ console.error(e); alert(e.message || tr('check_failed')); }
}
function filterRows(rows, searchId, statusId, fields){
  const q = normalize($(searchId)?.value || '').toLowerCase();
  const status = $(statusId)?.value || 'all';
  return (rows || []).filter(x => {
    const visible = x.visible !== false;
    const statusOk = status === 'all'
      || (status === 'visible' && visible)
      || (status === 'hidden' && !visible)
      || (status === 'pinned' && !!x.pinned)
      || (status === 'open' && (x.status || 'open') === 'open')
      || (status === 'answered' && x.status === 'answered')
      || (status === 'closed' && x.status === 'closed');
    const hay = fields.map(f => {
      if(f === 'type') return patchNoteType(x);
      return x[f] || '';
    }).join(' ').toLowerCase();
    return statusOk && (!q || hay.includes(q));
  });
}
function statusPill(row){
  if ('status' in row) return `<span class="badge ${esc(row.status || 'open')}">${esc(row.status || 'open')}</span>`;
  const visible = row.visible !== false;
  return `<span class="badge ${visible ? 'active' : 'closed'}">${visible ? '공개' : '비공개'}</span>${row.pinned ? ' <span class="badge pending">고정</span>' : ''}`;
}
function adminActions(collectionName, id){
  return `<div class="table-actions"><button class="secondary mini-btn" data-admin-edit="${collectionName}:${esc(id)}">${tr('edit')}</button><button class="secondary mini-btn danger-btn" data-admin-delete="${collectionName}:${esc(id)}">${tr('del')}</button></div>`;
}
function normalizeAdminCmsTab(v){
  const s=String(v||'').toLowerCase();
  if(s==='patches'||s==='patch'||s==='patchnotes'||s==='patch-notes') return 'patches';
  if(s==='faq') return 'faq';
  if(s==='board'||s==='boardposts'||s==='posts') return 'board';
  return 'notices';
}
function adminCmsCollection(kind){
  return ({notices:'announcements', patches:'patchNotes', faq:'faq', board:'boardPosts'})[kind] || 'announcements';
}
function adminCmsKindFromCollection(name){
  return ({announcements:'notices', patchNotes:'patches', faq:'faq', boardPosts:'board'})[name] || 'notices';
}
function adminCmsTabLabel(kind){
  return ({notices:'공지사항', patches:'패치노트', faq:'FAQ', board:'자유게시판'})[kind] || '콘텐츠';
}
function adminCmsRows(kind){
  if(kind==='patches') return adminPatchRows||[];
  if(kind==='faq') return adminFaqRows||[];
  if(kind==='board') return adminBoardRows||[];
  return adminNoticeRows||[];
}
function adminCmsFind(kind, id){
  return adminCmsRows(kind).find(x=>x.id===id) || null;
}
function adminCmsStay(){
  return page==='admin.html' && !!$('adminCmsList');
}
function openAdminCmsAfterWrite(kind, id){
  if(!adminCmsStay() || !id) return false;
  adminCmsTab = normalizeAdminCmsTab(kind);
  syncAdminCmsTabs();
  renderAdminCmsTable();
  openAdminCmsDrawer(adminCmsTab, id, 'view');
  return true;
}
function adminCmsTitleText(kind, x){
  if(kind==='faq') return x.question || '-';
  if(kind==='patches'){
    const type=patchNoteType(x);
    const ver=patchNoteVersion(x);
    return `${type==='web'?'WEB':'APP'}${ver?` · v${ver}`:''} · ${x.title||'-'}`;
  }
  return x.title || '-';
}
function adminCmsAuthorText(kind, x){
  if(kind==='board') return contentAuthor(x);
  return noticeAuthor(x);
}
function adminCmsStatusHtml(kind, x){
  if(kind==='board'){
    const bits=[x.visible===false?'<span class="badge none">숨김</span>':'<span class="badge active">공개</span>'];
    if(x.pinned) bits.push('<span class="badge pending">고정</span>');
    return bits.join(' ');
  }
  return statusPill(x);
}
function getAdminCmsFilteredRows(){
  const kind=adminCmsTab;
  const q=($('adminCmsSearch')?.value||'').trim().toLowerCase();
  const status=adminCmsStatusApplied || 'all';
  const rows=adminCmsRows(kind).filter(x=>{
    if(kind==='board' && x.deleted===true) return false;
    const visible=x.visible!==false;
    const statusOk = status==='all'
      || (status==='visible' && visible)
      || (status==='hidden' && !visible)
      || (status==='pinned' && !!x.pinned);
    const hay=[
      adminCmsTitleText(kind,x), x.title, x.question, x.answer, x.content, x.version,
      x.displayName, x.email, x.uid, kind==='patches'?patchNoteType(x):''
    ].join(' ').toLowerCase();
    return statusOk && (!q || hay.includes(q));
  });
  if(kind==='faq') rows.sort((a,b)=>Number(a.order||0)-Number(b.order||0) || adminTsSec(b.createdAt)-adminTsSec(a.createdAt));
  else rows.sort((a,b)=>(b.pinned===true)-(a.pinned===true) || adminTsSec(b.createdAt)-adminTsSec(a.createdAt));
  return rows;
}
function updateAdminCmsFilterButton(){
  const btn=$('adminCmsFilterBtn'); if(!btn) return;
  const n = adminCmsStatusApplied!=='all' ? 1 : 0;
  btn.textContent = n ? `필터 ${n}` : '필터';
  btn.classList.toggle('is-active', n>0);
}
function syncAdminCmsTabs(){
  document.querySelectorAll('#adminCmsTabs [data-cms-tab]').forEach(btn=>{
    btn.classList.toggle('is-active', (btn.getAttribute('data-cms-tab')||'notices')===adminCmsTab);
  });
}
function syncAdminCmsHash(postId){
  try{
    if((document.body.dataset.adminView||'')!=='content') return;
    const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
    hash.set('view','content');
    if(adminCmsTab && adminCmsTab!=='notices') hash.set('cms', adminCmsTab); else hash.delete('cms');
    if(postId) hash.set('post', postId); else hash.delete('post');
    history.replaceState(null,'',`#${hash.toString()}`);
  }catch(_){}
}
function setAdminCmsTab(tab, {openId}={}){
  adminCmsTab = normalizeAdminCmsTab(tab);
  document.body.dataset.cmsTab = adminCmsTab;
  syncAdminCmsTabs();
  renderAdminCmsTable();
  if(openId) openAdminCmsDrawer(adminCmsTab, openId, 'view');
  else if(adminCmsDrawerState.id) closeAdminCmsDrawer();
  else syncAdminCmsHash('');
}
function renderAdminCmsTable(){
  const box=$('adminCmsList'); if(!box) return;
  bindAdminCmsChrome();
  syncAdminCmsTabs();
  updateAdminCmsFilterButton();
  const rows=getAdminCmsFilteredRows();
  const total=adminCmsTab==='board'
    ? adminCmsRows(adminCmsTab).filter(x=>x.deleted!==true).length
    : adminCmsRows(adminCmsTab).length;
  const q=($('adminCmsSearch')?.value||'').trim();
  $('adminCmsCount') && ($('adminCmsCount').textContent = (q || adminCmsStatusApplied!=='all') ? `검색 결과 ${rows.length}건` : `${rows.length}건`);
  if(!rows.length){
    box.innerHTML=`<div class="empty-card">${esc(tr('empty'))}</div>`;
    return;
  }
  const extra = adminCmsTab==='board';
  box.innerHTML = `<table class="admin-table admin-cms-table"><thead><tr>
    <th>제목</th><th>상태</th><th>작성자</th><th>작성일</th><th>수정일</th>${extra?'<th>조회</th><th>댓글</th>':''}<th>관리</th>
  </tr></thead><tbody>${rows.map(x=>{
    const sub = extra ? `조회 ${Number(x.viewCount||0)} · 댓글 ${Number(x.commentCount||0)}` : (x.pinned && adminCmsTab!=='board' ? '상단 고정' : '');
    return `<tr class="admin-cms-row${x.visible===false?' is-hidden':''}" data-cms-id="${esc(x.id)}">
      <td class="admin-cms-title"><b>${x.pinned?'📌 ':''}${esc(adminCmsTitleText(adminCmsTab,x))}</b>${sub?`<small>${esc(sub)}</small>`:''}</td>
      <td>${adminCmsStatusHtml(adminCmsTab,x)}</td>
      <td>${esc(adminCmsAuthorText(adminCmsTab,x))}</td>
      <td>${esc(fmtListDate(x.createdAt))}</td>
      <td>${esc(fmtListDate(x.updatedAt||x.createdAt))}</td>
      ${extra?`<td>${Number(x.viewCount||0)}</td><td>${Number(x.commentCount||0)}</td>`:''}
      <td><div class="table-actions" onclick="event.stopPropagation()">
        <button type="button" class="ghost mini-btn" data-cms-view="${esc(x.id)}">보기</button>
        <button type="button" class="secondary mini-btn" data-cms-edit="${esc(x.id)}">수정</button>
        <button type="button" class="secondary mini-btn danger-btn" data-cms-delete="${esc(x.id)}">삭제</button>
      </div></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}
function bindAdminCmsChrome(){
  const tabs=$('adminCmsTabs');
  if(tabs && !tabs.dataset.bound){
    tabs.dataset.bound='1';
    tabs.addEventListener('click', e=>{
      const btn=e.target.closest('[data-cms-tab]'); if(!btn) return;
      closeAdminCmsDrawer();
      setAdminCmsTab(btn.getAttribute('data-cms-tab')||'notices');
    });
  }
  const search=$('adminCmsSearch');
  if(search && !search.dataset.bound){
    search.dataset.bound='1';
    search.addEventListener('input', ()=>renderAdminCmsTable());
  }
  const list=$('adminCmsList');
  if(list && !list.dataset.bound){
    list.dataset.bound='1';
    list.addEventListener('click', e=>{
      const del=e.target.closest('[data-cms-delete]');
      if(del){ e.preventDefault(); deleteAdminCmsItem(adminCmsTab, del.getAttribute('data-cms-delete')); return; }
      const edit=e.target.closest('[data-cms-edit]');
      if(edit){ e.preventDefault(); openAdminCmsDrawer(adminCmsTab, edit.getAttribute('data-cms-edit'), 'edit'); return; }
      const view=e.target.closest('[data-cms-view]');
      if(view){ e.preventDefault(); openAdminCmsDrawer(adminCmsTab, view.getAttribute('data-cms-view'), 'view'); return; }
      const row=e.target.closest('[data-cms-id]');
      if(row) openAdminCmsDrawer(adminCmsTab, row.getAttribute('data-cms-id'), 'view');
    });
  }
  const newBtn=$('adminCmsNewBtn');
  if(newBtn && !newBtn.dataset.bound){
    newBtn.dataset.bound='1';
    newBtn.addEventListener('click', ()=>openAdminCmsDrawer(adminCmsTab, '', 'edit'));
  }
  const drawer=$('adminCmsDrawer');
  if(drawer && !drawer.dataset.bound){
    drawer.dataset.bound='1';
    drawer.addEventListener('click', e=>{
      if(e.target.closest('[data-cms-close]')){ closeAdminCmsDrawer(); return; }
      const act=e.target.closest('[data-cms-act]');
      if(!act) return;
      const name=act.getAttribute('data-cms-act');
      const id=adminCmsDrawerState.id;
      if(name==='edit') openAdminCmsDrawer(adminCmsTab, id, 'edit');
      else if(name==='view') openAdminCmsDrawer(adminCmsTab, id, 'view');
      else if(name==='delete') deleteAdminCmsItem(adminCmsTab, id);
      else if(name==='pin'){
        const next=act.getAttribute('data-pin')==='1';
        adminPinBoardPost(id, next);
        const row=adminCmsFind(adminCmsTab, id);
        if(row){ row.pinned=next; renderAdminCmsView($('adminCmsDrawerBody'), adminCmsTab, row); }
      }
      else if(name==='save') saveAdminCmsDrawer();
      else if(name==='preview') previewAdminCmsDrawer();
    });
    document.addEventListener('keydown', e=>{
      if(e.key!=='Escape') return;
      const pop=$('adminCmsFilterPopover');
      if(pop && !pop.hidden) return;
      if(drawer.hidden) return;
      closeAdminCmsDrawer();
    });
  }
  bindAdminCmsFilterPopover();
}
function bindAdminCmsFilterPopover(){
  const btn=$('adminCmsFilterBtn');
  const pop=$('adminCmsFilterPopover');
  if(!btn || !pop || btn.dataset.bound) return;
  btn.dataset.bound='1';
  const syncSelect=()=>{ if($('adminCmsStatus')) $('adminCmsStatus').value = adminCmsStatusApplied || 'all'; };
  btn.addEventListener('click', e=>{
    e.stopPropagation();
    if(pop.hidden){ syncSelect(); pop.hidden=false; btn.setAttribute('aria-expanded','true'); }
    else { syncSelect(); pop.hidden=true; btn.setAttribute('aria-expanded','false'); }
  });
  pop.addEventListener('click', e=>e.stopPropagation());
  $('adminCmsFilterApply')?.addEventListener('click', ()=>{
    adminCmsStatusApplied = $('adminCmsStatus')?.value || 'all';
    pop.hidden=true; btn.setAttribute('aria-expanded','false');
    renderAdminCmsTable();
  });
  $('adminCmsFilterReset')?.addEventListener('click', ()=>{
    adminCmsStatusApplied='all';
    syncSelect();
    pop.hidden=true; btn.setAttribute('aria-expanded','false');
    renderAdminCmsTable();
  });
  document.addEventListener('click', ()=>{
    if(pop.hidden) return;
    syncSelect();
    pop.hidden=true; btn.setAttribute('aria-expanded','false');
  });
}
function destroyAdminCmsForm(){
  if(!adminCmsFormApi) return;
  try{ adminCmsFormApi.destroy(); }catch(_){}
  adminCmsFormApi=null;
}
function closeAdminCmsDrawer(){
  destroyAdminCmsForm();
  const drawer=$('adminCmsDrawer');
  if(drawer) drawer.hidden=true;
  adminCmsDrawerState = { mode:'view', kind:adminCmsTab, id:'' };
  syncAdminCmsHash('');
}
async function openAdminCmsDrawer(kind, id, mode){
  const drawer=$('adminCmsDrawer');
  const body=$('adminCmsDrawerBody');
  const title=$('adminCmsDrawerTitle');
  if(!drawer || !body) return;
  destroyAdminCmsForm();
  adminCmsTab = normalizeAdminCmsTab(kind);
  adminCmsDrawerState = { mode: mode||'view', kind:adminCmsTab, id:id||'' };
  drawer.hidden=false;
  const isNew = !id;
  const row = id ? adminCmsFind(adminCmsTab, id) : null;
  if(title) title.textContent = isNew ? `새 ${adminCmsTabLabel(adminCmsTab)}` : (row ? adminCmsTitleText(adminCmsTab, row) : adminCmsTabLabel(adminCmsTab));
  if(mode==='edit'){
    await renderAdminCmsEditor(body, adminCmsTab, row);
  } else {
    if(!row){ body.innerHTML=`<p class="muted">${esc(tr('empty'))}</p>`; return; }
    renderAdminCmsView(body, adminCmsTab, row);
  }
  syncAdminCmsHash(id||'');
}
function renderAdminCmsView(body, kind, row){
  const meta=[
    adminCmsStatusHtml(kind, row),
    `<span>${esc(adminCmsAuthorText(kind,row))}</span>`,
    `<span>작성 ${esc(fmtListDate(row.createdAt))}</span>`,
    `<span>수정 ${esc(fmtListDate(row.updatedAt||row.createdAt))}</span>`
  ];
  if(kind==='board'){
    meta.push(`<span>조회 ${Number(row.viewCount||0)}</span>`);
    meta.push(`<span>댓글 ${Number(row.commentCount||0)}</span>`);
  }
  if(kind==='faq' && row.order!=null) meta.push(`<span>순서 ${esc(String(row.order))}</span>`);
  const src = row;
  const pinBtn = kind==='board'
    ? `<button type="button" class="secondary mini-btn" data-cms-act="pin" data-pin="${row.pinned?'0':'1'}">${row.pinned?'고정 해제':'고정'}</button>`
    : '';
  body.innerHTML = `<div class="admin-cms-view">
    <div class="admin-cms-view-meta">${meta.join('')}</div>
    <div class="admin-cms-view-body">${mdBodyHtml(src)}</div>
    <div class="admin-cms-view-actions">
      <button type="button" class="secondary mini-btn" data-cms-act="edit">수정</button>
      ${pinBtn}
      <button type="button" class="secondary mini-btn danger-btn" data-cms-act="delete">삭제</button>
    </div>
  </div>`;
  bindMdIn(body);
}
function adminCmsFormFields(kind, d, isNew){
  if(kind==='notices'){
    return [
      {name:'title', label:'제목', value:d?.title||'', required:true},
      {name:'content', label:'내용', type:'markdown', value:isNew?'':pickMarkdownSource(d), required:true, draftKey:isNew?'hub:announcements:new':`hub:announcements:${d.id}`},
      ...(!isNew?[{name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}]:[]),
      {name:'pinned', label:'상단 고정', type:'checkbox', value:!!d?.pinned}
    ];
  }
  if(kind==='patches'){
    return patchNoteFormFields({
      type: d ? patchNoteType(d) : 'app',
      version: d?.version||'',
      title: d?.title||'',
      contentValue: isNew?'':pickMarkdownSource(d),
      draftKey: isNew?'hub:patchNotes:new':`hub:patchNotes:${d.id}`
    }, isNew ? [] : [{name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}]);
  }
  if(kind==='faq'){
    return [
      {name:'question', label:'질문', value:d?.question||'', required:true},
      {name:'answer', label:'답변', type:'markdown', value:isNew?'':pickMarkdownSource(d), required:true, draftKey:isNew?'hub:faq:new':`hub:faq:${d.id}`},
      {name:'order', label:'순서', type:'number', value:d?.order||1},
      ...(!isNew?[{name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}]:[])
    ];
  }
  return [
    {name:'title', label:'제목', value:d?.title||'', required:true},
    {name:'content', label:'내용', type:'markdown', value:isNew?'':pickMarkdownSource(d), required:true, draftKey:isNew?`board:new`:`board:${d.id}`},
    {name:'pinned', label:'상단 고정', type:'checkbox', value:!!d?.pinned},
    ...(!isNew?[{name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}]:[])
  ];
}
async function renderAdminCmsEditor(container, kind, row){
  const isNew=!row;
  const fields=adminCmsFormFields(kind, row||{}, isNew);
  ensureMarkdownCss();
  const form=document.createElement('form');
  form.className='admin-cms-form';
  form.innerHTML=`<div class="admin-cms-form-body"></div>
    <div class="admin-cms-view-actions">
      <button type="button" class="ghost mini-btn" data-cms-act="${isNew?'': 'view'}" ${isNew?'data-cms-close="1"':''}>취소</button>
      <button type="button" class="secondary mini-btn" data-cms-act="preview">미리보기</button>
      <button type="submit" class="primary mini-btn">저장</button>
    </div>`;
  const body=form.querySelector('.admin-cms-form-body');
  const mdHosts={};
  const mdEditors={};
  for(const f of fields){
    const rowEl=document.createElement(f.type==='markdown'||f.type==='segment'?'div':'label');
    rowEl.className='edit-field'+(f.type==='markdown'?' edit-field-markdown':'')+(f.type==='segment'?' edit-field-segment':'');
    rowEl.dataset.field=f.name;
    rowEl.innerHTML=`<span>${esc(f.label||f.name)}</span>`;
    if(f.type==='markdown'){
      const host=document.createElement('div');
      host.className='md-modal-editor-host';
      rowEl.appendChild(host);
      body.appendChild(rowEl);
      mdHosts[f.name]={host, field:f};
      continue;
    }
    if(f.type==='segment'){
      const wrap=document.createElement('div');
      wrap.className='edit-segment';
      wrap.setAttribute('role','radiogroup');
      const selected=String(f.value||(f.options?.[0]?.value||''));
      (f.options||[]).forEach(opt=>{
        const lab=document.createElement('label');
        lab.className='edit-segment-opt';
        lab.innerHTML=`<input type="radio" name="${esc(f.name)}" value="${esc(opt.value)}" ${String(opt.value)===selected?'checked':''}><span>${esc(opt.label||opt.value)}</span>`;
        wrap.appendChild(lab);
      });
      rowEl.appendChild(wrap);
      body.appendChild(rowEl);
      continue;
    }
    let input;
    if(f.type==='checkbox'){
      rowEl.classList.add('edit-field-check');
      input=document.createElement('input');
      input.type='checkbox';
      input.checked=!!f.value;
    } else if(f.type==='textarea'){
      input=document.createElement('textarea');
      input.rows=f.rows||7;
      input.value=f.value||'';
    } else {
      input=document.createElement('input');
      input.type=f.type||'text';
      input.value=f.value??'';
    }
    input.name=f.name;
    if(f.required && !f.showWhen) input.required=true;
    rowEl.appendChild(input);
    body.appendChild(rowEl);
  }
  container.innerHTML='';
  container.appendChild(form);
  const fieldControlValue=(name)=>{
    const el=form.elements[name];
    if(!el) return '';
    if(el instanceof RadioNodeList) return [...el].find(x=>x.checked)?.value || '';
    return String(el.value||'');
  };
  const syncConditional=()=>{
    fields.forEach(f=>{
      if(!f.showWhen) return;
      const show=fieldControlValue(f.showWhen.name)===f.showWhen.value;
      const rowEl=body.querySelector(`[data-field="${CSS.escape(f.name)}"]`);
      if(rowEl) rowEl.classList.toggle('hidden', !show);
      const input=form.elements[f.name];
      if(input && input instanceof HTMLElement){
        if(show && f.required) input.required=true;
        else input.removeAttribute('required');
      }
    });
  };
  syncConditional();
  form.addEventListener('change', e=>{
    if(fields.some(f=>f.showWhen && f.showWhen.name===e.target?.name)) syncConditional();
  });
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const uid=currentUser?.uid||'anon';
  for(const name of Object.keys(mdHosts)){
    const {host, field}=mdHosts[name];
    try{
      mdEditors[name]=await mountMarkdownEditor(host,{
        value: pickMarkdownSource(field.value),
        height: 280,
        draftKey: field.draftKey || `cms:${kind}:${name}`,
        storagePrefix: `cms-md/${uid}/hub`,
        showActions: false,
        preferToast: false
      });
      mdEditors[name].setMarkdown(pickMarkdownSource(field.value));
      mdEditors[name].refreshLayout();
    }catch(e){
      console.error(e);
      alert('본문 편집기를 열 수 없습니다: '+(e.message||e));
    }
  }
  const collect=()=>{
    const data={};
    fields.forEach(f=>{
      if(f.type==='markdown'){
        const ed=mdEditors[f.name];
        data[f.name]=String(ed?.getMarkdown?.()||ed?.getValue?.()||'').trim();
        data.contentMarkdown=data[f.name];
        return;
      }
      const input=form.elements[f.name];
      if(!input) return;
      if(f.type==='checkbox') data[f.name]=!!(input.checked);
      else if(f.type==='number') data[f.name]=Number(input.value||0);
      else if(input instanceof RadioNodeList) data[f.name]=[...input].find(x=>x.checked)?.value || '';
      else data[f.name]=String(input.value||'').trim();
    });
    return data;
  };
  adminCmsFormApi={
    fields,
    collect,
    mdEditors,
    destroy(){ Object.values(mdEditors).forEach(ed=>{ try{ed.destroy();}catch(_){ } }); }
  };
  form.addEventListener('submit', e=>{
    e.preventDefault();
    saveAdminCmsDrawer();
  });
}
async function previewAdminCmsDrawer(){
  if(!adminCmsFormApi) return;
  const mdField=adminCmsFormApi.fields.find(f=>f.type==='markdown');
  const ed=mdField ? adminCmsFormApi.mdEditors[mdField.name] : null;
  const md=ed ? (ed.getMarkdown?.()||ed.getValue?.()||'') : '';
  await openMarkdownPreview({ markdown: md, title:'미리보기' });
  ed?.refreshLayout?.();
}
async function saveAdminCmsDrawer(){
  if(!isAdminUser) return alert(tr('no_permission'));
  if(!adminCmsFormApi) return;
  let data=adminCmsFormApi.collect();
  const mdField=adminCmsFormApi.fields.find(f=>f.type==='markdown' && f.required);
  if(mdField && !data[mdField.name]) return alert('내용을 입력하세요.');
  const kind=adminCmsDrawerState.kind;
  const id=adminCmsDrawerState.id;
  try{
    if(kind==='patches'){
      data=normalizePatchNoteWrite(data);
      if(!data) return;
    }
    if(!id){
      const newId=await adminCmsCreate(kind, data);
      if(newId){
        adminFlash(tr('saved'));
        openAdminCmsDrawer(kind, newId, 'view');
      }
      return;
    }
    await adminCmsUpdate(kind, id, data);
    adminFlash(tr('updated'));
    openAdminCmsDrawer(kind, id, 'view');
  }catch(e){ alert(e.message||e); }
}
async function adminCmsCreate(kind, data){
  if(kind==='notices'){
    return adminAdd('announcements',{title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', pinned:!!data.pinned, viewCount:0, email:currentUser?.email||''});
  }
  if(kind==='patches'){
    const payload={type:data.type, title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', viewCount:0, email:currentUser?.email||''};
    if(data.type==='app') payload.version=data.version;
    return adminAdd('patchNotes', payload);
  }
  if(kind==='faq'){
    return adminAdd('faq',{question:data.question, answer:data.answer, contentMarkdown:data.answer, contentFormat:'markdown', order:Number(data.order||1)});
  }
  return adminAdd('boardPosts',{
    title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown',
    deleted:false, edited:false, category:'free', email:boardEmail(),
    authorLicensed:false, pinned:!!data.pinned, commentCount:0, viewCount:0, likeCount:0, attachments:[]
  });
}
async function adminCmsUpdate(kind, id, data){
  const {doc,updateDoc,setDoc,serverTimestamp}=firestoreApi;
  const collectionName=adminCmsCollection(kind);
  const ref=doc(db,collectionName,id);
  if(kind==='notices'){
    await updateDoc(ref,{title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', visible:data.visible!==false, pinned:!!data.pinned, updatedAt:serverTimestamp()});
    return;
  }
  if(kind==='patches'){
    const patch={type:data.type, title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', visible:data.visible!==false, updatedAt:serverTimestamp()};
    if(data.type==='app') patch.version=data.version;
    await updateDoc(ref, patch);
    return;
  }
  if(kind==='faq'){
    await updateDoc(ref,{question:data.question, answer:data.answer, contentMarkdown:data.answer, contentFormat:'markdown', order:Number(data.order||1), visible:data.visible!==false, updatedAt:serverTimestamp()});
    return;
  }
  await setDoc(ref,{
    title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown',
    visible:data.visible!==false, pinned:!!data.pinned, edited:true, updatedAt:serverTimestamp()
  },{merge:true});
}
async function deleteAdminCmsItem(kind, id){
  if(!id) return;
  if(kind==='board'){
    const ok=await adminDeleteBoardPost(id);
    if(ok && adminCmsDrawerState.id===id) closeAdminCmsDrawer();
    renderAdminCmsTable();
    return;
  }
  await deleteAdminPost(`${adminCmsCollection(kind)}:${id}`);
}
function renderAdminPostTable(kind){
  if($('adminCmsList')){
    renderAdminCmsTable();
    return;
  }
  const cfg = {
    notices: {box:'adminNoticeList', count:'adminNoticeCount', rows:adminNoticeRows, search:'adminNoticeSearch', status:'adminNoticeStatus', collection:'announcements', fields:['title','content'], title:x=>esc(x.title||'-'), sub:x=>x.pinned?'상단 고정':'', date:x=>fmtDate(x.createdAt)},
    patches: {box:'adminPatchList', count:'adminPatchCount', rows:adminPatchRows, search:'adminPatchSearch', status:'adminPatchStatus', collection:'patchNotes', fields:['type','version','title','content'], title:x=>{
      const kind=patchNoteType(x);
      const ver=patchNoteVersion(x);
      return `${kind==='web'?'WEB':'APP'}${ver?` · v${esc(ver)}`:''} · ${esc(x.title||'-')}`;
    }, sub:x=>'', date:x=>fmtDate(x.createdAt)},
    faq: {box:'adminFaqList', count:'adminFaqCount', rows:adminFaqRows, search:'adminFaqSearch', status:'adminFaqStatus', collection:'faq', fields:['question','answer'], title:x=>esc(x.question||'-'), sub:x=>`#${esc(x.order||'')}`, date:x=>fmtDate(x.createdAt)}
  }[kind];
  const box=$(cfg.box); if(!box)return;
  const rows=filterRows(cfg.rows,cfg.search,cfg.status,cfg.fields);
  $(cfg.count) && ($(cfg.count).textContent = `${rows.length} / ${cfg.rows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML = `<table class="admin-table"><thead><tr><th>제목</th><th>상태</th><th>작성일</th><th>관리</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${cfg.title(x)}</b>${cfg.sub(x)?`<small>${cfg.sub(x)}</small>`:''}</td><td>${statusPill(x)}</td><td>${esc(cfg.date(x))}</td><td>${adminActions(cfg.collection,x.id)}</td></tr>`).join('')}</tbody></table>`;
  bindAdminPostActions(box);
}
function adminTicketStatusLabel(st){
  const v=String(st||'open').toLowerCase();
  return ({open:'미답변', pending:'처리 중', answered:'답변완료', closed:'종료'})[v] || st || '미답변';
}
function ticketStatusPill(row){
  const st=String(row?.status||'open').toLowerCase();
  const cls = st==='answered'?'answered':st==='closed'?'closed':st==='pending'?'pending':'open';
  return `<span class="badge ${esc(cls)}">${esc(adminTicketStatusLabel(st))}</span>`;
}
function adminTicketCategoryKo(v){
  return ({
    login:'로그인/계정',
    license:'라이선스',
    payment:'결제/환불',
    bug:'오류/버그',
    feature:'기능 문의',
    other:'기타'
  })[v] || ticketCategoryLabel(v);
}
function fillAdminTicketCategorySelect(){
  const el=$('adminTicketCategory');
  if(!el || el.dataset.filled==='1') return;
  el.innerHTML = `<option value="all">유형: 전체</option>` + TICKET_CATEGORIES.map(x=>`<option value="${esc(x.value)}">${esc(adminTicketCategoryKo(x.value))}</option>`).join('');
  el.dataset.filled='1';
}
function ticketInDateRange(t, range){
  if(!range || range==='all') return true;
  const ms=licenseTsMs(t.updatedAt||t.createdAt);
  if(!ms) return false;
  const now=Date.now();
  const start=new Date(); start.setHours(0,0,0,0);
  if(range==='today') return ms>=start.getTime();
  if(range==='7d') return ms>=now-7*86400000;
  if(range==='30d') return ms>=now-30*86400000;
  return true;
}
function fmtAdminStamp(v){
  const ms=licenseTsMs(v);
  if(!ms) return '-';
  const d=new Date(ms);
  if(!Number.isFinite(d.getTime())) return '-';
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function syncAdminTicketTabs(){
  const st=$('adminTicketStatus')?.value || 'all';
  document.querySelectorAll('#adminTicketTabs [data-ticket-tab]').forEach(btn=>{
    btn.classList.toggle('is-active', (btn.getAttribute('data-ticket-tab')||'all')===st);
  });
  const counts={all:adminTicketRows.length, open:0, answered:0, closed:0};
  adminTicketRows.forEach(t=>{
    const s=String(t.status||'open');
    if(s in counts) counts[s]++;
  });
  document.querySelectorAll('#adminTicketTabs [data-ticket-count]').forEach(el=>{
    const key=el.getAttribute('data-ticket-count');
    el.textContent = String(counts[key] ?? 0);
  });
}
function bindAdminTicketTabs(){
  const host=$('adminTicketTabs');
  if(!host || host.dataset.bound==='1') return;
  host.dataset.bound='1';
  host.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-ticket-tab]');
    if(!btn) return;
    const next=btn.getAttribute('data-ticket-tab') || 'all';
    const sel=$('adminTicketStatus');
    if(sel) sel.value=next;
    syncAdminTicketTabs();
    renderAdminTicketTable();
    try{
      const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
      hash.set('view','tickets');
      if(next==='all') hash.delete('ticket'); else hash.set('ticket', next);
      history.replaceState(null,'',`#${hash.toString()}`);
    }catch(_){}
  });
}
function getAdminTicketFilteredRows(){
  const cat=$('adminTicketCategory')?.value || 'all';
  const range=$('adminTicketDate')?.value || 'all';
  return filterRows(adminTicketRows,'adminTicketSearch','adminTicketStatus',['title','content','email','uid','category'])
    .filter(t => (cat==='all' || t.category===cat) && ticketInDateRange(t, range))
    .sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
}
let adminTicketReplyUnsub = null;
function stopAdminTicketReplies(){
  if(typeof adminTicketReplyUnsub === 'function'){
    try{ adminTicketReplyUnsub(); }catch(_){}
  }
  adminTicketReplyUnsub = null;
}
function mountAdminTicketExpandPanel(box){
  stopAdminTicketReplies();
  if(!box) return;
  const openId = box.dataset.openTicketId || '';
  if(!openId) return;
  const replyBox = box.querySelector(`[data-replies="${CSS.escape(openId)}"]`);
  if(!replyBox) return;
  const {collection,query,orderBy,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets',openId,'replies'),orderBy('createdAt','asc'));
  adminTicketReplyUnsub = onSnapshot(q, snap => {
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    replyBox.innerHTML = rows.length
      ? rows.map(r=>ticketReplyItemHtml(r, openId, {adminView:true})).join('')
      : `<p class="muted">아직 답변이 없습니다.</p>`;
    bindTicketReplyActions(replyBox);
  }, err => {
    console.error('admin replies', err);
    replyBox.innerHTML = `<p class="muted">${esc(err.message||String(err))}</p>`;
  });
  bindReplyForms(box);
}
function renderAdminTicketTable(){
  const box=$('adminTicketList'); if(!box||!isAdminUser)return;
  fillAdminTicketCategorySelect();
  bindAdminTicketTabs();
  syncAdminTicketTabs();
  if(pendingAdminTicketOpenId) consumePendingAdminTicketOpen(box);
  const rows=getAdminTicketFilteredRows();
  $('adminTicketCount') && ($('adminTicketCount').textContent = `${rows.length} / ${adminTicketRows.length}`);
  if(!rows.length){
    stopAdminTicketReplies();
    box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`;
    return;
  }
  const openId = box.dataset.openTicketId || '';
  const draftEl = openId ? box.querySelector(`[data-ticket="${CSS.escape(openId)}"] textarea, [data-ticket="${CSS.escape(openId)}"] input`) : null;
  const draftReply = draftEl ? String(draftEl.value || '') : '';
  box.innerHTML = `<table class="admin-table admin-ticket-table"><thead><tr>
    <th style="width:36px"><label class="admin-ticket-check"><input type="checkbox" id="adminTicketSelectAll" aria-label="전체 선택"></label></th>
    <th>유형</th><th>제목</th><th>사용자</th><th>상태</th><th>수정일</th>
  </tr></thead><tbody>${rows.map(t=>{
    const open = openId===t.id;
    const metaBits=[
      t.category?`<span><em>유형</em>${esc(adminTicketCategoryKo(t.category))}</span>`:'',
      t.appVersion?`<span><em>버전</em>${esc(t.appVersion)}</span>`:'',
      t.os?`<span><em>OS</em>${esc(ticketOsLabel(t.os))}</span>`:'',
      t.email?`<span><em>이메일</em>${esc(t.email)}</span>`:''
    ].filter(Boolean).join('');
    const unreadAdmin = hasUnreadAdminTicket(t) ? ' is-unread' : '';
    return `<tr class="admin-ticket-row${open?' is-open':''}${unreadAdmin}" data-ticket-row="${esc(t.id)}">
      <td><label class="admin-ticket-check" onclick="event.stopPropagation()"><input type="checkbox" data-ticket-check="${esc(t.id)}"></label></td>
      <td class="admin-ticket-cat">${esc(adminTicketCategoryKo(t.category))}</td>
      <td class="admin-ticket-title">
        <button type="button" class="admin-ticket-title-btn" data-ticket-expand="${esc(t.id)}" aria-expanded="${open?'true':'false'}">
          <b>${esc(t.title||'-')}</b>
        </button>
      </td>
      <td class="admin-ticket-user">${esc(t.email||t.uid||'')}</td>
      <td class="admin-ticket-status">${ticketStatusPill(t)}</td>
      <td class="admin-ticket-date">${esc(fmtAdminStamp(t.updatedAt||t.createdAt))}</td>
    </tr>
    <tr class="admin-ticket-expand" data-ticket-panel="${esc(t.id)}" ${open?'':'hidden'}>
      <td colspan="6"><div class="admin-ticket-expand-inner">
        <div class="admin-ticket-meta">${metaBits}</div>
        <div class="admin-ticket-body">${nl2br(t.content||'') || '<span class="muted">내용 없음</span>'}</div>
        ${ticketAttachmentsHtml(t.attachments)}
        <div class="admin-ticket-replies-block">
          <h4>답변</h4>
          <div class="admin-ticket-replies" data-replies="${esc(t.id)}"></div>
          <form class="reply-form admin-ticket-reply-form" data-ticket="${esc(t.id)}">
            <textarea rows="3" placeholder="${esc(tr('reply_placeholder'))}" required></textarea>
            <div class="admin-ticket-reply-actions">
              <button class="primary mini-btn" type="submit">답변 등록</button>
              <button type="button" class="secondary mini-btn" data-ticket-close="${esc(t.id)}">${tr('close')}</button>
            </div>
          </form>
        </div>
      </div></td>
    </tr>`;
  }).join('')}</tbody></table>`;
  if(draftReply){
    const nextDraft = box.querySelector(`[data-ticket="${CSS.escape(openId)}"] textarea, [data-ticket="${CSS.escape(openId)}"] input`);
    if(nextDraft) nextDraft.value = draftReply;
  }
  bindAdminTicketTable(box);
  mountAdminTicketExpandPanel(box);
}
function bindAdminTicketTable(box){
  if(!box) return;
  if(!box.dataset.ticketTableBound){
    box.dataset.ticketTableBound='1';
    box.addEventListener('click', (e)=>{
      const expandBtn = e.target.closest('[data-ticket-expand]');
      if(expandBtn){
        e.preventDefault();
        const id = expandBtn.getAttribute('data-ticket-expand');
        const next = box.dataset.openTicketId === id ? '' : id;
        box.dataset.openTicketId = next;
        if(next) markAdminTicketRead(next);
        renderAdminTicketTable();
        return;
      }
    });
    box.addEventListener('change', (e)=>{
      if(e.target?.id === 'adminTicketSelectAll'){
        const on = !!e.target.checked;
        box.querySelectorAll('[data-ticket-check]').forEach(cb=>{ cb.checked = on; });
      }
    });
  }
  bindTicketActions(box);
  const delSel = $('adminTicketDeleteSelected');
  const delAll = $('adminTicketDeleteAll');
  if(delSel && !delSel.dataset.bound){
    delSel.dataset.bound='1';
    delSel.addEventListener('click', ()=>deleteAdminTicketsSelected());
  }
  if(delAll && !delAll.dataset.bound){
    delAll.dataset.bound='1';
    delAll.addEventListener('click', ()=>deleteAdminTicketsAllFiltered());
  }
}
function selectedAdminTicketIds(){
  return [...document.querySelectorAll('#adminTicketList [data-ticket-check]:checked')]
    .map(el=>el.getAttribute('data-ticket-check'))
    .filter(Boolean);
}
async function deleteAdminTicketsByIds(ids){
  if(!isAdminUser) return alert(tr('no_permission'));
  const list = [...new Set((ids||[]).filter(Boolean))];
  if(!list.length) return alert('삭제할 문의를 선택해 주세요.');
  if(!confirm(`${list.length}건의 문의를 삭제할까요?`)) return;
  try{
    const {doc, deleteDoc}=firestoreApi;
    for(const id of list){
      await deleteDoc(doc(db,'supportTickets', id));
    }
    adminFlash(`${list.length}건 삭제됨`);
    const box=$('adminTicketList');
    if(box) box.dataset.openTicketId = '';
  }catch(e){ alert(e.message||e); }
}
async function deleteAdminTicketsSelected(){
  await deleteAdminTicketsByIds(selectedAdminTicketIds());
}
async function deleteAdminTicketsAllFiltered(){
  const rows = getAdminTicketFilteredRows();
  if(!rows.length) return alert('삭제할 문의가 없습니다.');
  if(!confirm(`현재 목록 ${rows.length}건을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
  await deleteAdminTicketsByIds(rows.map(t=>t.id));
}
function bindAdminPostActions(root=document){
  root.querySelectorAll('[data-admin-edit]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>editAdminPost(btn.dataset.adminEdit)); });
  root.querySelectorAll('[data-admin-delete]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>deleteAdminPost(btn.dataset.adminDelete)); });
}
function bindAdminFilters(){
  [['adminNoticeSearch','notices'],['adminNoticeStatus','notices'],['adminPatchSearch','patches'],['adminPatchStatus','patches'],['adminFaqSearch','faq'],['adminFaqStatus','faq']].forEach(([id,kind])=>{
    const el=$(id); if(!el || el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',()=>renderAdminPostTable(kind)); el.addEventListener('change',()=>renderAdminPostTable(kind));
  });
  [['adminTicketSearch'],['adminTicketStatus'],['adminTicketCategory'],['adminTicketDate']].forEach(([id])=>{ const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',renderAdminTicketTable); el.addEventListener('change',renderAdminTicketTable); });
  bindAdminTicketTabs();
  fillAdminTicketCategorySelect();
}
async function editAdminPost(raw){
  if(!isAdminUser)return alert(tr('no_permission'));
  const [collectionName,id]=String(raw).split(':');
  try{
    const {doc,getDoc,updateDoc,serverTimestamp}=firestoreApi; const ref=doc(db,collectionName,id); const snap=await getDoc(ref); if(!snap.exists())return;
    const d=snap.data();
    let data=null;
    if(collectionName==='announcements'){
      data = await openEditModal('공지 수정', [
        {name:'title', label:'제목', value:d.title||'', required:true},
        {name:'content', label:'내용', type:'markdown', value:pickMarkdownSource(d), required:true, draftKey:`hub:announcements:${id}`},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false},
        {name:'pinned', label:'상단 고정', type:'checkbox', value:!!d.pinned}
      ]);
      if(!data)return;
      data.contentFormat='markdown';
      data.contentMarkdown=data.content;
      data.updatedAt=serverTimestamp();
    } else if(collectionName==='patchNotes'){
      data = await openEditModal('패치노트 수정', patchNoteFormFields({
        type:patchNoteType(d),
        version:d.version||'',
        title:d.title||'',
        contentValue:pickMarkdownSource(d),
        draftKey:`hub:patchNotes:${id}`
      }, [
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}
      ]));
      if(!data)return;
      data = normalizePatchNoteWrite(data);
      if(!data)return;
      data.contentFormat='markdown';
      data.contentMarkdown=data.content;
      data.updatedAt=serverTimestamp();
    } else if(collectionName==='faq'){
      data = await openEditModal('FAQ 수정', [
        {name:'question', label:'질문', value:d.question||'', required:true},
        {name:'answer', label:'답변', type:'markdown', value:pickMarkdownSource(d), required:true, draftKey:`hub:faq:${id}`},
        {name:'order', label:'순서', type:'number', value:d.order||1},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}
      ]);
      if(!data)return;
      data.contentFormat='markdown';
      data.contentMarkdown=data.answer;
      data.order=Number(data.order||1);
      data.updatedAt=serverTimestamp();
    }
    if(!data)return;
    await updateDoc(ref,data); adminFlash(tr('updated'));
    if(adminCmsStay()){
      const kind=adminCmsKindFromCollection(collectionName);
      if(adminCmsDrawerState.id===id) openAdminCmsDrawer(kind, id, 'view');
      else renderAdminCmsTable();
    }
  }catch(e){ alert(e.message); }
}
async function deleteAdminPost(raw){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!confirm(tr('confirm_delete')))return false;
  const [collectionName,id]=String(raw).split(':');
  try{
    const {doc,deleteDoc}=firestoreApi;
    await deleteDoc(doc(db,collectionName,id));
    adminFlash(tr('deleted'));
    if(adminCmsStay()){
      if(adminCmsDrawerState.id===id) closeAdminCmsDrawer();
      renderAdminCmsTable();
      return true;
    }
    if(page==='notice.html' && collectionName==='announcements') location.href='./notices.html';
    else if(page==='patch-note.html' && collectionName==='patchNotes') location.href='./patch-notes.html';
    return true;
  }catch(e){ alert(e.message); return false; }
}
function listenAdminTickets(){
  const list=$('adminTicketList'); if(!list||!isAdminUser)return;
  bindAdminFilters();
  const {collection,onSnapshot}=firestoreApi;
  addUnsub(onSnapshot(collection(db,'supportTickets'), snap=>{
    adminTicketRows=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAdminTicketTable();
  }, err=>{ console.error(err); list.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
function listenAdminPostManager(){
  if(!isAdminUser)return;
  if(listenAdminPostManager._on) {
    if($('adminCmsList')) renderAdminCmsTable();
    return;
  }
  bindAdminFilters();
  bindAdminCmsChrome();
  const wantsCms = !!($('adminCmsList') || $('adminNoticeList') || $('adminPatchList') || $('adminFaqList'));
  if(!wantsCms) return;
  listenAdminPostManager._on=true;
  const {collection,onSnapshot,query,orderBy}=firestoreApi;
  const paint=()=>{ if($('adminCmsList')) renderAdminCmsTable(); };
  if($('adminCmsList') || $('adminNoticeList')) addUnsub(onSnapshot(query(collection(db,'announcements'),orderBy('createdAt','desc')), snap=>{ adminNoticeRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('notices'); paint(); }));
  if($('adminCmsList') || $('adminPatchList')) addUnsub(onSnapshot(query(collection(db,'patchNotes'),orderBy('createdAt','desc')), snap=>{ adminPatchRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('patches'); paint(); }));
  if($('adminCmsList') || $('adminFaqList')) addUnsub(onSnapshot(query(collection(db,'faq'),orderBy('order','asc')), snap=>{ adminFaqRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('faq'); paint(); }));
}


function adminStat(id, value){ const el=$(id); if(el) el.textContent = String(value ?? 0); }
function countVisible(rows){ return rows.filter(x=>x.visible !== false).length; }
function listenAdminDashboard(){
  if(!isAdminUser || !$('dashUsers')) return;
  const {collection,onSnapshot}=firestoreApi;
  const watch = (name, cb) => addUnsub(onSnapshot(collection(db,name), snap => cb(snap.docs.map(d=>({id:d.id,...d.data()}))), err => console.error(name, err)));
  watch('users', rows => { adminStat('dashUsers', rows.length); adminUserRows = rows; renderAdminUserTable(); refreshAdminCrmDetail(); });
  watch('licenses', rows => {
    adminLicenseRows = rows;
    adminStat('dashLicenses', rows.filter(x=>x.licensed===true && String(x.status||'').toLowerCase()==='active').length);
    renderAdminUserTable();
    refreshAdminCrmDetail();
  });
  watch('supportTickets', rows => {
    adminTicketRows = rows;
    adminStat('dashOpenTickets', rows.filter(x=>String(x.status||'open')==='open').length);
    renderAdminUserTable();
    refreshAdminCrmDetail();
  });
  watch('announcements', rows => { adminStat('dashNotices', countVisible(rows)); });
  watch('patchNotes', rows => { adminStat('dashPatches', countVisible(rows)); });
  watch('orders', rows => { adminOrderRows = rows; adminStat('dashOrders', rows.length); renderAdminUserTable(); refreshAdminCrmDetail(); });
  if($('adminBoardList')) addUnsub(onSnapshot(collection(db,'boardPosts'), snap=>{ adminBoardRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminBoardTable(); }));
}

/**
 * Admin CRM identity + license resolution.
 * Source of truth for licenses is licenses/{FirebaseAuthUID} (same as account loadLicense).
 * Never assume u.id === u.uid; never fall back missing license → trial.
 */
function adminUserDocId(u){ return String(u?.id || '').trim(); }
function adminUserFieldUid(u){ return String(u?.uid || '').trim(); }
function adminIdentityKey(u){ return adminUserDocId(u) || adminUserFieldUid(u); }

function adminIdentityForUser(u){
  const key = adminIdentityKey(u);
  if(key && adminIdentityCache[key]) return adminIdentityCache[key];
  // provisional before resolve finishes
  const docId = adminUserDocId(u);
  const fieldUid = adminUserFieldUid(u);
  return {
    userDocId: docId,
    fieldUid,
    canonicalUid: fieldUid || docId,
    license: null,
    licenseState: adminLicensesLoaded ? 'missing' : 'loading',
    conflict: false,
    error: false
  };
}

/** Canonical Auth UID for CRM lookups (licenses/orders/tickets/usage). */
function adminUserUid(u){
  const idn = adminIdentityForUser(u);
  return String(idn.canonicalUid || idn.fieldUid || idn.userDocId || '');
}

function adminUserDocIdForUid(uid){
  const hit = Object.values(adminIdentityCache).find(x=>x.canonicalUid===uid || x.userDocId===uid || x.fieldUid===uid);
  if(hit?.userDocId) return hit.userDocId;
  const row = adminUserRows.find(u=>adminUserUid(u)===uid || u.id===uid || String(u.uid||'')===uid);
  return row ? adminUserDocId(row) : String(uid||'');
}

function findAdminUserRow(uid){
  const s=String(uid||'');
  return adminUserRows.find(u=>{
    const idn=adminIdentityForUser(u);
    return idn.canonicalUid===s || idn.userDocId===s || idn.fieldUid===s || String(u.id||'')===s || String(u.uid||'')===s;
  }) || null;
}

function licenseForUid(uid){
  const s=String(uid||'');
  if(!s) return null;
  if(adminLicenseCache[s]) return adminLicenseCache[s];
  const idn = Object.values(adminIdentityCache).find(x=>x.canonicalUid===s || x.userDocId===s || x.fieldUid===s);
  if(idn?.license) return idn.license;
  return adminLicenseRows.find(x=>x.id===s || x.uid===s) || null;
}

/** Normalized CRM license view shared by badge/stats/filter/detail. */
function adminLicenseView(uidOrUser){
  const u = typeof uidOrUser==='object' && uidOrUser ? uidOrUser : findAdminUserRow(uidOrUser);
  const uid = typeof uidOrUser==='string' ? uidOrUser : adminUserUid(u);
  const idn = u ? adminIdentityForUser(u) : Object.values(adminIdentityCache).find(x=>x.canonicalUid===uid);
  if(!adminLicensesLoaded){
    return { state:'loading', license:null, plan:null, status:null, kind:null, uid };
  }
  if(idn?.conflict){
    return { state:'conflict', license:null, plan:null, status:null, kind:null, uid };
  }
  if(idn?.error){
    return { state:'error', license:null, plan:null, status:null, kind:null, uid };
  }
  const lic = idn?.license || licenseForUid(uid);
  if(!lic){
    return { state:'missing', license:null, plan:null, status:null, kind:null, uid };
  }
  const plan = normalizePlan(lic);
  const status = normalizeStatus(lic);
  return {
    state:'ok',
    license: lic,
    plan,
    status,
    kind: status==='banned' ? 'banned' : (status==='expired' ? 'expired' : plan),
    uid
  };
}

function adminUidAliases(uid){
  const s=String(uid||'');
  const set = new Set([s].filter(Boolean));
  const idn = Object.values(adminIdentityCache).find(x=>x.canonicalUid===s || x.userDocId===s || x.fieldUid===s);
  if(idn){
    if(idn.canonicalUid) set.add(idn.canonicalUid);
    if(idn.userDocId) set.add(idn.userDocId);
    if(idn.fieldUid) set.add(idn.fieldUid);
  }
  return set;
}

function adminOrdersForUid(uid){
  const ids = adminUidAliases(uid);
  return (adminOrderRows||[])
    .filter(o=>{
      const ou = String(o.uid || o.userId || o.customerUid || '');
      return ou && ids.has(ou);
    })
    .sort((a,b)=>adminTsSec(b.completedAt||b.verifiedAt||b.createdAt||b.updatedAt)-adminTsSec(a.completedAt||a.verifiedAt||a.createdAt||a.updatedAt));
}
function adminTicketsForUid(uid){
  const ids = adminUidAliases(uid);
  return (adminTicketRows||[])
    .filter(t=>{
      const tu = String(t.uid || t.userId || t.authorUid || '');
      return tu && ids.has(tu);
    })
    .sort((a,b)=>adminTsSec(b.createdAt||b.updatedAt)-adminTsSec(a.createdAt||a.updatedAt));
}
function adminBoardPostsForUid(uid){
  const ids = adminUidAliases(uid);
  return (adminBoardRows||[])
    .filter(p=>p.deleted!==true)
    .filter(p=>{
      const pu = String(p.uid || p.authorUid || '');
      return pu && ids.has(pu);
    })
    .sort((a,b)=>adminTsSec(b.createdAt||b.updatedAt)-adminTsSec(a.createdAt||a.updatedAt));
}
function adminTsSec(v){
  const ms=licenseTsMs(v);
  return ms ? Math.floor(ms/1000) : 0;
}

/**
 * Resolve canonical Auth UID from license probes (READ-ONLY decision).
 * Rules: prefer licenses/{u.uid} if exists; else licenses/{u.id};
 * both distinct docs → conflict; neither → missing.
 */
function resolveAdminCanonicalFromLicenseProbes(docId, fieldUid, idProbe, uidProbe){
  const id = String(docId||'').trim();
  const fu = String(fieldUid||'').trim();
  const same = !!(id && fu && id===fu);
  const idOk = !!(id && idProbe?.exists);
  const uidOk = !!(fu && uidProbe?.exists);
  const idErr = !!(id && idProbe?.error);
  const uidErr = !!(fu && uidProbe?.error);
  const errCode = String(uidProbe?.errorCode || idProbe?.errorCode || '');

  if(same){
    const probe = uidProbe?.exists || uidProbe?.error ? uidProbe : idProbe;
    if(probe?.exists){
      return { canonicalUid:id, license:probe.data||null, conflict:false, error:false, licenseState:'ok', errorCode:'' };
    }
    if(probe?.error){
      return { canonicalUid:id, license:null, conflict:false, error:true, licenseState:'error', errorCode: probe.errorCode||errCode };
    }
    return { canonicalUid:id, license:null, conflict:false, error:false, licenseState:'missing', errorCode:'' };
  }

  if(uidOk && idOk && id!==fu){
    return { canonicalUid:'', license:null, conflict:true, error:false, licenseState:'conflict', errorCode:'' };
  }
  // Prefer successful probe even if the other candidate errored (section isolation).
  if(uidOk){
    return { canonicalUid:fu, license:uidProbe.data||null, conflict:false, error:false, licenseState:'ok', errorCode:'' };
  }
  if(idOk){
    return { canonicalUid:id, license:idProbe.data||null, conflict:false, error:false, licenseState:'ok', errorCode:'' };
  }
  // one candidate only (no license doc) — still usable as alias key
  if(fu && !id){
    return { canonicalUid:fu, license:null, conflict:false, error:!!uidErr, licenseState: uidErr?'error':'missing', errorCode: uidErr?(uidProbe.errorCode||errCode):'' };
  }
  if(id && !fu){
    return { canonicalUid:id, license:null, conflict:false, error:!!idErr, licenseState: idErr?'error':'missing', errorCode: idErr?(idProbe.errorCode||errCode):'' };
  }
  // both candidates, neither license exists
  if(uidErr || idErr){
    return { canonicalUid:fu||id, license:null, conflict:false, error:true, licenseState:'error', errorCode: errCode };
  }
  return { canonicalUid:fu||id, license:null, conflict:false, error:false, licenseState:'missing', errorCode:'' };
}

function adminFsErrorMeta(e){
  const code = String(e?.code || e?.name || '');
  const message = String(e?.message || e || '');
  return { code, message };
}
async function probeAdminLicenseDoc(getDoc, docRefFn, uid){
  if(!uid) return { exists:false, data:null, error:false, errorCode:'' };
  try{
    const snap = await getDoc(docRefFn(uid));
    if(snap.exists()) return { exists:true, data:{ id:snap.id, ...snap.data() }, error:false, errorCode:'' };
    return { exists:false, data:null, error:false, errorCode:'' };
  }catch(e){
    const meta = adminFsErrorMeta(e);
    console.warn('probeAdminLicenseDoc', uid, meta.code, meta.message, e);
    return { exists:false, data:null, error:true, errorCode: meta.code || 'unknown' };
  }
}

/** Past expiresAt → keep status active, convert plan to trial and clear dates. */
function periodExpiredToTrialPatch(serverTimestamp, deleteField){
  return {
    plan:'trial',
    licensed:true,
    status:'active',
    startsAt: deleteField(),
    expiresAt: deleteField(),
    expiredAt: serverTimestamp(),
    expireReason:'period_to_trial',
    updatedAt: serverTimestamp()
  };
}
function licenseShouldConvertExpiredPeriod(lic){
  if(!lic) return false;
  // Lifetime must never be converted to trial by heal/expiry paths.
  if(normalizePlan(lic)==='lifetime') return false;
  const endMs=licenseTsMs(lic.expiresAt);
  if(endMs && Date.now() > endMs) return true;
  // legacy rows that were already marked expired
  if(String(lic.status||'').toLowerCase()==='expired') return true;
  return false;
}

/** Display labels — storage uses normalizeRole/Plan/Status canonical keys only. */
const ADMIN_LICENSE_TYPE_LABELS = {
  trial: '체험판',
  lifetime: '평생',
  period: '기간제',
  // legacy aliases (display only)
  monthly: '기간제',
  developer: '체험판',
  admin: '체험판',
  none: '체험판'
};
const ADMIN_LICENSE_STATUS_LABELS = {
  active: '활성',
  expired: '만료',
  banned: '차단',
  // legacy aliases
  suspended: '차단',
  inactive: '활성',
  refunded: '만료',
  none: '활성'
};
const ADMIN_ROLE_LABELS = {
  admin: '관리자',
  user: '사용자',
  // legacy aliases
  staff: '관리자',
  developer: '관리자'
};
const ADMIN_ACTIVITY_LABELS = {
  online: '온라인',
  active: '활성',
  idle: '유휴',
  offline: '오프라인'
};
const ADMIN_PAYMENT_STATUS_LABELS = {
  completed: '결제완료',
  paid: '결제완료',
  pending: '결제대기',
  failed: '결제실패',
  cancelled: '취소',
  canceled: '취소',
  refunded: '전액환불',
  partially_refunded: '부분환불',
  refund_review_required: '환불검토필요',
  duplicate_refunded: '중복 환불',
  duplicate_refund_failed: '중복 환불 실패',
  open: '접수',
  answered: '답변 완료',
  closed: '종료'
};
const ADMIN_PAYMENT_METHOD_LABELS = {
  admin: '관리자 지급',
  manual: '수동 저장',
  kakao: '카카오페이',
  kakaopay: '카카오페이',
  inicis: '카드 결제',
  inicis_v2: '카드 결제',
  card: '카드 결제',
  paypal: 'PayPal',
  google: 'Google'
};
function adminUiLabel(map, value, fallback){
  const raw = value == null ? '' : String(value).trim();
  if(!raw || raw === '-') return fallback != null ? fallback : '-';
  const hit = map[raw.toLowerCase()];
  return hit != null ? hit : (fallback != null ? fallback : raw);
}
function adminLicenseTypeLabel(v){ return adminUiLabel(ADMIN_LICENSE_TYPE_LABELS, v); }
function adminLicenseStatusLabel(v){ return adminUiLabel(ADMIN_LICENSE_STATUS_LABELS, v); }
function adminRoleLabel(v){ return adminUiLabel(ADMIN_ROLE_LABELS, normalizeRole(v), '사용자'); }
function adminActivityLabel(v){ return adminUiLabel(ADMIN_ACTIVITY_LABELS, v); }
function adminPaymentStatusLabel(v){ return adminUiLabel(ADMIN_PAYMENT_STATUS_LABELS, v); }
function adminPaymentMethodLabel(v){ return adminUiLabel(ADMIN_PAYMENT_METHOD_LABELS, v); }

function adminEffectivePlan(lic){ return normalizePlan(lic); }
function adminEffectiveStatus(lic){ return normalizeStatus(lic); }

function adminLicenseMethodLabel(method){
  return adminPaymentMethodLabel(method);
}

/** Filter/kind key: plan when usable, else status (expired|banned). */
function adminLicenseKind(lic){
  const status = normalizeStatus(lic);
  if(status==='banned') return 'banned';
  if(status==='expired') return 'expired';
  return normalizePlan(lic);
}
function adminPlanBadgeHtml(lic){
  if(!adminLicensesLoaded) return `<span class="crm-badge is-loading"><i></i>확인 중</span>`;
  if(!lic) return `<span class="crm-badge is-none"><i></i>라이선스 확인 필요</span>`;
  const status = normalizeStatus(lic);
  // Revoked/expired must never render as paid "7일 Full" even if passProductId leftovers remain.
  if(status==='banned') return `<span class="crm-badge is-banned"><i></i>${esc(adminLicenseStatusLabel('banned'))}</span>`;
  if(status==='expired' || lic.revokedAt){
    const planAfter = normalizePlan(lic);
    if(planAfter==='lifetime' && !lic.revokedAt) {
      /* fall through */
    } else if(planAfter!=='lifetime'){
      return `<span class="crm-badge is-trial"><i></i>${esc(adminLicenseTypeLabel('trial'))}</span>`;
    }
  }
  const plan = normalizePlan(lic);
  if(plan==='lifetime') return `<span class="crm-badge is-lifetime"><i></i>${esc(adminLicenseTypeLabel('lifetime'))}</span>`;
  if(plan==='period'){
    const pid = String(lic?.passProductId || '').trim().toUpperCase();
    let label = adminLicenseTypeLabel('period');
    if(pid === 'PASS_7D') label = '7일 Full';
    else if(pid === 'PASS_30D') label = '30일 Full';
    else if(pid === 'PASS_90D') label = '90일 Full';
    return `<span class="crm-badge is-period"><i></i>${esc(label)}</span>`;
  }
  return `<span class="crm-badge is-trial"><i></i>${esc(adminLicenseTypeLabel('trial'))}</span>`;
}
/** Badge from shared adminLicenseView — never maps missing → trial. */
function adminPlanBadgeFromView(view){
  if(!view || view.state==='loading' || !adminLicensesLoaded){
    return `<span class="crm-badge is-loading"><i></i>확인 중</span>`;
  }
  if(view.state==='error') return `<span class="crm-badge is-none"><i></i>조회 오류</span>`;
  if(view.state==='conflict') return `<span class="crm-badge is-none"><i></i>라이선스 충돌</span>`;
  if(view.state==='missing' || !view.license){
    return `<span class="crm-badge is-none"><i></i>라이선스 확인 필요</span>`;
  }
  return adminPlanBadgeHtml(view.license);
}
function adminLicenseBadgeHtml(kind, lic){
  // Prefer plan badge; status-only kinds still show plan (list uses role+plan).
  if(kind==='banned' || kind==='suspended') return `<span class="crm-badge is-banned"><i></i>${esc(adminLicenseStatusLabel('banned'))}</span>`;
  if(kind==='expired') return `<span class="crm-badge is-expired"><i></i>${esc(adminLicenseStatusLabel('expired'))}</span>`;
  return adminPlanBadgeHtml(lic);
}
function adminLastPaymentSec(uid){
  const o = adminOrdersForUid(uid)[0];
  return o ? adminTsSec(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt) : 0;
}
function adminCrmFavKey(){ return 'midiai_admin_crm_favs'; }
function loadAdminCrmFavorites(){
  try{ return new Set(JSON.parse(localStorage.getItem(adminCrmFavKey())||'[]')); }
  catch{ return new Set(); }
}
function saveAdminCrmFavorites(set){
  localStorage.setItem(adminCrmFavKey(), JSON.stringify([...set]));
}
let adminCrmFavorites = loadAdminCrmFavorites();
function adminRoleBadgeHtml(role){
  const r=normalizeRole(role);
  const label = adminRoleLabel(r);
  if(r==='admin') return `<span class="crm-role is-admin"><i></i>${esc(label)}</span>`;
  return `<span class="crm-role is-user"><i></i>${esc(label)}</span>`;
}
function adminActivityBadgeHtml(user){
  const t=adminTsSec(user?.lastLogin||user?.lastSeenAt);
  if(!t) return `<span class="crm-activity is-offline"><i></i>${esc(adminActivityLabel('offline'))}</span>`;
  const age=(Date.now()/1000)-t;
  if(age < 86400) return `<span class="crm-activity is-online"><i></i>${esc(adminActivityLabel('online'))}</span>`;
  if(age < 7*86400) return `<span class="crm-activity is-active"><i></i>${esc(adminActivityLabel('active'))}</span>`;
  if(age < 30*86400) return `<span class="crm-activity is-idle"><i></i>${esc(adminActivityLabel('idle'))}</span>`;
  return `<span class="crm-activity is-offline"><i></i>${esc(adminActivityLabel('offline'))}</span>`;
}
function fmtRelative(v){
  const t=adminTsSec(v);
  if(!t){
    try{
      const d=v?.toDate?v.toDate():(v?new Date(v):null);
      if(!d||Number.isNaN(d.getTime())) return '-';
      return fmtRelative({seconds:Math.floor(d.getTime()/1000)});
    }catch{ return '-'; }
  }
  const age=(Date.now()/1000)-t;
  if(age < 45) return '방금';
  if(age < 3600) return `${Math.floor(age/60)}분 전`;
  if(age < 86400) return `${Math.floor(age/3600)}시간 전`;
  if(age < 7*86400) return `${Math.floor(age/86400)}일 전`;
  return fmtListDate({seconds:t});
}
function fmtClock(v){
  try{
    const d=v?.toDate?v.toDate():(typeof v==='number'?new Date(v*1000):(v?new Date(v):null));
    if(!d||Number.isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }catch{ return '--:--'; }
}
function pushAdminCrmFeed(label, detail='', uid=''){
  const targetUid = String(uid || selectedAdminUid || '').trim();
  if(!targetUid) return;
  const item={
    t:Date.now(),
    uid: targetUid,
    label:String(label||''),
    detail:String(detail||'')
  };
  // Drop accidental double-log (Enter submit + Save, or duplicate listeners)
  const prev = adminCrmRecentFeed[0];
  if(
    prev
    && prev.uid === item.uid
    && prev.label === item.label
    && prev.detail === item.detail
    && (item.t - Number(prev.t||0)) < 2500
  ){
    renderAdminCrmRecentFeed();
    return;
  }
  adminCrmRecentFeed = [item, ...adminCrmRecentFeed].slice(0, 120);
  try{ localStorage.setItem('midiai_admin_crm_feed', JSON.stringify(adminCrmRecentFeed)); }catch{}
  renderAdminCrmRecentFeed();
}
function maskAdminHwid(hwid){
  const s=String(hwid||'');
  if(!s) return '(없음)';
  if(s.length<=10) return `${s.slice(0,2)}${'*'.repeat(Math.max(4,s.length-2))}`;
  return `${s.slice(0,5)}${'*'.repeat(12)}${s.slice(-4)}`;
}
function adminHwidOf(user, lic){
  return String(user?.hwid || lic?.hwid || user?.license?.hwid || '').trim();
}
function adminUidHwidHtml(uid, hwid, { maskHwid=false }={}){
  const id = String(uid || '').trim() || '-';
  const raw = String(hwid || '').trim();
  const hw = raw ? (maskHwid ? maskAdminHwid(raw) : raw) : '(없음)';
  return `<span class="admin-id-pair">
    <span class="admin-id-item">UID <code class="mono">${esc(id)}</code></span>
    <span class="admin-id-item">HWID <code class="mono">${esc(hw)}</code></span>
  </span>`;
}
function adminCrmMode(){
  return document.body.dataset.crmMode || 'members';
}
function adminCrmCreditBalance(u){
  const uid = String(u?.uid || u?.id || '').trim();
  const wallet = uid ? adminCreditWalletByUid[uid] : null;
  const fromWallet = Number(
    wallet && wallet.balance != null ? wallet.balance
      : (wallet && wallet.creditBalance != null ? wallet.creditBalance : NaN)
  );
  if(Number.isFinite(fromWallet)) return fromWallet;
  const fromUser = Number(u?.creditBalance ?? u?.pointBalance);
  return Number.isFinite(fromUser) ? fromUser : 0;
}
function refreshAdminLicenseCreditCells(){
  if(adminCrmMode()!=='license') return;
  document.querySelectorAll('[data-license-row]').forEach(tr=>{
    const uid=tr.getAttribute('data-license-row');
    const cell=tr.querySelector('.admin-license-credit');
    if(!uid || !cell) return;
    const u=findAdminUserRow(uid) || { uid, creditBalance: undefined };
    cell.textContent=String(adminCrmCreditBalance(u));
  });
}
function mapAdminCrmUserRow(u){
  const view=adminLicenseView(u);
  const uid=view.uid || adminUserUid(u);
  const license=view.license;
  return {
    ...u,
    uid,
    license,
    licenseView: view,
    licenseKind: view.kind || (view.state==='ok' ? adminLicenseKind(license) : view.state),
    orderCount: adminOrdersForUid(uid).length,
    ticketCount: adminTicketsForUid(uid).length,
    lastPaymentSec: adminLastPaymentSec(uid),
    isFav: adminCrmFavorites.has(uid)
  };
}
function adminLicenseExpiresInDays(lic){
  const end=licenseTsMs(lic?.expiresAt);
  if(!end) return null;
  return (end - Date.now()) / 86400000;
}
function adminLicenseIsExpiring(lic, days=30){
  if(!lic) return false;
  if(normalizeStatus(lic)!=='active') return false;
  if(normalizePlan(lic)!=='period') return false;
  const d=adminLicenseExpiresInDays(lic);
  return d!=null && d>=0 && d<=days;
}
function adminLicenseWorkMatch(row, tab){
  const view=row.licenseView || adminLicenseView(row);
  const lic=view.license;
  if(tab==='all') return true;
  if(view.state!=='ok' || !lic) return false;
  const plan=view.plan;
  const status=view.status;
  const active=status==='active';
  if(tab==='trial') return active && plan==='trial';
  if(tab==='lifetime') return active && plan==='lifetime';
  if(tab==='period') return active && plan==='period';
  if(tab==='expiring') return adminLicenseIsExpiring(lic, adminLicenseExpiringDays);
  if(tab==='ended') return status==='expired' || status==='banned';
  return true;
}
function adminOrderStatusGroup(status){
  const s=String(status||'').toLowerCase();
  if(s==='completed' || s==='paid' || s==='verified' || s==='license_issued') return 'paid';
  if(s==='failed') return 'failed';
  if(s==='cancelled' || s==='canceled' || s==='refunded' || s==='partially_refunded' || s==='refund_review_required' || s==='duplicate_refunded' || s==='duplicate_refund_failed') return 'refund';
  if(s==='pending' || s==='open') return 'pending';
  return 'other';
}
function adminOrderWhenSec(o){
  return adminTsSec(o?.completedAt || o?.verifiedAt || o?.createdAt || o?.updatedAt);
}
function adminIsTodaySec(sec){
  if(!sec) return false;
  const d=new Date(sec*1000);
  const n=new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}
function adminOrderProductName(o){
  const pid = String(o?.productId || '').trim().toUpperCase();
  if(pid === 'PASS_7D') return o?.productName || o?.orderName || '7일 Full';
  if(pid === 'PASS_30D') return o?.productName || o?.orderName || '30일 Full';
  if(pid === 'PASS_90D') return o?.productName || o?.orderName || '90일 Full';
  const v=o?.productName || o?.orderName || o?.plan || o?.productId;
  return v ? String(v) : '-';
}
function adminOrderAmountText(o){
  if(o?.amount==null || o?.amount==='') return '-';
  const n=Number(o.amount);
  if(!Number.isFinite(n)) return String(o.amount);
  return `${n.toLocaleString('ko-KR')} ${o.currency || 'KRW'}`;
}
function adminOrderAmountTotals(rows, groups){
  const map={};
  (rows||[]).forEach(o=>{
    if(groups && !groups.includes(adminOrderStatusGroup(o.status))) return;
    if(o.amount==null || o.amount==='') return;
    const n=Number(o.amount);
    if(!Number.isFinite(n)) return;
    const cur=String(o.currency || 'KRW').toUpperCase() || 'KRW';
    map[cur]=(map[cur]||0)+n;
  });
  const keys=Object.keys(map);
  if(!keys.length) return '';
  return keys.map(c=>`${Number(map[c]).toLocaleString('ko-KR')} ${c}`).join(' · ');
}
function adminOrderRefundText(o){
  const group=adminOrderStatusGroup(o?.status);
  const raw=String(o?.status||'').toLowerCase();
  const rawAmount = (o?.refundedAmount!=null && o.refundedAmount!=='')
    ? o.refundedAmount
    : ((o?.cancelledAmount!=null && o.cancelledAmount!=='') ? o.cancelledAmount : null);
  const amount = Number(rawAmount);
  const hasRefundMoney = Number.isFinite(amount) && amount > 0;

  // 0 / missing 은 환불 미발생 — 필드 존재만으로 "환불 0" 표시하지 않음.
  if(!hasRefundMoney){
    if(group==='refund') return adminPaymentStatusLabel(o.status);
    return '-';
  }

  const amountLabel = `${amount.toLocaleString('ko-KR')}원`;
  if(raw==='partially_refunded') return `부분환불 ${amountLabel}`;

  const bits=[];
  const when=o?.refundedAt || o?.cancelledAt || o?.refundAt;
  if(when) bits.push(fmtListDate(when));
  bits.push(`환불 ${amountLabel}`);
  if(o?.refundReason) bits.push(String(o.refundReason));
  return bits.join(' · ');
}
function adminPaymentStatusBadgeHtml(status){
  const s=String(status||'').toLowerCase();
  const group=adminOrderStatusGroup(status);
  const label=adminPaymentStatusLabel(status);
  let cls='is-none';
  if(group==='paid') cls='is-lifetime';
  else if(group==='failed') cls='is-banned';
  else if(s==='refund_review_required' || s==='duplicate_refund_failed') cls='is-trial';
  else if(s==='partially_refunded') cls='is-period';
  else if(group==='refund') cls='is-expired';
  else if(group==='pending') cls='is-period';
  return `<span class="crm-badge ${cls}"><i></i>${esc(label)}</span>`;
}
function adminLicenseStatusBadgeHtml(view){
  if(!view || view.state==='loading' || !adminLicensesLoaded){
    return `<span class="crm-badge is-loading"><i></i>확인 중</span>`;
  }
  if(view.state==='error') return `<span class="crm-badge is-none"><i></i>조회 오류</span>`;
  if(view.state==='conflict') return `<span class="crm-badge is-none"><i></i>라이선스 충돌</span>`;
  if(view.state==='missing' || !view.license){
    return `<span class="crm-badge is-none"><i></i>확인 필요</span>`;
  }
  const status=view.status;
  if(status==='banned') return `<span class="crm-badge is-banned"><i></i>${esc(adminLicenseStatusLabel('banned'))}</span>`;
  if(status==='expired') return `<span class="crm-badge is-expired"><i></i>${esc(adminLicenseStatusLabel('expired'))}</span>`;
  return `<span class="crm-badge is-lifetime"><i></i>${esc(adminLicenseStatusLabel('active'))}</span>`;
}
function adminCrmEmptyMessage(mode){
  if(mode==='license'){
    return ({
      all: '라이선스가 없습니다.',
      trial: '체험판 라이선스가 없습니다.',
      lifetime: '평생 라이선스가 없습니다.',
      period: '기간제 라이선스가 없습니다.',
      expiring: '만료 예정 라이선스가 없습니다.',
      ended: '만료/해제된 라이선스가 없습니다.'
    })[adminLicenseWorkTab] || '해당하는 라이선스가 없습니다.';
  }
  if(mode==='orders'){
    return ({
      all: '주문이 없습니다.',
      paid: '결제 완료 주문이 없습니다.',
      failed: '결제 실패 주문이 없습니다.',
      refund: '취소/환불 주문이 없습니다.',
      pending: '대기 중인 주문이 없습니다.'
    })[adminOrderWorkTab] || '해당하는 주문이 없습니다.';
  }
  return tr('empty');
}
function adminCrmAvatarHtml(u){
  return u.photoURL
    ? `<img class="admin-crm-card-avatar" src="${esc(u.photoURL)}" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="admin-crm-card-avatar is-fallback">${esc((u.displayName||u.email||'?').slice(0,1).toUpperCase())}</span>`;
}
function renderAdminWorkStatusTabs(mode){
  const host=$('adminCrmWorkTabs');
  if(!host) return;
  if(mode!=='license' && mode!=='orders'){
    host.hidden=true;
    host.innerHTML='';
    return;
  }
  host.hidden=false;
  if(mode==='license'){
    const counts=adminLicenseTabCounts();
    const tabs=[
      ['all','전체'],
      ['trial','체험판'],
      ['lifetime','평생'],
      ['period','기간제'],
      ['expiring','만료 예정'],
      ['ended','만료/해제']
    ];
    host.innerHTML=tabs.map(([id,label])=>{
      const on=adminLicenseWorkTab===id ? ' is-active' : '';
      return `<button type="button" class="admin-page-tab${on}" data-license-tab="${id}">${esc(label)} <em>${counts[id]||0}</em></button>`;
    }).join('');
    return;
  }
  const counts=adminOrderTabCounts();
  const tabs=[
    ['all','전체'],
    ['paid','결제 완료'],
    ['failed','결제 실패'],
    ['refund','취소/환불'],
    ['pending','대기']
  ];
  host.innerHTML=tabs.map(([id,label])=>{
    const on=adminOrderWorkTab===id ? ' is-active' : '';
    return `<button type="button" class="admin-page-tab${on}" data-order-tab="${id}">${esc(label)} <em>${counts[id]||0}</em></button>`;
  }).join('');
}
function adminLicenseTabCounts(){
  const rows=adminUserRows.map(mapAdminCrmUserRow);
  const counts={ all:rows.length, trial:0, lifetime:0, period:0, expiring:0, ended:0 };
  rows.forEach(row=>{
    const view=row.licenseView;
    const lic=view?.license;
    if(view?.state!=='ok' || !lic) return;
    if(view.status==='active' && view.plan==='trial') counts.trial++;
    if(view.status==='active' && view.plan==='lifetime') counts.lifetime++;
    if(view.status==='active' && view.plan==='period') counts.period++;
    if(adminLicenseIsExpiring(lic, 30)) counts.expiring++;
    if(view.status==='expired' || view.status==='banned') counts.ended++;
  });
  return counts;
}
function adminOrderTabCounts(){
  const all=adminOrderRows||[];
  const counts={ all:all.length, paid:0, failed:0, refund:0, pending:0, other:0 };
  all.forEach(o=>{
    const g=adminOrderStatusGroup(o.status);
    if(g in counts) counts[g]++;
  });
  return counts;
}
function syncAdminCrmWorkChrome(){
  const mode=adminCrmMode();
  const crm=$('adminCrm');
  if(crm) crm.dataset.workMode=mode;
  const search=$('adminUserSearch');
  if(search){
    search.placeholder = mode==='orders'
      ? '주문번호, 거래번호, 사용자, 이메일'
      : mode==='license'
        ? '사용자명, 이메일, UID'
        : '이메일, 이름, UID, HWID 검색';
  }
  const wrap=$('adminCrmFilterWrap');
  if(wrap) wrap.hidden = mode!=='members';
  const actions=$('adminCrmToolbarActions');
  if(actions) actions.hidden = mode!=='members';
  const sortSel=$('adminUserSort');
  if(sortSel) sortSel.hidden = mode!=='members';
  const selectWrap=$('adminCrmSelectAllWrap');
  if(selectWrap) selectWrap.hidden = mode!=='members' && mode!=='license';
  const bulk=$('adminCrmBulkbar');
  if(bulk && mode!=='members' && mode!=='license') bulk.hidden=true;
  else updateAdminCrmBulkbar();
  if(mode!=='members') closeAdminCrmFilterPopover({restore:true});
  else updateAdminCrmFilterButton();
  renderAdminWorkStatusTabs(mode);
}
function adminCrmAppliedSelectFilters(){
  const pop=$('adminCrmFilterPopover');
  const snap=setAdminCrmFilterPopoverOpen._snap;
  if(pop && !pop.hidden && snap){
    return {
      st: snap.license || 'all',
      ordersF: snap.orders || 'all',
      ticketsF: snap.tickets || 'all'
    };
  }
  return {
    st: $('adminUserLicenseStatus')?.value || 'all',
    ordersF: $('adminCrmFilterOrders')?.value || 'all',
    ticketsF: $('adminCrmFilterTickets')?.value || 'all'
  };
}
function adminCrmActiveFilterCount(){
  const f=adminCrmAppliedSelectFilters();
  let n=0;
  if(f.st!=='all') n++;
  if(f.ordersF!=='all') n++;
  if(f.ticketsF!=='all') n++;
  const pop=$('adminCrmFilterPopover');
  const snap=setAdminCrmFilterPopoverOpen._snap;
  const idle = (pop && !pop.hidden && snap)
    ? (snap.quick==='idle7' || snap.quick==='idle30')
    : (adminCrmQuickFilter==='idle7' || adminCrmQuickFilter==='idle30');
  if(idle) n++;
  return n;
}
function updateAdminCrmFilterButton(){
  const btn=$('adminCrmFilterBtn'); if(!btn) return;
  const n=adminCrmActiveFilterCount();
  btn.textContent = n ? `필터 ${n}` : '필터';
  btn.classList.toggle('is-active', n>0);
}
function renderAdminCrmFilterHint(shown, total, unit){
  const count=$('adminUserCount');
  const hint=$('adminCrmFilterHint');
  const q=($('adminUserSearch')?.value||'').trim();
  if(adminCrmMode()==='members'){
    if(count) count.textContent = q || adminCrmActiveFilterCount() ? `검색 결과 ${shown}명` : `${shown}명`;
    if(hint) hint.textContent='';
    updateAdminCrmFilterButton();
    return;
  }
  if(count) count.textContent=`${shown} / ${total}`;
  if(!hint) return;
  hint.textContent = shown===total ? '' : `필터 ${shown}${unit}`;
}
function getAdminCrmRows(){
  const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
  const {st, ordersF, ticketsF}=adminCrmAppliedSelectFilters();
  const sort=$('adminUserSort')?.value || 'lastLogin';
  let rows = adminUserRows.map(mapAdminCrmUserRow).filter(u=>{
    const view=u.licenseView || adminLicenseView(u);
    const kind=view.kind;
    const status=view.status;
    const plan=view.plan;
    const active=view.state==='ok' && status==='active';
    const role=normalizeRole(u.role);
    if(adminLicensesLoaded && view.state==='missing' && st!=='all' && st!=='favorites') return false;
    if(st==='lifetime' && !(active && plan==='lifetime')) return false;
    else if(st==='trial' && !(active && plan==='trial')) return false;
    else if(st==='period' && !(active && plan==='period')) return false;
    else if(st==='expired' && kind!=='expired') return false;
    else if(st==='banned' || st==='suspended'){ if(kind!=='banned') return false; }
    else if(st==='active' && !active) return false;
    else if(st==='favorites' && !u.isFav) return false;
    if(ordersF==='has' && !(u.orderCount>0)) return false;
    if(ordersF==='none' && u.orderCount>0) return false;
    if(ticketsF==='has' && !(u.ticketCount>0)) return false;
    if(ticketsF==='none' && u.ticketCount>0) return false;
    const nowSec=Date.now()/1000;
    if(adminCrmQuickFilter==='active'){
      if(!(view.state==='ok' && status==='active')) return false;
    } else if(adminCrmQuickFilter==='today'){
      const t=adminTsSec(u.createdAt);
      if(!t || nowSec-t >= 86400) return false;
    } else if(adminCrmQuickFilter==='idle7'){
      const t=adminTsSec(u.lastLogin||u.lastSeenAt);
      if(!(t>0 && nowSec-t > 7*86400)) return false;
    } else if(adminCrmQuickFilter==='idle30'){
      const t=adminTsSec(u.lastLogin||u.lastSeenAt);
      if(!(t>0 && nowSec-t > 30*86400)) return false;
    }
    const hay=[u.email,u.displayName,u.uid,u.id,u.hwid,u.license?.hwid,plan,status,role].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  rows.sort((a,b)=>{
    if(a.isFav!==b.isFav) return a.isFav ? -1 : 1;
    if(sort==='name') return String(a.displayName||a.email||'').localeCompare(String(b.displayName||b.email||''),'ko');
    if(sort==='createdAt') return adminTsSec(b.createdAt)-adminTsSec(a.createdAt);
    if(sort==='createdAtAsc') return adminTsSec(a.createdAt)-adminTsSec(b.createdAt);
    if(sort==='lastLoginAsc') return adminTsSec(a.lastLogin||a.lastSeenAt)-adminTsSec(b.lastLogin||b.lastSeenAt);
    if(sort==='lastPayment') return (b.lastPaymentSec||0)-(a.lastPaymentSec||0);
    return adminTsSec(b.lastLogin||b.lastSeenAt)-adminTsSec(a.lastLogin||a.lastSeenAt);
  });
  return rows;
}
function getAdminLicenseRows(){
  const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
  const tab=adminLicenseWorkTab || 'all';
  let rows=adminUserRows.map(mapAdminCrmUserRow).filter(u=>{
    if(!adminLicenseWorkMatch(u, tab)) return false;
    const hay=[u.displayName,u.email,u.uid,u.id].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  rows.sort((a,b)=>{
    const ae=licenseTsMs(a.license?.expiresAt);
    const be=licenseTsMs(b.license?.expiresAt);
    if(ae!==be){
      if(!ae) return 1;
      if(!be) return -1;
      return ae-be;
    }
    return licenseTsMs(b.license?.updatedAt)-licenseTsMs(a.license?.updatedAt);
  });
  return rows;
}
function adminCrmRowKey(u){
  return String(u?.uid || u?.id || '');
}
function adminCrmRowAliases(u){
  return [...new Set([u?.uid, u?.id, u?.canonicalUid].map(v=>String(v||'').trim()).filter(Boolean))];
}
function mergeAdminCrmRowsKeepOrder(prev, next){
  const map=new Map();
  (next||[]).forEach(u=>{
    adminCrmRowAliases(u).forEach(k=>map.set(k, u));
  });
  const seen=new Set();
  const out=[];
  const take=(u)=>{
    const n=adminCrmRowAliases(u).map(k=>map.get(k)).find(Boolean);
    if(!n) return;
    const id=adminCrmRowKey(n);
    if(!id || seen.has(id) || adminCrmRowAliases(n).some(k=>seen.has(k))) return;
    out.push(n);
    seen.add(id);
    adminCrmRowAliases(n).forEach(k=>seen.add(k));
  };
  (prev||[]).forEach(take);
  (next||[]).forEach(u=>{
    const id=adminCrmRowKey(u);
    if(!id || seen.has(id) || adminCrmRowAliases(u).some(k=>seen.has(k))) return;
    out.push(u);
    seen.add(id);
    adminCrmRowAliases(u).forEach(k=>seen.add(k));
  });
  return out;
}
function getAdminOrderRows(){
  const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
  const tab=adminOrderWorkTab || 'all';
  const all=adminOrderRows||[];
  return all.slice().sort((a,b)=>adminOrderWhenSec(b)-adminOrderWhenSec(a)).filter(o=>{
    if(tab!=='all' && adminOrderStatusGroup(o.status)!==tab) return false;
    if(!q) return true;
    const user=findAdminUserRow(o.uid||o.userId||o.customerUid);
    const hay=[
      o.id, o.paymentId, o.paypalOrderId, o.portonePaymentId, adminOrderDisplayId(o),
      o.uid, o.userId, o.customerUid, o.email, user?.email, user?.displayName,
      adminOrderProductName(o), o.status
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function applyAdminCrmStatFilter(key){
  closeAdminCrmFilterPopover({restore:true});
  const k=String(key||'all');
  adminCrmStatKey = k;
  adminCrmQuickFilter = '';
  const sel=$('adminUserLicenseStatus');
  if(k==='all'){
    if(sel) sel.value='all';
    const act=$('adminCrmFilterActivity');
    if(act) act.value='all';
  } else if(k==='lifetime' || k==='trial' || k==='period' || k==='favorites'){
    if(sel) sel.value=k;
  } else if(k==='active' || k==='today' || k==='idle7' || k==='idle30'){
    if(sel) sel.value='all';
    adminCrmQuickFilter = k;
    const act=$('adminCrmFilterActivity');
    if(act) act.value = (k==='idle7' || k==='idle30') ? k : 'all';
  } else if(k==='filtered'){
    // Keep whatever filters are already applied; only update selection highlight.
  }
  adminCrmPage=1;
  renderAdminUserTable({ resort: true });
}
function adminStatCardHtml(attr, key, value, label, selected){
  const on = selected===key ? ' is-selected' : '';
  return `<button type="button" class="crm-stat${on}" ${attr}="${esc(key)}" aria-pressed="${selected===key?'true':'false'}"><b>${value}</b><span>${esc(label)}</span></button>`;
}
function renderAdminMemberWorkStats(rows){
  const box=$('adminCrmStats');
  if(!box) return;
  bindAdminCrmStatClicksOn(box);
  box.classList.remove('is-cols-5');
  box.classList.add('is-cols-6');
  const now=Date.now()/1000;
  const all=adminUserRows.length;
  let active=0, trial=0, lifetime=0, period=0;
  adminUserRows.forEach(u=>{
    const view=adminLicenseView(u);
    if(view.state!=='ok' || !view.license) return;
    if(view.plan==='trial') trial++;
    if(view.plan==='lifetime') lifetime++;
    if(view.plan==='period') period++;
    if(view.status==='active') active++;
  });
  const todayJoin=adminUserRows.filter(u=>adminTsSec(u.createdAt) && now-adminTsSec(u.createdAt) < 86400).length;
  const selected = ['idle7','idle30','filtered'].includes(adminCrmStatKey) ? '' : (adminCrmStatKey || 'all');
  const card=(key, value, label)=>adminStatCardHtml('data-crm-stat', key, value, label, selected);
  box.innerHTML=`
    ${card('all', all, '전체 회원')}
    ${card('active', active, '활성')}
    ${card('lifetime', lifetime, '평생')}
    ${card('period', period, '기간제')}
    ${card('trial', trial, '체험판')}
    ${card('today', todayJoin, '오늘 가입')}`;
  renderAdminCrmFilterHint(rows.length, all, '명');
}
function renderAdminHomeMemberStats(){
  const box=$('adminHomeStats');
  if(!box) return;
  bindAdminCrmStatClicksOn(box);
  const now=Date.now()/1000;
  const all=adminUserRows.length;
  let active=0, trial=0, lifetime=0;
  adminUserRows.forEach(u=>{
    const view=adminLicenseView(u);
    if(view.state!=='ok' || !view.license) return;
    if(view.plan==='trial') trial++;
    if(view.plan==='lifetime') lifetime++;
    if(view.status==='active') active++;
  });
  const todayJoin=adminUserRows.filter(u=>adminTsSec(u.createdAt) && now-adminTsSec(u.createdAt) < 86400).length;
  const idle7=adminUserRows.filter(u=>{ const t=adminTsSec(u.lastLogin||u.lastSeenAt); return t>0 && now-t > 7*86400; }).length;
  const idle30=adminUserRows.filter(u=>{ const t=adminTsSec(u.lastLogin||u.lastSeenAt); return t>0 && now-t > 30*86400; }).length;
  const card=(key, value, label)=>adminStatCardHtml('data-crm-stat', key, value, label, 'all');
  box.innerHTML=`
    ${card('all', all, '전체 회원')}
    ${card('active', active, '활성')}
    ${card('lifetime', lifetime, '평생')}
    ${card('trial', trial, '체험판')}
    ${card('today', todayJoin, '오늘 가입')}
    ${card('idle7', idle7, '7일 미접속')}
    ${card('idle30', idle30, '30일 미접속')}`;
}
function renderAdminLicenseWorkStats(){
  const box=$('adminCrmStats');
  if(!box) return;
  box.classList.remove('is-cols-5');
  box.classList.add('is-cols-6');
  let trial=0, lifetime=0, period=0, exp7=0, exp30=0;
  adminUserRows.forEach(u=>{
    const view=adminLicenseView(u);
    if(view.state!=='ok' || !view.license) return;
    if(view.status==='active' && view.plan==='trial') trial++;
    if(view.status==='active' && view.plan==='lifetime') lifetime++;
    if(view.status==='active' && view.plan==='period') period++;
    if(adminLicenseIsExpiring(view.license, 7)) exp7++;
    if(adminLicenseIsExpiring(view.license, 30)) exp30++;
  });
  const all=adminUserRows.length;
  const selected = adminLicenseWorkTab === 'expiring'
    ? (adminLicenseExpiringDays === 7 ? 'expiring7' : 'expiring')
    : (adminLicenseWorkTab || 'all');
  const card=(key, value, label)=>adminStatCardHtml('data-license-stat', key, value, label, selected);
  box.innerHTML=`
    ${card('all', all, '전체 라이선스')}
    ${card('trial', trial, '체험판')}
    ${card('lifetime', lifetime, '평생')}
    ${card('period', period, '기간제')}
    ${card('expiring7', exp7, '7일 내 만료')}
    ${card('expiring', exp30, '30일 내 만료')}`;
}
function renderAdminOrderWorkStats(){
  const box=$('adminCrmStats');
  if(!box) return;
  box.classList.remove('is-cols-5');
  box.classList.add('is-cols-6');
  const all=adminOrderRows||[];
  const counts=adminOrderTabCounts();
  const todayPaid=all.filter(o=>adminOrderStatusGroup(o.status)==='paid' && adminIsTodaySec(adminOrderWhenSec(o))).length;
  const amount=adminOrderAmountTotals(all, ['paid']);
  const selected=adminOrderWorkTab || 'all';
  const card=(key, value, label)=>adminStatCardHtml('data-order-stat', key, value, label, selected);
  box.innerHTML=`
    ${card('all', counts.all, '전체 주문')}
    ${card('paid', counts.paid, '결제 완료')}
    ${card('failed', counts.failed, '결제 실패')}
    ${card('refund', counts.refund, '취소/환불')}
    ${card('today', todayPaid, '오늘 결제')}
    ${amount ? `<div class="crm-stat is-amount"><b>${esc(amount)}</b><span>결제완료 금액</span></div>` : ''}`;
}
function renderAdminCrmStats(rows){
  renderAdminHomeMemberStats();
  const mode=adminCrmMode();
  if(mode==='license') renderAdminLicenseWorkStats();
  else if(mode==='orders') renderAdminOrderWorkStats();
  else renderAdminMemberWorkStats(rows||[]);
}
function bindAdminCrmStatClicks(){
  bindAdminCrmStatClicksOn($('adminCrmStats'));
  bindAdminCrmStatClicksOn($('adminHomeStats'));
}
function bindAdminCrmStatClicksOn(box){
  if(!box || box.dataset.statBound) return;
  box.dataset.statBound='1';
  box.addEventListener('click', e=>{
    const memberBtn=e.target.closest('[data-crm-stat]');
    if(memberBtn){
      applyAdminCrmStatFilter(memberBtn.getAttribute('data-crm-stat'));
      if(typeof window.__midiaiShowAdminView==='function'){
        window.__midiaiShowAdminView('crm', { crmMode: 'members' });
      }
      return;
    }
    const licenseBtn=e.target.closest('[data-license-stat]');
    if(licenseBtn){
      const key=licenseBtn.getAttribute('data-license-stat') || 'all';
      if(key==='expiring7'){
        adminLicenseWorkTab = 'expiring';
        adminLicenseExpiringDays = 7;
      } else if(key==='expiring'){
        adminLicenseWorkTab = 'expiring';
        adminLicenseExpiringDays = 30;
      } else {
        adminLicenseWorkTab = key;
        adminLicenseExpiringDays = 30;
      }
      adminCrmPage=1;
      renderAdminUserTable({ resort: true });
      return;
    }
    const orderBtn=e.target.closest('[data-order-stat]');
    if(orderBtn){
      const key=orderBtn.getAttribute('data-order-stat') || 'all';
      adminOrderWorkTab = key==='today' ? 'paid' : key;
      adminCrmPage=1;
      renderAdminUserTable({ resort: true });
    }
  });
}
function bindAdminWorkTabClicks(){
  const host=$('adminCrmWorkTabs');
  if(!host || host.dataset.bound) return;
  host.dataset.bound='1';
  host.addEventListener('click', e=>{
    const licenseTab=e.target.closest('[data-license-tab]');
    if(licenseTab){
      adminLicenseWorkTab=licenseTab.getAttribute('data-license-tab') || 'all';
      if(adminLicenseWorkTab==='expiring') adminLicenseExpiringDays = 30;
      adminCrmPage=1;
      renderAdminUserTable({ resort: true });
      return;
    }
    const orderTab=e.target.closest('[data-order-tab]');
    if(orderTab){
      adminOrderWorkTab=orderTab.getAttribute('data-order-tab') || 'all';
      adminCrmPage=1;
      renderAdminUserTable({ resort: true });
    }
  });
}
function renderAdminUserTable(opts={}){
  try{ refreshAdminUserLogsUsers(); }catch{}
  const box=$('adminUserList'); if(!box || !isAdminUser) return;
  if(!$('adminCrm')){
    const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
    const st=$('adminUserLicenseStatus')?.value || 'all';
    let rows = adminUserRows.map(u=>({ ...u, license: licenseForUid(u.id || u.uid) })).filter(u=>{
      const lic=u.license; const status=String(lic?.status||'').toLowerCase();
      const active=lic && lic.licensed===true && status==='active';
      if(st==='active' && !active) return false;
      if(st==='none' && lic) return false;
      if((st==='banned'||st==='suspended') && !(status==='banned'||status==='suspended')) return false;
      const hay=[u.email,u.displayName,u.uid,u.id,u.hwid,lic?.plan,lic?.status].join(' ').toLowerCase();
      return !q || hay.includes(q);
    }).sort((a,b)=>(b.lastLogin?.seconds||b.lastSeenAt?.seconds||0)-(a.lastLogin?.seconds||a.lastSeenAt?.seconds||0));
    $('adminUserCount') && ($('adminUserCount').textContent=`${rows.length} / ${adminUserRows.length}`);
    if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
    box.innerHTML=`<table class="admin-table user-admin-table"><thead><tr><th>회원</th><th>라이선스</th><th>UID / HWID</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>${rows.map(u=>{
      const uid=u.uid||u.id; const lic=u.license; const active=lic && lic.licensed===true && String(lic.status||'').toLowerCase()==='active';
      const hwid=adminHwidOf(u, lic);
      return `<tr><td><b>${esc(u.displayName||'-')}</b><small>${esc(u.email||'')}<br>${adminUidHwidHtml(uid, hwid)}</small></td><td>${adminPlanBadgeHtml(lic)}</td><td>${adminUidHwidHtml(uid, hwid)}</td><td>${esc(fmtDate(u.lastLogin||u.lastSeenAt))}</td><td><div class="table-actions"><button class="secondary mini-btn" data-user-license="${esc(uid)}:lifetime:active">Lifetime</button><button class="secondary mini-btn" data-user-license="${esc(uid)}:trial:active">Trial</button><button class="secondary mini-btn danger-btn" data-user-license="${esc(uid)}:${esc(lic?.plan||'lifetime')}:banned">정지</button><button class="secondary mini-btn" data-user-hwid-reset="${esc(uid)}">HWID 초기화</button></div></td></tr>`;
    }).join('')}</tbody></table>`;
    bindAdminUserActions(box);
    return;
  }

  syncAdminCrmWorkChrome();
  bindAdminWorkTabClicks();
  const mode=adminCrmMode();
  if(mode==='orders'){
    if(adminOrdersListenError){
      box.innerHTML=`<div class="empty-card">주문 조회 오류 (${esc(adminOrdersListenError.code||'unknown')})</div>`;
      renderAdminCrmStats([]);
      renderAdminCrmFilterHint(0, (adminOrderRows||[]).length, '건');
      renderAdminPaymentsTable();
      return;
    }
    if(!adminOrdersLoaded){
      box.innerHTML=`<p class="muted">주문 불러오는 중...</p>`;
      renderAdminCrmStats([]);
      renderAdminPaymentsTable();
      return;
    }
    adminCrmFilteredRows = getAdminOrderRows();
    renderAdminCrmStats(adminCrmFilteredRows);
    const groupN = groupAdminOrdersByBuyer(adminCrmFilteredRows).length;
    const countEl=$('adminUserCount');
    if(countEl) countEl.textContent = `${adminCrmFilteredRows.length}건 · ${groupN}명`;
    const hint=$('adminCrmFilterHint');
    if(hint) hint.textContent = adminCrmFilteredRows.length===(adminOrderRows||[]).length ? '' : `필터 ${adminCrmFilteredRows.length}건`;
    updateAdminCrmBulkbar();
    if(!adminCrmFilteredRows.length){
      box.innerHTML=`<div class="empty-card">${esc(adminCrmEmptyMessage('orders'))}</div>`;
      const pager=$('adminCrmPager');
      if(pager){ pager.hidden=true; pager.innerHTML=''; }
      renderAdminPaymentsTable();
      return;
    }
  } else if(mode==='license'){
    if(!adminLicensesLoaded){
      box.innerHTML=`<p class="muted">라이선스 불러오는 중...</p>`;
      renderAdminCrmStats([]);
      renderAdminPaymentsTable();
      return;
    }
    const nextLicenseRows = getAdminLicenseRows();
    const keepOrder = opts.keepOrder === true || (opts.resort !== true && (adminCrmFilteredRows||[]).length > 0);
    adminCrmFilteredRows = keepOrder
      ? mergeAdminCrmRowsKeepOrder(adminCrmFilteredRows, nextLicenseRows)
      : nextLicenseRows;
    renderAdminCrmStats(adminCrmFilteredRows);
    renderAdminCrmFilterHint(adminCrmFilteredRows.length, adminUserRows.length, '명');
    updateAdminCrmBulkbar();
    if(!adminCrmFilteredRows.length){
      box.innerHTML=`<div class="empty-card">${esc(adminCrmEmptyMessage('license'))}</div>`;
      const pager=$('adminCrmPager');
      if(pager){ pager.hidden=true; pager.innerHTML=''; }
      renderAdminPaymentsTable();
      return;
    }
  } else {
    adminCrmFilteredRows = getAdminCrmRows();
    renderAdminCrmStats(adminCrmFilteredRows);
    updateAdminCrmBulkbar();
    if(!adminCrmFilteredRows.length){
      box.innerHTML=`<div class="empty-card">${esc(adminCrmEmptyMessage('members'))}</div>`;
      const pager=$('adminCrmPager');
      if(pager){ pager.hidden=true; pager.innerHTML=''; }
      renderAdminPaymentsTable();
      return;
    }
  }
  if(!box.dataset.pageBound){
    box.dataset.pageBound='1';
    box.addEventListener('click', onAdminCrmListClick);
    box.addEventListener('change', onAdminCrmListChange);
  }
  const pager=$('adminCrmPager');
  if(pager && !pager.dataset.bound){
    pager.dataset.bound='1';
    pager.addEventListener('click', onAdminCrmPagerClick);
  }
  paintAdminCrmPagedList();
  renderAdminPaymentsTable();
}
window.__midiaiOnAdminCrmMode = function(mode, opts={}){
  closeAdminCrmOrderDrawer();
  adminCrmPage = 1;
  if(mode !== 'members'){
    parkAdminCrmDetail();
    $('adminCrm')?.classList.remove('is-row-expand', 'is-detail-open');
  }
  if(isAdminUser) renderAdminUserTable({ resort: true });
  if(opts?.uid) selectAdminCrmUser(opts.uid, { forceOpen: true, tab: opts.detailTab || opts.tab });
};
window.__midiaiOnAdminCms = function(tab, opts={}){
  if(opts.close){ closeAdminCmsDrawer(); return; }
  bindAdminCmsChrome();
  if(isAdminUser) listenAdminPostManager();
  const nextTab = tab || document.body.dataset.cmsTab || adminCmsTab || 'notices';
  setAdminCmsTab(nextTab, { openId: opts.cmsId || opts.postId || '' });
};
function adminCrmTotalPages(){
  if(adminCrmMode()==='orders'){
    return Math.max(1, Math.ceil((adminCrmFilteredRows||[]).length / ADMIN_CRM_PAGE_SIZE));
  }
  return Math.max(1, Math.ceil(adminCrmFilteredRows.length / ADMIN_CRM_PAGE_SIZE));
}
function paintAdminCrmPagedList(){
  parkAdminCrmDetail();
  const box=$('adminUserList'); if(!box || !adminCrmFilteredRows.length) return;
  const total = adminCrmFilteredRows.length;
  const pages = adminCrmTotalPages();
  if(adminCrmPage > pages) adminCrmPage = pages;
  if(adminCrmPage < 1) adminCrmPage = 1;
  const start = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE;
  const slice = adminCrmFilteredRows.slice(start, start + ADMIN_CRM_PAGE_SIZE);
  const mode=adminCrmMode();
  if(mode==='license'){
    box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-license-table"><thead><tr>
      <th class="admin-col-check"></th>
      <th>사용자</th><th>이메일</th><th>라이선스</th><th>상태</th><th>크레딧</th><th>시작일</th><th>만료일</th><th>최근 변경</th><th>지급/변경 주체</th><th>관리</th>
    </tr></thead><tbody>${slice.map(u=>adminCrmLicenseRowHtml(u)).join('')}</tbody></table></div>`;
    renderAdminCrmPager(pages, total, '명');
    if(adminCrmLicenseOpen) fillAdminLicenseExpandCredits(adminCrmLicenseOpen);
    return;
  }
  if(mode==='orders'){
    const pages = adminCrmTotalPages();
    if(adminCrmPage > pages) adminCrmPage = pages;
    if(adminCrmPage < 1) adminCrmPage = 1;
    const start = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE;
    const slice = adminCrmFilteredRows.slice(start, start + ADMIN_CRM_PAGE_SIZE);
    box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-order-table admin-payment-flat-table"><thead><tr>
      <th>주문번호</th><th>사용자</th><th>상품</th><th>결제수단</th><th>결제금액</th><th>결제상태</th><th>결제일</th><th>취소/환불</th><th>관리</th>
    </tr></thead><tbody>${slice.map(o=>adminPaymentMenuRowHtml(o)).join('')}</tbody></table></div>`;
    renderAdminCrmPager(pages, adminCrmFilteredRows.length, '건');
    return;
  }
  box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-member-table"><thead><tr>
    <th class="admin-col-check"></th>
    <th>사용자</th><th>이메일</th><th>가입일</th><th>권한</th><th>라이선스</th><th>상태</th><th>국가</th><th>최근 접속</th><th>주문</th><th>문의</th>
  </tr></thead><tbody>${slice.map(u=>adminCrmMemberRowHtml(u)).join('')}</tbody></table></div>`;
  renderAdminCrmPager(pages, total, '명');
  mountAdminCrmDetailInMemberRow();
}
function adminCrmMemberRowHtml(u){
  const uid=u.uid;
  const open = selectedAdminUid===uid;
  const selected = open ? ' is-selected is-open' : '';
  const checked = adminCrmSelected.has(uid) ? 'checked' : '';
  const fav = u.isFav ? '<span class="crm-fav-mark" aria-hidden="true">★</span>' : '';
  const country = adminAccessCountryLine(u) || '-';
  const seen = fmtRelative(u.lastLogin||u.lastSeenAt);
  return `<tr class="admin-crm-member-row${selected}" data-admin-uid="${esc(uid)}">
    <td><label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-check="${esc(uid)}" ${checked}></label></td>
    <td class="admin-member-user"><span class="admin-order-caret" aria-hidden="true">▸</span>${adminCrmAvatarHtml(u)}<span><b>${fav}${esc(u.displayName||'Google User')}</b></span></td>
    <td class="admin-member-email" title="${esc(u.email||'')}">${esc(u.email||'-')}</td>
    <td class="admin-member-joined">${esc(fmtListDate(u.createdAt))}</td>
    <td>${adminRoleBadgeHtml(u.role)}</td>
    <td>${adminPlanBadgeFromView(u.licenseView || adminLicenseView(u))}</td>
    <td>${adminActivityBadgeHtml(u)}</td>
    <td class="admin-member-country" title="${esc(country)}">${esc(country)}</td>
    <td>${esc(seen)}</td>
    <td>${Number(u.orderCount||0)}</td>
    <td>${Number(u.ticketCount||0)}</td>
  </tr>${open ? `
  <tr class="admin-member-expand">
    <td colspan="11"><div class="admin-member-expand-inner" id="adminCrmMemberExpandHost"></div></td>
  </tr>` : ''}`;
}
function adminCrmLicenseRowHtml(u){
  const uid=u.uid;
  const view=u.licenseView || adminLicenseView(u);
  const lic=view.license;
  const open = adminCrmLicenseOpen===uid;
  const checked = adminCrmSelected.has(uid) ? 'checked' : '';
  const start = lic?.startsAt ? fmtListDate(lic.startsAt) : '-';
  const end = view.plan==='lifetime' ? '없음' : (lic?.expiresAt ? fmtListDate(lic.expiresAt) : '-');
  const changed = lic?.updatedAt ? fmtRelative(lic.updatedAt) : '-';
  const actor = lic?.method ? adminLicenseMethodLabel(lic.method) : '-';
  return `<tr class="admin-license-row${open?' is-open':''}" data-license-row="${esc(uid)}">
    <td><label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-check="${esc(uid)}" ${checked}></label></td>
    <td class="admin-member-user">
      <span class="admin-order-caret" aria-hidden="true">▸</span>
      ${adminCrmAvatarHtml(u)}<span><b>${esc(u.displayName||'Google User')}</b></span>
    </td>
    <td class="admin-member-email" title="${esc(u.email||'')}">${esc(u.email||'-')}</td>
    <td>${adminPlanBadgeFromView(view)}</td>
    <td>${adminLicenseStatusBadgeHtml(view)}</td>
    <td class="admin-license-credit">${esc(String(adminCrmCreditBalance(u)))}</td>
    <td>${esc(start)}</td>
    <td>${esc(end)}</td>
    <td>${esc(changed)}</td>
    <td>${esc(actor)}</td>
    <td><button type="button" class="ghost mini-btn" data-license-toggle="${esc(uid)}">${open?'접기':'관리'}</button></td>
  </tr>
  <tr class="admin-license-expand"${open?'':' hidden'}>
    <td colspan="11">${adminCrmLicenseExpandInnerHtml(u, view)}</td>
  </tr>`;
}
function adminCrmLicenseExpandInnerHtml(u, view){
  const uid=u.uid;
  const lic=(view||u.licenseView||adminLicenseView(u)).license;
  const plan=view?.plan || normalizePlan(lic) || 'trial';
  const start=toDateInputValue(lic?.startsAt);
  const end=toDateInputValue(lic?.expiresAt);
  const memo=lic?.memo || '';
  return `<div class="admin-license-expand-inner" data-license-uid="${esc(uid)}">
    <div class="admin-license-expand-col">
      <div class="admin-license-expand-meta">
        <span class="admin-license-expand-flags">
          <span>상태 ${adminLicenseStatusBadgeHtml(view||adminLicenseView(u))}</span>
          <span>현재 ${adminPlanBadgeFromView(view||adminLicenseView(u))}</span>
        </span>
        ${adminUidHwidHtml(uid, adminHwidOf(u, lic))}
      </div>
      <div class="admin-crm-license-form admin-license-inline-form">
        <div class="form-split">
          <label>라이선스
            <select data-lic-plan>
              <option value="trial"${plan==='trial'?' selected':''}>체험판</option>
              <option value="lifetime"${plan==='lifetime'?' selected':''}>평생</option>
              <option value="period"${plan==='period'?' selected':''}>기간제</option>
            </select>
          </label>
          <label>시작일
            <input type="date" data-lic-starts value="${esc(start)}">
          </label>
          <label>만료일
            <input type="date" data-lic-expires value="${esc(end)}">
          </label>
        </div>
        <label>메모
          <textarea data-lic-memo rows="2" placeholder="라이선스 메모">${esc(memo)}</textarea>
        </label>
        <div class="admin-license-expand-toolbar">
          <input type="hidden" data-lic-pass-product value="${esc(lic?.passProductId || '')}">
          <div class="admin-license-expand-actions">
            <button type="button" class="primary mini-btn" data-license-save="${esc(uid)}">저장</button>
            <button type="button" class="ghost mini-btn" data-license-member="${esc(uid)}">회원 상세</button>
            <button type="button" class="ghost mini-btn" data-license-logs="${esc(uid)}">로그</button>
          </div>
        </div>
      </div>
    </div>
    <aside class="admin-license-expand-col admin-license-credit-panel" aria-label="크레딧 추가/회수">
      <div class="admin-license-credit-head">
        <h3>크레딧 추가/회수</h3>
        <span class="admin-license-credit-balance muted small" data-lic-credit-balance>잔액 조회 중...</span>
      </div>
      <div class="admin-crm-points-quick" role="group" aria-label="빠른 지급">
        <button type="button" class="secondary mini-btn" data-license-credit-grant="${esc(uid)}" data-amount="1">+1</button>
        <button type="button" class="secondary mini-btn" data-license-credit-grant="${esc(uid)}" data-amount="3">+3</button>
        <button type="button" class="secondary mini-btn" data-license-credit-grant="${esc(uid)}" data-amount="5">+5</button>
        <button type="button" class="secondary mini-btn" data-license-credit-grant="${esc(uid)}" data-amount="10">+10</button>
      </div>
      <div class="admin-crm-points-quick" role="group" aria-label="빠른 회수">
        <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${esc(uid)}" data-amount="1">-1</button>
        <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${esc(uid)}" data-amount="3">-3</button>
        <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${esc(uid)}" data-amount="5">-5</button>
        <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${esc(uid)}" data-amount="10">-10</button>
      </div>
      <div class="admin-crm-points-form">
        <input type="number" data-lic-credit-amount min="1" step="1" value="5" aria-label="크레딧 수량">
        <input type="text" data-lic-credit-reason placeholder="사유 (선택)" aria-label="사유">
        <button type="button" class="secondary mini-btn" data-license-credit-grant="${esc(uid)}">지급</button>
        <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${esc(uid)}">회수</button>
      </div>
    </aside>
  </div>`;
}
function toggleAdminLicenseExpand(uid){
  if(!uid) return;
  try{ hideAdminFlash(); }catch(_){}
  adminCrmLicenseOpen = adminCrmLicenseOpen===uid ? '' : uid;
  paintAdminCrmPagedList();
}
function adminOrderBuyerKey(o){
  const uid=String(o?.uid||o?.userId||o?.customerUid||'').trim();
  if(uid) return uid;
  const email=String(o?.email||'').trim().toLowerCase();
  if(email) return `email:${email}`;
  return `order:${o?.id||o?.paymentId||o?.paypalOrderId||Math.random()}`;
}
function groupAdminOrdersByBuyer(orders){
  const map=new Map();
  (orders||[]).forEach(o=>{
    const key=adminOrderBuyerKey(o);
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  });
  return [...map.entries()].map(([buyerKey, items])=>{
    items.sort((a,b)=>adminOrderWhenSec(b)-adminOrderWhenSec(a));
    const latest=items[0];
    return {
      buyerKey,
      uid: String(latest?.uid||latest?.userId||latest?.customerUid||''),
      items,
      latest
    };
  }).sort((a,b)=>adminOrderWhenSec(b.latest)-adminOrderWhenSec(a.latest));
}
function adminOrderMethodsSummary(items){
  const labels=[...new Set((items||[]).map(o=>adminPaymentMethodLabel(o.paymentMethod||o.provider||o.method||'-')))];
  if(!labels.length) return '-';
  if(labels.length===1) return labels[0];
  return `${labels[0]} 외 ${labels.length-1}`;
}
function adminCrmOrderChildRowHtml(o){
  const key=o.id||o.paymentId||o.paypalOrderId||'';
  const uid=String(o.uid||o.userId||o.customerUid||'');
  const id=adminOrderDisplayId(o);
  const detail = key
    ? `<button type="button" class="secondary mini-btn" data-order-detail="${esc(key)}" data-order-uid="${esc(uid)}" title="주문 상세 · PortOne 동기화/취소">상세</button>`
    : '';
  // PortOne 결제 추적용 주문은 hard delete를 숨기지 않되, 상세와 혼동되지 않게 보조 버튼으로 둔다.
  const del = key
    ? `<button type="button" class="ghost mini-btn admin-order-delete-btn" data-order-delete="${esc(key)}" title="내부 주문 기록만 삭제 (환불/회수 아님)">삭제</button>`
    : '';
  const actions = (detail || del)
    ? `<div class="admin-order-row-actions">${detail}${del}</div>`
    : '-';
  return `<tr class="admin-order-child-row" data-order-row-id="${esc(key)}" data-order-uid="${esc(uid)}">
    <td class="mono admin-order-id" title="${esc(id)}">${esc(id)}</td>
    <td title="${esc(adminOrderProductName(o))}">${esc(adminOrderProductName(o))}</td>
    <td>${esc(adminPaymentMethodLabel(o.paymentMethod||o.provider||o.method||'-'))}</td>
    <td>${esc(adminOrderAmountText(o))}</td>
    <td>${adminPaymentStatusBadgeHtml(o.status)}</td>
    <td>${esc(fmtDate(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt))}</td>
    <td class="admin-order-refund" title="${esc(adminOrderRefundText(o))}">${esc(adminOrderRefundText(o))}</td>
    <td>${actions}</td>
  </tr>`;
}
/** Compact 2-line user cell for flat payment list (name + email). */
function adminPaymentUserCellHtml(o){
  const uid=String(o?.uid||o?.userId||o?.customerUid||'').trim();
  const user=uid ? findAdminUserRow(uid) : null;
  let name=String(user?.displayName||o?.displayName||o?.name||'').trim();
  if(!name || /^undefined$/i.test(name) || /^null$/i.test(name)) name='';
  let email=String(user?.email||o?.email||'').trim();
  if(!email || /^undefined$/i.test(email) || /^null$/i.test(email)) email='';
  let primary='';
  let secondary='';
  if(name){
    primary=name;
    secondary=email && email!==name ? email : '';
  } else if(email){
    primary=email;
  } else if(uid){
    primary='-';
    secondary=uid;
  }
  if(!primary && !secondary){
    return `<td class="admin-payment-user"><span class="admin-payment-user-name">-</span></td>`;
  }
  const title=[name||'', email||'', (!name && !email ? uid : '')].filter(Boolean).join(' · ') || primary;
  return `<td class="admin-payment-user" title="${esc(title)}">
    <span class="admin-payment-user-name">${esc(primary)}</span>
    ${secondary?`<span class="admin-payment-user-email">${esc(secondary)}</span>`:''}
  </td>`;
}
/** Flat payment-menu row — same detail opener as member CRM orders. */
function adminPaymentMenuRowHtml(o){
  const key=o.id||o.paymentId||o.paypalOrderId||'';
  const uid=String(o.uid||o.userId||o.customerUid||'');
  const id=adminOrderDisplayId(o);
  const detail = key
    ? `<button type="button" class="secondary mini-btn" data-order-detail="${esc(key)}" data-order-uid="${esc(uid)}" title="주문 상세 · PortOne 동기화/취소">상세</button>`
    : '-';
  return `<tr class="admin-payment-menu-row" data-order-row-id="${esc(key)}" data-order-uid="${esc(uid)}">
    <td class="mono admin-order-id" title="${esc(id)}">${esc(id)}</td>
    ${adminPaymentUserCellHtml(o)}
    <td title="${esc(adminOrderProductName(o))}">${esc(adminOrderProductName(o))}</td>
    <td>${esc(adminPaymentMethodLabel(o.paymentMethod||o.provider||o.method||'-'))}</td>
    <td>${esc(adminOrderAmountText(o))}</td>
    <td>${adminPaymentStatusBadgeHtml(o.status)}</td>
    <td>${esc(fmtDate(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt))}</td>
    <td class="admin-order-refund" title="${esc(adminOrderRefundText(o))}">${esc(adminOrderRefundText(o))}</td>
    <td><div class="admin-order-row-actions">${detail}</div></td>
  </tr>`;
}
/** Shared entry: member detail payments + 결제 메뉴 both open the same drawer. */
function openAdminPaymentDetail(uid, orderKey){
  return openAdminCrmOrderDrawer(uid, orderKey);
}
function adminCrmOrderGroupHtml(g){
  const latest=g.latest||{};
  const uid=g.uid;
  const user=uid ? findAdminUserRow(uid) : null;
  const name=user?.displayName || user?.email || latest.email || uid || '-';
  const email=user?.email || latest.email || '';
  const open=adminCrmOrderOpen.has(g.buyerKey);
  const n=g.items.length;
  return `<tr class="admin-order-group${open?' is-open':''}" data-order-group="${esc(g.buyerKey)}">
    <td class="admin-order-buyer">
      <span class="admin-order-caret" aria-hidden="true">▸</span>
      <span>
        <b>${esc(name)}</b>
        ${email && email!==name ? `<small>${esc(email)}</small>` : ''}
      </span>
    </td>
    <td>${n}건</td>
    <td title="${esc(adminOrderProductName(latest))}">${esc(adminOrderProductName(latest))}</td>
    <td>${esc(adminOrderMethodsSummary(g.items))}</td>
    <td>${adminPaymentStatusBadgeHtml(latest.status)}</td>
    <td>${esc(fmtDate(latest.completedAt||latest.verifiedAt||latest.createdAt||latest.updatedAt))}</td>
  </tr>
  <tr class="admin-order-expand"${open?'':' hidden'}>
    <td colspan="6">
      <table class="admin-table admin-order-nested"><thead><tr>
        <th>주문번호</th><th>상품</th><th>결제수단</th><th>결제금액</th><th>결제상태</th><th>결제일</th><th>취소/환불</th><th>관리</th>
      </tr></thead><tbody>${g.items.map(o=>adminCrmOrderChildRowHtml(o)).join('')}</tbody></table>
    </td>
  </tr>`;
}
function adminCrmOrderRowHtml(o){
  return adminCrmOrderChildRowHtml(o);
}
function renderAdminCrmPager(pages, total, unit='명'){
  const pager=$('adminCrmPager'); if(!pager) return;
  pager.hidden = false;
  const from = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE + 1;
  const to = Math.min(total, adminCrmPage * ADMIN_CRM_PAGE_SIZE);
  pager.innerHTML = `
    <button type="button" class="ghost mini-btn" data-crm-page="prev" ${adminCrmPage<=1?'disabled':''}>이전</button>
    <span class="admin-crm-pager-info">${adminCrmPage} / ${pages}</span>
    <button type="button" class="ghost mini-btn" data-crm-page="next" ${adminCrmPage>=pages?'disabled':''}>다음</button>
    <span class="admin-crm-pager-info muted">${from}–${to} · ${total}${esc(unit)}</span>`;
}
function onAdminCrmPagerClick(e){
  const btn=e.target.closest('[data-crm-page]'); if(!btn || btn.disabled) return;
  const act=btn.getAttribute('data-crm-page');
  const pages=adminCrmTotalPages();
  if(act==='prev' && adminCrmPage>1) adminCrmPage -= 1;
  else if(act==='next' && adminCrmPage<pages) adminCrmPage += 1;
  else return;
  paintAdminCrmPagedList();
}
function paintAdminCrmVirtualList(){
  paintAdminCrmPagedList();
}
function adminCrmMemberCardHtml(u){
  const uid=u.uid;
  const selected = selectedAdminUid===uid ? ' is-selected' : '';
  const checked = adminCrmSelected.has(uid) ? 'checked' : '';
  const fav = u.isFav ? '<span class="crm-fav-mark" aria-hidden="true">★</span>' : '';
  const avatar = u.photoURL
    ? `<img class="admin-crm-card-avatar" src="${esc(u.photoURL)}" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="admin-crm-card-avatar is-fallback">${esc((u.displayName||u.email||'?').slice(0,1).toUpperCase())}</span>`;
  const country = adminAccessCountryLine(u);
  const seen = fmtRelative(u.lastLogin||u.lastSeenAt);
  const loginMeta = country ? `${country} · ${seen}` : seen;
  return `<article class="admin-crm-member${selected}" data-admin-uid="${esc(uid)}" style="min-height:${ADMIN_CRM_ROW_H}px">
    <label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-check="${esc(uid)}" ${checked}></label>
    ${avatar}
    <div class="admin-crm-member-main">
      <div class="admin-crm-member-top">
        <b>${fav}${esc(u.displayName||'Google User')}</b>
        ${adminRoleBadgeHtml(u.role)}
        ${adminPlanBadgeFromView(u.licenseView || adminLicenseView(u))}
      </div>
      <div class="admin-crm-member-meta">
        <span class="crm-meta-login">${esc(loginMeta)}</span>
        <span class="crm-meta-num">주문 ${Number(u.orderCount||0)}</span>
        <span class="crm-meta-num">문의 ${Number(u.ticketCount||0)}</span>
      </div>
    </div>
  </article>`;
}
function applyAdminCrmCheckEl(el){
  const uid = String(el?.getAttribute('data-crm-check') || '').trim();
  if(!uid) return;
  if(el.checked) adminCrmSelected.add(uid);
  else adminCrmSelected.delete(uid);
  updateAdminCrmBulkbar();
}
function onAdminCrmListChange(e){
  const check = e.target?.matches?.('[data-crm-check]') ? e.target : e.target?.closest?.('[data-crm-check]');
  if(!check) return;
  applyAdminCrmCheckEl(check);
}
function onAdminCrmListClick(e){
  const check = e.target.closest('[data-crm-check]');
  if(check){
    applyAdminCrmCheckEl(check);
    return;
  }
  const detail = e.target.closest('[data-order-detail]');
  if(detail){
    e.preventDefault();
    e.stopPropagation();
    const orderKey = detail.getAttribute('data-order-detail') || '';
    let uid = detail.getAttribute('data-order-uid') || '';
    if(!uid && orderKey){
      const row = (adminOrderRows||[]).find(o=>(o.id||o.paymentId||o.paypalOrderId)===orderKey);
      uid = String(row?.uid||row?.userId||row?.customerUid||'');
    }
    if(orderKey && uid) openAdminPaymentDetail(uid, orderKey);
    else if(orderKey) alert('이 주문에 연결된 회원 UID를 찾을 수 없습니다.');
    return;
  }
  const del = e.target.closest('[data-order-delete]');
  if(del){
    e.preventDefault();
    e.stopPropagation();
    adminDeleteOrder(del.getAttribute('data-order-delete'));
    return;
  }
  const group = e.target.closest('[data-order-group]');
  if(group && adminCrmMode()==='orders'){
    const key=group.getAttribute('data-order-group');
    if(!key) return;
    if(adminCrmOrderOpen.has(key)) adminCrmOrderOpen.delete(key);
    else adminCrmOrderOpen.add(key);
    paintAdminCrmPagedList();
    return;
  }
  if(adminCrmMode()==='license'){
    const grant = e.target.closest('[data-license-grant]');
    if(grant){
      e.preventDefault();
      e.stopPropagation();
      adminLicenseExpandGrant(grant);
      return;
    }
    const save = e.target.closest('[data-license-save]');
    if(save){
      e.preventDefault();
      e.stopPropagation();
      saveAdminLicenseInline(save.getAttribute('data-license-save'), save.closest('.admin-license-expand-inner'));
      return;
    }
    const creditGrant = e.target.closest('[data-license-credit-grant]');
    if(creditGrant){
      e.preventDefault();
      e.stopPropagation();
      adminAdjustLicenseExpandCredits(creditGrant, 1);
      return;
    }
    const creditDeduct = e.target.closest('[data-license-credit-deduct]');
    if(creditDeduct){
      e.preventDefault();
      e.stopPropagation();
      adminAdjustLicenseExpandCredits(creditDeduct, -1);
      return;
    }
    const member = e.target.closest('[data-license-member]');
    if(member){
      e.preventDefault();
      e.stopPropagation();
      const uid = member.getAttribute('data-license-member');
      if(typeof window.__midiaiShowAdminView==='function'){
        window.__midiaiShowAdminView('crm', { crmMode: 'members', uid });
      } else {
        selectAdminCrmUser(uid, { forceOpen: true });
      }
      return;
    }
    const logs = e.target.closest('[data-license-logs]');
    if(logs){
      e.preventDefault();
      e.stopPropagation();
      if(typeof window.__midiaiShowAdminView==='function'){
        window.__midiaiShowAdminView('logs', { uid: logs.getAttribute('data-license-logs'), logsTab: 'license' });
      }
      return;
    }
    if(e.target.closest('input,select,textarea')) return;
    const row = e.target.closest('[data-license-row]');
    if(row){
      toggleAdminLicenseExpand(row.getAttribute('data-license-row'));
      return;
    }
    return;
  }
  if(e.target.closest('.admin-member-expand')) return;
  const card = e.target.closest('[data-admin-uid]');
  if(!card) return;
  selectAdminCrmUser(card.getAttribute('data-admin-uid'));
}
function adminLicenseExpandGrant(btn){
  const uid=btn.getAttribute('data-license-uid');
  const kind=btn.getAttribute('data-license-grant');
  if(!uid || !kind) return;
  const wrap=btn.closest('.admin-license-expand-inner');
  const lic=licenseForUid(uid);
  if(kind==='trial') return adminQuickLicense(`${uid}:trial:active`, false, { days: 7 });
  if(kind==='lifetime') return adminQuickLicense(`${uid}:lifetime:active`, false, { clearDates: true });
  if(kind==='activate') return adminQuickLicense(`${uid}:${lic?.plan||'lifetime'}:active`);
  if(kind==='ban') return adminQuickLicense(`${uid}:${normalizePlan(lic)}:banned`);
  if(String(kind||'').startsWith('period') && wrap){
    const days = Number(String(kind).split(':')[1] || 30) || 30;
    const passMap = { 7: 'PASS_7D', 30: 'PASS_30D', 90: 'PASS_90D' };
    const passId = passMap[days] || `PASS_${days}D`;
    const plan=wrap.querySelector('[data-lic-plan]');
    const start=wrap.querySelector('[data-lic-starts]');
    const end=wrap.querySelector('[data-lic-expires]');
    const passField=wrap.querySelector('[data-lic-pass-product]');
    if(plan) plan.value='period';
    if(passField) passField.value = passId;
    const base = start?.value ? new Date(start.value + 'T00:00:00') : new Date();
    if(start) start.value = toDateInputValue(base);
    if(end){
      const d = new Date(base.getTime());
      d.setDate(d.getDate() + days);
      end.value = toDateInputValue(d);
    }
    end?.focus();
    adminFlash(`${days}일 Full (${passId}) · 확인 후 저장하세요`);
  }
}
async function saveAdminLicenseInline(uid, wrap){
  if(!isAdminUser || !uid || !wrap) return;
  const planRaw=wrap.querySelector('[data-lic-plan]')?.value||'';
  const licenseMemo=wrap.querySelector('[data-lic-memo]')?.value||'';
  let startsAt=wrap.querySelector('[data-lic-starts]')?.value||'';
  let expiresAt=wrap.querySelector('[data-lic-expires]')?.value||'';
  if(!planRaw) return alert('라이선스 유형을 선택해 주세요.');
  const wantsClearDates = planRaw==='lifetime' || planRaw==='trial';
  if(wantsClearDates){ startsAt=''; expiresAt=''; }
  if(planRaw==='period' && startsAt && expiresAt && startsAt > expiresAt){
    return alert('시작일이 만료일보다 늦을 수 없습니다.');
  }
  try{
    const {doc,setDoc,serverTimestamp,deleteField}=firestoreApi;
    let savePlan=normalizeAdminLicensePlanForSave(planRaw, expiresAt, startsAt);
    if(!['trial','lifetime','period'].includes(savePlan)) savePlan='trial';
    const clearDates = savePlan==='lifetime' || savePlan==='trial';
    const startsAtTs = clearDates ? null : dateInputToStartTimestamp(startsAt);
    const expiresAtTs = clearDates ? null : dateInputToEndTimestamp(expiresAt);
    const payload={
      licensed: true,
      plan: savePlan,
      status: 'active',
      method:'manual',
      memo:licenseMemo,
      updatedAt:serverTimestamp()
    };
    const passProductId = String(wrap.querySelector('[data-lic-pass-product]')?.value || '').trim().toUpperCase();
    if(savePlan === 'period' && passProductId){
      payload.passProductId = passProductId;
    } else if(savePlan !== 'period'){
      payload.passProductId = deleteField();
    }
    if(clearDates){
      payload.startsAt = deleteField();
      payload.expiresAt = deleteField();
    } else {
      payload.startsAt = startsAtTs || deleteField();
      payload.expiresAt = expiresAtTs || deleteField();
    }
    const prev=licenseForUid(uid);
    await setDoc(doc(db,'licenses',uid), payload, {merge:true});
    patchAdminLicenseCache(uid, {
      licensed: true,
      plan: savePlan,
      status: 'active',
      method: 'manual',
      memo: licenseMemo,
      passProductId: savePlan === 'period' ? (passProductId || prev?.passProductId || '') : '',
      startsAt: startsAtTs,
      expiresAt: expiresAtTs,
      updatedAt: adminLicenseCacheNow()
    });
    try{ await notifyLicenseChange(uid, {plan:savePlan, status:'active'}); }catch(err){ console.error(err); }
    writeAdminAuditLog({
      targetUserId: uid,
      targetEmail: findAdminUserRow(uid)?.email || '',
      category: 'license',
      action: savePlan === 'period' ? 'PASS_ADMIN_GRANTED' : '라이선스 변경',
      before: { plan: prev?.plan, startsAt: prev?.startsAt || null, expiresAt: prev?.expiresAt || null, memo: prev?.memo || '', passProductId: prev?.passProductId || '' },
      after: { plan: savePlan, status: 'active', startsAt: clearDates ? null : startsAt, expiresAt: clearDates ? null : expiresAt, memo: licenseMemo, method: 'manual', passProductId: savePlan === 'period' ? passProductId : '' },
      result: 'success',
      summary: `${prev?.plan||'-'} → ${savePlan}${passProductId ? ' · '+passProductId : ''}`
    });
    adminFlash(`${tr('saved')} · ${esc(uid)}`);
    adminCrmLicenseOpen = uid;
    renderAdminUserTable({ keepOrder: true });
  }catch(e){
    alert(e.message||e);
  }
}
function adminCrmVisiblePageUids(){
  const start = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE;
  return (adminCrmFilteredRows || []).slice(start, start + ADMIN_CRM_PAGE_SIZE).map(u=>u && u.uid).filter(Boolean);
}
function adminCrmHasSearchOrFilter(){
  const q=($('adminUserSearch')?.value||'').trim();
  return !!(q || adminCrmActiveFilterCount() || (adminCrmMode()==='license' && adminLicenseWorkTab && adminLicenseWorkTab!=='all'));
}
function resolveAdminBulkUids(audience){
  const all = (adminUserRows||[]).map(mapAdminCrmUserRow);
  if(audience==='selected') return [...adminCrmSelected];
  if(audience==='page') return adminCrmVisiblePageUids();
  if(audience==='filtered') return (adminCrmFilteredRows||[]).map(u=>u.uid).filter(Boolean);
  if(audience==='all') return all.map(u=>u.uid).filter(Boolean);
  if(audience==='expired'){
    return all.filter(u=>{
      const view=u.licenseView || adminLicenseView(u);
      return view.status==='expired';
    }).map(u=>u.uid).filter(Boolean);
  }
  if(audience==='period' || audience==='lifetime' || audience==='trial'){
    return all.filter(u=>adminLicenseWorkMatch(u, audience)).map(u=>u.uid).filter(Boolean);
  }
  return [...adminCrmSelected];
}
function newAdminBulkOperationId(){
  if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function') return crypto.randomUUID();
  return `op_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}
function adminBulkRecipientsFromUids(uids){
  return (uids || []).map(uid => {
    const row = findAdminUserRow(uid);
    return {
      uid,
      displayName: row?.displayName || 'Google User',
      email: String(row?.email || '').trim()
    };
  });
}
function formatBulkEmailResultAlert(result, fallbackRequested){
  const requested = Number(result?.requested || fallbackRequested || 0);
  const successN = Number(result?.success || 0);
  const failN = Number(result?.failed || 0);
  const title = (successN === requested && failN === 0)
    ? '메일 발송 완료'
    : (successN > 0 && failN > 0)
      ? '일부 메일 발송 실패'
      : '메일 발송 실패';
  const failLines = Array.isArray(result?.failures) && result.failures.length
    ? `\n실패: ${result.failures.slice(0,8).map(f=>f.email || f.uid).join(', ')}`
    : '';
  return {
    title,
    summary: `${title} · 대상 ${requested}명 · 성공 ${successN}명 · 실패 ${failN}명`,
    alertText: `${title}\n\n대상 ${requested}명\n성공 ${successN}명\n실패 ${failN}명${failLines}`,
    failN
  };
}
async function sendAdminEmailDraft(draft){
  if(draft.sendMode === 'scheduled'){
    const result = await callFunctionJson('adminScheduledEmail', {
      action: 'create',
      recipientUids: draft.recipientUids,
      subject: draft.subject,
      body: draft.body,
      preheader: draft.preheader || '',
      bannerEnabled: !!draft.bannerEnabled,
      bannerEyebrow: draft.bannerEyebrow || '',
      bannerTitle: draft.bannerTitle || '',
      bannerDescription: draft.bannerDescription || '',
      bannerImageUrl: draft.bannerImageUrl || '',
      ctaLabel: draft.ctaLabel || '',
      ctaUrl: draft.ctaUrl || '',
      scheduledDate: draft.scheduledDate,
      scheduledTime: draft.scheduledTime,
      timezone: 'Asia/Seoul'
    });
    adminFlash(`예약됨 · ${result.scheduledAtKst || ''} · ${draft.recipientUids.length}명`);
    pushAdminCrmFeed('메일 예약', `${draft.subject} · ${result.scheduledAtKst || ''}`, draft.recipientUids[0] || '');
    return result;
  }
  const operationId = newAdminBulkOperationId();
  const result = await callFunctionJson('sendAdminBulkEmail', {
    recipientUids: draft.recipientUids,
    subject: draft.subject,
    body: draft.body,
    preheader: draft.preheader || '',
    bannerEnabled: !!draft.bannerEnabled,
    bannerEyebrow: draft.bannerEyebrow || '',
    bannerTitle: draft.bannerTitle || '',
    bannerDescription: draft.bannerDescription || '',
    bannerImageUrl: draft.bannerImageUrl || '',
    ctaLabel: draft.ctaLabel || '',
    ctaUrl: draft.ctaUrl || '',
    operationId
  });
  const painted = formatBulkEmailResultAlert(result, draft.recipientUids.length);
  adminFlash(painted.summary);
  if(painted.failN) alert(painted.alertText);
  pushAdminCrmFeed('일괄 메일', `${draft.subject} · 성공 ${result.success || 0}`, draft.recipientUids[0] || '');
  if(Number(result.success || 0) === 0 && painted.failN > 0){
    throw new Error(painted.title);
  }
  return result;
}
function adminEmailHistoryRequest(payload){
  return callFunctionJson('adminScheduledEmail', payload);
}
async function openAdminEmailCenter({ recipients = [], initialTab = 'compose' } = {}){
  await openBulkMessageComposer({
    channel: 'email',
    recipients,
    initialTab,
    historyRequest: adminEmailHistoryRequest,
    onSend: async (draft) => {
      adminBulkBusy = true;
      try{
        return await sendAdminEmailDraft(draft);
      }catch(err){
        const code = err?.code || err?.data?.code;
        const msg = (code === 'MAIL_NOT_CONFIGURED' || code === 'SMTP_AUTH_FAILED')
          ? '메일 발송 설정이 완료되지 않았습니다.'
          : (code === 'SMTP_UNAVAILABLE')
            ? '메일 서버에 연결하지 못했습니다.'
            : (code === 'SCHEDULE_TIME_PAST')
              ? '예약 시간은 현재 시간 이후로 설정해 주세요.'
              : (err?.message || '메일 발송에 실패했습니다.');
        throw new Error(msg);
      }finally{
        adminBulkBusy = false;
      }
    }
  });
}
async function runAdminBulkEmail(){
  if(adminBulkBusy) return;
  if(adminCrmMode()!=='members') return;
  const uids = [...adminCrmSelected];
  if(!uids.length){ adminFlash('발송 대상이 없습니다'); return; }
  await openAdminEmailCenter({
    recipients: adminBulkRecipientsFromUids(uids),
    initialTab: 'compose'
  });
}
async function runAdminBulkAppMessage(){
  if(adminBulkBusy) return;
  if(adminCrmMode()!=='members') return;
  const uids = [...adminCrmSelected];
  if(!uids.length){ adminFlash('발송 대상이 없습니다'); return; }
  const recipients = adminBulkRecipientsFromUids(uids);
  await openBulkMessageComposer({
    channel: 'app_message',
    recipients,
    onSend: async (draft) => {
      adminBulkBusy = true;
      let ok = 0;
      let fail = 0;
      try{
        for(const uid of draft.recipientUids){
          try{
            await notifyAdminAppMessage(uid, { title: draft.subject, body: draft.body });
            writeAdminAuditLog({
              targetUserId: uid,
              targetEmail: findAdminUserRow(uid)?.email || '',
              category: 'message',
              action: '쪽지 발송',
              before: null,
              after: { title: draft.subject, body: draft.body.slice(0,500), bulk: true },
              result: 'success',
              summary: draft.subject
            });
            ok++;
          }catch(err){
            console.error('bulk app-message', uid, err);
            fail++;
          }
        }
        adminFlash(`일괄 앱 쪽지 · 성공 ${ok}명${fail?` · 실패 ${fail}명`:''}`);
        pushAdminCrmFeed('일괄 앱 쪽지', `${ok}명 · ${draft.subject}`, draft.recipientUids[0]||'');
        if(fail && !ok) throw new Error(`앱 쪽지 발송 실패 · ${fail}명`);
        return { ok: true, success: ok, failed: fail };
      }finally{
        adminBulkBusy = false;
      }
    }
  });
}
async function runAdminBulkCredits(){
  if(adminBulkBusy) return;
  if(adminCrmMode()!=='license') return;
  const uids = [...adminCrmSelected];
  if(!uids.length){ adminFlash('지급/회수 대상이 없습니다'); return; }
  const draft = await openEditModal(`크레딧 일괄 지급/회수 · ${uids.length}명`, [
    { name:'mode', label:'모드', type:'segment', value:'grant', options:[{ value:'grant', label:'지급' }, { value:'deduct', label:'회수' }] },
    { name:'amount', label:'지급 크레딧', type:'number', required:true, value:1 },
    { name:'reason', label:'지급 사유', type:'text', value:'', placeholder:'이벤트/보상 사유 입력' }
  ], {
    submitLabel:'지급',
    modalClass:'admin-bulk-compact admin-bulk-credit-modal',
    onReady(form){
      bindAdminBulkCreditModal(form);
    }
  });
  if(!draft) return;
  const mode = String(draft.mode || 'grant') === 'deduct' ? 'deduct' : 'grant';
  const verb = mode === 'deduct' ? '회수' : '지급';
  const amount = Number(draft.amount);
  if(!Number.isInteger(amount) || amount <= 0){ adminFlash(`${verb} 크레딧은 1 이상의 정수여야 합니다`); return; }
  const total = uids.length * amount;
  const unit = amount===1 ? 'Credit' : 'Credits';
  const totalUnit = total===1 ? 'Credit' : 'Credits';
  const who = uids.length===1
    ? `1명에게 ${amount} ${unit}을 ${verb}합니다.`
    : `${uids.length}명에게 각각 ${amount} ${unit}을 ${verb}합니다.`;
  if(!confirm(`크레딧 ${verb} 확인\n\n${who}\n총 ${verb}량: ${total} ${totalUnit}`)) return;
  adminBulkBusy = true;
  const operationId = newAdminBulkOperationId();
  adminFlash(`${uids.length}명 크레딧 ${verb} 작업이 시작되었습니다.`, { persist: true });
  try{
    const started = await callFunctionJson('grantBulkCredits', {
      recipientUids: uids,
      amount,
      mode,
      reason: String(draft.reason||'').trim(),
      operationId
    });
    let result = started;
    if(started && started.accepted && String(started.status || '') !== 'COMPLETED' && started.code !== 'ALREADY_COMPLETED'){
      const deadline = Date.now() + 90000;
      while(Date.now() < deadline){
        await new Promise((resolve)=>setTimeout(resolve, 1500));
        try{
          result = await callFunctionJson('grantBulkCredits', { operationId, poll: true });
        }catch(_){
          break;
        }
        const st = String(result.status || '');
        adminFlash(`${uids.length}명 크레딧 ${verb} 중 · 성공 ${result.success || 0} · 실패 ${result.failed || 0}`, { persist: true });
        if(st === 'COMPLETED') break;
      }
    }
    if(String(result.status || '') !== 'COMPLETED' && result.code !== 'ALREADY_COMPLETED'){
      adminFlash(`${uids.length}명 크레딧 ${verb} 작업이 서버에서 계속됩니다.`);
      return;
    }
    const failN = Number(result.failed || 0);
    adminFlash(`크레딧 ${verb} 완료 · ${result.requested}명 × ${amount} Credits · 총 ${result.totalCredits} · 성공 ${result.success} · 실패 ${failN}`);
    if(failN){
      const lines = (result.failures||[]).slice(0,8).map(f=>f.uid).join(', ');
      alert(`크레딧 ${verb} 완료\n\n${result.requested}명 × ${amount} Credits\n총 ${result.totalCredits} Credits\n성공 ${result.success}\n실패 ${failN}${lines ? '\n'+lines : ''}`);
    }
    if(selectedAdminUid) renderAdminCrmPoints(selectedAdminUid, { silent: true });
    if(adminCrmLicenseOpen && result?.balances){
      const n = result.balances[adminCrmLicenseOpen];
      if(n != null) applyAdminCreditBalanceLocal(adminCrmLicenseOpen, n);
    } else if(adminCrmLicenseOpen){
      fillAdminLicenseExpandCredits(adminCrmLicenseOpen);
    }
  }catch(err){
    alert(err?.message || err);
  }finally{
    adminBulkBusy = false;
  }
}
function bindAdminBulkCreditModal(form){
  if(!form) return;
  const amountRow = form.querySelector('[data-field="amount"]');
  const amountInput = form.querySelector('[name="amount"]');
  const reasonRow = form.querySelector('[data-field="reason"]');
  const reasonInput = form.querySelector('[name="reason"]');
  const submit = form.querySelector('[type="submit"]');
  const modeRow = form.querySelector('[data-field="mode"]');
  const modeLabel = modeRow?.querySelector(':scope > span');
  if(modeLabel) modeLabel.hidden = true;
  if(!amountRow || form.querySelector('.admin-bulk-credit-quick')) return;
  const quick = document.createElement('div');
  quick.className = 'admin-bulk-credit-quick';
  quick.innerHTML = `
    <div class="admin-crm-points-quick" data-bulk-credit-quick="grant" role="group" aria-label="빠른 지급">
      <button type="button" class="secondary mini-btn" data-bulk-credit-amount="1">+1</button>
      <button type="button" class="secondary mini-btn" data-bulk-credit-amount="3">+3</button>
      <button type="button" class="secondary mini-btn" data-bulk-credit-amount="5">+5</button>
      <button type="button" class="secondary mini-btn" data-bulk-credit-amount="10">+10</button>
    </div>
    <div class="admin-crm-points-quick" data-bulk-credit-quick="deduct" hidden role="group" aria-label="빠른 회수">
      <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="1">-1</button>
      <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="3">-3</button>
      <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="5">-5</button>
      <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="10">-10</button>
    </div>`;
  amountRow.after(quick);
  const amountLabel = amountRow.querySelector(':scope > span');
  const reasonLabel = reasonRow?.querySelector(':scope > span');
  const currentMode = () => String(form.querySelector('[name="mode"]:checked')?.value || 'grant');
  const syncMode = () => {
    const deduct = currentMode() === 'deduct';
    const verb = deduct ? '회수' : '지급';
    if(amountLabel) amountLabel.textContent = `${verb} 크레딧`;
    if(reasonLabel) reasonLabel.textContent = `${verb} 사유`;
    if(reasonInput) reasonInput.placeholder = deduct ? '회수 사유 입력' : '이벤트/보상 사유 입력';
    if(submit){
      submit.textContent = verb;
      submit.classList.toggle('danger-btn', deduct);
    }
    quick.querySelector('[data-bulk-credit-quick="grant"]')?.toggleAttribute('hidden', deduct);
    quick.querySelector('[data-bulk-credit-quick="deduct"]')?.toggleAttribute('hidden', !deduct);
  };
  quick.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-bulk-credit-amount]');
    if(!btn) return;
    e.preventDefault();
    if(amountInput) amountInput.value = String(btn.getAttribute('data-bulk-credit-amount') || '1');
  });
  form.addEventListener('change', (e)=>{
    if(e.target?.name === 'mode') syncMode();
  });
  syncMode();
}
function syncAdminCrmBulkButtons(){
  const bar=$('adminCrmBulkbar'); if(!bar) return;
  const mode=adminCrmMode();
  bar.querySelectorAll('[data-bulk]').forEach(btn=>{
    const modes=String(btn.getAttribute('data-bulk-modes')||'').split(',').map(s=>s.trim()).filter(Boolean);
    btn.hidden = modes.length ? !modes.includes(mode) : false;
  });
  const schedListBtn=$('adminScheduledEmailListBtn');
  if(schedListBtn) schedListBtn.hidden = mode !== 'members';
}
function updateAdminCrmBulkbar(){
  const bar=$('adminCrmBulkbar'); if(!bar) return;
  if(adminCrmMode()!=='members' && adminCrmMode()!=='license'){
    bar.hidden = true;
    return;
  }
  const n=adminCrmSelected.size;
  bar.hidden = n===0;
  $('adminCrmBulkCount') && ($('adminCrmBulkCount').textContent=`${n}명 선택됨`);
  syncAdminCrmBulkButtons();
  const all=$('adminCrmSelectAll');
  if(all){
    const visibleIds = adminCrmVisiblePageUids();
    all.checked = visibleIds.length>0 && visibleIds.every(id=>adminCrmSelected.has(id));
    all.indeterminate = !all.checked && visibleIds.some(id=>adminCrmSelected.has(id));
  }
  const filteredBtn=$('adminCrmSelectFiltered');
  if(filteredBtn) filteredBtn.textContent = '검색 결과 전체 선택';
  const schedListBtn=$('adminScheduledEmailListBtn');
  if(schedListBtn) schedListBtn.hidden = adminCrmMode() !== 'members';
}
function selectAdminCrmUser(uid, opts={}){
  if(!uid || !isAdminUser) return;
  const onMembers = adminCrmMode()==='members';
  if(onMembers && !opts.forceOpen && selectedAdminUid===uid && $('adminCrm')?.classList.contains('is-row-expand')){
    closeAdminCrmMemberExpand();
    return;
  }
  const same = selectedAdminUid===uid;
  selectedAdminUid = uid;
  if(!same){
    adminCrmHwidRevealed = false;
    adminCrmPostSelected.clear();
  }
  $('adminCrm')?.classList.add('is-detail-open');
  $('adminCrm')?.classList.toggle('is-row-expand', onMembers);
  if(opts.tab) setAdminCrmDetailTab(opts.tab);
  else if(!same) setAdminCrmDetailTab(document.body.dataset.crmDetailTab || 'overview');
  else setAdminCrmDetailTab($('adminCrmDetailBody')?.dataset.tab || 'overview');
  if(onMembers) ensureAdminCrmPageForUid(uid);
  paintAdminCrmVirtualList();
  if(same){
    renderAdminCrmDetail(uid);
    return;
  }
  showAdminCrmSkeleton(true);
  clearTimeout(adminCrmDetailTimer);
  adminCrmDetailTimer = setTimeout(()=>{
    renderAdminCrmDetail(uid);
    showAdminCrmSkeleton(false);
  }, 120);
}
function closeAdminCrmMemberExpand(){
  selectedAdminUid=null;
  parkAdminCrmDetail();
  renderAdminCrmDetail(null);
  paintAdminCrmPagedList();
}
function ensureAdminCrmPageForUid(uid){
  const idx=adminCrmFilteredRows.findIndex(u=>u.uid===uid);
  if(idx<0) return;
  adminCrmPage = Math.floor(idx / ADMIN_CRM_PAGE_SIZE) + 1;
}
function parkAdminCrmDetail(){
  const pane=$('adminCrmDetail');
  if(!pane) return;
  const empty=$('adminCrmEmpty');
  const sk=$('adminCrmSkeleton');
  const body=$('adminCrmDetailBody');
  const save=$('adminCrmFloatSave');
  if(empty && empty.parentElement!==pane) pane.insertBefore(empty, pane.firstChild);
  if(sk && sk.parentElement!==pane){
    const before = body && body.parentElement===pane ? body : (save && save.parentElement===pane ? save : null);
    pane.insertBefore(sk, before);
  }
  if(body && body.parentElement!==pane){
    const before = save && save.parentElement===pane ? save : null;
    pane.insertBefore(body, before);
  }
  if(save && save.parentElement!==pane) pane.appendChild(save);
}
function mountAdminCrmDetailInMemberRow(){
  const crm=$('adminCrm');
  const host=$('adminCrmMemberExpandHost');
  const body=$('adminCrmDetailBody');
  const sk=$('adminCrmSkeleton');
  const save=$('adminCrmFloatSave');
  if(!host || !body || adminCrmMode()!=='members' || !selectedAdminUid){
    crm?.classList.remove('is-row-expand');
    return;
  }
  crm?.classList.add('is-row-expand');
  if(sk) host.appendChild(sk);
  host.appendChild(body);
  if(save) host.appendChild(save);
}
function showAdminCrmSkeleton(on){
  const sk=$('adminCrmSkeleton');
  const empty=$('adminCrmEmpty');
  const body=$('adminCrmDetailBody');
  if(!sk) return;
  if(on){
    empty?.classList.add('is-hidden');
    body?.classList.add('is-hidden');
    sk.classList.remove('is-hidden');
  }else{
    sk.classList.add('is-hidden');
  }
}
function refreshAdminCrmDetail(opts={}){
  // Avoid wiping in-progress edits when Firestore snapshots fire.
  if(adminCrmDirty && !opts.force) return;
  if(selectedAdminUid) renderAdminCrmDetail(selectedAdminUid, opts);
}
function renderAdminCrmHwidBox(user, lic){
  const box=$('adminCrmHwidBox'); if(!box) return;
  const uid = adminUserUid(user) || lic?.uid || selectedAdminUid || '';
  const hwid = adminHwidOf(user, lic);
  const shown = adminCrmHwidRevealed ? (hwid || '(없음)') : maskAdminHwid(hwid);
  box.innerHTML = `
    <div class="admin-crm-hwid-inline">
      <span class="admin-id-pair">
        <span class="admin-id-item">UID <code class="mono">${esc(uid || '-')}</code></span>
        <span class="admin-id-item admin-crm-hwid-label">HWID</span>
      </span>
      <code class="mono admin-crm-hwid-value${adminCrmHwidRevealed?' is-revealed':''}">${esc(shown)}</code>
    </div>
    <div class="admin-crm-hwid-actions">
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-reveal">${adminCrmHwidRevealed?'숨기기':'보기'}</button>
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-copy" ${hwid?'':'disabled'}>복사</button>
      <button type="button" class="secondary mini-btn danger-btn" data-crm-action="hwid-reset">초기화</button>
    </div>`;
}
function renderAdminCrmAccessBox(user){
  const box=$('adminCrmAccessBox'); if(!box) return;
  const info = adminAccessInfo(user);
  if(!info || (!info.countryCode && !info.city && !info.language && !info.lastIpMasked && !info.clientType)){
    box.innerHTML = `<p class="muted small admin-crm-access-empty">${esc(tt('국가 정보 없음'))}</p>`;
    return;
  }
  const flag = countryFlagEmoji(info.countryCode);
  const country = info.countryCode
    ? `${flag}${flag ? ' ' : ''}${esc(info.countryName || info.countryCode)}`
    : esc(tt('국가 정보 없음'));
  const rows = [
    [tt('국가'), country],
    [tt('지역'), esc(info.city || '-')],
    [tt('최근 접속'), esc(fmtListDateTime(user.lastLogin || user.lastSeenAt || info.lastSeenAt))],
    [tt('IP'), esc(info.lastIpMasked || '-')],
    [tt('언어'), esc(info.language || '-')],
    [tt('접속 환경'), esc(adminAccessClientLabel(info.clientType))]
  ];
  box.innerHTML = `<dl class="admin-crm-access-list">${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}
function captureAdminCrmBaseline(){
  adminCrmBaseline = {
    role: $('adminUserRole')?.value || 'user',
    plan: $('adminLicensePlan')?.value || '',
    startsAt: $('adminLicenseStartsAt')?.value || '',
    expiresAt: $('adminLicenseExpiresAt')?.value || '',
    licenseMemo: $('adminLicenseMemo')?.value || '',
    userMemo: $('adminCrmUserMemo')?.value || ''
  };
  setAdminCrmDirty(false);
}
function setAdminCrmDirty(dirty){
  adminCrmDirty = !!dirty;
  const btn=$('adminCrmFloatSave');
  if(!btn) return;
  if(!selectedAdminUid){ btn.hidden=true; return; }
  btn.hidden=false;
  btn.disabled = !adminCrmDirty;
  btn.classList.toggle('is-disabled', !adminCrmDirty);
  btn.textContent = adminCrmDirty ? 'Save Changes' : 'Saved';
}
function checkAdminCrmDirty(){
  if(!adminCrmBaseline){ setAdminCrmDirty(false); return; }
  const cur={
    role: $('adminUserRole')?.value || 'user',
    plan: $('adminLicensePlan')?.value || '',
    startsAt: $('adminLicenseStartsAt')?.value || '',
    expiresAt: $('adminLicenseExpiresAt')?.value || '',
    licenseMemo: $('adminLicenseMemo')?.value || '',
    userMemo: $('adminCrmUserMemo')?.value || ''
  };
  const dirty = Object.keys(cur).some(k=>cur[k]!==adminCrmBaseline[k]);
  setAdminCrmDirty(dirty);
}
function renderAdminCrmMemoHistory(user){
  const box=$('adminCrmMemoHistory'); if(!box) return;
  const hist = Array.isArray(user?.adminMemoHistory) ? user.adminMemoHistory.slice(0, 5) : [];
  if(!hist.length){ box.innerHTML=''; return; }
  box.innerHTML = `<div class="admin-crm-memo-hist-list">${hist.map(h=>{
    const when = h?.at?.seconds ? fmtRelative(h.at) : (h?.atMs ? fmtRelative({seconds:Math.floor(Number(h.atMs)/1000)}) : '-');
    const text = String(h?.text||'').slice(0,80);
    return `<div class="admin-crm-memo-hist-item"><time>${esc(when)}</time><span>${esc(text)}</span></div>`;
  }).join('')}</div>`;
}
function renderAdminCrmRecentFeed(){
  const box=$('adminCrmRecentFeed'); if(!box) return;
  const uid = String(selectedAdminUid || '').trim();
  if(!uid){
    box.innerHTML=`<p class="muted small">회원을 선택하면 관리 활동이 표시됩니다.</p>`;
    return;
  }
  const items = adminCrmRecentFeed
    .filter(it => adminUidAliases(uid).has(String(it?.uid || '')))
    .slice(0, 12);
  if(!items.length){
    box.innerHTML=`<p class="muted small">이 회원에 대한 최근 관리 활동이 없습니다.</p>`;
    return;
  }
  box.innerHTML = items.map(it=>`<div class="admin-crm-feed-item"><time>${esc(fmtClock(it.t/1000))}</time><b>${esc(it.label)}</b>${it.detail?`<span>${esc(it.detail)}</span>`:''}</div>`).join('');
}
function adminCrmDashBtn(label, tab, extraAction){
  if(extraAction){
    return `<button type="button" class="ghost mini-btn" data-crm-action="${esc(extraAction)}">${esc(label)}</button>`;
  }
  return `<button type="button" class="ghost mini-btn" data-crm-action="goto-tab" data-crm-tab="${esc(tab)}">${esc(label)}</button>`;
}
function adminCrmDashRow(label, valueHtml){
  return `<div class="admin-crm-dash-row"><dt>${esc(label)}</dt><dd>${valueHtml}</dd></div>`;
}
function renderAdminCrmOverview(user, view, lic, orders, tickets, posts){
  const box=$('adminCrmSummary'); if(!box) return;
  const statusLabel = !view || view.state==='loading' ? '확인 중'
    : (view.state==='error' ? '조회 오류'
    : (view.state==='conflict' ? '라이선스 충돌'
    : (view.state==='missing' || !lic ? '확인 필요'
    : adminLicenseStatusLabel(view.status))));
  const start = lic?.startsAt ? fmtListDate(lic.startsAt) : '-';
  const end = view?.plan==='lifetime' ? '없음' : (lic?.expiresAt ? fmtListDate(lic.expiresAt) : '-');
  const actor = lic?.method ? adminLicenseMethodLabel(lic.method) : '-';
  const country = adminAccessCountryLine(user) || '정보 없음';
  const uid = adminUserUid(user) || view?.uid || '';
  const hwid = adminHwidOf(user, lic);
  const paid = (orders||[]).filter(o=>adminOrderStatusGroup(o.status)==='paid');
  const lastPaid = paid[0];
  const lastPaidText = lastPaid
    ? `${fmtListDate(lastPaid.completedAt||lastPaid.verifiedAt||lastPaid.createdAt)}${lastPaid.amount!=null?` · ${Number(lastPaid.amount).toLocaleString('ko-KR')} ${lastPaid.currency||'KRW'}`:''}`
    : '';
  const usageCached = adminCrmDashUsageCache.uid && adminCrmDashUsageCache.uid === String(adminUserUid(user) || view?.uid || '') && adminCrmDashUsageCache.text;
  const usageHtml = usageCached
    ? `<span id="adminCrmDashUsage"${adminCrmDashUsageCache.empty?' class="admin-crm-dash-empty"':''}>${esc(adminCrmDashUsageCache.text)}</span>`
    : `<span id="adminCrmDashUsage" class="muted">불러오는 중...</span>`;
  const recentTickets = (tickets||[]).slice(0, 3);
  const ticketList = recentTickets.length
    ? `<ul class="admin-crm-dash-list">${recentTickets.map(t=>`<li><b title="${esc(t.title||'(제목 없음)')}">${esc(t.title||'(제목 없음)')}</b><span>${esc(adminPaymentStatusLabel(t.status||'open'))} · ${esc(fmtListDate(t.createdAt||t.updatedAt))}</span></li>`).join('')}</ul>`
    : '';
  box.innerHTML = `<div class="admin-crm-dash-grid">
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>라이선스</h3><div class="admin-crm-dash-actions">${adminCrmDashBtn('관리','license')}</div></header>
      <dl class="admin-crm-dash-dl">
        ${adminCrmDashRow('유형', adminPlanBadgeFromView(view))}
        ${adminCrmDashRow('상태', esc(statusLabel))}
        ${adminCrmDashRow('시작', esc(start))}
        ${adminCrmDashRow('만료', esc(end))}
        ${adminCrmDashRow('지급', esc(actor))}
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>접속/기기</h3><div class="admin-crm-dash-actions">${adminCrmDashBtn('보기','access')}${adminCrmDashBtn('관리','device')}</div></header>
      <dl class="admin-crm-dash-dl">
        ${adminCrmDashRow('상태', adminActivityBadgeHtml(user))}
        ${adminCrmDashRow('최근 접속', esc(fmtRelative(user.lastLogin||user.lastSeenAt)))}
        ${adminCrmDashRow('국가', country==='정보 없음' ? `<span class="admin-crm-dash-empty">정보 없음</span>` : esc(country))}
        ${adminCrmDashRow('UID', `<code class="mono">${esc(uid || '-')}</code>`)}
        ${adminCrmDashRow('HWID', hwid ? `<code class="mono">${esc(hwid)}</code>` : `<span class="admin-crm-dash-empty">없음</span>`)}
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>이용 현황</h3><div class="admin-crm-dash-actions">${adminCrmDashBtn('보기','payments')}${adminCrmDashBtn('상세','', 'focus-usage')}</div></header>
      <dl class="admin-crm-dash-dl">
        ${adminCrmDashRow('주문', orders?.length ? `${orders.length}건` : `<span class="admin-crm-dash-empty">주문 내역 없음</span>`)}
        ${adminCrmDashRow('결제', paid.length ? esc(lastPaidText) : `<span class="admin-crm-dash-empty">결제 내역 없음</span>`)}
        ${adminCrmDashRow('FULL 사용', usageHtml)}
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>고객 지원</h3><div class="admin-crm-dash-actions">${adminCrmDashBtn('보기','tickets')}${adminCrmDashBtn('작성글','posts')}</div></header>
      <dl class="admin-crm-dash-dl">
        ${adminCrmDashRow('문의', tickets?.length ? `${tickets.length}건` : `<span class="admin-crm-dash-empty">문의 없음</span>`)}
        ${adminCrmDashRow('작성글', posts?.length ? `${posts.length}건` : `<span class="admin-crm-dash-empty">작성글 없음</span>`)}
      </dl>
      ${ticketList || ''}
    </section>
  </div>`;
}
let adminCrmDashUsageCache = { uid:'', text:'', empty:false };
function setAdminCrmDashUsageText(text, isEmpty){
  adminCrmDashUsageCache = { uid: String(selectedAdminUid||''), text: String(text||''), empty: !!isEmpty };
  const el=$('adminCrmDashUsage'); if(!el) return;
  el.textContent = adminCrmDashUsageCache.text;
  el.classList.toggle('admin-crm-dash-empty', !!isEmpty);
  el.classList.remove('muted');
}
function setAdminCrmUsageOpen(open){
  const card=$('adminCrmUsageCard');
  const btn=$('adminCrmUsageToggle');
  const body=$('adminCrmUsage');
  const hint=$('adminCrmUsageHint');
  if(!card || !btn || !body) return;
  card.classList.toggle('is-collapsed', !open);
  body.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if(hint) hint.textContent = open ? '접기' : '펼치기';
}
function renderAdminCrmDetail(uid, opts={}){
  const empty=$('adminCrmEmpty');
  const body=$('adminCrmDetailBody');
  const sk=$('adminCrmSkeleton');
  sk?.classList.add('is-hidden');
  if(!uid){
    parkAdminCrmDetail();
    empty?.classList.remove('is-hidden');
    body?.classList.add('is-hidden');
    $('adminCrm')?.classList.remove('is-detail-open', 'is-row-expand');
    setAdminCrmDirty(false);
    const fb=$('adminCrmFloatSave'); if(fb) fb.hidden=true;
    renderAdminCrmDetail._lastUid = '';
    return;
  }
  // If payment is refunded but CRM cache still shows period (e.g. "7일 Full"), refresh licenses/{uid}.
  if(!opts.skipLicenseRefresh && !renderAdminCrmDetail._refreshing){
    const cached = licenseForUid(uid);
    const hasRefundedPass = adminOrdersForUid(uid).some(o=>{
      const st=String(o.status||'').toLowerCase();
      const pid=String(o.productId||'').toUpperCase();
      const isPass = pid.startsWith('PASS_') || String(o.plan||'').toLowerCase()==='period';
      return isPass && (st==='refunded'||st==='cancelled'||st==='canceled'||o.licenseRevoked===true);
    });
    const cacheLooksPeriod = cached && (normalizePlan(cached)==='period' || !!cached.passProductId);
    if(hasRefundedPass && cacheLooksPeriod){
      renderAdminCrmDetail._refreshing = true;
      refreshAdminLicenseFromServer(uid).then(()=>{
        renderAdminCrmDetail._refreshing = false;
        renderAdminCrmDetail(uid, { ...opts, skipLicenseRefresh: true });
      }).catch(()=>{ renderAdminCrmDetail._refreshing = false; });
    }
  }
  const user = findAdminUserRow(uid);
  if(!user){
    empty?.classList.remove('is-hidden');
    body?.classList.add('is-hidden');
    return;
  }
  empty?.classList.add('is-hidden');
  body?.classList.remove('is-hidden');
  const uidChanged = renderAdminCrmDetail._lastUid !== uid;
  renderAdminCrmDetail._lastUid = uid;
  // Fade only when switching members — avoids periodic flicker on snapshot refresh.
  if(uidChanged || opts.animate){
    body?.classList.remove('is-fading');
    void body?.offsetWidth;
    body?.classList.add('is-fading');
  }

  const view = adminLicenseView(user);
  const canonicalUid = view.uid || adminUserUid(user);
  const lic = view.license;
  // CRM detail is read-only for licenses — no create/migrate/heal on open.
  const kind = view.kind || adminLicenseKind(lic);
  const orders = adminOrdersForUid(canonicalUid);
  const tickets = adminTicketsForUid(canonicalUid);
  const avatar=$('adminCrmAvatar');
  if(avatar){
    if(user.photoURL){ avatar.src=user.photoURL; avatar.classList.remove('is-fallback'); }
    else { avatar.removeAttribute('src'); avatar.classList.add('is-fallback'); avatar.alt=(user.displayName||'?').slice(0,1); }
  }
  $('adminCrmName') && ($('adminCrmName').textContent = user.displayName || 'Google User');
  $('adminCrmRoleBadge') && ($('adminCrmRoleBadge').innerHTML = adminRoleBadgeHtml(user.role));
  $('adminCrmHeaderLicense') && ($('adminCrmHeaderLicense').innerHTML = adminPlanBadgeFromView(view));
  $('adminCrmEmail') && ($('adminCrmEmail').textContent = user.email || '');
  $('adminCrmUid') && ($('adminCrmUid').innerHTML = adminUidHwidHtml(canonicalUid, adminHwidOf(user, lic)));
  $('adminCrmHeaderMeta') && ($('adminCrmHeaderMeta').innerHTML = `
    <span><em>가입</em> ${esc(fmtListDate(user.createdAt))}</span>
    <span><em>최근 로그인</em> ${esc(fmtRelative(user.lastLogin||user.lastSeenAt))}</span>
    <span><em>국가</em> ${esc(adminAccessCountryLine(user) || '정보 없음')}</span>
    <span>${adminActivityBadgeHtml(user)}</span>`);
  const favBtn=$('adminCrmFavBtn');
  if(favBtn) favBtn.textContent = adminCrmFavorites.has(canonicalUid) ? '★' : '☆';
  $('adminLicenseUid') && ($('adminLicenseUid').value = canonicalUid);
  if($('adminUserRole')) $('adminUserRole').value = normalizeRole(user.role);
  if($('adminLicensePlan')){
    const sel=$('adminLicensePlan');
    const emptyOpt=[...sel.options].find(o=>o.value==='');
    if(view.state==='ok' && lic){
      if(emptyOpt) emptyOpt.remove();
      const plan=view.plan || normalizePlan(lic);
      if([...sel.options].some(o=>o.value===plan)) sel.value=plan;
      else sel.value='trial';
    } else {
      if(!emptyOpt){
        const o=document.createElement('option');
        o.value='';
        o.textContent='— 확인 필요 —';
        sel.insertBefore(o, sel.firstChild);
      }
      sel.value='';
    }
  }
  if($('adminLicenseStartsAt')) $('adminLicenseStartsAt').value = toDateInputValue(lic?.startsAt);
  if($('adminLicenseExpiresAt')) $('adminLicenseExpiresAt').value = toDateInputValue(lic?.expiresAt);
  if($('adminLicenseMemo')) $('adminLicenseMemo').value = lic?.memo || '';
  if($('adminCrmUserMemo') && document.activeElement !== $('adminCrmUserMemo')){
    $('adminCrmUserMemo').value = user.adminMemo || '';
  }
  $('adminCrmLicenseBadge') && ($('adminCrmLicenseBadge').innerHTML = adminPlanBadgeFromView(view));
  const typeLabel = view.state==='loading' ? '확인 중'
    : (view.state==='error' ? '조회 오류'
    : (view.state==='conflict' ? '라이선스 충돌'
    : (view.state==='missing' || !lic ? '라이선스 확인 필요'
    : adminLicenseTypeLabel(view.plan || adminEffectivePlan(lic) || lic?.plan || '-'))));
  $('adminCrmLicenseMeta') && ($('adminCrmLicenseMeta').innerHTML = `
    <span class="crm-chip"><em>유형</em>${esc(typeLabel)}</span>
    <span class="crm-chip"><em>시작</em>${esc(lic?.startsAt ? fmtListDate(lic.startsAt) : '-')}</span>
    <span class="crm-chip"><em>만료</em>${esc(lic?.expiresAt ? fmtListDate(lic.expiresAt) : (view.plan==='lifetime'?'없음':'-'))}</span>
    <span class="crm-chip"><em>변경</em>${esc(fmtListDate(lic?.updatedAt || lic?.createdAt))}</span>
    <span class="crm-chip"><em>발급</em>${esc(adminLicenseMethodLabel(lic?.method))}</span>`);
  if(uidChanged) adminCrmDashUsageCache = { uid:'', text:'', empty:false };
  renderAdminCrmOverview(user, view, lic, orders, tickets, adminBoardPostsForUid(canonicalUid));
  renderAdminCrmHwidBox(user, lic);
  renderAdminCrmAccessBox(user);
  renderAdminCrmOrders(canonicalUid, false);
  renderAdminCrmTickets(canonicalUid);
  renderAdminCrmPosts(canonicalUid);
  renderAdminCrmTimeline(canonicalUid, user, lic);
  renderAdminCrmMemoHistory(user);
  renderAdminCrmRecentFeed();
  // Usage panel: refetch only when member changes (avoids "불러오는 중..." blink).
  if(uidChanged || renderAdminCrmUsage._uid !== canonicalUid){
    renderAdminCrmUsage(canonicalUid);
  }
  if(uidChanged || renderAdminCrmPoints._uid !== canonicalUid){
    renderAdminCrmPoints(canonicalUid);
  }
  captureAdminCrmBaseline();
}
function bindAdminCrmUsageCollapse(){
  const card=$('adminCrmUsageCard');
  const btn=$('adminCrmUsageToggle');
  const body=$('adminCrmUsage');
  if(!card || !btn || !body || btn.dataset.bound) return;
  btn.dataset.bound='1';
  setAdminCrmUsageOpen(false);
  btn.addEventListener('click', ()=>{
    const open = btn.getAttribute('aria-expanded') !== 'true';
    setAdminCrmUsageOpen(open);
  });
}
function renderAdminCrmUsage(uid){
  if(!isAdminUser || !uid || !db || !firestoreApi?.doc) return;
  const box=$('adminCrmUsage'); if(!box) return;
  renderAdminCrmUsage._uid = uid;
  box.innerHTML=`<p class="muted small">불러오는 중...</p>`;
  setAdminCrmDashUsageText('불러오는 중...');
  (async ()=>{
    if(String(selectedAdminUid || '') !== String(uid)) return;
    if(renderAdminCrmUsage._uid !== uid) return;
    try{
      const {doc,getDoc,collection,getDocs,query,orderBy,limit}=firestoreApi;
      const tryIds = [...new Set([
        adminUserDocIdForUid(uid),
        ...adminUidAliases(uid)
      ].filter(Boolean))];
      let paid = {};
      let proofs = [];
      let foundPaid = false;
      let probed = 0;
      let denied = 0;
      let lastUsageErr = null;
      for(const id of tryIds){
        try{
          probed++;
          const paidSnap = await getDoc(doc(db,'users',id,'usage','paid'));
          if(paidSnap.exists()){
            paid = paidSnap.data() || {};
            foundPaid = true;
            try{
              const proofsSnap = await getDocs(query(collection(db,'users',id,'usageProofs'), orderBy('createdAt','desc'), limit(5)));
              proofs = proofsSnap?.docs ? proofsSnap.docs.map(d=>({id:d.id, ...d.data()})) : [];
            }catch(proofErr){
              const meta = adminFsErrorMeta(proofErr);
              console.warn('admin usageProofs probe', id, meta.code, meta.message, proofErr);
              // proofs optional — do not fail whole usage section if paid exists
            }
            break;
          }
        }catch(e){
          const meta = adminFsErrorMeta(e);
          lastUsageErr = meta;
          if(meta.code.includes('permission-denied') || meta.message.includes('insufficient')) denied++;
          console.warn('admin usage probe', id, meta.code, meta.message, e);
        }
      }
      if(String(selectedAdminUid || '') !== String(uid)) return;
      const fmtTs = (v)=> v ? fmtCompactDateTime(v) : '-';
      let html='';
      if(!foundPaid && probed>0 && denied===probed){
        html=`<p class="muted small">조회 오류${lastUsageErr?.code?` (${esc(lastUsageErr.code)})`:''}</p>`;
        setAdminCrmDashUsageText('조회 오류', true);
      } else if(!foundPaid || !paid.paidFeatureUsed){
        html=`<p class="muted small admin-crm-usage-empty">사용 기록 없음</p>`;
        setAdminCrmDashUsageText('사용 기록 없음', true);
      } else {
        const recent = paid.lastPaidFeatureUsedAt ? fmtCompactDateTime(paid.lastPaidFeatureUsedAt) : '-';
        const count = paid.paidFeatureUseCount ?? 0;
        setAdminCrmDashUsageText(`${count}회 · 최근 ${recent}`);
        html=`<div class="admin-crm-usage-grid">
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">사용 여부</span><span class="admin-crm-usage-value">이용함</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">최초 이용</span><span class="admin-crm-usage-value">${esc(fmtTs(paid.firstPaidFeatureUsedAt))}</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">최근 이용</span><span class="admin-crm-usage-value">${esc(fmtTs(paid.lastPaidFeatureUsedAt))}</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">총 이용</span><span class="admin-crm-usage-value">${esc(paid.paidFeatureUseCount ?? 0)}회</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">Piano 전체 변환</span><span class="admin-crm-usage-value">${esc(paid.pianoFullConvertCount ?? 0)}회</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">Orchestra 전체 변환</span><span class="admin-crm-usage-value">${esc(paid.orchestraFullConvertCount ?? 0)}회</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">MIDI 편집 전체 내보내기</span><span class="admin-crm-usage-value">${esc(paid.midiEditorFullExportCount ?? 0)}회</span></div>
          <div class="admin-crm-usage-row"><span class="admin-crm-usage-label">악보 편집 전체 내보내기</span><span class="admin-crm-usage-value">${esc(paid.scoreEditorFullExportCount ?? 0)}회</span></div>
        </div>`;
      }
      if(proofs.length){
        html+=`<div class="admin-crm-usage-proofs">
          <h4 class="admin-crm-usage-proofs-title">최근 증빙</h4>
          <div class="admin-crm-proof-list">
          ${proofs.map(p=>`<div class="admin-crm-proof-item">
            <span class="admin-crm-proof-label">기능</span><span class="admin-crm-proof-value">${esc(formatAdminLogLabel(p.feature) || p.feature || '-')}</span>
            <span class="admin-crm-proof-label">서버 기록 시각</span><span class="admin-crm-proof-value">${esc(fmtTs(p.createdAt))}</span>
            <span class="admin-crm-proof-label">60초 초과 여부</span><span class="admin-crm-proof-value">${p.durationCategory==='over_60s' ? '60초 초과' : '아니오'}</span>
            <span class="admin-crm-proof-label">앱 버전</span><span class="admin-crm-proof-value">${esc(p.appVersion || '-')}</span>
            <span class="admin-crm-proof-label">Event ID</span><span class="admin-crm-proof-value mono">${esc(p.eventId || '-')}</span>
          </div>`).join('')}
          </div>
        </div>`;
      }
      box.innerHTML=html;
    }catch(e){
      console.error('admin usage load error', e);
      if(String(selectedAdminUid || '') === String(uid)) box.innerHTML=`<p class="muted small">사용 기록을 불러오지 못했습니다.</p>`;
      setAdminCrmDashUsageText('조회 실패', true);
    }
  })();
}
function renderAdminCrmPoints(uid, opts){
  const box=$('adminCrmPoints');
  if(!box) return;
  renderAdminCrmPoints._uid = uid || '';
  if(!uid){
    box.innerHTML='<p class="muted small">회원을 선택하세요.</p>';
    return;
  }
  const silent = !!(opts && opts.silent);
  const hinted = Number(opts && opts.balance);
  if(!silent){
    box.innerHTML='<p class="muted small">불러오는 중...</p>';
  } else if(Number.isFinite(hinted)){
    const el = box.querySelector('[data-crm-credit-balance]');
    if(el) el.textContent = String(hinted);
  }
  (async ()=>{
    try{
      const data = await callFunctionJsonFallback(['adminCreditOverview', 'adminPointOverview'], { targetUid: uid });
      if(String(selectedAdminUid || '') !== String(uid)) return;
      const purchases = Array.isArray(data.purchases) ? data.purchases.slice(0, 8) : [];
      const jobs = Array.isArray(data.jobs) ? data.jobs.slice(0, 8) : [];
      const ledger = Array.isArray(data.ledger) ? data.ledger.slice(0, 12) : [];
      const shownBalance = Number.isFinite(hinted) ? hinted : (data.balance ?? 0);
      box.innerHTML = `
        <div class="admin-crm-points-meta">
          <span class="crm-chip"><em>잔액</em><span data-crm-credit-balance>${esc(String(shownBalance))}</span> Credits</span>
          <span class="crm-chip"><em>구매</em>${esc(String(data.purchasedTotal ?? 0))}</span>
          <span class="crm-chip"><em>사용</em>${esc(String(data.consumedTotal ?? 0))}</span>
          <span class="crm-chip"><em>지급</em>${esc(String(data.grantedTotal ?? 0))}</span>
          <span class="crm-chip"><em>회수</em>${esc(String(data.deductedTotal ?? 0))}</span>
        </div>
        <div class="admin-crm-points-quick" role="group" aria-label="빠른 지급">
          <button type="button" class="secondary mini-btn" data-crm-action="grant-points" data-amount="1">+1</button>
          <button type="button" class="secondary mini-btn" data-crm-action="grant-points" data-amount="3">+3</button>
          <button type="button" class="secondary mini-btn" data-crm-action="grant-points" data-amount="5">+5</button>
          <button type="button" class="secondary mini-btn" data-crm-action="grant-points" data-amount="10">+10</button>
        </div>
        <form class="admin-crm-points-form" id="adminCrmPointsForm">
          <input type="number" id="adminPointAmount" min="1" step="1" value="5" aria-label="크레딧 수량">
          <input type="text" id="adminPointReason" placeholder="사유 (선택)" aria-label="사유">
          <button type="button" class="secondary mini-btn" data-crm-action="grant-points">지급</button>
          <button type="button" class="secondary mini-btn danger-btn" data-crm-action="deduct-points">회수</button>
        </form>
        <p class="muted small">최근 구매 ${esc(String(purchases.length))} · 최근 작업 ${esc(String(jobs.length))}${ledger.length ? ` · 원장 ${ledger.length}` : ''}</p>
        <ul class="admin-crm-ledger">
          ${ledger.length ? ledger.map((row)=>{
            const amt = Number(row.amount || 0);
            const sign = amt > 0 ? '+' : '';
            return `<li><span>${esc(row.displayTitle || row.type || row.id || 'ledger')}</span><strong>${esc(sign + String(amt))}</strong></li>`;
          }).join('') : ''}
          ${purchases.length ? purchases.map((p)=>`<li><span>${esc(p.productId || p.provider || p.id || 'purchase')}</span><strong>+${esc(String(p.credits ?? p.points ?? 0))}</strong></li>`).join('') : (!ledger.length ? '<li>구매 기록 없음</li>' : '')}
          ${jobs.map((j)=>{
            const cost = Number(j.creditCost ?? j.cost ?? 0);
            const status = String(j.status || '');
            const type = String(j.conversionType || '');
            const labels = {
              orchestra: '오케스트라 변환',
              audio_to_midi: 'Audio → MIDI',
              youtube_to_midi: 'YouTube → MIDI',
              piano: '피아노 변환',
              pdf_to_midi: 'PDF → MIDI'
            };
            const base = String(j.displayTitle || labels[type] || type || j.id || 'job');
            const title = status === 'refunded'
              ? (type === 'orchestra' ? '오케스트라 실패 반환' : '변환 실패 반환')
              : base;
            const delta = !Number.isFinite(cost) ? '-' : (status === 'refunded' ? `+${cost}` : `-${cost}`);
            return `<li><span>${esc(title)}</span><strong>${esc(delta)}</strong></li>`;
          }).join('')}
        </ul>`;
    }catch(err){
      if(String(selectedAdminUid || '') !== String(uid)) return;
      box.innerHTML = `<p class="muted small">크레딧 조회 실패: ${esc(err?.message || err)}</p>`;
    }
  })();
}
function applyAdminCreditBalanceLocal(uid, balance){
  const n = Number(balance);
  if(!uid || !Number.isFinite(n)) return;
  const prev = adminCreditWalletByUid[uid] || {};
  adminCreditWalletByUid[uid] = { ...prev, uid, balance: n, creditBalance: n };
  const cell = document.querySelector(`[data-license-row="${CSS.escape(String(uid))}"] .admin-license-credit`);
  if(cell) cell.textContent = String(n);
  const wrap = document.querySelector(`.admin-license-expand-inner[data-license-uid="${CSS.escape(String(uid))}"]`);
  const bal = wrap?.querySelector('[data-lic-credit-balance]');
  if(bal){
    delete bal.dataset.prevBalance;
    bal.textContent = `잔액 ${n} Credits`;
  }
  if(String(selectedAdminUid || '') === String(uid)){
    const chip = document.querySelector('#adminCrmPoints [data-crm-credit-balance]');
    if(chip) chip.textContent = String(n);
  }
}
function setAdminLicenseCreditBusy(uid, busy){
  const wrap = document.querySelector(`.admin-license-expand-inner[data-license-uid="${CSS.escape(String(uid||''))}"]`);
  if(!wrap) return;
  wrap.classList.toggle('is-credit-busy', !!busy);
  wrap.querySelectorAll('[data-license-credit-grant],[data-license-credit-deduct]').forEach(btn=>{
    btn.disabled = !!busy;
  });
  const bal = wrap.querySelector('[data-lic-credit-balance]');
  if(!bal) return;
  if(busy){
    if(bal.dataset.prevBalance == null) bal.dataset.prevBalance = bal.textContent || '';
    bal.textContent = '처리 중...';
    return;
  }
  if(bal.dataset.prevBalance != null){
    bal.textContent = bal.dataset.prevBalance;
    delete bal.dataset.prevBalance;
  }
}
async function adminAdjustPointsForUid(uid, sign, { amount, reason, skipConfirm }={}){
  const target = String(uid || '').trim();
  const qty = Number(amount || 0);
  if(!target) return;
  if(!Number.isInteger(qty) || qty <= 0){
    adminFlash('지급/회수 수량을 입력하세요');
    return;
  }
  const fnNames = sign > 0 ? ['adminGrantCredits', 'adminGrantPoints'] : ['adminDeductCredits', 'adminDeductPoints'];
  const label = sign > 0 ? '지급' : '회수';
  if(!skipConfirm && !confirm(`${label} ${qty} 크레딧 할까요?`)) return;
  try{
    setAdminLicenseCreditBusy(target, true);
    const result = await callFunctionJsonFallback(fnNames, { targetUid: target, amount: qty, reason: String(reason || '').trim() });
    applyAdminCreditBalanceLocal(target, result.balance);
    adminFlash(`${label} 완료 · 잔액 ${result.balance ?? '-'}`);
    if(selectedAdminUid === target) renderAdminCrmPoints(target, { silent: true, balance: result.balance });
    return result;
  }catch(err){
    alert(`${label} 실패: ${err?.message || err}`);
  }finally{
    setAdminLicenseCreditBusy(target, false);
  }
}
async function fillAdminLicenseExpandCredits(uid){
  const wrap=document.querySelector(`.admin-license-expand-inner[data-license-uid="${CSS.escape(String(uid||''))}"]`);
  const bal=wrap?.querySelector('[data-lic-credit-balance]');
  if(!wrap || !bal) return;
  if(adminCreditWalletByUid[uid]){
    bal.textContent = `잔액 ${adminCrmCreditBalance({ uid })} Credits`;
    return;
  }
  try{
    const data = await callFunctionJsonFallback(['adminCreditOverview', 'adminPointOverview'], { targetUid: uid });
    if(adminCrmLicenseOpen !== uid) return;
    applyAdminCreditBalanceLocal(uid, data.balance);
  }catch(err){
    if(adminCrmLicenseOpen !== uid) return;
    bal.textContent = '잔액 조회 실패';
  }
}
async function adminAdjustLicenseExpandCredits(btn, sign){
  const wrap=btn.closest('.admin-license-expand-inner');
  const uid=btn.getAttribute(sign>0?'data-license-credit-grant':'data-license-credit-deduct') || wrap?.getAttribute('data-license-uid');
  if(wrap?.classList.contains('is-credit-busy')) return;
  const amountEl=wrap?.querySelector('[data-lic-credit-amount]');
  const quick=Number(btn.getAttribute('data-amount') || 0);
  if(Number.isInteger(quick) && quick > 0 && amountEl) amountEl.value = String(quick);
  const amount=Number(amountEl?.value || 0);
  const reason=String(wrap?.querySelector('[data-lic-credit-reason]')?.value || '').trim();
  await adminAdjustPointsForUid(uid, sign, {
    amount,
    reason,
    skipConfirm: Number.isInteger(quick) && quick > 0
  });
}
async function adminAdjustSelectedPoints(sign){
  const uid = selectedAdminUid;
  if(!uid) return;
  await adminAdjustPointsForUid(uid, sign, {
    amount: Number($('adminPointAmount')?.value || 0),
    reason: String($('adminPointReason')?.value || '').trim()
  });
}
function crmSlideHtml(text){
  return `<span class="crm-slide"><span class="crm-slide-text">${esc(text)}</span></span>`;
}
function adminOrderDisplayId(o){
  const candidates=[o?.paymentId, o?.paypalOrderId, o?.portonePaymentId, o?.id];
  for(const c of candidates){
    const s=String(c??'').trim();
    if(s) return s;
  }
  return '-';
}
function bindCrmTextSlides(root){
  if(!root) return;
  const measure=()=>{
    root.querySelectorAll('.crm-slide').forEach(el=>{
      const text=el.querySelector('.crm-slide-text');
      if(!text) return;
      text.style.removeProperty('--crm-slide');
      text.style.removeProperty('--crm-slide-dur');
      el.classList.remove('is-overflow');
      // Reset transform so scrollWidth is accurate after prior animation frames.
      text.style.transform='';
      const cw=el.clientWidth;
      if(cw<=0) return;
      const sw=text.scrollWidth;
      const overflow=sw - cw;
      if(overflow<=2) return;
      // Extra gap so the tail isn't clipped at the end of the scroll.
      const travel=overflow + 16;
      el.classList.add('is-overflow');
      text.style.setProperty('--crm-slide', `${travel}px`);
      text.style.setProperty('--crm-slide-dur', `${Math.max(5, Math.min(16, travel/22))}s`);
    });
  };
  const runWithRetry=()=>{
    measure();
    const pending=[...root.querySelectorAll('.crm-slide')].some(el=>el.clientWidth<=0);
    if(pending) setTimeout(measure, 80);
  };
  requestAnimationFrame(()=>requestAnimationFrame(runWithRetry));
  if(typeof ResizeObserver!=='undefined'){
    if(root._crmSlideRo){
      try{ root._crmSlideRo.disconnect(); }catch{}
    }
    root._crmSlideRo=new ResizeObserver(()=>{ measure(); });
    root._crmSlideRo.observe(root);
  }
}
function renderAdminCrmOrders(uid, showAll){
  const box=$('adminCrmOrders'); if(!box) return;
  if(adminOrdersListenError){
    const code = adminOrdersListenError.code || 'unknown';
    box.innerHTML=`<p class="muted small">주문 조회 오류 (${esc(code)})</p>`;
    return;
  }
  const all = adminOrdersForUid(uid);
  const rows = showAll ? all : all.slice(0, 5);
  if(!rows.length){ box.innerHTML=`<p class="muted small">주문 기록이 없습니다.</p>`; return; }
  box.innerHTML = `<table class="admin-table crm-mini-table"><colgroup><col class="crm-col-id"><col class="crm-col-method"><col class="crm-col-amount"><col class="crm-col-date"><col class="crm-col-status"></colgroup><thead><tr><th>주문번호</th><th>수단</th><th>금액</th><th>결제일</th><th>상태</th></tr></thead><tbody>${rows.map(o=>{
    const id=adminOrderDisplayId(o);
    const method=o.paymentMethod||o.provider||o.method||'-';
    const amount=o.amount!=null ? `${Number(o.amount).toLocaleString('ko-KR')} ${o.currency||'KRW'}` : '-';
    const when=fmtCompactDateTime(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt);
    const key=o.id || o.paymentId || o.paypalOrderId || '';
    return `<tr class="admin-crm-order-row" data-order-id="${esc(key)}" tabindex="0" title="${esc(id)}"><td class="crm-td-id">${crmSlideHtml(id)}</td><td class="crm-td-method">${crmSlideHtml(adminPaymentMethodLabel(method))}</td><td class="crm-td-amount">${crmSlideHtml(amount)}</td><td class="crm-td-date">${crmSlideHtml(when)}</td><td class="crm-td-status">${adminPaymentStatusBadgeHtml(o.status||'-')}</td></tr>`;
  }).join('')}</tbody></table>${(!showAll && all.length>5) ? `<p class="muted small">외 ${all.length-5}건 · 더보기로 전체 표시</p>` : ''}`;
  bindCrmTextSlides(box);
  box.querySelectorAll('[data-order-id]').forEach(row=>{
    if(row.dataset.bound) return;
    row.dataset.bound='1';
    row.addEventListener('click',()=>openAdminPaymentDetail(uid, row.getAttribute('data-order-id')));
    row.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openAdminPaymentDetail(uid, row.getAttribute('data-order-id')); }});
  });
}
function isAdminPortOneOrder(o){
  const provider=String(o?.provider||o?.pg||'').toLowerCase();
  const method=String(o?.paymentMethod||o?.method||'').toLowerCase();
  if(o?.paypalOrderId || o?.paypalCaptureId) return false;
  return provider==='portone' || method.includes('kakao') || method.includes('inicis') || !!o?.paymentId;
}
function adminOrderMoneyText(amount, currency){
  if(amount==null || amount==='') return '-';
  const n=Number(amount);
  if(!Number.isFinite(n)) return String(amount);
  return `${n.toLocaleString('ko-KR')} ${currency||'KRW'}`;
}
function isAdminCrmOrderDrawerOpen(uid, orderKey){
  return !!(adminCrmOrderDrawerOpen
    && adminCrmOrderDrawerOpen.uid === String(uid || '')
    && adminCrmOrderDrawerOpen.key === String(orderKey || ''));
}
function paintAdminCrmOrderDrawer(uid, orderKey, overlay){
  const drawer=$('adminCrmOrderDrawer');
  const body=$('adminCrmOrderDrawerBody');
  if(!drawer||!body) return;
  if(!isAdminCrmOrderDrawerOpen(uid, orderKey)) return;
  const found = adminOrdersForUid(uid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey)
    || (adminOrderRows||[]).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
  if(!found){ body.innerHTML=`<p class="muted">주문을 찾을 수 없습니다.</p>`; drawer.hidden=false; return; }
  const o = Object.assign({}, found, overlay||{});
  const user = findAdminUserRow(uid);
  const licIssued = o.licenseIssued===true || o.status==='completed' || o.status==='paid' || !!o.issuedAt;
  const receipt = o.receiptUrl || o.receipt || o.invoiceUrl || '';
  const currency = o.currency || 'KRW';
  const paidShow = o.paidAmount!=null ? o.paidAmount : o.amount;
  const refundShow = o.refundedAmount!=null ? o.refundedAmount : o.cancelledAmount;
  const refundWhen = o.refundedAt || o.cancelledAt || o.refundAt;
  const portone = isAdminPortOneOrder(o);
  const paymentId = o.paymentId || o.id || orderKey;
  const statusGroup = adminOrderStatusGroup(o.status);
  const rawStatus = String(o.status || '').toLowerCase();
  const providerSt = String(o.providerStatus || o.rawStatus || '').toUpperCase().replace(/^PAYMENT_STATUS_/, '');
  const providerAlreadyCancelled =
    providerSt === 'CANCELLED' || providerSt === 'CANCELED'
    || (Number(o.cancelledAmount || o.refundedAmount || 0) > 0 && Number(o.paidAmount ?? -1) === 0);
  const isPartial = rawStatus === 'partially_refunded';
  const isReview = rawStatus === 'refund_review_required';
  // 전액환불·부분환불·검토 필요면 전액 취소 버튼 숨김. PAID(결제완료)만 노출.
  const canCancel = portone
    && (statusGroup==='paid' || statusGroup==='pending')
    && !providerAlreadyCancelled
    && !isPartial
    && !isReview;
  const alreadyRefund = statusGroup==='refund' && !isPartial && !isReview;
  const needsSync = portone && providerAlreadyCancelled && statusGroup==='paid';
  const productLabel = adminOrderProductName(o);
  const licenseLabel = (()=>{
    const pid=String(o.productId||'').toUpperCase();
    if(pid==='PASS_7D') return '7일';
    if(pid==='PASS_30D') return '30일';
    if(pid==='PASS_90D') return '90일';
    if(pid==='LIFETIME' || String(o.plan||'')==='lifetime') return 'Lifetime';
    if(o.durationDays) return `${o.durationDays}일`;
    return o.plan || '-';
  })();
  const entitlementLabel =
    o.licenseRevoked===true || o.entitlementStatus==='revoked'
      ? '회수됨'
      : (o.licenseRefundReview || o.status==='refund_review_required'
        ? '환불 검토 필요'
        : (licIssued ? '활성' : '-'));
  body.innerHTML = `
    <dl class="admin-crm-order-dl">
      <div><dt>상품</dt><dd>${esc(productLabel)}</dd></div>
      <div><dt>사용자</dt><dd>${esc(user?.email || user?.displayName || uid || '-')}</dd></div>
      <div><dt>UID / HWID</dt><dd>${adminUidHwidHtml(uid, adminHwidOf(user, user?.license))}</dd></div>
      <div><dt>결제금액</dt><dd>${esc(adminOrderMoneyText(o.amount, currency))}</dd></div>
      <div><dt>결제수단</dt><dd>${esc(adminPaymentMethodLabel(o.paymentMethod||o.method||'-'))}</dd></div>
      <div><dt>결제상태</dt><dd>${adminPaymentStatusBadgeHtml(o.status||'-')}</dd></div>
      <div><dt>PortOne 상태</dt><dd>${esc(o.providerStatus||o.rawStatus||'-')}</dd></div>
      <div><dt>실결제</dt><dd>${esc(adminOrderMoneyText(paidShow, currency))}</dd></div>
      <div><dt>환불금액</dt><dd>${esc(adminOrderMoneyText(refundShow, currency))}</dd></div>
      <div><dt>결제일</dt><dd>${esc(fmtDate(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt))}</dd></div>
      <div><dt>환불일</dt><dd>${esc(refundWhen?fmtDate(refundWhen):'-')}</dd></div>
      <div><dt>지급 라이선스</dt><dd>${esc(licenseLabel)}</dd></div>
      <div><dt>라이선스 상태</dt><dd>${esc(entitlementLabel)}${o.licenseRevokeReason?` · ${esc(o.licenseRevokeReason)}`:''}</dd></div>
      <div><dt>주문번호</dt><dd class="mono">${esc(o.paymentId||o.paypalOrderId||o.id||'-')}</dd></div>
      <div><dt>마지막 동기화</dt><dd>${esc(o.lastSyncedAt?fmtDate(o.lastSyncedAt):'-')}</dd></div>
      ${o.creditsReclaimStatus?`<div><dt>크레딧 회수</dt><dd>${esc(o.creditsReclaimStatus==='reclaim'?'회수됨':o.creditsReclaimStatus==='review'?'검토 필요':String(o.creditsReclaimStatus))}</dd></div>`:''}
      <div><dt>관리 메모</dt><dd>${esc(o.memo||o.adminMemo||o.refundReason||'-')}</dd></div>
      <div><dt>영수증</dt><dd>${receipt?`<a href="${esc(receipt)}" target="_blank" rel="noopener">영수증 열기</a>`:'없음'}</dd></div>
    </dl>
    ${portone?`<div class="admin-crm-order-sync">
      <div class="admin-crm-order-actions">
        <button type="button" class="secondary mini-btn" data-portone-sync="${esc(paymentId)}">PortOne 상태 동기화</button>
        ${canCancel?`<button type="button" class="secondary mini-btn danger-btn" data-portone-cancel="${esc(paymentId)}">결제 취소</button>`:''}
      </div>
      ${needsSync?`<p class="admin-portone-sync-hint">PortOne은 이미 CANCELLED입니다. 취소 API를 다시 보내지 말고 <b>상태 동기화</b>로 내부 주문·라이선스를 맞추세요.</p>`:''}
      ${alreadyRefund && !canCancel && !needsSync?`<p class="muted small">이미 전액 취소/환불 상태입니다. 동기화로 PortOne·라이선스를 맞출 수 있습니다.</p>`:''}
      ${isPartial?`<p class="muted small">부분환불 상태입니다. 이 메뉴에서 임의 전액취소는 제공하지 않습니다.</p>`:''}
      ${isReview?`<p class="muted small">환불 검토가 필요합니다. 전액취소 버튼은 숨겨져 있습니다.</p>`:''}
      <p class="muted small">[결제 취소]는 PortOne 전액 환불 + 권한 회수입니다. 목록의 [삭제](내부 기록 삭제)와 다릅니다.</p>
    </div>`:''}`;
  const syncBtn=body.querySelector('[data-portone-sync]');
  if(syncBtn){
    syncBtn.addEventListener('click',()=>syncAdminPortOneOrder(uid, orderKey, syncBtn));
  }
  const cancelBtn=body.querySelector('[data-portone-cancel]');
  if(cancelBtn){
    cancelBtn.addEventListener('click',()=>openAdminPortOneCancelModal(uid, orderKey));
  }
  drawer.hidden=false;
}
async function applyAdminPortOneOrderOverlay(uid, orderKey, result){
  const o = adminOrdersForUid(uid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
  const overlay = {
    status: result.status,
    providerStatus: result.providerStatus,
    paidAmount: result.paidAmount,
    refundedAmount: result.refundedAmount,
    cancelledAmount: result.cancelledAmount,
    refundedAt: result.cancelledAt,
    lastSyncedAt: new Date().toISOString(),
    creditsReclaimStatus: result.entitlement && result.entitlement.kind==='credit' ? result.entitlement.action : undefined,
    creditsReclaimReason: result.entitlement && result.entitlement.kind==='credit' ? result.entitlement.reason : undefined,
    licenseRevoked: result.licenseRevoked === true || (result.entitlement && result.entitlement.kind==='license'
      && ['revoke_pass','revoke_lifetime','revoke_grant_only'].includes(result.entitlement.action)),
    licenseRefundReview: result.entitlement && result.entitlement.kind==='license' && result.entitlement.action==='review',
    licenseRevokeReason: result.entitlement && result.entitlement.kind==='license' ? result.entitlement.reason : undefined,
    licenseRevokeAction: result.entitlement && result.entitlement.licenseAction,
    entitlementStatus: result.entitlement && result.entitlement.kind==='license'
      ? (result.entitlement.action==='review' ? 'refund_review_required'
        : (result.entitlement.action==='none' ? (o?.entitlementStatus || 'revoked') : 'revoked'))
      : undefined,
    licenseRecomputeStatus: result.licenseRecomputeStatus || (result.entitlement && result.entitlement.licenseAction) || undefined
  };
  if(o) Object.assign(o, overlay);
  // Also patch canonical row in adminOrderRows if different reference
  const key = o?.id || o?.paymentId || orderKey;
  (adminOrderRows||[]).forEach(row=>{
    if((row.id||row.paymentId||row.paypalOrderId)===key) Object.assign(row, overlay);
  });

  // Optimistic trial patch when server converted period → trial (before getDoc returns).
  const licAct = result.entitlement && result.entitlement.licenseAction;
  if(licAct === 'converted_to_trial'){
    patchAdminLicenseCache(uid, {
      plan: 'trial',
      status: 'active',
      licensed: true,
      passProductId: null,
      startsAt: null,
      expiresAt: null,
      revokedAt: adminLicenseCacheNow(),
      method: 'portone_refund',
      updatedAt: adminLicenseCacheNow()
    });
  }

  paintAdminCrmOrderDrawer(uid, orderKey, overlay);
  if(adminCrmMode()==='orders'){
    renderAdminOrderWorkStats();
    renderAdminWorkStatusTabs('orders');
    try{ paintAdminCrmPagedList(); }catch(_){ try{ renderAdminUserTable({ keepOrder: true }); }catch(__){ /* ignore */ } }
    // List re-render must not drop the open payment detail drawer.
    paintAdminCrmOrderDrawer(uid, orderKey, overlay);
  }
  renderAdminPaymentsTable();

  // Always re-fetch licenses/{uid} after PortOne sync — order UI can update while CRM badge stays stale.
  const touchedLicense = !!(overlay.licenseRevoked || licAct || result.entitlement?.kind==='license'
    || result.status==='refunded' || result.status==='cancelled');
  if(touchedLicense && uid){
    try{
      await refreshAdminLicenseFromServer(uid);
    }catch(err){
      console.warn('refreshAdminLicenseFromServer', err);
    }
    refreshAdminLicenseViews(uid);
  }
  return overlay;
}
function closeAdminPortOneCancelModal(){
  document.getElementById('adminPortOneCancelBackdrop')?.remove();
}
function openAdminPortOneCancelModal(uid, orderKey){
  const o = adminOrdersForUid(uid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
  if(!o) return;
  const user = findAdminUserRow(uid);
  const paymentId = o.paymentId || o.id || orderKey;
  const amount = Number(o.amount);
  const amountLabel = Number.isFinite(amount)
    ? `${amount.toLocaleString('ko-KR')}원`
    : adminOrderMoneyText(o.amount, o.currency||'KRW');
  const productLabel = adminOrderProductName(o);
  closeAdminPortOneCancelModal();
  const backdrop=document.createElement('div');
  backdrop.id='adminPortOneCancelBackdrop';
  backdrop.className='edit-modal-backdrop';
  backdrop.innerHTML=`<div class="edit-modal admin-portone-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="adminPortOneCancelTitle">
    <div class="edit-modal-head">
      <h3 id="adminPortOneCancelTitle">결제를 취소하시겠습니까?</h3>
      <button type="button" class="edit-modal-x" data-cancel-close aria-label="close">×</button>
    </div>
    <div class="edit-modal-body">
      <dl class="admin-crm-order-dl admin-portone-cancel-summary">
        <div><dt>상품</dt><dd>${esc(productLabel)}</dd></div>
        <div><dt>사용자</dt><dd>${esc(user?.email||uid||'-')}</dd></div>
        <div><dt>결제금액</dt><dd>${esc(adminOrderMoneyText(o.amount, o.currency||'KRW'))}</dd></div>
        <div><dt>결제수단</dt><dd>${esc(adminPaymentMethodLabel(o.paymentMethod||o.method||'-'))}</dd></div>
      </dl>
      <p class="admin-portone-cancel-warn">결제를 취소하면 결제금액이 전액 환불되며, 이 결제로 지급된 라이선스가 회수됩니다.</p>
      <label class="edit-field"><span>취소 사유</span>
        <input type="text" id="adminPortOneCancelReason" value="고객 요청" maxlength="200" autocomplete="off">
      </label>
    </div>
    <div class="edit-modal-actions">
      <button type="button" class="ghost" data-cancel-close>닫기</button>
      <button type="button" class="primary danger-btn" data-cancel-confirm>${esc(amountLabel)} 전액 취소</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close=()=>closeAdminPortOneCancelModal();
  backdrop.querySelectorAll('[data-cancel-close]').forEach(btn=>btn.addEventListener('click', close));
  backdrop.addEventListener('click', e=>{ if(e.target===backdrop) close(); });
  const confirmBtn=backdrop.querySelector('[data-cancel-confirm]');
  confirmBtn?.addEventListener('click', ()=>{
    const reason = ($('adminPortOneCancelReason')?.value || '고객 요청').trim() || '고객 요청';
    runAdminPortOneCancel(uid, orderKey, paymentId, reason, confirmBtn).catch(err=>{
      alert(err?.message || '결제 취소에 실패했습니다.');
    });
  });
}
async function runAdminPortOneCancel(uid, orderKey, paymentId, reason, btn){
  if(runAdminPortOneCancel._busy) return;
  runAdminPortOneCancel._busy = paymentId;
  if(btn){ btn.disabled=true; btn.textContent='취소 처리 중...'; }
  try{
    const result = await callFunctionJson('adminCancelPortOnePayment', { paymentId, reason });
    closeAdminPortOneCancelModal();
    await applyAdminPortOneOrderOverlay(uid, orderKey, result);
    adminFlash(result.message || '결제가 전액 취소되었습니다.');
    // Refresh license view for this user if CRM open
    if(selectedAdminUid===uid){
      try{ renderAdminCrmDetail(uid); }catch(_){ /* ignore */ }
    }
  }catch(err){
    const code = err?.code || err?.data?.code;
    if(code==='PROVIDER_CANCELLED_VERIFY_FAILED' || code==='INTERNAL_SYNC_FAILED'){
      alert(err.message || 'PortOne 결제는 취소되었으나 내부 상태 동기화가 필요합니다.');
      try{ await syncAdminPortOneOrder(uid, orderKey); }catch(_){ /* ignore */ }
    } else {
      throw err;
    }
  }finally{
    runAdminPortOneCancel._busy = '';
    if(btn){ btn.disabled=false; btn.textContent='전액 취소'; }
  }
}
async function syncAdminPortOneOrder(uid, orderKey, btn){
  const o = adminOrdersForUid(uid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
  const paymentId = o?.paymentId || o?.id || orderKey;
  if(btn){ btn.disabled=true; btn.textContent='동기화 중...'; }
  try{
    const result = await callFunctionJson('syncPortOnePaymentStatus', { paymentId });
    await applyAdminPortOneOrderOverlay(uid, orderKey, result);
    adminFlash(result.status==='refund_review_required' ? 'PortOne 동기화 완료 · 환불 검토가 필요합니다.' : 'PortOne 상태를 동기화했습니다.');
  }catch(err){
    alert(err?.message || 'PortOne 동기화에 실패했습니다.');
    if(btn){ btn.disabled=false; btn.textContent='PortOne 상태 동기화'; }
  }
}
function openAdminCrmOrderDrawer(uid, orderKey){
  const key = String(orderKey || '').trim();
  let resolvedUid = String(uid || '').trim();
  if(!resolvedUid && key){
    const row = (adminOrderRows||[]).find(o=>(o.id||o.paymentId||o.paypalOrderId)===key);
    resolvedUid = String(row?.uid||row?.userId||row?.customerUid||'');
  }
  if(!key) return;
  if(!resolvedUid){
    alert('이 주문에 연결된 회원 UID를 찾을 수 없습니다.');
    return;
  }
  adminCrmOrderDrawerOpen = { uid: resolvedUid, key };
  paintAdminCrmOrderDrawer(resolvedUid, key);
  const o = adminOrdersForUid(resolvedUid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===key)
    || (adminOrderRows||[]).find(x=>(x.id||x.paymentId||x.paypalOrderId)===key);
  if(o && isAdminPortOneOrder(o) && !openAdminCrmOrderDrawer._syncing){
    openAdminCrmOrderDrawer._syncing=true;
    syncAdminPortOneOrder(resolvedUid, key).finally(()=>{ openAdminCrmOrderDrawer._syncing=false; });
  }
}
function closeAdminCrmOrderDrawer(){
  adminCrmOrderDrawerOpen = null;
  const drawer=$('adminCrmOrderDrawer');
  if(drawer) drawer.hidden=true;
}
if(typeof window!=='undefined') window.__midiaiCloseAdminCrmOrderDrawer = closeAdminCrmOrderDrawer;
if(typeof window!=='undefined' && !window.__adminCrmEscBound){
  window.__adminCrmEscBound=true;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeAdminCrmOrderDrawer();
  });
}
function renderAdminCrmTickets(uid){
  const box=$('adminCrmTickets'); if(!box) return;
  if(adminTicketsListenError){
    const code = adminTicketsListenError.code || 'unknown';
    box.innerHTML=`<p class="muted small">문의 조회 오류 (${esc(code)})</p>`;
    return;
  }
  const rows = adminTicketsForUid(uid).slice(0, 5);
  if(!rows.length){ box.innerHTML=`<p class="muted small">문의 기록이 없습니다.</p>`; return; }
  box.innerHTML = rows.map(t=>`<a class="admin-crm-ticket-row" href="./ticket.html?id=${encodeURIComponent(t.id)}"><b class="crm-slide"><span class="crm-slide-text">${esc(t.title||'(제목 없음)')}</span></b><span class="badge ${esc(String(t.status||'open'))}">${esc(adminPaymentStatusLabel(t.status||'open'))}</span><small>${esc(fmtListDate(t.createdAt))}</small></a>`).join('');
  bindCrmTextSlides(box);
}
function renderAdminCrmPosts(uid){
  const box=$('adminCrmPosts'); if(!box) return;
  const rows = adminBoardPostsForUid(uid);
  const countEl=$('adminCrmPostsCount');
  if(countEl) countEl.textContent = rows.length ? `${rows.length}건` : '';
  const delSel=$('adminCrmPostsDeleteSelected');
  const delAll=$('adminCrmPostsDeleteAll');
  const selectAll=$('adminCrmPostsSelectAll');
  if(delAll) delAll.disabled = !rows.length;
  if(!rows.length){
    adminCrmPostSelected.clear();
    if(selectAll){ selectAll.checked=false; selectAll.disabled=true; }
    if(delSel){ delSel.disabled=true; delSel.textContent='선택 삭제'; }
    box.innerHTML=`<p class="muted small">작성한 게시글이 없습니다.</p>`;
    return;
  }
  if(selectAll) selectAll.disabled=false;
  const validIds = new Set(rows.map(r=>r.id));
  [...adminCrmPostSelected].forEach(id=>{ if(!validIds.has(id)) adminCrmPostSelected.delete(id); });
  box.innerHTML = rows.map(p=>{
    const checked = adminCrmPostSelected.has(p.id) ? 'checked' : '';
    const hidden = p.visible===false ? '<span class="badge none">숨김</span>' : '';
    const pinned = p.pinned ? '<span class="crm-post-pin">📌</span>' : '';
    return `<div class="admin-crm-post-row" data-post-id="${esc(p.id)}">
      <label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-post-check="${esc(p.id)}" ${checked}></label>
      <a class="admin-crm-post-main" href="${boardPostUrl(p.id)}" target="_blank" rel="noopener">
        <b class="crm-slide"><span class="crm-slide-text">${pinned}${esc(p.title||'(제목 없음)')}</span></b>
        <span class="admin-crm-post-meta">
          ${hidden}
          <small>조회 ${Number(p.viewCount||0)}</small>
          <small>댓글 ${Number(p.commentCount||0)}</small>
          <small>${esc(fmtListDate(p.createdAt))}</small>
        </span>
      </a>
      <button type="button" class="secondary mini-btn danger-btn" data-crm-action="posts-delete-one" data-post-id="${esc(p.id)}">삭제</button>
    </div>`;
  }).join('');
  bindCrmTextSlides(box);
  updateAdminCrmPostsToolbar();
  if(selectAll && !selectAll.dataset.bound){
    selectAll.dataset.bound='1';
    selectAll.addEventListener('change',()=>{
      const uid=selectedAdminUid; if(!uid) return;
      const list=adminBoardPostsForUid(uid);
      if(selectAll.checked) list.forEach(p=>adminCrmPostSelected.add(p.id));
      else adminCrmPostSelected.clear();
      renderAdminCrmPosts(uid);
    });
  }
  box.querySelectorAll('[data-crm-post-check]').forEach(inp=>{
    inp.addEventListener('change',()=>{
      const id=inp.getAttribute('data-crm-post-check');
      if(inp.checked) adminCrmPostSelected.add(id); else adminCrmPostSelected.delete(id);
      updateAdminCrmPostsToolbar();
    });
  });
}
function updateAdminCrmPostsToolbar(){
  const n=adminCrmPostSelected.size;
  const delSel=$('adminCrmPostsDeleteSelected');
  const selectAll=$('adminCrmPostsSelectAll');
  const uid=selectedAdminUid;
  const total = uid ? adminBoardPostsForUid(uid).length : 0;
  if(delSel){
    delSel.disabled = n===0;
    delSel.textContent = n ? `선택 삭제 (${n})` : '선택 삭제';
  }
  if(selectAll && total){
    selectAll.checked = n>0 && n===total;
    selectAll.indeterminate = n>0 && n<total;
  }
}
function renderAdminCrmTimeline(uid, user, lic){
  const box=$('adminCrmTimeline'); if(!box) return;
  const events = [];
  if(user?.createdAt) events.push({ t: adminTsSec(user.createdAt), label:'가입', detail: user.email||uid });
  if(user?.lastLogin||user?.lastSeenAt) events.push({ t: adminTsSec(user.lastLogin||user.lastSeenAt), label:'로그인', detail: fmtRelative(user.lastLogin||user.lastSeenAt) });
  if(lic?.updatedAt||lic?.createdAt){
    const plan=String(lic.plan||'');
    const label = plan==='lifetime' ? 'Lifetime 지급' : (plan==='trial' ? 'Trial 지급' : `라이선스 ${plan}`.trim());
    events.push({ t: adminTsSec(lic.updatedAt||lic.createdAt), label, detail: `${lic.status||''} · ${lic.method||''}` });
  }
  adminOrdersForUid(uid).forEach(o=>{
    const method=o.paymentMethod||o.provider||'결제';
    const label = /kakao/i.test(String(method)) ? 'KakaoPay 결제' : `${method} 결제`;
    events.push({ t: adminTsSec(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt), label, detail: `${o.status||''} · ${o.amount!=null?o.amount:''}` });
  });
  adminTicketsForUid(uid).forEach(t=>{
    events.push({ t: adminTsSec(t.createdAt||t.updatedAt), label:'문의 작성', detail: t.title||t.id });
  });
  events.sort((a,b)=>b.t-a.t);
  if(!events.length){ box.innerHTML=`<p class="muted small">활동 기록이 없습니다.</p>`; return; }
  box.innerHTML = events.slice(0, 30).map(ev=>{
    const d = ev.t ? new Date(ev.t*1000) : null;
    const day = d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '-';
    return `<div class="admin-crm-timeline-item"><span class="admin-crm-timeline-dot" aria-hidden="true"></span><div><b>${esc(ev.label)}</b><time>${esc(day)}</time><span>${esc(ev.detail||'')}</span></div></div>`;
  }).join('');
}
function snapshotAdminCrmFilterState(){
  return {
    license: $('adminUserLicenseStatus')?.value || 'all',
    orders: $('adminCrmFilterOrders')?.value || 'all',
    tickets: $('adminCrmFilterTickets')?.value || 'all',
    activity: $('adminCrmFilterActivity')?.value || 'all',
    quick: adminCrmQuickFilter,
    stat: adminCrmStatKey
  };
}
function restoreAdminCrmFilterState(snap){
  if(!snap) return;
  if($('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = snap.license;
  if($('adminCrmFilterOrders')) $('adminCrmFilterOrders').value = snap.orders;
  if($('adminCrmFilterTickets')) $('adminCrmFilterTickets').value = snap.tickets;
  if($('adminCrmFilterActivity')) $('adminCrmFilterActivity').value = snap.activity;
  adminCrmQuickFilter = snap.quick || '';
  adminCrmStatKey = snap.stat || 'all';
}
function setAdminCrmFilterPopoverOpen(open){
  const pop=$('adminCrmFilterPopover');
  const btn=$('adminCrmFilterBtn');
  if(!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if(open) setAdminCrmFilterPopoverOpen._snap = snapshotAdminCrmFilterState();
}
function closeAdminCrmFilterPopover({restore=false}={}){
  const pop=$('adminCrmFilterPopover');
  if(restore && pop && !pop.hidden) restoreAdminCrmFilterState(setAdminCrmFilterPopoverOpen._snap);
  setAdminCrmFilterPopoverOpen(false);
}
function applyAdminCrmFilterPopover(){
  const st=$('adminUserLicenseStatus')?.value || 'all';
  const act=$('adminCrmFilterActivity')?.value || 'all';
  const ordersF=$('adminCrmFilterOrders')?.value || 'all';
  const ticketsF=$('adminCrmFilterTickets')?.value || 'all';
  if(act==='idle7' || act==='idle30') adminCrmQuickFilter = act;
  else if(adminCrmQuickFilter==='idle7' || adminCrmQuickFilter==='idle30') adminCrmQuickFilter = '';
  if(st==='trial' || st==='lifetime' || st==='period' || st==='favorites') adminCrmStatKey = st;
  else if(act==='idle7' || act==='idle30' || ordersF!=='all' || ticketsF!=='all') adminCrmStatKey = 'filtered';
  else if(adminCrmQuickFilter==='today' || adminCrmQuickFilter==='active') adminCrmStatKey = adminCrmQuickFilter;
  else adminCrmStatKey = 'all';
  setAdminCrmFilterPopoverOpen._snap = snapshotAdminCrmFilterState();
  setAdminCrmFilterPopoverOpen(false);
  adminCrmPage=1;
  renderAdminUserTable({ resort: true });
}
function resetAdminCrmFilterPopover(){
  if($('adminUserLicenseStatus')) $('adminUserLicenseStatus').value='all';
  if($('adminCrmFilterOrders')) $('adminCrmFilterOrders').value='all';
  if($('adminCrmFilterTickets')) $('adminCrmFilterTickets').value='all';
  if($('adminCrmFilterActivity')) $('adminCrmFilterActivity').value='all';
  adminCrmQuickFilter = '';
  adminCrmStatKey = 'all';
  applyAdminCrmFilterPopover();
}
function bindAdminCrmFilterPopover(){
  const btn=$('adminCrmFilterBtn');
  const pop=$('adminCrmFilterPopover');
  if(!btn || !pop || btn.dataset.bound) return;
  btn.dataset.bound='1';
  btn.addEventListener('click', e=>{
    e.stopPropagation();
    if(pop.hidden){
      const act=$('adminCrmFilterActivity');
      if(act) act.value = (adminCrmQuickFilter==='idle7' || adminCrmQuickFilter==='idle30') ? adminCrmQuickFilter : 'all';
      setAdminCrmFilterPopoverOpen(true);
    } else {
      closeAdminCrmFilterPopover({restore:true});
    }
  });
  pop.addEventListener('click', e=>e.stopPropagation());
  $('adminCrmFilterApply')?.addEventListener('click', applyAdminCrmFilterPopover);
  $('adminCrmFilterReset')?.addEventListener('click', resetAdminCrmFilterPopover);
  document.addEventListener('click', ()=>{
    if(pop.hidden) return;
    closeAdminCrmFilterPopover({restore:true});
  });
  document.addEventListener('keydown', e=>{
    if(e.key!=='Escape' || pop.hidden) return;
    closeAdminCrmFilterPopover({restore:true});
  });
}
function bindAdminUserFilters(){
  const search=$('adminUserSearch');
  if(search && !search.dataset.bound){
    search.dataset.bound='1';
    search.addEventListener('input',()=>{
      clearTimeout(adminCrmSearchTimer);
      adminCrmSearchTimer=setTimeout(()=>{
        adminCrmPage=1;
        renderAdminUserTable({ resort: true });
      }, 220);
    });
  }
  ['adminUserSort'].forEach(id=>{
    const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1';
    el.addEventListener('change',()=>{
      adminCrmPage=1;
      renderAdminUserTable({ resort: true });
    });
  });
  bindAdminCrmFilterPopover();
  bindAdminCrmDirtyWatchers();
  const floatSave=$('adminCrmFloatSave');
  if(floatSave && !floatSave.dataset.bound){
    floatSave.dataset.bound='1';
    floatSave.addEventListener('click',()=>saveAdminCrmAllChanges());
  }
  const all=$('adminCrmSelectAll');
  if(all && !all.dataset.bound){
    all.dataset.bound='1';
    all.addEventListener('change',()=>{
      const ids=adminCrmVisiblePageUids();
      if(all.checked) ids.forEach(id=>adminCrmSelected.add(id));
      else ids.forEach(id=>adminCrmSelected.delete(id));
      updateAdminCrmBulkbar();
      paintAdminCrmVirtualList();
    });
  }
  const filteredBtn=$('adminCrmSelectFiltered');
  if(filteredBtn && !filteredBtn.dataset.bound){
    filteredBtn.dataset.bound='1';
    filteredBtn.addEventListener('click',()=>{
      resolveAdminBulkUids('filtered').forEach(id=>adminCrmSelected.add(id));
      updateAdminCrmBulkbar();
      paintAdminCrmVirtualList();
    });
  }
  const everyoneBtn=$('adminCrmSelectEveryone');
  if(everyoneBtn && !everyoneBtn.dataset.bound){
    everyoneBtn.dataset.bound='1';
    everyoneBtn.addEventListener('click',()=>{
      resolveAdminBulkUids('all').forEach(id=>adminCrmSelected.add(id));
      updateAdminCrmBulkbar();
      paintAdminCrmVirtualList();
    });
  }
  const schedListBtn=$('adminScheduledEmailListBtn');
  if(schedListBtn && !schedListBtn.dataset.bound){
    schedListBtn.dataset.bound='1';
    schedListBtn.addEventListener('click',()=>{
      const uids = [...adminCrmSelected];
      const recipients = uids.length ? adminBulkRecipientsFromUids(uids) : [];
      openAdminEmailCenter({
        recipients,
        initialTab: recipients.length ? 'compose' : 'history'
      }).catch((err)=>alert(err?.message || '이메일을 열 수 없습니다.'));
    });
  }
  const bulk=$('adminCrmBulkbar');
  if(bulk && !bulk.dataset.bound){
    bulk.dataset.bound='1';
    bulk.addEventListener('click', async e=>{
      const btn=e.target.closest('[data-bulk]'); if(!btn) return;
      if(adminBulkBusy) return;
      const action=btn.getAttribute('data-bulk');
      if(action==='clear'){
        adminCrmSelected.clear();
        updateAdminCrmBulkbar();
        paintAdminCrmVirtualList();
        return;
      }
      const uids=[...adminCrmSelected];
      const mode=adminCrmMode();
      if(!uids.length && action!=='gmail' && action!=='credits') return;
      if(action==='gmail'){
        if(mode!=='members') return;
        await runAdminBulkEmail();
        return;
      }
      if(action==='credits'){
        if(mode!=='license') return;
        await runAdminBulkCredits();
        return;
      }
      if(mode!=='members') return;
      if(!uids.length) return;
      if(action==='app-message' || action==='mail'){
        await runAdminBulkAppMessage();
        return;
      }
      if(action==='delete'){
        if(!confirm(`${uids.length}명의 회원 문서를 삭제할까요? (라이선스/주문은 유지)`)) return;
        for(const uid of uids) await adminDeleteUser(uid, true);
        adminCrmSelected.clear();
        selectedAdminUid=null;
        renderAdminUserTable();
        renderAdminCrmDetail(null);
        adminFlash(`일괄 삭제 완료 · ${uids.length}명`);
        return;
      }
      if(action==='ban' || action==='suspend'){
        if(!confirm(`${uids.length}명을 차단할까요?`)) return;
        for(const uid of uids){
          const lic=licenseForUid(uid);
          await adminQuickLicense(`${uid}:${normalizePlan(lic)}:banned`, true);
        }
        adminFlash(`일괄 차단 완료 · ${uids.length}명`);
      }
    });
  }
  bindAdminCrmDetailActions();
  bindAdminCrmDetailTabs();
  bindAdminCrmMemoAutosave();
  bindAdminCrmUsageCollapse();
  bindAdminPaymentsSearch();
}
function setAdminCrmDetailTab(tab){
  const next = String(tab || 'overview');
  const body = $('adminCrmDetailBody');
  if(body) body.dataset.tab = next;
  document.querySelectorAll('#adminCrmDetailTabs [data-crm-detail-tab]').forEach(btn=>{
    btn.classList.toggle('is-active', btn.getAttribute('data-crm-detail-tab') === next);
  });
}
function bindAdminCrmDetailTabs(){
  const nav=$('adminCrmDetailTabs');
  if(!nav || nav.dataset.bound) return;
  nav.dataset.bound='1';
  nav.addEventListener('click', e=>{
    const btn=e.target.closest('[data-crm-detail-tab]');
    if(!btn) return;
    setAdminCrmDetailTab(btn.getAttribute('data-crm-detail-tab'));
  });
}
function bindAdminPaymentsSearch(){
  const el=$('adminPaymentsSearch');
  if(!el || el.dataset.bound) return;
  el.dataset.bound='1';
  el.addEventListener('input', ()=>{
    clearTimeout(bindAdminPaymentsSearch._t);
    bindAdminPaymentsSearch._t=setTimeout(renderAdminPaymentsTable, 180);
  });
}
function renderAdminPaymentsTable(){
  const box=$('adminPaymentsList'); if(!box || !isAdminUser) return;
  const q=($('adminPaymentsSearch')?.value||'').trim().toLowerCase();
  const all=adminOrderRows||[];
  const rows=all.slice().sort((a,b)=>adminTsSec(b.completedAt||b.verifiedAt||b.createdAt||b.updatedAt)-adminTsSec(a.completedAt||a.verifiedAt||a.createdAt||a.updatedAt)).filter(o=>{
    if(!q) return true;
    const user=findAdminUserRow(o.uid||o.userId||o.customerUid);
    const hay=[o.id,o.uid,o.userId,o.email,user?.email,user?.displayName,adminOrderDisplayId(o),o.paymentId,o.paypalOrderId,o.status,adminOrderProductName(o)].join(' ').toLowerCase();
    return hay.includes(q);
  });
  $('adminPaymentsCount') && ($('adminPaymentsCount').textContent=`${rows.length} / ${all.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=`<table class="admin-table admin-payments-table admin-payment-flat-table"><thead><tr><th>주문번호</th><th>사용자</th><th>상품</th><th>결제수단</th><th>결제금액</th><th>결제상태</th><th>결제일</th><th>취소/환불</th><th>관리</th></tr></thead><tbody>${rows.map(o=>adminPaymentMenuRowHtml(o)).join('')}</tbody></table>`;
  if(!box.dataset.payBound){
    box.dataset.payBound='1';
    box.addEventListener('click', e=>{
      const detail=e.target.closest('[data-order-detail]');
      if(!detail) return;
      e.preventDefault();
      e.stopPropagation();
      const orderKey=detail.getAttribute('data-order-detail')||'';
      let uid=detail.getAttribute('data-order-uid')||'';
      if(!uid && orderKey){
        const row=(adminOrderRows||[]).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
        uid=String(row?.uid||row?.userId||row?.customerUid||'');
      }
      if(orderKey && uid) openAdminPaymentDetail(uid, orderKey);
    });
  }
}
function bindAdminCrmDetailActions(){
  const root=$('adminCrm'); if(!root || root.dataset.actionsBound) return;
  root.dataset.actionsBound='1';
  const menuBtn=$('adminCrmMenuBtn');
  const menu=$('adminCrmMenu');
  menuBtn?.addEventListener('click', e=>{
    e.stopPropagation();
    const open = menu?.hidden;
    if(menu) menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click',()=>{ if(menu) menu.hidden=true; menuBtn?.setAttribute('aria-expanded','false'); });
  root.addEventListener('click', async e=>{
    const btn=e.target.closest('[data-crm-action]'); if(!btn) return;
    const action=btn.getAttribute('data-crm-action');
    if(action==='close-order-drawer'){ closeAdminCrmOrderDrawer(); return; }
    if(action==='back-list'){
      closeAdminCrmMemberExpand();
      return;
    }
    const uid=selectedAdminUid;
    if(!uid) return;
    const user = adminUserRows.find(u=>adminUserUid(u)===uid);
    const lic = licenseForUid(uid);
    if(action==='focus-license'){ setAdminCrmDetailTab('license'); $('adminCrmLicenseCard')?.scrollIntoView({behavior:'smooth',block:'start'}); $('adminLicensePlan')?.focus(); }
    else if(action==='goto-tab'){
      const tab=btn.getAttribute('data-crm-tab') || 'overview';
      setAdminCrmDetailTab(tab);
      if(tab==='license') $('adminCrmLicenseCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='device') $('adminCrmHwidCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='access') $('adminCrmAccessCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='payments') $('adminCrmOrdersCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='tickets') $('adminCrmTicketsCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='posts') $('adminCrmPostsCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(tab==='audit') $('adminCrmAuditStack')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    else if(action==='focus-usage'){
      setAdminCrmDetailTab('overview');
      setAdminCrmUsageOpen(true);
      $('adminCrmUsageCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    else if(action==='hwid-reset') await adminResetHwid(uid);
    else if(action==='hwid-reveal'){ adminCrmHwidRevealed=!adminCrmHwidRevealed; renderAdminCrmHwidBox(user, lic); }
    else if(action==='hwid-copy'){
      const hwid=user?.hwid||lic?.hwid||'';
      if(!hwid) return;
      try{ await navigator.clipboard.writeText(hwid); adminFlash('HWID 복사됨'); }catch{ alert(hwid); }
    }
    else if(action==='grant-points'){
      const quick = Number(btn.getAttribute('data-amount') || 0);
      if(Number.isInteger(quick) && quick > 0 && $('adminPointAmount')){
        $('adminPointAmount').value = String(quick);
      }
      await adminAdjustSelectedPoints(1);
    }
    else if(action==='deduct-points') await adminAdjustSelectedPoints(-1);
    else if(action==='grant-trial') await adminQuickLicense(`${uid}:trial:active`, false, { days: 7 });
    else if(action==='grant-lifetime') await adminQuickLicense(`${uid}:lifetime:active`, false, { clearDates: true });
    else if(action==='grant-timed'){
      $('adminCrmLicenseCard')?.scrollIntoView({behavior:'smooth',block:'start'});
      const startEl=$('adminLicenseStartsAt');
      const endEl=$('adminLicenseExpiresAt');
      if(startEl && !startEl.value) startEl.value = toDateInputValue(new Date());
      if(endEl && !endEl.value){
        const end=new Date(); end.setDate(end.getDate()+30);
        endEl.value = toDateInputValue(end);
      }
      if($('adminLicensePlan')) $('adminLicensePlan').value='period';
      checkAdminCrmDirty();
      endEl?.focus();
      adminFlash('기간제 Type · 시작일·만료일 확인 후 Save Changes로 저장하세요');
    }
    else if(action==='ban' || action==='suspend'){ await adminQuickLicense(`${uid}:${normalizePlan(lic)}:banned`); }
    else if(action==='activate'){ await adminQuickLicense(`${uid}:${lic?.plan||'lifetime'}:active`); }
    else if(action==='orders'){ setAdminCrmDetailTab('payments'); $('adminCrmOrdersCard')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if(action==='orders-more'){ setAdminCrmDetailTab('payments'); $('adminCrmOrdersCard')?.scrollIntoView({behavior:'smooth',block:'start'}); renderAdminCrmOrders(uid, true); }
    else if(action==='tickets'){ setAdminCrmDetailTab('tickets'); $('adminCrmTicketsCard')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if(action==='tickets-tab'){
      const email=user?.email||'';
      if(typeof window.__midiaiShowAdminView==='function') window.__midiaiShowAdminView('tickets', { ticketQuery: email });
      else {
        const tabBtn=document.querySelector('[data-admin-tab="tickets"]');
        if(tabBtn) tabBtn.click();
        else $('adminTicketsSection')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    }
    else if(action==='open-logs'){
      if(typeof window.__midiaiShowAdminView==='function') window.__midiaiShowAdminView('logs', { uid });
    }
    else if(action==='posts-delete-one'){
      const postId=btn.getAttribute('data-post-id');
      if(!postId) return;
      await adminDeleteBoardPosts([postId]);
      renderAdminCrmPosts(uid);
    }
    else if(action==='posts-delete-selected'){
      const ids=[...adminCrmPostSelected];
      if(!ids.length) return;
      await adminDeleteBoardPosts(ids);
      adminCrmPostSelected.clear();
      renderAdminCrmPosts(uid);
    }
    else if(action==='posts-delete-all'){
      const ids=adminBoardPostsForUid(uid).map(p=>p.id);
      if(!ids.length) return;
      await adminDeleteBoardPosts(ids, `${ids.length}개의 작성글을 모두 삭제할까요?`);
      adminCrmPostSelected.clear();
      renderAdminCrmPosts(uid);
    }
    else if(action==='app-message') await adminSendAppMessage(uid);
    else if(action==='mail') await adminSendAppMessage(uid);
    else if(action==='google-profile'){
      if(user?.photoURL) window.open(user.photoURL, '_blank', 'noopener');
      else if(user?.email) window.open(`https://www.google.com/search?q=${encodeURIComponent(user.email)}`, '_blank', 'noopener');
      else alert('Google 프로필 정보가 없습니다.');
    }
    else if(action==='discord'){
      const d=user?.discordId||user?.discord||user?.discordUsername;
      if(!d) return alert('Discord 연동 정보가 없습니다.');
      if(String(d).match(/^\d+$/)) window.open(`https://discord.com/users/${encodeURIComponent(d)}`, '_blank', 'noopener');
      else alert(`Discord: ${d}`);
    }
    else if(action==='toggle-fav'){
      if(adminCrmFavorites.has(uid)) adminCrmFavorites.delete(uid); else adminCrmFavorites.add(uid);
      saveAdminCrmFavorites(adminCrmFavorites);
      renderAdminUserTable();
      renderAdminCrmDetail(uid);
    }
    else if(action==='save-memo') await saveAdminCrmUserMemo();
    else if(action==='delete') await adminDeleteUser(uid);
  });
}
function bindAdminCrmDirtyWatchers(){
  const form=$('adminLicenseForm');
  if(form && !form.dataset.planDateBound){
    form.dataset.planDateBound='1';
    const onPlanOrDate=(e)=>{
      const t=e?.target;
      if(!t?.id) return;
      if(t.id==='adminLicensePlan'){
        clearAdminLicenseDatesIfNonPeriod(t.value);
      } else if(t.id==='adminLicenseStartsAt' || t.id==='adminLicenseExpiresAt'){
        syncAdminLicensePlanFromDates();
      }
      checkAdminCrmDirty();
    };
    form.addEventListener('change', onPlanOrDate);
    form.addEventListener('input', onPlanOrDate);
  }
  ['adminUserRole','adminLicensePlan','adminLicenseStartsAt','adminLicenseExpiresAt','adminLicenseMemo','adminCrmUserMemo'].forEach(id=>{
    const el=$(id); if(!el||el.dataset.dirtyBound) return;
    el.dataset.dirtyBound='1';
    el.addEventListener('input', checkAdminCrmDirty);
    el.addEventListener('change', checkAdminCrmDirty);
  });
}
async function saveAdminCrmAllChanges(){
  if(!isAdminUser || !selectedAdminUid || !adminCrmDirty) return;
  const uid=selectedAdminUid;
  const userDocId = adminUserDocIdForUid(uid);
  const role=normalizeRole($('adminUserRole')?.value||'user');
  const plan=$('adminLicensePlan')?.value;
  const saveStatus='active';
  const licenseMemo=$('adminLicenseMemo')?.value||'';
  const wantsClearDates = plan==='lifetime' || plan==='trial';
  // Always wipe period bounds when saving trial/lifetime (before reading values).
  if(wantsClearDates) clearAdminLicenseDatesIfNonPeriod(plan);
  const startsAt=wantsClearDates ? '' : ($('adminLicenseStartsAt')?.value||'');
  const expiresAt=wantsClearDates ? '' : ($('adminLicenseExpiresAt')?.value||'');
  const baseline=adminCrmBaseline||{};
  try{
    const {doc,setDoc,serverTimestamp,deleteField}=firestoreApi;
    const roleChanged = baseline.role!==role;
    const licChanged = baseline.plan!==plan || baseline.licenseMemo!==licenseMemo
      || baseline.startsAt!==startsAt || baseline.expiresAt!==expiresAt
      || (wantsClearDates && (!!baseline.startsAt || !!baseline.expiresAt));
    const memoChanged = baseline.userMemo!==($('adminCrmUserMemo')?.value||'');
    if(roleChanged){
      await setDoc(doc(db,'users',userDocId),{ role, updatedAt:serverTimestamp() },{merge:true});
      const row=findAdminUserRow(uid);
      if(row) row.role=role;
      pushAdminCrmFeed('권한 변경', role, uid);
      writeAdminAuditLog({
        targetUserId: uid,
        targetEmail: row?.email || '',
        category: 'admin',
        action: '권한 변경',
        before: baseline.role || 'user',
        after: role,
        result: 'success',
        summary: `${baseline.role||'user'} → ${role}`
      });
    }
    if(licChanged){
      if(!plan){
        return alert('라이선스 유형을 선택해 주세요.');
      }
      if(plan==='period' && startsAt && expiresAt && startsAt > expiresAt){
        return alert('시작일이 만료일보다 늦을 수 없습니다.');
      }
      let savePlan=normalizeAdminLicensePlanForSave(plan, expiresAt, startsAt);
      if(!['trial','lifetime','period'].includes(savePlan)) savePlan='trial';
      const clearDates = savePlan==='lifetime' || savePlan==='trial';
      if(clearDates){
        if($('adminLicenseStartsAt')) $('adminLicenseStartsAt').value='';
        if($('adminLicenseExpiresAt')) $('adminLicenseExpiresAt').value='';
      }
      if($('adminLicensePlan')) $('adminLicensePlan').value=savePlan;
      const startsAtTs = clearDates ? null : dateInputToStartTimestamp($('adminLicenseStartsAt')?.value||'');
      const expiresAtTs = clearDates ? null : dateInputToEndTimestamp($('adminLicenseExpiresAt')?.value||'');
      const payload={
        licensed: true,
        plan: savePlan,
        status: saveStatus,
        method:'manual',
        memo:licenseMemo,
        updatedAt:serverTimestamp()
      };
      if(clearDates){
        payload.startsAt = deleteField();
        payload.expiresAt = deleteField();
      } else {
        Object.assign(payload, buildAdminLicenseDateFields());
      }
      await setDoc(doc(db,'licenses',uid), payload, {merge:true});
      patchAdminLicenseCache(uid, {
        licensed: true,
        plan: savePlan,
        status: saveStatus,
        method: 'manual',
        memo: licenseMemo,
        startsAt: startsAtTs,
        expiresAt: expiresAtTs,
        updatedAt: adminLicenseCacheNow()
      });
      try{ await notifyLicenseChange(uid, {plan:savePlan, status:saveStatus}); }catch(err){ console.error(err); }
      pushAdminCrmFeed(`${savePlan} 저장`, (!clearDates && expiresAt) ? `~${expiresAt}` : 'active', uid);
      writeAdminAuditLog({
        targetUserId: uid,
        targetEmail: findAdminUserRow(uid)?.email || '',
        category: 'license',
        action: '라이선스 변경',
        before: { plan: baseline.plan, startsAt: baseline.startsAt, expiresAt: baseline.expiresAt, memo: baseline.licenseMemo },
        after: { plan: savePlan, status: saveStatus, startsAt: clearDates ? null : startsAt, expiresAt: clearDates ? null : expiresAt, memo: licenseMemo, method: 'manual' },
        result: 'success',
        summary: `${baseline.plan||'-'} → ${savePlan}`
      });
      renderAdminUserTable({ keepOrder: true });
    }
    if(memoChanged) await saveAdminCrmUserMemo();
    if(roleChanged || licChanged || memoChanged){
      adminFlash(`${tr('saved')} · ${esc(uid)}`);
      setAdminCrmDirty(false);
      refreshAdminCrmDetail({ force:true });
    }
  }catch(e){
    alert(e.message||e);
  }
}
function bindAdminCrmMemoAutosave(){
  const ta=$('adminCrmUserMemo'); if(!ta || ta.dataset.bound) return;
  ta.dataset.bound='1';
  ta.addEventListener('input',()=>{
    checkAdminCrmDirty();
    clearTimeout(adminCrmMemoTimer);
    $('adminCrmMemoStatus') && ($('adminCrmMemoStatus').textContent='변경됨');
  });
}
async function saveAdminCrmUserMemo(){
  if(!isAdminUser || !selectedAdminUid) return;
  const ta=$('adminCrmUserMemo');
  const text = ta?.value || '';
  try{
    const {doc,setDoc,serverTimestamp}=firestoreApi;
    const user = findAdminUserRow(selectedAdminUid);
    const userDocId = adminUserDocIdForUid(selectedAdminUid);
    const prevText = user?.adminMemo || '';
    const histEntry = { text, atMs:Date.now(), by: currentUser?.uid||'admin' };
    const prev = Array.isArray(user?.adminMemoHistory) ? user.adminMemoHistory : [];
    const hist = prevText===text ? prev : [histEntry, ...prev].slice(0,20);
    await setDoc(doc(db,'users',userDocId),{
      adminMemo: text,
      adminMemoHistory: hist,
      updatedAt: serverTimestamp()
    },{merge:true});
    if(user){ user.adminMemo=text; user.adminMemoHistory=hist; }
    $('adminCrmMemoStatus') && ($('adminCrmMemoStatus').textContent='저장됨');
    if(prevText!==text){
      pushAdminCrmFeed('관리자 메모', text.slice(0,40), selectedAdminUid);
      writeAdminAuditLog({
        targetUserId: selectedAdminUid,
        targetEmail: user?.email || '',
        category: 'admin',
        action: '관리자 메모 변경',
        before: prevText,
        after: text,
        result: 'success',
        summary: text.slice(0,80)
      });
    }
    captureAdminCrmBaseline();
    renderAdminCrmMemoHistory(user||{adminMemoHistory:hist});
  }catch(e){
    $('adminCrmMemoStatus') && ($('adminCrmMemoStatus').textContent='저장 실패');
    console.error(e);
  }
}
function bindAdminUserActions(root=document){
  root.querySelectorAll('[data-user-license]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>adminQuickLicense(btn.dataset.userLicense)); });
  root.querySelectorAll('[data-user-hwid-reset]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>adminResetHwid(btn.dataset.userHwidReset)); });
}
async function adminQuickLicense(raw, silent=false, opts={}){
  if(!isAdminUser)return alert(tr('no_permission'));
  const [uid,plan,status]=String(raw).split(':');
  if(!uid)return;
  try{
    const {doc,setDoc,serverTimestamp,Timestamp,deleteField}=firestoreApi;
    let savePlan=String(plan||'trial').toLowerCase();
    if(savePlan==='monthly') savePlan='period';
    if(!['trial','lifetime','period'].includes(savePlan)) savePlan='trial';
    let saveStatus=String(status||'active').toLowerCase();
    if(saveStatus==='suspended') saveStatus='banned';
    if(!['active','expired','banned'].includes(saveStatus)) saveStatus='active';
    const licensed = saveStatus==='active';
    const payload={
      licensed,
      plan: savePlan,
      status: saveStatus,
      method:'admin',
      updatedAt:serverTimestamp(),
      createdAt:serverTimestamp()
    };
    if(opts.clearDates){
      payload.startsAt = deleteField();
      payload.expiresAt = deleteField();
    } else if(opts.days!=null){
      const days=Math.max(1, Number(opts.days)||1);
      const start=new Date(); start.setHours(0,0,0,0);
      const end=new Date(start); end.setDate(end.getDate()+days); end.setHours(23,59,59,999);
      payload.startsAt = Timestamp.fromDate(start);
      payload.expiresAt = Timestamp.fromDate(end);
    } else if(opts.startsAt || opts.expiresAt){
      payload.startsAt = opts.startsAt || deleteField();
      payload.expiresAt = opts.expiresAt || deleteField();
    }
    await setDoc(doc(db,'licenses',uid), payload, {merge:true});
    const cachePatch = {
      licensed,
      plan: savePlan,
      status: saveStatus,
      method: 'admin',
      updatedAt: adminLicenseCacheNow()
    };
    if(opts.clearDates){
      cachePatch.startsAt = null;
      cachePatch.expiresAt = null;
    } else if(opts.days!=null){
      cachePatch.startsAt = payload.startsAt;
      cachePatch.expiresAt = payload.expiresAt;
    } else if(opts.startsAt || opts.expiresAt){
      cachePatch.startsAt = opts.startsAt || null;
      cachePatch.expiresAt = opts.expiresAt || null;
    }
    patchAdminLicenseCache(uid, cachePatch);
    try{ await notifyLicenseChange(uid, {plan:savePlan, status:saveStatus}); }catch(err){ console.error(err); }
    if(!silent){
      const range = opts.days!=null ? ` · ${opts.days}일` : (opts.clearDates ? ' · 무기한' : '');
      adminFlash(`${tr('saved')} · ${esc(uid)} · ${esc(savePlan)} / ${esc(saveStatus)}${range}`);
      pushAdminCrmFeed(savePlan==='lifetime'?'Lifetime 지급':(savePlan==='trial'?'Trial 지급':`${savePlan} 지급`), saveStatus + range, uid);
    }
    writeAdminAuditLog({
      targetUserId: uid,
      targetEmail: findAdminUserRow(uid)?.email || '',
      category: 'license',
      action: saveStatus==='banned' ? '라이선스 차단' : (savePlan==='lifetime'?'Lifetime 지급':(savePlan==='trial'?'Trial 지급':`라이선스 지급`)),
      before: null,
      after: { plan: savePlan, status: saveStatus, method: 'admin', days: opts.days ?? null },
      result: 'success',
      summary: `${savePlan}/${saveStatus}`
    });
    renderAdminUserTable({ keepOrder: true });
    if(selectedAdminUid===uid) refreshAdminCrmDetail({ force:true });
  }catch(e){ alert(e.message); }
}
async function adminResetHwid(uid){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!confirm('이 사용자의 HWID를 초기화할까요?'))return;
  try{
    const {doc,setDoc,serverTimestamp}=firestoreApi;
    const userDocId = adminUserDocIdForUid(uid);
    const licUid = String(uid||'');
    const user = findAdminUserRow(uid);
    const lic = licenseForUid(uid);
    const prevHwid = user?.hwid || lic?.hwid || '';
    await setDoc(doc(db,'users',userDocId),{hwid:'',updatedAt:serverTimestamp()},{merge:true});
    await setDoc(doc(db,'licenses',licUid),{hwid:'',updatedAt:serverTimestamp()},{merge:true});
    adminFlash(`HWID 초기화 완료 · ${esc(uid)}`);
    pushAdminCrmFeed('HWID 초기화', String(uid).slice(0,18), uid);
    writeAdminAuditLog({
      targetUserId: uid,
      targetEmail: user?.email || '',
      category: 'hwid',
      action: 'HWID 초기화',
      before: prevHwid || null,
      after: '',
      result: 'success',
      summary: prevHwid ? maskAdminHwid(prevHwid) : '(없음)'
    });
    if(selectedAdminUid===uid) refreshAdminCrmDetail();
  }catch(e){ alert(e.message); }
}
async function adminDeleteUser(uid, silent=false){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!uid) return;
  const userDocId = adminUserDocIdForUid(uid);
  if(!silent && !confirm(`회원 ${userDocId} 문서를 삭제할까요?\n(라이선스/주문/문의 문서는 유지됩니다)`)) return;
  try{
    const user = findAdminUserRow(uid);
    const {doc,deleteDoc}=firestoreApi;
    await deleteDoc(doc(db,'users',userDocId));
    writeAdminAuditLog({
      targetUserId: uid,
      targetEmail: user?.email || '',
      category: 'admin',
      action: '회원 삭제',
      before: { email: user?.email || '', role: user?.role || '' },
      after: null,
      result: 'success',
      summary: userDocId
    });
    if(!silent) adminFlash(`회원 삭제 · ${esc(userDocId)}`);
    if(selectedAdminUid===uid){ selectedAdminUid=null; renderAdminCrmDetail(null); }
  }catch(e){ alert(e.message); }
}
async function adminDeleteOrder(orderId){
  if(!isAdminUser) return alert(tr('no_permission'));
  const id=String(orderId||'').trim();
  if(!id) return;
  const row=(adminOrderRows||[]).find(o=>(o.id||o.paymentId||o.paypalOrderId)===id);
  const docId=row?.id || id;
  const portone = isAdminPortOneOrder(row||{});
  const statusGroup = adminOrderStatusGroup(row?.status);
  const warn = portone
    ? `\n\n주의: PortOne 결제/환불·라이선스 추적에 쓰는 주문입니다.\n[삭제]는 내부 Firestore 기록만 지웁니다. 실제 환불·권한 회수가 아닙니다.\n환불이 필요하면 주문 [상세] → [결제 취소] 또는 [PortOne 상태 동기화]를 사용하세요.`
    : `\n결제 기록만 삭제되고 라이선스는 유지됩니다.`;
  if(portone && (statusGroup==='paid' || statusGroup==='refund')){
    if(!confirm(`주문 ${adminOrderDisplayId(row||{id:docId})} 을(를) 정말 삭제할까요?${warn}\n\n삭제하면 관리자 집계·동기화 추적이 어려워질 수 있습니다.`)) return;
  } else if(!confirm(`주문 ${adminOrderDisplayId(row||{id:docId})} 을(를) 삭제할까요?${warn}`)) return;
  try{
    const {doc,deleteDoc}=firestoreApi;
    await deleteDoc(doc(db,'orders', docId));
    const uid=String(row?.uid||row?.userId||row?.customerUid||'unknown');
    writeAdminAuditLog({
      targetUserId: uid,
      targetEmail: row?.email || findAdminUserRow(uid)?.email || '',
      category: 'payment',
      action: '주문 삭제',
      before: { id: docId, status: row?.status || '', amount: row?.amount ?? null },
      after: null,
      result: 'success',
      summary: adminOrderDisplayId(row||{id:docId})
    });
    adminFlash('주문 삭제됨');
  }catch(e){ alert(e.message||e); }
}
async function loadAdminLicenses(){
  if(!firestoreApi || !db) return;
  const {doc,getDoc}=firestoreApi;
  const docRef = (uid)=>doc(db,'licenses',uid);
  const nextIdentity = {};
  const nextLicenseCache = {};
  const gen = (loadAdminLicenses._gen = (loadAdminLicenses._gen||0)+1);

  await Promise.all(adminUserRows.map(async u=>{
    const docId = adminUserDocId(u);
    const fieldUid = adminUserFieldUid(u);
    const key = docId || fieldUid;
    if(!key) return;

    let idProbe = { exists:false, data:null, error:false };
    let uidProbe = { exists:false, data:null, error:false };

    if(docId && fieldUid && docId===fieldUid){
      idProbe = uidProbe = await probeAdminLicenseDoc(getDoc, docRef, docId);
    } else {
      const tasks = [];
      if(fieldUid) tasks.push(probeAdminLicenseDoc(getDoc, docRef, fieldUid).then(r=>{ uidProbe=r; }));
      if(docId) tasks.push(probeAdminLicenseDoc(getDoc, docRef, docId).then(r=>{ idProbe=r; }));
      await Promise.all(tasks);
    }

    const resolved = resolveAdminCanonicalFromLicenseProbes(docId, fieldUid, idProbe, uidProbe);
    if(resolved.error){
      console.warn('adminLicenseResolveError', {
        userDocId: docId,
        fieldUid,
        code: resolved.errorCode || 'unknown',
        licenseState: resolved.licenseState
      });
    }
    const entry = {
      userDocId: docId,
      fieldUid,
      canonicalUid: resolved.canonicalUid,
      license: resolved.license,
      licenseState: resolved.licenseState,
      conflict: resolved.conflict,
      error: resolved.error,
      errorCode: resolved.errorCode || ''
    };
    nextIdentity[key] = entry;
    if(docId) nextIdentity[docId] = entry;
    if(fieldUid) nextIdentity[fieldUid] = entry;
    if(resolved.license && resolved.canonicalUid){
      nextLicenseCache[resolved.canonicalUid] = resolved.license;
    }
  }));

  if(gen !== loadAdminLicenses._gen) return; // newer resolve in flight
  adminIdentityCache = nextIdentity;
  adminLicenseCache = nextLicenseCache;
  adminLicenseRows = Object.values(nextLicenseCache);
  adminLicensesLoaded = true;
  renderAdminUserTable();
  refreshAdminCrmDetail();
}
function listenAdminUsers(){
  if(!isAdminUser || !$('adminUserList')) return;
  bindAdminUserFilters();
  adminLicenseRows = [];
  adminLicenseCache = {};
  adminIdentityCache = {};
  adminLicensesLoaded = false;
  adminOrdersLoaded = false;
  adminOrdersListenError = null;
  adminTicketsListenError = null;
  adminUsersListenError = null;
  const {collection,onSnapshot}=firestoreApi;
  const onSnapErr = (label, setter)=>{
    return (err)=>{
      const meta = adminFsErrorMeta(err);
      console.error(`admin ${label} snapshot error`, meta.code, meta.message, err);
      setter(meta);
      renderAdminUserTable();
      refreshAdminCrmDetail();
    };
  };
  addUnsub(onSnapshot(
    collection(db,'users'),
    snap=>{
      adminUsersListenError = null;
      const prevIds = adminUserRows.map(u=>String(u.id||'')).filter(Boolean).sort().join('|');
      adminUserRows=snap.docs.map(d=>({id:d.id,...d.data()}));
      const nextIds = adminUserRows.map(u=>String(u.id||'')).filter(Boolean).sort().join('|');
      const membershipChanged = prevIds !== nextIds;
      // lastLogin churn must not wipe license badges to "확인 중" or reload every license.
      if(membershipChanged || !adminLicensesLoaded){
        loadAdminLicenses();
      }
      renderAdminUserTable();
      refreshAdminCrmDetail();
    },
    onSnapErr('users', m=>{ adminUsersListenError=m; })
  ));
  addUnsub(onSnapshot(
    collection(db,'creditWallets'),
    snap=>{
      const next={};
      snap.docs.forEach(d=>{
        const data=d.data()||{};
        next[d.id]=data;
        if(data.uid) next[String(data.uid)]=data;
      });
      adminCreditWalletByUid=next;
      refreshAdminLicenseCreditCells();
    },
    err=>console.error('admin creditWallets snapshot error', err)
  ));
  addUnsub(onSnapshot(
    collection(db,'orders'),
    snap=>{
      adminOrdersListenError = null;
      adminOrdersLoaded = true;
      adminOrderRows=snap.docs.map(d=>({id:d.id,...d.data()}));
      renderAdminUserTable();
      refreshAdminCrmDetail();
    },
    onSnapErr('orders', m=>{ adminOrdersListenError=m; adminOrdersLoaded=true; })
  ));
  addUnsub(onSnapshot(
    collection(db,'supportTickets'),
    snap=>{
      adminTicketsListenError = null;
      adminTicketRows=snap.docs.map(d=>({id:d.id,...d.data()}));
      renderAdminUserTable();
      refreshAdminCrmDetail();
    },
    onSnapErr('tickets', m=>{ adminTicketsListenError=m; })
  ));
  addUnsub(onSnapshot(
    collection(db,'boardPosts'),
    snap=>{ adminBoardRows=snap.docs.map(d=>({id:d.id,...d.data()})); if(selectedAdminUid) renderAdminCrmPosts(selectedAdminUid); if($('adminCmsList')) renderAdminCmsTable(); },
    (err)=>{ const meta=adminFsErrorMeta(err); console.error('admin boardPosts snapshot error', meta.code, meta.message, err); }
  ));
  listenAdminPostManager();
}

function isOwnerRecord(x){ return !!(currentUser && x && (x.uid === currentUser.uid || x.authorUid === currentUser.uid)); }
function canManageRecord(x){ return isAdminUser || isOwnerRecord(x); }
function boardDisplayName(){ return isAdminUser ? BRAND_AUTHOR : (currentUser?.displayName || currentUser?.email || 'Google User'); }
function boardEmail(){ return currentUser?.email || ''; }
function boardPostUrl(id){ return `./board-post.html?id=${encodeURIComponent(id)}`; }
function boardEditUrl(id){ return `./board-write.html?id=${encodeURIComponent(id)}`; }
function isBoardMineMode(){
  const v = String(getParam('mine')||'').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
function boardFilteredSorted(rows){
  const q=($('boardSearch')?.value||'').trim().toLowerCase();
  let out=rows.filter(x=>x.visible!==false && x.deleted!==true).filter(x=>{
    const hay=[x.title,x.content,x.displayName,x.email].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  if(isBoardMineMode()){
    if(!currentUser) out = [];
    else out = out.filter(x => x.uid === currentUser.uid || x.authorUid === currentUser.uid);
  }
  const time=x=>x.createdAt?.seconds||0;
  out.sort((a,b)=>(b.pinned===true)-(a.pinned===true) || (time(b)-time(a)));
  return out;
}
function applyBoardMineModeUi(){
  if(page !== 'board.html') return;
  const mine = isBoardMineMode();
  const h1 = document.querySelector('.hub-topline h1');
  const desc = document.querySelector('.hub-topline .hub-desc');
  const title = $('boardListTitle') || document.querySelector('.hub-toolbar h2');
  if(h1){
    if(!h1.dataset.defaultText) h1.dataset.defaultText = h1.textContent;
    h1.textContent = mine ? tr('board_mine_title') : h1.dataset.defaultText;
  }
  if(desc){
    if(!desc.dataset.defaultText) desc.dataset.defaultText = desc.textContent;
    desc.textContent = mine ? tr('board_mine_desc') : desc.dataset.defaultText;
  }
  if(title){
    if(!title.dataset.defaultText) title.dataset.defaultText = title.textContent;
    title.textContent = mine ? tr('board_mine_title') : title.dataset.defaultText;
  }
  let tools = document.querySelector('.hub-tools');
  if(tools){
    // Remove legacy "내 글만" toolbar toggle if present.
    $('boardMineToggle')?.remove();
  }
}
function renderBoardPosts(rows, err){
  const box=$('boardPostList'); if(!box)return;
  if(err){ box.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  const list=boardFilteredSorted(rows||[]);
  if(!list.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  const { page, pages, start, slice, total } = hubPaginate(list, 'board');
  box.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${slice.map((x,i)=>{
    const globalIndex = start + i;
    const rowNo = hubListRowNo(list, globalIndex, x);
    const no = x.pinned
      ? `<div class="hub-col-no is-pinned-no">${esc(tt('공지'))}</div>`
      : `<div class="hub-col-no">${rowNo}</div>`;
    return `<a class="hub-list-row hub-notice-row ${x.pinned?'is-pinned':''}" href="${boardPostUrl(x.id)}">${no}<div class="hub-col-title"><b>${x.pinned?'📌 ':''}<span class="hub-col-title-text">${esc(x.title||tt('(제목 없음)'))}</span></b></div>${authorCellHtml(x)}<div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`;
  }).join('')}</div>${hubPagerHtml('board', page, pages, total)}`;
  const pager = box.querySelector('[data-hub-pager="board"]');
  if(pager){ pager.dataset.total = String(total); pager.dataset.pages = String(pages); }
  bindHubPager(box, 'board', ()=>renderBoardPosts(window.__boardRows||[]));
}
function listenBoardPosts(){
  if(!$('boardPostList')) return;
  applyBoardMineModeUi();
  const search=$('boardSearch');
  if(search && !search.dataset.boardBound){
    search.dataset.boardBound='1';
    search.addEventListener('input',()=>{
      hubListPage.board = 1;
      if(window.__boardRows) renderBoardPosts(window.__boardRows);
    });
  }
  listenVisibleDocs('boardPosts',(rows,err)=>{
    window.__boardRows=rows||[];
    hubListPage.board = 1;
    renderBoardPosts(window.__boardRows,err);
    if(!err && rows?.length){
      enrichRowsWithAuthorLicense(rows).then(enriched=>{
        window.__boardRows=enriched;
        renderBoardPosts(window.__boardRows);
      }).catch(()=>{});
    }
  });
}

const BOARD_MAX_ATTACHMENTS = 5;
const BOARD_MAX_FILE_SIZE = 50 * 1024 * 1024;
const BOARD_ALLOWED_MIME = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|webm)|audio\/(midi|mid|x-midi)|application\/(x-)?midi)$/i;
let selectedBoardFiles = [];
let existingBoardAttachments = [];
let midiPlayerLibPromise = null;
const boardMidiPreviewCache = new Map();

function isBoardMidi(fileOrAttachment){
  const mime = String(fileOrAttachment?.type || fileOrAttachment?.mime || '').toLowerCase();
  const name = String(fileOrAttachment?.name || fileOrAttachment?.fileName || '').toLowerCase();
  const stored = String(fileOrAttachment?.type || '').toLowerCase();
  if(stored === 'midi') return true;
  if(/audio\/(midi|mid|x-midi)|application\/(x-)?midi/.test(mime)) return true;
  if(/\.(mid|midi)$/.test(name)) return true;
  return false;
}
function boardFileType(fileOrAttachment){
  if(isBoardMidi(fileOrAttachment)) return 'midi';
  const mime = String(fileOrAttachment?.type || fileOrAttachment?.mime || '');
  if(mime.startsWith('video/')) return 'video';
  if(String(fileOrAttachment?.type || '') === 'video') return 'video';
  return 'image';
}
function boardMidiContentType(file){
  const t = String(file?.type || '').toLowerCase();
  if(/^(audio\/(midi|mid|x-midi)|application\/(x-)?midi)$/.test(t)) return t;
  return 'audio/midi';
}
function ensureMidiPlayerLib(){
  if(window.Tone?.Offline) return Promise.resolve();
  if(midiPlayerLibPromise) return midiPlayerLibPromise;
  midiPlayerLibPromise = new Promise((resolve, reject)=>{
    const fail = ()=>{ midiPlayerLibPromise=null; reject(new Error('MIDI 엔진 로드 실패')); };
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js';
    s.async=true;
    s.onload=()=>{ if(window.Tone?.Offline) resolve(); else fail(); };
    s.onerror=fail;
    document.head.appendChild(s);
  });
  return midiPlayerLibPromise;
}
function boardSafeFilename(name){
  const raw = String(name || 'attachment').normalize('NFKC');
  return raw.replace(/[\\/#?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(-90);
}
function boardStoragePathFromUrl(url){
  try{
    const u = new URL(String(url||''));
    const m = u.pathname.match(/\/o\/([^?]+)/);
    if(m) return decodeURIComponent(m[1]);
  }catch(_){}
  return '';
}
function setBoardMidiMsg(card, text){
  const msg = card?.querySelector('.board-midi-msg');
  if(!msg) return;
  if(!text){ msg.hidden=true; msg.textContent=''; return; }
  msg.hidden=false;
  msg.textContent=text;
}
function audioBufferToWavBlob(audioBuffer){
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples * blockAlign);
  const view = new DataView(buffer);
  const writeStr = (offset, str)=>{ for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples * blockAlign, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples * blockAlign, true);
  let offset = 44;
  const channels = [];
  for(let c=0;c<numChannels;c++) channels.push(audioBuffer.getChannelData(c));
  for(let i=0;i<samples;i++){
    for(let c=0;c<numChannels;c++){
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
async function boardMidiBytes(path, url){
  const tryPath = path || boardStoragePathFromUrl(url);
  const withTimeout = (p, ms=30000)=>Promise.race([
    p,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('MIDI 로드 시간 초과')), ms))
  ]);
  const base = String(CONFIG.functionsBaseUrl || '').replace(/\/$/, '');
  // 1) Cloud Function proxy (CORS-safe)
  if(tryPath && base && !base.includes('PASTE_')){
    try{
      const res = await withTimeout(fetch(`${base}/boardFileProxy?path=${encodeURIComponent(tryPath)}`, { credentials:'omit' }));
      if(res.ok) return await res.arrayBuffer();
      console.warn('boardFileProxy status', res.status);
    }catch(err){ console.warn('boardFileProxy failed', err); }
  }
  // 2) Firebase Storage SDK
  if(tryPath && storage && storageApi?.ref){
    if(storageApi.getBlob){
      try{
        const blob = await withTimeout(storageApi.getBlob(storageApi.ref(storage, tryPath)));
        return await blob.arrayBuffer();
      }catch(err){ console.warn('getBlob failed', err); }
    }
    if(storageApi.getBytes){
      try{
        const bytes = await withTimeout(storageApi.getBytes(storageApi.ref(storage, tryPath)));
        return bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }catch(err){ console.warn('getBytes failed', err); }
    }
  }
  // 3) Direct download URL (needs Storage CORS)
  if(url){
    try{
      const res = await withTimeout(fetch(url, { mode:'cors', credentials:'omit' }));
      if(res.ok) return await res.arrayBuffer();
    }catch(err){ console.warn('direct fetch failed', err); }
  }
  throw new Error('MIDI 파일을 가져오지 못했습니다. Functions(boardFileProxy) 배포와 Storage 경로를 확인하세요.');
}
async function renderMidiPreviewWav(midiArrayBuffer, maxSec=40, opts={}){
  await ensureMidiPlayerLib();
  const result = await renderMidiPreviewEngine(midiArrayBuffer, maxSec, opts);
  return audioBufferToWavBlob(result.audioBuffer);
}
async function makeBoardMidiPreviewUrl(path, url, cacheKey, onStatus){
  if(boardMidiPreviewCache.has(cacheKey)) return boardMidiPreviewCache.get(cacheKey);
  const inflightKey = cacheKey + ':pending';
  if(boardMidiPreviewCache.has(inflightKey)) return boardMidiPreviewCache.get(inflightKey);
  const job = (async ()=>{
    try{
      const buf = await boardMidiBytes(path, url);
      const wav = await renderMidiPreviewWav(buf, 40, { onStatus });
      const obj = URL.createObjectURL(wav);
      boardMidiPreviewCache.set(cacheKey, obj);
      return obj;
    }finally{
      boardMidiPreviewCache.delete(inflightKey);
    }
  })();
  boardMidiPreviewCache.set(inflightKey, job);
  return job;
}
function boardAttachmentItemHtml(a, idx, editable=false){
  const type = boardFileType(a);
  const name = esc(a.name || a.fileName || 'attachment');
  const url = esc(a.url || '');
  const path = esc(a.path || boardStoragePathFromUrl(a.url) || '');
  const badge = type === 'video' ? '🎥 영상' : type === 'midi' ? '🎹 MIDI' : '🖼️ 사진';
  const remove = editable ? `<button type="button" class="secondary mini-btn danger-btn" data-remove-existing-attachment="${idx}">삭제</button>` : '';
  if(type === 'midi'){
    return `<figure class="board-attachment-item board-attachment-midi">
      <div class="board-midi-card">
        <div class="board-midi-row">
          <span class="board-midi-badge"><span class="board-midi-badge-icon" aria-hidden="true">🎹</span> MIDI</span>
          <b class="board-midi-name" title="${name}">${name}</b>
          ${editable?'':`<button type="button" class="board-midi-play-btn" data-midi-preview="${url}" data-midi-path="${path}" aria-label="미리듣기">미리듣기</button>
          <a class="board-midi-dl" href="${url}" target="_blank" rel="noopener noreferrer" download>다운로드</a>`}
          ${remove}
        </div>
        <audio class="board-midi-audio" controls preload="none" hidden></audio>
        <p class="board-midi-msg muted" hidden></p>
      </div>
    </figure>`;
  }
  let media = '';
  if(type === 'video'){
    media = `<video controls preload="metadata" src="${url}"></video>`;
  } else {
    media = `<img src="${url}" alt="${name}" loading="lazy" data-lightbox-src="${url}">`;
  }
  return `<figure class="board-attachment-item board-attachment-${type}">${media}<figcaption><span class="board-attach-badge">${badge}</span><b class="board-attach-name" title="${name}">${name}</b>${remove}</figcaption></figure>`;
}
function boardAttachmentsHtml(list){
  const arr = Array.isArray(list) ? list.filter(x=>x && x.url) : [];
  if(!arr.length) return '';
  return `<div class="board-attachments">${arr.map((a,i)=>boardAttachmentItemHtml(a,i,false)).join('')}</div>`;
}
async function prepareBoardMidiPreview(btn){
  const url = btn.getAttribute('data-midi-preview');
  const path = btn.getAttribute('data-midi-path') || boardStoragePathFromUrl(url);
  const card = btn.closest('.board-midi-card');
  const audio = card?.querySelector('.board-midi-audio');
  if(!url || !audio) return;
  btn.disabled = true;
  btn.textContent = '변환중…';
  setBoardMidiMsg(card, '악기 음원 준비 중…');
  try{
    document.querySelectorAll('.board-midi-audio').forEach((el)=>{ if(el !== audio) try{ el.pause(); }catch(_){ } });
    const preview = await makeBoardMidiPreviewUrl(path, url, url, (msg)=>setBoardMidiMsg(card, msg));
    audio.src = preview;
    audio.hidden = false;
    setBoardMidiMsg(card, '미리듣기 준비됨 · 재생 버튼을 누르세요');
    btn.hidden = true;
    try{ await audio.play(); setBoardMidiMsg(card, ''); }catch(_){}
  }catch(err){
    console.warn('midi preview failed', err);
    btn.disabled = false;
    btn.textContent = '미리듣기';
    const raw = String(err?.message || err || '');
    setBoardMidiMsg(card, `미리듣기 실패: ${raw.slice(0,120) || '알 수 없는 오류'}`);
  }
}
function hydrateBoardMidiPlayers(root=document){
  root.querySelectorAll?.('[data-midi-preview]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound='1';
    btn.addEventListener('click',()=>prepareBoardMidiPreview(btn));
  });
  root.querySelectorAll?.('.board-midi-audio').forEach(audio=>{
    if(audio.dataset.bound) return;
    audio.dataset.bound='1';
    audio.addEventListener('play',()=>{
      document.querySelectorAll('.board-midi-audio').forEach((el)=>{ if(el!==audio) try{ el.pause(); }catch(_){ } });
    });
  });
}
function renderBoardAttachmentPreview(){
  const box = $('boardAttachmentPreview');
  if(!box) return;
  const existing = existingBoardAttachments.map((a,i)=>boardAttachmentItemHtml(a,i,true)).join('');
  const fresh = selectedBoardFiles.map((file,i)=>{
    const type = boardFileType(file);
    const icon = type === 'video' ? '🎥' : type === 'midi' ? '🎹' : '🖼️';
    return `<div class="board-file-chip"><span>${icon}</span><b>${esc(file.name)}</b><small>${Math.max(1, Math.ceil(file.size/1024/1024))}MB</small><button type="button" class="secondary mini-btn danger-btn" data-remove-new-attachment="${i}">삭제</button></div>`;
  }).join('');
  box.innerHTML = existing || fresh ? `${existing}<div class="board-file-chip-list">${fresh}</div>` : '<p class="muted">첨부한 파일이 없습니다.</p>';
  box.querySelectorAll('[data-remove-existing-attachment]').forEach(btn=>btn.onclick=()=>{ existingBoardAttachments.splice(Number(btn.dataset.removeExistingAttachment),1); renderBoardAttachmentPreview(); });
  box.querySelectorAll('[data-remove-new-attachment]').forEach(btn=>btn.onclick=()=>{ selectedBoardFiles.splice(Number(btn.dataset.removeNewAttachment),1); const input=$('boardAttachments'); if(input) input.value=''; renderBoardAttachmentPreview(); });
  hydrateBoardMidiPlayers(box);
}
function boardFileAllowed(file){
  if(isBoardMidi(file)) return true;
  return BOARD_ALLOWED_MIME.test(file.type || '');
}
function addBoardFiles(files){
  const msg = $('boardPostMsg');
  const incoming = Array.from(files || []);
  for(const file of incoming){
    if(!boardFileAllowed(file)){ if(msg) msg.textContent = '지원하지 않는 파일 형식입니다. JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI만 업로드할 수 있어요.'; continue; }
    if(file.size > BOARD_MAX_FILE_SIZE){ if(msg) msg.textContent = '파일당 최대 50MB까지 업로드할 수 있어요.'; continue; }
    if(existingBoardAttachments.length + selectedBoardFiles.length >= BOARD_MAX_ATTACHMENTS){ if(msg) msg.textContent = '게시글당 첨부는 최대 5개까지 가능합니다.'; break; }
    selectedBoardFiles.push(file);
  }
  renderBoardAttachmentPreview();
}
function bindBoardAttachmentPicker(){
  const input = $('boardAttachments');
  const drop = qs('.board-upload-box');
  if(input && !input.dataset.bound){
    input.dataset.bound='1';
    input.addEventListener('change',()=>addBoardFiles(input.files));
  }
  if(drop && !drop.dataset.bound){
    drop.dataset.bound='1';
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{ e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{ e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop',e=>addBoardFiles(e.dataTransfer?.files));
  }
  renderBoardAttachmentPreview();
}
async function uploadBoardAttachments(postId){
  if(!selectedBoardFiles.length) return [];
  if(!storage || !storageApi?.ref) throw new Error('Firebase Storage 초기화에 실패했습니다.');
  const {ref, uploadBytes, getDownloadURL} = storageApi;
  const uploaded = [];
  const msg = $('boardPostMsg');
  for(let i=0;i<selectedBoardFiles.length;i++){
    const file = selectedBoardFiles[i];
    if(msg) msg.textContent = `첨부파일 업로드 중... ${i+1}/${selectedBoardFiles.length}`;
    const safeName = boardSafeFilename(file.name);
    const path = `board/${currentUser.uid}/${postId}/${Date.now()}_${i}_${safeName}`;
    const fileRef = ref(storage, path);
    const contentType = isBoardMidi(file) ? boardMidiContentType(file) : (file.type || 'application/octet-stream');
    await uploadBytes(fileRef, file, { contentType });
    const url = await getDownloadURL(fileRef);
    const item = { type: boardFileType(file), mime: contentType, name: file.name, size: file.size, path, url };
    uploaded.push(item);
  }
  return uploaded;
}
function bindBoardLightbox(){
  if(document.body.dataset.boardLightboxBound) return;
  document.body.dataset.boardLightboxBound='1';
  document.addEventListener('click',e=>{
    const img=e.target.closest && e.target.closest('[data-lightbox-src]');
    if(!img) return;
    const src=img.getAttribute('data-lightbox-src');
    const overlay=document.createElement('div');
    overlay.className='board-lightbox';
    overlay.innerHTML=`<button type="button" aria-label="close">×</button><img src="${esc(src)}" alt="preview">`;
    overlay.addEventListener('click',()=>overlay.remove());
    document.body.appendChild(overlay);
  }, {once:false});
}

const BOARD_EMOJI_GROUPS = [
  { id:'smile', icon:'😀', items:['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'] },
  { id:'gesture', icon:'👍', items:['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','👐','🤲','🙏','💪','🦾','💅','✍️','🤳'] },
  { id:'heart', icon:'❤️', items:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐'] },
  { id:'fun', icon:'🎉', items:['🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🎱','🎮','🕹️','🎲','🧩','🎯','🎵','🎶','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻'] },
  { id:'nature', icon:'🌸', items:['🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍄','🌰','🦀','🦞','🦐','🦑','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','⭐','🌟','✨','⚡','🔥','💧','🌈'] },
  { id:'food', icon:'🍕', items:['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫒','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'] },
  { id:'travel', icon:'✈️', items:['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🚧','⚓','⛵','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🛎️','🧳','⌛','⏳','⌚','⏰','⏱️','⏲️','🕰️','🌡️','⛱️'] },
  { id:'symbol', icon:'💯', items:['💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤','👋','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','💠','🔘','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♥️','♦️','♣️','🃏','🀄','🎴','🎭','🖼️','🎨'] }
];

function insertBoardEmoji(emoji){
  const form=$('boardPostForm');
  if(form?._mdEditor){
    form._mdEditor.insertMarkdown(emoji);
    return;
  }
  const ta=$('boardPostContent');
  if(!ta) return;
  const start=typeof ta.selectionStart==='number'?ta.selectionStart:ta.value.length;
  const end=typeof ta.selectionEnd==='number'?ta.selectionEnd:ta.value.length;
  const before=ta.value.slice(0,start);
  const after=ta.value.slice(end);
  ta.value=before+emoji+after;
  const next=start+emoji.length;
  ta.focus();
  try{ ta.setSelectionRange(next,next); }catch(_){}
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}

function renderBoardEmojiPicker(activeId){
  const picker=$('boardEmojiPicker');
  if(!picker) return;
  const group=BOARD_EMOJI_GROUPS.find(g=>g.id===activeId)||BOARD_EMOJI_GROUPS[0];
  picker.dataset.activeTab = group.id;
  picker.innerHTML=`<div class="board-emoji-tabs" role="tablist" aria-label="이모티콘 카테고리">${BOARD_EMOJI_GROUPS.map(g=>`<button type="button" class="board-emoji-tab ${g.id===group.id?'is-active':''}" role="tab" aria-selected="${g.id===group.id?'true':'false'}" data-emoji-tab="${g.id}" aria-label="${g.id}">${g.icon}</button>`).join('')}</div><div class="board-emoji-panel"><div class="board-emoji-grid" data-emoji-grid>${group.items.map(e=>`<button type="button" class="board-emoji-item" data-emoji="${e}" title="${e}">${e}</button>`).join('')}</div></div><p class="board-emoji-hint">이모티콘을 눌러 내용에 삽입합니다.</p>`;
  const panel = picker.querySelector('.board-emoji-panel');
  if(panel) panel.scrollTop = 0;
}

function setBoardEmojiPickerOpen(open){
  const picker=$('boardEmojiPicker');
  const btn=$('boardEmojiBtn');
  if(!picker||!btn) return;
  picker.classList.toggle('hidden',!open);
  btn.setAttribute('aria-expanded', open?'true':'false');
  if(open){
    if(!picker.dataset.ready){
      renderBoardEmojiPicker(picker.dataset.activeTab || 'smile');
      picker.dataset.ready='1';
    }
  }
}

function bindBoardEmojiPicker(){
  const btn=$('boardEmojiBtn');
  const picker=$('boardEmojiPicker');
  if(!btn||!picker||btn.dataset.bound) return;
  btn.dataset.bound='1';
  btn.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    setBoardEmojiPickerOpen(picker.classList.contains('hidden'));
  });
  // Category tabs filter only — keep picker open. stopPropagation avoids the
  // document outside-click handler seeing a detached target after innerHTML refresh.
  picker.addEventListener('click',e=>{
    e.stopPropagation();
    const tab=e.target.closest('[data-emoji-tab]');
    if(tab){
      e.preventDefault();
      const id=tab.getAttribute('data-emoji-tab');
      if(id && id !== picker.dataset.activeTab) renderBoardEmojiPicker(id);
      return;
    }
    const item=e.target.closest('[data-emoji]');
    if(item){
      e.preventDefault();
      insertBoardEmoji(item.getAttribute('data-emoji')||'');
      setBoardEmojiPickerOpen(false);
    }
  });
  picker.addEventListener('mousedown',e=>e.stopPropagation());
  document.addEventListener('click',e=>{
    if(picker.classList.contains('hidden')) return;
    if(picker.contains(e.target)||btn.contains(e.target)) return;
    setBoardEmojiPickerOpen(false);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !picker.classList.contains('hidden')) setBoardEmojiPickerOpen(false);
  });
}

async function initBoardPostEditor(){
  const form=$('boardPostForm'); if(!form) return;
  updateBoardPinnedUi();
  const submitBtn=form.querySelector('button[type="submit"]');
  if(!currentUser){
    if($('boardPostMsg')) $('boardPostMsg').textContent=tr('need_login');
    if(submitBtn) submitBtn.disabled=true;
    return;
  }
  const id=getParam('id');
  const uid=currentUser.uid;
  const editorToken=`${uid}:${id||'new'}`;
  if(form._mdInitLock){
    await form._mdInitLock;
    if(form.dataset.editorToken===editorToken && form._mdEditor) return;
  }
  if(form.dataset.editorToken===editorToken && form._mdEditor){
    form._mdEditor.refreshLayout?.();
    if(submitBtn) submitBtn.disabled=false;
    return;
  }
  form._mdInitLock=(async()=>{
    ensureMarkdownCss();
    let editorHost=$('boardPostEditor')||$('boardPostContent');
    if(editorHost && editorHost.tagName==='TEXTAREA'){
      const wrap=document.createElement('div');
      wrap.id='boardPostEditor';
      editorHost.replaceWith(wrap);
      editorHost=wrap;
    }
    editorHost=$('boardPostEditor');
    const draftId=id||'new';
    let liveMd='';
    if(form._mdEditor){
      try{ liveMd=String(form._mdEditor.getMarkdown?.()||form._mdEditor.getValue?.()||''); }catch(_){}
      try{ form._mdEditor.destroy(); }catch(_){}
      form._mdEditor=null;
    }
    let initialMd=liveMd;
    const {doc,getDoc,setDoc,addDoc,collection,serverTimestamp}=firestoreApi;
    if(id && !form._editingPost){
      try{
        const snap=await getDoc(doc(db,'boardPosts',id));
        const d=snap.exists()?{id:snap.id,...snap.data()}:null;
        if(!d){
          $('boardPostMsg').textContent=tr('empty');
        } else if(!canManageRecord(d)){
          $('boardPostMsg').textContent=tr('no_permission');
          if(submitBtn) submitBtn.disabled=true;
        } else {
          $('boardWriteHeading') && ($('boardWriteHeading').textContent='자유게시판 글 수정');
          $('boardPostTitle').value=d.title||'';
          initialMd=liveMd || pickMarkdownSource(d);
          existingBoardAttachments = Array.isArray(d.attachments) ? d.attachments.filter(x=>x && x.url) : [];
          renderBoardAttachmentPreview();
          form._editingPost = d;
          if(isAdminUser && $('boardPostPinned')) $('boardPostPinned').checked=!!d.pinned;
          if(submitBtn) submitBtn.disabled=false;
          if($('boardPostMsg')) $('boardPostMsg').textContent='';
        }
      }catch(e){ $('boardPostMsg').textContent=e.message; }
    } else if(form._editingPost){
      initialMd=liveMd || pickMarkdownSource(form._editingPost);
      if(submitBtn) submitBtn.disabled=false;
    } else if(submitBtn){
      submitBtn.disabled=false;
      if($('boardPostMsg')) $('boardPostMsg').textContent='';
    }
    if(editorHost){
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const remount=form.dataset.editorToken && form.dataset.editorToken!==editorToken;
      form._mdEditor=await mountMarkdownEditor(editorHost,{
        value: initialMd,
        height: 420,
        draftKey: `board:${draftId}`,
        storagePrefix: `cms-md/${uid}/board`,
        showActions: false,
        preferToast: false,
        promptDraft: !remount && !liveMd
      });
      if(initialMd) form._mdEditor.setMarkdown(initialMd);
      form._mdEditor.refreshLayout();
      setTimeout(()=>form._mdEditor?.focus?.(), 80);
    }
    form.dataset.editorToken=editorToken;
    if(form.dataset.bound) return;
    bindBoardAttachmentPicker();
    bindBoardEmojiPicker();
    $('boardMdPreview')?.addEventListener('click', async () => {
      const md = form._mdEditor ? (form._mdEditor.getMarkdown?.() || form._mdEditor.getValue?.() || '') : ($('boardPostContent')?.value || '');
      await openMarkdownPreview({ markdown: md, title: '미리보기' });
    });
    form.dataset.bound='1';
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!currentUser){ $('boardPostMsg').textContent=tr('need_login'); return; }
      const editing = form._editingPost || {};
      const mdContent=(form._mdEditor?(form._mdEditor.getMarkdown?.()||form._mdEditor.getValue?.()||''):($('boardPostContent')?.value||'')).trim();
      if(form._mdEditor && !form._mdEditor.getMarkdown && !form._mdEditor.getValue){ $('boardPostMsg').textContent='편집기가 준비되지 않았습니다.'; return; }
      const title=$('boardPostTitle').value.trim();
      if(!title){ $('boardPostMsg').textContent='제목을 입력하세요.'; return; }
      if(!mdContent){ $('boardPostMsg').textContent='본문을 입력하세요.'; return; }
      const data={title,content:mdContent,contentMarkdown:mdContent,contentFormat:'markdown',visible:true,deleted:false,edited:!!id,category:'free',updatedAt:serverTimestamp()};
      if(!id){
        data.uid=currentUser.uid;
        data.email=boardEmail();
        data.displayName=boardDisplayName();
        data.authorLicensed=isAdminUser?false:!!currentLicenseActive;
        if(isAdminUser) data.authorRole='admin';
      } else if(isOwnerRecord(editing)){
        data.email=boardEmail();
        data.displayName=boardDisplayName();
        data.authorLicensed=isAdminUser?false:!!currentLicenseActive;
        if(isAdminUser) data.authorRole='admin';
      }
      if(isAdminUser) data.pinned=!!$('boardPostPinned')?.checked;
      try{
        let postId=id;
        if(id){
          const uploaded = await uploadBoardAttachments(id);
          await setDoc(doc(db,'boardPosts',id),{...data,attachments:[...existingBoardAttachments,...uploaded]},{merge:true});
          postId=id;
        } else {
          const ref=await addDoc(collection(db,'boardPosts'),{...data,pinned:isAdminUser&&!!$('boardPostPinned')?.checked,commentCount:0,viewCount:0,likeCount:0,attachments:[],createdAt:serverTimestamp()});
          postId=ref.id;
          const uploaded = await uploadBoardAttachments(postId);
          if(uploaded.length) await setDoc(doc(db,'boardPosts',postId),{attachments:uploaded,updatedAt:serverTimestamp()},{merge:true});
        }
        clearDraft(`board:${draftId}`);
        location.href=boardPostUrl(postId);
      }catch(err){
        const raw=String(err?.message||err||'');
        if(/storage\/unauthorized|does not have permission/i.test(raw)){
          $('boardPostMsg').textContent='첨부파일 업로드 권한이 없습니다. Firebase Storage 규칙에 MIDI(audio/midi) 허용이 필요합니다.';
        } else {
          $('boardPostMsg').textContent=raw;
        }
      }
    });
  })();
  try{ await form._mdInitLock; }
  finally{ form._mdInitLock=null; }
}
function renderBoardPost(d,err){
  const box=$('boardPostDetail'); if(!box)return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!d || d.visible===false || d.deleted===true){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  activeBoardPost=d;
  const manage=canManageRecord(d);
  const labels = lang==='en'
    ? {board:'Community', pinned:'Pinned post', author:'Author', date:'Date', views:'Views', likes:'Likes', comments:'Comments', like:'Like', edit:'Edit', del:'Delete'}
    : lang==='ja'
    ? {board:'コミュニティ', pinned:'固定投稿', author:'投稿者', date:'作成日', views:'閲覧', likes:'いいね', comments:'コメント', like:'いいね', edit:'編集', del:'削除'}
    : {board:'자유게시판', pinned:'고정 게시글', author:'작성자', date:'작성일', views:'조회', likes:'추천', comments:'댓글', like:'추천', edit:'수정', del:'삭제'};
  const author = contentAuthor(d);
  const aKind = authorKind(d);
  const likeLabel = esc(labels.like);
  const editIcon = `<svg class="post-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const delIcon = `<svg class="post-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
  box.innerHTML=`<div class="post-card-head final-post-head"><div class="post-kicker">${d.pinned?'📌 '+labels.pinned:labels.board}</div><h1>${esc(d.title||'')}</h1><div class="post-meta-grid final-meta-grid is-unified"><span class="meta-author meta-author-badge"><span class="author-badge is-${aKind}" title="${esc(authorKindLabel(aKind))}" aria-label="${esc(authorKindLabel(aKind))}">${authorKindIcon(aKind)}</span><em>${esc(labels.author)}</em><b>${esc(author)}</b></span><span class="meta-date"><i>🕒</i><em>${esc(labels.date)}</em><b>${esc(fmtShortDate(d.createdAt))}</b></span><span><i>👁</i><em>${esc(labels.views)}</em><b>${Number(d.viewCount||0)}</b></span><span><i>👍</i><em>${esc(labels.likes)}</em><b id="postLikeCount">${Number(d.likeCount||0)}</b></span><span><i>💬</i><em>${esc(labels.comments)}</em><b>${Number(d.commentCount||0)}</b></span></div></div><div class="post-body-content">${mdBodyHtml(d.content||'')}</div>${boardAttachmentsHtml(d.attachments)}<div class="post-actions community-post-actions"><button id="postLikeBtn" class="like-btn" type="button" aria-pressed="false">${boardLikeBtnInner(likeLabel,false)}</button>${manage?`<a class="post-action-btn post-edit-btn" href="${boardEditUrl(d.id)}">${editIcon}<span>${esc(labels.edit)}</span></a><button id="postDeleteBtn" class="post-action-btn post-delete-btn" type="button">${delIcon}<span>${esc(labels.del)}</span></button>`:''}</div>`;
  bindMdIn(box);
  hydrateBoardMidiPlayers(box);
  refreshBoardPostActions();
  if(!isAdminAuthor(d) && (d.uid||d.authorUid)){
    enrichRowsWithAuthorLicense([d]).then(rows=>{
      const enriched=rows[0];
      if(!enriched || !box.isConnected) return;
      const badge=box.querySelector('.meta-author .author-badge');
      if(!badge) return;
      const kind=authorKind(enriched);
      badge.className=`author-badge is-${kind}`;
      badge.title=authorKindLabel(kind);
      badge.setAttribute('aria-label', authorKindLabel(kind));
      badge.innerHTML=authorKindIcon(kind);
    }).catch(()=>{});
  }
}
async function incrementViewOnce(postId){
  if(!markContentViewOnce('board', postId)) return;
  try{ const {doc,updateDoc,increment}=firestoreApi; await updateDoc(doc(db,'boardPosts',postId),{viewCount:increment(1)}); }catch(e){ console.warn('view increment failed',e); }
}
function listenBoardPostDetail(){
  const id=getParam('id'); const box=$('boardPostDetail'); if(!box)return;
  if(!id){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  incrementViewOnce(id);
  listenDoc('boardPosts',id,renderBoardPost);
  listenBoardComments(id);
  const form=$('commentForm');
  if(form&&!form.dataset.bound){ form.dataset.bound='1'; form.addEventListener('submit',e=>createBoardComment(e,id,null)); }
}
function boardLikeBtnInner(label, liked){
  const text = liked
    ? (lang==='en' ? 'Liked' : lang==='ja' ? 'いいね済' : '추천됨')
    : label;
  return `<svg class="like-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v10M15.5 21H9a2 2 0 0 1-2-2v-7.2a2 2 0 0 1 .5-1.3l5.2-6.1a1.7 1.7 0 0 1 2.9 1.5L14.5 11H19a2 2 0 0 1 1.9 2.6l-1.4 5A2 2 0 0 1 17.6 21Z"/></svg><span class="like-btn-label">${esc(text)}</span>`;
}
async function refreshBoardPostActions(){
  const d=activeBoardPost; if(!d)return;
  const id=d.id;
  const likeBtn=$('postLikeBtn');
  if(likeBtn){
    likeBtn.onclick=()=>toggleBoardLike(id);
    const baseLabel = lang==='en'?'Like':lang==='ja'?'いいね':'추천';
    if(currentUser){
      try{
        const {doc,getDoc}=firestoreApi;
        const s=await getDoc(doc(db,'boardPosts',id,'likes',currentUser.uid));
        likedActivePost=s.exists();
        likeBtn.classList.toggle('liked',likedActivePost);
        likeBtn.setAttribute('aria-pressed', likedActivePost?'true':'false');
        likeBtn.innerHTML=boardLikeBtnInner(baseLabel, likedActivePost);
      }catch{}
    } else {
      likeBtn.classList.remove('liked');
      likeBtn.setAttribute('aria-pressed','false');
      likeBtn.innerHTML=boardLikeBtnInner(baseLabel, false);
    }
  }
  const del=$('postDeleteBtn'); if(del&&!del.dataset.bound){ del.dataset.bound='1'; del.onclick=()=>deleteBoardPost(id); }
}
async function toggleBoardLike(postId){
  if(!currentUser)return alert(tr('need_login'));
  const {doc,getDoc,setDoc,deleteDoc,updateDoc,increment,serverTimestamp}=firestoreApi;
  const likeRef=doc(db,'boardPosts',postId,'likes',currentUser.uid);
  const postRef=doc(db,'boardPosts',postId);
  try{
    const snap=await getDoc(likeRef);
    if(snap.exists()){ await deleteDoc(likeRef); await updateDoc(postRef,{likeCount:increment(-1)}); }
    else { await setDoc(likeRef,{uid:currentUser.uid,email:boardEmail(),createdAt:serverTimestamp()}); await updateDoc(postRef,{likeCount:increment(1)}); }
    refreshBoardPostActions();
  }catch(e){ alert(e.message); }
}
async function deleteBoardPost(postId){
  if(!confirm(tr('confirm_delete')))return;
  try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',postId),{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true}); location.href='./board.html'; }catch(e){ alert(e.message); }
}
function listenBoardComments(postId){
  const {collection,onSnapshot,query,where}=firestoreApi;
  const q=query(collection(db,'boardPosts',postId,'comments'),where('visible','==',true));
  addPublicUnsub(onSnapshot(q, snap=>{
    activeBoardComments=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderBoardComments(postId);
    if(!boardCommentFocusDone && getParam('focus')==='comment'){
      boardCommentFocusDone = true;
      requestAnimationFrame(()=>focusBoardComment(getParam('cid')||''));
    }
  }, err=>{ $('commentList') && ($('commentList').innerHTML=`<div class="empty-card">${esc(err.message)}</div>`); }));
}
function renderBoardComments(postId){
  const box=$('commentList'); if(!box)return;
  const rows=(activeBoardComments||[]).filter(x=>x.deleted!==true).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  const tops=rows.filter(x=>!x.parentId);
  const repliesBy={}; rows.filter(x=>x.parentId).forEach(x=>{ (repliesBy[x.parentId] ||= []).push(x); });
  $('commentTitle') && ($('commentTitle').textContent=`댓글 ${rows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=tops.map(c=>renderCommentCard(postId,c,false)+(repliesBy[c.id]||[]).map(r=>renderCommentCard(postId,r,true)).join('')).join('');
  bindCommentActions(postId,box);
}
function renderCommentCard(postId,c,isReply){
  const manage=canManageRecord(c);
  return `<div class="comment-card community-comment-card ${isReply?'reply-child':''}" id="comment-${esc(c.id)}" data-comment-id="${esc(c.id)}"><div class="comment-avatar">${esc(authorAvatarInitial(c))}</div><div class="comment-main"><div class="comment-head"><span>${isReply?'↳ ':''}${esc(contentAuthor(c))}</span><span>${esc(fmtDate(c.createdAt))}${c.edited?' · 수정됨':''}</span></div><div class="comment-body">${nl2br(c.content||'')}</div><div class="comment-actions"><button class="secondary mini-btn" data-comment-reply="${esc(c.parentId||c.id)}">답글</button>${manage?`<button class="secondary mini-btn" data-comment-edit="${esc(c.id)}">수정</button><button class="secondary mini-btn danger-btn" data-comment-delete="${esc(c.id)}">삭제</button>`:''}</div></div></div>`;
}
function bindCommentActions(postId,root){
  root.querySelectorAll('[data-comment-reply]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.onclick=()=>openReplyBox(postId,btn.dataset.commentReply,btn.closest('.comment-card')); });
  root.querySelectorAll('[data-comment-edit]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.onclick=()=>editBoardComment(postId,btn.dataset.commentEdit); });
  root.querySelectorAll('[data-comment-delete]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.onclick=()=>deleteBoardComment(postId,btn.dataset.commentDelete); });
}
function openReplyBox(postId,parentId,host){
  if(!currentUser)return alert(tr('need_login'));
  host.querySelector('.inline-reply')?.remove();
  const form=document.createElement('form'); form.className='inline-reply'; form.innerHTML=`<textarea rows="2" placeholder="답글을 입력하세요"></textarea><button class="primary" type="submit">답글 등록</button>`;
  form.onsubmit=e=>createBoardComment(e,postId,parentId,form.querySelector('textarea'));
  host.appendChild(form);
}

const NOTIFY_BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/></svg>';


function defaultNotifyPrefs(){
  return { inApp:true, email:false, boardComment:true, ticketReply:true, licenseChange:true, notice:true, patchNote:true };
}
function normalizeNotifyPrefs(raw){
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    inApp: src.inApp !== false,
    email: src.email === true,
    boardComment: src.boardComment !== false,
    ticketReply: src.ticketReply !== false,
    licenseChange: src.licenseChange !== false,
    notice: src.notice !== false,
    patchNote: src.patchNote !== false
  };
}
function isAdminMessageNotify(n){
  if(!n) return false;
  if(n.type === 'admin_message') return true;
  if(n.adminMessage === true) return true;
  const title = String(n.postTitle || '').trim();
  if(title === '관리자 쪽지' || title === 'Admin message' || title === '管理者メッセージ') return true;
  return false;
}
function notifyCategory(n){
  const type = String(n?.type || '');
  const src = String(n?.sourceType || n?.category || '');
  if (n?.category) return String(n.category);
  if (type === 'payment_complete' || src.startsWith('payment_') || src === 'refund_review' || src === 'payment_cancel' || src === 'payment_partial_refund') return 'payment';
  if (type === 'license_change') return src.startsWith('payment_') || src === 'refund_review' ? 'payment' : 'license';
  if (type === 'ticket_reply') return 'inquiry';
  if (type === 'admin_message') return 'message';
  if (type === 'board_comment') return 'community';
  if (type === 'notice' || type === 'patch_note') return 'announcement';
  if (type.startsWith('credit_') || type.startsWith('reservation_') || type === 'queue_done') return 'system';
  return 'other';
}
function isNotifyTypeEnabled(n){
  const type = String(n?.type || n || '');
  const src = String(n?.sourceType || '');
  const p = userNotifyPrefs || defaultNotifyPrefs();
  if(p.inApp === false) return false;
  if(type === 'board_comment') return p.boardComment !== false;
  if(type === 'ticket_reply') return p.ticketReply !== false;
  if(type === 'license_change'){
    if (src.startsWith('payment_') || src === 'refund_review' || src === 'payment_cancel' || src === 'payment_partial_refund') return p.licenseChange !== false;
    return p.licenseChange !== false;
  }
  if(type === 'payment_complete') return p.licenseChange !== false;
  if(type === 'admin_message') return true;
  if(type === 'notice') return p.notice !== false;
  if(type === 'patch_note') return p.patchNote !== false;
  if(type.startsWith('credit_') || type.startsWith('reservation_') || type === 'queue_done') return true;
  return true;
}
function visibleUserNotifications(rows){
  return (rows||[]).filter(n => {
    if(isAdminMessageNotify(n)) return (userNotifyPrefs || defaultNotifyPrefs()).inApp !== false;
    return isNotifyTypeEnabled(n);
  });
}
function filteredUserNotifications(rows){
  const visible = visibleUserNotifications(rows);
  if(userNotifyFilter === 'all') return visible;
  if(userNotifyFilter === 'other'){
    const main = new Set(['payment','license','inquiry','message','community','announcement']);
    return visible.filter(n => !main.has(notifyCategory(n)));
  }
  if(userNotifyFilter === 'inquiry'){
    return visible.filter(n => {
      const c = notifyCategory(n);
      return c === 'inquiry' || c === 'message';
    });
  }
  return visible.filter(n => notifyCategory(n) === userNotifyFilter);
}
async function saveUserNotifyPrefs(next){
  if(!currentUser || !firestoreApi?.setDoc) return;
  userNotifyPrefs = normalizeNotifyPrefs(next);
  const {doc, setDoc, serverTimestamp} = firestoreApi;
  await setDoc(doc(db,'users',currentUser.uid), { notifyPrefs:userNotifyPrefs, updatedAt:serverTimestamp() }, {merge:true});
  if(currentUserDoc) currentUserDoc.notifyPrefs = userNotifyPrefs;
  // refresh bell counts with new prefs
  const visible = visibleUserNotifications(userNotifyRows);
  updateNotifyBellBadge(visible.filter(n => n.read !== true).length);
  renderNotifyPanelList();
}
function topbarLangInsertRef(){
  // langBtn may live inside #topbarLangWrap — never insertBefore(langBtn) on .actions
  const wrap = $('topbarLangWrap');
  if(wrap) return wrap;
  return $('langBtn');
}
function ensureNotifyBell(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions) return null;
  ensureTopbarLicensePeriod();
  let wrap = $('topbarNotify');
  if(wrap) return wrap;
  wrap = document.createElement('div');
  wrap.className = 'topbar-notify';
  wrap.id = 'topbarNotify';
  wrap.hidden = true;
  wrap.innerHTML = `<button type="button" class="topbar-notify-btn" id="notifyBellBtn" aria-label="${esc(tr('notify_aria'))}" aria-expanded="false">${NOTIFY_BELL_SVG}<span class="topbar-notify-badge" id="notifyBellBadge" hidden>0</span></button><div class="topbar-notify-panel" id="notifyPanel" hidden><div class="topbar-notify-head"><b>${esc(tr('notify_title'))}</b><div class="topbar-notify-head-actions"><button type="button" class="topbar-notify-mark" id="notifyMarkAllRead">${esc(tr('notify_mark_all'))}</button><button type="button" class="topbar-notify-clear" id="notifyClearAll">${esc(tr('notify_clear_all'))}</button></div></div><div class="topbar-notify-filters" id="notifyFilters" role="tablist" aria-label="${esc(tr('notify_title'))}"><button type="button" class="topbar-notify-filter is-active" data-notify-filter="all" role="tab">${esc(tr('notify_filter_all'))}</button><button type="button" class="topbar-notify-filter" data-notify-filter="payment" role="tab">${esc(tr('notify_filter_payment'))}</button><button type="button" class="topbar-notify-filter" data-notify-filter="license" role="tab">${esc(tr('notify_filter_license'))}</button><button type="button" class="topbar-notify-filter" data-notify-filter="inquiry" role="tab">${esc(tr('notify_filter_inquiry'))}</button><button type="button" class="topbar-notify-filter" data-notify-filter="community" role="tab">${esc(tr('notify_filter_community'))}</button><button type="button" class="topbar-notify-filter" data-notify-filter="other" role="tab">${esc(tr('notify_filter_other'))}</button></div><div class="topbar-notify-list" id="notifyList"><div class="topbar-notify-empty">${esc(tr('notify_empty'))}</div></div></div>`;
  const langRef = topbarLangInsertRef();
  const periodEl = $('topbarLicensePeriod');
  if(periodEl && periodEl.parentNode === actions){
    actions.insertBefore(wrap, periodEl.nextSibling);
  } else if(langRef && langRef.parentNode === actions){
    actions.insertBefore(wrap, langRef);
  } else {
    actions.insertBefore(wrap, actions.firstChild);
  }
  const bell = $('notifyBellBtn');
  bell?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleNotifyPanel(); });
  $('notifyMarkAllRead')?.addEventListener('click', (e)=>{ e.stopPropagation(); markAllNotificationsRead(); });
  $('notifyClearAll')?.addEventListener('click', (e)=>{ e.stopPropagation(); clearAllNotifications(); });
  wrap.querySelectorAll('[data-notify-filter]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      userNotifyFilter = btn.dataset.notifyFilter || 'all';
      wrap.querySelectorAll('[data-notify-filter]').forEach(b=>b.classList.toggle('is-active', b === btn));
      renderNotifyPanelList();
    });
  });
  if(!document.body.dataset.notifyOutsideBound){
    document.body.dataset.notifyOutsideBound = '1';
    document.addEventListener('click', (e)=>{
      if(!userNotifyPanelOpen) return;
      if(e.target.closest?.('#topbarNotify')) return;
      closeNotifyPanel();
    });
  }
  return wrap;
}
function ensureTopbarLicensePeriod(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions) return null;
  let el = $('topbarLicensePeriod');
  if(el) return el;
  el = document.createElement('span');
  el.id = 'topbarLicensePeriod';
  el.className = 'topbar-license-period';
  el.hidden = true;
  const notify = $('topbarNotify');
  const langRef = topbarLangInsertRef();
  if(notify && notify.parentNode === actions) actions.insertBefore(el, notify);
  else if(langRef && langRef.parentNode === actions) actions.insertBefore(el, langRef);
  else actions.insertBefore(el, actions.firstChild);
  return el;
}
function updateTopbarLicensePeriod(d){
  const el = ensureTopbarLicensePeriod();
  if(!el) return;
  if(!currentUser || !d){
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('title');
    return;
  }
  const plan = normalizePlan(d);
  const status = normalizeStatus(d);
  if(plan !== 'period' || status === 'banned'){
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('title');
    return;
  }
  const start = d.startsAt ? fmtListDate(d.startsAt) : '';
  const end = d.expiresAt ? fmtListDate(d.expiresAt) : '';
  if(!start && !end){
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const label = start && end ? `${start} ~ ${end}` : (end ? `~ ${end}` : start);
  el.hidden = false;
  el.textContent = label;
  el.title = lang==='en' ? `Period license: ${label}` : lang==='ja' ? `期間制: ${label}` : `기간제: ${label}`;
  el.classList.toggle('is-expired', status==='expired');
}
function setNotifyBellVisible(show){
  const wrap = ensureNotifyBell();
  if(!wrap) return;
  wrap.hidden = !show;
  if(!show){
    closeNotifyPanel();
    updateNotifyBellBadge(0);
  }
}
function updateNotifyBellBadge(count){
  const badge = $('notifyBellBadge');
  if(!badge) return;
  const n = Math.max(0, Number(count)||0);
  if(n > 0){
    badge.hidden = false;
    badge.textContent = String(n > 99 ? '99+' : n);
  } else {
    badge.hidden = true;
    badge.textContent = '';
  }
}
function stopUserNotifications(){
  if(userNotifyUnsub){
    try{ userNotifyUnsub(); }catch{}
    userNotifyUnsub = null;
  }
  userNotifyRows = [];
  updateNotifyBellBadge(0);
  renderNotifyPanelList();
}
function listenUserNotifications(){
  stopUserNotifications();
  ensureNotifyBell();
  if(!currentUser || !firestoreApi?.onSnapshot){
    setNotifyBellVisible(false);
    return;
  }
  setNotifyBellVisible(true);
  const {collection, query, orderBy, limit, onSnapshot} = firestoreApi;
  const q = query(collection(db,'users',currentUser.uid,'notifications'), orderBy('createdAt','desc'), limit(30));
  userNotifyUnsub = onSnapshot(q, snap => {
    userNotifyRows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const visible = visibleUserNotifications(userNotifyRows);
    const unread = visible.filter(n => n.read !== true).length;
    updateNotifyBellBadge(unread);
    renderNotifyPanelList();
  }, err => {
    console.error('user notifications', err);
  });
}
function toggleNotifyPanel(){
  if(userNotifyPanelOpen) closeNotifyPanel();
  else openNotifyPanel();
}
function openNotifyPanel(){
  ensureNotifyBell();
  try{ closeTopbarProfilePanel(); }catch{}
  const panel = $('notifyPanel');
  const bell = $('notifyBellBtn');
  if(!panel) return;
  userNotifyPanelOpen = true;
  panel.hidden = false;
  bell?.setAttribute('aria-expanded','true');
  renderNotifyPanelList();
}
function closeNotifyPanel(){
  userNotifyPanelOpen = false;
  const panel = $('notifyPanel');
  if(panel) panel.hidden = true;
  $('notifyBellBtn')?.setAttribute('aria-expanded','false');
}
function notifyItemLine(n){
  const type = n.type || 'board_comment';
  const src = String(n.sourceType || '');
  const name = n.actorName || (type === 'board_comment' ? 'User' : BRAND_AUTHOR);
  if(isAdminMessageNotify(n)) return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_admin_message'))}`;
  if(type === 'payment_complete') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_payment_complete'))}`;
  if(type === 'ticket_reply') return `<b>${esc(name)}</b> · ${esc(tr('notify_ticket_reply'))}`;
  if(type === 'license_change'){
    if(src === 'payment_cancel') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_payment_cancel'))}`;
    if(src === 'payment_partial_refund') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_payment_partial'))}`;
    if(src === 'refund_review') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_refund_review'))}`;
    return `<b>${esc(name)}</b> · ${esc(tr('notify_license_change'))}`;
  }
  if(type === 'notice') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_notice'))}`;
  if(type === 'patch_note') return `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_patch_note'))}`;
  if(type === 'credit_purchase') return `<b>${esc(tr('notify_credit_purchase'))}</b>`;
  if(type === 'credit_admin_grant') return `<b>${esc(tr('notify_credit_grant'))}</b>`;
  if(type === 'credit_admin_deduct') return `<b>${esc(tr('notify_credit_deduct'))}</b>`;
  if(type === 'reservation_complete' || type === 'queue_done') return `<b>${esc(tr('notify_reservation_complete'))}</b>`;
  if(type === 'reservation_failed') return `<b>${esc(tr('notify_reservation_failed'))}</b>`;
  return `<b>${esc(name)}</b>${esc(tr('notify_board_comment'))}`;
}
function notifyItemHtml(n){
  const type = n.type || 'board_comment';
  const title = n.postTitle || '';
  const preview = notifyPreviewText(n);
  const when = fmtNotifyWhen(n.createdAt);
  const unread = n.read !== true ? ' is-unread' : '';
  const line = notifyItemLine(n);
  const adminNote = isAdminMessageNotify(n);
  const genericAdminTitle = title === '관리자 쪽지' || title === 'Admin message' || title === '管理者メッセージ';
  const showTitle = title && !(adminNote && genericAdminTitle);
  return `<div class="topbar-notify-item${unread}" data-notify-id="${esc(n.id)}" data-notify-category="${esc(notifyCategory(n))}">
    <button type="button" class="topbar-notify-item-body" data-notify-open="${esc(n.id)}">
      <span class="topbar-notify-item-main">${line}</span>
      ${showTitle?`<span class="topbar-notify-item-title">${esc(title)}</span>`:''}
      ${preview?`<span class="topbar-notify-item-preview">${esc(preview)}</span>`:''}
      <span class="topbar-notify-item-time">${esc(when)}</span>
    </button>
    <button type="button" class="topbar-notify-item-del" data-notify-del="${esc(n.id)}" aria-label="${esc(tr('notify_delete_aria'))}">×</button>
  </div>`;
}
function notifyAmountValue(n){
  const a = Number(n?.amount);
  return Number.isFinite(a) ? Math.abs(a) : 0;
}
function notifyPreviewText(n){
  const type = n?.type || '';
  const amount = notifyAmountValue(n);
  const fill = (key) => String(tr(key) || '').replace('{n}', String(amount));
  if(type === 'credit_purchase' && amount) return fill('notify_credit_purchase_body');
  if(type === 'credit_admin_grant' && amount) return fill('notify_credit_grant_body');
  if(type === 'credit_admin_deduct' && amount) return fill('notify_credit_deduct_body');
  return n?.preview || '';
}
function renderNotifyPanelList(){
  const list = $('notifyList');
  if(!list) return;
  if(!currentUser){
    list.innerHTML = `<div class="topbar-notify-empty">${esc(tr('notify_login'))}</div>`;
    return;
  }
  const rows = filteredUserNotifications(userNotifyRows);
  if(!rows.length){
    list.innerHTML = `<div class="topbar-notify-empty">${esc(tr('notify_empty'))}</div>`;
    return;
  }
  list.innerHTML = rows.map(notifyItemHtml).join('');
  list.querySelectorAll('[data-notify-open]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>openNotification(btn.dataset.notifyOpen));
  });
  list.querySelectorAll('[data-notify-del]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      deleteNotification(btn.dataset.notifyDel);
    });
  });
}
async function markNotificationRead(notifyId, n=null){
  if(!currentUser || !notifyId || !firestoreApi?.updateDoc) return false;
  const row = n || userNotifyRows.find(x => x.id === notifyId) || null;
  const {doc, updateDoc, serverTimestamp} = firestoreApi;
  const run = () => updateDoc(doc(db,'users',currentUser.uid,'notifications',notifyId), {read:true, readAt:serverTimestamp()});
  try{
    await run();
  }catch(e){
    try{
      await run();
    }catch(e2){
      console.error(e2);
      return false;
    }
  }
  if(row?.type === 'ticket_reply' && row.ticketId){
    await markTicketReplyRead(row.ticketId);
  }
  return true;
}
function notifyTargetHref(n){
  const base = window.MIDIAI_BASE_PATH || './';
  const raw = String(n?.targetUrl || '').trim();
  if(raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if(raw.startsWith('/')) return raw;
  if(raw) return `${base}${raw.replace(/^\.\//, '')}`;
  const type = n?.type || '';
  const src = String(n?.sourceType || '');
  const cat = notifyCategory(n);
  if(cat === 'payment' || type === 'payment_complete' || src.startsWith('payment_') || src === 'refund_review') return `${base}account.html#orders`;
  if(type === 'license_change') return `${base}account.html`;
  if(type === 'credit_purchase' || type === 'credit_admin_grant' || type === 'credit_admin_deduct') return `${base}account.html#plan`;
  if(type === 'reservation_complete' || type === 'reservation_failed' || type === 'queue_done') return `${base}account.html#plan`;
  if(type === 'ticket_reply' && n.ticketId) return `${base}ticket.html?id=${encodeURIComponent(n.ticketId)}&focus=reply`;
  if(type === 'notice' && n.postId) return `${base}notice.html?id=${encodeURIComponent(n.postId)}`;
  if(type === 'patch_note' && n.postId) return `${base}patch-note.html?id=${encodeURIComponent(n.postId)}`;
  const postId = n?.postId || '';
  const commentId = n?.commentId || '';
  if(postId){
    let href = `${base}board-post.html?id=${encodeURIComponent(postId)}`;
    if(commentId) href += `&focus=comment&cid=${encodeURIComponent(commentId)}`;
    return href;
  }
  return '';
}
async function openNotification(notifyId){
  if(!currentUser || !notifyId) return;
  const n = userNotifyRows.find(x => x.id === notifyId);
  if(!n) return;
  await markNotificationRead(notifyId, n);
  closeNotifyPanel();
  if(isAdminMessageNotify(n)){
    openAdminMessageViewer(n);
    return;
  }
  const href = notifyTargetHref(n);
  if(!href) return;
  const postId = n.postId || '';
  const commentId = n.commentId || '';
  if(page === 'board-post.html' && getParam('id') === postId && href.includes('board-post.html')){
    focusBoardComment(commentId);
    return;
  }
  location.href = href;
}
function openAdminMessageViewer(n){
  const title = String(n?.postTitle || tr('notify_admin_message')).trim() || tr('notify_admin_message');
  const body = String(n?.preview || '').trim();
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-backdrop';
  overlay.innerHTML = `<div class="edit-modal admin-message-viewer" role="dialog" aria-modal="true" aria-label="${esc(tr('notify_admin_message'))}">
    <div class="edit-modal-head"><h3>${esc(tr('notify_admin_message'))}</h3><button type="button" class="edit-modal-x" aria-label="close">×</button></div>
    <div class="edit-modal-body">
      <div class="admin-message-view-title">${esc(title)}</div>
      <div class="admin-message-view-body">${esc(body || '(내용 없음)')}</div>
    </div>
    <div class="edit-modal-actions"><button type="button" class="primary" data-close>확인</button></div>
  </div>`;
  const close = ()=>{ overlay.remove(); };
  overlay.querySelector('.edit-modal-x')?.addEventListener('click', close);
  overlay.querySelector('[data-close]')?.addEventListener('click', close);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) close(); });
  document.body.appendChild(overlay);
}
async function markAllNotificationsRead(){
  if(!currentUser || !firestoreApi?.updateDoc) return;
  const unread = filteredUserNotifications(userNotifyRows).filter(n => n.read !== true);
  if(!unread.length) return;
  try{
    await Promise.all(unread.map(n => markNotificationRead(n.id, n)));
  }catch(e){ console.error(e); alert(e.message||e); }
}
async function deleteNotification(notifyId){
  if(!currentUser || !notifyId || !firestoreApi?.deleteDoc) return;
  try{
    const {doc, deleteDoc} = firestoreApi;
    await deleteDoc(doc(db,'users',currentUser.uid,'notifications',notifyId));
  }catch(e){
    console.error(e);
    alert(e.message||e);
  }
}
async function clearAllNotifications(){
  if(!currentUser || !firestoreApi?.getDocs || !firestoreApi?.deleteDoc) return;
  if(!confirm(tr('notify_clear_confirm'))) return;
  try{
    const {collection, getDocs, deleteDoc} = firestoreApi;
    const snap = await getDocs(collection(db,'users',currentUser.uid,'notifications'));
    const docs = snap.docs || [];
    const chunk = 40;
    for(let i=0;i<docs.length;i+=chunk){
      await Promise.all(docs.slice(i,i+chunk).map(d=>deleteDoc(d.ref)));
    }
  }catch(e){
    console.error(e);
    alert(e.message||e);
  }
}
async function createUserNotification(ownerUid, data={}){
  if(!ownerUid || !firestoreApi || !currentUser){
    throw new Error('notification create unavailable');
  }
  const {collection, addDoc, doc, getDoc, setDoc, serverTimestamp} = firestoreApi;
  const type = data.type || 'general';
  const previewMax = type === 'admin_message' ? 500 : 160;
  const payload = {
    type,
    sourceType: data.sourceType || type,
    sourceId: data.sourceId || data.replyId || data.commentId || data.ticketId || data.postId || '',
    postId: data.postId || '',
    commentId: data.commentId || '',
    parentId: data.parentId || '',
    ticketId: data.ticketId || '',
    replyId: data.replyId || '',
    plan: data.plan || '',
    status: data.status || '',
    actorUid: data.actorUid != null ? data.actorUid : (currentUser.uid || ''),
    actorName: data.actorName != null ? data.actorName : (boardDisplayName() || BRAND_AUTHOR),
    postTitle: String(data.postTitle || data.title || '').slice(0,120),
    preview: String(data.preview || '').slice(0, previewMax),
    read: false,
    createdAt: serverTimestamp()
  };
  if(data.category) payload.category = String(data.category);
  if(data.targetUrl) payload.targetUrl = String(data.targetUrl);
  if(data.paymentId) payload.paymentId = String(data.paymentId);
  if(data.adminMessage === true) payload.adminMessage = true;
  if(!payload.actorUid) throw new Error('notification actorUid missing');
  const id = notificationDocId(data);
  if(id && getDoc && setDoc){
    const ref = doc(db,'users',ownerUid,'notifications',id);
    const existing = await getDoc(ref);
    if(existing.exists()) return id;
    await setDoc(ref, payload);
    return id;
  }
  if(!addDoc) throw new Error('notification create unavailable');
  const ref = await addDoc(collection(db,'users',ownerUid,'notifications'), payload);
  return ref.id;
}
function notificationDocId(data={}){
  if(data.id) return String(data.id).slice(0,140);
  const type = data.type || '';
  if(type === 'ticket_reply' && data.replyId) return `ticket_reply_${data.replyId}`.slice(0,140);
  if(type === 'board_comment' && data.commentId) return `board_comment_${data.commentId}`.slice(0,140);
  if(type === 'license_change'){
    const plan = String(data.plan || 'plan');
    const status = String(data.status || 'status');
    return `license_change_${plan}_${status}`.slice(0,140);
  }
  return '';
}
async function notifyBoardPostOwner({postId, commentId, content, parentId}={}){
  if(!currentUser || !postId || !firestoreApi) return;
  try{
    const {doc, getDoc} = firestoreApi;
    let post = (activeBoardPost && activeBoardPost.id === postId) ? activeBoardPost : null;
    if(!post){
      const snap = await getDoc(doc(db,'boardPosts',postId));
      if(!snap.exists()) return;
      post = {id:snap.id, ...snap.data()};
    }
    const ownerUid = post.uid || post.authorUid || '';
    if(!ownerUid || ownerUid === currentUser.uid) return;
    await createUserNotification(ownerUid, {
      type:'board_comment',
      category: 'community',
      postId,
      commentId: commentId || '',
      parentId: parentId || '',
      actorName: boardDisplayName(),
      postTitle: post.title || '',
      preview: content || ''
    });
  }catch(e){
    console.error('notifyBoardPostOwner', e);
  }
}
async function notifyTicketOwnerReply(ticketId, content, replyId){
  if(!isAdminUser || !ticketId || !firestoreApi) return;
  try{
    const {doc, getDoc} = firestoreApi;
    const snap = await getDoc(doc(db,'supportTickets',ticketId));
    if(!snap.exists()) return;
    const t = snap.data() || {};
    const ownerUid = t.uid || '';
    if(!ownerUid || ownerUid === currentUser?.uid) return;
    await createUserNotification(ownerUid, {
      type:'ticket_reply',
      category: 'inquiry',
      targetUrl: `/ticket.html?id=${encodeURIComponent(ticketId)}&focus=reply`,
      ticketId,
      replyId: replyId || '',
      sourceId: replyId || ticketId,
      actorName: BRAND_AUTHOR,
      postTitle: t.title || '',
      preview: content || ''
    });
  }catch(e){
    console.error('notifyTicketOwnerReply', e);
  }
}
async function notifyLicenseChange(uid, {plan='', status=''}={}){
  if(!uid || !firestoreApi) return false;
  if(!isAdminUser){
    console.warn('notifyLicenseChange skipped: not admin');
    return false;
  }
  if(!currentUser){
    console.warn('notifyLicenseChange skipped: no currentUser');
    return false;
  }
  const planLabel = adminLicenseTypeLabel(plan || 'trial');
  const statusLabel = adminLicenseStatusLabel(status || 'active');
  try{
    const id = await createUserNotification(uid, {
      type:'license_change',
      sourceType: 'admin_license',
      category: 'license',
      targetUrl: '/account.html',
      plan: plan || '',
      status: status || '',
      actorName: BRAND_AUTHOR,
      postTitle: planLabel,
      preview: `${statusLabel}${plan ? ` · ${planLabel}` : ''}`
    });
    console.info('license notify created', {uid, id, plan, status});
    return !!id;
  }catch(e){
    console.error('notifyLicenseChange', e);
    try{ adminFlash(`라이선스 알림 실패: ${e.message||e}`); }catch{}
    throw e;
  }
}
async function notifyAdminAppMessage(uid, {title='', body=''}={}){
  if(!uid || !firestoreApi) return false;
  if(!isAdminUser || !currentUser) throw new Error(tr('no_permission') || '권한 없음');
  const msgTitle = String(title || '').trim() || tr('notify_admin_message');
  const msgBody = String(body || '').trim();
  if(!msgBody) throw new Error('쪽지 내용을 입력해 주세요.');
  const id = await createUserNotification(uid, {
    type: 'admin_message',
    category: 'message',
    adminMessage: true,
    actorName: BRAND_AUTHOR,
    postTitle: msgTitle.slice(0, 120),
    preview: msgBody
  });
  return !!id;
}
function openAdminMessageComposer({count=1, recipients=null}={}){
  const list = Array.isArray(recipients) && recipients.length
    ? recipients
    : [{ uid: '', displayName: count > 1 ? `선택된 사용자 ${count}명` : '사용자', email: '' }];
  return openBulkMessageComposer({
    channel: 'app_message',
    recipients: list
  }).then((result) => {
    if(!result || !result.subject) return null;
    return { title: result.subject, body: result.body };
  });
}
async function adminSendAppMessage(uid){
  if(!isAdminUser || !uid) return;
  const row = findAdminUserRow(uid);
  await openBulkMessageComposer({
    channel: 'app_message',
    recipients: [{
      uid,
      displayName: row?.displayName || 'Google User',
      email: row?.email || ''
    }],
    onSend: async (draft) => {
      await notifyAdminAppMessage(uid, { title: draft.subject, body: draft.body });
      adminFlash('쪽지 전송 완료');
      pushAdminCrmFeed('앱 쪽지', `${draft.subject} · ${draft.body.slice(0,30)}`, uid);
      writeAdminAuditLog({
        targetUserId: uid,
        targetEmail: row?.email || '',
        category: 'message',
        action: '쪽지 발송',
        before: null,
        after: { title: draft.subject, body: draft.body.slice(0,500) },
        result: 'success',
        summary: draft.subject
      });
      return { ok: true };
    }
  });
}
function focusBoardComment(commentId){
  const root = $('commentList') || document;
  const el = commentId
    ? root.querySelector?.(`[data-comment-id="${CSS.escape(commentId)}"]`)
    : root;
  const target = el || $('commentList') || $('commentForm');
  if(!target) return;
  try{ target.scrollIntoView({behavior:'smooth', block:'center'}); }catch{ target.scrollIntoView(true); }
  target.classList?.add?.('is-notify-focus');
  setTimeout(()=>target.classList?.remove?.('is-notify-focus'), 1600);
}
function maybeFocusBoardCommentFromQuery(){
  if(page !== 'board-post.html') return;
  if(getParam('focus') !== 'comment') return;
  if(boardCommentFocusDone) return;
  const cid = getParam('cid') || '';
  setTimeout(()=>{ if(!boardCommentFocusDone){ boardCommentFocusDone = true; focusBoardComment(cid); } }, 500);
}

async function createBoardComment(e,postId,parentId,customTextarea){
  e.preventDefault();
  if(!currentUser)return alert(tr('need_login'));
  const textarea=customTextarea||$('commentContent');
  const content=textarea.value.trim(); if(!content)return;
  const {collection,addDoc,doc,updateDoc,increment,serverTimestamp}=firestoreApi;
  try{
    const commentRef = await addDoc(collection(db,'boardPosts',postId,'comments'),{uid:currentUser.uid,email:boardEmail(),displayName:boardDisplayName(),content,parentId:parentId||'',visible:true,deleted:false,edited:false,...(isAdminUser?{authorRole:'admin'}:{}),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await updateDoc(doc(db,'boardPosts',postId),{commentCount:increment(1),updatedAt:serverTimestamp()});
    textarea.value=''; customTextarea?.closest('form')?.remove();
    notifyBoardPostOwner({postId, commentId:commentRef.id, content, parentId:parentId||''}).catch(err=>console.error('notifyBoardPostOwner', err));
  }catch(err){ alert(err.message); }
}
async function editBoardComment(postId,commentId){
  const c=(activeBoardComments||[]).find(x=>x.id===commentId); if(!c)return;
  const content=prompt('댓글 수정',c.content||''); if(content===null)return;
  try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',postId,'comments',commentId),{content:content.trim(),edited:true,updatedAt:serverTimestamp()},{merge:true}); }catch(e){ alert(e.message); }
}
async function deleteBoardComment(postId,commentId){
  if(!confirm(tr('confirm_delete')))return;
  try{ const {doc,setDoc,updateDoc,increment,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',postId,'comments',commentId),{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true}); await updateDoc(doc(db,'boardPosts',postId),{commentCount:increment(-1),updatedAt:serverTimestamp()}); }catch(e){ alert(e.message); }
}
function renderAdminBoardTable(){
  if($('adminCmsList')){ renderAdminCmsTable(); return; }
  const box=$('adminBoardList'); if(!box||!isAdminUser)return;
  const q=($('adminBoardSearch')?.value||'').trim().toLowerCase(); const st=$('adminBoardStatus')?.value||'all';
  let rows=(adminBoardRows||[]).filter(x=>x.deleted!==true).filter(x=>{ if(st==='visible'&&x.visible===false)return false; if(st==='hidden'&&x.visible!==false)return false; if(st==='pinned'&&x.pinned!==true)return false; const hay=[x.title,x.content,x.displayName,x.email,x.uid].join(' ').toLowerCase(); return !q||hay.includes(q); }).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  const activeCount=(adminBoardRows||[]).filter(x=>x.deleted!==true).length;
  $('adminBoardCount') && ($('adminBoardCount').textContent=`${rows.length} / ${activeCount}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=`<table class="admin-table"><thead><tr><th>제목</th><th>상태</th><th>작성자</th><th>통계</th><th>관리</th></tr></thead><tbody>${rows.map(x=>`<tr class="${x.visible===false?'board-admin-hidden':''}"><td><b>${x.pinned?'📌 ':''}${esc(x.title||'-')}</b><small>${esc(String(x.content||'').slice(0,80))}</small></td><td>${x.visible===false?'<span class="badge none">숨김</span>':'<span class="badge active">공개</span>'}</td><td>${esc(contentAuthor(x))}</td><td>조회 ${Number(x.viewCount||0)} · 추천 ${Number(x.likeCount||0)} · 댓글 ${Number(x.commentCount||0)}</td><td><div class="table-actions"><a class="secondary mini-btn" href="${boardPostUrl(x.id)}">보기</a><a class="secondary mini-btn" href="${boardEditUrl(x.id)}">수정</a><button class="secondary mini-btn" data-admin-board-pin="${esc(x.id)}:${x.pinned?'0':'1'}">${x.pinned?'고정해제':'고정'}</button><button class="secondary mini-btn danger-btn" data-admin-board-delete="${esc(x.id)}">${tr('del')}</button></div></td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('[data-admin-board-delete]').forEach(b=>{ if(b.dataset.bound)return; b.dataset.bound='1'; b.onclick=()=>adminDeleteBoardPost(b.dataset.adminBoardDelete); });
  box.querySelectorAll('[data-admin-board-pin]').forEach(b=>{ if(b.dataset.bound)return; b.dataset.bound='1'; b.onclick=()=>{ const [id,val]=b.dataset.adminBoardPin.split(':'); adminPinBoardPost(id,val==='1'); }; });
}
async function adminDeleteBoardPost(id){
  if(!isAdminUser) { alert(tr('no_permission')); return false; }
  if(!confirm(tr('confirm_delete'))) return false;
  await adminDeleteBoardPosts([id], null, true);
  return true;
}
async function adminDeleteBoardPosts(ids, confirmMsg, skipConfirm=false){
  if(!isAdminUser) return alert(tr('no_permission'));
  const list=(ids||[]).filter(Boolean);
  if(!list.length) return;
  if(!skipConfirm){
    const msg = confirmMsg || (list.length===1 ? tr('confirm_delete') : `선택한 ${list.length}개 글을 삭제할까요?`);
    if(!confirm(msg)) return;
  }
  try{
    const {doc,setDoc,collection,getDocs,serverTimestamp}=firestoreApi;
    for(const id of list){
      const commentsSnap=await getDocs(collection(db,'boardPosts',id,'comments'));
      await Promise.all(commentsSnap.docs.map(d=>setDoc(d.ref,{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true})));
      await setDoc(doc(db,'boardPosts',id),{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true});
      adminCrmPostSelected.delete(id);
    }
    adminFlash(list.length===1 ? tr('deleted') : `삭제 완료 · ${list.length}건`);
    pushAdminCrmFeed('작성글 삭제', `${list.length}건`, selectedAdminUid);
  }catch(e){ alert(e.message); }
}
async function adminPinBoardPost(id,pinned){ try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',id),{pinned,updatedAt:serverTimestamp()},{merge:true}); }catch(e){ alert(e.message); } }
function bindAdminBoardFilters(){ ['adminBoardSearch','adminBoardStatus'].forEach(id=>{ const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',renderAdminBoardTable); el.addEventListener('change',renderAdminBoardTable); }); }

async function adminAdd(collectionName,data){
  if(!isAdminUser){ alert('admin only'); return null; }
  const {collection,addDoc,serverTimestamp}=firestoreApi;
  const ref=await addDoc(collection(db,collectionName),{...data,visible:true,authorUid:currentUser.uid,authorRole:'admin',displayName:BRAND_AUTHOR,uid:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return ref.id;
}
let adminFlashTimer = 0;
function hideAdminFlash(){
  clearTimeout(adminFlashTimer);
  adminFlashTimer = 0;
  const box=$('adminSaveMsg');
  if(!box) return;
  box.classList.add('hidden');
  box.innerHTML='';
}
function adminFlash(html, opts={}){
  let box=$('adminSaveMsg');
  if(!box){
    box=document.createElement('div');
    box.id='adminSaveMsg';
    box.className='admin-flash';
    const host=$('admin')?.querySelector('.admin-panel') || document.querySelector('.hub-shell') || document.body;
    host.prepend(box);
  }
  box.innerHTML=html;
  box.classList.remove('hidden');
  clearTimeout(adminFlashTimer);
  adminFlashTimer = 0;
  if(opts.persist) return;
  const ms = Number(opts.ms);
  const delay = Number.isFinite(ms) && ms > 0 ? ms : 3200;
  adminFlashTimer = setTimeout(()=>hideAdminFlash(), delay);
}
window.__midiaiHideAdminFlash = hideAdminFlash;
function initForms(){
  $('ticketForm')?.addEventListener('submit',createTicket);
  // Enter in license fields → same path as float Save (avoids duplicate feed + save logic)
  $('adminLicenseForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!isAdminUser) return;
    if(!selectedAdminUid) return alert('회원을 선택해 주세요.');
    if(!adminCrmDirty) return;
    await saveAdminCrmAllChanges();
  });
}
async function callFunctionJsonRaw(name, payload){
  const base = String(CONFIG.functionsBaseUrl || '').replace(/\/$/, '');
  if(!base || base.includes('PASTE_')) throw new Error('Functions URL이 설정되지 않았습니다. assets/js/config.js의 functionsBaseUrl을 확인하세요.');
  if(!currentUser) throw new Error('Google 로그인 후 결제할 수 있습니다.');
  const token = await currentUser.getIdToken();
  const res = await fetch(`${base}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch(_) { data = {raw:text}; }
  return { ok: res.ok, status: res.status, data: data || {} };
}
async function callFunctionJson(name, payload){
  const result = await callFunctionJsonRaw(name, payload);
  if(!result.ok){
    throw Object.assign(
      new Error(result.data && result.data.message ? result.data.message : `Function ${name} failed (${result.status})`),
      { status: result.status, data: result.data, code: result.data && result.data.code }
    );
  }
  return result.data;
}
async function callFunctionJsonFallback(names, payload){
  let lastErr = null;
  for(const name of names){
    try{
      return await callFunctionJson(name, payload);
    }catch(err){
      lastErr = err;
      if(Number(err?.status) !== 404) throw err;
    }
  }
  throw lastErr || new Error('Function failed');
}
async function loadPortOneSdk(){
  if(window.PortOneSdk) return window.PortOneSdk;
  const mod = await import('https://cdn.portone.io/v2/browser-sdk.esm.js');
  const sdk = mod.default?.requestPayment ? mod.default : (mod.requestPayment ? mod : mod.default);
  if(!sdk || typeof sdk.requestPayment !== 'function'){
    throw new Error('PortOne SDK를 불러오지 못했습니다.');
  }
  window.PortOneSdk = sdk;
  return sdk;
}
async function releaseKakaoPurchaseLock(paymentId){
  if(!paymentId || !currentUser) return;
  try{
    await callFunctionJson('releasePurchaseLock', { paymentId });
  }catch(err){
    console.warn('releasePurchaseLock', err);
  }
}

async function requestKakaoPayPointPayment(){
  if(purchaseActionsLocked()){
    applyPurchaseLifetimeGate();
    paypalStatus(purchaseLocaleText().alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.', 'ok');
    return;
  }
  if(!isCreditPurchaseEnabled()){
    paypalStatus(lang==='en' ? 'This product is not available for purchase.' : lang==='ja' ? 'この商品は現在購入できません。' : '현재 구매할 수 없는 상품입니다.', 'err');
    return;
  }
  if(!isKoreanCheckout()){
    paypalStatus(purchaseLocaleText().currencyInvalid || 'Use PayPal for this checkout.', 'err');
    return;
  }
  const livePacks = getCreditProducts();
  const authCheck = requirePurchaseAuth();
  if(!authCheck.ok){
    paypalStatus(authCheck.message, 'err');
    alert(authCheck.message);
    return;
  }
  const t = purchaseLocaleText();
  const pt = pointCopy();
  const pack = selectedPointPack();
  if(!pack?.productId){
    paypalStatus(lang==='en' ? 'Please select a product.' : lang==='ja' ? '商品を選択してください。' : '상품을 선택해 주세요.', 'err');
    return;
  }
  if(!livePacks.some((p) => p.productId === pack.productId)){
    paypalStatus(lang==='en' ? 'This product is not currently for sale.' : lang==='ja' ? 'この商品は現在販売していません。' : '현재 판매 중이 아닌 상품입니다.', 'err');
    return;
  }
  if(kakaoPayInFlight){
    paypalStatus(t.purchaseInProgress || '이미 진행 중인 결제가 있습니다.', 'err');
    return;
  }
  if(!CONFIG.portoneStoreId || String(CONFIG.portoneStoreId).startsWith('PASTE_')){
    paypalStatus('PortOne Store ID를 config.js에 입력해야 합니다.', 'err');
    return;
  }
  if(!CONFIG.portoneKakaoPayChannelKey){
    paypalStatus('PortOne 카카오페이 채널키가 없습니다.', 'err');
    return;
  }
  const productId = pack.productId;
  const orderName = pack.orderNameKo || pack.orderNameEn || pack.nameKo || pack.name || productId;
  let totalAmount = Number(pack.effectivePrice != null ? pack.effectivePrice : pack.krw);
  let quoteId = '';
  try{
    const quote = await callFunctionJsonFallback(['createCreditPurchaseQuote', 'createPurchaseQuote'], { productId });
    if(quote?.ok && Number(quote.finalPrice) > 0){
      totalAmount = Number(quote.finalPrice);
      quoteId = String(quote.quoteId || '');
    } else if(quote?.code === 'SALE_DISABLED' || quote?.code === 'SALE_DISABLED'){
      paypalStatus('현재 판매중지된 상품입니다.', 'err');
      return;
    } else {
      paypalStatus(lang==='en' ? 'Could not start checkout. Please try again.' : lang==='ja' ? '決済を開始できませんでした。' : '결제를 시작할 수 없습니다. 다시 시도해 주세요.', 'err');
      return;
    }
  }catch(quoteErr){
    console.warn('purchase quote', quoteErr);
    paypalStatus(lang==='en' ? 'Could not start checkout. Please try again.' : lang==='ja' ? '決済を開始できませんでした。' : '결제를 시작할 수 없습니다. 다시 시도해 주세요.', 'err');
    return;
  }
  if(!quoteId || !(totalAmount > 0)){
    paypalStatus(lang==='en' ? 'Could not start checkout. Please try again.' : lang==='ja' ? '決済を開始できませんでした。' : '결제를 시작할 수 없습니다. 다시 시도해 주세요.', 'err');
    return;
  }
  const paymentIdValue = makeKakaoPaymentId(currentUser.uid);
  kakaoPayInFlight = true;
  setPurchasePayBusy(true);
  try{
    paypalStatus(t.kakaoPreparing || 'Opening KakaoPay checkout...');
    const PortOne = await loadPortOneSdk();
    const result = await PortOne.requestPayment({
      storeId: CONFIG.portoneStoreId,
      channelKey: CONFIG.portoneKakaoPayChannelKey,
      paymentId: paymentIdValue,
      orderName,
      totalAmount,
      currency: 'CURRENCY_KRW',
      payMethod: 'EASY_PAY',
      customer: {
        customerId: currentUser.uid,
        fullName: currentUser.displayName || currentUser.email || 'MidiAI User',
        email: currentUser.email || undefined,
      },
      customData: {
        uid: currentUser.uid,
        productType: 'credits',
        productId,
        quoteId,
        mode: CONFIG.portoneMode || 'test'
      }
    });
    if(result?.code){
      const code = String(result.code || '');
      const cancelled = /CANCEL|USER_CANCEL|FAILURE_TYPE_PG/i.test(code) || /취소|cancel/i.test(String(result.message || ''));
      paypalStatus(cancelled ? (t.kakaoCancel || '결제가 취소되었습니다.') : `${result.message || result.code}`, 'err');
      return;
    }
    paypalStatus(pt.kakaoVerifying);
    const credited = await callFunctionJsonFallback(['creditPortOnePurchase', 'creditPortOnePointPurchase'], {
      paymentId: paymentIdValue,
      productId,
      quoteId
    });
    if(!credited?.ok){
      paypalStatus(`${pt.kakaoVerifyFail} (paymentId: ${paymentIdValue})`, 'err');
      alert(`${pt.kakaoVerifyFail}\n\npaymentId: ${paymentIdValue}`);
      return;
    }
    renderPurchaseSuccess({
      kind: 'credits',
      paymentId: paymentIdValue,
      email: credited.email || currentUser.email,
      amount: credited.amount || totalAmount,
      currency: credited.currency || 'KRW',
      creditedPoints: credited.credits ?? credited.creditedPoints ?? credited.points,
      credits: credited.credits ?? credited.points,
      points: credited.points,
      balance: credited.balance
    });
    paypalStatus(pt.kakaoComplete, 'ok');
  }catch(err){
    console.error('PortOne KakaoPay point error', err);
    const msg = String(err?.message || err || '');
    if(/cancel|취소/i.test(msg)){
      paypalStatus(t.kakaoCancel || '결제가 취소되었습니다.', 'err');
      return;
    }
    paypalStatus('카카오페이 결제 오류: ' + msg, 'err');
    alert('카카오페이 결제 오류: ' + msg);
  }finally{
    kakaoPayInFlight = false;
    setPurchasePayBusy(false);
    applyPurchaseLifetimeGate();
  }
}

async function requestKakaoPayPayment(){
  if(isPointCheckout()){
    await requestKakaoPayPointPayment();
    return;
  }
  const authCheck = requirePurchaseAuth();
  if(!authCheck.ok){
    paypalStatus(authCheck.message, 'err');
    alert(authCheck.message);
    return;
  }
  const t = purchaseLocaleText();
  if(currentLicenseLifetime){
    applyPurchaseLifetimeGate();
    alert(t.alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.');
    return;
  }
  if(kakaoPayInFlight){
    paypalStatus(t.purchaseInProgress || '이미 진행 중인 결제가 있습니다.', 'err');
    return;
  }
  if(!CONFIG.portoneStoreId || String(CONFIG.portoneStoreId).startsWith('PASTE_')){
    paypalStatus('PortOne Store ID를 config.js에 입력해야 합니다.', 'err');
    alert('PortOne Store ID를 config.js에 입력해야 합니다.');
    return;
  }
  if(!CONFIG.portoneKakaoPayChannelKey){
    paypalStatus('PortOne 카카오페이 채널키가 없습니다.', 'err');
    return;
  }
  const ctx = purchaseCheckout();
  if(selectedPurchaseId === 'LIFETIME' && !isSelling(getDefaultProduct())){
    const msg = lang==='en' ? 'Temporarily unavailable' : '일시 판매중지된 상품입니다.';
    paypalStatus(msg, 'err');
    alert(msg);
    return;
  }
  const selectedPid = isPassProductId(selectedPurchaseId) ? selectedPurchaseId : 'LIFETIME';
  const passPack = isPassProductId(selectedPid) ? getPassProduct(selectedPid) : null;
  let productId = selectedPid === 'LIFETIME'
    ? (ctx.portoneProductId || CONFIG.portoneProductId || 'midiai-lifetime')
    : selectedPid;
  let orderName = selectedPid === 'LIFETIME'
    ? (ctx.orderName || CONFIG.portoneOrderName || 'MidiAI Studio Lifetime License')
    : (passPack?.orderNameKo || passPack?.orderNameEn || `${selectedPid} Full Pass`);
  let totalAmount = selectedPid === 'LIFETIME'
    ? Number(ctx.salePrice || CONFIG.priceValueKr || 129000)
    : Number(passPack?.effectivePrice != null ? passPack.effectivePrice : passPack?.krw || 0);
  const paymentIdValue = makeKakaoPaymentId(currentUser.uid);
  kakaoPayInFlight = true;
  setPurchasePayBusy(true);
  try{
    paypalStatus(t.kakaoPreparing || 'Opening KakaoPay checkout...');
    let eligibility;
    try{
      // Canonical catalog id (LIFETIME / PASS_*) — not PortOne channel SKU.
      eligibility = await callFunctionJson('checkPurchaseEligibility', {
        paymentId: paymentIdValue,
        productId: selectedPid
      });
    }catch(eligErr){
      const msg = eligErr?.message || t.purchaseInProgress || '구매 가능 여부 확인에 실패했습니다.';
      paypalStatus(msg, 'err');
      alert(msg);
      return;
    }
    if(!eligibility?.eligible){
      if(eligibility?.hasLifetime){
        currentLicenseLifetime = true;
        applyPurchaseLifetimeGate();
      }
      const msg = eligibility?.message || t.alreadyOwned || '구매할 수 없습니다.';
      paypalStatus(msg, eligibility?.hasLifetime ? 'ok' : 'err');
      alert(msg);
      return;
    }
    if(eligibility?.pricing){
      totalAmount = Number(eligibility.pricing.amount || totalAmount);
      orderName = eligibility.pricing.orderName || orderName;
      productId = eligibility.pricing.productId || productId;
    }
    let lifetimeQuoteId = '';
    try{
      const quote = await callFunctionJson('createPurchaseQuote', { productId: selectedPid });
      if(quote?.ok && Number(quote.finalPrice) > 0){
        totalAmount = Number(quote.finalPrice);
        lifetimeQuoteId = String(quote.quoteId || '');
        if(quote.productId) productId = String(quote.productId);
      }
    }catch(quoteErr){
      console.warn('purchase quote', quoteErr);
    }

    const PortOne = await loadPortOneSdk();
    const result = await PortOne.requestPayment({
      storeId: CONFIG.portoneStoreId,
      channelKey: CONFIG.portoneKakaoPayChannelKey,
      paymentId: paymentIdValue,
      orderName,
      totalAmount,
      currency: 'CURRENCY_KRW',
      payMethod: 'EASY_PAY',
      customer: {
        customerId: currentUser.uid,
        fullName: currentUser.displayName || currentUser.email || 'MidiAI User',
        email: currentUser.email || undefined,
      },
      customData: {
        uid: currentUser.uid,
        plan: selectedPid === 'LIFETIME' ? 'lifetime' : 'period',
        productId: selectedPid,
        quoteId: lifetimeQuoteId,
        mode: CONFIG.portoneMode || 'test'
      }
    });
    if(result?.code){
      const code = String(result.code || '');
      const cancelled = /CANCEL|USER_CANCEL|FAILURE_TYPE_PG/i.test(code) || /취소|cancel/i.test(String(result.message || ''));
      await releaseKakaoPurchaseLock(paymentIdValue);
      paypalStatus(cancelled ? (t.kakaoCancel || '결제가 취소되었습니다.') : `${result.message || result.code}`, 'err');
      return;
    }

    paypalStatus(t.kakaoVerifying || t.verifying || 'Verifying payment...');
    let verified;
    try{
      verified = await callFunctionJson('verifyPortOnePaymentAndIssueLicense', {
        paymentId: paymentIdValue,
        productId: selectedPid,
        quoteId: lifetimeQuoteId,
        transactionType: result?.transactionType || result?.type || undefined
      });
    }catch(verifyErr){
      console.error('PortOne verify failed', verifyErr);
      const data = verifyErr?.data || {};
      if(data.code === 'DUPLICATE_REFUND_FAILED' || data.duplicate && data.refunded === false){
        paypalStatus(`${t.duplicateRefundFailed || data.message} (paymentId: ${paymentIdValue})`, 'err');
        alert(`${t.duplicateRefundFailed || data.message || '관리자 확인이 필요합니다.'}\n\npaymentId: ${paymentIdValue}`);
        await loadLicense(currentUser.uid);
        return;
      }
      if(data.code === 'DUPLICATE_LICENSE' || data.duplicate){
        paypalStatus(`${t.duplicateRefunded || data.message} (paymentId: ${paymentIdValue})`, 'ok');
        alert(`${t.duplicateRefunded || data.message}\n\npaymentId: ${paymentIdValue}`);
        await loadLicense(currentUser.uid);
        return;
      }
      paypalStatus(`${t.kakaoVerifyFail || 'License confirmation required.'} (paymentId: ${paymentIdValue})`, 'err');
      alert(`${t.kakaoVerifyFail || '결제는 완료되었으나 라이선스 확인이 필요합니다.'}\n\npaymentId: ${paymentIdValue}`);
      return;
    }

    // Success path may also return ok:false for duplicate_refunded (HTTP 200).
    if(verified?.duplicate){
      if(verified.refunded){
        paypalStatus(`${t.duplicateRefunded || verified.message} (paymentId: ${paymentIdValue})`, 'ok');
        alert(`${t.duplicateRefunded || verified.message}\n\npaymentId: ${paymentIdValue}`);
      } else {
        paypalStatus(`${t.duplicateRefundFailed || verified.message} (paymentId: ${paymentIdValue})`, 'err');
        alert(`${t.duplicateRefundFailed || verified.message}\n\npaymentId: ${paymentIdValue}`);
      }
      await loadLicense(currentUser.uid);
      return;
    }

    if(!verified?.ok || !verified?.licenseGranted){
      paypalStatus(`${t.kakaoVerifyFail || 'License confirmation required.'} (paymentId: ${paymentIdValue})`, 'err');
      alert(`${t.kakaoVerifyFail || '결제는 완료되었으나 라이선스 확인이 필요합니다.'}\n\npaymentId: ${paymentIdValue}`);
      return;
    }

    renderPurchaseSuccess({
      paymentId: paymentIdValue,
      email: verified.email || currentUser.email,
      amount: verified.amount || totalAmount
    });
    paypalStatus(t.kakaoComplete || t.complete || 'Payment complete.', 'ok');
    await loadLicense(currentUser.uid);
    updatePurchaseAccountBox();
  }catch(err){
    console.error('PortOne KakaoPay error', err);
    await releaseKakaoPurchaseLock(paymentIdValue);
    const msg = String(err?.message || err || '');
    if(/cancel|취소/i.test(msg)){
      paypalStatus(t.kakaoCancel || '결제가 취소되었습니다.', 'err');
      return;
    }
    paypalStatus('카카오페이 결제 오류: ' + msg, 'err');
    alert('카카오페이 결제 오류: ' + msg);
  }finally{
    kakaoPayInFlight = false;
    setPurchasePayBusy(false);
    applyPurchaseLifetimeGate();
  }
}
window.midiaiKakaoPay = requestKakaoPayPayment;

function normalizeKoreanPhone(value){
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}
function formatKoreanPhone(value){
  const digits = normalizeKoreanPhone(value);
  if(digits.length <= 3) return digits;
  if(digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  if(digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
}
function getPurchasePhone(){
  return normalizeKoreanPhone($('purchasePhone')?.value);
}
function initPurchasePhone(){
  // Phone field removed from checkout UI (KakaoPay does not require it).
}

async function requestInicisCardPayment(){
  if(!currentUser){
    const msg = purchaseLocaleText().loginAlert || 'Google 로그인 후 결제할 수 있습니다.';
    paypalStatus(msg, 'err');
    alert(msg);
    return;
  }
  const t = purchaseLocaleText();
  if(currentLicenseLifetime){
    applyPurchaseLifetimeGate();
    alert(t.alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.');
    return;
  }
  if(!CONFIG.portoneStoreId || String(CONFIG.portoneStoreId).startsWith('PASTE_')){
    paypalStatus('PortOne Store ID를 config.js에 입력해야 합니다.', 'err');
    alert('PortOne Store ID를 config.js에 입력해야 합니다.');
    return;
  }
  if(!CONFIG.portoneInicisChannelKey){
    paypalStatus('KG이니시스 테스트 채널키가 없습니다.', 'err');
    return;
  }
  const phoneNumber = getPurchasePhone() || localStorage.getItem('midiai_purchase_phone') || '';
  try{
    paypalStatus('KG이니시스 테스트 결제창을 여는 중입니다...');
    const PortOne = await loadPortOneSdk();
    const customer = {
      customerId: currentUser.uid,
      fullName: currentUser.displayName || currentUser.email || 'MidiAI User',
      email: currentUser.email || undefined,
    };
    if(/^01\d{8,9}$/.test(phoneNumber)) customer.phoneNumber = phoneNumber;
    const result = await PortOne.requestPayment({
      storeId: CONFIG.portoneStoreId,
      channelKey: CONFIG.portoneInicisChannelKey,
      paymentId: paymentId('midiai-inicis-test'),
      orderName: 'MidiAI Studio Lifetime 디지털 라이선스',
      totalAmount: Number(CONFIG.priceValueKr || 129000),
      currency: 'CURRENCY_KRW',
      payMethod: 'CARD',
      customer,
      customData: {
        uid: currentUser.uid,
        plan: CONFIG.plan || 'lifetime',
        mode: 'test',
        provider: 'inicis_v2'
      }
    });
    if(result?.code){
      paypalStatus(`${result.message || result.code}`, 'err');
      return;
    }
    paypalStatus('KG이니시스 테스트 결제가 완료되었습니다. 심사용 테스트 결제이며 라이선스는 자동 지급되지 않습니다.', 'ok');
    alert('KG이니시스 테스트 결제가 완료되었습니다.');
  }catch(err){
    console.error('PortOne KG Inicis error', err);
    paypalStatus('KG이니시스 결제 오류: ' + (err?.message || err), 'err');
    alert('KG이니시스 결제 오류: ' + (err?.message || err));
  }
}
window.midiaiInicisPay = requestInicisCardPayment;

function renderKoreanPaymentButtons(){
  const box = $('paypalButtons');
  if(!box) return;
  box.innerHTML = `
    <div class="purchase-payment-actions">
      <button id="kakaoPayBtn" class="primary purchase-kakao-btn" type="button" onclick="window.midiaiKakaoPay && window.midiaiKakaoPay()">
        <span class="kakao-mark">pay</span><strong>카카오페이로 구매</strong>
      </button>
    </div>`;
  applyPurchaseLifetimeGate();
}
function initPayPal(){
  if(!$('paypalButtons')) return;
  try{
    updatePurchaseAccountBox();
    if(isKoreanCheckout() && CONFIG.portoneKakaoPayChannelKey){
      return;
    }
  }catch(err){
    console.error('initPayPal', err);
    $('paypalButtons').innerHTML = `<p class="muted">${esc('결제 버튼을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.')}</p>`;
    return;
  }
  if(!CONFIG.paypalClientId || String(CONFIG.paypalClientId).startsWith('PASTE_')) {
    $('paypalButtons').innerHTML = `<p>${esc(purchaseLocaleText().paypalReady)}</p>`;
    return;
  }
  const s=document.createElement('script');
  const currency = purchaseCurrency();
  const locale = lang==='ja' ? 'ja_JP' : 'en_US';
  s.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=${encodeURIComponent(currency)}&intent=capture&locale=${encodeURIComponent(locale)}`;
  s.onload=()=>{
    if(!window.paypal)return;
    $('paypalButtons').innerHTML='';
    window.paypal.Buttons({
      onClick:()=>{
        if(!currentUser){ alert(purchaseLocaleText().loginAlert); return false; }
        if(currentLicenseLifetime && !isPointCheckout()){
          applyPurchaseLifetimeGate();
          alert(purchaseLocaleText().alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다.');
          return false;
        }
        paypalStatus(purchaseLocaleText().paypalAccount(currentUser.email || currentUser.uid));
        return true;
      },
      createOrder: async()=>{
        if(!isPointCheckout() && !isSelling(getDefaultProduct())){
          const msg = lang==='en' ? 'Temporarily unavailable' : '일시 판매중지된 상품입니다.';
          paypalStatus(msg, 'err');
          throw new Error(msg);
        }
        paypalStatus(purchaseLocaleText().creating);
        const pid = selectedPurchaseId || 'LIFETIME';
        let quoteId = pendingPaypalQuoteId;
        if(!quoteId){
          const quote = await createUsdCheckoutQuote(pid);
          quoteId = String(quote?.quoteId || '');
          pendingPaypalQuoteId = quoteId;
        }
        if(!quoteId) throw new Error(pointCopy().fxError || 'Quote required');
        try{
          const result = await callFunctionJson('createPayPalOrder', {
            quoteId,
            productId: pid
          });
          if(!result.id) throw new Error('PayPal 주문 ID를 받지 못했습니다.');
          paypalStatus(purchaseLocaleText().opening);
          return result.id;
        }catch(err){
          const mapped = err?.code === 'QUOTE_CURRENCY'
            ? purchaseLocaleText().currencyInvalid
            : (err?.message || err);
          paypalStatus(purchaseLocaleText().error + mapped, 'err');
          throw Object.assign(new Error(mapped), { code: err?.code });
        }
      },
      onApprove: async(data)=>{
        if(isPointCheckout()){
          const pack = selectedPointPack();
          const pt = pointCopy();
          paypalStatus(pt.verifying);
          const credited = await callFunctionJsonFallback(['capturePayPalOrder', 'capturePayPalCreditOrder', 'capturePayPalPointOrder'], {
            orderId: data.orderID,
            productId: pack.productId
          });
          renderPurchaseSuccess({
            kind: 'credits',
            paymentId: data.orderID,
            email: credited.email || currentUser.email,
            amount: credited.amount || pack.usd,
            currency: credited.currency || 'USD',
            creditedPoints: credited.creditedPoints ?? credited.points,
            points: credited.points,
            balance: credited.balance
          });
          paypalStatus(pt.complete, 'ok');
          return;
        }
        paypalStatus(purchaseLocaleText().verifying);
        await callFunctionJson('capturePayPalOrder', {
          orderId: data.orderID,
          plan: CONFIG.plan || 'lifetime'
        });
        paypalStatus(purchaseLocaleText().complete, 'ok');
        alert(purchaseLocaleText().complete);
        await loadLicense(currentUser.uid);
      },
      onCancel:()=> paypalStatus(purchaseLocaleText().cancel),
      onError:(err)=>{ console.error('PayPal error',err); paypalStatus(purchaseLocaleText().error+(err?.message || err), 'err'); alert(purchaseLocaleText().error+(err?.message || err)); }
    }).render('#paypalButtons');
  };
  s.onerror=()=>paypalStatus(purchaseLocaleText().error+'SDK loading failed. Check Client ID and domain settings.', 'err');
  document.body.appendChild(s);
}

$('year') && ($('year').textContent=new Date().getFullYear());

const LANG_LOCALES = ['ko', 'en', 'ja'];
const LANG_META = {
  ko: { code: 'KO', name: '한국어', flag: 'kr' },
  en: { code: 'EN', name: 'English', flag: 'us' },
  ja: { code: 'JA', name: '日本語', flag: 'jp' }
};
const TOPBAR_CHEVRON_SVG = '<svg class="topbar-lang-chevron" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let topbarLangMenuOpen = false;

function normalizeSiteLang(value){
  const v = String(value || '').toLowerCase();
  return LANG_LOCALES.includes(v) ? v : 'ko';
}

function langFlagSrc(flagKey){
  const base = window.MIDIAI_BASE_PATH || './';
  const key = String(flagKey || 'kr').toLowerCase();
  return `${base}assets/images/flags/${key}.svg`;
}

function langFlagMarkup(flagKey){
  return `<img class="topbar-flag-svg" src="${langFlagSrc(flagKey)}" width="20" height="14" alt="" decoding="async" draggable="false">`;
}

function langFlagSvg(locale){
  const meta = LANG_META[normalizeSiteLang(locale)] || LANG_META.ko;
  return langFlagMarkup(meta.flag);
}

function setTopbarLangMenuOpen(open){
  topbarLangMenuOpen = !!open;
  const menu = $('topbarLangMenu');
  const btn = $('langBtn');
  if(menu){
    menu.classList.toggle('is-open', topbarLangMenuOpen);
    menu.hidden = !topbarLangMenuOpen;
  }
  if(btn) btn.setAttribute('aria-expanded', topbarLangMenuOpen ? 'true' : 'false');
}

function closeTopbarLangMenu(){
  setTopbarLangMenuOpen(false);
}

function openTopbarLangMenu(){
  ensureTopbarLangSwitcher();
  try{ closeNotifyPanel(); }catch{}
  closeTopbarProfilePanel();
  setTopbarLangMenuOpen(true);
  paintTopbarLangMenu();
}

function toggleTopbarLangMenu(){
  const nextOpen = !topbarLangMenuOpen;
  if(nextOpen) openTopbarLangMenu();
  else closeTopbarLangMenu();
}

function paintTopbarLangMenu(){
  const menu = $('topbarLangMenu');
  if(!menu) return;
  const current = normalizeSiteLang(lang);
  menu.querySelectorAll('[data-lang]').forEach((row)=>{
    const code = normalizeSiteLang(row.getAttribute('data-lang'));
    const selected = code === current;
    row.classList.toggle('is-current', selected);
    row.setAttribute('aria-selected', selected ? 'true' : 'false');
    const check = row.querySelector('.topbar-lang-check');
    if(check) check.hidden = !selected;
  });
}

function setSiteLanguage(nextLang){
  const next = normalizeSiteLang(nextLang);
  closeTopbarLangMenu();
  persistSiteLang(next);
  if(isPurchasePage){
    if(next === normalizeSiteLang(pathLang || lang)) return;
    if(next === 'ko') location.href = (pathLang ? '../purchase.html' : './purchase.html') + location.search;
    else location.href = (pathLang ? `../${next}/purchase.html` : `./${next}/purchase.html`) + location.search;
    return;
  }
  if(isSiteHomePage()){
    if(next === normalizeSiteLang(pathLang || lang)) return;
    location.href = localeHomeHref(next);
    return;
  }
  if(next === normalizeSiteLang(lang)) return;
  lang = next;
  applyStaticI18n();
  applyGuidesI18n(lang);
  if($('accountMeta') && currentUser) renderAccountDashboard(currentUser.uid, accountLicenseDoc, latestDownloadData);
  paintProfileCreditStrip();
  try{
    document.querySelectorAll('#mainNav a[data-nav="home"]').forEach((a)=>{
      a.setAttribute('href', localeHomeHref(next));
    });
    document.querySelectorAll('#mainNav a[data-nav="purchase"]').forEach((a)=>{
      a.setAttribute('href', lifetimePurchaseHref());
    });
  }catch(_){}
}

function onLangBtnClick(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();
  // Capture open-state BEFORE any other handler can race; true toggle contract.
  const nextOpen = !topbarLangMenuOpen;
  if(nextOpen) openTopbarLangMenu();
  else closeTopbarLangMenu();
}

function ensureTopbarLangSwitcher(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions) return null;
  let wrap = $('topbarLangWrap');
  let langBtn = $('langBtn');
  if(wrap && langBtn && $('topbarLangMenu')){
    wrap.setAttribute('data-i18n-skip', '1');
    return wrap;
  }

  if(langBtn && !wrap){
    wrap = document.createElement('div');
    wrap.className = 'topbar-lang-wrap';
    wrap.id = 'topbarLangWrap';
    wrap.setAttribute('data-i18n-skip', '1');
    langBtn.parentNode.insertBefore(wrap, langBtn);
    wrap.appendChild(langBtn);
  } else if(!langBtn){
    wrap = document.createElement('div');
    wrap.className = 'topbar-lang-wrap';
    wrap.id = 'topbarLangWrap';
    wrap.setAttribute('data-i18n-skip', '1');
    wrap.innerHTML = `<button id="langBtn" class="ghost topbar-lang" type="button"></button>`;
    actions.insertBefore(wrap, actions.firstChild);
    langBtn = $('langBtn');
  } else if(wrap){
    wrap.setAttribute('data-i18n-skip', '1');
  }

  langBtn = $('langBtn');
  if(!langBtn) return null;
  langBtn.classList.add('topbar-lang');
  langBtn.type = 'button';
  langBtn.setAttribute('aria-label', tt('언어 선택'));
  langBtn.setAttribute('aria-haspopup', 'listbox');
  langBtn.setAttribute('aria-expanded', topbarLangMenuOpen ? 'true' : 'false');
  langBtn.setAttribute('aria-controls', 'topbarLangMenu');
  langBtn.innerHTML = `<span class="topbar-lang-flag" aria-hidden="true">${langFlagSvg(lang)}</span><span class="topbar-lang-code">KO</span>${TOPBAR_CHEVRON_SVG}`;

  let menu = $('topbarLangMenu');
  if(!menu){
    menu = document.createElement('div');
    menu.id = 'topbarLangMenu';
    menu.className = 'topbar-lang-menu';
    menu.hidden = true;
    menu.classList.remove('is-open');
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', tt('언어 선택'));
    menu.innerHTML = LANG_LOCALES.map((code)=>{
      const meta = LANG_META[code];
      return `<button type="button" class="topbar-lang-option" role="option" data-lang="${code}" aria-selected="false">
        <span class="topbar-lang-flag" aria-hidden="true">${langFlagMarkup(meta.flag)}</span>
        <span class="topbar-lang-name">${esc(meta.name)}</span>
        <span class="topbar-lang-check" aria-hidden="true" hidden>✓</span>
      </button>`;
    }).join('');
    wrap.appendChild(menu);
    menu.addEventListener('click', (e)=>{
      const row = e.target.closest?.('[data-lang]');
      if(!row) return;
      e.preventDefault();
      e.stopPropagation();
      setSiteLanguage(row.getAttribute('data-lang'));
    });
  }

  langBtn.onclick = onLangBtnClick;

  if(!document.body.dataset.langOutsideBound){
    document.body.dataset.langOutsideBound = '1';
    // Bubble phase only. Button uses stopPropagation so same-button toggle is not undone.
    document.addEventListener('click', (e)=>{
      if(!topbarLangMenuOpen) return;
      if(e.target.closest?.('#topbarLangWrap')) return;
      closeTopbarLangMenu();
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && topbarLangMenuOpen){
        closeTopbarLangMenu();
        $('langBtn')?.focus();
      }
    });
  }
  return wrap;
}

$('langBtn') && ($('langBtn').onclick=onLangBtnClick);
const SIDEBAR_ICONS={
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  product:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 8h8"/><path d="M8 12h5"/></svg>',
  purchase:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9H7.5L6 6z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>',
  notice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 8 0 0 1 16 0v5l2 2H2l2-2z"/><path d="M10 21h4"/></svg>',
  patch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
  faq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.2 1.8c0 1.8-2.2 2-2.2 3.7"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></svg>',
  board:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  support:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v11a2 2 0 0 1-2 2H8l-4 3V6z"/><path d="m8 10 2 2 4-4"/></svg>',
  tickets:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v4H4z"/><path d="M6 11v7"/><path d="M18 11v7"/><path d="M8 7V5h8v2"/></svg>',
  account:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v6c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  guide:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z"/><path d="M11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/><path d="M15 8h3"/><path d="M15 12h3"/></svg>',
  'guide-pdf':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  'guide-youtube':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10 9 6 3-6 3z"/></svg>',
  'guide-mp3':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/></svg>',
  'guide-audio':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 7v10"/><path d="M20 10v4"/></svg>',
  'guide-musicxml':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10v6H5z"/><path d="M9 10v8"/><circle cx="7" cy="18" r="2"/><path d="M14 8h5v6h-5z"/><path d="M17 14v4"/><circle cx="15" cy="18" r="2"/></svg>',
};
function navIcon(name){ return `<span class="nav-icon is-${name}" aria-hidden="true">${SIDEBAR_ICONS[name]||''}</span>`; }
const GOOGLE_MARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
function refreshTopbarActionLabels(){
  ensureTopbarLangSwitcher();
  const langBtn = $('langBtn');
  if(langBtn){
    const current = normalizeSiteLang(lang);
    const meta = LANG_META[current];
    const flag = langBtn.querySelector('.topbar-lang-flag');
    const code = langBtn.querySelector('.topbar-lang-code');
    if(flag) flag.innerHTML = langFlagSvg(current);
    if(code) code.textContent = meta.code;
    langBtn.setAttribute('aria-label', `${tt('언어 선택')}, ${meta.name}`);
    paintTopbarLangMenu();
  }
  const loginLabel = $('loginBtn')?.querySelector('.login-label');
  if(loginLabel) loginLabel.textContent = tr('login');
  const logoutBtn = $('logoutBtn');
  if(logoutBtn) logoutBtn.textContent = tr('logout');
  const profileBtn = $('topbarProfileBtn');
  if(profileBtn) profileBtn.setAttribute('aria-label', tr('profile_menu_aria'));
}

let topbarProfilePanelOpen = false;



function bindTopbarLoginButton(){
  const loginBtn = $('loginBtn');
  if(!loginBtn) return;
  loginBtn.onclick = ()=>{
    closeTopbarProfilePanel();
    if(typeof topbarGoogleLogin === 'function') topbarGoogleLogin();
    else console.warn('Google login not ready');
  };
}

function syncTopbarProfileAuthUi(signedIn){
  ensureTopbarProfile();
  setTopbarProfileVisible(true);
  const loginBtn = $('loginBtn');
  const logoutBtn = $('logoutBtn');
  const links = document.querySelector('#topbarProfilePanel .topbar-profile-links');
  if(links){
    links.hidden = !signedIn;
    links.setAttribute('aria-hidden', signedIn ? 'false' : 'true');
  }
  if(loginBtn){
    loginBtn.classList.toggle('hidden', !!signedIn);
    loginBtn.hidden = !!signedIn;
    loginBtn.setAttribute('aria-hidden', signedIn ? 'true' : 'false');
  }
  if(logoutBtn){
    logoutBtn.classList.toggle('hidden', !signedIn);
    logoutBtn.hidden = !signedIn;
    logoutBtn.setAttribute('aria-hidden', signedIn ? 'false' : 'true');
  }
  if(!signedIn){
    setTopbarProfileAvatar($('topbarProfileAvatar'), null, '?');
    setTopbarProfileAvatar($('topbarProfileAvatarLarge'), null, '?');
    if($('topbarProfileName')) $('topbarProfileName').textContent = tr('guest');
    if($('topbarProfileEmail')){
      $('topbarProfileEmail').textContent = tr('guest_desc');
      $('topbarProfileEmail').title = tr('guest_desc');
    }
    const badge = $('topbarProfileLicense');
    if(badge){
      badge.hidden = false;
      badge.className = 'badge topbar-profile-license pending';
      badge.textContent = tr('license_wait');
    }
    const adminLink = $('topbarProfileAdmin');
    if(adminLink) adminLink.hidden = true;
  }
  paintProfileCreditStrip();
  bindTopbarLoginButton();
  const logout = $('logoutBtn');
  if(logout) logout.onclick = ()=>{ doLogout(); };
}

async function doLogout(){
  closeTopbarProfilePanel();
  try{
    if(auth && firebaseSignOut) await firebaseSignOut(auth);
    else if(auth && typeof auth.signOut === 'function') await auth.signOut();
    else location.reload();
  }catch(e){
    console.error('logout failed', e);
    location.reload();
  }
}

function ensureTopbarProfile(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions) return null;
  let wrap = $('topbarProfile');
  if(wrap){
    ensureTopbarProfileCreditSlot();
    return wrap;
  }

  // Remove legacy text logout button if present outside profile menu
  const legacyLogout = $('logoutBtn');
  if(legacyLogout && !legacyLogout.closest?.('#topbarProfile')){
    legacyLogout.remove();
  }

  const base = window.MIDIAI_BASE_PATH || './';
  wrap = document.createElement('div');
  wrap.className = 'topbar-profile';
  wrap.id = 'topbarProfile';
  wrap.hidden = false;
  wrap.innerHTML = `<button type="button" class="topbar-profile-btn" id="topbarProfileBtn" aria-label="${esc(tr('profile_menu_aria'))}" aria-expanded="false"><span class="topbar-profile-avatar" id="topbarProfileAvatar">?</span></button>
  <div class="topbar-profile-panel" id="topbarProfilePanel" hidden>
    <div class="topbar-profile-head">
      <div class="topbar-profile-avatar is-lg" id="topbarProfileAvatarLarge">?</div>
      <div class="topbar-profile-meta">
        <b id="topbarProfileName">${esc(tr('guest'))}</b>
        <span id="topbarProfileEmail">${esc(tr('guest_desc'))}</span>
        <span id="topbarProfileLicense" class="badge topbar-profile-license pending">${esc(tr('license_wait'))}</span>
      </div>
    </div>
    <div class="topbar-profile-credit" id="topbarProfileCredit" hidden></div>
    <nav class="topbar-profile-links" hidden aria-hidden="true" aria-label="${esc(tr('profile_menu_aria'))}">
      <a href="${base}account.html">${esc(tr('profile_my_account'))}</a>
      <a href="${base}my-tickets.html">${esc(tr('profile_my_tickets'))}</a>
      <a href="${base}board.html?mine=1">${esc(tr('profile_my_posts'))}</a>
    </nav>
    <button type="button" class="topbar-profile-login" id="loginBtn" aria-label="${esc(tr('login'))}"><span class="login-google-icon">${GOOGLE_MARK_SVG}</span><span class="login-label">${esc(tr('login'))}</span></button>
    <button type="button" class="topbar-profile-logout hidden" id="logoutBtn" hidden aria-hidden="true">${esc(tr('logout'))}</button>
  </div>`;
  actions.appendChild(wrap);

  $('topbarProfileBtn')?.addEventListener('click', (e)=>{
    e.stopPropagation();
    closeTopbarLangMenu();
    toggleTopbarProfilePanel();
  });
  if(!document.body.dataset.profileOutsideBound){
    document.body.dataset.profileOutsideBound = '1';
    document.addEventListener('click', (e)=>{
      if(!topbarProfilePanelOpen) return;
      if(e.target.closest?.('#topbarProfile')) return;
      closeTopbarProfilePanel();
    });
  }
  // Drop legacy topbar login button outside the profile menu
  document.querySelectorAll('.topbar .actions > #loginBtn, .topbar .actions > .topbar-login').forEach((el)=>{
    if(!el.closest?.('#topbarProfile')) el.remove();
  });
  bindTopbarLoginButton();
  const logoutBtn = $('logoutBtn');
  if(logoutBtn) logoutBtn.onclick = ()=>{ doLogout(); };
  ensureTopbarProfileCreditSlot();
  paintProfileCreditStrip();
  return wrap;
}
function setTopbarProfileVisible(show){
  const wrap = ensureTopbarProfile();
  if(!wrap) return;
  wrap.hidden = !show;
  if(!show) closeTopbarProfilePanel();
}
function setTopbarProfileAvatar(el, user, initial){
  if(!el) return;
  const photo = user?.photoURL || '';
  if(photo){
    el.classList.add('has-photo');
    el.innerHTML = `<img src="${esc(photo)}" alt="" width="34" height="34" loading="lazy" referrerpolicy="no-referrer">`;
  } else {
    el.classList.remove('has-photo');
    el.textContent = initial || '?';
  }
}
function updateTopbarProfile(user){
  ensureTopbarProfile();
  if(!user) return;
  const name = user.displayName || 'Google User';
  const email = user.email || '';
  const initial = (user.displayName || user.email || '?').slice(0,1).toUpperCase();
  setTopbarProfileAvatar($('topbarProfileAvatar'), user, initial);
  setTopbarProfileAvatar($('topbarProfileAvatarLarge'), user, initial);
  if($('topbarProfileName')) $('topbarProfileName').textContent = name;
  if($('topbarProfileEmail')){
    $('topbarProfileEmail').textContent = email;
    $('topbarProfileEmail').title = email;
  }
  const adminLink = $('topbarProfileAdmin');
  if(adminLink) adminLink.hidden = !isAdminUser;
  syncTopbarProfileAuthUi(true);
}
function toggleTopbarProfilePanel(){
  if(topbarProfilePanelOpen) closeTopbarProfilePanel();
  else openTopbarProfilePanel();
}
function openTopbarProfilePanel(){
  ensureTopbarProfile();
  // close notify panel if open
  try{ closeNotifyPanel(); }catch{}
  const panel = $('topbarProfilePanel');
  if(!panel) return;
  topbarProfilePanelOpen = true;
  panel.hidden = false;
  $('topbarProfileBtn')?.setAttribute('aria-expanded','true');
  const adminLink = $('topbarProfileAdmin');
  if(adminLink) adminLink.hidden = !isAdminUser;
  bindCreditAccountListeners();
  if(currentUser) refreshOwnCredits({ ledger:false, reason:'profile-open' });
}
function closeTopbarProfilePanel(){
  topbarProfilePanelOpen = false;
  const panel = $('topbarProfilePanel');
  if(panel) panel.hidden = true;
  $('topbarProfileBtn')?.setAttribute('aria-expanded','false');
}

function initTopbarActions(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions || actions.dataset.upgraded === '1') return;
  actions.dataset.upgraded = '1';
  actions.classList.add('topbar-actions');

  // Guide/SEO pages often only ship a Free-trial CTA — normalize to portal controls.
  if(!$('langBtn')){
    actions.insertAdjacentHTML('afterbegin', `<button id="langBtn" class="ghost topbar-lang" aria-label="언어 선택" type="button"></button>`);
  }
  // Login/logout live inside the profile dropdown only
  document.querySelectorAll('.topbar .actions > #loginBtn, .topbar .actions > #logoutBtn, .topbar .actions > .topbar-login, .topbar .actions > .topbar-logout').forEach((el)=>{
    if(!el.closest?.('#topbarProfile')) el.remove();
  });

  ensureTopbarLangSwitcher();
  refreshTopbarActionLabels();
  // Notify/period insert relative to #topbarLangWrap (langBtn is nested inside wrap).
  ensureNotifyBell();
  setNotifyBellVisible(!!currentUser);
  ensureTopbarProfile();
  if(currentUser) updateTopbarProfile(currentUser);
  else syncTopbarProfileAuthUi(false);
}
function initSidebarLayout(){
  if(document.body.classList.contains('admin-console-page')){
    document.documentElement.classList.add('sidebar-ready');
    return;
  }
  if(document.querySelector('.app-shell')) return;
  const topbar=document.querySelector('.topbar');
  const main=document.querySelector('main');
  if(!topbar||!main) return;
  const footer=document.querySelector('footer');
  const base=window.MIDIAI_BASE_PATH||'./';
  const purchaseHref=lifetimePurchaseHref();
  const brand=topbar.querySelector('.brand');
  const shell=document.createElement('div');
  shell.className='app-shell';
  const sidebar=document.createElement('aside');
  sidebar.className='sidebar';
  sidebar.id='sidebar';
  if(brand){
    const brandClone=brand.cloneNode(true);
    brandClone.classList.add('sidebar-brand');
    const identity=document.createElement('div');
    identity.className='sidebar-identity';
    identity.appendChild(brandClone);
    sidebar.appendChild(identity);
  }
  const nav=document.createElement('nav');
  nav.id='mainNav';
  nav.className='sidebar-nav';
  nav.setAttribute('aria-label', tt('사이트 메뉴'));
  nav.innerHTML=`<div class="sidebar-primary"><a href="${localeHomeHref()}" data-nav="home">${navIcon('home')}<span>홈</span></a><a href="${base}product.html" data-nav="product">${navIcon('product')}<span>제품</span></a><a href="${base}guide/index.html" data-nav="guides">${navIcon('guide')}<span>가이드</span><span class="nav-soon-badge">준비중</span></a><a href="${base}downloads.html" data-nav="downloads">${navIcon('download')}<span>다운로드</span></a><a href="${purchaseHref}" data-nav="purchase">${navIcon('purchase')}<span>구매</span></a></div><div class="sidebar-section"><p class="sidebar-label">커뮤니티</p><div class="sidebar-links"><a href="${base}notices.html" data-hub="notices">${navIcon('notice')}<span>공지사항</span></a><a href="${base}patch-notes.html" data-hub="patches">${navIcon('patch')}<span>패치노트</span></a><a href="${base}faq.html" data-hub="faq">${navIcon('faq')}<span>FAQ</span></a><a href="${base}board.html" data-hub="board">${navIcon('board')}<span>자유게시판</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">고객지원</p><div class="sidebar-links"><a href="${base}support.html" data-hub="support">${navIcon('support')}<span>1:1 문의</span></a><a href="${base}my-tickets.html" data-hub="tickets">${navIcon('tickets')}<span>나의 문의</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">계정</p><div class="sidebar-links"><a href="${base}account.html" data-nav="account">${navIcon('account')}<span>내 계정</span></a><a id="adminNav" class="hidden" hidden aria-hidden="true" href="${base}admin.html">${navIcon('admin')}<span>관리자</span></a></div></div>`;
  sidebar.appendChild(nav);
  const backdrop=document.createElement('div');
  backdrop.className='sidebar-backdrop';
  backdrop.id='sidebarBackdrop';
  const appMain=document.createElement('div');
  appMain.className='app-main';
  topbar.classList.add('topbar-slim');
  topbar.querySelector('.brand')?.remove();
  topbar.querySelector('#mainNav')?.remove();
  const pageTitle=resolveTopbarPageTitle();
  const topbarPage=document.createElement('div');
  topbarPage.className='topbar-page';
  topbarPage.textContent=pageTitle;
  const actions=topbar.querySelector('.actions');
  if(actions) topbar.insertBefore(topbarPage, actions);
  else topbar.appendChild(topbarPage);
  topbar.parentNode.insertBefore(shell, topbar);
  shell.appendChild(sidebar);
  appMain.appendChild(topbar);
  appMain.appendChild(main);
  if(footer) appMain.appendChild(footer);
  shell.appendChild(appMain);
  shell.appendChild(backdrop);
  document.body.classList.add('sidebar-layout');
  // Reveal only after the sidebar column has laid out (avoids full-width→narrow flash).
  // On product page also wait for CMS seed paint so static→CMS media swap isn't visible.
  scheduleShellReveal();
}
function scheduleShellReveal(){
  const ready=()=>document.documentElement.classList.add('sidebar-ready');
  const afterLayout=(fn)=>{
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(()=>requestAnimationFrame(fn));
    else setTimeout(fn,0);
  };
  // Only wait for CMS paint when product-cms.js is actually on the page.
  const needsProductCms = document.body.classList.contains('product-page')
    && !!document.querySelector('script[src*="product-cms.js"]');
  afterLayout(()=>{
    if(!needsProductCms || document.body.classList.contains('product-cms-painted')){
      ready();
      return;
    }
    const started=Date.now();
    const poll=()=>{
      if(document.body.classList.contains('product-cms-painted') || Date.now()-started>2500){
        ready();
        return;
      }
      if(typeof requestAnimationFrame==='function') requestAnimationFrame(poll);
      else setTimeout(poll,16);
    };
    poll();
  });
}
function bindSidebar(){
  const close=()=>{
    $('sidebar')?.classList.remove('open');
    $('sidebarBackdrop')?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  };
  $('menuBtn')?.addEventListener('click',()=>{
    $('sidebar')?.classList.toggle('open');
    $('sidebarBackdrop')?.classList.toggle('open');
    document.body.classList.toggle('sidebar-open');
  });
  $('sidebarBackdrop')?.addEventListener('click',close);
  document.querySelectorAll('#mainNav a').forEach(a=>a.addEventListener('click',()=>{ if(window.matchMedia('(max-width:980px)').matches) close(); }));
}
function initSidebarNav(){
  const parentPage={'notice.html':'notices.html','patch-note.html':'patch-notes.html','board-post.html':'board.html','board-write.html':'board.html','ticket.html':'my-tickets.html','guide.html':'guide/index.html'};
  const file=parentPage[page]||page||'index.html';
  const path=location.pathname.replace(/\\/g,'/').toLowerCase();
  const inGuideCms=page==='guide.html' || /\/guide\//.test(path);
  document.querySelectorAll('#mainNav a[href]').forEach(a=>{
    const href=a.getAttribute('href')||'';
    const target=href.split('/').pop()?.split('?')[0]||'';
    const isGuideCmsLink=a.getAttribute('data-nav')==='guides';
    let active=false;
    if(inGuideCms) active = isGuideCmsLink;
    else active = target===file && !isGuideCmsLink;
    a.classList.toggle('active', active);
  });
}

const SALE_PROMO_HIDE_KEY = 'midiai_sale_promo_hide_day'; // legacy dismiss key (unused for new promotions popup)

function promoDismissKey(promo){
  const id = String(promo?.promotionId || promo?.id || 'legacy');
  const ver = String(promo?.version || 1);
  return `midiai_promo_dismiss_${id}_v${ver}`;
}

function salePromoCopy(){
  const uiLang = lang === 'en' || lang === 'ja' ? lang : 'ko';
  const promos = getActiveHomepagePromotions(!!currentLicenseLifetime);
  const promo = promos[0];
  if(!promo) return null;
  const pricing = getPricingCache();
  const catalog = pricing?.products || [];
  const resolved = resolvePromotionProducts(promo, catalog, {
    lang: uiLang,
    maxVisible: PROMO_POPUP_MAX_VISIBLE,
    forceActive: false
  });
  return buildPromotionPopupCopy(promo, {
    discountPercent: resolved.discountPercent
  }, uiLang, resolved);
}

function todayKey(){
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function shouldShowSalePromo(){
  if(!isPromoPopupActive()) return false;
  const home = !page || page==='index.html' || page==='';
  if(!home) return false;
  if(currentLicenseLifetime) return false;
  const copy = salePromoCopy();
  if(!copy || !copy.promo) return false;
  try{
    if(localStorage.getItem(promoDismissKey(copy.promo)) === '1') return false;
  }catch(_){}
  return !!(copy.title || (copy.products && copy.products.length));
}

function closeSalePromo(root, hideToday){
  if(hideToday){
    try{
      const copy = salePromoCopy();
      if(copy?.promo) localStorage.setItem(promoDismissKey(copy.promo), '1');
    }catch(_){}
  }
  root.classList.remove('is-open');
  setTimeout(()=>root.remove(), 280);
  if(root._cleanup) root._cleanup();
}

function openSalePromoPopup(){
  if(document.querySelector('.sale-promo-backdrop')) return;
  const t=salePromoCopy();
  if(!t || !t.promo) return;
  const base=window.MIDIAI_BASE_PATH||'./';
  const purchaseHref = t.href || (lang==='en' ? `${base}en/purchase.html` : lang==='ja' ? `${base}ja/purchase.html` : `${base}purchase.html`);
  const overlay=document.createElement('div');
  overlay.innerHTML = renderPromotionPopupHtml(t, { purchaseHref, preview: false });
  const root = overlay.firstElementChild;
  if(!root) return;
  document.body.appendChild(root);
  requestAnimationFrame(()=>root.classList.add('is-open'));

  const dismiss=()=>closeSalePromo(root, !!root.querySelector('#salePromoHideToday')?.checked);
  root.querySelector('.sale-promo-x')?.addEventListener('click', dismiss);
  root.querySelector('[data-close]')?.addEventListener('click', dismiss);
  root.addEventListener('click', (e)=>{ if(e.target===root) dismiss(); });
  const onKey=(e)=>{ if(e.key==='Escape') dismiss(); };
  document.addEventListener('keydown', onKey);
  root._cleanup=()=>document.removeEventListener('keydown', onKey);
}

function initSalePromoPopup(){
  maybeShowSalePromo();
}
function maybeShowSalePromo(){
  if(!shouldShowSalePromo()) return;
  if(document.querySelector('.sale-promo-backdrop')) return;
  setTimeout(openSalePromoPopup, 600);
}

showOAuthBrowserNotice();
bindBoardLightbox();
document.documentElement.classList.add('auth-pending');
setTimeout(()=>{
  document.documentElement.classList.remove('auth-pending');
},8000);
initSidebarLayout();
if(!document.documentElement.classList.contains('sidebar-ready')){
  // initSidebarLayout already scheduled reveal when shell was built; this covers early-exit paths.
  if(!document.body.classList.contains('sidebar-layout')) scheduleShellReveal();
}
initTopbarActions();
bindSidebar();
applyStaticI18n();
document.addEventListener('midiai:static-i18n', () => applyStaticI18n());
applyGuidesI18n(lang);
initSidebarNav();
setAuthUiSignedOut();
// Sale popup waits for ensurePricing via refreshPricingUi / maybeShowSalePromo

initForms();
initAuth();
initPurchasePhone();
initPayPal();
initPurchasePoints();
