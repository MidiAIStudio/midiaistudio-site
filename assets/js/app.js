const CONFIG = window.MIDIAI_CONFIG || {};
const $ = (id) => document.getElementById(id);
const qs = (s, root = document) => root.querySelector(s);
const page = location.pathname.split('/').pop() || 'index.html';

let lang = localStorage.getItem('midiai_lang') || document.documentElement.lang || 'ko';
let auth = null;
let db = null;
let currentUser = null;
let currentUserDoc = null;
let isAdminUser = false;
let firestoreApi = {};
const unsubscribers = [];
let adminNoticeRows = [];
let adminPatchRows = [];
let adminFaqRows = [];
let adminTicketRows = [];
let adminUserRows = [];
let adminLicenseRows = [];
let adminOrderRows = [];

const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const I18N = {
  en: {
    '홈':'Home','다운로드':'Downloads','구매':'Purchase','공지사항':'Notices','공지 목록':'Notice list','운영 안내, 이벤트, 중요 공지를 확인합니다.':'Check service notices, events, and important updates.','패치노트':'Patch notes','FAQ':'FAQ','1:1 문의':'Support','1:1 문의 작성':'Create ticket','나의 문의':'My tickets','내 계정':'Account','관리자':'Admin','로그아웃':'Logout',
    '7월 31일까지 할인 진행중':'Discount available until July 31','피아노 커버를':'Piano covers','MIDI로 바꾸는':'into MIDI','가장 쉬운 방법':'made easy','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'The easiest way to turn piano covers into MIDI','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio official portal. The home page focuses on product, purchase, and downloads; notices, patch notes, and private support are separated into board-style pages.',
    '라이선스 구매하기':'Buy license','1:1 문의하기':'Contact support','Windows 지원':'Windows support','Google 계정 연동':'Google account linked','비공개 문의':'Private support','업데이트, 이벤트, 운영 안내를 확인합니다.':'Check updates, events, and service notices.','버전별 변경 사항을 확인합니다.':'Check changes by version.','비공개 문의를 작성하고 답변을 확인합니다.':'Create private tickets and check replies.','라이선스 상태와 로그인 정보를 확인합니다.':'Check license status and login details.','바로가기':'Open','문의하기':'Contact','확인하기':'View','최신 설치 파일':'Latest installer','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Shows the latest version from Firestore downloads/latest.','불러오는 중...':'Loading...',
    'Google 로그인':'Sign in with Google','로그인 전':'Not signed in','Google 로그인으로 라이선스 확인 준비':'Sign in with Google to check your license','라이선스 확인 전':'License not checked',
    '공지 상세':'Notice detail','자주 묻는 질문':'FAQ','비공개 1:1 문의':'Private support','문의 등록':'Submit ticket','문의 상세':'Ticket detail','라이선스 구매':'Buy license','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'Add patch note','공지 등록':'Add notice','FAQ 등록':'Add FAQ','라이선스 저장':'Save license','문의 답변':'Ticket replies','공지 작성':'Write notice','패치노트 작성':'Write patch note','FAQ 작성':'Write FAQ','라이선스 지급/수정':'Grant/edit license',
    '제목':'Title','내용':'Content','검색':'Search','버전':'Version','질문':'Question','답변':'Answer','순서':'Order','상단 고정':'Pin to top','플랜':'Plan','상태':'Status','메모':'Memo','사용자 UID':'User UID','등록':'Submit','저장':'Save','문의 내용을 자세히 적어주세요.':'Please describe your issue in detail.','로그인 오류 / 라이선스 문의':'Login issue / license question','로그인이 필요합니다.':'Sign-in required.','내가 작성한 비공개 문의와 답변을 확인합니다.':'View your private tickets and replies.','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'Only you and the admin can view this ticket. Please sign in first.','role=admin 계정만 사용할 수 있습니다.':'Only role=admin accounts can use this page.',
    '답변 완료':'Answered','종료':'Closed','접수':'Open','권한이 없습니다.':'You do not have permission.','관리자 로그인이 필요합니다.':'Admin sign-in required.','표시할 내용이 없습니다.':'Nothing to show.','확인 실패':'Check failed','저장 완료':'Saved','수정':'Edit','삭제':'Delete','종료 처리':'Close','관리':'Manage','상세 보기':'Open detail','공지 관리':'Manage notices','패치노트 관리':'Manage patch notes','FAQ 관리':'Manage FAQ','정말 삭제할까요?':'Delete this item?','수정 완료':'Updated','삭제 완료':'Deleted','문의가 등록되었습니다.':'Ticket created.'
  },
  ja: {
    '홈':'ホーム','다운로드':'ダウンロード','구매':'購入','공지사항':'お知らせ','공지 목록':'お知らせ一覧','운영 안내, 이벤트, 중요 공지를 확인합니다.':'運営案内、イベント、重要なお知らせを確認できます。','패치노트':'パッチノート','FAQ':'FAQ','1:1 문의':'お問い合わせ','1:1 문의 작성':'問い合わせ作成','나의 문의':'マイ問い合わせ','내 계정':'アカウント','관리자':'管理者','로그아웃':'ログアウト',
    '7월 31일까지 할인 진행중':'7月31日まで割引中','피아노 커버를':'ピアノカバーを','MIDI로 바꾸는':'MIDIに変える','가장 쉬운 방법':'一番簡単な方法','피아노 커버를MIDI로 바꾸는가장 쉬운 방법':'ピアノカバーをMIDIに変える一番簡単な方法','MidiAI Studio 공식 포털입니다. 메인 화면은 소개와 구매/다운로드 중심으로 두고, 공지사항·패치노트·1:1 문의는 별도 게시판처럼 분리했습니다.':'MidiAI Studio公式ポータルです。ホームは紹介・購入・ダウンロードを中心にし、お知らせ・パッチノート・非公開問い合わせは別ページに分けました。',
    '라이선스 구매하기':'ライセンス購入','1:1 문의하기':'問い合わせる','Windows 지원':'Windows対応','Google 계정 연동':'Googleアカウント連携','비공개 문의':'非公開問い合わせ','업데이트, 이벤트, 운영 안내를 확인합니다.':'アップデート、イベント、運営案内を確認できます。','버전별 변경 사항을 확인합니다.':'バージョン別の変更内容を確認できます。','비공개 문의를 작성하고 답변을 확인합니다.':'非公開問い合わせを作成し、返信を確認できます。','라이선스 상태와 로그인 정보를 확인합니다.':'ライセンス状態とログイン情報を確認できます。','바로가기':'開く','문의하기':'問い合わせ','확인하기':'確認','최신 설치 파일':'最新インストーラー','Firestore downloads/latest 문서를 기준으로 최신 버전을 표시합니다.':'Firestore downloads/latest を基準に最新バージョンを表示します。','불러오는 중...':'読み込み中...',
    'Google 로그인':'Googleログイン','로그인 전':'未ログイン','Google 로그인으로 라이선스 확인 준비':'Googleログインでライセンス確認','라이선스 확인 전':'ライセンス未確認',
    '공지 상세':'お知らせ詳細','자주 묻는 질문':'よくある質問','비공개 1:1 문의':'非公開お問い合わせ','문의 등록':'送信','문의 상세':'問い合わせ詳細','라이선스 구매':'ライセンス購入','MidiAI Studio License':'MidiAI Studio License','패치노트 등록':'パッチノート登録','공지 등록':'お知らせ登録','FAQ 등록':'FAQ登録','라이선스 저장':'ライセンス保存','문의 답변':'問い合わせ返信','공지 작성':'お知らせ作成','패치노트 작성':'パッチノート作成','FAQ 작성':'FAQ作成','라이선스 지급/수정':'ライセンス付与/修正',
    '제목':'タイトル','내용':'内容','검색':'検索','버전':'バージョン','질문':'質問','답변':'回答','순서':'順序','상단 고정':'上部固定','플랜':'プラン','상태':'状態','메모':'メモ','사용자 UID':'ユーザーUID','등록':'登録','저장':'保存','문의 내용을 자세히 적어주세요.':'お問い合わせ内容を詳しく入力してください。','로그인 오류 / 라이선스 문의':'ログインエラー / ライセンス問い合わせ','로그인이 필요합니다.':'ログインが必要です。','내가 작성한 비공개 문의와 답변을 확인합니다.':'自分の非公開問い合わせと返信を確認します。','문의 내용은 작성자와 관리자만 볼 수 있습니다. 로그인 후 작성해주세요.':'問い合わせ内容は作成者と管理者のみ閲覧できます。ログイン後に作成してください。','role=admin 계정만 사용할 수 있습니다.':'role=adminアカウントのみ使用できます。',
    '답변 완료':'回答済み','종료':'終了','접수':'受付','권한이 없습니다.':'権限がありません。','관리자 로그인이 필요합니다.':'管理者ログインが必要です。','표시할 내용이 없습니다.':'表示する内容がありません。','확인 실패':'確認失敗','저장 완료':'保存完了','수정':'編集','삭제':'削除','종료 처리':'終了にする','관리':'管理','상세 보기':'詳細を見る','공지 관리':'お知らせ管理','패치노트 관리':'パッチノート管理','FAQ 관리':'FAQ管理','정말 삭제할까요?':'本当に削除しますか？','수정 완료':'更新しました','삭제 완료':'削除しました','문의가 등록되었습니다.':'問い合わせを登録しました。'
  }
};

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

  const b = $('langBtn');
  if (b) b.textContent = lang === 'ko' ? 'EN' : lang === 'en' ? '日本語' : '한국어';
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
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
function getParam(k){ return new URLSearchParams(location.search).get(k); }
function configuredFirebase(){ const f = CONFIG.firebase || {}; return f.apiKey && f.projectId && !String(f.apiKey).startsWith('PASTE_') && !String(f.projectId).startsWith('PASTE_'); }
function addUnsub(fn){ if (typeof fn === 'function') unsubscribers.push(fn); return fn; }
function clearUnsubs(){ while(unsubscribers.length){ try{unsubscribers.pop()();}catch{} } }

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
  if (page==='admin.html') {
    if (isAdminUser) { $('admin')?.classList.remove('admin-locked'); listenAdminDashboard(); listenAdminUsers(); listenAdminTickets(); listenAdminPostManager(); loadAdminDownloadSettings(); }
    else { $('admin') && ($('admin').innerHTML = `<div class="empty-card">${tr('admin_required')}</div>`); }
  }
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
  const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged},fs]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
  ]);
  const app=initializeApp(CONFIG.firebase);
  auth=getAuth(app);
  db=fs.getFirestore(app);
  firestoreApi=fs;
  const provider=new GoogleAuthProvider();
  $('loginBtn') && ($('loginBtn').onclick=()=>signInWithPopup(auth,provider).catch(e=>alert(e.message)));
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
async function editTicket(ticketId){
  if(!currentUser)return;
  try{
    const {doc,getDoc,updateDoc,serverTimestamp}=firestoreApi;
    const ref=doc(db,'supportTickets',ticketId); const snap=await getDoc(ref); if(!snap.exists())return;
    const t=snap.data(); if(!isAdminUser && t.uid!==currentUser.uid){ alert(tr('no_permission')); return; }
    const title=prompt('Title',t.title||''); if(title===null)return;
    const content=prompt('Content',t.content||''); if(content===null)return;
    await updateDoc(ref,{title:title.trim(),content:content.trim(),updatedAt:serverTimestamp()});
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
    const d=snap.data(); const data={updatedAt:serverTimestamp()};
    if(collectionName==='announcements'){
      const title=prompt('Title',d.title||''); if(title===null)return; const content=prompt('Content',d.content||''); if(content===null)return; data.title=title.trim(); data.content=content.trim(); data.pinned=confirm('Pinned? OK=true / Cancel=false'); data.visible=confirm('Visible? OK=true / Cancel=false');
    } else if(collectionName==='patchNotes'){
      const version=prompt('Version',d.version||''); if(version===null)return; const title=prompt('Title',d.title||''); if(title===null)return; const content=prompt('Content',d.content||''); if(content===null)return; data.version=version.trim(); data.title=title.trim(); data.content=content.trim(); data.visible=confirm('Visible? OK=true / Cancel=false');
    } else if(collectionName==='faq'){
      const question=prompt('Question',d.question||''); if(question===null)return; const answer=prompt('Answer',d.answer||''); if(answer===null)return; const order=prompt('Order',d.order||1); if(order===null)return; data.question=question.trim(); data.answer=answer.trim(); data.order=Number(order||1); data.visible=confirm('Visible? OK=true / Cancel=false');
    }
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
function initPayPal(){
  if(!CONFIG.paypalClientId||String(CONFIG.paypalClientId).startsWith('PASTE_')||!$('paypalButtons')) return;
  const s=document.createElement('script');
  s.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=${CONFIG.currency||'KRW'}`;
  s.onload=()=>{
    if(!window.paypal)return;
    $('paypalButtons').innerHTML='';
    window.paypal.Buttons({
      createOrder:(data,actions)=>actions.order.create({purchase_units:[{amount:{value:CONFIG.priceValue||'90000',currency_code:CONFIG.currency||'KRW'},description:'MidiAI Studio License'}]}),
      onApprove:async(data,actions)=>{ await actions.order.capture(); alert('결제가 확인되었습니다. 1:1 문의에 Google 계정/HWID를 남겨주세요.'); }
    }).render('#paypalButtons');
  };
  document.body.appendChild(s);
}

$('year') && ($('year').textContent=new Date().getFullYear());
$('langBtn') && ($('langBtn').onclick=()=>{ lang = lang==='ko' ? 'en' : lang==='en' ? 'ja' : 'ko'; applyStaticI18n(); });
$('menuBtn')?.addEventListener('click',()=>$('mainNav')?.classList.toggle('open'));
applyStaticI18n();
setAuthUiSignedOut();
initForms();
initAuth();
initPayPal();
