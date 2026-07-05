const $ = (id) => document.getElementById(id);
const CONFIG = window.MIDIAI_CONFIG || {};
let lang = localStorage.getItem('midiai_lang') || document.documentElement.lang || 'ko';
let currentUser = null;
let portalDb = null;
let isAdminUser = false;

const T = {
  ko: {nav_features:'기능',nav_license:'라이선스',nav_purchase:'구매',nav_install:'설치',nav_notices:'공지사항',nav_patchnotes:'패치노트',nav_support:'1:1문의',login:'Google 로그인',logout:'로그아웃',sale:'7월 31일까지 할인 진행중',hero_title:'피아노 커버를<br>MIDI로 바꾸는<br>가장 쉬운 방법',hero_desc:'YouTube 영상이나 오디오 파일을 넣고 MidiAI Studio로 연주 데이터를 빠르게 변환하세요. Google 로그인으로 내 라이선스 상태도 확인할 수 있습니다.',buy:'라이선스 구매하기',guide:'설치 방법 보기',trust1:'Windows 지원',trust2:'Google 계정 연동',trust3:'HWID 기반 인증',input:'입력',output:'출력',account_label:'내 계정',account_title:'Google 로그인 후 라이선스 상태 확인',account_desc:'구매 완료 후 관리자 승인 또는 자동 지급 시스템을 통해 이 Google 계정에 라이선스가 연결됩니다.',guest:'로그인 전',guest_desc:'Google 로그인으로 라이선스 확인 준비',license_wait:'라이선스 확인 전',features_title:'변환부터 인증까지 깔끔하게',f1t:'피아노 중심 MIDI 변환',f1d:'커버 영상과 오디오를 MIDI 파일로 변환하는 흐름에 맞췄습니다.',f2t:'Google 계정 라이선스',f2d:'구매 계정과 프로그램 인증을 연결해 키 입력 없이 사용하도록 설계합니다.',f3t:'HWID 보호',f3d:'계정 공유 문제를 줄이기 위해 PC 고유값 기반 인증을 함께 사용합니다.',f4t:'다국어 대응',f4d:'한국어/영어/일본어 페이지 구조를 유지합니다.',license_title:'고객은 키를 입력하지 않습니다',license_desc:'고객은 Google 로그인 후 프로그램에서 자동으로 계정/PC 인증 상태를 확인합니다. 관리자는 Firestore licenses 문서에서 승인 상태만 관리합니다.',flow1:'Google 로그인',flow2:'PayPal 또는 계좌 결제',flow3:'프로그램 실행 후 계정 로그인',flow4:'관리자 승인 후 자동 인증',price:'90,000원',until:'7월 31일까지',p1:'Google 계정 라이선스 연결',p2:'등록된 PC에서 사용 가능',p3:'설치 마법사 지원',paypal_ready:'PayPal Client ID 입력 후 결제 버튼이 표시됩니다.',discord:'디스코드 문의하기',bank_title:'계좌 입금 안내',bank:'카카오뱅크 3333-02-9669468 최정환',bank_after:'입금 후 Google 계정 이메일과 프로그램의 계정정보 복사 내용을 문의 채팅창에 붙여넣기 해주세요.',auto_title:'자동 라이선스 지급',auto_desc:'완전 자동 지급은 Firebase Functions/서버에서 PayPal 결제 검증 후 처리해야 안전합니다. 프론트 단독 지급은 조작 위험이 있어 막아두었습니다.',install_title:'설치 및 인증 방법',s1t:'설치 마법사 실행',s1d:'다운로드한 설치 파일을 실행합니다.',s2t:'Google 로그인',s2d:'프로그램에서 Google로 로그인합니다.',s3t:'문의 채팅 전달',s3d:'입금자명/Google 계정/계정정보를 남깁니다.',s4t:'자동 인증 확인',s4d:'등록 후 프로그램 실행 시 라이선스를 확인합니다.',footer:'Google 로그인/PayPal 연동 준비형 V8',active:'라이선스 활성화됨',none:'라이선스 없음',checking:'라이선스 확인 중',check_failed:'확인 실패',support_cta:'1:1 문의하기',support_center:'1:1 문의하기',notices_title:'공지사항',notices_desc:'구매, 설치, 라이선스 관련 중요한 안내를 이곳에서 확인할 수 있습니다.',notice_tag_sale:'할인',notice_tag_license:'라이선스',notice_tag_support:'문의',notice1_title:'7월 31일까지 할인 진행',notice1_desc:'MidiAI Studio 라이선스를 할인 금액으로 구매할 수 있습니다.',notice2_title:'Google 계정 기반 인증 적용',notice2_desc:'구매한 Google 계정으로 프로그램에 로그인하면 라이선스를 확인합니다.',notice3_title:'1:1 문의 지원 준비중',notice3_desc:'디스코드 의존도를 줄이고 홈페이지에서 문의 흐름을 안내합니다.',patch_title:'패치노트',patch_desc:'프로그램과 홈페이지 업데이트 내역을 확인하세요.',patch_v8_title:'Firebase 라이선스 연동',patch_v8_desc:'Google 로그인, Firestore 라이선스 확인, users 로그인 기록 구조에 맞춘 홈페이지 패치.',patch_v7_title:'홈페이지 디자인/다국어 기반',patch_v7_desc:'한국어, 영어, 일본어 페이지 구조와 랜딩 페이지 디자인 구성.',patch_app_title:'프로그램 인증 구조 개선',patch_app_desc:'licenses는 읽기 전용, users는 로그인 기록 및 HWID 저장 구조로 분리.',support_title:'홈페이지에서 문의 흐름을 안내합니다',support_desc:'구매 확인, 설치 문제, 라이선스 등록 요청은 아래 정보를 복사해서 문의하면 처리 속도가 빨라집니다. 추후 전용 문의 폼/관리자 페이지로 확장할 수 있습니다.',support_box_title:'문의 시 보내주세요',support_item1:'Google 로그인 이메일',support_item2:'입금자명 또는 PayPal 결제 이메일',support_item3:'프로그램의 “계정정보 복사” 내용',support_item4:'오류 화면 캡처 또는 증상 설명',email_support:'이메일 문의하기',copy_support:'문의 양식 복사'},
  en: {nav_features:'Features',nav_license:'License',nav_purchase:'Buy',nav_install:'Install',nav_notices:'Notices',nav_patchnotes:'Patch Notes',nav_support:'Support',login:'Sign in with Google',logout:'Logout',sale:'Sale until July 31',hero_title:'Turn piano covers<br>into MIDI<br>the easy way',hero_desc:'Drop a YouTube video or audio file into MidiAI Studio and convert piano performance data fast. Sign in with Google to check your license status.',buy:'Buy License',guide:'Installation Guide',trust1:'Windows support',trust2:'Google account license',trust3:'HWID verification',input:'Input',output:'Output',account_label:'Account',account_title:'Check license after Google sign-in',account_desc:'After purchase, the license is attached to this Google account through admin approval or an automated license system.',guest:'Not signed in',guest_desc:'Sign in with Google to prepare license check',license_wait:'Not checked yet',features_title:'Clean flow from conversion to license',f1t:'Piano-focused MIDI conversion',f1d:'Designed for converting piano cover videos and audio into MIDI files.',f2t:'Google account license',f2d:'Connect purchase accounts and app authentication without manual key input.',f3t:'HWID protection',f3d:'Reduce account sharing by pairing account verification with PC hardware ID.',f4t:'Multilingual pages',f4d:'Keeps Korean, English, and Japanese page structure.',license_title:'Customers do not enter license keys',license_desc:'Customers sign in with Google in the app. Admin-managed Firestore license documents decide access.',flow1:'Google sign-in',flow2:'PayPal or bank transfer',flow3:'Sign in inside the app',flow4:'Automatic auth after approval',price:'KRW 90,000',until:'Until July 31',p1:'Google account license',p2:'Available on registered PC',p3:'Installer wizard support',paypal_ready:'PayPal button appears after Client ID is added.',discord:'Contact on Discord',bank_title:'Bank transfer',bank:'KakaoBank 3333-02-9669468 Choi Jeonghwan',bank_after:'After payment, send your Google email and copied account info from the app to support.',auto_title:'Automatic license issuing',auto_desc:'Safe automation requires Firebase Functions/server-side PayPal verification. Front-end-only license issuing is blocked because it can be manipulated.',install_title:'Install and activation',s1t:'Run installer',s1d:'Run the downloaded installer.',s2t:'Google sign-in',s2d:'Sign in with Google in the app.',s3t:'Send to support',s3d:'Send payer name, Google account, and copied account info.',s4t:'Check activation',s4d:'After registration, the app checks license status on launch.',footer:'Google/PayPal-ready V8',active:'License active',none:'No license',checking:'Checking license',check_failed:'Check failed',support_cta:'Contact support',support_center:'Contact support',notices_title:'Notices',notices_desc:'Important purchase, installation, and license updates are posted here.',notice_tag_sale:'Sale',notice_tag_license:'License',notice_tag_support:'Support',notice1_title:'Sale until July 31',notice1_desc:'MidiAI Studio license is available at the discounted price.',notice2_title:'Google account license applied',notice2_desc:'Sign in with the purchased Google account in the app to verify your license.',notice3_title:'1:1 support flow preparing',notice3_desc:'We are reducing Discord dependency and moving support guidance to the website.',patch_title:'Patch Notes',patch_desc:'Check app and website update history.',patch_v8_title:'Firebase license integration',patch_v8_desc:'Website patch aligned with Google sign-in, Firestore license checks, and users login records.',patch_v7_title:'Website design and multilingual base',patch_v7_desc:'Korean, English, and Japanese landing page structure.',patch_app_title:'Improved app authentication structure',patch_app_desc:'licenses is read-only; users stores login records and HWID.',support_title:'Support flow is now on the website',support_desc:'For purchase checks, install issues, or license registration, send the details below for faster help.',support_box_title:'Please include',support_item1:'Google sign-in email',support_item2:'Payer name or PayPal email',support_item3:'Copied “account info” from the app',support_item4:'Error screenshot or issue details',email_support:'Email support',copy_support:'Copy support template'},
  ja: {nav_features:'機能',nav_license:'ライセンス',nav_purchase:'購入',nav_install:'インストール',nav_notices:'お知らせ',nav_patchnotes:'パッチノート',nav_support:'1:1問い合わせ',login:'Googleログイン',logout:'ログアウト',sale:'7月31日までセール中',hero_title:'ピアノカバーを<br>MIDIへ変換する<br>かんたんな方法',hero_desc:'YouTube動画や音声ファイルをMidiAI Studioに入れて、演奏データをすばやく変換できます。Googleログインでライセンス状態も確認できます。',buy:'ライセンス購入',guide:'インストール方法',trust1:'Windows対応',trust2:'Googleアカウント連携',trust3:'HWID認証',input:'入力',output:'出力',account_label:'アカウント',account_title:'Googleログイン後にライセンス確認',account_desc:'購入後、管理者承認または自動発行システムにより、このGoogleアカウントにライセンスが紐づきます。',guest:'未ログイン',guest_desc:'Googleログインでライセンス確認を準備',license_wait:'未確認',features_title:'変換から認証までスムーズに',f1t:'ピアノ中心のMIDI変換',f1d:'ピアノカバー動画と音声をMIDIへ変換する流れに最適化。',f2t:'Googleアカウントライセンス',f2d:'購入アカウントとアプリ認証を接続し、キー入力なしで利用できます。',f3t:'HWID保護',f3d:'PC固有値と組み合わせてアカウント共有を抑えます。',f4t:'多言語対応',f4d:'韓国語・英語・日本語ページ構造を維持します。',license_title:'お客様はキー入力不要',license_desc:'アプリでGoogleログインすると、管理者が管理するFirestoreライセンスにより認証されます。',flow1:'Googleログイン',flow2:'PayPalまたは銀行振込',flow3:'アプリでログイン',flow4:'承認後に自動認証',price:'90,000ウォン',until:'7月31日まで',p1:'Googleアカウントライセンス',p2:'登録PCで利用可能',p3:'インストーラーサポート',paypal_ready:'Client ID入力後、PayPalボタンが表示されます。',discord:'Discordで問い合わせ',bank_title:'銀行振込案内',bank:'KakaoBank 3333-02-9669468 Choi Jeonghwan',bank_after:'入金後、Googleメールとアプリのアカウント情報をサポートへ送信してください。',auto_title:'自動ライセンス発行',auto_desc:'安全な自動発行にはFirebase Functions/サーバー側PayPal検証が必要です。フロント単独発行は改ざんリスクがあるため無効です。',install_title:'インストールと認証',s1t:'インストーラー実行',s1d:'ダウンロードしたインストーラーを実行します。',s2t:'Googleログイン',s2d:'アプリでGoogleログインします。',s3t:'サポートへ送信',s3d:'入金者名/Googleアカウント/アカウント情報を送ります。',s4t:'認証確認',s4d:'登録後、アプリ起動時にライセンス状態を確認します。',footer:'Google/PayPal連携準備型V8',active:'ライセンス有効',none:'ライセンスなし',checking:'確認中',check_failed:'確認失敗',support_cta:'1:1問い合わせ',support_center:'1:1問い合わせ',notices_title:'お知らせ',notices_desc:'購入、インストール、ライセンスに関する重要なお知らせを確認できます。',notice_tag_sale:'セール',notice_tag_license:'ライセンス',notice_tag_support:'問い合わせ',notice1_title:'7月31日までセール中',notice1_desc:'MidiAI Studioライセンスを割引価格で購入できます。',notice2_title:'Googleアカウント認証を適用',notice2_desc:'購入したGoogleアカウントでアプリにログインするとライセンスを確認します。',notice3_title:'1:1問い合わせ準備中',notice3_desc:'Discord依存を減らし、サイト内で問い合わせ導線を案内します。',patch_title:'パッチノート',patch_desc:'アプリとWebサイトの更新履歴を確認できます。',patch_v8_title:'Firebaseライセンス連携',patch_v8_desc:'Googleログイン、Firestoreライセンス確認、usersログイン記録に合わせたサイトパッチ。',patch_v7_title:'サイトデザイン・多言語基盤',patch_v7_desc:'韓国語・英語・日本語のランディングページ構造。',patch_app_title:'アプリ認証構造改善',patch_app_desc:'licensesは読み取り専用、usersはログイン記録とHWIDを保存。',support_title:'サイトで問い合わせ導線を案内します',support_desc:'購入確認、インストール問題、ライセンス登録依頼は下記情報を送ると対応が早くなります。',support_box_title:'問い合わせ時に送る内容',support_item1:'Googleログインメール',support_item2:'入金者名またはPayPalメール',support_item3:'アプリの「アカウント情報コピー」内容',support_item4:'エラー画面または症状説明',email_support:'メールで問い合わせ',copy_support:'問い合わせテンプレートをコピー'}
};

function setText(){
  const d=T[lang]||T.ko;
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const k=el.dataset.i18n; if(d[k]) el.innerHTML=d[k]; });
  $('langBtn').textContent = lang==='ko'?'EN':lang==='en'?'日本語':'한국어';
  localStorage.setItem('midiai_lang',lang);
}
function configuredFirebase(){ const f=CONFIG.firebase||{}; return f.apiKey && !String(f.apiKey).startsWith('PASTE_') && f.projectId && !String(f.projectId).startsWith('PASTE_'); }
function normalize(value){ return String(value || '').trim().toLowerCase(); }
function isActiveLicense(data){
  if(!data) return false;
  const licensed = data.licensed === true || data.active === true;
  const status = normalize(data.status || (data.active ? 'active' : ''));
  const plan = normalize(data.plan || '');
  const activeStatus = ['active','ok','enabled'].includes(status);
  const paidPlan = ['lifetime','monthly','yearly','annual','paid','pro','full'].includes(plan);
  return licensed && activeStatus && paidPlan;
}
function signedOut(){
  currentUser = null;
  $('avatar').textContent='?';
  $('userName').textContent=T[lang].guest;
  $('userEmail').textContent=T[lang].guest_desc;
  $('licenseBadge').className='badge pending';
  $('licenseBadge').textContent=T[lang].license_wait;
  $('loginBtn').classList.remove('hidden');
  $('logoutBtn').classList.add('hidden');
  isAdminUser=false;
  toggleAdmin(false);
  const list=$('myTicketsList'); if(list) list.innerHTML='<p class="muted">로그인 후 내가 작성한 문의를 확인할 수 있습니다.</p>';
}

async function updateUserDoc(db, user){
  const {doc,setDoc,serverTimestamp}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
  const userRef=doc(db,'users',user.uid);
  await setDoc(userRef,{
    uid:user.uid,
    email:user.email||'',
    displayName:user.displayName||'',
    photoURL:user.photoURL||'',
    lastLogin:serverTimestamp(),
    lastSeenAt:serverTimestamp(),
    lastAuthReason:'homepage_license_check',
    homepageVersion:'v8'
  },{merge:true});
}
async function checkLicense(user){
  $('licenseBadge').className='badge pending';
  $('licenseBadge').textContent=T[lang].checking;
  try{
    if(CONFIG.licenseCheckEndpoint){
      const token=await user.getIdToken();
      const res=await fetch(CONFIG.licenseCheckEndpoint,{headers:{Authorization:`Bearer ${token}`}});
      const data=await res.json();
      const active=!!data.active;
      $('licenseBadge').className='badge '+(active?'active':'none');
      $('licenseBadge').textContent=active?T[lang].active:T[lang].none;
      return;
    }
    if(CONFIG.licenseSource==='firestore'){
      const {getFirestore,doc,getDoc}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      const db=getFirestore(window.__midiaiFirebaseApp);
      await updateUserDoc(db,user);
      const snap=await getDoc(doc(db,'licenses',user.uid));
      const data=snap.exists()?snap.data():null;
      const active=isActiveLicense(data);
      $('licenseBadge').className='badge '+(active?'active':'none');
      $('licenseBadge').textContent=active?T[lang].active:T[lang].none;
      return;
    }
    $('licenseBadge').className='badge none';
    $('licenseBadge').textContent=T[lang].none;
  }catch(e){
    console.error(e);
    $('licenseBadge').className='badge none';
    $('licenseBadge').textContent=T[lang].check_failed || 'Check failed';
  }
}
function signedIn(user){
  currentUser = user;
  const name=user.displayName||user.email||'User';
  $('avatar').textContent=name.slice(0,1).toUpperCase();
  $('userName').textContent=name;
  $('userEmail').textContent=user.email||'';
  $('loginBtn').classList.add('hidden');
  $('logoutBtn').classList.remove('hidden');
  checkLicense(user);
  const status=$('ticketStatus'); if(status) status.textContent='문의 작성이 가능합니다.';
}

async function initAuth(){
  if(!configuredFirebase()){
    $('loginBtn').onclick=()=>alert(lang==='ko'?'assets/js/config.js에 Firebase 설정값을 먼저 넣어줘.':'Add Firebase config in assets/js/config.js first.');
    loadPublicContent(null);
    return;
  }
  const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged},{getFirestore}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
  ]);
  const app=initializeApp(CONFIG.firebase);
  window.__midiaiFirebaseApp=app;
  portalDb=getFirestore(app);
  const auth=getAuth(app);
  const provider=new GoogleAuthProvider();
  $('loginBtn').onclick=()=>signInWithPopup(auth,provider);
  $('logoutBtn').onclick=()=>signOut(auth);
  loadPublicContent(portalDb);
  onAuthStateChanged(auth,async u=>{
    if(u){
      signedIn(u);
      await detectAdmin(u);
      await Promise.all([loadMyTickets(), loadAdminTickets()]);
    }else{
      signedOut();
      isAdminUser=false;
      toggleAdmin(false);
    }
  });
}
function initPayPal(){
  if(!CONFIG.paypalClientId || String(CONFIG.paypalClientId).startsWith('PASTE_')) return;
  const s=document.createElement('script');
  s.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=${CONFIG.currency||'KRW'}`;
  s.onload=()=>{
    if(!window.paypal)return;
    $('paypalButtons').innerHTML='';
    window.paypal.Buttons({
      createOrder:(data,actions)=>actions.order.create({purchase_units:[{amount:{value:CONFIG.priceValue||'90000',currency_code:CONFIG.currency||'KRW'},description:'MidiAI Studio License'}]}),
      onApprove:async(data,actions)=>{
        const details=await actions.order.capture();
        if(CONFIG.paymentCaptureEndpoint){
          const token = currentUser ? await currentUser.getIdToken() : '';
          await fetch(CONFIG.paymentCaptureEndpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({orderID:data.orderID,details})});
        }
        alert(lang==='ko'?'결제가 확인되었습니다. Google 계정과 프로그램 계정정보를 문의 채팅에 남겨주세요.':'Payment captured. Send your Google account and app account info to support.');
      }
    }).render('#paypalButtons');
  };
  document.body.appendChild(s);
}

$('year').textContent=new Date().getFullYear();
$('langBtn').onclick=()=>{ lang = lang==='ko'?'en':lang==='en'?'ja':'ko'; setText(); if(currentUser) signedIn(currentUser); else signedOut(); };
setText();
signedOut();
initAuth();
initPayPal();




// ------------------------------
// V10 Portal: notices, patch notes, private support tickets, admin replies
// ------------------------------
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
function dateText(v){
  try{ const d=v?.toDate?v.toDate():new Date(v); return isNaN(d.getTime())?'':d.toLocaleString('ko-KR'); }catch(e){ return ''; }
}
function statusText(s){return s==='answered'?'답변 완료':'접수됨';}
function toggleAdmin(show){ document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!show)); }
async function getFs(){
  return await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
}
async function loadPublicContent(db){
  if(!db){ return; }
  try{
    const {collection,query,orderBy,limit,getDocs}=await getFs();
    const noticeSnap=await getDocs(query(collection(db,'announcements'),orderBy('createdAt','desc'),limit(9)));
    const notices=[]; noticeSnap.forEach(d=>notices.push({id:d.id,...d.data()}));
    notices.sort((a,b)=>(b.pinned===true)-(a.pinned===true) || ((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    const box=$('noticeList');
    if(box){
      box.innerHTML = notices.length ? notices.map(n=>`<article><span class="tag ${n.pinned?'pinned':''}">${n.pinned?'고정':'공지'}</span><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><small class="muted">${dateText(n.createdAt)}</small></article>`).join('') : `<article><span class="tag">공지</span><h3>등록된 공지사항이 없습니다</h3><p>관리자 포털에서 공지사항을 작성하면 이곳에 표시됩니다.</p></article>`;
    }
  }catch(e){ console.warn('notice load failed',e); }
  try{
    const {collection,query,orderBy,limit,getDocs}=await getFs();
    const snap=await getDocs(query(collection(db,'patch_notes'),orderBy('createdAt','desc'),limit(10)));
    const items=[]; snap.forEach(d=>items.push({id:d.id,...d.data()}));
    const box=$('patchList');
    if(box){
      box.innerHTML = items.length ? items.map(p=>`<article><b>${esc(p.version||'PATCH')}</b><div><h3>${esc(p.title)}</h3><p>${esc(p.content)}</p><small class="muted">${dateText(p.createdAt)}</small></div></article>`).join('') : `<article><b>V10</b><div><h3>홈페이지 포털 기능 추가</h3><p>공지사항, 패치노트, 비공개 1:1 문의와 나의 문의 기능을 추가했습니다.</p></div></article>`;
    }
  }catch(e){ console.warn('patch notes load failed',e); }
}
async function detectAdmin(user){
  isAdminUser=false;
  const adminEmails=(CONFIG.adminEmails||[]).map(x=>String(x).toLowerCase());
  if(adminEmails.includes(String(user.email||'').toLowerCase())) isAdminUser=true;
  if(portalDb){
    try{
      const {doc,getDoc}=await getFs();
      const snap=await getDoc(doc(portalDb,'admins',user.uid));
      if(snap.exists() && snap.data().active!==false) isAdminUser=true;
    }catch(e){ /* rules may block; adminEmails fallback works */ }
  }
  toggleAdmin(isAdminUser);
}
async function submitTicket(ev){
  ev.preventDefault();
  const status=$('ticketStatus');
  if(!currentUser || !portalDb){ status.textContent='Google 로그인 후 문의를 남길 수 있습니다.'; return; }
  const title=$('ticketTitle').value.trim();
  const content=$('ticketContent').value.trim();
  if(!title || !content){ status.textContent='제목과 내용을 입력해주세요.'; return; }
  status.textContent='문의 등록 중...';
  try{
    const {collection,addDoc,serverTimestamp}=await getFs();
    await addDoc(collection(portalDb,'support_tickets'),{
      uid:currentUser.uid,
      email:currentUser.email||'',
      displayName:currentUser.displayName||'',
      category:$('ticketCategory').value,
      title,content,
      status:'open',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    $('ticketTitle').value=''; $('ticketContent').value='';
    status.textContent='비공개 문의가 등록되었습니다. 나의 문의에서 확인할 수 있습니다.';
    await loadMyTickets();
    if(isAdminUser) await loadAdminTickets();
  }catch(e){ console.error(e); status.textContent='등록 실패: Firestore 규칙 또는 네트워크를 확인해주세요.'; }
}
async function loadMyTickets(){
  const box=$('myTicketsList'); if(!box) return;
  if(!currentUser || !portalDb){ box.innerHTML='<p class="muted">로그인 후 내가 작성한 문의를 확인할 수 있습니다.</p>'; return; }
  try{
    const {collection,query,where,getDocs}=await getFs();
    const snap=await getDocs(query(collection(portalDb,'support_tickets'),where('uid','==',currentUser.uid)));
    const items=[]; snap.forEach(d=>items.push({id:d.id,...d.data()}));
    items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    box.innerHTML = items.length ? items.map(renderTicket).join('') : '<p class="muted">아직 작성한 문의가 없습니다.</p>';
  }catch(e){ console.error(e); box.innerHTML='<p class="muted">문의 목록을 불러오지 못했습니다. Firestore 규칙을 확인해주세요.</p>'; }
}
function renderTicket(t){
  const answered=t.status==='answered';
  const replies=Array.isArray(t.replies)?t.replies:[];
  return `<article class="ticket"><div class="ticket-head"><div><h4>${esc(t.title)}</h4><div class="ticket-meta"><span>${esc(t.category||'etc')}</span><span>${dateText(t.createdAt)}</span><span>${esc(t.email||'')}</span></div></div><span class="status-chip ${answered?'answered':''}">${statusText(t.status)}</span></div><p>${esc(t.content)}</p>${replies.length?`<div class="reply-box"><b>답변</b>${replies.map(r=>`<div class="reply"><b>${esc(r.authorName||'관리자')}</b><p>${esc(r.content)}</p><small class="muted">${dateText(r.createdAt)}</small></div>`).join('')}</div>`:''}</article>`;
}
async function loadAdminTickets(){
  const box=$('adminTicketsList'); if(!box) return;
  if(!isAdminUser || !portalDb){ box.innerHTML='<p class="muted">관리자 권한이 필요합니다.</p>'; return; }
  try{
    const {collection,query,limit,getDocs}=await getFs();
    const snap=await getDocs(query(collection(portalDb,'support_tickets'),limit(50)));
    const items=[]; snap.forEach(d=>items.push({id:d.id,...d.data()}));
    items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    box.innerHTML = items.length ? items.map(renderAdminTicket).join('') : '<p class="muted">접수된 문의가 없습니다.</p>';
    box.querySelectorAll('[data-reply-id]').forEach(btn=>btn.addEventListener('click',()=>replyTicket(btn.dataset.replyId)));
  }catch(e){ console.error(e); box.innerHTML='<p class="muted">관리자 문의 목록을 불러오지 못했습니다. rules를 확인해주세요.</p>'; }
}
function renderAdminTicket(t){
  return `<article class="ticket"><div class="ticket-head"><div><h4>${esc(t.title)}</h4><div class="ticket-meta"><span>${esc(t.email||'')}</span><span>${esc(t.category||'etc')}</span><span>${dateText(t.createdAt)}</span></div></div><span class="status-chip ${t.status==='answered'?'answered':''}">${statusText(t.status)}</span></div><p>${esc(t.content)}</p>${Array.isArray(t.replies)&&t.replies.length?`<div class="reply-box">${t.replies.map(r=>`<div class="reply"><b>${esc(r.authorName||'관리자')}</b><p>${esc(r.content)}</p></div>`).join('')}</div>`:''}<div class="admin-reply-form"><textarea id="reply-${esc(t.id)}" placeholder="답변 내용을 입력하세요"></textarea><button class="primary" type="button" data-reply-id="${esc(t.id)}">답변</button></div></article>`;
}
async function replyTicket(id){
  const ta=document.getElementById('reply-'+id); const content=ta?.value.trim();
  if(!content) return alert('답변 내용을 입력해주세요.');
  try{
    const {doc,updateDoc,arrayUnion,serverTimestamp}=await getFs();
    await updateDoc(doc(portalDb,'support_tickets',id),{
      status:'answered',
      updatedAt:serverTimestamp(),
      replies:arrayUnion({authorUid:currentUser.uid,authorEmail:currentUser.email||'',authorName:currentUser.displayName||'관리자',content,createdAt:new Date().toISOString()})
    });
    await loadAdminTickets();
  }catch(e){ console.error(e); alert('답변 저장 실패: Firestore 규칙을 확인해주세요.'); }
}
async function submitNotice(ev){
  ev.preventDefault(); if(!isAdminUser || !portalDb) return;
  const status=$('noticeStatus'); status.textContent='등록 중...';
  try{
    const {collection,addDoc,serverTimestamp}=await getFs();
    await addDoc(collection(portalDb,'announcements'),{title:$('noticeTitle').value.trim(),content:$('noticeContent').value.trim(),pinned:$('noticePinned').checked,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),authorUid:currentUser.uid,authorEmail:currentUser.email||''});
    $('noticeTitle').value=''; $('noticeContent').value=''; $('noticePinned').checked=false; status.textContent='공지 등록 완료'; await loadPublicContent(portalDb);
  }catch(e){ console.error(e); status.textContent='공지 등록 실패'; }
}
async function submitPatch(ev){
  ev.preventDefault(); if(!isAdminUser || !portalDb) return;
  const status=$('patchStatus'); status.textContent='등록 중...';
  try{
    const {collection,addDoc,serverTimestamp}=await getFs();
    await addDoc(collection(portalDb,'patch_notes'),{version:$('patchVersion').value.trim(),title:$('patchTitle').value.trim(),content:$('patchContent').value.trim(),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),authorUid:currentUser.uid,authorEmail:currentUser.email||''});
    $('patchVersion').value=''; $('patchTitle').value=''; $('patchContent').value=''; status.textContent='패치노트 등록 완료'; await loadPublicContent(portalDb);
  }catch(e){ console.error(e); status.textContent='패치노트 등록 실패'; }
}
function initPortalUi(){
  $('ticketForm')?.addEventListener('submit',submitTicket);
  $('refreshTicketsBtn')?.addEventListener('click',loadMyTickets);
  $('refreshAdminTicketsBtn')?.addEventListener('click',loadAdminTickets);
  $('noticeForm')?.addEventListener('submit',submitNotice);
  $('patchForm')?.addEventListener('submit',submitPatch);
  $('copySupportBtn')?.addEventListener('click',async()=>{
    const template=$('supportTemplate')?.innerText || '';
    try{ await navigator.clipboard.writeText(template); $('copySupportBtn').textContent='복사 완료'; setTimeout(()=>$('copySupportBtn').textContent='문의 양식 복사',1200); }catch(e){ alert(template); }
  });
}
initPortalUi();
