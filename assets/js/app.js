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
let adminOrderRows = [];
let adminBoardRows = [];
let activeBoardPost = null;
let activeBoardComments = [];
let likedActivePost = false;

const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const I18N = {
  en: {
    '번호':'No.','글쓴이':'Author','작성일':'Date','포털':'Portal','커뮤니티':'Community','고객지원':'Support','지원':'Support','계정':'Account','홈':'Home','제품':'Product','다운로드':'Downloads','구매':'Purchase','공지사항':'Notices','패치노트 목록':'Patch notes list','운영 안내, 이벤트, 중요 공지를 확인합니다.':'Check service notices, events, and important updates.','패치노트':'Patch notes','FAQ':'FAQ','자유게시판':'Free board','글쓰기':'Write','댓글':'Comments','댓글 등록':'Post comment','답글':'Reply','추천':'Like','조회':'Views','1:1 문의':'Support','1:1 문의 작성':'Create ticket','나의 문의':'My tickets','내 계정':'Account','관리자':'Admin','로그아웃':'Logout','문의 작성':'Create ticket','전체 보기':'View all',
    '7월 31일까지 할인 진행중':'Discount available until July 31','피아노 커버를':'Piano covers','프로 MIDI':'pro MIDI','로':'into MIDI','MIDI로 바꾸는':'into MIDI','가장 쉬운 방법':'made easy','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'The easiest way to turn piano covers into MIDI','MidiAI Studio 공식 포털입니다.':'MidiAI Studio official portal.','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'Use purchase, downloads, notices, patch notes, and 1:1 support.','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio official portal. The home page focuses on product, purchase, and downloads; notices, patch notes, and private support are separated into board-style pages.',
    '라이선스 구매하기':'Buy license','무료 체험 다운로드':'Download free trial','1:1 문의하기':'Contact support','Windows 지원':'Windows support','Google 계정 연동':'Google account linked','비공개 문의':'Private support','업데이트, 이벤트, 운영 안내를 확인합니다.':'Check updates, events, and service notices.','버전별 변경 사항을 확인합니다.':'Check changes by version.','비공개 문의를 작성하고 답변을 확인합니다.':'Create private tickets and check replies.','라이선스 상태와 로그인 정보를 확인합니다.':'Check license status and login details.','바로가기':'Open','문의하기':'Contact','확인하기':'View','최신 설치 파일':'Latest installer','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Shows the latest version from Firestore downloads/latest.','불러오는 중...':'Loading...','최신 설치 파일과 버전 정보를 확인합니다.':'Check the latest installer and version info.',
    'Google 로그인':'Sign in with Google','로그인 전':'Not signed in','Google 로그인으로 라이선스 확인 준비':'Sign in with Google to check your license','라이선스 확인 전':'License not checked',
    '공지 상세':'Notice detail','자주 묻는 질문':'FAQ','비공개 1:1 문의':'Private support','문의 등록':'Submit ticket','문의 상세':'Ticket detail','라이선스 구매':'Buy license','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'Add patch note','공지 등록':'Add notice','FAQ 등록':'Add FAQ','라이선스 저장':'Save license','문의 답변':'Ticket replies','공지 작성':'Write notice','패치노트 작성':'Write patch note','FAQ 작성':'Write FAQ','라이선스 지급/수정':'Grant/edit license',
    '제목':'Title','내용':'Content','검색':'Search','버전':'Version','질문':'Question','답변':'Answer','순서':'Order','상단 고정':'Pin to top','플랜':'Plan','상태':'Status','메모':'Memo','사용자 UID':'User UID','등록':'Submit','저장':'Save','문의 내용을 자세히 적어주세요.':'Please describe your issue in detail.','로그인 오류 / 라이선스 문의':'Login issue / license question','로그인이 필요합니다.':'Sign-in required.','내가 작성한 비공개 문의와 답변을 확인합니다.':'View your private tickets and replies.','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'Only you and the admin can view this ticket. Please sign in first.','role=admin 계정만 사용할 수 있습니다.':'Only role=admin accounts can use this page.',
    '답변 완료':'Answered','종료':'Closed','접수':'Open','권한이 없습니다.':'You do not have permission.','관리자 로그인이 필요합니다.':'Admin sign-in required.','표시할 내용이 없습니다.':'Nothing to show.','확인 실패':'Check failed','저장 완료':'Saved','수정':'Edit','삭제':'Delete','종료 처리':'Close','관리':'Manage','상세 보기':'Open detail','공지 관리':'Manage notices','패치노트 관리':'Manage patch notes','FAQ 관리':'Manage FAQ','정말 삭제할까요?':'Delete this item?','수정 완료':'Updated','삭제 완료':'Deleted','문의가 등록되었습니다.':'Ticket created.',
    '이용약관':'Terms of use','개인정보처리방침':'Privacy policy','환불정책':'Refund policy','사업자정보':'Business info','고객센터':'Support','AI 기반 MIDI 변환 소프트웨어':'AI-powered MIDI conversion software','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AI-powered MIDI conversion software · digital license',
    '피아노 커버 작업실':'Piano cover studio','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'Load a YouTube link or audio file and convert it to MIDI with AI.','변환·편집·트랙 분리·라이브러리까지 한 앱에서 이어집니다.':'Conversion, editing, stem separation, and library — all in one app.','영상·오디오를 MIDI로':'Video & audio to MIDI','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'Start with a YouTube link, local upload, or song search. Preview the waveform, pick a range, and export MIDI for your instrument.','YouTube 링크 분석':'YouTube link analysis','웨이브폼 미리듣기':'Waveform preview','출력 악기·구간 선택':'Choose instrument & range','MIDI 편집 PRO':'MIDI Editor PRO','멀티트랙 피아노 롤':'Multi-track piano roll','변환된 MIDI를 바로 편집합니다. 11종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'Edit converted MIDI right away — 11 instruments, velocity/pitch bend/modulation, undo/copy/quantize.','11종 악기 지원':'11 instruments','벨로시티·CC 파라미터 편집':'Velocity & CC editing','홈 · 포털 연동':'Home · portal sync','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'Check notices, patch notes, and license status in-app, then jump into Studio.','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'After Google sign-in, browse and post on the free board from the app.','트랙 분리':'Stem separation','기능 준비중':'Coming soon','라이브러리':'Library','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'Manage converted and edited MIDI files in the library and reopen them anytime.','정식 라이선스 혜택':'Full license benefits','전체 구간 MIDI 변환':'Full-song MIDI conversion','악기 변환':'Instrument conversion','제한 없는 저장 · full song export':'Unlimited save · full song export','MIDI 편집 기능':'MIDI editing features',
    '공식 설치 · 업데이트 프로그램':'Official installer & updater','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installer is a Windows tool for install, quick update, full install/repair, and runtime checks.','설치 방법':'How to install','실행 · 업데이트 방법':'How to run & update','결제 정보':'Payment details','주문자 정보':'Buyer','휴대폰 번호':'Phone number','결제수단':'Payment method','상품명':'Product','판매가격':'Price','결제형태':'Payment type','단건 결제':'One-time payment','서비스 제공기간':'Service delivery','결제 완료 후 즉시 라이선스 발급':'License issued immediately after payment','Google 로그인 계정 기준':'Based on your Google account','Google 로그인 후 자동 입력':'Filled after Google sign-in','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'Buyer contact required for Korean card checkout.','결제 버튼을 준비하고 있습니다.':'Preparing payment buttons.','라이선스 안내':'License guide','계좌 입금 안내':'Bank transfer guide','사이트 메뉴':'Site menu','게시판 메뉴':'Board menu',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'A place to share questions, reviews, and tips freely.','게시글 목록':'Posts','공지 목록':'Notices','공지':'Notice','← 목록':'← Back','목록':'Back','유형':'Type','(제목 없음)':'(No title)','로그인 후 게시글을 작성할 수 있습니다.':'Sign in to write a post.','자주 묻는 질문과 답변을 빠르게 확인하세요.':'Quick answers to common questions.','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Check your Google sign-in and license status.',
    '신규':'New','개선':'Improved','수정':'Fixed','변경':'Changed','변경 사항':'Changes','내용이 없습니다.':'No content.','목차':'Contents','최신':'Newer','이전':'Older','버전 이동':'Version navigation','공유':'Share','전체 패치노트':'All patch notes','문의':'Support'
  },
  ja: {
    '번호':'番号','글쓴이':'投稿者','작성일':'作成日','포털':'ポータル','커뮤니티':'コミュニティ','고객지원':'サポート','지원':'サポート','계정':'アカウント','홈':'ホーム','제품':'製品','다운로드':'ダウンロード','구매':'購入','공지사항':'お知らせ','패치노트 목록':'パッチノート一覧','운영 안내, 이벤트, 중요 공지를 확인합니다.':'運営案内、イベント、重要なお知らせを確認できます。','패치노트':'パッチノート','FAQ':'FAQ','자유게시판':'自由掲示板','글쓰기':'投稿','댓글':'コメント','댓글 등록':'コメント投稿','답글':'返信','추천':'いいね','조회':'閲覧','1:1 문의':'お問い合わせ','1:1 문의 작성':'問い合わせ作成','나의 문의':'マイ問い合わせ','내 계정':'アカウント','관리자':'管理者','로그아웃':'ログアウト','문의 작성':'問い合わせ作成','전체 보기':'すべて見る',
    '7월 31일까지 할인 진행중':'7月31日まで割引中','피아노 커버를':'ピアノカバーを','프로 MIDI':'プロMIDI','로':'に','MIDI로 바꾸는':'MIDIに変える','가장 쉬운 방법':'一番簡単な方法','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'ピアノカバーをMIDIに変える一番簡単な方法','MidiAI Studio 공식 포털입니다.':'MidiAI Studio公式ポータルです。','구매, 다운로드, 공지사항, 패치노트, 1:1 문의를 이용할 수 있습니다.':'購入・ダウンロード・お知らせ・パッチノート・お問い合わせをご利用いただけます。','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio公式ポータルです。ホームは紹介・購入・ダウンロードを中心にし、お知らせ・パッチノート・非公開問い合わせは別ページに分けました。',
    '라이선스 구매하기':'ライセンス購入','무료 체험 다운로드':'無料体験ダウンロード','1:1 문의하기':'問い合わせる','Windows 지원':'Windows対応','Google 계정 연동':'Googleアカウント連携','비공개 문의':'非公開問い合わせ','업데이트, 이벤트, 운영 안내를 확인합니다.':'アップデート、イベント、運営案内を確認できます。','버전별 변경 사항을 확인합니다.':'バージョン別の変更内容を確認できます。','비공개 문의를 작성하고 답변을 확인합니다.':'非公開問い合わせを作成し、返信を確認できます。','라이선스 상태와 로그인 정보를 확인합니다.':'ライセンス状態とログイン情報を確認できます。','바로가기':'開く','문의하기':'問い合わせ','확인하기':'確認','최신 설치 파일':'最新インストーラー','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Firestore downloads/latest を基準に最新バージョンを表示します。','불러오는 중...':'読み込み中...','최신 설치 파일과 버전 정보를 확인합니다.':'最新インストーラーとバージョン情報を確認できます。',
    'Google 로그인':'Googleログイン','로그인 전':'未ログイン','Google 로그인으로 라이선스 확인 준비':'Googleログインでライセンス確認','라이선스 확인 전':'ライセンス未確認',
    '공지 상세':'お知らせ詳細','자주 묻는 질문':'よくある質問','비공개 1:1 문의':'非公開お問い合わせ','문의 등록':'送信','문의 상세':'問い合わせ詳細','라이선스 구매':'ライセンス購入','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'パッチノート登録','공지 등록':'お知らせ登録','FAQ 등록':'FAQ登録','라이선스 저장':'ライセンス保存','문의 답변':'問い合わせ返信','공지 작성':'お知らせ作成','패치노트 작성':'パッチノート作成','FAQ 작성':'FAQ作成','라이선스 지급/수정':'ライセンス付与/修正',
    '제목':'タイトル','내용':'内容','검색':'検索','버전':'バージョン','질문':'質問','답변':'回答','순서':'順序','상단 고정':'上部固定','플랜':'プラン','상태':'状態','메모':'メモ','사용자 UID':'ユーザーUID','등록':'登録','저장':'保存','문의 내용을 자세히 적어주세요.':'お問い合わせ内容を詳しく入力してください。','로그인 오류 / 라이선스 문의':'ログインエラー / ライセンス問い合わせ','로그인이 필요합니다.':'ログインが必要です。','내가 작성한 비공개 문의와 답변을 확인합니다.':'自分の非公開問い合わせと返信を確認します。','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。','role=admin 계정만 사용할 수 있습니다.':'role=adminアカウントのみ使用できます。',
    '답변 완료':'回答済み','종료':'終了','접수':'受付','권한이 없습니다.':'権限がありません。','관리자 로그인이 필요합니다.':'管理者ログインが必要です。','표시할 내용이 없습니다.':'表示する内容がありません。','확인 실패':'確認失敗','저장 완료':'保存完了','수정':'編集','삭제':'削除','종료 처리':'終了にする','관리':'管理','상세 보기':'詳細を見る','공지 관리':'お知らせ管理','패치노트 관리':'パッチノート管理','FAQ 관리':'FAQ管理','정말 삭제할까요?':'本当に削除しますか？','수정 완료':'更新しました','삭제 완료':'削除しました','문의가 등록되었습니다.':'問い合わせを登録しました。',
    '이용약관':'利用規約','개인정보처리방침':'プライバシーポリシー','환불정책':'返金ポリシー','사업자정보':'事業者情報','고객센터':'サポート','AI 기반 MIDI 변환 소프트웨어':'AIベースMIDI変換ソフト','AI 기반 MIDI 변환 소프트웨어 · 디지털 라이선스 상품':'AIベースMIDI変換ソフト · デジタルライセンス商品',
    '피아노 커버 작업실':'ピアノカバー作業室','YouTube 링크나 오디오 파일을 불러와 AI가 MIDI로 변환합니다.':'YouTubeリンクやオーディオファイルを読み込み、AIがMIDIに変換します。','변환·편집·트랙 분리·라이브러리까지 한 앱에서 이어집니다.':'変換・編集・トラック分離・ライブラリまで1つのアプリで続けられます。','영상·오디오를 MIDI로':'映像・オーディオをMIDIに','YouTube 링크 붙여넣기, 로컬 파일 업로드, 곡 검색으로 작업을 시작합니다. 웨이브폼 미리보기와 구간 선택 후 원하는 악기로 MIDI를 받습니다.':'YouTubeリンクの貼り付け、ローカルアップロード、曲検索で作業を開始。波形プレビューと区間選択後、希望の楽器でMIDIを取得できます。','YouTube 링크 분석':'YouTubeリンク解析','웨이브폼 미리듣기':'波形プレビュー','출력 악기·구간 선택':'出力楽器・区間選択','MIDI 편집 PRO':'MIDI編集 PRO','멀티트랙 피아노 롤':'マルチトラックピアノロール','변환된 MIDI를 바로 편집합니다. 11종 악기, 벨로시티·피치벤드·모듈레이션, 실행취소/복사/양자화까지 프로 편집 환경을 제공합니다.':'変換したMIDIをすぐ編集。11種楽器、ベロシティ・ピッチベンド・モジュレーション、元に戻す/コピー/クオンタイズまで対応。','11종 악기 지원':'11種楽器対応','벨로시티·CC 파라미터 편집':'ベロシティ・CC編集','홈 · 포털 연동':'ホーム・ポータル連携','공지사항, 패치노트, 라이선스 상태를 앱 안에서 확인하고 Studio로 바로 이동합니다.':'お知らせ、パッチノート、ライセンス状態をアプリ内で確認しStudioへ移動できます。','Google 로그인 후 홈페이지 자유게시판 글을 앱에서 바로 확인하고 작성할 수 있습니다.':'Googleログイン後、自由掲示板の投稿をアプリで確認・作成できます。','트랙 분리':'トラック分離','기능 준비중':'準備中','라이브러리':'ライブラリ','변환·편집한 MIDI 파일을 라이브러리에서 관리하고 다시 열어 작업을 이어갑니다.':'変換・編集したMIDIをライブラリで管理し、再度開いて作業を続けられます。','정식 라이선스 혜택':'正式ライセンス特典','전체 구간 MIDI 변환':'全曲MIDI変換','악기 변환':'楽器変換','제한 없는 저장 · full song export':'無制限保存 · full song export','MIDI 편집 기능':'MIDI編集機能',
    '공식 설치 · 업데이트 프로그램':'公式インストール・更新プログラム','MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.':'MidiAI Installerは、インストール、クイック更新、フルインストール/修復、ランタイム確認を1画面で行うWindows専用ツールです。','설치 방법':'インストール方法','실행 · 업데이트 방법':'実行・更新方法','결제 정보':'決済情報','주문자 정보':'購入者情報','휴대폰 번호':'携帯電話番号','결제수단':'決済手段','상품명':'商品名','판매가격':'販売価格','결제형태':'決済形態','단건 결제':'単発決済','서비스 제공기간':'サービス提供','결제 완료 후 즉시 라이선스 발급':'決済完了後すぐにライセンス発行','Google 로그인 계정 기준':'Googleログインアカウント基準','Google 로그인 후 자동 입력':'Googleログイン後に表示','KG이니시스 카드 결제 시 필요한 주문자 연락처입니다.':'韓国カード決済時に必要な連絡先です。','결제 버튼을 준비하고 있습니다.':'決済ボタンを準備しています。','라이선스 안내':'ライセンス案内','계좌 입금 안내':'銀行振込案内','사이트 메뉴':'サイトメニュー','게시판 메뉴':'掲示板メニュー',
    '질문, 후기, 정보를 자유롭게 나누는 공간입니다.':'質問・レビュー・情報を自由に共有する場所です。','게시글 목록':'投稿一覧','공지 목록':'お知らせ一覧','공지':'お知らせ','← 목록':'← 一覧','목록':'一覧','유형':'種類','(제목 없음)':'（タイトルなし）','로그인 후 게시글을 작성할 수 있습니다.':'ログイン後に投稿できます。','자주 묻는 질문과 답변을 빠르게 확인하세요.':'よくある質問と回答を素早く確認できます。','Google 로그인 정보와 라이선스 상태를 확인합니다.':'Googleログイン情報とライセンス状態を確認できます。',
    '신규':'新規','개선':'改善','수정':'修正','변경':'変更','변경 사항':'変更内容','내용이 없습니다.':'内容がありません。','목차':'目次','최신':'新しい版','이전':'前の版','버전 이동':'バージョン移動','공유':'共有','전체 패치노트':'パッチノート一覧','문의':'問い合わせ'
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
function refreshTopbarPageTitle(){
  const el = document.querySelector('.topbar-page');
  if(!el) return;
  if(page === 'support.html'){
    el.textContent = supportLocaleText().title;
    return;
  }
  if(page === 'downloads.html'){
    el.textContent = downloadLocaleText().title;
    return;
  }
  const raw = (document.title || 'MidiAI Studio').split(' - ')[0].trim() || 'MidiAI Studio';
  el.textContent = lang === 'ko' ? raw : (translate(raw) || raw);
}
function downloadLocaleText(){
  if(lang === 'en') return {
    title:'Downloads',
    desc:'Check the latest installer and version info.',
    guideTitle:'Official installer & updater',
    guideLead:'MidiAI Installer is a Windows tool for install, quick update, full install/repair, and runtime checks.',
    setupTitle:'How to install',
    runTitle:'How to run & update',
    setupSteps:[
      'Use the <strong>Download</strong> button above to get <code>MidiAI Installer.exe</code>.',
      'Run the installer and confirm the install path. The default is <code>C:\\MidiAI</code>.',
      'For a first install, choose <strong>Full Install / Repair</strong>.',
      'Progress follows Core → Media → Library → Runtime → Check. Check status in the install log below.',
      'When verification finishes, open the install folder with <strong>Open Folder</strong>.'
    ],
    runSteps:[
      'If already installed, run the Installer again and use <strong>Quick Update</strong> to refresh app files quickly.',
      'If launch fails or files are missing, use <strong>Full Install / Repair</strong> or <strong>Update / Repair Mode</strong>.',
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
    guideLead:'MidiAI Installerは、インストール、クイック更新、フルインストール/修復、ランタイム確認を1画面で行うWindows専用ツールです。',
    setupTitle:'インストール方法',
    runTitle:'実行・更新方法',
    setupSteps:[
      '上の<strong>ダウンロード</strong>ボタンで<code>MidiAI Installer.exe</code>を取得します。',
      'インストーラーを実行し、インストール先を確認します。既定パスは<code>C:\\MidiAI</code>です。',
      '初回インストール時は<strong>Full Install / Repair</strong>を選択します。',
      'Core → Media → Library → Runtime → Check の順で進み、下部ログで状態を確認します。',
      '最終確認が終わると<strong>Open Folder</strong>でインストールフォルダを開けます。'
    ],
    runSteps:[
      'すでにインストール済みの場合はInstallerを再実行し、<strong>Quick Update</strong>でアプリファイルだけを素早く更新します。',
      '起動エラーやファイル欠損がある場合は<strong>Full Install / Repair</strong>または<strong>Update / Repair Mode</strong>で修復します。',
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
    guideLead:'MidiAI Installer는 MidiAI Studio의 설치, 빠른 업데이트, 전체 설치/복구, 런타임 점검을 한 화면에서 처리하는 Windows 전용 도구입니다.',
    setupTitle:'설치 방법',
    runTitle:'실행 · 업데이트 방법',
    setupSteps:[
      '위 <strong>다운로드</strong> 버튼으로 <code>MidiAI Installer.exe</code>를 받습니다.',
      '설치 파일을 실행하고 설치 경로를 확인합니다. 기본 경로는 <code>C:\\MidiAI</code>입니다.',
      '처음 설치하는 경우 <strong>Full Install / Repair</strong>를 선택합니다.',
      'Core → Media → Library → Runtime → Check 순서로 진행되며, 하단 설치 로그에서 상태를 확인합니다.',
      '최종 점검이 완료되면 <strong>Open Folder</strong>로 설치 폴더를 열 수 있습니다.'
    ],
    runSteps:[
      '이미 설치된 경우 Installer를 다시 실행한 뒤 <strong>Quick Update</strong>로 앱 파일만 빠르게 갱신합니다.',
      '실행 오류나 파일 누락이 있으면 <strong>Full Install / Repair</strong> 또는 <strong>Update / Repair Mode</strong>로 복구합니다.',
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
    submit:'등록', edit:'수정', del:'삭제', close:'종료 처리', updated:'수정 완료', deleted:'삭제 완료', manage:'관리', confirm_delete:'정말 삭제할까요?'
  };
  const EN = {
    login:'Sign in with Google', logout:'Logout', guest:'Not signed in', guest_desc:'Sign in with Google to check license',
    license_wait:'Not checked yet', active:'License active', none:'No license', checking:'Checking license',
    check_failed:'Check failed', empty:'Nothing to show.', saved:'Saved', ticket_created:'Ticket created.', privacy_required:'Please agree to the privacy policy.',
    need_login:'Sign-in required.', download:'Download', admin_required:'Admin sign-in required.',
    no_permission:'You do not have permission.', answered:'Answered', closed:'Closed', open:'Open', reply_placeholder:'Reply or add more details',
    submit:'Submit', edit:'Edit', del:'Delete', close:'Close', updated:'Updated', deleted:'Deleted', manage:'Manage', confirm_delete:'Delete this item?'
  };
  const JA = {
    login:'Googleログイン', logout:'ログアウト', guest:'未ログイン', guest_desc:'Googleログインでライセンス確認',
    license_wait:'未確認', active:'ライセンス有効', none:'ライセンスなし', checking:'確認中',
    check_failed:'確認失敗', empty:'表示する内容がありません。', saved:'保存完了', ticket_created:'問い合わせを登録しました。', privacy_required:'個人情報の収集・利用に同意してください。',
    need_login:'ログインが必要です。', download:'ダウンロード', admin_required:'管理者ログインが必要です。',
    no_permission:'権限がありません。', answered:'回答済み', closed:'終了', open:'受付', reply_placeholder:'返信または追加内容を入力',
    submit:'登録', edit:'編集', del:'削除', close:'終了にする', updated:'更新しました', deleted:'削除しました', manage:'管理', confirm_delete:'本当に削除しますか？'
  };
  const T = lang === 'en' ? EN : lang === 'ja' ? JA : KO;
  return T[k] || KO[k] || k;
}

function fmtDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d ? d.toLocaleString(lang==='ja'?'ja-JP':lang==='en'?'en-US':'ko-KR') : ''; } catch { return ''; } }
function fmtListDate(v){ try{ const d=v?.toDate?v.toDate():(v?new Date(v):null); if(!d)return '-'; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`; }catch{return '';} }
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
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
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
  const parsed = parsePatchContent(d.content);
  const { sections } = parsed;
  const bodyHtml = sections.length ? patchContentHtml(sections) : `<div class="patch-prose">${nl2br(d.content || '')}</div>`;
  const toc = patchTocHtml(sections);
  return `<article class="hub-post-detail hub-patch-detail">
    <header class="patch-toolbar">
      <a class="patch-back-link" href="./patch-notes.html">← ${esc(tt('패치노트'))}</a>
      <button type="button" class="ghost mini-btn" data-share-patch>${esc(tt('공유'))}</button>
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
function purchaseDisplayPrice(){
  if(isKoreanCheckout()) return CONFIG.priceDisplayKr || '90,000원';
  return CONFIG.priceDisplayGlobal || CONFIG.priceDisplay || '$65 USD';
}
function purchaseAmountValue(){
  return isKoreanCheckout() ? Number(CONFIG.priceValueKr || CONFIG.priceValue || 90000) : String(CONFIG.priceValueGlobal || CONFIG.priceValue || '65.00');
}
function purchaseCurrency(){
  return isKoreanCheckout() ? 'KRW' : (CONFIG.currencyGlobal || CONFIG.currency || 'USD');
}
function paymentId(prefix='midiai'){
  const rand = (window.crypto?.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
  return `${prefix}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
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
      {title:'Instrument conversion',desc:'Generate MIDI for piano, guitar, bass, and other instruments.'},
      {title:'MIDI Editor PRO',desc:'Edit multi-track piano rolls with velocity and CC parameters.'}
    ],
    benefits:['Linked to your Google account','Available on your registered PC','Support via 1:1 Support'],
    accountTitle:'Sign in with Google before purchasing.',
    signedOut:'After signing in, the Lifetime license will be assigned automatically to your Google account after payment.',
    signedIn:(id)=>`After payment, a Lifetime license will be assigned automatically to <b>${id}</b>.`,
    paypalReady:'PayPal buttons will appear after the Client ID and Functions URL are configured.',
    kakaoReady:'KakaoPay checkout is available for Korean checkout.',
    kakaoButton:'Pay with KakaoPay',
    kakaoPreparing:'Opening KakaoPay checkout...',
    kakaoComplete:'KakaoPay payment completed.',
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
      {title:'楽器変換',desc:'ピアノ・ギター・ベースなど希望の楽器でMIDIを生成します。'},
      {title:'MIDI編集 PRO',desc:'マルチトラックピアノロールでベロシティやCCを編集できます。'}
    ],
    benefits:['Googleアカウントにライセンス連携','登録済みPCで利用可能','サイト内お問い合わせサポート'],
    accountTitle:'Googleアカウントでログイン後、ご購入いただけます。',
    signedOut:'ログイン後に決済すると、LifetimeライセンスがGoogleアカウントへ自動付与されます。',
    signedIn:(id)=>`決済完了後、<b>${id}</b> にLifetimeライセンスが自動付与されます。`,
    paypalReady:'PayPal Client IDとFunctions URLの設定後、決済ボタンが表示されます。',
    kakaoReady:'KakaoPay決済が利用できます。',
    kakaoButton:'KakaoPayで決済',
    kakaoPreparing:'KakaoPay決済画面を開いています...',
    kakaoComplete:'KakaoPay決済が完了しました。',
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
      {title:'악기 변환',desc:'피아노·기타·베이스 등 원하는 악기로 MIDI를 생성합니다.'},
      {title:'MIDI 편집 PRO',desc:'멀티트랙 피아노 롤에서 벨로시티·CC 파라미터를 편집합니다.'}
    ],
    benefits:['Google 계정 라이선스 연결','등록된 PC에서 사용 가능','홈페이지 1:1 문의 지원'],
    accountTitle:'Google 로그인 후 결제할 수 있습니다.',
    signedOut:'결제 전 로그인하면 해당 Google 계정 UID에 라이선스가 자동 지급됩니다.',
    signedIn:(id)=>`결제 완료 시 <b>${id}</b> 계정에 Lifetime 라이선스가 자동 지급됩니다.`,
    paypalReady:'PayPal Client ID와 Functions URL 설정 후 결제 버튼이 표시됩니다.',
    kakaoReady:'카카오페이 결제를 사용할 수 있습니다.',
    kakaoButton:'카카오페이로 구매',
    kakaoPreparing:'카카오페이 결제창을 여는 중입니다...',
    kakaoComplete:'카카오페이 결제가 완료되었습니다.',
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
  if($('purchaseSaleUntil')) $('purchaseSaleUntil').textContent = t.saleUntil;
  if($('purchaseBenefitList')) $('purchaseBenefitList').innerHTML = t.benefits.map(x=>`<li>${esc(x)}</li>`).join('');
  if($('purchaseAccountTitle')) $('purchaseAccountTitle').textContent = t.accountTitle;
  const bank = $('bankTransferNotice');
  if(bank) bank.classList.toggle('hidden', lang !== 'ko');
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
  if(orderItems[1]){
    const label = orderItems[1].querySelector('label[for="purchasePhone"]') || orderItems[1].querySelector('dt');
    if(label) label.textContent = t.phoneLabel;
  }
  if(orderItems[2]){
    const dt = orderItems[2].querySelector('dt');
    if(dt) dt.textContent = t.paymentLabel;
  }
  if($('purchasePhoneHelp')) $('purchasePhoneHelp').textContent = t.phoneHelp;
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
    box.innerHTML = '<span class="checkout-pay-chip">신용/체크카드</span><span class="checkout-pay-chip is-kakao">카카오페이</span>';
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
  bindAdminTabs();
}
function bindAdminTabs(){
  const root=$('admin');
  if(!root || root.dataset.tabsBound) return;
  root.dataset.tabsBound='1';
  const tabs=root.querySelectorAll('[data-admin-tab]');
  const panels=root.querySelectorAll('[data-admin-panel]');
  const activate=(name)=>{
    tabs.forEach(t=>t.classList.toggle('is-active', t.dataset.adminTab===name));
    panels.forEach(p=>p.classList.toggle('is-active', p.dataset.adminPanel===name));
  };
  tabs.forEach(tab=>{
    tab.addEventListener('click',()=>activate(tab.dataset.adminTab));
  });
  root.querySelectorAll('[data-admin-tab-jump]').forEach(btn=>{
    btn.addEventListener('click',()=>activate(btn.dataset.adminTabJump));
  });
}

function updateBoardPinnedUi(){
  const wrap=$('boardPinnedWrap');
  if(!wrap) return;
  const show=!!isAdminUser;
  wrap.style.display=show?'flex':'none';
  wrap.hidden=!show;
  if(!show && $('boardPostPinned')) $('boardPostPinned').checked=false;
}
function setAuthUiSignedOut(){
  currentUser = null; currentUserDoc = null; isAdminUser = false;
  $('adminNav')?.classList.add('hidden');
  $('loginBtn')?.classList.remove('hidden');
  $('logoutBtn')?.classList.add('hidden');
  if ($('avatar')) $('avatar').textContent='?';
  if ($('userName')) $('userName').textContent=tr('guest');
  if ($('userEmail')) $('userEmail').textContent=tr('guest_desc');
  if ($('licenseBadge')) { $('licenseBadge').className='badge pending'; $('licenseBadge').textContent=tr('license_wait'); }
  if ($('accountMeta')) $('accountMeta').innerHTML='';
  if (page==='my-tickets.html' && $('myTicketList')) $('myTicketList').innerHTML=`<div class="empty-card">${tr('need_login')}</div>`;
  if (page==='ticket.html' && $('ticketDetail')) $('ticketDetail').innerHTML=`<div class="empty-card">${tr('need_login')}</div>`;
  if (page==='admin.html') setAdminGate(`<p>${tr('need_login')}</p><p class="muted">Google 로그인 후 role=admin 계정만 접근할 수 있습니다.</p>`);
  updateBoardPinnedUi();
  updatePurchaseAccountBox();
  updateSupportFormUi();
}

function metaCard(k,v){ return `<div class="stat-card"><b>${esc(k)}</b><span>${esc(v || '-')}</span></div>`; }
async function setAuthUiSignedIn(user){
  currentUser=user;
  $('loginBtn')?.classList.add('hidden');
  $('logoutBtn')?.classList.remove('hidden');
  if ($('avatar')) $('avatar').textContent=(user.displayName||user.email||'?').slice(0,1).toUpperCase();
  if ($('userName')) $('userName').textContent=user.displayName||'Google User';
  if ($('userEmail')) $('userEmail').textContent=user.email||'';
  await upsertUser(user);
  await loadLicense(user.uid);
  if (page==='my-tickets.html') listenMyTickets();
  if (page==='ticket.html') listenTicketDetail();
  if (page==='board-write.html') initBoardPostEditor();
  if (page==='board-post.html') refreshBoardPostActions();
  if (page==='admin.html') {
    if (isAdminUser) {
      unlockAdminPanel();
      listenAdminDashboard(); listenAdminUsers(); listenAdminTickets(); listenAdminPostManager(); bindAdminBoardFilters(); loadAdminDownloadSettings();
    } else {
      setAdminGate(`<p>${tr('no_permission')}</p><p class="muted">${tr('admin_required')}</p>`);
    }
  }
  updateBoardPinnedUi();
  updatePurchaseAccountBox();
  updateSupportFormUi();
}

async function upsertUser(user){
  try {
    const {doc,getDoc,setDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'users',user.uid);
    const snap=await getDoc(ref);
    const old=snap.exists()?snap.data():{};
    const data={uid:user.uid,email:user.email||'',displayName:user.displayName||'',photoURL:user.photoURL||'',lastLogin:serverTimestamp(),lastSeenAt:serverTimestamp()};
    if(!snap.exists()) data.createdAt=serverTimestamp();
    await setDoc(ref,data,{merge:true});
    currentUserDoc={...old,...data};
    isAdminUser=old.role==='admin';
    if(isAdminUser) $('adminNav')?.classList.remove('hidden');
  } catch(e) { console.error('user upsert',e); }
}
async function loadLicense(uid){
  const badge=$('licenseBadge');
  if(badge){ badge.className='badge pending'; badge.textContent=tr('checking'); }
  try{
    const {doc,getDoc}=firestoreApi;
    const snap=await getDoc(doc(db,'licenses',uid));
    const d=snap.exists()?snap.data():null;
    const active=!!(d && d.licensed===true && String(d.status||'').toLowerCase()==='active');
    if(badge){ badge.className='badge '+(active?'active':'none'); badge.textContent=active?tr('active'):tr('none'); }
    if($('accountMeta')){
      $('accountMeta').innerHTML=[
        metaCard('UID',uid), metaCard('Email',currentUser.email), metaCard('Display Name',currentUser.displayName),
        metaCard('Plan',d?.plan), metaCard('Status',d?.status), metaCard('Role',isAdminUser?'admin':'user')
      ].join('');
    }
  } catch(e) { console.error(e); if(badge){ badge.className='badge none'; badge.textContent=tr('check_failed'); } }
}

async function initAuth(){
  if(!configuredFirebase()){ console.error('Firebase config missing or invalid',CONFIG.firebase); return; }
  const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged},fs,st]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js')
  ]);
  const app=initializeApp(CONFIG.firebase);
  auth=getAuth(app);
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

  $('loginBtn') && ($('loginBtn').onclick=loginWithGoogle);
  $('logoutBtn') && ($('logoutBtn').onclick=()=>signOut(auth));
  onAuthStateChanged(auth,u=>u?setAuthUiSignedIn(u):setAuthUiSignedOut());
  routeLoadPublic();
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
function routeLoadPublic(){
  if(!db) return;
  if(['downloads.html','purchase.html'].includes(page) || (page==='index.html' && $('downloadBox')) || (page==='' && $('downloadBox'))) listenDownload();
  if(page==='' || page==='index.html') initHomePage();
  if(page==='notices.html') listenAnnouncements();
  if(page==='notice.html') listenNoticeDetail();
  if(page==='patch-notes.html') listenPatchNotes();
  if(page==='patch-note.html') listenPatchDetail();
  if(page==='faq.html') listenFaq();
  if(page==='board.html') listenBoardPosts();
  if(page==='board-post.html') listenBoardPostDetail();
  if(page==='board-write.html') initBoardPostEditor();
}
function renderDownload(d){
  const box=$('downloadBox'); if(!box)return;
  const t = downloadLocaleText();
  if(!d){
    box.innerHTML=`<div class="portal-download-inner download-card-pro portal-download-empty"><div class="download-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></div><div class="portal-download-meta"><h3>MidiAI Studio</h3><p class="muted">${tr('empty')}</p></div><div class="portal-download-actions"><a class="secondary" href="./purchase.html">${esc(t.buyLicense)}</a></div></div>`;
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
  </div>`;
}
function listenDownload(){ if(!$('downloadBox')) return; listenDoc('downloads','latest',renderDownload); }
function renderHomeUpdates(rows, err){
  const box=$('homeUpdates'); if(!box) return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!rows?.length){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<div class="home-updates-list">${rows.map(x=>`<a class="home-update-item" href="./notice.html?id=${encodeURIComponent(x.id)}"><span class="home-update-tag">${x.pinned?'공지':'소식'}</span><b>${esc(x.title)}</b><em>${esc(fmtListDate(x.createdAt))}</em></a>`).join('')}</div>`;
}
function renderHomePatches(rows, err){
  const box=$('homePatches'); if(!box) return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!rows?.length){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<div class="home-updates-list">${rows.map(x=>`<a class="home-update-item" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><span class="home-update-tag is-patch">${x.version?`v${esc(x.version)}`:'패치'}</span><b>${esc(x.title)}</b><em>${esc(fmtListDate(x.createdAt))}</em></a>`).join('')}</div>`;
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
function renderAnnouncements(rows, err){
  const list=$('announcementList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>(b.pinned===true)-(a.pinned===true)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  let normalNo=rows.filter(x=>!x.pinned).length;
  list.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${rows.map(x=>{ const no=x.pinned?`<div class="hub-col-no is-pinned-no">${esc(tt('공지'))}</div>`:`<div class="hub-col-no">${normalNo--}</div>`; return `<a class="hub-list-row hub-notice-row ${x.pinned?'is-pinned':''}" href="./notice.html?id=${encodeURIComponent(x.id)}">${no}<div class="hub-col-title"><b>${x.pinned?'📌 ':''}<span class="hub-col-title-text">${esc(x.title)}</span></b></div><div class="hub-col-author">${esc(noticeAuthor(x))}</div><div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`; }).join('')}</div>`;
  bindSearch(list);
}
function listenAnnouncements(){ if($('announcementList')) listenVisibleDocs('announcements',renderAnnouncements); }
function renderNoticeDetail(d,err){
  const box=$('noticeDetail'); if(!box)return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!d){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<article class="hub-post-detail"><div class="post-nav-row"><a class="secondary mini-btn" href="./notices.html">${esc(tt('← 목록'))}</a></div><div class="post-card-head"><div class="post-kicker">${esc(tt('공지사항'))}</div><h1>${esc(d.title)}</h1><div class="post-meta-grid"><span><em>${esc(tt('글쓴이'))}</em><b>${esc(noticeAuthor(d))}</b></span><span><em>${esc(tt('작성일'))}</em><b>${fmtDate(d.createdAt)}</b></span><span><em>${esc(tt('조회'))}</em><b>${Number(d.viewCount||0)}</b></span></div></div><div class="post-body-content">${nl2br(d.content)}</div></article>`;
}
async function incrementNoticeViewOnce(id){
  const key='midiai_notice_view_'+id;
  if(sessionStorage.getItem(key))return;
  sessionStorage.setItem(key,'1');
  try{ const {doc,updateDoc,increment}=firestoreApi; await updateDoc(doc(db,'announcements',id),{viewCount:increment(1)}); }catch(e){ console.warn('notice view increment failed',e); }
}
function listenNoticeDetail(){ const box=$('noticeDetail'); if(!box)return; const id=getParam('id'); if(!id){box.innerHTML=`<p class="muted">${tr('empty')}</p>`;return} incrementNoticeViewOnce(id); listenDoc('announcements',id,renderNoticeDetail); }
function renderPatchNotes(rows,err){
  const list=$('patchList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  let no=rows.length;
  list.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${rows.map(x=>`<a class="hub-list-row hub-notice-row" href="./patch-note.html?id=${encodeURIComponent(x.id)}"><div class="hub-col-no">${no--}</div><div class="hub-col-title"><b>${x.version?`<span class="badge active">v${esc(x.version)}</span>`:''}<span class="hub-col-title-text">${esc(x.title)}</span></b></div><div class="hub-col-author">${esc(noticeAuthor(x))}</div><div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`).join('')}</div>`;
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
  const nav=patchNeighbors(d.id);
  box.innerHTML = patchDetailHtml({...d,id:d.id}, nav);
  bindPatchDetailActions(box);
}
async function incrementPatchViewOnce(id){
  const key='midiai_patch_view_'+id;
  if(sessionStorage.getItem(key))return;
  sessionStorage.setItem(key,'1');
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
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>Number(a.order||999)-Number(b.order||999));
  list.innerHTML=rows.map(x=>`<article class="faq-item"><h3>${esc(x.question)}</h3><div class="content">${nl2br(x.answer)}</div></article>`).join('');
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
    badge_file:'File',
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
    badge_file:'ファイル',
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
    badge_file:'파일',
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

function ticketFileType(fileOrAttachment){
  const mime = String(fileOrAttachment?.type || fileOrAttachment?.mime || '');
  if(mime.startsWith('video/')) return 'video';
  if(mime.startsWith('image/')) return 'image';
  return 'file';
}
function ticketFileIcon(type){ return ({video:'🎥',image:'🖼️',file:'📎'})[type] || '📎'; }
function ticketAttachmentBadge(type){
  const t = supportLocaleText();
  return ({video:t.badge_video,image:t.badge_image,file:t.badge_file})[type] || t.badge_file;
}
function ticketAttachmentItemHtml(a, idx, editable=false){
  const type = ticketFileType(a);
  const name = esc(a.name || a.fileName || 'attachment');
  const url = esc(a.url || '');
  const badge = ticketFileIcon(type) + ' ' + ticketAttachmentBadge(type);
  const remove = editable ? `<button type="button" class="secondary mini-btn danger-btn" data-remove-ticket-attachment="${idx}">삭제</button>` : '';
  const media = type === 'video'
    ? `<video controls preload="metadata" src="${url}"></video>`
    : type === 'image'
    ? `<img src="${url}" alt="${name}" loading="lazy" data-lightbox-src="${url}">`
    : `<div class="ticket-attachment-file"><a href="${url}" target="_blank" rel="noopener noreferrer" download><span>📎</span><b>${name}</b></a></div>`;
  return `<figure class="board-attachment-item board-attachment-${type}">${media}<figcaption><span>${badge}</span><b>${name}</b>${remove}</figcaption></figure>`;
}
function ticketAttachmentsHtml(list){
  const arr = Array.isArray(list) ? list.filter(x=>x && x.url) : [];
  if(!arr.length) return '';
  return `<div class="board-attachments ticket-attachments">${arr.map((a,i)=>ticketAttachmentItemHtml(a,i,false)).join('')}</div>`;
}
function renderTicketAttachmentPreview(){
  const box = $('ticketAttachmentPreview');
  if(!box) return;
  const fresh = selectedTicketFiles.map((file,i)=>{
    const type = ticketFileType(file);
    return `<div class="board-file-chip"><span>${ticketFileIcon(type)}</span><b>${esc(file.name)}</b><small>${Math.max(1, Math.ceil(file.size/1024/1024))}MB</small><button type="button" class="secondary mini-btn danger-btn" data-remove-new-ticket-attachment="${i}">삭제</button></div>`;
  }).join('');
  box.innerHTML = fresh ? `<div class="board-file-chip-list">${fresh}</div>` : `<p class="muted">${esc(supportLocaleText().noAttach)}</p>`;
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
    form.classList.add('is-disabled');
    fields.forEach(el=>{ el.disabled=true; });
    resetTicketAttachments();
    if(loginBtn && !loginBtn.dataset.bound){
      loginBtn.dataset.bound='1';
      loginBtn.addEventListener('click',()=>$('loginBtn')?.click());
    }
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

async function createTicket(e){
  e.preventDefault();
  if(!currentUser){ showFormMsg('need_login',false); return; }
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
    return `<article class="hub-post-detail"><div class="post-card-head"><div class="post-kicker">1:1 문의</div><h1>${esc(t.title||'')}</h1><div class="post-meta-grid"><span>${statusBadge(t.status)}</span><span><em>작성일</em><b>${esc(fmtShortDate(t.createdAt))}</b></span>${metaExtra}</div></div><div class="post-body-content hub-post-body">${nl2br(t.content||'')}</div>${ticketAttachmentsHtml(t.attachments)}${actions}<section class="hub-replies-panel"><h3>답변</h3><div class="ticket-replies hub-reply-list" data-replies="${esc(t.id)}"></div>${form}</section></article>`;
  }
  const href=`./ticket.html?id=${encodeURIComponent(t.id)}`;
  return `<a class="hub-list-row hub-ticket-row" href="${href}"><div class="hub-col-title"><b>${esc(t.title||'(제목 없음)')}</b></div><div class="hub-col-cat">${esc(ticketCategoryLabel(t.category))}</div><div class="hub-col-badge">${statusBadge(t.status)}</div><div class="hub-col-date">${esc(fmtListDate(t.createdAt))}</div></a>`;
}
function listenReplies(ticketId, container){
  const {collection,query,orderBy,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets',ticketId,'replies'),orderBy('createdAt','asc'));
  return addUnsub(onSnapshot(q, snap => {
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    container.innerHTML=rows.map(r=>`<div class="reply"><b>${esc(r.role==='admin'?BRAND_AUTHOR:(r.displayName||r.email||'user'))} · ${fmtDate(r.createdAt)}</b><p>${nl2br(r.content)}</p></div>`).join('');
  }, err => { console.error('replies',err); container.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
function bindReplyForms(root=document){ root.querySelectorAll('.reply-form').forEach(f=>{ if(f.dataset.bound) return; f.dataset.bound='1'; f.addEventListener('submit',ticketReply); }); bindTicketActions(root); }
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
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-backdrop';
    const form = document.createElement('form');
    form.className = 'edit-modal';
    form.innerHTML = `<div class="edit-modal-head"><h3>${esc(title)}</h3><button type="button" class="edit-modal-x" aria-label="close">×</button></div><div class="edit-modal-body"></div><div class="edit-modal-actions"><button type="button" class="secondary" data-cancel>취소</button><button type="submit" class="primary">저장</button></div>`;
    const body = form.querySelector('.edit-modal-body');
    fields.forEach(f => {
      const row = document.createElement('label');
      row.className = 'edit-field';
      row.innerHTML = `<span>${esc(f.label || f.name)}</span>`;
      let input;
      if (f.type === 'textarea') {
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
    });
    const close = (value) => {
      overlay._cleanup && overlay._cleanup();
      overlay.remove();
      resolve(value);
    };
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = {};
      fields.forEach(f => {
        const input = form.elements[f.name];
        if (!input) return;
        if (f.type === 'checkbox') data[f.name] = !!input.checked;
        else if (f.type === 'number') data[f.name] = Number(input.value || 0);
        else data[f.name] = String(input.value || '').trim();
      });
      close(data);
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    form.querySelector('.edit-modal-x').addEventListener('click', () => close(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    modalEscapeClose(overlay, close);
    const first = form.querySelector('input,textarea,select');
    if (first) setTimeout(() => first.focus(), 40);
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
  const {collection,query,where,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets'),where('uid','==',currentUser.uid));
  addUnsub(onSnapshot(q, snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
    if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
    list.innerHTML=`${hubTicketHeadHtml()}<div class="hub-list-body">${rows.map(t=>ticketShell(t,false,false)).join('')}</div>`;
    bindTicketActions(list);
  }, err=>{ console.error(err); list.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
function listenTicketDetail(){
  const box=$('ticketDetail'); if(!box||!currentUser)return;
  const id=getParam('id'); if(!id){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  const {doc,onSnapshot}=firestoreApi;
  addUnsub(onSnapshot(doc(db,'supportTickets',id), snap=>{
    if(!snap.exists()){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
    const t={id:snap.id,...snap.data()};
    if(!isAdminUser && t.uid!==currentUser.uid){ box.innerHTML=`<p class="muted">${tr('no_permission')}</p>`; return; }
    box.innerHTML=ticketShell(t,true,isAdminUser);
    const replyBox=box.querySelector(`[data-replies="${CSS.escape(id)}"]`);
    if(replyBox) listenReplies(id, replyBox);
    bindReplyForms(box);
  }, err=>{ console.error(err); box.innerHTML=`<p class="muted">${esc(err.message)}</p>`; }));
}
async function ticketReply(e){
  e.preventDefault();
  if(!currentUser)return;
  const form=e.currentTarget;
  const input=form.querySelector('input');
  const content=input.value.trim();
  const ticketId=form.dataset.ticket;
  if(!content)return;
  try{
    const {collection,addDoc,doc,updateDoc,serverTimestamp}=firestoreApi;
    await addDoc(collection(db,'supportTickets',ticketId,'replies'),{uid:currentUser.uid,role:isAdminUser?'admin':'user',displayName:isAdminUser?BRAND_AUTHOR:(currentUser.displayName||''),content,createdAt:serverTimestamp()});
    await updateDoc(doc(db,'supportTickets',ticketId),{status:isAdminUser?'answered':'open',updatedAt:serverTimestamp()});
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
function renderAdminTicketTable(){
  const box=$('adminTicketList'); if(!box||!isAdminUser)return;
  const rows=filterRows(adminTicketRows,'adminTicketSearch','adminTicketStatus',['title','content','email','uid','category']).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
  $('adminTicketCount') && ($('adminTicketCount').textContent = `${rows.length} / ${adminTicketRows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML = `<table class="admin-table"><thead><tr><th>제목</th><th>유형</th><th>사용자</th><th>상태</th><th>수정일</th><th>관리</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${esc(t.title||'-')}</b><small>${esc((t.content||'').slice(0,80))}${(t.content||'').length>80?'...':''}</small></td><td>${esc(ticketCategoryLabel(t.category))}</td><td><span class="mono">${esc(t.email||t.uid||'')}</span></td><td>${statusPill(t)}</td><td>${esc(fmtDate(t.updatedAt||t.createdAt))}</td><td><div class="table-actions"><a class="secondary mini-btn" href="./ticket.html?id=${encodeURIComponent(t.id)}">상세/답변</a><button class="secondary mini-btn" data-ticket-close="${esc(t.id)}">${tr('close')}</button><button class="secondary mini-btn danger-btn" data-ticket-delete="${esc(t.id)}">${tr('del')}</button></div></td></tr>`).join('')}</tbody></table>`;
  bindTicketActions(box);
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
        {name:'content', label:'내용', type:'textarea', rows:9, value:d.content||'', required:true},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false},
        {name:'pinned', label:'상단 고정', type:'checkbox', value:!!d.pinned}
      ]);
      if(!data)return;
      data.updatedAt=serverTimestamp();
    } else if(collectionName==='patchNotes'){
      data = await openEditModal('패치노트 수정', [
        {name:'version', label:'버전', value:d.version||'', required:true},
        {name:'title', label:'제목', value:d.title||'', required:true},
        {name:'content', label:'내용', type:'textarea', rows:9, value:d.content||'', required:true},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}
      ]);
      if(!data)return;
      data.updatedAt=serverTimestamp();
    } else if(collectionName==='faq'){
      data = await openEditModal('FAQ 수정', [
        {name:'question', label:'질문', value:d.question||'', required:true},
        {name:'answer', label:'답변', type:'textarea', rows:8, value:d.answer||'', required:true},
        {name:'order', label:'순서', type:'number', value:d.order||1},
        {name:'visible', label:'공개', type:'checkbox', value:d.visible!==false}
      ]);
      if(!data)return;
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
  try{ const {doc,deleteDoc}=firestoreApi; await deleteDoc(doc(db,collectionName,id)); adminFlash(tr('deleted')); }catch(e){ alert(e.message); }
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
  watch('users', rows => { adminStat('dashUsers', rows.length); adminUserRows = rows; renderAdminUserTable(); });
  watch('licenses', rows => { adminLicenseRows = rows; adminStat('dashLicenses', rows.filter(x=>x.licensed===true && String(x.status||'').toLowerCase()==='active').length); renderAdminUserTable(); });
  watch('supportTickets', rows => { adminStat('dashOpenTickets', rows.filter(x=>String(x.status||'open')==='open').length); });
  watch('announcements', rows => { adminStat('dashNotices', countVisible(rows)); });
  watch('patchNotes', rows => { adminStat('dashPatches', countVisible(rows)); });
  watch('orders', rows => { adminOrderRows = rows; adminStat('dashOrders', rows.length); });
  if($('adminBoardList')) addUnsub(onSnapshot(collection(db,'boardPosts'), snap=>{ adminBoardRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminBoardTable(); }));
}
function licenseForUid(uid){ return adminLicenseRows.find(x=>x.id===uid || x.uid===uid) || null; }
function renderAdminUserTable(){
  const box=$('adminUserList'); if(!box || !isAdminUser) return;
  const q=($('adminUserSearch')?.value||'').trim().toLowerCase();
  const st=$('adminUserLicenseStatus')?.value || 'all';
  let rows = adminUserRows.map(u=>({ ...u, license: licenseForUid(u.id || u.uid) })).filter(u=>{
    const lic=u.license; const status=String(lic?.status||'none').toLowerCase();
    const active=lic && lic.licensed===true && status==='active';
    if(st==='active' && !active) return false;
    if(st==='none' && lic) return false;
    if(st==='banned' && status!=='banned') return false;
    const hay=[u.email,u.displayName,u.uid,u.id,u.hwid,lic?.plan,lic?.status].join(' ').toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>(b.lastLogin?.seconds||b.lastSeenAt?.seconds||0)-(a.lastLogin?.seconds||a.lastSeenAt?.seconds||0));
  $('adminUserCount') && ($('adminUserCount').textContent=`${rows.length} / ${adminUserRows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=`<table class="admin-table user-admin-table"><thead><tr><th>회원</th><th>라이선스</th><th>HWID</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>${rows.map(u=>{
    const uid=u.uid||u.id; const lic=u.license; const active=lic && lic.licensed===true && String(lic.status||'').toLowerCase()==='active';
    return `<tr><td><b>${esc(u.displayName||'-')}</b><small>${esc(u.email||'')}<br><span class="mono">${esc(uid||'')}</span></small></td><td>${lic?`<span class="badge ${active?'active':'none'}">${esc(lic.plan||'-')} · ${esc(lic.status||'-')}</span>`:`<span class="badge none">none</span>`}</td><td><span class="mono">${esc(u.hwid||lic?.hwid||'-')}</span></td><td>${esc(fmtDate(u.lastLogin||u.lastSeenAt))}</td><td><div class="table-actions"><button class="secondary mini-btn" data-user-license="${esc(uid)}:lifetime:active">Lifetime</button><button class="secondary mini-btn" data-user-license="${esc(uid)}:trial:active">Trial</button><button class="secondary mini-btn danger-btn" data-user-license="${esc(uid)}:${esc(lic?.plan||'lifetime')}:banned">정지</button><button class="secondary mini-btn" data-user-hwid-reset="${esc(uid)}">HWID 초기화</button></div></td></tr>`;
  }).join('')}</tbody></table>`;
  bindAdminUserActions(box);
}
function bindAdminUserFilters(){
  ['adminUserSearch','adminUserLicenseStatus'].forEach(id=>{ const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',renderAdminUserTable); el.addEventListener('change',renderAdminUserTable); });
}
function bindAdminUserActions(root=document){
  root.querySelectorAll('[data-user-license]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>adminQuickLicense(btn.dataset.userLicense)); });
  root.querySelectorAll('[data-user-hwid-reset]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>adminResetHwid(btn.dataset.userHwidReset)); });
}
async function adminQuickLicense(raw){
  if(!isAdminUser)return alert(tr('no_permission'));
  const [uid,plan,status]=String(raw).split(':');
  if(!uid)return;
  try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'licenses',uid),{licensed:status==='active',plan,status,method:'admin',updatedAt:serverTimestamp(),createdAt:serverTimestamp()},{merge:true}); adminFlash(`${tr('saved')} · ${esc(uid)} · ${esc(plan)} / ${esc(status)}`); }catch(e){ alert(e.message); }
}
async function adminResetHwid(uid){
  if(!isAdminUser)return alert(tr('no_permission'));
  if(!confirm('이 사용자의 HWID를 초기화할까요?'))return;
  try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'users',uid),{hwid:'',updatedAt:serverTimestamp()},{merge:true}); await setDoc(doc(db,'licenses',uid),{hwid:'',updatedAt:serverTimestamp()},{merge:true}); adminFlash(`HWID 초기화 완료 · ${esc(uid)}`); }catch(e){ alert(e.message); }
}
function listenAdminUsers(){
  if(!isAdminUser || !$('adminUserList')) return;
  bindAdminUserFilters();
  // Dashboard watcher already fills rows. If dashboard is hidden in a future page, start a local watcher too.
  if(!$('dashUsers')){
    const {collection,onSnapshot}=firestoreApi;
    addUnsub(onSnapshot(collection(db,'users'), snap=>{ adminUserRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminUserTable(); }));
    addUnsub(onSnapshot(collection(db,'licenses'), snap=>{ adminLicenseRows=snap.docs.map(d=>({id:d.id,...d.data()})); renderAdminUserTable(); }));
  }
}
async function loadAdminDownloadSettings(){
  if(!isAdminUser || !$('adminDownloadSave')) return;
  try{
    const {doc,getDoc}=firestoreApi; const snap=await getDoc(doc(db,'downloads','latest')); const d=snap.exists()?snap.data():{};
    if($('adminDownloadVersion')) $('adminDownloadVersion').value=d.version||'';
    if($('adminDownloadFilename')) $('adminDownloadFilename').value=d.filename||'';
    if($('adminDownloadUrl')) $('adminDownloadUrl').value=d.url||'';
    if($('adminDownloadNotes')) $('adminDownloadNotes').value=d.notes||d.description||'';
    if($('adminDownloadMandatory')) $('adminDownloadMandatory').checked=!!d.mandatory;
  }catch(e){ console.error(e); }
  const btn=$('adminDownloadSave'); if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',saveAdminDownloadSettings);
}
async function saveAdminDownloadSettings(){
  if(!isAdminUser)return alert(tr('no_permission'));
  try{
    const {doc,setDoc,serverTimestamp}=firestoreApi;
    await setDoc(doc(db,'downloads','latest'),{version:$('adminDownloadVersion').value.trim(),filename:$('adminDownloadFilename').value.trim(),url:$('adminDownloadUrl').value.trim(),notes:$('adminDownloadNotes').value.trim(),mandatory:$('adminDownloadMandatory').checked,releaseDate:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    adminFlash(`${tr('saved')} · downloads/latest`);
  }catch(e){ alert(e.message); }
}


function isOwnerRecord(x){ return !!(currentUser && x && (x.uid === currentUser.uid || x.authorUid === currentUser.uid)); }
function canManageRecord(x){ return isAdminUser || isOwnerRecord(x); }
function boardDisplayName(){ return isAdminUser ? BRAND_AUTHOR : (currentUser?.displayName || currentUser?.email || 'Google User'); }
function boardEmail(){ return currentUser?.email || ''; }
function boardPostUrl(id){ return `./board-post.html?id=${encodeURIComponent(id)}`; }
function boardEditUrl(id){ return `./board-write.html?id=${encodeURIComponent(id)}`; }
function boardFilteredSorted(rows){
  const q=($('boardSearch')?.value||'').trim().toLowerCase();
  let out=rows.filter(x=>x.visible!==false && x.deleted!==true).filter(x=>{
    const hay=[x.title,x.content,x.displayName,x.email].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  const time=x=>x.createdAt?.seconds||0;
  out.sort((a,b)=>(b.pinned===true)-(a.pinned===true) || (time(b)-time(a)));
  return out;
}
function renderBoardPosts(rows, err){
  const box=$('boardPostList'); if(!box)return;
  if(err){ box.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  const list=boardFilteredSorted(rows||[]);
  if(!list.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  let normalNo=list.filter(x=>!x.pinned).length;
  box.innerHTML=`${hubNoticeHeadHtml()}<div class="hub-list-body">${list.map(x=>{ const no=x.pinned?`<div class="hub-col-no is-pinned-no">${esc(tt('공지'))}</div>`:`<div class="hub-col-no">${normalNo--}</div>`; return `<a class="hub-list-row hub-notice-row ${x.pinned?'is-pinned':''}" href="${boardPostUrl(x.id)}">${no}<div class="hub-col-title"><b>${x.pinned?'📌 ':''}<span class="hub-col-title-text">${esc(x.title||tt('(제목 없음)'))}</span></b></div><div class="hub-col-author">${esc(contentAuthor(x))}</div><div class="hub-col-date">${esc(fmtListDate(x.createdAt))}</div><div class="hub-col-views">${Number(x.viewCount||0)}</div></a>`; }).join('')}</div>`;
  bindSearch(box);
}
function listenBoardPosts(){
  if(!$('boardPostList')) return;
  const search=$('boardSearch');
  if(search && !search.dataset.boardBound){
    search.dataset.boardBound='1';
    search.addEventListener('input',()=>{
      if(window.__boardRows) renderBoardPosts(window.__boardRows);
    });
  }
  listenVisibleDocs('boardPosts',(rows,err)=>{
    window.__boardRows=rows||[];
    renderBoardPosts(window.__boardRows,err);
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
  return `<figure class="board-attachment-item board-attachment-${type}">${media}<figcaption><span>${badge}</span><b>${name}</b>${remove}</figcaption></figure>`;
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
  picker.innerHTML=`<div class="board-emoji-tabs">${BOARD_EMOJI_GROUPS.map(g=>`<button type="button" class="board-emoji-tab ${g.id===group.id?'is-active':''}" data-emoji-tab="${g.id}" aria-label="${g.id}">${g.icon}</button>`).join('')}</div><div class="board-emoji-grid">${group.items.map(e=>`<button type="button" class="board-emoji-item" data-emoji="${e}" title="${e}">${e}</button>`).join('')}</div><p class="board-emoji-hint">이모티콘을 눌러 내용에 삽입합니다.</p>`;
}

function setBoardEmojiPickerOpen(open){
  const picker=$('boardEmojiPicker');
  const btn=$('boardEmojiBtn');
  if(!picker||!btn) return;
  picker.classList.toggle('hidden',!open);
  btn.setAttribute('aria-expanded', open?'true':'false');
  if(open && !picker.dataset.ready){
    renderBoardEmojiPicker('smile');
    picker.dataset.ready='1';
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
  picker.addEventListener('click',e=>{
    const tab=e.target.closest('[data-emoji-tab]');
    if(tab){
      e.preventDefault();
      renderBoardEmojiPicker(tab.getAttribute('data-emoji-tab'));
      return;
    }
    const item=e.target.closest('[data-emoji]');
    if(item){
      e.preventDefault();
      insertBoardEmoji(item.getAttribute('data-emoji')||'');
    }
  });
  document.addEventListener('click',e=>{
    if(picker.classList.contains('hidden')) return;
    if(picker.contains(e.target)||btn.contains(e.target)) return;
    setBoardEmojiPickerOpen(false);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') setBoardEmojiPickerOpen(false);
  });
}

async function initBoardPostEditor(){
  const form=$('boardPostForm'); if(!form) return;
  updateBoardPinnedUi();
  const id=getParam('id');
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
      } else if(!canManageRecord(d)){
        $('boardPostMsg').textContent=tr('no_permission');
        form.querySelector('button[type="submit"]').disabled=true;
        form.dataset.editLoaded='1';
      } else {
        $('boardWriteHeading') && ($('boardWriteHeading').textContent='자유게시판 글 수정');
        $('boardPostTitle').value=d.title||'';
        $('boardPostContent').value=d.content||'';
        existingBoardAttachments = Array.isArray(d.attachments) ? d.attachments.filter(x=>x && x.url) : [];
        renderBoardAttachmentPreview();
        if(isAdminUser && $('boardPostPinned')) $('boardPostPinned').checked=!!d.pinned;
        form.querySelector('button[type="submit"]').disabled=false;
        if($('boardPostMsg')) $('boardPostMsg').textContent='';
        form.dataset.editLoaded='1';
      }
    }catch(e){ $('boardPostMsg').textContent=e.message; }
  }
  if(form.dataset.bound) return;
  bindBoardAttachmentPicker();
  bindBoardEmojiPicker();
  form.dataset.bound='1';
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!currentUser){ $('boardPostMsg').textContent=tr('need_login'); return; }
    const data={uid:currentUser.uid,email:boardEmail(),displayName:boardDisplayName(),title:$('boardPostTitle').value.trim(),content:$('boardPostContent').value.trim(),visible:true,deleted:false,edited:!!id,category:'free',updatedAt:serverTimestamp()};
    if(isAdminUser){ data.authorRole='admin'; data.pinned=!!$('boardPostPinned')?.checked; }
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
  box.innerHTML=`<div class="post-card-head final-post-head"><div class="post-kicker">${d.pinned?'📌 '+labels.pinned:labels.board}</div><h1>${esc(d.title||'')}</h1><div class="post-meta-grid final-meta-grid"><span class="meta-author"><i>👤</i><em>${esc(labels.author)}</em><b>${esc(author)}</b></span><span class="meta-date"><i>🕒</i><em>${esc(labels.date)}</em><b>${esc(fmtShortDate(d.createdAt))}</b></span><span><i>👁</i><em>${esc(labels.views)}</em><b>${Number(d.viewCount||0)}</b></span><span><i>👍</i><em>${esc(labels.likes)}</em><b id="postLikeCount">${Number(d.likeCount||0)}</b></span><span><i>💬</i><em>${esc(labels.comments)}</em><b>${Number(d.commentCount||0)}</b></span></div></div><div class="post-body-content">${nl2br(d.content||'')}</div>${boardAttachmentsHtml(d.attachments)}<div class="post-actions community-post-actions"><button id="postLikeBtn" class="secondary like-btn">👍 ${esc(labels.like)}</button>${manage?`<a class="secondary" href="${boardEditUrl(d.id)}">${esc(labels.edit)}</a><button id="postDeleteBtn" class="secondary danger-btn">${esc(labels.del)}</button>`:''}</div>`;
  hydrateBoardMidiPlayers(box);
  refreshBoardPostActions();
}
async function incrementViewOnce(postId){
  const key='midiai_view_'+postId;
  if(sessionStorage.getItem(key))return;
  sessionStorage.setItem(key,'1');
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
async function refreshBoardPostActions(){
  const d=activeBoardPost; if(!d)return;
  const id=d.id;
  const likeBtn=$('postLikeBtn');
  if(likeBtn){
    likeBtn.onclick=()=>toggleBoardLike(id);
    if(currentUser){
      try{ const {doc,getDoc}=firestoreApi; const s=await getDoc(doc(db,'boardPosts',id,'likes',currentUser.uid)); likedActivePost=s.exists(); likeBtn.classList.toggle('liked',likedActivePost); likeBtn.textContent=likedActivePost?'👍 추천됨':'👍 추천'; }catch{}
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
  addUnsub(onSnapshot(q, snap=>{ activeBoardComments=snap.docs.map(d=>({id:d.id,...d.data()})); renderBoardComments(postId); }, err=>{ $('commentList') && ($('commentList').innerHTML=`<div class="empty-card">${esc(err.message)}</div>`); }));
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
  return `<div class="comment-card community-comment-card ${isReply?'reply-child':''}" id="comment-${esc(c.id)}"><div class="comment-avatar">${esc(authorAvatarInitial(c))}</div><div class="comment-main"><div class="comment-head"><span>${isReply?'↳ ':''}${esc(contentAuthor(c))}</span><span>${esc(fmtDate(c.createdAt))}${c.edited?' · 수정됨':''}</span></div><div class="comment-body">${nl2br(c.content||'')}</div><div class="comment-actions"><button class="secondary mini-btn" data-comment-reply="${esc(c.parentId||c.id)}">답글</button>${manage?`<button class="secondary mini-btn" data-comment-edit="${esc(c.id)}">수정</button><button class="secondary mini-btn danger-btn" data-comment-delete="${esc(c.id)}">삭제</button>`:''}</div></div></div>`;
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
async function createBoardComment(e,postId,parentId,customTextarea){
  e.preventDefault();
  if(!currentUser)return alert(tr('need_login'));
  const textarea=customTextarea||$('commentContent');
  const content=textarea.value.trim(); if(!content)return;
  const {collection,addDoc,doc,updateDoc,increment,serverTimestamp}=firestoreApi;
  try{
    await addDoc(collection(db,'boardPosts',postId,'comments'),{uid:currentUser.uid,email:boardEmail(),displayName:boardDisplayName(),content,parentId:parentId||'',visible:true,deleted:false,edited:false,...(isAdminUser?{authorRole:'admin'}:{}),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await updateDoc(doc(db,'boardPosts',postId),{commentCount:increment(1),updatedAt:serverTimestamp()});
    textarea.value=''; customTextarea?.closest('form')?.remove();
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
  try{
    const {doc,setDoc,collection,getDocs,serverTimestamp}=firestoreApi;
    const commentsSnap=await getDocs(collection(db,'boardPosts',id,'comments'));
    await Promise.all(commentsSnap.docs.map(d=>setDoc(d.ref,{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true})));
    await setDoc(doc(db,'boardPosts',id),{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true});
    adminFlash(tr('deleted'));
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
function adminFlash(html){ let box=$('adminSaveMsg'); if(!box){ box=document.createElement('div'); box.id='adminSaveMsg'; box.className='admin-flash'; $('admin')?.querySelector('.admin-panel')?.prepend(box); } box.innerHTML=html; box.classList.remove('hidden'); }
function initForms(){
  $('ticketForm')?.addEventListener('submit',createTicket);
  $('adminNoticeForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const id=await adminAdd('announcements',{title:$('adminNoticeTitle').value.trim(),content:$('adminNoticeContent').value.trim(),pinned:$('adminNoticePinned').checked,viewCount:0,email:currentUser?.email||''});
      e.target.reset();
      if(id) adminFlash(`${tr('saved')} · <a href="./notice.html?id=${encodeURIComponent(id)}">상세 보기</a> · <a href="./notices.html">공지사항 목록</a>`);
    }catch(err){ alert(err.message); }
  });
  $('adminPatchForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const id=await adminAdd('patchNotes',{version:$('adminPatchVersion').value.trim(),title:$('adminPatchTitle').value.trim(),content:$('adminPatchContent').value.trim(),viewCount:0,email:currentUser?.email||''});
      e.target.reset();
      if(id) adminFlash(`${tr('saved')} · <a href="./patch-note.html?id=${encodeURIComponent(id)}">상세 보기</a> · <a href="./patch-notes.html">패치노트 목록</a>`);
    }catch(err){ alert(err.message); }
  });
  $('adminFaqForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const id=await adminAdd('faq',{question:$('adminFaqQuestion').value.trim(),answer:$('adminFaqAnswer').value.trim(),order:Number($('adminFaqOrder').value||1)});
      e.target.reset();
      if(id) adminFlash(`${tr('saved')} · <a href="./faq.html">FAQ 확인</a>`);
    }catch(err){ alert(err.message); }
  });
  $('adminLicenseForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!isAdminUser)return;
    try{
      const {doc,setDoc,serverTimestamp}=firestoreApi;
      const uid=$('adminLicenseUid').value.trim();
      await setDoc(doc(db,'licenses',uid),{licensed:true,plan:$('adminLicensePlan').value,status:$('adminLicenseStatus').value,method:'manual',memo:$('adminLicenseMemo').value,updatedAt:serverTimestamp(),createdAt:serverTimestamp()},{merge:true});
      alert(tr('saved'));
    }catch(err){ alert(err.message); }
  });
}
async function callFunctionJson(name, payload){
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
  if(!res.ok) throw new Error(data && data.message ? data.message : `Function ${name} failed (${res.status})`);
  return data || {};
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
async function requestKakaoPayPayment(){
  if(!currentUser){
    const msg = purchaseLocaleText().loginAlert || 'Google 로그인 후 결제할 수 있습니다.';
    paypalStatus(msg, 'err');
    alert(msg);
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
  const t = purchaseLocaleText();
  try{
    paypalStatus(t.kakaoPreparing || 'Opening KakaoPay checkout...');
    const PortOne = await loadPortOneSdk();
    const result = await PortOne.requestPayment({
      storeId: CONFIG.portoneStoreId,
      channelKey: CONFIG.portoneKakaoPayChannelKey,
      paymentId: paymentId('midiai-kakao-test'),
      orderName: 'MidiAI Studio Lifetime 디지털 라이선스',
      totalAmount: Number(CONFIG.priceValueKr || 90000),
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
        mode: CONFIG.portoneMode || 'test'
      }
    });
    if(result?.code){
      paypalStatus(`${result.message || result.code}`, 'err');
      return;
    }
    paypalStatus(t.kakaoComplete || 'KakaoPay payment complete.', 'ok');
    alert(t.kakaoComplete || 'KakaoPay payment complete.');
  }catch(err){
    console.error('PortOne KakaoPay error', err);
    paypalStatus('카카오페이 결제 오류: ' + (err?.message || err), 'err');
    alert('카카오페이 결제 오류: ' + (err?.message || err));
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
  const input = $('purchasePhone');
  const row = $('purchasePhoneRow');
  const help = $('purchasePhoneHelp');
  if(!input) return;
  const visible = isKoreanCheckout();
  row?.classList.toggle('hidden', !visible);
  help?.classList.toggle('hidden', !visible);
  const saved = localStorage.getItem('midiai_purchase_phone') || '';
  if(saved && !input.value) input.value = formatKoreanPhone(saved);
  input.addEventListener('input', ()=>{
    const digits = normalizeKoreanPhone(input.value);
    input.value = formatKoreanPhone(digits);
    input.classList.remove('is-invalid');
    if(digits.length >= 10) localStorage.setItem('midiai_purchase_phone', digits);
  });
}

async function requestInicisCardPayment(){
  if(!currentUser){
    const msg = purchaseLocaleText().loginAlert || 'Google 로그인 후 결제할 수 있습니다.';
    paypalStatus(msg, 'err');
    alert(msg);
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
  const phoneNumber = getPurchasePhone();
  if(!/^01\d{8,9}$/.test(phoneNumber)){
    const input = $('purchasePhone');
    input?.classList.add('is-invalid');
    input?.focus();
    paypalStatus('휴대폰 번호를 정확히 입력해주세요. 예: 010-1234-5678', 'err');
    alert('KG이니시스 카드 결제를 위해 휴대폰 번호를 입력해주세요.');
    return;
  }
  localStorage.setItem('midiai_purchase_phone', phoneNumber);
  try{
    paypalStatus('KG이니시스 테스트 결제창을 여는 중입니다...');
    const PortOne = await loadPortOneSdk();
    const result = await PortOne.requestPayment({
      storeId: CONFIG.portoneStoreId,
      channelKey: CONFIG.portoneInicisChannelKey,
      paymentId: paymentId('midiai-inicis-test'),
      orderName: 'MidiAI Studio Lifetime 디지털 라이선스',
      totalAmount: Number(CONFIG.priceValueKr || 90000),
      currency: 'CURRENCY_KRW',
      payMethod: 'CARD',
      customer: {
        customerId: currentUser.uid,
        fullName: currentUser.displayName || currentUser.email || 'MidiAI User',
        email: currentUser.email || undefined,
        phoneNumber: phoneNumber,
      },
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
  const t = purchaseLocaleText();
  box.innerHTML = `
    <div class="purchase-payment-actions">
      <button id="inicisCardPayBtn" class="primary purchase-card-btn" type="button" onclick="window.midiaiInicisPay && window.midiaiInicisPay()">
        <span class="payment-card-mark">CARD</span><strong>신용/체크카드 결제</strong>
      </button>
      <button id="kakaoPayBtn" class="primary purchase-kakao-btn" type="button" onclick="window.midiaiKakaoPay && window.midiaiKakaoPay()">
        <span class="kakao-mark">pay</span><strong>${esc(t.kakaoButton || '카카오페이로 구매')}</strong>
      </button>
    </div>
    <p class="muted small purchase-test-payment-note">카드 결제는 현재 PG·카드사 심사용 테스트 모드입니다.</p>`;
}
function initPayPal(){
  if(!$('paypalButtons')) return;
  try{
    updatePurchaseAccountBox();
    if(isKoreanCheckout() && (CONFIG.portoneKakaoPayChannelKey || CONFIG.portoneInicisChannelKey)){
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
        paypalStatus(purchaseLocaleText().paypalAccount(currentUser.email || currentUser.uid));
        return true;
      },
      createOrder: async()=>{
        paypalStatus(purchaseLocaleText().creating);
        const result = await callFunctionJson('createPayPalOrder', {
          plan: CONFIG.plan || 'lifetime',
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
$('langBtn') && ($('langBtn').onclick=()=>{
  if(isPurchasePage){
    const next = lang === 'ko' ? 'en' : lang === 'en' ? 'ja' : 'ko';
    localStorage.setItem('midiai_lang', next);
    if(next === 'ko') location.href = pathLang ? '../purchase.html' : './purchase.html';
    else location.href = pathLang ? `../${next}/purchase.html` : `./${next}/purchase.html`;
    return;
  }
  lang = lang==='ko' ? 'en' : lang==='en' ? 'ja' : 'ko';
  applyStaticI18n();
});
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
  if(logoutBtn && !logoutBtn.querySelector('svg')) logoutBtn.textContent = tr('logout');
}
function initTopbarActions(){
  const actions = document.querySelector('.topbar .actions');
  if(!actions || actions.dataset.upgraded === '1') return;
  actions.dataset.upgraded = '1';
  actions.classList.add('topbar-actions');
  const langBtn = $('langBtn');
  if(langBtn && !langBtn.querySelector('.topbar-lang-code')){
    langBtn.classList.add('topbar-lang');
    langBtn.innerHTML = `<span class="topbar-lang-icon">${TOPBAR_GLOBE_SVG}</span><span class="topbar-lang-code">EN</span>`;
  }
  const loginBtn = $('loginBtn');
  if(loginBtn && !loginBtn.querySelector('.login-label')){
    loginBtn.classList.add('topbar-login');
    loginBtn.innerHTML = `<span class="login-google-icon">${GOOGLE_MARK_SVG}</span><span class="login-label">Google 로그인</span>`;
  }
  $('logoutBtn')?.classList.add('topbar-logout');
  refreshTopbarActionLabels();
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
    sidebar.appendChild(brandClone);
  }
  const nav=document.createElement('nav');
  nav.id='mainNav';
  nav.className='sidebar-nav';
  nav.setAttribute('aria-label','사이트 메뉴');
  nav.innerHTML=`<div class="sidebar-primary"><a href="${base}index.html" data-nav="home">${navIcon('home')}<span>홈</span></a><a href="${base}product.html" data-nav="product">${navIcon('product')}<span>제품</span></a><a href="${base}downloads.html" data-nav="downloads">${navIcon('download')}<span>다운로드</span></a><a href="${base}purchase.html" data-nav="purchase">${navIcon('purchase')}<span>구매</span></a></div><div class="sidebar-section"><p class="sidebar-label">커뮤니티</p><div class="sidebar-links"><a href="${base}notices.html" data-hub="notices">${navIcon('notice')}<span>공지사항</span></a><a href="${base}patch-notes.html" data-hub="patches">${navIcon('patch')}<span>패치노트</span></a><a href="${base}faq.html" data-hub="faq">${navIcon('faq')}<span>FAQ</span></a><a href="${base}board.html" data-hub="board">${navIcon('board')}<span>자유게시판</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">고객지원</p><div class="sidebar-links"><a href="${base}support.html" data-hub="support">${navIcon('support')}<span>1:1 문의</span></a><a href="${base}my-tickets.html" data-hub="tickets">${navIcon('tickets')}<span>나의 문의</span></a></div></div><div class="sidebar-section"><p class="sidebar-label">계정</p><div class="sidebar-links"><a href="${base}account.html" data-nav="account">${navIcon('account')}<span>내 계정</span></a><a id="adminNav" class="hidden" href="${base}admin.html">${navIcon('admin')}<span>관리자</span></a></div></div>`;
  sidebar.appendChild(nav);
  const backdrop=document.createElement('div');
  backdrop.className='sidebar-backdrop';
  backdrop.id='sidebarBackdrop';
  const appMain=document.createElement('div');
  appMain.className='app-main';
  topbar.classList.add('topbar-slim');
  topbar.querySelector('.brand')?.remove();
  topbar.querySelector('#mainNav')?.remove();
  const pageTitle=(document.title||'MidiAI Studio').split(' - ')[0].trim()||'MidiAI Studio';
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
  const parentPage={'notice.html':'notices.html','patch-note.html':'patch-notes.html','board-post.html':'board.html','board-write.html':'board.html','ticket.html':'my-tickets.html'};
  const file=parentPage[page]||page||'index.html';
  document.querySelectorAll('#mainNav a[href]').forEach(a=>{
    const href=a.getAttribute('href')||'';
    const target=href.split('/').pop()?.split('?')[0]||'';
    a.classList.toggle('active', target===file);
  });
}

showOAuthBrowserNotice();
bindBoardLightbox();
initSidebarLayout();
initTopbarActions();
bindSidebar();
applyStaticI18n();
initSidebarNav();
setAuthUiSignedOut();

initForms();
initAuth();
initPurchasePhone();
initPayPal();
