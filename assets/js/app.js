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
  promoPopupCopy
} from './pricing.js?v=sale-fix-4';
import {
  renderMarkdown,
  renderMarkdownInto,
  bindMarkdownInteractions,
  mountMarkdownEditor,
  openMarkdownPreview,
  ensureMarkdownCss,
  pickMarkdownSource
} from './markdown/index.js?v=md-placeholder-1';

const CONFIG = window.MIDIAI_CONFIG || {};
const $ = (id) => document.getElementById(id);
const qs = (s, root = document) => root.querySelector(s);
const page = location.pathname.split('/').pop() || 'index.html';
const pathLower = location.pathname.toLowerCase();
const pathLang = pathLower.includes('/en/') ? 'en' : pathLower.includes('/ja/') ? 'ja' : pathLower.includes('/ko/') ? 'ko' : '';
const isPurchasePage = page === 'purchase.html' || pathLower.endsWith('/purchase') || pathLower.endsWith('/purchase/');
const isRootKoreanPurchasePage = isPurchasePage && !pathLang;

let lang = pathLang || localStorage.getItem('midiai_lang') || document.documentElement.lang || 'ko';
if (!['ko','en','ja'].includes(lang)) lang = 'ko';
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
let adminBoardRows = [];
let selectedAdminUid = null;
let adminCrmSelected = new Set();
let adminCrmPostSelected = new Set();
let adminCrmFilteredRows = [];
let adminCrmPage = 1;
let adminCrmSearchTimer = null;
let adminCrmMemoTimer = null;
let adminCrmExpandedHwid = new Set();
const ADMIN_CRM_PAGE_SIZE = 5;
const ADMIN_CRM_ROW_H = 48;
let adminCrmHwidRevealed = false;
let adminCrmDirty = false;
let adminCrmBaseline = null;
let adminCrmDetailTimer = null;
let adminCrmRecentFeed = [];
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
let boardCommentFocusDone = false;
let userNotifyPrefs = { inApp:true, email:false, boardComment:true, ticketReply:true, licenseChange:true };

const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const I18N = {
  en: {
    '번호':'No.','글쓴이':'Author','작성일':'Date','포털':'Portal','커뮤니티':'Community','고객지원':'Support','지원':'Support','계정':'Account','홈':'Home','제품':'Product','다운로드':'Downloads','구매':'Purchase','변환가이드':'Conversion Guides','전체 가이드':'All Guides','변환 가이드':'Conversion Guides','MIDI 변환 가이드':'MIDI Conversion Guides','변환 FAQ':'Conversion FAQ','가이드':'Guides','소개':'About','회사·제작자':'Company / Creator','지원하는 워크플로':'Supported workflows','제품 보기':'View product','입력부터 편집·악보까지 MidiAI Studio 한 앱에서 이어집니다.':'From input to editing and scores — all in one MidiAI Studio app.','입력':'Input','코어':'Core','결과':'Output','피아노 커버·영상 링크를 분석해 MIDI로 변환':'Analyze piano covers and video links into MIDI','MP3 / Audio → MIDI':'MP3 / Audio → MIDI','MP3·WAV 등 오디오 파일을 AI로 변환':'Convert MP3, WAV, and other audio with AI','악보 PDF를 인식해 편집 가능한 MIDI로':'Recognize score PDFs into editable MIDI','AI MIDI 변환':'AI MIDI conversion','MidiAI Studio가 입력을 MIDI로 변환하는 중심 엔진':'The core engine that turns inputs into MIDI','멀티트랙 피아노 롤에서 노트·벨로시티 편집':'Edit notes and velocity in a multi-track piano roll','MusicXML / PDF 악보':'MusicXML / PDF scores','MIDI ↔ 악보 변환과 악보 워크플로':'MIDI ↔ score conversion and score workflows','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','변환된 MIDI를 인쇄용 PDF·MusicXML 악보로':'Turn converted MIDI into printable PDF and MusicXML scores','라이브러리 저장':'Library save','변환·편집한 MIDI를 모아 다시 열어 작업':'Collect converted MIDI and reopen to keep working','YouTube URL을 붙여넣거나 검색해 피아노 커버·연주 영상을 불러옵니다. 웨이브폼으로 구간을 고른 뒤 AI가 MIDI로 변환합니다.':'Paste a YouTube URL or search for piano covers and performances. Pick a range on the waveform, then convert to MIDI with AI.','MP3, WAV 등 로컬 오디오를 업로드해 변환합니다. 미리듣기로 구간을 확인한 뒤 원하는 악기로 MIDI를 받을 수 있습니다.':'Upload local audio such as MP3 or WAV. Preview the range, then export MIDI for your chosen instrument.','스캔·인쇄용 악보 PDF를 인식해 편집 가능한 MIDI로 바꿉니다. 추출된 음표는 MIDI 편집·악보 워크플로로 바로 이어집니다.':'Recognize scanned or print-ready score PDFs into editable MIDI. Extracted notes flow straight into MIDI editing and score workflows.','YouTube·오디오·PDF 입력을 MIDI로 바꾸는 중심 엔진입니다. 악기 선택, 구간 지정, 변환 진행을 한곳에서 처리합니다.':'The core engine that turns YouTube, audio, and PDF inputs into MIDI. Choose instruments, set ranges, and track conversion in one place.','변환된 MIDI를 멀티트랙 피아노 롤에서 바로 편집합니다. 노트, 벨로시티, CC, 양자화까지 프로 편집이 가능합니다.':'Edit converted MIDI right away in a multi-track piano roll — notes, velocity, CC, and quantize included.','변환·편집한 MIDI를 인쇄용 PDF 악보와 MusicXML로 내보냅니다. 악보 미리보기와 결과 폴더 저장을 지원합니다.':'Export converted MIDI as printable PDF scores and MusicXML, with score preview and save-to-results support.','변환·편집한 MIDI를 라이브러리에 모아 두고, 나중에 다시 열어 편집·악보 변환을 이어갈 수 있습니다.':'Keep converted MIDI in the library and reopen later to continue editing or score conversion.','PDF·YouTube·MP3·Audio·MusicXML·MIDI→PDF 변환 가이드와 심화 아티클을 모았습니다.':'Practical conversion guides and in-depth articles for PDF, YouTube, MP3, Audio, MusicXML, and MIDI→PDF.','PDF·YouTube·MP3·Audio·MusicXML 변환 가이드와 심화 아티클을 모았습니다.':'Practical conversion guides and in-depth articles for PDF, YouTube, MP3, Audio, and MusicXML.','PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — 검색 의에 맞춘 실용 가이드와 50개 심화 아티클.':'PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — practical guides and 50 in-depth articles matched to search intent.','공지사항':'Notices','패치노트 목록':'Patch notes list','운영 안내, 이벤트, 중요 공지를 확인합니다.':'Check service notices, events, and important updates.','패치노트':'Patch notes','FAQ':'FAQ','자유게시판':'Free board','글쓰기':'Write','댓글':'Comments','댓글 등록':'Post comment','답글':'Reply','추천':'Like','조회':'Views','1:1 문의':'Support','1:1 문의 작성':'Create ticket','나의 문의':'My tickets','내 계정':'Account','관리자':'Admin','로그아웃':'Logout','문의 작성':'Create ticket','전체 보기':'View all',
    '7월 31일까지 할인 진행중':'Discount available until July 31','피아노 커버를':'Piano covers','프로 MIDI':'pro MIDI','로':'into MIDI','MIDI로 바꾸는':'into MIDI','가장 쉬운 방법':'made easy','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'The easiest way to turn piano covers into MIDI','MidiAI Studio 공식 포털입니다.':'MidiAI Studio official portal.','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'Use purchase, downloads, notices, patch notes, and 1:1 support.','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio official portal. The home page focuses on product, purchase, and downloads; notices, patch notes, and private support are separated into board-style pages.',
    '라이선스 구매하기':'Buy license','무료 체험 다운로드':'Download free trial','1:1 문의하기':'Contact support','Windows 지원':'Windows support','Google 계정 연동':'Google account linked','비공개 문의':'Private support','업데이트, 이벤트, 운영 안내를 확인합니다.':'Check updates, events, and service notices.','버전별 변경 사항을 확인합니다.':'Check changes by version.','비공개 문의를 작성하고 답변을 확인합니다.':'Create private tickets and check replies.','라이선스 상태와 로그인 정보를 확인합니다.':'Check license status and login details.','바로가기':'Open','문의하기':'Contact','확인하기':'View','최신 설치 파일':'Latest installer','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Shows the latest version from Firestore downloads/latest.','불러오는 중...':'Loading...','최신 설치 파일과 버전 정보를 확인합니다.':'Check the latest installer and version info.',
    'Google 로그인':'Sign in with Google','로그인 전':'Not signed in','Google 로그인으로 라이선스 확인 준비':'Sign in with Google to check your license','라이선스 확인 전':'License not checked',
    '공지 상세':'Notice detail','자주 묻는 질문':'FAQ','비공개 1:1 문의':'Private support','문의 등록':'Submit ticket','문의 상세':'Ticket detail','라이선스 구매':'Buy license','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'Add patch note','공지 등록':'Add notice','FAQ 등록':'Add FAQ','라이선스 저장':'Save license','문의 답변':'Ticket replies','공지 작성':'Write notice','패치노트 작성':'Write patch note','FAQ 작성':'Write FAQ','라이선스 지급/수정':'Grant/edit license',
    '제목':'Title','내용':'Content','검색':'Search','버전':'Version','질문':'Question','답변':'Answer','순서':'Order','상단 고정':'Pin to top','플랜':'Plan','상태':'Status','메모':'Memo','사용자 UID':'User UID','등록':'Submit','저장':'Save','문의 내용을 자세히 적어주세요.':'Please describe your issue in detail.','로그인 오류 / 라이선스 문의':'Login issue / license question','로그인이 필요합니다.':'Sign-in required.','내가 작성한 비공개 문의와 답변을 확인합니다.':'View your private tickets and replies.','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'Only you and the admin can view this ticket. Please sign in first.','role=admin 계정만 사용할 수 있습니다.':'Only role=admin accounts can use this page.',
    '답변 완료':'Answered','종료':'Closed','접수':'Open','권한이 없습니다.':'You do not have permission.','관리자 로그인이 필요합니다.':'Admin sign-in required.','표시할 내용이 없습니다.':'Nothing to show.','확인 실패':'Check failed','저장 완료':'Saved','수정':'Edit','삭제':'Delete','종료 처리':'Close','관리':'Manage','상세 보기':'Open detail','공지 관리':'Manage notices','패치노트 관리':'Manage patch notes','FAQ 관리':'Manage FAQ','정말 삭제할까요?':'Delete this item?','수정 완료':'Updated','삭제 완료':'Deleted','문의가 등록되었습니다.':'Ticket created.',
    '이용약관':'Terms of use','개인정보처리방침':'Privacy policy','환불정책':'Refund policy','사업자정보':'Business info','고객센터':'Support','AI 기반 MIDI 변환 소프트웨어':'AI-powered MIDI conversion software','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AI-powered MIDI conversion software · digital license',
    '피아노 커버 작업실':'Piano cover studio','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'Load a YouTube link or audio file and convert it to MIDI with AI.','변환·편집·악보 변환·악보 편집까지 한 앱에서 이어집니다.':'Conversion, editing, score conversion, and score editing — all in one app.','영상·오디오를 MIDI로':'Video & audio to MIDI','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'Start with a YouTube link, local upload, or song search. Preview the waveform, pick a range, and export MIDI for your instrument.','YouTube 링크 분석':'YouTube link analysis','웨이브폼 미리듣기':'Waveform preview','출력 악기·구간 선택':'Choose instrument & range','MIDI 편집 PRO':'MIDI Editor PRO','멀티트랙 피아노 롤':'Multi-track piano roll','변환된 MIDI를 바로 편집합니다. 128종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'Edit converted MIDI right away — 128 instruments, velocity/pitch bend/modulation, undo/copy/quantize.','128종 악기 지원':'128 instruments','벨로시티·CC 파라미터 편집':'Velocity & CC editing','악보 변환 · BETA':'Score conversion · BETA','MIDI ↔ 악보':'MIDI ↔ Score','MIDI를 PDF·MusicXML 악보로 저장하고, PDF 악보를 인식해 MIDI로 다시 변환합니다. 곡 제목·작사·작곡 메타데이터까지 함께 다룰 수 있습니다.':'Save MIDI as PDF/MusicXML scores, and recognize PDF scores back into MIDI — with title, lyricist, and composer metadata.','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','PDF → MIDI 변환':'PDF → MIDI conversion','악보 미리보기 · 결과 폴더 저장':'Score preview · save to results folder','악보 편집기 · BETA':'Score editor · BETA','악보를 바로 수정':'Edit scores directly','변환된 악보를 페이지·연속·타임라인으로 보며 음표와 벨로시티를 편집합니다. AI 검토 제안으로 피치 점프·겹침 음표 등을 확인하고 바로 반영할 수 있습니다.':'View converted scores in page, continuous, or timeline mode and edit notes and velocity. Use AI review suggestions for pitch jumps and overlapping notes.','페이지 / 연속 / 타임라인 보기':'Page / continuous / timeline views','음표 선택·속성 편집':'Note selection & property editing','AI 검토 제안':'AI review suggestions','홈 · 포털 연동':'Home · portal sync','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'Check notices, patch notes, and license status in-app, then jump into Studio.','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'After Google sign-in, browse and post on the free board from the app.','라이브러리':'Library','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'Manage converted and edited MIDI files in the library and reopen them anytime.','정식 라이선스 혜택':'Full license benefits','전체 구간 MIDI 변환':'Full-song MIDI conversion','악기 변환':'Instrument conversion','제한 없는 저장 · full song export':'Unlimited save · full song export','MIDI 편집 기능':'MIDI editing features','악보 변환 · MIDI ↔ PDF':'Score conversion · MIDI ↔ PDF','악보 편집기':'Score editor',
    '공식 설치 · 업데이트 프로그램':'Official installer & updater','MidiAI Installer는 MidiAI Studio의 설치·업데이트·복구와 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다. Install / Update 한 번으로 자동 설치 또는 업데이트가 진행됩니다.':'MidiAI Installer is a Windows tool for install, update, repair, and runtime checks in one screen. One Install / Update action automatically installs or updates.','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installer is a Windows tool for install, update, repair, and runtime checks.','설치 방법':'How to install','실행 · 업데이트 방법':'How to run & update','결제 정보':'Payment details','주문자 정보':'Buyer','휴대폰 번호':'Phone number','결제수단':'Payment method','상품명':'Product','판매가격':'Price','결제형태':'Payment type','단건 결제':'One-time payment','서비스 제공기간':'Service delivery','결제 완료 후 즉시 라이선스 발급':'License issued immediately after payment','Google 로그인 계정 기준':'Based on your Google account','Google 로그인 후 자동 입력':'Filled after Google sign-in','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'Buyer contact required for Korean card checkout.','결제 버튼을 준비하고 있습니다.':'Preparing payment buttons.','라이선스 안내':'License guide','계좌 입금 안내':'Bank transfer guide','사이트 메뉴':'Site menu','게시판 메뉴':'Board menu',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'A place to share questions, reviews, and tips freely.','게시글 목록':'Posts','공지 목록':'Notices','공지':'Notice','← 목록':'← Back','목록':'Back','유형':'Type','(제목 없음)':'(No title)','로그인 후 게시글을 작성할 수 있습니다.':'Sign in to write a post.','자주 묻는 질문과 답변을 빠르게 확인하세요.':'Quick answers to common questions.','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Check your Google sign-in and license status.',
    '신규':'New','개선':'Improved','수정':'Fixed','변경':'Changed','변경 사항':'Changes','내용이 없습니다.':'No content.','목차':'Contents','최신':'Newer','이전':'Older','버전 이동':'Version navigation','공유':'Share','전체 패치노트':'All patch notes','문의':'Support',
    '소식':'News','패치':'Patch','피아노 커버·오디오·악보를':'Piano covers, audio & scores','MidiAI Studio는 Windows용 AI MIDI 변환 소프트웨어입니다. YouTube·MP3·오디오를 MIDI로 바꾸고, PDF/MusicXML 악보 워크플로까지 이어갑니다.':'MidiAI Studio is Windows AI MIDI conversion software. Turn YouTube, MP3, and audio into MIDI, then continue into PDF/MusicXML score workflows.','분석':'Analyze','풍선':'Balloon','god Best 피아노 모음 · 04:36:46':'god Best Piano Collection · 04:36:46','선택 정보':'Selection','길이 04:36:45':'Length 04:36:45','MIDI 변환':'MIDI convert','MIDI로 변환':'Convert to MIDI','YouTube 검색 중...':'Searching YouTube...','길이와 제목 정보 분석 중...':'Analyzing length and title...','미리듣기 오디오/웨이브폼 준비 중...':'Preparing preview audio / waveform...','트랙 범위':'Track range','미리듣기':'Preview','정지':'Stop','초기화':'Reset',
    'YouTube 링크나 MP3/오디오를 불러와 AI가 MIDI로 변환합니다.':'Load a YouTube link or MP3/audio and convert it to MIDI with AI.','PDF·MusicXML 악보 변환과 MIDI 편집까지 한 앱에서 이어집니다.':'Continue into PDF/MusicXML score conversion and MIDI editing in one app.','PDF / YouTube / MP3 가이드':'PDF / YouTube / MP3 guides','관련 변환 가이드':'Related conversion guides','가이드 허브':'Guide hub',
    'MidiAI Studio를 만드는 사람들':'The people behind MidiAI Studio','MidiAI Studio는 피아노 커버·오디오·악보를 MIDI로 변환하고 편집하는 Windows 소프트웨어입니다. 이 페이지는 Google과 사용자가 제품을 신뢰할 수 있도록 ':'MidiAI Studio is Windows software for converting and editing piano covers, audio, and scores to MIDI. This page clearly discloses ','제작자, 회사, 연락처, 업데이트, 지원':'author, company, contact, updates, and support',' 정보를 명확히 공개합니다.':' information so Google and users can trust the product.','제작자 · Author':'Author',' — 대표 · Product Lead. AI MIDI 변환, MIDI 편집, 악보(MusicXML/PDF) 워크플로를 실제 연주자·제작자 관점에서 설계합니다.':' — Founder & Product Lead. Designs AI MIDI conversion, MIDI editing, and score (MusicXML/PDF) workflows from a performer/creator perspective.','문의:':'Contact:','회사 정보 · Organization':'Organization','상세:':'Details:','제품 신뢰 · Software credibility':'Software credibility','MidiAI Studio는 브라우저 일회성 도구가 아니라 ':'MidiAI Studio is not a one-off browser tool — it is an ','설치형 Windows 앱':'installed Windows app','입니다. Google 로그인 라이선스, 공식 다운로드, Lifetime 구매, 버전별 패치노트를 제공합니다.':'. It provides Google sign-in licensing, official downloads, Lifetime purchase, and versioned patch notes.','제품 기능':'Product features',' — AI 오디오→MIDI, MIDI 편집, 악보 변환':' — AI audio→MIDI, MIDI editing, score conversion',' — 최신 설치 파일':' — Latest installer',' — Lifetime 라이선스':' — Lifetime license',' — 업데이트·버전 이력':' — Updates & version history','SEO 가이드':'SEO guides','고객 지원 · Support':'Support','MIDI 변환 FAQ (20+)':'MIDI converter FAQ (20+)','를 운영합니다.':' are available.','법적 고지':'Legal','지금 시작하기':'Get started','무료 체험으로 YouTube·오디오→MIDI 변환을 확인하세요.':'Try the free trial to convert YouTube/audio to MIDI.','개인정보':'Privacy',
    '← 나의 문의':'← My tickets','새 문의':'New ticket','게시글':'Post','댓글을 입력하세요':'Write a comment','댓글 불러오는 중...':'Loading comments...','사진/영상/MIDI 첨부':'Attach photo / video / MIDI','JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 파일당 50MB · 최대 5개':'JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 50MB each · max 5','첨부한 파일이 없습니다.':'No files attached.','이모티콘':'Emoji','이모티콘 선택':'Choose emoji','이모티콘을 눌러 내용에 삽입합니다.':'Tap an emoji to insert it into the post.'
  },
  ja: {
    '번호':'番号','글쓴이':'投稿者','작성일':'作成日','포털':'ポータル','커뮤니티':'コミュニティ','고객지원':'サポート','지원':'サポート','계정':'アカウント','홈':'ホーム','제품':'製品','다운로드':'ダウンロード','구매':'購入','변환가이드':'変換ガイド','전체 가이드':'ガイド一覧','변환 가이드':'変換ガイド','MIDI 변환 가이드':'MIDI変換ガイド','변환 FAQ':'変換FAQ','가이드':'ガイド','소개':'紹介','회사·제작자':'会社・制作','지원하는 워크플로':'対応ワークフロー','제품 보기':'製品を見る','입력부터 편집·악보까지 MidiAI Studio 한 앱에서 이어집니다.':'入力から編集・楽譜まで、MidiAI Studioひとつでつながります。','입력':'入力','코어':'コア','결과':'結果','피아노 커버·영상 링크를 분석해 MIDI로 변환':'ピアノカバーや動画リンクを解析してMIDIに変換','MP3 / Audio → MIDI':'MP3 / Audio → MIDI','MP3·WAV 등 오디오 파일을 AI로 변환':'MP3・WAVなどのオーディオをAIで変換','악보 PDF를 인식해 편집 가능한 MIDI로':'楽譜PDFを認識して編集可能なMIDIに','AI MIDI 변환':'AI MIDI変換','MidiAI Studio가 입력을 MIDI로 변환하는 중심 엔진':'入力をMIDIに変換するMidiAI Studioの中核エンジン','멀티트랙 피아노 롤에서 노트·벨로시티 편집':'マルチトラックピアノロールでノート・ベロシティを編集','MusicXML / PDF 악보':'MusicXML / PDF楽譜','MIDI ↔ 악보 변환과 악보 워크플로':'MIDI ↔ 楽譜変換と楽譜ワークフロー','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','변환된 MIDI를 인쇄용 PDF·MusicXML 악보로':'変換したMIDIを印刷用PDF・MusicXML楽譜に','라이브러리 저장':'ライブラリ保存','변환·편집한 MIDI를 모아 다시 열어 작업':'変換・編集したMIDIをまとめて再度開いて作業','YouTube URL을 붙여넣거나 검색해 피아노 커버·연주 영상을 불러옵니다. 웨이브폼으로 구간을 고른 뒤 AI가 MIDI로 변환합니다.':'YouTubeのURLを貼るか検索してピアノカバー・演奏動画を読み込みます。波形で区間を選び、AIがMIDIに変換します。','MP3, WAV 등 로컬 오디오를 업로드해 변환합니다. 미리듣기로 구간을 확인한 뒤 원하는 악기로 MIDI를 받을 수 있습니다.':'MP3やWAVなどのローカル音声をアップロードして変換。プレビューで区間を確認し、希望の楽器でMIDIを取得できます。','스캔·인쇄용 악보 PDF를 인식해 편집 가능한 MIDI로 바꿉니다. 추출된 음표는 MIDI 편집·악보 워크플로로 바로 이어집니다.':'スキャンや印刷用の楽譜PDFを認識して編集可能なMIDIに変換。抽出した音符はMIDI編集・楽譜ワークフローへそのまま続きます。','YouTube·오디오·PDF 입력을 MIDI로 바꾸는 중심 엔진입니다. 악기 선택, 구간 지정, 변환 진행을 한곳에서 처리합니다.':'YouTube・音声・PDF入力をMIDIに変える中核エンジン。楽器選択、区間指定、変換進行を一か所で処理します。','변환된 MIDI를 멀티트랙 피아노 롤에서 바로 편집합니다. 노트, 벨로시티, CC, 양자화까지 프로 편집이 가능합니다.':'変換したMIDIをマルチトラックピアノロールですぐ編集。ノート、ベロシティ、CC、クオンタイズまでプロ編集が可能です。','변환·편집한 MIDI를 인쇄용 PDF 악보와 MusicXML로 내보냅니다. 악보 미리보기와 결과 폴더 저장을 지원합니다.':'変換・編集したMIDIを印刷用PDF楽譜とMusicXMLで書き出します。楽譜プレビューと結果フォルダ保存に対応します。','변환·편집한 MIDI를 라이브러리에 모아 두고, 나중에 다시 열어 편집·악보 변환을 이어갈 수 있습니다.':'変換・編集したMIDIをライブラリにまとめ、あとで再度開いて編集・楽譜変換を続けられます。','PDF·YouTube·MP3·Audio·MusicXML·MIDI→PDF 변환 가이드와 심화 아티클을 모았습니다.':'PDF・YouTube・MP3・Audio・MusicXML・MIDI→PDFの変換ガイドと詳細記事をまとめています。','PDF·YouTube·MP3·Audio·MusicXML 변환 가이드와 심화 아티클을 모았습니다.':'PDF・YouTube・MP3・Audio・MusicXMLの変換ガイドと詳細記事をまとめています。','PDF to MIDI, YouTube to MIDI, MP3 to MIDI, Audio to MIDI, MusicXML — 검색 의에 맞춘 실용 가이드와 50개 심화 아티클.':'PDF to MIDI、YouTube to MIDI、MP3 to MIDI、Audio to MIDI、MusicXML — 検索意図に合わせた実践ガイドと50本の詳細記事。','공지사항':'お知らせ','패치노트 목록':'パッチノート一覧','운영 안내, 이벤트, 중요 공지를 확인합니다.':'運営案内、イベント、重要なお知らせを確認できます。','패치노트':'パッチノート','FAQ':'FAQ','자유게시판':'自由掲示板','글쓰기':'投稿','댓글':'コメント','댓글 등록':'コメント投稿','답글':'返信','추천':'いいね','조회':'閲覧','1:1 문의':'お問い合わせ','1:1 문의 작성':'問い合わせ作成','나의 문의':'マイ問い合わせ','내 계정':'アカウント','관리자':'管理者','로그아웃':'ログアウト','문의 작성':'問い合わせ作成','전체 보기':'すべて見る',
    '7월 31일까지 할인 진행중':'7月31日まで割引中','피아노 커버를':'ピアノカバーを','프로 MIDI':'プロMIDI','로':'に','MIDI로 바꾸는':'MIDIに変える','가장 쉬운 방법':'一番簡単な方法','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'ピアノカバーをMIDIに変える一番簡単な方法','MidiAI Studio 공식 포털입니다.':'MidiAI Studio公式ポータルです。','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'購入・ダウンロード・お知らせ・パッチノート・お問い合わせをご利用いただけます。','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio公式ポータルです。ホームは紹介・購入・ダウンロードを中心にし、お知らせ・パッチノート・非公開問い合わせは別ページに分けました。',
    '라이선스 구매하기':'ライセンス購入','무료 체험 다운로드':'無料体験ダウンロード','1:1 문의하기':'問い合わせる','Windows 지원':'Windows対応','Google 계정 연동':'Googleアカウント連携','비공개 문의':'非公開問い合わせ','업데이트, 이벤트, 운영 안내를 확인합니다.':'アップデート、イベント、運営案内を確認できます。','버전별 변경 사항을 확인합니다.':'バージョン別の変更内容を確認できます。','비공개 문의를 작성하고 답변을 확인합니다.':'非公開問い合わせを作成し、返信を確認できます。','라이선스 상태와 로그인 정보를 확인합니다.':'ライセンス状態とログイン情報を確認できます。','바로가기':'開く','문의하기':'問い合わせ','확인하기':'確認','최신 설치 파일':'最新インストーラー','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Firestore downloads/latest を基準に最新バージョンを表示します。','불러오는 중...':'読み込み中...','최신 설치 파일과 버전 정보를 확인합니다.':'最新インストーラーとバージョン情報を確認できます。',
    'Google 로그인':'Googleログイン','로그인 전':'未ログイン','Google 로그인으로 라이선스 확인 준비':'Googleログインでライセンス確認','라이선스 확인 전':'ライセンス未確認',
    '공지 상세':'お知らせ詳細','자주 묻는 질문':'よくある質問','비공개 1:1 문의':'非公開お問い合わせ','문의 등록':'送信','문의 상세':'問い合わせ詳細','라이선스 구매':'ライセンス購入','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'パッチノート登録','공지 등록':'お知らせ登録','FAQ 등록':'FAQ登録','라이선스 저장':'ライセンス保存','문의 답변':'問い合わせ返信','공지 작성':'お知らせ作成','패치노트 작성':'パッチノート作成','FAQ 작성':'FAQ作成','라이선스 지급/수정':'ライセンス付与/修正',
    '제목':'タイトル','내용':'内容','검색':'検索','버전':'バージョン','질문':'質問','답변':'回答','순서':'順序','상단 고정':'上部固定','플랜':'プラン','상태':'状態','메모':'メモ','사용자 UID':'ユーザーUID','등록':'登録','저장':'保存','문의 내용을 자세히 적어주세요.':'お問い合わせ内容を詳しく入力してください。','로그인 오류 / 라이선스 문의':'ログインエラー / ライセンス問い合わせ','로그인이 필요합니다.':'ログインが必要です。','내가 작성한 비공개 문의와 답변을 확인합니다.':'自分の非公開問い合わせと返信を確認します。','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。','role=admin 계정만 사용할 수 있습니다.':'role=adminアカウントのみ使用できます。',
    '답변 완료':'回答済み','종료':'終了','접수':'受付','권한이 없습니다.':'権限がありません。','관리자 로그인이 필요합니다.':'管理者ログインが必要です。','표시할 내용이 없습니다.':'表示する内容がありません。','확인 실패':'確認失敗','저장 완료':'保存完了','수정':'編集','삭제':'削除','종료 처리':'終了にする','관리':'管理','상세 보기':'詳細を見る','공지 관리':'お知らせ管理','패치노트 관리':'パッチノート管理','FAQ 관리':'FAQ管理','정말 삭제할까요?':'本当に削除しますか？','수정 완료':'更新しました','삭제 완료':'削除しました','문의가 등록되었습니다.':'問い合わせを登録しました。',
    '이용약관':'利用規約','개인정보처리방침':'プライバシーポリシー','환불정책':'返金ポリシー','사업자정보':'事業者情報','고객센터':'サポート','AI 기반 MIDI 변환 소프트웨어':'AIベースMIDI変換ソフト','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AIベースMIDI変換ソフト · デジタルライセンス商品',
    '피아노 커버 작업실':'ピアノカバー作業室','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'YouTubeリンクやオーディオファイルを読み込み、AIがMIDIに変換します。','변환·편집·악보 변환·악보 편집까지 한 앱에서 이어집니다.':'変換・編集・楽譜変換・楽譜編集まで1つのアプリで続けられます。','영상·오디오를 MIDI로':'映像・オーディオをMIDIに','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'YouTubeリンクの貼り付け、ローカルアップロード、曲検索で作業を開始。波形プレビューと区間選択後、希望の楽器でMIDIを取得できます。','YouTube 링크 분석':'YouTubeリンク解析','웨이브폼 미리듣기':'波形プレビュー','출력 악기·구간 선택':'出力楽器・区間選択','MIDI 편집 PRO':'MIDI編集 PRO','멀티트랙 피아노 롤':'マルチトラックピアノロール','변환된 MIDI를 바로 편집합니다. 128종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'変換したMIDIをすぐ編集。128種楽器、ベロシティ・ピッチベンド・モジュレーション、元に戻す/コピー/クオンタイズまで対応。','128종 악기 지원':'128種楽器対応','벨로시티·CC 파라미터 편집':'ベロシティ・CC編集','악보 변환 · BETA':'楽譜変換 · BETA','MIDI ↔ 악보':'MIDI ↔ 楽譜','MIDI를 PDF·MusicXML 악보로 저장하고, PDF 악보를 인식해 MIDI로 다시 변환합니다. 곡 제목·작사·작곡 메타데이터까지 함께 다룰 수 있습니다.':'MIDIをPDF・MusicXML楽譜として保存し、PDF楽譜を認識してMIDIに再変換。曲名・作詞・作曲メタデータにも対応。','MIDI → PDF / MusicXML':'MIDI → PDF / MusicXML','PDF → MIDI 변환':'PDF → MIDI変換','악보 미리보기 · 결과 폴더 저장':'楽譜プレビュー・結果フォルダ保存','악보 편집기 · BETA':'楽譜エディター · BETA','악보를 바로 수정':'楽譜をその場で編集','변환된 악보를 페이지·연속·타임라인으로 보며 음표와 벨로시티를 편집합니다. AI 검토 제안으로 피치 점프·겹침 음표 등을 확인하고 바로 반영할 수 있습니다.':'変換した楽譜をページ・連続・タイムライン表示で確認し、音符とベロシティを編集。AIレビュー提案でピッチジャンプや重なり音符をすぐ反映できます。','페이지 / 연속 / 타임라인 보기':'ページ / 連続 / タイムライン表示','음표 선택·속성 편집':'音符選択・属性編集','AI 검토 제안':'AIレビュー提案','홈 · 포털 연동':'ホーム・ポータル連携','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'お知らせ、パッチノート、ライセンス状態をアプリ内で確認しStudioへ移動できます。','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'Googleログイン後、自由掲示板の投稿をアプリで確認・作成できます。','라이브러리':'ライブラリ','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'変換・編集したMIDIをライブラリで管理し、再度開いて作業を続けられます。','정식 라이선스 혜택':'正式ライセンス特典','전체 구간 MIDI 변환':'全曲MIDI変換','악기 변환':'楽器変換','제한 없는 저장 · full song export':'無制限保存 · full song export','MIDI 편집 기능':'MIDI編集機能','악보 변환 · MIDI ↔ PDF':'楽譜変換 · MIDI ↔ PDF','악보 편집기':'楽譜エディター',
    '공식 설치 · 업데이트 프로그램':'公式インストール・更新プログラム','MidiAI Installer는 MidiAI Studio의 설치·업데이트·복구와 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다. Install / Update 한 번으로 자동 설치 또는 업데이트가 진행됩니다.':'MidiAI Installerは、インストール・更新・修復とランタイム確認を1画面で行うWindows専用ツールです。Install / Updateを一度押すだけで自動インストールまたは更新が進みます。','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installerは、インストール・更新・修復とランタイム確認を1画面で行うWindows専用ツールです。','설치 방법':'インストール方法','실행 · 업데이트 방법':'実行・更新方法','결제 정보':'決済情報','주문자 정보':'購入者情報','휴대폰 번호':'携帯電話番号','결제수단':'決済手段','상품명':'商品名','판매가격':'販売価格','결제형태':'決済形態','단건 결제':'単発決済','서비스 제공기간':'サービス提供','결제 완료 후 즉시 라이선스 발급':'決済完了後すぐにライセンス発行','Google 로그인 계정 기준':'Googleログインアカウント基準','Google 로그인 후 자동 입력':'Googleログイン後に表示','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'韓国カード決済時に必要な連絡先です。','결제 버튼을 준비하고 있습니다.':'決済ボタンを準備しています。','라이선스 안내':'ライセンス案内','계좌 입금 안내':'銀行振込案内','사이트 메뉴':'サイトメニュー','게시판 메뉴':'掲示板メニュー',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'質問・レビュー・情報を自由に共有する場所です。','게시글 목록':'投稿一覧','공지 목록':'お知らせ一覧','공지':'お知らせ','← 목록':'← 一覧','목록':'一覧','유형':'種類','(제목 없음)':'（タイトルなし）','로그인 후 게시글을 작성할 수 있습니다.':'ログイン後に投稿できます。','자주 묻는 질문과 답변을 빠르게 확인하세요.':'よくある質問と回答を素早く確認できます。','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Googleログイン情報とライセンス状態を確認できます。',
    '신규':'新規','개선':'改善','수정':'修正','변경':'変更','변경 사항':'変更内容','내용이 없습니다.':'内容がありません。','목차':'目次','최신':'新しい版','이전':'前の版','버전 이동':'バージョン移動','공유':'共有','전체 패치노트':'パッチノート一覧','문의':'問い合わせ',
    '소식':'ニュース','패치':'パッチ','피아노 커버·오디오·악보를':'ピアノカバー・オーディオ・楽譜を','MidiAI Studio는 Windows용 AI MIDI 변환 소프트웨어입니다. YouTube·MP3·오디오를 MIDI로 바꾸고, PDF/MusicXML 악보 워크플로까지 이어갑니다.':'MidiAI StudioはWindows向けAI MIDI変換ソフトです。YouTube・MP3・オーディオをMIDIに変え、PDF/MusicXML楽譜ワークフローまでつなげます。','분석':'解析','풍선':'風船','god Best 피아노 모음 · 04:36:46':'god Best ピアノコレクション · 04:36:46','선택 정보':'選択情報','길이 04:36:45':'長さ 04:36:45','MIDI 변환':'MIDI変換','MIDI로 변환':'MIDIに変換','YouTube 검색 중...':'YouTube検索中...','길이와 제목 정보 분석 중...':'長さとタイトル情報を解析中...','미리듣기 오디오/웨이브폼 준비 중...':'プレビュー音声/波形を準備中...','트랙 범위':'トラック範囲','미리듣기':'プレビュー','정지':'停止','초기화':'初期化',
    'YouTube 링크나 MP3/오디오를 불러와 AI가 MIDI로 변환합니다.':'YouTubeリンクやMP3/オーディオを読み込み、AIがMIDIに変換します。','PDF·MusicXML 악보 변환과 MIDI 편집까지 한 앱에서 이어집니다.':'PDF・MusicXML楽譜変換とMIDI編集まで1つのアプリで続けられます。','PDF / YouTube / MP3 가이드':'PDF / YouTube / MP3ガイド','관련 변환 가이드':'関連変換ガイド','가이드 허브':'ガイドハブ',
    'MidiAI Studio를 만드는 사람들':'MidiAI Studioをつくる人たち','MidiAI Studio는 피아노 커버·오디오·악보를 MIDI로 변환하고 편집하는 Windows 소프트웨어입니다. 이 페이지는 Google과 사용자가 제품을 신뢰할 수 있도록 ':'MidiAI Studioはピアノカバー・オーディオ・楽譜をMIDIに変換・編集するWindowsソフトです。このページはGoogleとユーザーが製品を信頼できるよう ','제작자, 회사, 연락처, 업데이트, 지원':'制作者・会社・連絡先・更新・サポート',' 정보를 명확히 공개합니다.':'情報を明確に公開します。','제작자 · Author':'制作者 · Author',' — 대표 · Product Lead. AI MIDI 변환, MIDI 편집, 악보(MusicXML/PDF) 워크플로를 실제 연주자·제작자 관점에서 설계합니다.':' — 代表 · Product Lead。AI MIDI変換、MIDI編集、楽譜(MusicXML/PDF)ワークフローを演奏者・制作者の視点で設計します。','문의:':'お問い合わせ:','회사 정보 · Organization':'会社情報 · Organization','상세:':'詳細:','제품 신뢰 · Software credibility':'製品信頼 · Software credibility','MidiAI Studio는 브라우저 일회성 도구가 아니라 ':'MidiAI Studioはブラウザの使い捨てツールではなく ','설치형 Windows 앱':'インストール型Windowsアプリ','입니다. Google 로그인 라이선스, 공식 다운로드, Lifetime 구매, 버전별 패치노트를 제공합니다.':'です。Googleログインライセンス、公式ダウンロード、Lifetime購入、バージョン別パッチノートを提供します。','제품 기능':'製品機能',' — AI 오디오→MIDI, MIDI 편집, 악보 변환':' — AIオーディオ→MIDI、MIDI編集、楽譜変換',' — 최신 설치 파일':' — 最新インストーラー',' — Lifetime 라이선스':' — Lifetimeライセンス',' — 업데이트·버전 이력':' — 更新・バージョン履歴','SEO 가이드':'SEOガイド','고객 지원 · Support':'カスタマーサポート · Support','MIDI 변환 FAQ (20+)':'MIDI変換FAQ (20+)','를 운영합니다.':'を運営しています。','법적 고지':'法的告知','지금 시작하기':'今すぐ始める','무료 체험으로 YouTube·오디오→MIDI 변환을 확인하세요.':'無料トライアルでYouTube・オーディオ→MIDI変換を確認してください。','개인정보':'プライバシー',
    '← 나의 문의':'← マイ問い合わせ','새 문의':'新しい問い合わせ','게시글':'投稿','댓글을 입력하세요':'コメントを入力','댓글 불러오는 중...':'コメント読み込み中...','사진/영상/MIDI 첨부':'写真/動画/MIDI添付','JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 파일당 50MB · 최대 5개':'JPG/PNG/WEBP/GIF/MP4/WEBM/MIDI · 各50MB · 最大5件','첨부한 파일이 없습니다.':'添付ファイルはありません。','이모티콘':'絵文字','이모티콘 선택':'絵文字を選択','이모티콘을 눌러 내용에 삽입합니다.':'絵文字を押して本文に挿入します。'
  }
};



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
  const target = lang === 'en' ? './en/purchase.html' : lang === 'ja' ? './ja/purchase.html' : './purchase.html';
  document.querySelectorAll('a[href$="purchase.html"], a[href="./purchase.html"], a[href="../purchase.html"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if(href.includes('/en/purchase.html') || href.includes('/ja/purchase.html')) return;
    if(pathLang && !isPurchasePage){
      a.setAttribute('href', lang === 'ko' ? '../purchase.html' : `../${lang}/purchase.html`);
    } else if(!pathLang && !isPurchasePage){
      a.setAttribute('href', target);
    }
  });
}

function applyStaticI18n(){
  document.documentElement.lang = lang;
  localStorage.setItem('midiai_lang', lang);
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

  document.querySelectorAll('input[placeholder], textarea[placeholder], button[title], a[title]').forEach(el => {
    for (const attr of ['placeholder','title']) {
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
  if(path.includes('/workflow')){
    const h1 = document.querySelector('.workflow-seo h1')?.textContent?.trim();
    if(h1) return h1.length > 34 ? `${h1.slice(0,32)}…` : h1;
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
    notify_board_comment:'님이 회원님의 글에 댓글을 남겼습니다.', notify_ticket_reply:'문의에 답변이 등록되었습니다.', notify_license_change:'라이선스가 변경되었습니다.', notify_notice:'새 공지사항이 등록되었습니다.', notify_patch_note:'새 패치노트가 등록되었습니다.', notify_aria:'알림',
    profile_menu_aria:'계정 메뉴', profile_my_account:'내 계정', profile_my_tickets:'나의 문의', profile_my_posts:'내 작성글', profile_notify_settings:'알림 설정',
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
    notify_board_comment:' commented on your post.', notify_ticket_reply:'A reply was posted on your ticket.', notify_license_change:'Your license was updated.', notify_notice:'A new notice was published.', notify_patch_note:'A new patch note was published.', notify_aria:'Notifications',
    profile_menu_aria:'Account menu', profile_my_account:'Account', profile_my_tickets:'My tickets', profile_my_posts:'My posts', profile_notify_settings:'Notification settings',
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
    notify_board_comment:'さんがあなたの投稿にコメントしました。', notify_ticket_reply:'お問い合わせに返信がありました。', notify_license_change:'ライセンスが変更されました。', notify_notice:'新しいお知らせが登録されました。', notify_patch_note:'新しいパッチノートが登録されました。', notify_aria:'通知',
    profile_menu_aria:'アカウントメニュー', profile_my_account:'アカウント', profile_my_tickets:'マイ問い合わせ', profile_my_posts:'自分の投稿', profile_notify_settings:'通知設定',
    board_mine_title:'自分の投稿', board_mine_desc:'自由掲示板で自分が書いた投稿だけを表示します。', board_mine_all:'すべての投稿', board_mine_only:'自分の投稿',
    notify_settings_title:'通知設定', notify_pref_inapp:'アプリ通知', notify_pref_email:'メール通知', notify_pref_saved:'保存しました'
  };
  const T = lang === 'en' ? EN : lang === 'ja' ? JA : KO;
  return T[k] || KO[k] || k;
}

function fmtDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d ? d.toLocaleString(lang==='ja'?'ja-JP':lang==='en'?'en-US':'ko-KR') : ''; } catch { return ''; } }
function fmtListDate(v){ try{ const d=v?.toDate?v.toDate():(v?new Date(v):null); if(!d)return '-'; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`; }catch{return '';} }
function licenseTsMs(v){
  if(v==null || v==='') return 0;
  if(typeof v==='number' && Number.isFinite(v)) return v>1e12 ? v : v*1000;
  if(typeof v?.toMillis==='function') return v.toMillis();
  if(typeof v?.toDate==='function'){ const t=v.toDate().getTime(); return Number.isFinite(t)?t:0; }
  const sec=Number(v?.seconds||v?._seconds||0);
  if(sec) return sec*1000;
  const d=new Date(v);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}
function licenseDateBoundsActive(d, nowMs=Date.now()){
  if(!d) return false;
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
  if((plan==='lifetime' || !plan) && licenseTsMs(lic?.expiresAt)) return 'period';
  if(plan==='monthly') return 'period';
  if(plan==='trial' || plan==='lifetime' || plan==='period') return plan;
  // developer/admin were mistaken "plans"; missing/unknown → trial
  return 'trial';
}
function normalizeStatus(lic){
  if(!lic) return 'active';
  const status=String(lic.status||'').toLowerCase().trim();
  if(status==='banned' || status==='suspended') return 'banned';
  if(status==='expired' || status==='refunded') return 'expired';
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

function normalizeAdminLicensePlanForSave(plan, expiresAtVal){
  const p=String(plan||'lifetime').toLowerCase();
  if(p==='lifetime' && expiresAtVal) return 'period';
  return p;
}
function buildAdminLicenseDateFields(){
  const {deleteField}=firestoreApi;
  const startVal=$('adminLicenseStartsAt')?.value||'';
  const endVal=$('adminLicenseExpiresAt')?.value||'';
  const startsAt=dateInputToStartTimestamp(startVal);
  const expiresAt=dateInputToEndTimestamp(endVal);
  return {
    startsAt: startsAt || deleteField(),
    expiresAt: expiresAt || deleteField()
  };
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
function patchNavHtml(nav){
  if(!nav || (!nav.prev && !nav.next)) return '';
  const newer = nav.prev ? `<a class="patch-nav-link is-newer" href="./patch-note.html?id=${encodeURIComponent(nav.prev.id)}"><span>${esc(tt('최신'))}</span><b>${nav.prev.version?`v${esc(nav.prev.version)}`:esc(nav.prev.title||'')}</b></a>` : '';
  const older = nav.next ? `<a class="patch-nav-link is-older" href="./patch-note.html?id=${encodeURIComponent(nav.next.id)}"><span>${esc(tt('이전'))}</span><b>${nav.next.version?`v${esc(nav.next.version)}`:esc(nav.next.title||'')}</b></a>` : '';
  return `<nav class="patch-detail-nav" aria-label="${esc(tt('버전 이동'))}">${newer}${older}</nav>`;
}
function patchDetailHtml(d, nav=null){
  const version = d.version ? esc(d.version) : '';
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
        ${version?`<span class="patch-version-pill">v${version}</span>`:''}
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
function clearUnsubs(){ while(unsubscribers.length){ try{unsubscribers.pop()();}catch{} } }




function isKoreanCheckout(){
  return isPurchasePage && (isRootKoreanPurchasePage || pathLang === 'ko');
}
function purchaseCheckout(){
  const uiLang = isKoreanCheckout() ? 'ko' : (pathLang || lang || 'en');
  return checkoutContext(uiLang, isKoreanCheckout());
}
function purchaseDisplayPrice(){
  return purchaseCheckout().displaySale || (isKoreanCheckout() ? (CONFIG.priceDisplayKr || '130,000원') : (CONFIG.priceDisplayGlobal || '$89 USD'));
}
function purchaseAmountValue(){
  const ctx = purchaseCheckout();
  if(isKoreanCheckout() || ctx.currency === 'KRW') return Number(ctx.salePrice || CONFIG.priceValueKr || 130000);
  if(ctx.currency === 'JPY') return String(Math.round(Number(ctx.salePrice)));
  return Number(ctx.salePrice).toFixed(2);
}
function purchaseCurrency(){
  return purchaseCheckout().currency || (isKoreanCheckout() ? 'KRW' : (CONFIG.currencyGlobal || 'USD'));
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
  const box = $('purchaseResultBox');
  if(!box) return;
  const amount = Number(result?.amount || CONFIG.priceValueKr || 130000);
  const amountText = amount.toLocaleString('ko-KR') + '원';
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="purchase-success-card">
      <h3>결제 및 라이선스 등록이 완료되었습니다.</h3>
      <p>현재 로그인한 Google 계정에 MidiAI Studio 평생 라이선스가 등록되었습니다.</p>
      <p class="muted">프로그램에서 같은 Google 계정으로 로그인하면 FULL LICENSE가 자동 적용됩니다.</p>
      <ul class="purchase-success-meta">
        <li><span>주문번호</span><strong>${esc(result?.paymentId || '-')}</strong></li>
        <li><span>결제수단</span><strong>카카오페이</strong></li>
        <li><span>결제금액</span><strong>${esc(amountText)}</strong></li>
        <li><span>라이선스 상태</span><strong>활성화 완료</strong></li>
        <li><span>계정</span><strong>${esc(maskEmail(result?.email || currentUser?.email || ''))}</strong></li>
      </ul>
    </div>`;
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
  const kakaoBtn = $('kakaoPayBtn');
  const cardBtn = $('inicisCardPayBtn');
  const t = purchaseLocaleText();
  if(currentLicenseLifetime){
    if(kakaoBtn){
      kakaoBtn.disabled = true;
      kakaoBtn.setAttribute('aria-disabled', 'true');
      kakaoBtn.classList.add('is-disabled');
      const label = kakaoBtn.querySelector('strong');
      if(label) label.textContent = t.alreadyOwnedButton || t.kakaoButton || '카카오페이로 구매';
    }
    if(cardBtn){
      cardBtn.disabled = true;
      cardBtn.setAttribute('aria-disabled', 'true');
      cardBtn.classList.add('is-disabled');
    }
    renderPurchaseOwnedNotice();
    paypalStatus(t.alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.', 'ok');
    return;
  }
  if(kakaoBtn){
    kakaoBtn.disabled = false;
    kakaoBtn.removeAttribute('aria-disabled');
    kakaoBtn.classList.remove('is-disabled');
    const label = kakaoBtn.querySelector('strong');
    if(label) label.textContent = t.kakaoButton || '카카오페이로 구매';
  }
  if(cardBtn){
    cardBtn.disabled = false;
    cardBtn.removeAttribute('aria-disabled');
    cardBtn.classList.remove('is-disabled');
  }
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
      {title:'Orchestra conversion',desc:'Generate MIDI for piano, guitar, bass, and other instruments.'},
      {title:'MIDI Editor PRO',desc:'Edit multi-track piano rolls with velocity and CC parameters.'},
      {title:'AI Assistant',desc:'Refine MIDI quality with AI suggestions during conversion and editing.'},
      {title:'Score conversion',desc:'Convert MIDI to PDF/MusicXML and PDF scores back to MIDI.'},
      {title:'Score editor',desc:'Edit converted scores and apply AI review suggestions.'}
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
    verifying:'Verifying payment and assigning your license...',
    complete:'Payment complete. Your Lifetime license has been assigned automatically.',
    cancel:'Payment canceled.',
    error:'PayPal payment error: '
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
      {title:'オーケストラ変換',desc:'ピアノ・ギター・ベースなど希望の楽器でMIDIを生成します。'},
      {title:'MIDI編集 PRO',desc:'マルチトラックピアノロールでベロシティやCCを編集できます。'},
      {title:'AIアシスタント',desc:'変換・編集中にAI提案でMIDI品質を素早く整えられます。'},
      {title:'楽譜変換',desc:'MIDI → PDF/MusicXML、PDF → MIDI変換に対応します。'},
      {title:'楽譜エディター',desc:'変換した楽譜を編集し、AIレビュー提案を反映できます。'}
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
    verifying:'決済を確認し、ライセンスを付与しています...',
    complete:'決済が完了しました。Lifetimeライセンスが自動付与されました。',
    cancel:'決済がキャンセルされました。',
    error:'PayPal決済エラー: '
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
      {title:'오케스트라 변환',desc:'피아노·기타·베이스 등 원하는 악기로 MIDI를 생성합니다.'},
      {title:'MIDI 편집 PRO',desc:'멀티트랙 피아노 롤에서 벨로시티·CC 파라미터를 편집합니다.'},
      {title:'AI 어시스턴트',desc:'변환·편집 중 AI 제안으로 MIDI 품질을 빠르게 다듬습니다.'},
      {title:'악보 변환',desc:'MIDI → PDF/MusicXML, PDF → MIDI 변환을 지원합니다.'},
      {title:'악보 편집기',desc:'변환된 악보를 바로 수정하고 AI 검토 제안을 반영합니다.'}
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
    verifying:'결제를 검증하고 라이선스를 지급하는 중입니다...',
    complete:'결제가 완료되었습니다. Lifetime 라이선스가 자동 지급되었습니다.',
    cancel:'결제가 취소되었습니다.',
    error:'PayPal 결제 오류: '
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
  if($('purchaseHeroLead')) $('purchaseHeroLead').textContent = lang==='en' ? 'A Lifetime license for faster and more reliable AI-powered MIDI conversion.' : lang==='ja' ? 'AIベースのMIDI変換をより快適に使えるLifetimeライセンスです。' : 'AI 기반 MIDI 변환을 더 빠르고 안정적으로 사용할 수 있는 Lifetime 라이선스입니다.';
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
  if($('purchaseReviewPrice')) $('purchaseReviewPrice').textContent = purchaseDisplayPrice();
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
  const el = $('paypalStatus');
  if(!el) return;
  el.className = 'muted small paypal-status ' + type;
  el.textContent = msg || '';
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
  import('./pricing-admin.js?v=pricing-promo-1').then((m)=>{
    m.initPricingAdmin({ db, firestoreApi, isAdmin: true });
  }).catch((e)=>console.warn('pricing-admin', e));
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
      if(id) location.href = `./notice.html?id=${encodeURIComponent(id)}`;
      return;
    }
    if(kind==='patchNotes'){
      data = await openEditModal(hubAdminLabels().writePatch, [
        {name:'version', label:'버전', value:'', required:true},
        {name:'title', label:'제목', value:'', required:true},
        {name:'content', label:'내용', type:'markdown', value:'', required:true, draftKey:'hub:patchNotes:new'}
      ]);
      if(!data) return;
      const id = await adminAdd('patchNotes',{version:data.version, title:data.title, content:data.content, contentMarkdown:data.content, contentFormat:'markdown', viewCount:0, email:currentUser?.email||''});
      if(id) location.href = `./patch-note.html?id=${encodeURIComponent(id)}`;
      return;
    }
    if(kind==='faq'){
      data = await openEditModal(hubAdminLabels().writeFaq, [
        {name:'question', label:'질문', value:'', required:true},
        {name:'answer', label:'답변', type:'markdown', value:'', required:true, draftKey:'hub:faq:new'},
        {name:'order', label:'순서', type:'number', value:1}
      ]);
      if(!data) return;
      await adminAdd('faq',{question:data.question, answer:data.answer, contentMarkdown:data.answer, contentFormat:'markdown', order:Number(data.order||1)});
      adminFlash(tr('saved'));
      return;
    }
  }catch(e){
    alert(e.message || e);
  }
}
function setAuthUiSignedOut(){
  stopTicketNotifyListener();
  stopAdminTicketNotifyListener();
  clearUnsubs();
  clearTicketReplyObserver();
  dismissAllAppToasts();
  updateTicketUnreadBadges(0);
  updateAdminTicketUnreadBadges(0);
  stopUserNotifications();
  setNotifyBellVisible(false);
  pendingTicketOpenId = '';
  pendingAdminTicketOpenId = '';
  userNotifyPrefs = defaultNotifyPrefs();
  currentUser = null; currentUserDoc = null; isAdminUser = false;
  currentLicenseActive = false;
  currentLicenseLifetime = false;
  accountLicenseDoc = null;
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
    applyPurchaseLifetimeGate();
  }
  updatePurchaseAccountBox();
  updateSupportFormUi();
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

function accountLoginMethodLabel(){
  const providers = currentUser?.providerData || [];
  if(providers.some(p=>String(p?.providerId||'').includes('google'))) return 'Google';
  if(providers.length) return providers[0].providerId || 'Google';
  return 'Google';
}

function accountLicensePlanLabel(d){
  const plan=normalizePlan(d);
  if(plan==='lifetime') return lang==='en' ? 'Lifetime' : lang==='ja' ? 'Lifetime' : '평생';
  if(plan==='period') return lang==='en' ? 'Period' : lang==='ja' ? '期間制' : '기간제';
  return lang==='en' ? 'Trial' : lang==='ja' ? '体験版' : '체험판';
}

function accountLicensePlanTitle(d){
  const plan=normalizePlan(d);
  if(plan==='lifetime') return 'Lifetime License';
  if(plan==='period') return lang==='en' ? 'Period License' : lang==='ja' ? '期間ライセンス' : 'Period License';
  return 'Trial License';
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
  if(plan==='lifetime') return lang==='en' ? 'Lifetime' : lang==='ja' ? '無期限' : '평생 이용';
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

function updateAccountCtas({plan, lifetime, downloadUrl}){
  const el=$('accountHeroCta'); if(!el) return;
  el.classList.remove('hidden');
  el.removeAttribute('target');
  el.removeAttribute('rel');
  if(isAdminUser){
    el.textContent = lang==='en' ? 'Admin page' : lang==='ja' ? '管理ページ' : '관리자 페이지';
    el.setAttribute('href', './admin.html');
    return;
  }
  if(lifetime || plan==='lifetime'){
    el.textContent = lang==='en' ? 'Download latest' : lang==='ja' ? '最新版をダウンロード' : '최신 버전 다운로드';
    const href = downloadUrl || './downloads.html';
    el.setAttribute('href', href);
    if(downloadUrl){ el.setAttribute('target','_blank'); el.setAttribute('rel','noopener'); }
    return;
  }
  // trial / period → purchase
  el.textContent = lang==='en' ? 'Buy Lifetime license' : lang==='ja' ? 'Lifetime ライセンス購入' : 'Lifetime 라이선스 구매';
  el.setAttribute('href', './purchase.html');
}

function accountSupportDiscordHref(){
  const url = String(CONFIG?.supportDiscordUrl || '').trim();
  return url || './support.html';
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
  const latestVersion = downloadData?.version ? `v${downloadData.version}` : '-';
  const downloadUrl = downloadData?.url || '';
  const installedVersion = lang==='en' ? 'Check in app' : lang==='ja' ? 'アプリで確認' : '앱에서 확인';
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
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">🎖</span><h2>License</h2></header>
    <div class="account-panel-body">
      <p class="account-license-title is-plan-${esc(plan)}">${esc(planTitle)}</p>
      ${accountField(lang==='en'?'Role':lang==='ja'?'権限':'권한', roleLabel)}
      ${accountField(lang==='en'?'Status':lang==='ja'?'状態':'상태', statusLabel)}
      ${accountField(dateLabel, dateValue)}
      ${accountField(lang==='en'?'Expires':lang==='ja'?'有効期限':'만료일', expiryValue)}
    </div>
  </article>`;

  const accountCard = `<article class="hub-card account-panel account-panel-account">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">👤</span><h2>${esc(lang==='en'?'Account':lang==='ja'?'アカウント':'계정 정보')}</h2></header>
    <div class="account-panel-body">
      ${accountField(lang==='en'?'Name':lang==='ja'?'名前':'이름', name)}
      ${accountField(lang==='en'?'Email':lang==='ja'?'メール':'이메일', email)}
      ${accountField(lang==='en'?'Sign-in':lang==='ja'?'ログイン方式':'로그인 방식', loginMethod)}
    </div>
  </article>`;

  const dlLabel = lang==='en'?'Download latest':lang==='ja'?'最新版をダウンロード':'최신 버전 다운로드';
  const notesLabel = lang==='en'?'Release notes':lang==='ja'?'更新履歴':'업데이트 내역 보기';
  const dlBtn = downloadUrl
    ? `<a class="primary mini-btn" href="${esc(downloadUrl)}" target="_blank" rel="noopener">${esc(dlLabel)}</a>`
    : `<a class="primary mini-btn" href="./downloads.html">${esc(dlLabel)}</a>`;

  const downloadCard = `<article class="hub-card account-panel account-panel-download">
    <header class="account-panel-head"><span class="account-panel-icon" aria-hidden="true">⬇</span><h2>Download</h2></header>
    <div class="account-panel-body">
      ${accountField(lang==='en'?'Latest version':lang==='ja'?'最新バージョン':'최신 버전', latestVersion)}
      ${accountField(lang==='en'?'Installed version':lang==='ja'?'インストール済み':'현재 설치 버전', installedVersion)}
      <div class="account-panel-actions">${dlBtn}<a class="secondary mini-btn" href="./patch-notes.html">${esc(notesLabel)}</a></div>
    </div>
  </article>`;

  const supportLabel = lang==='en'?'Support':lang==='ja'?'サポート':'고객센터';
  const contactLabel = lang==='en'?'Contact':lang==='ja'?'お問い合わせ':'문의하기';
  const discordAttrs = discordHref.startsWith('http') ? ' target="_blank" rel="noopener"' : '';

  const supportCard = `<article class="hub-card account-panel account-panel-support">
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

  box.innerHTML = `<div class="account-dashboard-grid">${licenseCard}${accountCard}${downloadCard}${supportCard}${developerCard}</div>`;
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
  currentUser=user;
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
  await loadLicense(user.uid);
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
    } else {
      const rawRole=String(old.role||'').toLowerCase();
      if(rawRole==='developer' || rawRole==='staff') data.role='admin';
      else if(!rawRole) data.role='user';
    }
    await setDoc(ref,data,{merge:true});
    currentUserDoc={...old,...data};
    userNotifyPrefs = normalizeNotifyPrefs(old.notifyPrefs || data.notifyPrefs || currentUserDoc.notifyPrefs);
    isAdminUser=normalizeRole(data.role || old.role)==='admin';
    setAdminNavVisible(isAdminUser);
    await ensureUserLicenseDoc(user.uid, { role: data.role || old.role || 'user' });
  } catch(e) {
    console.error('user upsert',e);
    isAdminUser=false;
    setAdminNavVisible(false);
  }
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
    updateAccountProfileBadges(d);
    if($('accountMeta')){
      const downloadData = await fetchAccountDownloadData();
      renderAccountDashboard(uid, d, downloadData);
    }
    applyPurchaseLifetimeGate();
  } catch(e) {
    console.error(e);
    currentLicenseLifetime = false;
    if(badge){ badge.className='badge none'; badge.textContent=tr('check_failed'); }
    if(sideBadge){ sideBadge.className='badge sidebar-license-badge none'; sideBadge.textContent=tr('check_failed'); }
    if($('accountMeta') && currentUser) renderAccountDashboard(uid, null, latestDownloadData);
  }
}

async function initAuth(){
  const clearAuthPending=()=>document.documentElement.classList.remove('auth-pending');
  if(!configuredFirebase()){ console.error('Firebase config missing or invalid',CONFIG.firebase); clearAuthPending(); return; }
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
    onAuthStateChanged(auth,u=>{clearAuthPending();u?setAuthUiSignedIn(u):setAuthUiSignedOut();});
    routeLoadPublic();
  }catch(e){
    console.error('initAuth failed', e);
    clearAuthPending();
  }
}

function listenDoc(collectionName, documentId, render){
  const {doc,onSnapshot}=firestoreApi;
  return addUnsub(onSnapshot(doc(db,collectionName,documentId), snap => render(snap.exists()?{id:snap.id,...snap.data()}:null), err => { console.error(collectionName, err); render(null, err); }));
}
function listenVisibleDocs(collectionName, render, orderField='createdAt', direction='desc'){
  const {collection,query,where,orderBy,onSnapshot,getDocs}=firestoreApi;
  const q=query(collection(db,collectionName),where('visible','==',true),orderBy(orderField,direction));
  return addUnsub(onSnapshot(q,
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
async function refreshPricingUi(){
  if(!db || !firestoreApi) return;
  try{
    await ensurePricing(db, firestoreApi);
    updatePurchaseI18n();
    applyPurchaseSellGate();
    maybeShowSalePromo();
  }catch(e){ console.warn('refreshPricingUi', e); }
}
function routeLoadPublic(){
  if(!db) return;
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
      <label class="download-admin-field download-admin-field-full"><span>업데이트 설명</span><textarea id="dlAdminNotes" rows="3" placeholder="업데이트 설명">${esc(v.notes||v.description||'')}</textarea></label>
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
    box.innerHTML=`<div class="portal-download-inner download-card-pro portal-download-empty"><div class="download-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></div><div class="portal-download-meta"><h3>MidiAI Studio</h3><p class="muted">${tr('empty')}</p></div><div class="portal-download-actions"><a class="secondary" href="./purchase.html">${esc(t.buyLicense)}</a></div></div>${adminHtml}`;
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
  box.innerHTML=`<div class="home-updates-list">${rows.map(x=>`<a class="home-update-item" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><span class="home-update-tag is-patch">${x.version?`v${esc(x.version)}`:tt('패치')}</span><b>${esc(x.title)}</b><em>${esc(fmtListDate(x.createdAt))}</em></a>`).join('')}</div>`;
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
  list.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${rows.map(x=>`<a class="hub-list-row hub-notice-row" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><div class="hub-col-no">${no--}</div><div class="hub-col-title"><b>${x.version?`<span class="badge active">v${esc(x.version)}</span>`:''}<span class="hub-col-title-text">${esc(x.title)}</span></b></div>${authorCellHtml({...x, authorRole:'admin', displayName:noticeAuthor(x)})}<div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`).join('')}</div>`;
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
    const {doc, updateDoc} = firestoreApi;
    await updateDoc(doc(db,'supportTickets',ticketId), { replyRead:true, replyNotified:true });
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
function openEditModal(title, fields){
  const hasMarkdown = fields.some(f => f.type === 'markdown');
  return new Promise(async resolve => {
    ensureMarkdownCss();
    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-backdrop';
    const form = document.createElement('form');
    form.className = 'edit-modal' + (hasMarkdown ? ' md-edit-modal' : '');
    const actionHtml = hasMarkdown
      ? `<button type="button" class="secondary" data-cancel>취소</button><button type="button" class="secondary" data-preview>미리보기</button><button type="submit" class="primary">완료</button>`
      : `<button type="button" class="secondary" data-cancel>취소</button><button type="submit" class="primary">저장</button>`;
    form.innerHTML = `<div class="edit-modal-head"><h3>${esc(title)}</h3><button type="button" class="edit-modal-x" aria-label="close">×</button></div><div class="edit-modal-body"></div><div class="edit-modal-actions">${actionHtml}</div>`;
    const body = form.querySelector('.edit-modal-body');
    const mdHosts = {};
    const mdEditors = {};

    // Build DOM first (including markdown hosts) — mount editors only after visible
    for (const f of fields) {
      const row = document.createElement(f.type === 'markdown' ? 'div' : 'label');
      row.className = 'edit-field' + (f.type === 'markdown' ? ' edit-field-markdown' : '');
      row.innerHTML = `<span>${esc(f.label || f.name)}</span>`;
      let input;
      if (f.type === 'markdown') {
        const host = document.createElement('div');
        host.dataset.mdField = f.name;
        host.className = 'md-modal-editor-host';
        row.appendChild(host);
        body.appendChild(row);
        mdHosts[f.name] = { host, field: f };
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
      if (f.required) input.required = true;
      row.appendChild(input);
      body.appendChild(row);
    }

    overlay.appendChild(form);
    document.body.appendChild(overlay);

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
    const first = form.querySelector('input:not([type=checkbox]),textarea,select');
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
    await addDoc(collection(db,'supportTickets',ticketId,'replies'),{uid:currentUser.uid,role:isAdminUser?'admin':'user',displayName:isAdminUser?BRAND_AUTHOR:(currentUser.displayName||''),content,createdAt:serverTimestamp()});
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
      notifyTicketOwnerReply(ticketId, content).catch(err=>console.error(err));
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
    const hay = fields.map(f => x[f] || '').join(' ').toLowerCase();
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
function renderAdminPostTable(kind){
  const cfg = {
    notices: {box:'adminNoticeList', count:'adminNoticeCount', rows:adminNoticeRows, search:'adminNoticeSearch', status:'adminNoticeStatus', collection:'announcements', fields:['title','content'], title:x=>esc(x.title||'-'), sub:x=>x.pinned?'상단 고정':'', date:x=>fmtDate(x.createdAt)},
    patches: {box:'adminPatchList', count:'adminPatchCount', rows:adminPatchRows, search:'adminPatchSearch', status:'adminPatchStatus', collection:'patchNotes', fields:['version','title','content'], title:x=>`${x.version?`v${esc(x.version)} · `:''}${esc(x.title||'-')}`, sub:x=>'', date:x=>fmtDate(x.createdAt)},
    faq: {box:'adminFaqList', count:'adminFaqCount', rows:adminFaqRows, search:'adminFaqSearch', status:'adminFaqStatus', collection:'faq', fields:['question','answer'], title:x=>esc(x.question||'-'), sub:x=>`#${esc(x.order||'')}`, date:x=>fmtDate(x.createdAt)}
  }[kind];
  const box=$(cfg.box); if(!box)return;
  const rows=filterRows(cfg.rows,cfg.search,cfg.status,cfg.fields);
  $(cfg.count) && ($(cfg.count).textContent = `${rows.length} / ${cfg.rows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML = `<table class="admin-table"><thead><tr><th>제목</th><th>상태</th><th>작성일</th><th>관리</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${cfg.title(x)}</b>${cfg.sub(x)?`<small>${cfg.sub(x)}</small>`:''}</td><td>${statusPill(x)}</td><td>${esc(cfg.date(x))}</td><td>${adminActions(cfg.collection,x.id)}</td></tr>`).join('')}</tbody></table>`;
  bindAdminPostActions(box);
}
function getAdminTicketFilteredRows(){
  return filterRows(adminTicketRows,'adminTicketSearch','adminTicketStatus',['title','content','email','uid','category'])
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
      t.category?`<span><em>유형</em>${esc(ticketCategoryLabel(t.category))}</span>`:'',
      t.appVersion?`<span><em>버전</em>${esc(t.appVersion)}</span>`:'',
      t.os?`<span><em>OS</em>${esc(ticketOsLabel(t.os))}</span>`:'',
      t.email?`<span><em>이메일</em>${esc(t.email)}</span>`:''
    ].filter(Boolean).join('');
    const unreadAdmin = hasUnreadAdminTicket(t) ? ' is-unread' : '';
    return `<tr class="admin-ticket-row${open?' is-open':''}${unreadAdmin}" data-ticket-row="${esc(t.id)}">
      <td><label class="admin-ticket-check" onclick="event.stopPropagation()"><input type="checkbox" data-ticket-check="${esc(t.id)}"></label></td>
      <td>${esc(ticketCategoryLabel(t.category))}</td>
      <td>
        <button type="button" class="admin-ticket-title-btn" data-ticket-expand="${esc(t.id)}" aria-expanded="${open?'true':'false'}">
          <b>${esc(t.title||'-')}</b>
        </button>
      </td>
      <td><span class="mono">${esc(t.email||t.uid||'')}</span></td>
      <td>${statusPill(t)}</td>
      <td>${esc(fmtDate(t.updatedAt||t.createdAt))}</td>
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
  [['adminTicketSearch'],['adminTicketStatus']].forEach(([id])=>{ const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',renderAdminTicketTable); el.addEventListener('change',renderAdminTicketTable); });
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
      data = await openEditModal('패치노트 수정', [
        {name:'version', label:'버전', value:d.version||'', required:true},
        {name:'title', label:'제목', value:d.title||'', required:true},
        {name:'content', label:'내용', type:'markdown', value:pickMarkdownSource(d), required:true, draftKey:`hub:patchNotes:${id}`},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}
      ]);
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
  }catch(e){ alert(e.message); }
}
async function deleteAdminPost(raw){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!confirm(tr('confirm_delete')))return;
  const [collectionName,id]=String(raw).split(':');
  try{
    const {doc,deleteDoc}=firestoreApi;
    await deleteDoc(doc(db,collectionName,id));
    adminFlash(tr('deleted'));
    if(page==='notice.html' && collectionName==='announcements') location.href='./notices.html';
    else if(page==='patch-note.html' && collectionName==='patchNotes') location.href='./patch-notes.html';
  }catch(e){ alert(e.message); }
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
  bindAdminFilters();
  const {collection,onSnapshot,query,orderBy}=firestoreApi;
  if($('adminNoticeList')) addUnsub(onSnapshot(query(collection(db,'announcements'),orderBy('createdAt','desc')), snap=>{ adminNoticeRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('notices'); }));
  if($('adminPatchList')) addUnsub(onSnapshot(query(collection(db,'patchNotes'),orderBy('createdAt','desc')), snap=>{ adminPatchRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('patches'); }));
  if($('adminFaqList')) addUnsub(onSnapshot(query(collection(db,'faq'),orderBy('order','asc')), snap=>{ adminFaqRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminPostTable('faq'); }));
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
  if(typeof v==='number' && Number.isFinite(v)) return v>1e12 ? Math.floor(v/1000) : v;
  return Number(v?.seconds || v?._seconds || 0);
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
  completed: '결제 완료',
  pending: '결제 대기',
  failed: '결제 실패',
  cancelled: '결제 취소',
  canceled: '결제 취소',
  refunded: '환불',
  paid: '결제 완료',
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
  const plan = normalizePlan(lic);
  if(plan==='lifetime') return `<span class="crm-badge is-lifetime"><i></i>${esc(adminLicenseTypeLabel('lifetime'))}</span>`;
  if(plan==='period') return `<span class="crm-badge is-period"><i></i>${esc(adminLicenseTypeLabel('period'))}</span>`;
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
function getAdminCrmRows(){
  const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
  const st=$('adminUserLicenseStatus')?.value || 'all';
  const ordersF=$('adminCrmFilterOrders')?.value || 'all';
  const ticketsF=$('adminCrmFilterTickets')?.value || 'all';
  const sort=$('adminUserSort')?.value || 'lastLogin';
  let rows = adminUserRows.map(u=>{
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
  }).filter(u=>{
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
    const hay=[u.email,u.displayName,u.uid,u.id,u.hwid,u.license?.hwid,plan,status,role].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  rows.sort((a,b)=>{
    if(a.isFav!==b.isFav) return a.isFav ? -1 : 1;
    if(sort==='name') return String(a.displayName||a.email||'').localeCompare(String(b.displayName||b.email||''),'ko');
    if(sort==='createdAt') return adminTsSec(b.createdAt)-adminTsSec(a.createdAt);
    if(sort==='lastPayment') return (b.lastPaymentSec||0)-(a.lastPaymentSec||0);
    return adminTsSec(b.lastLogin||b.lastSeenAt)-adminTsSec(a.lastLogin||a.lastSeenAt);
  });
  return rows;
}
function renderAdminCrmStats(rows){
  const box=$('adminCrmStats'); if(!box) return;
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
  box.innerHTML=`
    <div class="crm-stat"><b>${all}</b><span>전체 회원</span></div>
    <div class="crm-stat"><b>${active}</b><span>활성</span></div>
    <div class="crm-stat"><b>${lifetime}</b><span>평생</span></div>
    <div class="crm-stat"><b>${trial}</b><span>체험판</span></div>
    <div class="crm-stat"><b>${todayJoin}</b><span>오늘 가입</span></div>
    <div class="crm-stat"><b>${idle7}</b><span>7일 미접속</span></div>
    <div class="crm-stat"><b>${idle30}</b><span>30일 미접속</span></div>
    <div class="crm-stat is-accent"><b>${rows.length}</b><span>필터 결과</span></div>`;
}
function renderAdminUserTable(){
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
    box.innerHTML=`<table class="admin-table user-admin-table"><thead><tr><th>회원</th><th>라이선스</th><th>HWID</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>${rows.map(u=>{
      const uid=u.uid||u.id; const lic=u.license; const active=lic && lic.licensed===true && String(lic.status||'').toLowerCase()==='active';
      return `<tr><td><b>${esc(u.displayName||'-')}</b><small>${esc(u.email||'')}<br><span class="mono">${esc(uid||'')}</span></small></td><td>${adminPlanBadgeHtml(lic)}</td><td><span class="mono">${esc(u.hwid||lic?.hwid||'-')}</span></td><td>${esc(fmtDate(u.lastLogin||u.lastSeenAt))}</td><td><div class="table-actions"><button class="secondary mini-btn" data-user-license="${esc(uid)}:lifetime:active">Lifetime</button><button class="secondary mini-btn" data-user-license="${esc(uid)}:trial:active">Trial</button><button class="secondary mini-btn danger-btn" data-user-license="${esc(uid)}:${esc(lic?.plan||'lifetime')}:banned">정지</button><button class="secondary mini-btn" data-user-hwid-reset="${esc(uid)}">HWID 초기화</button></div></td></tr>`;
    }).join('')}</tbody></table>`;
    bindAdminUserActions(box);
    return;
  }

  adminCrmFilteredRows = getAdminCrmRows();
  renderAdminCrmStats(adminCrmFilteredRows);
  $('adminUserCount') && ($('adminUserCount').textContent=`${adminCrmFilteredRows.length} / ${adminUserRows.length}`);
  updateAdminCrmBulkbar();
  if(!adminCrmFilteredRows.length){
    box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`;
    const pager=$('adminCrmPager');
    if(pager){ pager.hidden=true; pager.innerHTML=''; }
    return;
  }
  if(!box.dataset.pageBound){
    box.dataset.pageBound='1';
    box.addEventListener('click', onAdminCrmListClick);
  }
  const pager=$('adminCrmPager');
  if(pager && !pager.dataset.bound){
    pager.dataset.bound='1';
    pager.addEventListener('click', onAdminCrmPagerClick);
  }
  paintAdminCrmPagedList();
}
function adminCrmTotalPages(){
  return Math.max(1, Math.ceil(adminCrmFilteredRows.length / ADMIN_CRM_PAGE_SIZE));
}
function paintAdminCrmPagedList(){
  const box=$('adminUserList'); if(!box || !adminCrmFilteredRows.length) return;
  const total = adminCrmFilteredRows.length;
  const pages = adminCrmTotalPages();
  if(adminCrmPage > pages) adminCrmPage = pages;
  if(adminCrmPage < 1) adminCrmPage = 1;
  const start = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE;
  const slice = adminCrmFilteredRows.slice(start, start + ADMIN_CRM_PAGE_SIZE);
  box.innerHTML = `<div class="admin-crm-page-list">${slice.map(u=>adminCrmMemberCardHtml(u)).join('')}</div>`;
  renderAdminCrmPager(pages, total);
}
function renderAdminCrmPager(pages, total){
  const pager=$('adminCrmPager'); if(!pager) return;
  pager.hidden = false;
  const from = (adminCrmPage - 1) * ADMIN_CRM_PAGE_SIZE + 1;
  const to = Math.min(total, adminCrmPage * ADMIN_CRM_PAGE_SIZE);
  pager.innerHTML = `
    <button type="button" class="ghost mini-btn" data-crm-page="prev" ${adminCrmPage<=1?'disabled':''}>이전</button>
    <span class="admin-crm-pager-info">${adminCrmPage} / ${pages}</span>
    <button type="button" class="ghost mini-btn" data-crm-page="next" ${adminCrmPage>=pages?'disabled':''}>다음</button>
    <span class="admin-crm-pager-info muted">${from}–${to} · ${total}명</span>`;
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
        <span class="crm-meta-login">${esc(fmtRelative(u.lastLogin||u.lastSeenAt))}</span>
        <span class="crm-meta-num">주문 ${Number(u.orderCount||0)}</span>
        <span class="crm-meta-num">문의 ${Number(u.ticketCount||0)}</span>
      </div>
    </div>
  </article>`;
}
function onAdminCrmListClick(e){
  const check = e.target.closest('[data-crm-check]');
  if(check){
    const uid = check.getAttribute('data-crm-check');
    if(check.checked) adminCrmSelected.add(uid); else adminCrmSelected.delete(uid);
    updateAdminCrmBulkbar();
    return;
  }
  const card = e.target.closest('[data-admin-uid]');
  if(!card) return;
  selectAdminCrmUser(card.getAttribute('data-admin-uid'));
}
function updateAdminCrmBulkbar(){
  const bar=$('adminCrmBulkbar'); if(!bar) return;
  const n=adminCrmSelected.size;
  bar.hidden = n===0;
  $('adminCrmBulkCount') && ($('adminCrmBulkCount').textContent=`${n}명 선택`);
  const all=$('adminCrmSelectAll');
  if(all){
    const visibleIds = adminCrmFilteredRows.map(u=>u.uid);
    all.checked = visibleIds.length>0 && visibleIds.every(id=>adminCrmSelected.has(id));
    all.indeterminate = !all.checked && visibleIds.some(id=>adminCrmSelected.has(id));
  }
}
function selectAdminCrmUser(uid){
  if(!uid || !isAdminUser) return;
  if(selectedAdminUid===uid){ renderAdminCrmDetail(uid); return; }
  selectedAdminUid = uid;
  adminCrmHwidRevealed = false;
  adminCrmPostSelected.clear();
  paintAdminCrmVirtualList();
  showAdminCrmSkeleton(true);
  clearTimeout(adminCrmDetailTimer);
  adminCrmDetailTimer = setTimeout(()=>{
    renderAdminCrmDetail(uid);
    showAdminCrmSkeleton(false);
  }, 120);
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
function refreshAdminCrmDetail(){
  if(selectedAdminUid) renderAdminCrmDetail(selectedAdminUid);
}
function renderAdminCrmHwidBox(user, lic){
  const box=$('adminCrmHwidBox'); if(!box) return;
  const hwid = user.hwid || lic?.hwid || '';
  const shown = adminCrmHwidRevealed ? (hwid || '(없음)') : maskAdminHwid(hwid);
  box.innerHTML = `
    <div class="admin-crm-hwid-inline">
      <span class="admin-crm-hwid-label">HWID</span>
      <code class="mono admin-crm-hwid-value${adminCrmHwidRevealed?' is-revealed':''}">${esc(shown)}</code>
    </div>
    <div class="admin-crm-hwid-actions">
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-reveal">${adminCrmHwidRevealed?'숨기기':'보기'}</button>
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-copy" ${hwid?'':'disabled'}>복사</button>
      <button type="button" class="secondary mini-btn danger-btn" data-crm-action="hwid-reset">초기화</button>
    </div>`;
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
function renderAdminCrmDetail(uid){
  const empty=$('adminCrmEmpty');
  const body=$('adminCrmDetailBody');
  const sk=$('adminCrmSkeleton');
  sk?.classList.add('is-hidden');
  if(!uid){
    empty?.classList.remove('is-hidden');
    body?.classList.add('is-hidden');
    setAdminCrmDirty(false);
    const fb=$('adminCrmFloatSave'); if(fb) fb.hidden=true;
    return;
  }
  const user = findAdminUserRow(uid);
  if(!user){
    empty?.classList.remove('is-hidden');
    body?.classList.add('is-hidden');
    return;
  }
  empty?.classList.add('is-hidden');
  body?.classList.remove('is-hidden');
  body?.classList.remove('is-fading');
  void body?.offsetWidth;
  body?.classList.add('is-fading');

  const view = adminLicenseView(user);
  const canonicalUid = view.uid || adminUserUid(user);
  const lic = view.license;
  // CRM detail is read-only for licenses — no create/migrate/heal on open.
  const kind = view.kind || adminLicenseKind(lic);
  const orders = adminOrdersForUid(canonicalUid);
  const tickets = adminTicketsForUid(canonicalUid);
  const lastOrder = orders[0];
  const lastTicket = tickets[0];
  const avatar=$('adminCrmAvatar');
  if(avatar){
    if(user.photoURL){ avatar.src=user.photoURL; avatar.classList.remove('is-fallback'); }
    else { avatar.removeAttribute('src'); avatar.classList.add('is-fallback'); avatar.alt=(user.displayName||'?').slice(0,1); }
  }
  $('adminCrmName') && ($('adminCrmName').textContent = user.displayName || 'Google User');
  $('adminCrmRoleBadge') && ($('adminCrmRoleBadge').innerHTML = adminRoleBadgeHtml(user.role));
  $('adminCrmHeaderLicense') && ($('adminCrmHeaderLicense').innerHTML = adminPlanBadgeFromView(view));
  $('adminCrmEmail') && ($('adminCrmEmail').textContent = user.email || '');
  $('adminCrmUid') && ($('adminCrmUid').textContent = `UID ${canonicalUid}`);
  $('adminCrmHeaderMeta') && ($('adminCrmHeaderMeta').innerHTML = `
    <span><em>가입</em> ${esc(fmtListDate(user.createdAt))}</span>
    <span><em>최근 로그인</em> ${esc(fmtRelative(user.lastLogin||user.lastSeenAt))}</span>
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
  const lastAmount = lastOrder?.amount!=null ? `${Number(lastOrder.amount).toLocaleString('ko-KR')} ${lastOrder.currency||'KRW'}` : '';
  $('adminCrmSummary') && ($('adminCrmSummary').innerHTML = `
    <button type="button" class="admin-crm-summary-card" data-crm-action="orders">
      <span>주문 <b>${orders.length}</b></span>
      <small>${esc(lastOrder ? `${fmtListDate(lastOrder.completedAt||lastOrder.verifiedAt||lastOrder.createdAt)}${lastAmount?` · ${lastAmount}`:''}` : '최근 결제 없음')}</small>
    </button>
    <button type="button" class="admin-crm-summary-card" data-crm-action="tickets">
      <span>문의 <b>${tickets.length}</b></span>
      <small>${lastTicket ? `최근 ${esc(fmtListDate(lastTicket.createdAt))}` : '최근 문의 없음'}</small>
    </button>
    <div class="admin-crm-summary-card">
      <span>활동 ${adminActivityBadgeHtml(user)}</span>
      <small>${esc(fmtRelative(user.lastLogin||user.lastSeenAt))}</small>
    </div>`);
  renderAdminCrmHwidBox(user, lic);
  renderAdminCrmOrders(canonicalUid, false);
  renderAdminCrmTickets(canonicalUid);
  renderAdminCrmPosts(canonicalUid);
  renderAdminCrmTimeline(canonicalUid, user, lic);
  renderAdminCrmMemoHistory(user);
  renderAdminCrmRecentFeed();
  renderAdminCrmUsage(canonicalUid);
  captureAdminCrmBaseline();
}
function renderAdminCrmUsage(uid){
  if(!isAdminUser || !uid || !db || !firestoreApi?.doc) return;
  const box=$('adminCrmUsage'); if(!box) return;
  box.innerHTML=`<p class="muted small">불러오는 중...</p>`;
  (async ()=>{
    if(String(selectedAdminUid || '') !== String(uid)) return;
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
      } else if(!foundPaid || !paid.paidFeatureUsed){
        html=`<p class="muted small admin-crm-usage-empty">사용 기록 없음</p>`;
      } else {
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
            <span class="admin-crm-proof-label">기능</span><span class="admin-crm-proof-value">${esc(p.feature || '-')}</span>
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
    }
  })();
}
function crmSlideHtml(text){
  return `<span class="crm-slide"><span class="crm-slide-text">${esc(text)}</span></span>`;
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
      const overflow=text.scrollWidth - el.clientWidth;
      if(overflow<=1) return;
      el.classList.add('is-overflow');
      text.style.setProperty('--crm-slide', `${overflow}px`);
      text.style.setProperty('--crm-slide-dur', `${Math.max(4, Math.min(14, overflow/28))}s`);
    });
  };
  requestAnimationFrame(()=>requestAnimationFrame(measure));
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
    const id=String(o.paymentId||o.paypalOrderId||o.id||'-');
    const method=o.paymentMethod||o.provider||o.method||'-';
    const amount=o.amount!=null ? `${Number(o.amount).toLocaleString('ko-KR')} ${o.currency||'KRW'}` : '-';
    const when=fmtCompactDateTime(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt);
    const key=o.id || o.paymentId || o.paypalOrderId || '';
    return `<tr class="admin-crm-order-row" data-order-id="${esc(key)}" tabindex="0" title="${esc(id)}"><td class="mono crm-td-id">${crmSlideHtml(id)}</td><td class="crm-td-method">${crmSlideHtml(adminPaymentMethodLabel(method))}</td><td class="crm-td-amount">${crmSlideHtml(amount)}</td><td class="crm-td-date">${crmSlideHtml(when)}</td><td class="crm-td-status">${crmSlideHtml(adminPaymentStatusLabel(o.status||'-'))}</td></tr>`;
  }).join('')}</tbody></table>${(!showAll && all.length>5) ? `<p class="muted small">외 ${all.length-5}건 · 더보기로 전체 표시</p>` : ''}`;
  bindCrmTextSlides(box);
  box.querySelectorAll('[data-order-id]').forEach(row=>{
    if(row.dataset.bound) return;
    row.dataset.bound='1';
    row.addEventListener('click',()=>openAdminCrmOrderDrawer(uid, row.getAttribute('data-order-id')));
    row.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openAdminCrmOrderDrawer(uid, row.getAttribute('data-order-id')); }});
  });
}
function openAdminCrmOrderDrawer(uid, orderKey){
  const drawer=$('adminCrmOrderDrawer');
  const body=$('adminCrmOrderDrawerBody');
  if(!drawer||!body) return;
  const o = adminOrdersForUid(uid).find(x=>(x.id||x.paymentId||x.paypalOrderId)===orderKey);
  if(!o){ body.innerHTML=`<p class="muted">주문을 찾을 수 없습니다.</p>`; drawer.hidden=false; return; }
  const licIssued = o.licenseIssued===true || o.status==='completed' || !!o.issuedAt;
  const receipt = o.receiptUrl || o.receipt || o.invoiceUrl || '';
  body.innerHTML = `
    <dl class="admin-crm-order-dl">
      <div><dt>주문번호</dt><dd class="mono">${esc(o.paymentId||o.paypalOrderId||o.id||'-')}</dd></div>
      <div><dt>Payment ID</dt><dd class="mono">${esc(o.paymentId||o.portoneTransactionId||o.paypalCaptureId||'-')}</dd></div>
      <div><dt>PG</dt><dd>${esc(o.provider||o.pg||'-')}</dd></div>
      <div><dt>결제수단</dt><dd>${esc(adminPaymentMethodLabel(o.paymentMethod||o.method||'-'))}</dd></div>
      <div><dt>결제금액</dt><dd>${o.amount!=null?`${Number(o.amount).toLocaleString('ko-KR')} ${esc(o.currency||'')}`:'-'}</dd></div>
      <div><dt>상태</dt><dd>${esc(adminPaymentStatusLabel(o.status||'-'))}</dd></div>
      <div><dt>결제시간</dt><dd>${esc(fmtDate(o.completedAt||o.verifiedAt||o.createdAt||o.updatedAt))}</dd></div>
      <div><dt>웹훅 결과</dt><dd>${esc(o.verificationStatus||o.rawStatus||o.webhookStatus||'-')}</dd></div>
      <div><dt>자동 라이선스 지급</dt><dd>${licIssued?'지급됨':'미지급/해당없음'}</dd></div>
      <div><dt>관리 메모</dt><dd>${esc(o.memo||o.adminMemo||o.refundReason||'-')}</dd></div>
      <div><dt>영수증</dt><dd>${receipt?`<a href="${esc(receipt)}" target="_blank" rel="noopener">영수증 열기</a>`:'없음'}</dd></div>
    </dl>`;
  drawer.hidden=false;
}
function closeAdminCrmOrderDrawer(){
  const drawer=$('adminCrmOrderDrawer');
  if(drawer) drawer.hidden=true;
}
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
function bindAdminUserFilters(){
  const search=$('adminUserSearch');
  if(search && !search.dataset.bound){
    search.dataset.bound='1';
    search.addEventListener('input',()=>{
      clearTimeout(adminCrmSearchTimer);
      adminCrmSearchTimer=setTimeout(()=>{ adminCrmPage=1; renderAdminUserTable(); }, 220);
    });
  }
  ['adminUserLicenseStatus','adminUserSort','adminCrmFilterOrders','adminCrmFilterTickets'].forEach(id=>{
    const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1';
    el.addEventListener('change',()=>{
      adminCrmPage=1;
      renderAdminUserTable();
    });
  });
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
      const ids=adminCrmFilteredRows.map(u=>u.uid);
      if(all.checked) ids.forEach(id=>adminCrmSelected.add(id));
      else ids.forEach(id=>adminCrmSelected.delete(id));
      updateAdminCrmBulkbar();
      paintAdminCrmVirtualList();
    });
  }
  const bulk=$('adminCrmBulkbar');
  if(bulk && !bulk.dataset.bound){
    bulk.dataset.bound='1';
    bulk.addEventListener('click', async e=>{
      const btn=e.target.closest('[data-bulk]'); if(!btn) return;
      const action=btn.getAttribute('data-bulk');
      const uids=[...adminCrmSelected];
      if(!uids.length) return;
      if(action==='mail'){
        const emails = uids.map(id=>{
          const u=adminUserRows.find(x=>adminUserUid(x)===id);
          return u?.email;
        }).filter(Boolean);
        if(!emails.length) return alert('선택된 회원에 이메일이 없습니다.');
        location.href=`mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent('[MidiAI Studio]')}`;
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
      if(action==='trial' || action==='lifetime'){
        if(!confirm(`${uids.length}명에게 ${action} 라이선스를 지급할까요?`)) return;
        for(const uid of uids) await adminQuickLicense(`${uid}:${action}:active`, true);
        adminFlash(`일괄 ${action} 완료 · ${uids.length}명`);
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
  bindAdminCrmMemoAutosave();
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
    const uid=selectedAdminUid;
    if(!uid) return;
    const user = adminUserRows.find(u=>adminUserUid(u)===uid);
    const lic = licenseForUid(uid);
    if(action==='focus-license'){ $('adminCrmLicenseCard')?.scrollIntoView({behavior:'smooth',block:'start'}); $('adminLicensePlan')?.focus(); }
    else if(action==='hwid-reset') await adminResetHwid(uid);
    else if(action==='hwid-reveal'){ adminCrmHwidRevealed=!adminCrmHwidRevealed; renderAdminCrmHwidBox(user, lic); }
    else if(action==='hwid-copy'){
      const hwid=user?.hwid||lic?.hwid||'';
      if(!hwid) return;
      try{ await navigator.clipboard.writeText(hwid); adminFlash('HWID 복사됨'); }catch{ alert(hwid); }
    }
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
    else if(action==='orders'){ $('adminCrmOrdersCard')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if(action==='orders-more'){ $('adminCrmOrdersCard')?.scrollIntoView({behavior:'smooth',block:'start'}); renderAdminCrmOrders(uid, true); }
    else if(action==='tickets'){ $('adminCrmTicketsCard')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    else if(action==='tickets-tab'){
      const tabBtn=document.querySelector('[data-admin-tab="tickets"]');
      if(tabBtn) tabBtn.click();
      else $('adminTicketsSection')?.scrollIntoView({behavior:'smooth',block:'start'});
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
    else if(action==='mail'){
      if(!user?.email) return alert('이메일이 없습니다.');
      location.href=`mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('[MidiAI Studio]')}`;
    }
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
  const startsAt=$('adminLicenseStartsAt')?.value||'';
  const expiresAt=$('adminLicenseExpiresAt')?.value||'';
  const baseline=adminCrmBaseline||{};
  try{
    const {doc,setDoc,serverTimestamp}=firestoreApi;
    const roleChanged = baseline.role!==role;
    const licChanged = baseline.plan!==plan || baseline.licenseMemo!==licenseMemo
      || baseline.startsAt!==startsAt || baseline.expiresAt!==expiresAt;
    const memoChanged = baseline.userMemo!==($('adminCrmUserMemo')?.value||'');
    if(roleChanged){
      await setDoc(doc(db,'users',userDocId),{ role, updatedAt:serverTimestamp() },{merge:true});
      const row=findAdminUserRow(uid);
      if(row) row.role=role;
      pushAdminCrmFeed('권한 변경', role, uid);
    }
    if(licChanged){
      if(!plan){
        return alert('라이선스 유형을 선택해 주세요.');
      }
      if(startsAt && expiresAt && startsAt > expiresAt){
        return alert('시작일이 만료일보다 늦을 수 없습니다.');
      }
      let savePlan=normalizeAdminLicensePlanForSave(plan, expiresAt);
      if(!['trial','lifetime','period'].includes(savePlan)) savePlan='trial';
      if(savePlan==='lifetime' && $('adminLicenseExpiresAt')) $('adminLicenseExpiresAt').value='';
      if(savePlan==='lifetime' && $('adminLicenseStartsAt')) $('adminLicenseStartsAt').value='';
      if($('adminLicensePlan')) $('adminLicensePlan').value=savePlan;
      await setDoc(doc(db,'licenses',uid),{
        licensed: true,
        plan: savePlan,
        status: saveStatus,
        method:'manual',
        memo:licenseMemo,
        ...buildAdminLicenseDateFields(),
        updatedAt:serverTimestamp(),
        createdAt:serverTimestamp()
      },{merge:true});
      try{ await notifyLicenseChange(uid, {plan:savePlan, status:saveStatus}); }catch(err){ console.error(err); }
      pushAdminCrmFeed(`${savePlan} 저장`, expiresAt && savePlan!=='lifetime' ? `~${expiresAt}` : 'active', uid);
    }
    if(memoChanged) await saveAdminCrmUserMemo();
    if(roleChanged || licChanged || memoChanged){
      adminFlash(`${tr('saved')} · ${esc(uid)}`);
      refreshAdminCrmDetail();
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
    if(prevText!==text) pushAdminCrmFeed('관리자 메모', text.slice(0,40), selectedAdminUid);
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
    try{ await notifyLicenseChange(uid, {plan:savePlan, status:saveStatus}); }catch(err){ console.error(err); }
    if(!silent){
      const range = opts.days!=null ? ` · ${opts.days}일` : (opts.clearDates ? ' · 무기한' : '');
      adminFlash(`${tr('saved')} · ${esc(uid)} · ${esc(savePlan)} / ${esc(saveStatus)}${range}`);
      pushAdminCrmFeed(savePlan==='lifetime'?'Lifetime 지급':(savePlan==='trial'?'Trial 지급':`${savePlan} 지급`), saveStatus + range, uid);
    }
    if(selectedAdminUid===uid) refreshAdminCrmDetail();
  }catch(e){ alert(e.message); }
}
async function adminResetHwid(uid){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!confirm('이 사용자의 HWID를 초기화할까요?'))return;
  try{
    const {doc,setDoc,serverTimestamp}=firestoreApi;
    const userDocId = adminUserDocIdForUid(uid);
    const licUid = String(uid||'');
    await setDoc(doc(db,'users',userDocId),{hwid:'',updatedAt:serverTimestamp()},{merge:true});
    await setDoc(doc(db,'licenses',licUid),{hwid:'',updatedAt:serverTimestamp()},{merge:true});
    adminFlash(`HWID 초기화 완료 · ${esc(uid)}`);
    pushAdminCrmFeed('HWID 초기화', String(uid).slice(0,18), uid);
    if(selectedAdminUid===uid) refreshAdminCrmDetail();
  }catch(e){ alert(e.message); }
}
async function adminDeleteUser(uid, silent=false){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!uid) return;
  const userDocId = adminUserDocIdForUid(uid);
  if(!silent && !confirm(`회원 ${userDocId} 문서를 삭제할까요?\n(라이선스/주문/문의 문서는 유지됩니다)`)) return;
  try{
    const {doc,deleteDoc}=firestoreApi;
    await deleteDoc(doc(db,'users',userDocId));
    if(!silent) adminFlash(`회원 삭제 · ${esc(userDocId)}`);
    if(selectedAdminUid===uid){ selectedAdminUid=null; renderAdminCrmDetail(null); }
  }catch(e){ alert(e.message); }
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
      adminUserRows=snap.docs.map(d=>({id:d.id,...d.data()}));
      adminLicensesLoaded=false;
      loadAdminLicenses();
      renderAdminUserTable();
      refreshAdminCrmDetail();
    },
    onSnapErr('users', m=>{ adminUsersListenError=m; })
  ));
  addUnsub(onSnapshot(
    collection(db,'orders'),
    snap=>{
      adminOrdersListenError = null;
      adminOrderRows=snap.docs.map(d=>({id:d.id,...d.data()}));
      renderAdminUserTable();
      refreshAdminCrmDetail();
    },
    onSnapErr('orders', m=>{ adminOrdersListenError=m; })
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
    snap=>{ adminBoardRows=snap.docs.map(d=>({id:d.id,...d.data()})); if(selectedAdminUid) renderAdminCrmPosts(selectedAdminUid); },
    (err)=>{ const meta=adminFsErrorMeta(err); console.error('admin boardPosts snapshot error', meta.code, meta.message, err); }
  ));
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
    let link = $('boardMineToggle');
    if(!link){
      link = document.createElement('a');
      link.id = 'boardMineToggle';
      link.className = 'secondary mini-btn';
      tools.insertBefore(link, tools.firstChild);
    }
    if(mine){
      link.href = './board.html';
      link.textContent = tr('board_mine_all');
    } else {
      link.href = './board.html?mine=1';
      link.textContent = tr('board_mine_only');
    }
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
  if(window.Tone && getToneMidi()) return Promise.resolve();
  if(midiPlayerLibPromise) return midiPlayerLibPromise;
  midiPlayerLibPromise = new Promise((resolve, reject)=>{
    const fail = ()=>{ midiPlayerLibPromise=null; reject(new Error('MIDI 엔진 로드 실패')); };
    const load = (src, next)=>{
      const s=document.createElement('script');
      s.src=src;
      s.async=true;
      s.onload=next;
      s.onerror=fail;
      document.head.appendChild(s);
    };
    load('https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js', ()=>{
      load('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/build/Midi.js', ()=>{
        if(window.Tone && getToneMidi()) resolve();
        else fail();
      });
    });
  });
  return midiPlayerLibPromise;
}
function getToneMidi(){
  if(typeof window.Midi === 'function') return window.Midi;
  if(typeof window.Midi?.Midi === 'function') return window.Midi.Midi;
  return null;
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
async function renderMidiPreviewWav(midiArrayBuffer, maxSec=40){
  await ensureMidiPlayerLib();
  const Tone = window.Tone;
  const MidiCtor = getToneMidi();
  if(!Tone?.Offline || !MidiCtor) throw new Error('미리듣기 엔진 없음');
  const midi = new MidiCtor(midiArrayBuffer);
  const dur = Math.min(Math.max(Number(midi.duration)||1, 0.5), maxSec);
  const rendered = await Tone.Offline(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.25, release: 0.3 }
    }).toDestination();
    synth.maxPolyphony = 48;
    synth.volume.value = -9;
    midi.tracks.forEach(track=>{
      track.notes.forEach(note=>{
        if(note.time >= maxSec) return;
        const len = Math.min(Math.max(0.04, note.duration), Math.max(0.04, maxSec - note.time));
        try{ synth.triggerAttackRelease(note.name, len, note.time, Math.max(0.12, Math.min(1, note.velocity))); }catch(_){}
      });
    });
  }, dur);
  const audioBuffer = typeof rendered?.get === 'function' ? rendered.get() : rendered;
  if(!audioBuffer || !audioBuffer.getChannelData) throw new Error('미리듣기 변환 실패');
  return audioBufferToWavBlob(audioBuffer);
}
async function makeBoardMidiPreviewUrl(path, url, cacheKey){
  if(boardMidiPreviewCache.has(cacheKey)) return boardMidiPreviewCache.get(cacheKey);
  const buf = await boardMidiBytes(path, url);
  const wav = await renderMidiPreviewWav(buf, 40);
  const obj = URL.createObjectURL(wav);
  boardMidiPreviewCache.set(cacheKey, obj);
  return obj;
}
function boardAttachmentItemHtml(a, idx, editable=false){
  const type = boardFileType(a);
  const name = esc(a.name || a.fileName || 'attachment');
  const url = esc(a.url || '');
  const path = esc(a.path || boardStoragePathFromUrl(a.url) || '');
  const previewUrl = esc(a.previewUrl || '');
  const badge = type === 'video' ? '🎥 영상' : type === 'midi' ? '🎹 MIDI' : '🖼️ 사진';
  const remove = editable ? `<button type="button" class="secondary mini-btn danger-btn" data-remove-existing-attachment="${idx}">삭제</button>` : '';
  if(type === 'midi'){
    const hasPreview = !!a.previewUrl;
    return `<figure class="board-attachment-item board-attachment-midi">
      <div class="board-midi-card">
        <div class="board-midi-row">
          <span class="board-midi-badge">🎹 MIDI</span>
          <b class="board-midi-name" title="${name}">${name}</b>
          ${editable?'':`${hasPreview?'':`<button type="button" class="board-midi-play-btn" data-midi-preview="${url}" data-midi-path="${path}" aria-label="미리듣기">미리듣기</button>`}
          <a class="board-midi-dl" href="${url}" target="_blank" rel="noopener noreferrer" download>다운로드</a>`}
          ${remove}
        </div>
        <audio class="board-midi-audio" controls preload="none" ${hasPreview?`src="${previewUrl}"`:'hidden'}></audio>
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
  setBoardMidiMsg(card, 'MIDI → 오디오 미리듣기 변환 중 (첫 40초)…');
  try{
    const preview = await makeBoardMidiPreviewUrl(path, url, url);
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
    if(isBoardMidi(file)){
      try{
        if(msg) msg.textContent = `MIDI 미리듣기 생성 중... ${i+1}/${selectedBoardFiles.length}`;
        const wav = await renderMidiPreviewWav(await file.arrayBuffer(), 40);
        const previewPath = `board/${currentUser.uid}/${postId}/${Date.now()}_${i}_preview.wav`;
        const previewRef = ref(storage, previewPath);
        await uploadBytes(previewRef, wav, { contentType: 'audio/wav' });
        item.previewUrl = await getDownloadURL(previewRef);
        item.previewPath = previewPath;
      }catch(err){
        console.warn('midi preview upload skipped', err);
      }
    }
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
  const id=getParam('id');
  ensureMarkdownCss();
  let editorHost=$('boardPostEditor')||$('boardPostContent');
  if(editorHost && editorHost.tagName==='TEXTAREA'){
    const wrap=document.createElement('div');
    wrap.id='boardPostEditor';
    editorHost.replaceWith(wrap);
    editorHost=wrap;
  }
  editorHost=$('boardPostEditor');
  const uid=currentUser?.uid||'anon';
  const draftId=id||'new';
  // Always remount when opening write/edit page so previous instance cannot block input
  if(form._mdEditor){
    try{ form._mdEditor.destroy(); }catch(_){}
    form._mdEditor=null;
  }
  let initialMd='';
  const {doc,getDoc,setDoc,addDoc,collection,serverTimestamp}=firestoreApi;
  if(id && !form.dataset.editLoaded){
    try{
      const snap=await getDoc(doc(db,'boardPosts',id));
      const d=snap.exists()?{id:snap.id,...snap.data()}:null;
      if(!d){
        $('boardPostMsg').textContent=tr('empty');
        form.dataset.editLoaded='1';
      } else if(!currentUser){
        $('boardPostMsg').textContent=tr('need_login');
        form.querySelector('button[type="submit"]').disabled=true;
        form.dataset.editLoaded='1';
      } else if(!canManageRecord(d)){
        $('boardPostMsg').textContent=tr('no_permission');
        form.querySelector('button[type="submit"]').disabled=true;
        form.dataset.editLoaded='1';
      } else {
        $('boardWriteHeading') && ($('boardWriteHeading').textContent='자유게시판 글 수정');
        $('boardPostTitle').value=d.title||'';
        initialMd=pickMarkdownSource(d);
        existingBoardAttachments = Array.isArray(d.attachments) ? d.attachments.filter(x=>x && x.url) : [];
        renderBoardAttachmentPreview();
        form._editingPost = d;
        if(isAdminUser && $('boardPostPinned')) $('boardPostPinned').checked=!!d.pinned;
        form.querySelector('button[type="submit"]').disabled=false;
        if($('boardPostMsg')) $('boardPostMsg').textContent='';
        form.dataset.editLoaded='1';
      }
    }catch(e){ $('boardPostMsg').textContent=e.message; }
  }
  if(editorHost){
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    form._mdEditor=await mountMarkdownEditor(editorHost,{
      value: initialMd,
      height: 420,
      draftKey: `board:${draftId}`,
      storagePrefix: `cms-md/${uid}/board`,
      showActions: false,
      preferToast: false
    });
    if(initialMd) form._mdEditor.setMarkdown(initialMd);
    form._mdEditor.refreshLayout();
    setTimeout(()=>form._mdEditor?.focus?.(), 80);
  }
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
    const data={title:$('boardPostTitle').value.trim(),content:mdContent,contentMarkdown:mdContent,contentFormat:'markdown',visible:true,deleted:false,edited:!!id,category:'free',updatedAt:serverTimestamp()};
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
  box.innerHTML=`<div class="post-card-head final-post-head"><div class="post-kicker">${d.pinned?'📌 '+labels.pinned:labels.board}</div><h1>${esc(d.title||'')}</h1><div class="post-meta-grid final-meta-grid"><span class="meta-author meta-author-badge"><span class="author-badge is-${aKind}" title="${esc(authorKindLabel(aKind))}" aria-label="${esc(authorKindLabel(aKind))}">${authorKindIcon(aKind)}</span><em>${esc(labels.author)}</em><b>${esc(author)}</b></span><span class="meta-date"><i>🕒</i><em>${esc(labels.date)}</em><b>${esc(fmtShortDate(d.createdAt))}</b></span><span><i>👁</i><em>${esc(labels.views)}</em><b>${Number(d.viewCount||0)}</b></span><span><i>👍</i><em>${esc(labels.likes)}</em><b id="postLikeCount">${Number(d.likeCount||0)}</b></span><span><i>💬</i><em>${esc(labels.comments)}</em><b>${Number(d.commentCount||0)}</b></span></div></div><div class="post-body-content">${mdBodyHtml(d.content||'')}</div>${boardAttachmentsHtml(d.attachments)}<div class="post-actions community-post-actions"><button id="postLikeBtn" class="like-btn" type="button" aria-pressed="false">${boardLikeBtnInner(likeLabel,false)}</button>${manage?`<a class="post-action-btn post-edit-btn" href="${boardEditUrl(d.id)}">${editIcon}<span>${esc(labels.edit)}</span></a><button id="postDeleteBtn" class="post-action-btn post-delete-btn" type="button">${delIcon}<span>${esc(labels.del)}</span></button>`:''}</div>`;
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
  addUnsub(onSnapshot(q, snap=>{
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
function isNotifyTypeEnabled(type){
  const p = userNotifyPrefs || defaultNotifyPrefs();
  if(p.inApp === false) return false;
  if(type === 'board_comment') return p.boardComment !== false;
  if(type === 'ticket_reply') return p.ticketReply !== false;
  if(type === 'license_change') return p.licenseChange !== false;
  if(type === 'notice') return p.notice !== false;
  if(type === 'patch_note') return p.patchNote !== false;
  return true;
}
function visibleUserNotifications(rows){
  return (rows||[]).filter(n => isNotifyTypeEnabled(n.type || 'board_comment'));
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
function ensureNotifyBell(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions) return null;
  let wrap = $('topbarNotify');
  if(wrap) return wrap;
  wrap = document.createElement('div');
  wrap.className = 'topbar-notify';
  wrap.id = 'topbarNotify';
  wrap.hidden = true;
  wrap.innerHTML = `<button type="button" class="topbar-notify-btn" id="notifyBellBtn" aria-label="${esc(tr('notify_aria'))}" aria-expanded="false">${NOTIFY_BELL_SVG}<span class="topbar-notify-badge" id="notifyBellBadge" hidden>0</span></button><div class="topbar-notify-panel" id="notifyPanel" hidden><div class="topbar-notify-head"><b>${esc(tr('notify_title'))}</b><div class="topbar-notify-head-actions"><button type="button" class="topbar-notify-mark" id="notifyMarkAllRead">${esc(tr('notify_mark_all'))}</button><button type="button" class="topbar-notify-clear" id="notifyClearAll">${esc(tr('notify_clear_all'))}</button></div></div><div class="topbar-notify-list" id="notifyList"><div class="topbar-notify-empty">${esc(tr('notify_empty'))}</div></div></div>`;
  const langBtn = $('langBtn');
  if(langBtn) actions.insertBefore(wrap, langBtn);
  else actions.insertBefore(wrap, actions.firstChild);
  const bell = $('notifyBellBtn');
  bell?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleNotifyPanel(); });
  $('notifyMarkAllRead')?.addEventListener('click', (e)=>{ e.stopPropagation(); markAllNotificationsRead(); });
  $('notifyClearAll')?.addEventListener('click', (e)=>{ e.stopPropagation(); clearAllNotifications(); });
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
  const q = query(collection(db,'users',currentUser.uid,'notifications'), orderBy('createdAt','desc'), limit(40));
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
function notifyItemHtml(n){
  const type = n.type || 'board_comment';
  const name = n.actorName || (type === 'board_comment' ? 'User' : BRAND_AUTHOR);
  const title = n.postTitle || '';
  const preview = n.preview || '';
  const when = fmtDate(n.createdAt);
  const unread = n.read !== true ? ' is-unread' : '';
  let line = '';
  if(type === 'ticket_reply'){
    line = `<b>${esc(name)}</b> · ${esc(tr('notify_ticket_reply'))}`;
  } else if(type === 'license_change'){
    line = `<b>${esc(name)}</b> · ${esc(tr('notify_license_change'))}`;
  } else if(type === 'notice'){
    line = `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_notice'))}`;
  } else if(type === 'patch_note'){
    line = `<b>${esc(BRAND_AUTHOR)}</b> · ${esc(tr('notify_patch_note'))}`;
  } else {
    line = `<b>${esc(name)}</b>${esc(tr('notify_board_comment'))}`;
  }
  return `<div class="topbar-notify-item${unread}" data-notify-id="${esc(n.id)}">
    <button type="button" class="topbar-notify-item-body" data-notify-open="${esc(n.id)}">
      <span class="topbar-notify-item-main">${line}</span>
      ${title?`<span class="topbar-notify-item-title">${esc(title)}</span>`:''}
      ${preview?`<span class="topbar-notify-item-preview">${esc(preview)}</span>`:''}
      <span class="topbar-notify-item-time">${esc(when)}</span>
    </button>
    <button type="button" class="topbar-notify-item-del" data-notify-del="${esc(n.id)}" aria-label="${esc(tr('notify_delete_aria'))}">×</button>
  </div>`;
}
function renderNotifyPanelList(){
  const list = $('notifyList');
  if(!list) return;
  if(!currentUser){
    list.innerHTML = `<div class="topbar-notify-empty">${esc(tr('notify_login'))}</div>`;
    return;
  }
  const rows = visibleUserNotifications(userNotifyRows);
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
  if(!currentUser || !notifyId || !firestoreApi?.updateDoc) return;
  const row = n || userNotifyRows.find(x => x.id === notifyId) || null;
  try{
    const {doc, updateDoc} = firestoreApi;
    await updateDoc(doc(db,'users',currentUser.uid,'notifications',notifyId), {read:true});
    if(row?.type === 'ticket_reply' && row.ticketId){
      await markTicketReplyRead(row.ticketId);
    }
  }catch(e){ console.error(e); }
}
async function openNotification(notifyId){
  if(!currentUser || !notifyId) return;
  const n = userNotifyRows.find(x => x.id === notifyId);
  if(!n) return;
  await markNotificationRead(notifyId, n);
  closeNotifyPanel();
  const base = window.MIDIAI_BASE_PATH || './';
  const type = n.type || 'board_comment';
  if(type === 'ticket_reply' && n.ticketId){
    location.href = `${base}ticket.html?id=${encodeURIComponent(n.ticketId)}&focus=reply`;
    return;
  }
  if(type === 'license_change'){
    location.href = `${base}account.html`;
    return;
  }
  const postId = n.postId || '';
  if(type === 'notice' && postId){
    location.href = `${base}notice.html?id=${encodeURIComponent(postId)}`;
    return;
  }
  if(type === 'patch_note' && postId){
    location.href = `${base}patch-note.html?id=${encodeURIComponent(postId)}`;
    return;
  }
  const commentId = n.commentId || '';
  if(!postId) return;
  let href = `${base}board-post.html?id=${encodeURIComponent(postId)}`;
  if(commentId) href += `&focus=comment&cid=${encodeURIComponent(commentId)}`;
  if(page === 'board-post.html' && getParam('id') === postId){
    focusBoardComment(commentId);
    return;
  }
  location.href = href;
}
async function markAllNotificationsRead(){
  if(!currentUser || !firestoreApi?.updateDoc) return;
  const unread = userNotifyRows.filter(n => n.read !== true);
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
  if(!ownerUid || !firestoreApi?.addDoc || !currentUser){
    throw new Error('notification create unavailable');
  }
  const {collection, addDoc, serverTimestamp} = firestoreApi;
  const payload = {
    type: data.type || 'general',
    postId: data.postId || '',
    commentId: data.commentId || '',
    parentId: data.parentId || '',
    ticketId: data.ticketId || '',
    plan: data.plan || '',
    status: data.status || '',
    actorUid: data.actorUid != null ? data.actorUid : (currentUser.uid || ''),
    actorName: data.actorName != null ? data.actorName : (boardDisplayName() || BRAND_AUTHOR),
    postTitle: String(data.postTitle || data.title || '').slice(0,120),
    preview: String(data.preview || '').slice(0,160),
    read: false,
    createdAt: serverTimestamp()
  };
  if(!payload.actorUid) throw new Error('notification actorUid missing');
  const ref = await addDoc(collection(db,'users',ownerUid,'notifications'), payload);
  return ref.id;
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
async function notifyTicketOwnerReply(ticketId, content){
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
      ticketId,
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
  if(!isAdminUser) return alert(tr('no_permission'));
  if(!confirm(tr('confirm_delete'))) return;
  await adminDeleteBoardPosts([id], null, true);
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
function adminFlash(html){
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
}
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
  const token = await currentUser.getIdToken(true);
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

async function requestKakaoPayPayment(){
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
  if(!isSelling(getDefaultProduct())){
    const msg = lang==='en' ? 'Temporarily unavailable' : '일시 판매중지된 상품입니다.';
    paypalStatus(msg, 'err');
    alert(msg);
    return;
  }
  let productId = ctx.portoneProductId || CONFIG.portoneProductId || 'midiai-lifetime';
  let orderName = ctx.orderName || CONFIG.portoneOrderName || 'MidiAI Studio Lifetime License';
  let totalAmount = Number(ctx.salePrice || CONFIG.priceValueKr || 130000);
  const paymentIdValue = makeKakaoPaymentId(currentUser.uid);
  kakaoPayInFlight = true;
  const kakaoBtn = $('kakaoPayBtn');
  if(kakaoBtn) kakaoBtn.disabled = true;
  try{
    paypalStatus(t.kakaoPreparing || 'Opening KakaoPay checkout...');
    let eligibility;
    try{
      eligibility = await callFunctionJson('checkPurchaseEligibility', {
        paymentId: paymentIdValue,
        productId
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
        plan: CONFIG.plan || 'lifetime',
        productId,
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
        productId,
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
    if(!currentLicenseLifetime && kakaoBtn) kakaoBtn.disabled = false;
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
      totalAmount: Number(CONFIG.priceValueKr || 130000),
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
      renderKoreanPaymentButtons();
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
  s.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
  s.onload=()=>{
    if(!window.paypal)return;
    $('paypalButtons').innerHTML='';
    window.paypal.Buttons({
      onClick:()=>{
        if(!currentUser){ alert(purchaseLocaleText().loginAlert); return false; }
        if(currentLicenseLifetime){
          applyPurchaseLifetimeGate();
          alert(purchaseLocaleText().alreadyOwned || '이미 Lifetime 라이선스를 보유하고 있습니다.');
          return false;
        }
        paypalStatus(purchaseLocaleText().paypalAccount(currentUser.email || currentUser.uid));
        return true;
      },
      createOrder: async()=>{
        if(!isSelling(getDefaultProduct())){
          const msg = lang==='en' ? 'Temporarily unavailable' : '일시 판매중지된 상품입니다.';
          paypalStatus(msg, 'err');
          throw new Error(msg);
        }
        paypalStatus(purchaseLocaleText().creating);
        const result = await callFunctionJson('createPayPalOrder', {
          plan: purchaseCheckout().plan || CONFIG.plan || 'lifetime',
          amount: purchaseAmountValue(),
          currency: currency
        });
        if(!result.id) throw new Error('PayPal 주문 ID를 받지 못했습니다.');
        paypalStatus(purchaseLocaleText().opening);
        return result.id;
      },
      onApprove: async(data)=>{
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
function onLangBtnClick(){
  if(isPurchasePage){
    const next = lang === 'ko' ? 'en' : lang === 'en' ? 'ja' : 'ko';
    localStorage.setItem('midiai_lang', next);
    if(next === 'ko') location.href = pathLang ? '../purchase.html' : './purchase.html';
    else location.href = pathLang ? `../${next}/purchase.html` : `./${next}/purchase.html`;
    return;
  }
  lang = lang==='ko' ? 'en' : lang==='en' ? 'ja' : 'ko';
  applyStaticI18n();
  applyGuidesI18n(lang);
  if($('accountMeta') && currentUser) renderAccountDashboard(currentUser.uid, accountLicenseDoc, latestDownloadData);
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
const TOPBAR_GLOBE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/></svg>';
function refreshTopbarActionLabels(){
  const langBtn = $('langBtn');
  if(langBtn){
    const code = langBtn.querySelector('.topbar-lang-code');
    const label = lang === 'ko' ? 'EN' : lang === 'en' ? '日本語' : '한국어';
    if(code) code.textContent = label;
    else langBtn.textContent = label;
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
  if(wrap) return wrap;

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
    <nav class="topbar-profile-links" aria-label="${esc(tr('profile_menu_aria'))}">
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
    actions.innerHTML = `<button id="langBtn" class="ghost topbar-lang" aria-label="언어 변경" type="button"><span class="topbar-lang-icon">${TOPBAR_GLOBE_SVG}</span><span class="topbar-lang-code">EN</span></button>`;
  } else {
    const langBtn = $('langBtn');
    if(langBtn && !langBtn.querySelector('.topbar-lang-code')){
      langBtn.classList.add('topbar-lang');
      langBtn.innerHTML = `<span class="topbar-lang-icon">${TOPBAR_GLOBE_SVG}</span><span class="topbar-lang-code">EN</span>`;
    }
  }
  // Login/logout live inside the profile dropdown only
  document.querySelectorAll('.topbar .actions > #loginBtn, .topbar .actions > #logoutBtn, .topbar .actions > .topbar-login, .topbar .actions > .topbar-logout').forEach((el)=>{
    if(!el.closest?.('#topbarProfile')) el.remove();
  });

  const langBtn = $('langBtn');
  if(langBtn) langBtn.onclick = onLangBtnClick;
  refreshTopbarActionLabels();
  ensureNotifyBell();
  setNotifyBellVisible(!!currentUser);
  ensureTopbarProfile();
  if(currentUser) updateTopbarProfile(currentUser);
  else syncTopbarProfileAuthUi(false);
}
function initSidebarLayout(){
  if(document.querySelector('.app-shell')) return;
  const topbar=document.querySelector('.topbar');
  const main=document.querySelector('main');
  if(!topbar||!main) return;
  const footer=document.querySelector('footer');
  const base=window.MIDIAI_BASE_PATH||'./';
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
  nav.setAttribute('aria-label','사이트 메뉴');
  nav.innerHTML=`<div class="sidebar-primary"><a href="${base}index.html" data-nav="home">${navIcon('home')}<span>홈</span></a><a href="${base}product.html" data-nav="product">${navIcon('product')}<span>제품</span></a><a href="${base}guide/index.html" data-nav="guides">${navIcon('guide')}<span>가이드</span></a><a href="${base}downloads.html" data-nav="downloads">${navIcon('download')}<span>다운로드</span></a><a href="${base}purchase.html" data-nav="purchase">${navIcon('purchase')}<span>구매</span></a></div><div class="sidebar-section"><p class="sidebar-label">커뮤니티</p><div class="sidebar-links"><a href="${base}notices.html" data-hub="notices">${navIcon('notice')}<span>공지사항</span></a><a href="${base}patch-notes.html" data-hub="patches">${navIcon('patch')}<span>패치노트</span></a><a href="${base}faq.html" data-hub="faq">${navIcon('faq')}<span>FAQ</span></a><a href="${base}board.html" data-hub="board">${navIcon('board')}<span>자유게시판</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">고객지원</p><div class="sidebar-links"><a href="${base}support.html" data-hub="support">${navIcon('support')}<span>1:1 문의</span></a><a href="${base}my-tickets.html" data-hub="tickets">${navIcon('tickets')}<span>나의 문의</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">계정</p><div class="sidebar-links"><a href="${base}account.html" data-nav="account">${navIcon('account')}<span>내 계정</span></a><a id="adminNav" class="hidden" hidden aria-hidden="true" href="${base}admin.html">${navIcon('admin')}<span>관리자</span></a></div></div>`;
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
  const needsProduct=document.body.classList.contains('product-page');
  afterLayout(()=>{
    if(!needsProduct || document.body.classList.contains('product-cms-painted')){
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
  const inGuideCms=page==='guide.html' || /\/guide\/(index\.html)?$/.test(path) || path.endsWith('/guide/');
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

const SALE_PROMO_HIDE_KEY = 'midiai_sale_promo_hide_day';

function salePromoCopy(){
  const uiLang = lang === 'en' || lang === 'ja' ? lang : 'ko';
  const ctx = checkoutContext(uiLang, uiLang === 'ko');
  return promoPopupCopy(uiLang, ctx);
}

function todayKey(){
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function shouldShowSalePromo(){
  if(!isPromoPopupActive()) return false;
  const home = !page || page==='index.html' || page==='';
  if(!home) return false;
  try{ if(localStorage.getItem(SALE_PROMO_HIDE_KEY)===todayKey()) return false; }catch(_){}
  return true;
}

function closeSalePromo(root, hideToday){
  if(hideToday){
    try{ localStorage.setItem(SALE_PROMO_HIDE_KEY, todayKey()); }catch(_){}
  }
  root.classList.remove('is-open');
  setTimeout(()=>root.remove(), 280);
  if(root._cleanup) root._cleanup();
}

function openSalePromoPopup(){
  if(document.querySelector('.sale-promo-backdrop')) return;
  const t=salePromoCopy();
  const base=window.MIDIAI_BASE_PATH||'./';
  const purchaseHref = lang==='en' ? `${base}en/purchase.html` : lang==='ja' ? `${base}ja/purchase.html` : `${base}purchase.html`;
  const overlay=document.createElement('div');
  overlay.className='sale-promo-backdrop';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label', t.title);
  overlay.innerHTML=`
    <div class="sale-promo-modal">
      <button type="button" class="sale-promo-x" aria-label="${esc(t.close)}">×</button>
      <span class="sale-promo-badge">${esc(t.badge)}</span>
      <h2 class="sale-promo-title">${esc(t.title)}</h2>
      <p class="sale-promo-lead">${esc(t.lead)}</p>
      <div class="sale-promo-price-box">
        <div class="sale-promo-was">${esc(t.was)}</div>
        <div class="sale-promo-now"><strong>${esc(t.now)}</strong><span>${esc(t.until)}</span></div>
      </div>
      <div class="sale-promo-actions">
        <a class="primary" href="${esc(purchaseHref)}">${esc(t.cta)}</a>
        <label class="sale-promo-hide"><input type="checkbox" id="salePromoHideToday"> ${esc(t.hideToday)}</label>
        <button type="button" class="sale-promo-close-link" data-close>${esc(t.close)}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(()=>overlay.classList.add('is-open'));

  const dismiss=()=>closeSalePromo(overlay, !!overlay.querySelector('#salePromoHideToday')?.checked);
  overlay.querySelector('.sale-promo-x')?.addEventListener('click', dismiss);
  overlay.querySelector('[data-close]')?.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) dismiss(); });
  const onKey=(e)=>{ if(e.key==='Escape') dismiss(); };
  document.addEventListener('keydown', onKey);
  overlay._cleanup=()=>document.removeEventListener('keydown', onKey);
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
setTimeout(()=>document.documentElement.classList.remove('auth-pending'),8000);
initSidebarLayout();
if(!document.documentElement.classList.contains('sidebar-ready')){
  // initSidebarLayout already scheduled reveal when shell was built; this covers early-exit paths.
  if(!document.body.classList.contains('sidebar-layout')) scheduleShellReveal();
}
initTopbarActions();
bindSidebar();
applyStaticI18n();
applyGuidesI18n(lang);
initSidebarNav();
setAuthUiSignedOut();
// Sale popup waits for ensurePricing via refreshPricingUi / maybeShowSalePromo

initForms();
initAuth();
initPurchasePhone();
initPayPal();
