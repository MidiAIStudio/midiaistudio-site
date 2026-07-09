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
    '홈':'Home','다운로드':'Downloads','구매':'Purchase','공지사항':'Notices','공지 목록':'Notice list','운영 안내, 이벤트, 중요 공지를 확인합니다.':'Check service notices, events, and important updates.','패치노트':'Patch notes','FAQ':'FAQ','자유게시판':'Free board','글쓰기':'Write','댓글':'Comments','댓글 등록':'Post comment','답글':'Reply','추천':'Like','조회':'Views','1:1 문의':'Support','1:1 문의 작성':'Create ticket','나의 문의':'My tickets','내 계정':'Account','관리자':'Admin','로그아웃':'Logout',
    '7월 31일까지 할인 진행중':'Discount available until July 31','피아노 커버를':'Piano covers','MIDI로 바꾸는':'into MIDI','가장 쉬운 방법':'made easy','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'The easiest way to turn piano covers into MIDI','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio official portal. The home page focuses on product, purchase, and downloads; notices, patch notes, and private support are separated into board-style pages.',
    '라이선스 구매하기':'Buy license','1:1 문의하기':'Contact support','Windows 지원':'Windows support','Google 계정 연동':'Google account linked','비공개 문의':'Private support','업데이트, 이벤트, 운영 안내를 확인합니다.':'Check updates, events, and service notices.','버전별 변경 사항을 확인합니다.':'Check changes by version.','비공개 문의를 작성하고 답변을 확인합니다.':'Create private tickets and check replies.','라이선스 상태와 로그인 정보를 확인합니다.':'Check license status and login details.','바로가기':'Open','문의하기':'Contact','확인하기':'View','최신 설치 파일':'Latest installer','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Shows the latest version from Firestore downloads/latest.','불러오는 중...':'Loading...',
    'Google 로그인':'Sign in with Google','로그인 전':'Not signed in','Google 로그인으로 라이선스 확인 준비':'Sign in with Google to check your license','라이선스 확인 전':'License not checked',
    '공지 상세':'Notice detail','자주 묻는 질문':'FAQ','비공개 1:1 문의':'Private support','문의 등록':'Submit ticket','문의 상세':'Ticket detail','라이선스 구매':'Buy license','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'Add patch note','공지 등록':'Add notice','FAQ 등록':'Add FAQ','라이선스 저장':'Save license','문의 답변':'Ticket replies','공지 작성':'Write notice','패치노트 작성':'Write patch note','FAQ 작성':'Write FAQ','라이선스 지급/수정':'Grant/edit license',
    '제목':'Title','내용':'Content','검색':'Search','버전':'Version','질문':'Question','답변':'Answer','순서':'Order','상단 고정':'Pin to top','플랜':'Plan','상태':'Status','메모':'Memo','사용자 UID':'User UID','등록':'Submit','저장':'Save','문의 내용을 자세히 적어주세요.':'Please describe your issue in detail.','로그인 오류 / 라이선스 문의':'Login issue / license question','로그인이 필요합니다.':'Sign-in required.','내가 작성한 비공개 문의와 답변을 확인합니다.':'View your private tickets and replies.','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'Only you and the admin can view this ticket. Please sign in first.','role=admin 계정만 사용할 수 있습니다.':'Only role=admin accounts can use this page.',
    '답변 완료':'Answered','종료':'Closed','접수':'Open','권한이 없습니다.':'You do not have permission.','관리자 로그인이 필요합니다.':'Admin sign-in required.','표시할 내용이 없습니다.':'Nothing to show.','확인 실패':'Check failed','저장 완료':'Saved','수정':'Edit','삭제':'Delete','종료 처리':'Close','관리':'Manage','상세 보기':'Open detail','공지 관리':'Manage notices','패치노트 관리':'Manage patch notes','FAQ 관리':'Manage FAQ','정말 삭제할까요?':'Delete this item?','수정 완료':'Updated','삭제 완료':'Deleted','문의가 등록되었습니다.':'Ticket created.'
  },
  ja: {
    '홈':'ホーム','다운로드':'ダウンロード','구매':'購入','공지사항':'お知らせ','공지 목록':'お知らせ一覧','운영 안내, 이벤트, 중요 공지를 확인합니다.':'運営案内、イベント、重要なお知らせを確認できます。','패치노트':'パッチノート','FAQ':'FAQ','자유게시판':'自由掲示板','글쓰기':'投稿','댓글':'コメント','댓글 등록':'コメント投稿','답글':'返信','추천':'いいね','조회':'閲覧','1:1 문의':'お問い合わせ','1:1 문의 작성':'問い合わせ作成','나의 문의':'マイ問い合わせ','내 계정':'アカウント','관리자':'管理者','로그아웃':'ログアウト',
    '7월 31일까지 할인 진행중':'7月31日まで割引中','피아노 커버를':'ピアノカバーを','MIDI로 바꾸는':'MIDIに変える','가장 쉬운 방법':'一番簡単な方法','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'ピアノカバーをMIDIに変える一番簡単な方法','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio公式ポータルです。ホームは紹介・購入・ダウンロードを中心にし、お知らせ・パッチノート・非公開問い合わせは別ページに分けました。',
    '라이선스 구매하기':'ライセンス購入','1:1 문의하기':'問い合わせる','Windows 지원':'Windows対応','Google 계정 연동':'Googleアカウント連携','비공개 문의':'非公開問い合わせ','업데이트, 이벤트, 운영 안내를 확인합니다.':'アップデート、イベント、運営案内を確認できます。','버전별 변경 사항을 확인합니다.':'バージョン別の変更内容を確認できます。','비공개 문의를 작성하고 답변을 확인합니다.':'非公開問い合わせを作成し、返信を確認できます。','라이선스 상태와 로그인 정보를 확인합니다.':'ライセンス状態とログイン情報を確認できます。','바로가기':'開く','문의하기':'問い合わせ','확인하기':'確認','최신 설치 파일':'最新インストーラー','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Firestore downloads/latest を基準に最新バージョンを表示します。','불러오는 중...':'読み込み中...',
    'Google 로그인':'Googleログイン','로그인 전':'未ログイン','Google 로그인으로 라이선스 확인 준비':'Googleログインでライセンス確認','라이선스 확인 전':'ライセンス未確認',
    '공지 상세':'お知らせ詳細','자주 묻는 질문':'よくある質問','비공개 1:1 문의':'非公開お問い合わせ','문의 등록':'送信','문의 상세':'問い合わせ詳細','라이선스 구매':'ライセンス購入','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'パッチノート登録','공지 등록':'お知らせ登録','FAQ 등록':'FAQ登録','라이선스 저장':'ライセンス保存','문의 답변':'問い合わせ返信','공지 작성':'お知らせ作成','패치노트 작성':'パッチノート作成','FAQ 작성':'FAQ作成','라이선스 지급/수정':'ライセンス付与/修正',
    '제목':'タイトル','내용':'内容','검색':'検索','버전':'バージョン','질문':'質問','답변':'回答','순서':'順序','상단 고정':'上部固定','플랜':'プラン','상태':'状態','메모':'メモ','사용자 UID':'ユーザーUID','등록':'登録','저장':'保存','문의 내용을 자세히 적어주세요.':'お問い合わせ内容を詳しく入力してください。','로그인 오류 / 라이선스 문의':'ログインエラー / ライセンス問い合わせ','로그인이 필요합니다.':'ログインが必要です。','내가 작성한 비공개 문의와 답변을 확인합니다.':'自分の非公開問い合わせと返信を確認します。','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。','role=admin 계정만 사용할 수 있습니다.':'role=adminアカウントのみ使用できます。',
    '답변 완료':'回答済み','종료':'終了','접수':'受付','권한이 없습니다.':'権限がありません。','관리자 로그인이 필요합니다.':'管理者ログインが必要です。','표시할 내용이 없습니다.':'表示する内容がありません。','확인 실패':'確認失敗','저장 완료':'保存完了','수정':'編集','삭제':'削除','종료 처리':'終了にする','관리':'管理','상세 보기':'詳細を見る','공지 관리':'お知らせ管理','패치노트 관리':'パッチノート管理','FAQ 관리':'FAQ管理','정말 삭제할까요?':'本当に削除しますか？','수정 완료':'更新しました','삭제 완료':'削除しました','문의가 등록되었습니다.':'問い合わせを登録しました。'
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
  const b = $('langBtn');
  if (b) b.textContent = lang === 'ko' ? 'EN' : lang === 'en' ? '日本語' : '한국어';
  updatePurchaseI18n();
}
function tr(k){
  const KO = {
    login:'Google 로그인', logout:'로그아웃', guest:'로그인 전', guest_desc:'Google 로그인으로 라이선스 확인 준비',
    license_wait:'라이선스 확인 전', active:'라이선스 활성화됨', none:'라이선스 없음', checking:'라이선스 확인 중',
    check_failed:'확인 실패', empty:'표시할 내용이 없습니다.', saved:'저장 완료', ticket_created:'문의가 등록되었습니다.',
    need_login:'로그인이 필요합니다.', download:'다운로드', admin_required:'관리자 로그인이 필요합니다.',
    no_permission:'권한이 없습니다.', answered:'답변 완료', closed:'종료', open:'접수', reply_placeholder:'답변 또는 추가 내용 입력',
    submit:'등록', edit:'수정', del:'삭제', close:'종료 처리', updated:'수정 완료', deleted:'삭제 완료', manage:'관리', confirm_delete:'정말 삭제할까요?'
  };
  const EN = {
    login:'Sign in with Google', logout:'Logout', guest:'Not signed in', guest_desc:'Sign in with Google to check license',
    license_wait:'Not checked yet', active:'License active', none:'No license', checking:'Checking license',
    check_failed:'Check failed', empty:'Nothing to show.', saved:'Saved', ticket_created:'Ticket created.',
    need_login:'Sign-in required.', download:'Download', admin_required:'Admin sign-in required.',
    no_permission:'You do not have permission.', answered:'Answered', closed:'Closed', open:'Open', reply_placeholder:'Reply or add more details',
    submit:'Submit', edit:'Edit', del:'Delete', close:'Close', updated:'Updated', deleted:'Deleted', manage:'Manage', confirm_delete:'Delete this item?'
  };
  const JA = {
    login:'Googleログイン', logout:'ログアウト', guest:'未ログイン', guest_desc:'Googleログインでライセンス確認',
    license_wait:'未確認', active:'ライセンス有効', none:'ライセンスなし', checking:'確認中',
    check_failed:'確認失敗', empty:'表示する内容がありません。', saved:'保存完了', ticket_created:'問い合わせを登録しました。',
    need_login:'ログインが必要です。', download:'ダウンロード', admin_required:'管理者ログインが必要です。',
    no_permission:'権限がありません。', answered:'回答済み', closed:'終了', open:'受付', reply_placeholder:'返信または追加内容を入力',
    submit:'登録', edit:'編集', del:'削除', close:'終了にする', updated:'更新しました', deleted:'削除しました', manage:'管理', confirm_delete:'本当に削除しますか？'
  };
  const T = lang === 'en' ? EN : lang === 'ja' ? JA : KO;
  return T[k] || KO[k] || k;
}

function fmtDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d ? d.toLocaleString(lang==='ja'?'ja-JP':lang==='en'?'en-US':'ko-KR') : ''; } catch { return ''; } }
function fmtShortDate(v){ try{ const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); if(!d)return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; } catch { return fmtDate(v); } }
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
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
  return `${prefix}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function purchaseLocaleText(){
  if(lang === 'en') return {
    saleUntil:'Until July 31',
    noteTitle:'License Benefits',
    noteText:'Your Lifetime license is linked to your Google account immediately after payment.',
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
    noteTitle:'ライセンス特典',
    noteText:'決済完了後、LifetimeライセンスがGoogleアカウントに連携されます。',
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
    noteTitle:'라이선스 혜택',
    noteText:'결제 즉시 Google 계정에 Lifetime 라이선스가 등록됩니다.',
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
    if(isKoreanCheckout()){
      note.innerHTML = `<h3>라이선스 혜택</h3>
        <ul class="license-benefit-list">
          <li><b>즉시 적용</b><span>결제 완료 즉시 Google 계정에 Lifetime 라이선스가 등록됩니다.</span></li>
          <li><b>계정 연동</b><span>프로그램에서 같은 Google 계정으로 로그인하면 바로 사용할 수 있습니다.</span></li>
          <li><b>서비스 제공기간</b><span>디지털 라이선스 특성상 구매 즉시 서비스 제공이 완료됩니다.</span></li>
        </ul>`;
    } else {
      note.innerHTML = `<h3>${esc(t.noteTitle || 'What you get')}</h3>
        <ul class="license-benefit-list">
          <li><b>${lang==='ja'?'即時適用':'Instant activation'}</b><span>${esc(t.noteText || '')}</span></li>
          <li><b>${lang==='ja'?'アカウント連携':'Account linked'}</b><span>${lang==='ja'?'同じGoogleアカウントでログインすると利用できます。':'Sign in with the same Google account to use your license.'}</span></li>
        </ul>`;
    }
  }
  if($('purchaseHeroLead')) $('purchaseHeroLead').textContent = lang==='en' ? 'A Lifetime license for faster and more reliable AI-powered MIDI conversion.' : lang==='ja' ? 'AIベースのMIDI変換をより快適に使えるLifetimeライセンスです。' : 'AI 기반 MIDI 변환을 더 빠르고 안정적으로 사용할 수 있는 Lifetime 라이선스입니다.';
  const paypal = $('paypalButtons');
  if(paypal && paypal.textContent.includes('Client ID')) paypal.innerHTML = `<p>${esc(t.paypalReady)}</p>`;
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

function updatePurchaseReviewPanel(){
  if($('purchaseReviewPrice')) $('purchaseReviewPrice').textContent = purchaseDisplayPrice();
  if($('purchasePaymentMethod')) $('purchasePaymentMethod').textContent = isKoreanCheckout() ? '카카오페이' : 'PayPal';
  if($('purchaseBuyerInfo')){
    if(currentUser){
      $('purchaseBuyerInfo').textContent = currentUser.email || currentUser.displayName || currentUser.uid;
    } else {
      $('purchaseBuyerInfo').textContent = isKoreanCheckout() ? 'Google 로그인 후 자동 입력' : 'Filled after Google sign-in';
    }
  }
}

function paypalStatus(msg, type=''){
  const el = $('paypalStatus');
  if(!el) return;
  el.className = 'muted small paypal-status ' + type;
  el.textContent = msg || '';
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
  if (page==='admin.html' && $('admin')) $('admin').classList.add('admin-locked');
  updatePurchaseAccountBox();
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
    if (isAdminUser) { $('admin')?.classList.remove('admin-locked'); listenAdminDashboard(); listenAdminUsers(); listenAdminTickets(); listenAdminPostManager(); bindAdminBoardFilters(); loadAdminDownloadSettings(); }
    else { $('admin') && ($('admin').innerHTML = `<div class="empty-card">${tr('admin_required')}</div>`); }
  }
  updatePurchaseAccountBox();
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
bindBoardLightbox();
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
  if(['index.html','downloads.html','purchase.html',''].includes(page)) listenDownload();
  if(page==='notices.html') listenAnnouncements();
  if(page==='notice.html') listenNoticeDetail();
  if(page==='patch-notes.html') listenPatchNotes();
  if(page==='faq.html') listenFaq();
  if(page==='board.html') listenBoardPosts();
  if(page==='board-post.html') listenBoardPostDetail();
  if(page==='board-write.html') initBoardPostEditor();
}
function renderDownload(d){
  const box=$('downloadBox'); if(!box)return;
  if(!d){ box.innerHTML=`<h3>MidiAI Studio</h3><p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<h3>MidiAI Studio ${esc(d.version||'')}</h3><p>${esc(d.filename||'MidiAI Studio Installer')}</p><p class="muted">${fmtDate(d.releaseDate)||''}</p><div class="download-actions">${d.url?`<a class="primary" href="${esc(d.url)}" target="_blank" rel="noopener">${tr('download')}</a>`:''}</div>`;
}
function listenDownload(){ if(!$('downloadBox')) return; listenDoc('downloads','latest',renderDownload); }
function renderAnnouncements(rows, err){
  const list=$('announcementList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>(b.pinned===true)-(a.pinned===true)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  list.innerHTML=rows.map(x=>`<a class="list-item ticket-link" href="./notice.html?id=${encodeURIComponent(x.id)}"><div class="date">${x.pinned?'📌 ':''}${fmtDate(x.createdAt)}</div><h3>${esc(x.title)}</h3><div class="content">${nl2br(String(x.content||'').slice(0,220))}</div></a>`).join('');
  bindSearch(list);
}
function listenAnnouncements(){ if($('announcementList')) listenVisibleDocs('announcements',renderAnnouncements); }
function renderNoticeDetail(d,err){
  const box=$('noticeDetail'); if(!box)return;
  if(err){ box.innerHTML=`<p class="muted">${esc(err.message||tr('check_failed'))}</p>`; return; }
  if(!d){ box.innerHTML=`<p class="muted">${tr('empty')}</p>`; return; }
  box.innerHTML=`<div class="date">${fmtDate(d.createdAt)}</div><h2>${esc(d.title)}</h2><div class="content">${nl2br(d.content)}</div>`;
}
function listenNoticeDetail(){ const box=$('noticeDetail'); if(!box)return; const id=getParam('id'); if(!id){box.innerHTML=`<p class="muted">${tr('empty')}</p>`;return} listenDoc('announcements',id,renderNoticeDetail); }
function renderPatchNotes(rows,err){
  const list=$('patchList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  list.innerHTML=rows.map(x=>`<article class="timeline-item" data-version="${esc(x.version||'')}"><div class="date">${fmtDate(x.createdAt)}</div><h3>${x.version?`<span class="badge active">v${esc(x.version)}</span> `:''}${esc(x.title)}</h3><div class="content">${nl2br(x.content)}</div></article>`).join('');
}
function listenPatchNotes(){ if($('patchList')) listenVisibleDocs('patchNotes',renderPatchNotes); }
function renderFaq(rows,err){
  const list=$('faqList'); if(!list)return;
  if(err){ list.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  if(!rows.length){ list.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  rows.sort((a,b)=>Number(a.order||999)-Number(b.order||999));
  list.innerHTML=rows.map(x=>`<details class="faq-item"><summary><h3>${esc(x.question)}</h3></summary><div class="content">${nl2br(x.answer)}</div></details>`).join('');
}
function listenFaq(){ if($('faqList')) listenVisibleDocs('faq',renderFaq,'order','asc'); }
function bindSearch(list){ const input=$('boardSearch'); if(!input || input.dataset.bound) return; input.dataset.bound='1'; input.addEventListener('input',()=>{ const q=input.value.trim().toLowerCase(); list.querySelectorAll('.list-item').forEach(el=>{el.style.display=el.textContent.toLowerCase().includes(q)?'block':'none'}); }); }

async function createTicket(e){
  e.preventDefault();
  if(!currentUser){ showFormMsg('need_login',false); return; }
  const title=$('ticketTitle').value.trim(), content=$('ticketContent').value.trim();
  if(!title||!content)return;
  try{
    const {collection,addDoc,serverTimestamp}=firestoreApi;
    await addDoc(collection(db,'supportTickets'),{uid:currentUser.uid,email:currentUser.email||'',title,content,status:'open',private:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    $('ticketTitle').value=''; $('ticketContent').value='';
    showFormMsg('ticket_created',true);
    setTimeout(()=>location.href='./my-tickets.html',700);
  } catch(e){ console.error(e); showFormMsg(e.message || 'check_failed',false); }
}
function showFormMsg(key,ok=true){ const el=$('ticketFormMsg'); if(el){ el.textContent=tr(key)===key?key:tr(key); el.style.color=ok?'#8ff3c5':'#ff9aac'; } }
function statusBadge(st){ const key=st==='answered'?'answered':st==='closed'?'closed':'open'; return `<span class="badge ${esc(st||'open')}">${tr(key)}</span>`; }
function ticketShell(t, detail=false, admin=false){
  const href=detail?'#':`./ticket.html?id=${encodeURIComponent(t.id)}`;
  const canManage = admin || detail;
  const form=(admin||detail)?`<form class="reply-form" data-ticket="${esc(t.id)}"><input placeholder="${esc(tr('reply_placeholder'))}" required><button class="primary" type="submit">${tr('submit')}</button></form>`:'';
  const actions=canManage?`<div class="admin-row"><button class="secondary mini-btn" data-ticket-edit="${esc(t.id)}">${tr('edit')}</button><button class="secondary mini-btn" data-ticket-close="${esc(t.id)}">${tr('close')}</button><button class="secondary mini-btn danger-btn" data-ticket-delete="${esc(t.id)}">${tr('del')}</button></div>`:'';
  return `<article class="list-item"><div class="ticket-head"><div class="date">${fmtDate(t.createdAt)}</div>${statusBadge(t.status)}</div><h3>${detail?esc(t.title):`<a href="${href}">${esc(t.title)}</a>`}</h3><div class="content">${nl2br(t.content)}</div>${actions}<div class="ticket-replies" data-replies="${esc(t.id)}"></div>${form}</article>`;
}
function listenReplies(ticketId, container){
  const {collection,query,orderBy,onSnapshot}=firestoreApi;
  const q=query(collection(db,'supportTickets',ticketId,'replies'),orderBy('createdAt','asc'));
  return addUnsub(onSnapshot(q, snap => {
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    container.innerHTML=rows.map(r=>`<div class="reply"><b>${esc(r.role||'user')} · ${fmtDate(r.createdAt)}</b><p>${nl2br(r.content)}</p></div>`).join('');
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
    list.innerHTML=rows.map(t=>ticketShell(t,false,false)).join('');
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
    await addDoc(collection(db,'supportTickets',ticketId,'replies'),{uid:currentUser.uid,role:isAdminUser?'admin':'user',content,createdAt:serverTimestamp()});
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
    faq: {box:'adminFaqList', count:'adminFaqCount', rows:adminFaqRows, search:'adminFaqSearch', status:'adminFaqStatus', collection:'faq', fields:['question','answer'], title:x=>esc(x.question||'-'), sub:x=>`#${esc(x.order||'')}`, date:x=>String(x.order||'')}
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
  const rows=filterRows(adminTicketRows,'adminTicketSearch','adminTicketStatus',['title','content','email','uid']).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
  $('adminTicketCount') && ($('adminTicketCount').textContent = `${rows.length} / ${adminTicketRows.length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML = `<table class="admin-table"><thead><tr><th>제목</th><th>사용자</th><th>상태</th><th>수정일</th><th>관리</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${esc(t.title||'-')}</b><small>${esc((t.content||'').slice(0,80))}${(t.content||'').length>80?'...':''}</small></td><td><span class="mono">${esc(t.email||t.uid||'')}</span></td><td>${statusPill(t)}</td><td>${esc(fmtDate(t.updatedAt||t.createdAt))}</td><td><div class="table-actions"><a class="secondary mini-btn" href="./ticket.html?id=${encodeURIComponent(t.id)}">상세/답변</a><button class="secondary mini-btn" data-ticket-close="${esc(t.id)}">${tr('close')}</button><button class="secondary mini-btn danger-btn" data-ticket-delete="${esc(t.id)}">${tr('del')}</button></div></td></tr>`).join('')}</tbody></table>`;
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
function boardDisplayName(){ return currentUser?.displayName || currentUser?.email || 'Google User'; }
function boardEmail(){ return currentUser?.email || ''; }
function boardPostUrl(id){ return `./board-post.html?id=${encodeURIComponent(id)}`; }
function boardEditUrl(id){ return `./board-write.html?id=${encodeURIComponent(id)}`; }
function boardFilteredSorted(rows){
  const q=($('boardPostSearch')?.value||'').trim().toLowerCase();
  const sort=$('boardSort')?.value||'latest';
  let out=rows.filter(x=>x.visible!==false && x.deleted!==true).filter(x=>{
    const hay=[x.title,x.content,x.displayName,x.email].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  const time=x=>x.createdAt?.seconds||0;
  out.sort((a,b)=> (b.pinned===true)-(a.pinned===true) || (
    sort==='views' ? ((b.viewCount||0)-(a.viewCount||0)) :
    sort==='likes' ? ((b.likeCount||0)-(a.likeCount||0)) :
    sort==='comments' ? ((b.commentCount||0)-(a.commentCount||0)) :
    (time(b)-time(a))
  ));
  return out;
}
function renderBoardPosts(rows, err){
  const box=$('boardPostList'); if(!box)return;
  if(err){ box.innerHTML=`<div class="empty-card">${esc(err.message||tr('check_failed'))}</div>`; return; }
  const list=boardFilteredSorted(rows||[]);
  if(!list.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=`<div class="community-list-head"><span>제목</span><span>작성자</span><span>조회</span><span>추천</span><span>댓글</span><span>작성일</span></div><div class="community-list-body">${list.map(x=>`<a class="community-post-row ${x.pinned?'is-pinned':''}" href="${boardPostUrl(x.id)}"><div class="community-post-title"><b>${x.pinned?'📌 ':''}${esc(x.title||'(제목 없음)')}</b><small>${esc(String(x.content||'').slice(0,100))}</small></div><div class="community-post-author">${esc(x.displayName||x.email||'-')}</div><div>${Number(x.viewCount||0)}</div><div>${Number(x.likeCount||0)}</div><div>${Number(x.commentCount||0)}</div><div>${esc(fmtDate(x.createdAt))}</div></a>`).join('')}</div>`;
}
function listenBoardPosts(){
  const box=$('boardPostList'); if(!box)return;
  const {collection,onSnapshot,query,where,getDocs}=firestoreApi;
  const render=(rows,err)=>renderBoardPosts(rows,err);
  const q=query(collection(db,'boardPosts'), where('visible','==',true));
  addUnsub(onSnapshot(q, snap=>render(snap.docs.map(d=>({id:d.id,...d.data()}))), async err=>{
    console.warn('board realtime failed',err);
    try{ const s=await getDocs(q); render(s.docs.map(d=>({id:d.id,...d.data()}))); }catch(e){ render([],e); }
  }));
  ['boardPostSearch','boardSort'].forEach(id=>{ const el=$(id); if(el&&!el.dataset.bound){ el.dataset.bound='1'; el.addEventListener('input',()=>renderBoardPosts(window.__boardRows||[])); el.addEventListener('change',()=>renderBoardPosts(window.__boardRows||[])); }});
  const old=renderBoardPosts;
  window.__boardRows=[];
  // small wrapper to keep rows for client-side filters
  clearUnsubs();
  if(['index.html','downloads.html','purchase.html',''].includes(page)) listenDownload();
  const q2=query(collection(db,'boardPosts'), where('visible','==',true));
  addUnsub(onSnapshot(q2, snap=>{ window.__boardRows=snap.docs.map(d=>({id:d.id,...d.data()})); old(window.__boardRows); }, err=>old([],err)));
}

const BOARD_MAX_ATTACHMENTS = 5;
const BOARD_MAX_FILE_SIZE = 50 * 1024 * 1024;
const BOARD_ALLOWED_MIME = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|webm))$/i;
let selectedBoardFiles = [];
let existingBoardAttachments = [];

function boardFileType(fileOrAttachment){
  const mime = String(fileOrAttachment?.type || fileOrAttachment?.mime || '');
  if(mime.startsWith('video/')) return 'video';
  return 'image';
}
function boardSafeFilename(name){
  const raw = String(name || 'attachment').normalize('NFKC');
  return raw.replace(/[\\/#?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(-90);
}
function boardAttachmentItemHtml(a, idx, editable=false){
  const type = boardFileType(a);
  const name = esc(a.name || a.fileName || 'attachment');
  const url = esc(a.url || '');
  const badge = type === 'video' ? '🎥 영상' : '🖼️ 사진';
  const remove = editable ? `<button type="button" class="secondary mini-btn danger-btn" data-remove-existing-attachment="${idx}">삭제</button>` : '';
  const media = type === 'video'
    ? `<video controls preload="metadata" src="${url}"></video>`
    : `<img src="${url}" alt="${name}" loading="lazy" data-lightbox-src="${url}">`;
  return `<figure class="board-attachment-item board-attachment-${type}">${media}<figcaption><span>${badge}</span><b>${name}</b>${remove}</figcaption></figure>`;
}
function boardAttachmentsHtml(list){
  const arr = Array.isArray(list) ? list.filter(x=>x && x.url) : [];
  if(!arr.length) return '';
  return `<div class="board-attachments">${arr.map((a,i)=>boardAttachmentItemHtml(a,i,false)).join('')}</div>`;
}
function renderBoardAttachmentPreview(){
  const box = $('boardAttachmentPreview');
  if(!box) return;
  const existing = existingBoardAttachments.map((a,i)=>boardAttachmentItemHtml(a,i,true)).join('');
  const fresh = selectedBoardFiles.map((file,i)=>{
    const type = boardFileType(file);
    const icon = type === 'video' ? '🎥' : '🖼️';
    return `<div class="board-file-chip"><span>${icon}</span><b>${esc(file.name)}</b><small>${Math.ceil(file.size/1024/1024)}MB</small><button type="button" class="secondary mini-btn danger-btn" data-remove-new-attachment="${i}">삭제</button></div>`;
  }).join('');
  box.innerHTML = existing || fresh ? `${existing}<div class="board-file-chip-list">${fresh}</div>` : '<p class="muted">첨부한 사진/영상이 없습니다.</p>';
  box.querySelectorAll('[data-remove-existing-attachment]').forEach(btn=>btn.onclick=()=>{ existingBoardAttachments.splice(Number(btn.dataset.removeExistingAttachment),1); renderBoardAttachmentPreview(); });
  box.querySelectorAll('[data-remove-new-attachment]').forEach(btn=>btn.onclick=()=>{ selectedBoardFiles.splice(Number(btn.dataset.removeNewAttachment),1); const input=$('boardAttachments'); if(input) input.value=''; renderBoardAttachmentPreview(); });
}
function addBoardFiles(files){
  const msg = $('boardPostMsg');
  const incoming = Array.from(files || []);
  for(const file of incoming){
    if(!BOARD_ALLOWED_MIME.test(file.type || '')){ if(msg) msg.textContent = '지원하지 않는 파일 형식입니다. JPG/PNG/WEBP/GIF/MP4/WEBM만 업로드할 수 있어요.'; continue; }
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
    await uploadBytes(fileRef, file, { contentType: file.type });
    const url = await getDownloadURL(fileRef);
    uploaded.push({ type: boardFileType(file), mime: file.type, name: file.name, size: file.size, path, url });
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

async function initBoardPostEditor(){
  const form=$('boardPostForm'); if(!form||form.dataset.bound)return;
  const id=getParam('id');
  const {doc,getDoc,setDoc,addDoc,collection,serverTimestamp}=firestoreApi;
  if($('boardPinnedWrap')) $('boardPinnedWrap').style.display=isAdminUser?'flex':'none';
  if(id){
    try{
      const snap=await getDoc(doc(db,'boardPosts',id));
      const d=snap.exists()?{id:snap.id,...snap.data()}:null;
      if(!d){ $('boardPostMsg').textContent=tr('empty'); }
      else if(!canManageRecord(d)){ $('boardPostMsg').textContent=tr('no_permission'); form.querySelector('button[type="submit"]').disabled=true; }
      else { $('boardWriteHeading') && ($('boardWriteHeading').textContent='자유게시판 글 수정'); $('boardPostTitle').value=d.title||''; $('boardPostContent').value=d.content||''; existingBoardAttachments = Array.isArray(d.attachments) ? d.attachments.filter(x=>x && x.url) : []; renderBoardAttachmentPreview(); if($('boardPostPinned')) $('boardPostPinned').checked=!!d.pinned; }
    }catch(e){ $('boardPostMsg').textContent=e.message; }
  }
  bindBoardAttachmentPicker();
  form.dataset.bound='1';
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!currentUser){ $('boardPostMsg').textContent=tr('need_login'); return; }
    const data={uid:currentUser.uid,email:boardEmail(),displayName:boardDisplayName(),title:$('boardPostTitle').value.trim(),content:$('boardPostContent').value.trim(),visible:true,deleted:false,edited:!!id,category:'free',updatedAt:serverTimestamp()};
    if(isAdminUser && $('boardPostPinned')) data.pinned=$('boardPostPinned').checked;
    try{
      let postId=id;
      if(id){
        const uploaded = await uploadBoardAttachments(id);
        await setDoc(doc(db,'boardPosts',id),{...data,attachments:[...existingBoardAttachments,...uploaded]},{merge:true});
        postId=id;
      } else {
        const ref=await addDoc(collection(db,'boardPosts'),{...data,pinned:isAdminUser&&$('boardPostPinned')?.checked || false,commentCount:0,viewCount:0,likeCount:0,attachments:[],createdAt:serverTimestamp()});
        postId=ref.id;
        const uploaded = await uploadBoardAttachments(postId);
        if(uploaded.length) await setDoc(doc(db,'boardPosts',postId),{attachments:uploaded,updatedAt:serverTimestamp()},{merge:true});
      }
      location.href=boardPostUrl(postId);
    }catch(err){ $('boardPostMsg').textContent=err.message; }
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
  const author = d.displayName || d.email || '-';
  box.innerHTML=`<div class="post-card-head final-post-head"><div class="post-kicker">${d.pinned?'📌 '+labels.pinned:labels.board}</div><h1>${esc(d.title||'')}</h1><div class="post-meta-grid final-meta-grid"><span class="meta-author"><i>👤</i><em>${esc(labels.author)}</em><b>${esc(author)}</b></span><span class="meta-date"><i>🕒</i><em>${esc(labels.date)}</em><b>${esc(fmtShortDate(d.createdAt))}</b></span><span><i>👁</i><em>${esc(labels.views)}</em><b>${Number(d.viewCount||0)}</b></span><span><i>👍</i><em>${esc(labels.likes)}</em><b id="postLikeCount">${Number(d.likeCount||0)}</b></span><span><i>💬</i><em>${esc(labels.comments)}</em><b>${Number(d.commentCount||0)}</b></span></div></div><div class="post-body-content">${nl2br(d.content||'')}</div>${boardAttachmentsHtml(d.attachments)}<div class="post-actions community-post-actions"><button id="postLikeBtn" class="secondary like-btn">👍 ${esc(labels.like)}</button>${manage?`<a class="secondary" href="${boardEditUrl(d.id)}">${esc(labels.edit)}</a><button id="postDeleteBtn" class="secondary danger-btn">${esc(labels.del)}</button>`:''}</div>`;
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
  return `<div class="comment-card community-comment-card ${isReply?'reply-child':''}" id="comment-${esc(c.id)}"><div class="comment-avatar">${esc(String(c.displayName||c.email||'U').slice(0,1).toUpperCase())}</div><div class="comment-main"><div class="comment-head"><span>${isReply?'↳ ':''}${esc(c.displayName||c.email||'-')}</span><span>${esc(fmtDate(c.createdAt))}${c.edited?' · 수정됨':''}</span></div><div class="comment-body">${nl2br(c.content||'')}</div><div class="comment-actions"><button class="secondary mini-btn" data-comment-reply="${esc(c.parentId||c.id)}">답글</button>${manage?`<button class="secondary mini-btn" data-comment-edit="${esc(c.id)}">수정</button><button class="secondary mini-btn danger-btn" data-comment-delete="${esc(c.id)}">삭제</button>`:''}</div></div></div>`;
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
    await addDoc(collection(db,'boardPosts',postId,'comments'),{uid:currentUser.uid,email:boardEmail(),displayName:boardDisplayName(),content,parentId:parentId||'',visible:true,deleted:false,edited:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
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
  let rows=(adminBoardRows||[]).filter(x=>{ if(st==='visible'&&x.visible===false)return false; if(st==='hidden'&&x.visible!==false)return false; if(st==='pinned'&&x.pinned!==true)return false; const hay=[x.title,x.content,x.displayName,x.email,x.uid].join(' ').toLowerCase(); return !q||hay.includes(q); }).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  $('adminBoardCount') && ($('adminBoardCount').textContent=`${rows.length} / ${(adminBoardRows||[]).length}`);
  if(!rows.length){ box.innerHTML=`<div class="empty-card">${tr('empty')}</div>`; return; }
  box.innerHTML=`<table class="admin-table"><thead><tr><th>제목</th><th>상태</th><th>작성자</th><th>통계</th><th>관리</th></tr></thead><tbody>${rows.map(x=>`<tr class="${x.visible===false?'board-admin-hidden':''}"><td><b>${x.pinned?'📌 ':''}${esc(x.title||'-')}</b><small>${esc(String(x.content||'').slice(0,80))}</small></td><td>${x.visible===false?'<span class="badge none">숨김</span>':'<span class="badge active">공개</span>'}</td><td>${esc(x.displayName||x.email||'-')}</td><td>조회 ${Number(x.viewCount||0)} · 추천 ${Number(x.likeCount||0)} · 댓글 ${Number(x.commentCount||0)}</td><td><div class="table-actions"><a class="secondary mini-btn" href="${boardPostUrl(x.id)}">보기</a><a class="secondary mini-btn" href="${boardEditUrl(x.id)}">수정</a><button class="secondary mini-btn" data-admin-board-pin="${esc(x.id)}:${x.pinned?'0':'1'}">${x.pinned?'고정해제':'고정'}</button><button class="secondary mini-btn danger-btn" data-admin-board-delete="${esc(x.id)}">숨김</button></div></td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('[data-admin-board-delete]').forEach(b=>{ if(b.dataset.bound)return; b.dataset.bound='1'; b.onclick=()=>adminHideBoardPost(b.dataset.adminBoardDelete); });
  box.querySelectorAll('[data-admin-board-pin]').forEach(b=>{ if(b.dataset.bound)return; b.dataset.bound='1'; b.onclick=()=>{ const [id,val]=b.dataset.adminBoardPin.split(':'); adminPinBoardPost(id,val==='1'); }; });
}
async function adminHideBoardPost(id){ if(!confirm(tr('confirm_delete')))return; try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',id),{visible:false,deleted:true,updatedAt:serverTimestamp()},{merge:true}); }catch(e){ alert(e.message); } }
async function adminPinBoardPost(id,pinned){ try{ const {doc,setDoc,serverTimestamp}=firestoreApi; await setDoc(doc(db,'boardPosts',id),{pinned,updatedAt:serverTimestamp()},{merge:true}); }catch(e){ alert(e.message); } }
function bindAdminBoardFilters(){ ['adminBoardSearch','adminBoardStatus'].forEach(id=>{ const el=$(id); if(!el||el.dataset.bound)return; el.dataset.bound='1'; el.addEventListener('input',renderAdminBoardTable); el.addEventListener('change',renderAdminBoardTable); }); }

async function adminAdd(collectionName,data){
  if(!isAdminUser){ alert('admin only'); return null; }
  const {collection,addDoc,serverTimestamp}=firestoreApi;
  const ref=await addDoc(collection(db,collectionName),{...data,visible:true,authorUid:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return ref.id;
}
function adminFlash(html){ let box=$('adminSaveMsg'); if(!box){ box=document.createElement('div'); box.id='adminSaveMsg'; box.className='empty-card'; $('admin')?.prepend(box); } box.innerHTML=html; }
function initForms(){
  $('ticketForm')?.addEventListener('submit',createTicket);
  $('adminNoticeForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const id=await adminAdd('announcements',{title:$('adminNoticeTitle').value.trim(),content:$('adminNoticeContent').value.trim(),pinned:$('adminNoticePinned').checked});
      e.target.reset();
      if(id) adminFlash(`${tr('saved')} · <a href="./notice.html?id=${encodeURIComponent(id)}">상세 보기</a> · <a href="./notices.html">공지사항 목록</a>`);
    }catch(err){ alert(err.message); }
  });
  $('adminPatchForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const id=await adminAdd('patchNotes',{version:$('adminPatchVersion').value.trim(),title:$('adminPatchTitle').value.trim(),content:$('adminPatchContent').value.trim()});
      e.target.reset();
      if(id) adminFlash(`${tr('saved')} · <a href="./patch-notes.html">패치노트 확인</a>`);
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
  if(window.PortOne) return window.PortOne;
  const mod = await import('https://cdn.portone.io/v2/browser-sdk.esm.js');
  window.PortOne = mod;
  return mod;
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
function renderKakaoPayButton(){
  const box = $('paypalButtons');
  if(!box) return;
  const t = purchaseLocaleText();
  box.innerHTML = `<button id="kakaoPayBtn" class="primary purchase-kakao-btn" type="button" onclick="window.midiaiKakaoPay && window.midiaiKakaoPay()"><span class="kakao-mark">pay</span><strong>${esc(t.kakaoButton || '카카오페이로 구매')}</strong></button>`;
}
function initPayPal(){
  if(!$('paypalButtons')) return;
  updatePurchaseAccountBox();
  if(isKoreanCheckout() && CONFIG.portoneKakaoPayChannelKey){
    renderKakaoPayButton();
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
$('menuBtn')?.addEventListener('click',()=>$('mainNav')?.classList.toggle('open'));
showOAuthBrowserNotice();
bindBoardLightbox();
applyStaticI18n();
setAuthUiSignedOut();
initForms();
initAuth();
initPayPal();
