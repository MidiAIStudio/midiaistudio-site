/**
 * Public customer knowledge — verified from website guides / product CMS / purchase UI.
 * Windows app source is NOT in this repo; do not invent engine internals.
 */
function doc(partial) {
  return {
    visibility: 'public',
    locale: 'ko',
    status: 'production',
    active: true,
    verification: 'verified',
    priority: 2,
    keywords: [],
    steps: [],
    knownSymptoms: [],
    fixSteps: [],
    whenToEscalate: '',
    relatedGuideUrl: '',
    sourceType: 'guide',
    sourceRefs: [],
    updatedAt: '2026-09-03',
    ...partial
  };
}

module.exports = [
  doc({
    id: 'product-overview',
    title: 'MidiAI Studio란?',
    category: 'getting_started',
    priority: 1,
    keywords: ['midiai', '스튜디오', '제품', '뭐야', '소개', 'windows'],
    summary: 'Windows용 AI MIDI 변환·편집 소프트웨어입니다.',
    details:
      'MidiAI Studio는 YouTube·MP3/WAV를 피아노 MIDI로 변환하고, MIDI Editor에서 다듬고, AI Assistant로 정리·편곡하고, Score Editor에서 악보를 수정한 뒤 MIDI·MusicXML·PDF로 내보내는 설치형 Windows 프로그램입니다. 브라우저 일회성 도구가 아닙니다.',
    relatedGuideUrl: '/guide/getting-started/',
    sourceType: 'product',
    sourceRefs: ['product-cms SEED', 'site i18n product copy']
  }),
  doc({
    id: 'getting-started',
    title: '시작하기 · 설치와 첫 변환',
    category: 'getting_started',
    priority: 1,
    keywords: ['설치', '시작', '다운로드', '첫', '체험', 'install', '시작하기'],
    summary: 'Installer로 설치한 뒤 Google 로그인하고 Studio에서 첫 변환을 합니다.',
    details:
      '다운로드 페이지에서 MidiAI Installer.exe를 받아 설치합니다. 기본 설치 경로는 문서상 C:\\MidiAI입니다. Installer는 Install / Update로 설치·업데이트·복구를 수행합니다. 설치 후 Google 계정으로 로그인하고 라이선스 또는 체험을 확인한 뒤, Studio에서 YouTube 또는 오디오로 첫 MIDI 변환을 진행합니다.',
    steps: [
      '다운로드 페이지에서 Installer를 받아 설치합니다.',
      'Google 계정으로 로그인하고 라이선스(또는 체험)를 확인합니다.',
      'Studio에서 YouTube 또는 오디오를 불러와 MIDI로 변환합니다.'
    ],
    relatedGuideUrl: '/guide/getting-started/',
    sourceRefs: ['guide/getting-started', 'downloads.html copy']
  }),
  doc({
    id: 'youtube-to-midi',
    title: 'YouTube → MIDI 변환',
    category: 'youtube',
    priority: 1,
    keywords: ['youtube', '유튜브', 'yt', '링크', '변환', '채보', '피아노'],
    summary: 'Studio에서 YouTube 링크를 넣고 구간을 선택한 뒤 피아노 MIDI로 변환합니다.',
    details:
      '주력 경로는 YouTube 링크를 피아노 MIDI로 채보하는 것입니다. Studio에서 URL을 입력(또는 검색)하고 웨이브폼에서 구간을 고른 뒤 변환합니다. 공개 영상이 기본이며, 비공개·연령·지역 제한 영상은 변환이 실패할 수 있습니다. 피아노/솔로에 가까운 소스가 유리합니다.',
    steps: [
      'Studio를 엽니다.',
      'YouTube 링크를 입력하거나 검색합니다.',
      '웨이브폼에서 변환 구간을 선택합니다.',
      '변환을 실행해 MIDI를 받습니다.',
      '필요하면 MIDI Editor에서 다듬습니다.'
    ],
    knownSymptoms: ['변환 실패', '권한/지역 제한', '비공개 영상'],
    fixSteps: [
      '공개 영상 URL인지 확인합니다.',
      '최신 앱 버전인지 확인합니다.',
      '같은 URL을 다시 시도합니다.',
      '반복되면 로그·스크린샷을 첨부해 문의합니다.'
    ],
    whenToEscalate: '공개 URL인데도 반복 실패하거나 공식 안내로 해결되지 않으면 상담사 연결을 권합니다.',
    relatedGuideUrl: '/guide/youtube-to-midi/',
    sourceRefs: ['guide/youtube-to-midi', 'product-cms feature-studio']
  }),
  doc({
    id: 'audio-to-midi',
    title: 'Audio / MP3 → MIDI',
    category: 'audio',
    priority: 1,
    keywords: ['audio', '오디오', 'mp3', 'wav', '음원', '변환'],
    summary: 'MP3·WAV 등 오디오 파일을 Studio에서 MIDI로 변환합니다.',
    details:
      '오디오 파일을 Studio에 가져와 Audio → MIDI 변환을 실행합니다. 제품 기준으로 주력 입력은 MP3·WAV입니다. 노이즈가 적고 피치가 뚜렷한 소스가 유리합니다. 지원 형식의 세부 목록은 패치노트·앱 버전별로 달라질 수 있습니다.',
    steps: [
      'Studio에서 오디오 파일을 불러옵니다.',
      '필요하면 구간을 선택합니다.',
      'Audio → MIDI 변환을 실행합니다.'
    ],
    relatedGuideUrl: '/guide/audio-to-midi/',
    sourceRefs: ['guide/audio-to-midi', 'product-cms feature-studio']
  }),
  doc({
    id: 'band-orchestra-preview',
    title: 'Band / Orchestra Preview',
    category: 'conversion',
    status: 'preview',
    priority: 2,
    keywords: ['band', 'orchestra', '밴드', '오케스트라', 'preview', '스템', 'stem'],
    summary: 'Band / Orchestra는 Preview 기능입니다. 스템을 나눈 뒤 각 스템을 MIDI로 채보합니다.',
    details:
      'Band / Orchestra는 Preview로 제공됩니다. 스템을 분리한 뒤 각 스템을 MIDI로 채보하며, 곡에 따라 결과 품질이 달라질 수 있습니다. 정식 오케스트레이션 완성 모델처럼 설명하지 않습니다.',
    relatedGuideUrl: '/guide/',
    sourceType: 'product',
    sourceRefs: ['product-cms feature-studio']
  }),
  doc({
    id: 'pdf-to-midi-beta',
    title: 'PDF 악보 → MIDI (Beta)',
    category: 'pdf_to_midi',
    status: 'beta',
    priority: 1,
    keywords: ['pdf', '악보', 'omr', '스캔', 'score', 'beta'],
    summary: 'PDF 악보 인식은 Score Editor의 Beta 경로입니다. YouTube/오디오 채보와 동일하지 않습니다.',
    details:
      '오디오·YouTube 변환과 PDF 악보 가져오기는 경로가 다릅니다. Score Editor에서 PDF 악보를 가져오면 인식해 MIDI / MusicXML로 만듭니다. 인식 품질은 악보 상태(해상도·대비·기울기 등)에 따라 달라지며 Beta로 제공됩니다. 전문 출판급 OMR로 단정하지 않습니다.',
    steps: [
      'Score Editor를 엽니다.',
      'PDF 악보를 가져옵니다.',
      '인식 결과를 확인하고 MIDI/MusicXML로 이어갑니다.',
      '필요하면 Score Editor 또는 MIDI Editor에서 보정합니다.'
    ],
    relatedGuideUrl: '/guide/pdf-to-midi/',
    sourceRefs: ['product-cms PDF Beta', 'guide/pdf-to-midi']
  }),
  doc({
    id: 'midi-editor',
    title: 'MIDI Editor',
    category: 'midi_editor',
    priority: 1,
    keywords: ['midi editor', '미디 편집', '피아노롤', 'piano roll', '양자화', '벨로시티', '악기'],
    summary: '변환된 MIDI를 멀티트랙 피아노롤에서 편집·재생합니다.',
    details:
      'MIDI Editor는 노트 한두 개만 고치는 화면이 아닙니다. 피아노 롤에서 멀티트랙을 다루고, 앱 안에서 바로 재생하며 양자화·이조·템포·벨로시티를 조정합니다. GM 악기·Mixer/CC 편집을 지원한다는 제품 설명이 있습니다. Undo/Redo 등 편집 조작은 MIDI Editor 가이드를 참고하세요.',
    relatedGuideUrl: '/guide/midi-editor/',
    sourceRefs: ['product-cms feature-midi', 'guide/midi-editor']
  }),
  doc({
    id: 'score-editor',
    title: 'Score Editor',
    category: 'score_editor',
    status: 'production',
    priority: 1,
    keywords: ['score editor', '스코어', '악보 편집', 'musicxml', '기보'],
    summary: '악보로 보고 기보를 수정한 뒤 MusicXML·PDF로 내보냅니다.',
    details:
      'Score Editor는 MIDI를 악보로 보기만 하는 화면이 아닙니다. 음표·쉼표, 이음줄, 강약, 가사 등을 앱 안에서 고친 뒤 MusicXML·PDF로 내보냅니다. 전문 출판 악보 편집기는 아니며, 첫 실행에 실험 안내가 있습니다. 카테고리상 계속 개선 중입니다.',
    relatedGuideUrl: '/guide/score-editor/',
    sourceRefs: ['product-cms feature-score-editor', 'guide/score-editor']
  }),
  doc({
    id: 'ai-assistant',
    title: 'AI Assistant',
    category: 'ai_assistant',
    priority: 1,
    keywords: ['ai assistant', '어시스턴트', 'cleanup', 'easy key', 'white keys', '편곡', '정리'],
    summary: '채보와 별개의 보정·편곡 도구입니다. Cleanup·Easy Key·Instrument Arrange 등이 있습니다.',
    details:
      'AI Assistant는 채보 신경망과는 다른 보정·편곡 도구입니다. MIDI를 정리하고(Cleanup·Humanize·Optimize·Verify), Easy Key / White Keys로 쉬운 조·흰건반 단순화를 돕고, Instrument Arrange로 특정 악기에서 치기 쉬운 파트로 다시 쓸 수 있습니다. 모든 곡을 원하는 악기로 자동 변환하는 기능은 아닙니다. 가이드의 피치 점프·겹침 검토 제안도 안내하며, 최종 판단은 청취로 하세요.',
    relatedGuideUrl: '/guide/ai-assistant/',
    sourceRefs: ['product-cms feature-assistant', 'guide/ai-assistant']
  }),
  doc({
    id: 'easy-key',
    title: 'Easy Key · White Keys',
    category: 'easy_key',
    priority: 2,
    keywords: ['easy key', 'white keys', '쉬운 조', '흰건반', '이조'],
    summary: '연주하기 쉬운 조·흰건반 단순화를 돕는 AI Assistant 기능입니다.',
    details:
      'Easy Key · White Keys는 AI Assistant의 기능으로, 쉬운 조 선택과 흰건반 중심 단순화를 돕습니다. 모든 곡을 자동으로 특정 악기에 맞게 바꾸는 만능 변환이 아닙니다.',
    relatedGuideUrl: '/guide/ai-assistant/',
    sourceType: 'product',
    sourceRefs: ['product-cms feature-assistant']
  }),
  doc({
    id: 'library',
    title: 'Library',
    category: 'library',
    priority: 2,
    keywords: ['library', '라이브러리', '저장', '다시 열기', '파일 위치'],
    summary: '로컬 기준으로 프로젝트를 다시 열어 편집기로 이어갑니다. 클라우드 동기화가 아닙니다.',
    details:
      'Library는 변환·편집한 결과를 다시 열어 MIDI Editor / Score Editor로 이어가는 허브입니다. 공식 가이드 기준으로 로컬 저장이며 클라우드 동기화가 아닙니다. 단순 폴더 브라우저만은 아닙니다.',
    relatedGuideUrl: '/guide/library/',
    sourceRefs: ['guide/library', 'product copy']
  }),
  doc({
    id: 'soundpack-playback',
    title: '재생 · 고품질 사운드팩',
    category: 'soundpack',
    priority: 2,
    keywords: ['사운드팩', 'soundpack', '고품질', '재생', 'playback', '루프'],
    summary: '앱 안에서 MIDI를 재생하며, 고품질 사운드팩은 선택 설치입니다.',
    details:
      '앱 안에서 MIDI를 바로 재생하고 선택 구간·반복 재생을 사용할 수 있습니다. 고품질 사운드팩은 선택 설치입니다. 사운드팩이 없으면 기본 재생 경로를 사용합니다.',
    relatedGuideUrl: '/guide/midi-editor/',
    sourceType: 'product',
    sourceRefs: ['product-cms playback/soundpack copy']
  }),
  doc({
    id: 'export-formats',
    title: '내보내기 형식',
    category: 'export',
    priority: 2,
    keywords: ['export', '내보내기', 'musicxml', 'pdf', 'midi', '저장'],
    summary: '제품이 안내하는 주요 내보내기는 MIDI, MusicXML, PDF, Score project입니다.',
    details:
      '제품 설명 기준 주요 출력은 MIDI · MusicXML · PDF · Score project입니다. MIDI Editor / Score Editor 가이드에서 PDF·MusicXML 내보내기를 안내합니다. 지원하지 않는 형식을 추측해 추가하지 마세요.',
    relatedGuideUrl: '/guide/score-editor/',
    sourceType: 'product',
    sourceRefs: ['product-cms export list', 'guide/midi-editor', 'guide/score-editor']
  }),
  doc({
    id: 'input-formats',
    title: '입력 형식',
    category: 'conversion',
    priority: 2,
    keywords: ['입력', '지원 형식', 'format', 'flac', '파일'],
    summary: '주력 입력은 YouTube URL과 MP3·WAV입니다. PDF 악보는 Score Editor Beta 경로입니다.',
    details:
      '제품 기준 주력 입력은 YouTube 링크와 MP3·WAV입니다. PDF 악보는 Score Editor의 Beta 인식 경로입니다. SEO 문서에 FLAC 등이 언급될 수 있으나, 앱 버전별 지원 목록은 패치노트·앱 안내를 우선합니다.',
    sourceType: 'product',
    sourceRefs: ['product-cms', 'guide/audio-to-midi']
  }),
  doc({
    id: 'credits',
    title: '크레딧',
    category: 'purchase',
    priority: 1,
    keywords: ['크레딧', 'credit', '포인트', '충전', '차감', '잔액', '횟수'],
    summary: 'AI 변환 이용 횟수 단위입니다. 일반적으로 1회 변환 = 1 크레딧입니다.',
    details:
      '크레딧은 YouTube·Audio·PDF 등 AI 변환을 실행할 때 쓰는 이용 횟수 단위입니다. 일반적으로 AI 변환 1회에 크레딧 1이 차감됩니다. 기간 Full·Lifetime Full처럼 AI 변환이 무제한인 이용권은 크레딧이 차감되지 않습니다. 팩 단위 충전은 구매 페이지에서 가능합니다. 개인 잔액·결제 내역은 계정에서 확인하거나 상담사에게 문의하세요. 지원 AI는 개인 잔액을 조회·추측하지 않습니다.',
    relatedGuideUrl: '/purchase.html',
    sourceType: 'product',
    sourceRefs: ['purchase/credit UI', 'supportAi credits passage']
  }),
  doc({
    id: 'license-products',
    title: '라이선스 · Trial · Pass · Lifetime',
    category: 'license',
    priority: 1,
    keywords: ['라이선스', 'lifetime', 'trial', '체험', 'pass', '기간', '구매', '이용권'],
    summary: 'Google 로그인으로 라이선스를 연결합니다. Trial·기간 Full·Lifetime Full 상품이 있습니다.',
    details:
      '구매 후 앱에서 Google 계정으로 로그인하면 라이선스가 연결됩니다. Trial(체험)은 다운로드 후 로그인으로 확인할 수 있으며, 구매 페이지 안내상 MIDI 편집·AI 체험이 가능하고 변환·내보내기에 길이 제한(최대 1분)이 있습니다. 기간 Full 이용권과 Lifetime Full은 AI 변환 무제한·Full 기능을 제공하며 자동결제가 없다는 안내가 있습니다. Lifetime은 영구 Full로 안내됩니다. 실제 가격·판매 상태는 구매 페이지의 현재 상품 데이터를 따릅니다(지식에 가격을 고정하지 않음).',
    relatedGuideUrl: '/guide/license/',
    sourceType: 'product',
    sourceRefs: ['guide/license', 'purchase UI / storefront copy']
  }),
  doc({
    id: 'installation-update',
    title: '설치 · 업데이트 · 복구',
    category: 'installation',
    priority: 1,
    keywords: ['설치', '업데이트', 'update', 'installer', '복구', '다운로드'],
    summary: '공식 Installer의 Install/Update로 설치·업데이트·복구합니다.',
    details:
      '공식 다운로드는 MidiAI Installer.exe입니다. Installer · Updater · Runtime Manager 역할을 하며, 한 버튼 Install/Update로 설치·업데이트·복구를 진행합니다. 파이프라인은 Core → Media → Library → Runtime → Check로 안내됩니다. 문제 시 Installer에서 복구를 실행하고 System Check 결과를 저장해 1:1 문의에 첨부합니다.',
    steps: [
      '다운로드 페이지에서 최신 Installer를 받습니다.',
      'Install/Update를 실행합니다.',
      '문제가 있으면 System Check 로그를 저장합니다.',
      '필요 시 1:1 문의에 로그·버전·HWID를 첨부합니다.'
    ],
    relatedGuideUrl: '/guide/troubleshooting/',
    sourceRefs: ['downloads.html', 'guide/troubleshooting']
  }),
  doc({
    id: 'troubleshooting-login',
    title: '로그인 문제',
    category: 'troubleshooting',
    priority: 2,
    keywords: ['로그인', 'login', 'google', '인앱', '브라우저'],
    summary: '포털 로그인은 Chrome/Edge를 권장합니다. 인앱 브라우저는 비권장입니다.',
    details:
      '로그인이 안 될 때는 인앱 브라우저가 아닌 Chrome 또는 Edge에서 포털에 로그인해 보세요. 앱 라이선스도 Google 계정 연동을 사용합니다.',
    knownSymptoms: ['로그인이 안 돼요', '로그인 실패'],
    fixSteps: [
      'Chrome 또는 Edge에서 midiaistudio.com에 로그인합니다.',
      '팝업/쿠키 차단을 확인합니다.',
      '앱에서도 동일 Google 계정으로 로그인했는지 확인합니다.'
    ],
    whenToEscalate: '동일 계정으로도 반복 실패하면 스크린샷을 첨부해 상담사 연결을 권합니다.',
    relatedGuideUrl: '/guide/troubleshooting/',
    sourceRefs: ['guide/troubleshooting FAQ']
  }),
  doc({
    id: 'troubleshooting-general',
    title: '일반 문제 해결',
    category: 'troubleshooting',
    priority: 2,
    keywords: ['오류', '에러', '문제', '안됨', '실패', 'troubleshooting'],
    summary: 'Installer 복구 → System Check 로그 → 버전·HWID와 함께 1:1 문의.',
    details:
      '일반적인 설치·변환·로그인 문제는 Installer에서 Install/Update 복구를 실행하고, System Check 결과를 저장한 뒤, 1:1 문의에 로그·앱 버전·HWID를 첨부하면 해결이 빨라집니다.',
    steps: [
      'Installer에서 Install/Update로 복구를 실행합니다.',
      'System Check 결과를 저장합니다.',
      '1:1 문의에 로그·HWID·버전을 첨부합니다.'
    ],
    whenToEscalate: '복구와 재시도 후에도 동일하면 상담사 연결을 권합니다.',
    relatedGuideUrl: '/guide/troubleshooting/',
    sourceRefs: ['guide/troubleshooting']
  }),
  doc({
    id: 'youtube-access-fail',
    title: 'YouTube 변환 실패 · 접근 제한',
    category: 'troubleshooting',
    priority: 1,
    keywords: ['403', 'forbidden', '비공개', '지역', '연령', '유튜브 실패'],
    summary: '비공개·연령·지역 제한 영상은 변환이 실패할 수 있습니다.',
    details:
      'YouTube 변환은 공개 영상을 기본으로 합니다. 비공개·연령 제한·지역 제한 영상은 변환이 실패할 수 있습니다. 링크 유효성과 최신 앱 버전을 확인한 뒤 재시도하세요. Windows 앱 내부의 구체적 HTTP 코드 매핑은 이 웹 저장소에 없으므로, 특정 엔진 오류를 단정하지 않습니다.',
    knownSymptoms: ['변환 실패', '권한 제한', '지역 제한', 'Forbidden', '403'],
    fixSteps: [
      '공개 영상인지 확인합니다.',
      '다른 브라우저에서 URL이 재생되는지 확인합니다.',
      '앱을 최신으로 업데이트합니다.',
      '실패가 반복되면 로그·URL·스크린샷을 첨부해 문의합니다.'
    ],
    whenToEscalate: '공개 URL인데도 반복 실패하면 상담사 연결을 권합니다.',
    relatedGuideUrl: '/guide/youtube-to-midi/',
    sourceRefs: ['guide/youtube-to-midi', 'supportAi youtube passage']
  }),
  doc({
    id: 'account-support',
    title: '계정 · 문의 · 알림',
    category: 'support',
    priority: 2,
    keywords: ['문의', '상담', '나의 문의', '알림', '계정', 'support'],
    summary: 'Google 로그인 후 계정·나의 문의·사이트 상담 위젯을 이용합니다.',
    details:
      '사이트에서 Google 로그인하면 내 계정(라이선스·크레딧), 나의 문의, 알림을 확인할 수 있습니다. 1:1 문의와 플로팅 상담은 비공개이며 AI 안내 후 상담사 연결이 가능합니다. 개인 만료일·잔액·결제 성공 여부는 지식으로 추측하지 않고 계정 화면 또는 상담사 확인이 필요합니다.',
    relatedGuideUrl: '/my-tickets.html',
    sourceType: 'structured_data',
    sourceRefs: ['support.html', 'my-tickets', 'support-chat']
  }),
  doc({
    id: 'personal-account-boundary',
    title: '개인 계정 상태 (AI 한계)',
    category: 'account',
    priority: 1,
    keywords: ['내 라이선스', '언제 끝', '잔액', '제 결제', '만료', 'my license'],
    summary: '개인 계정·결제·만료일·잔액은 지원 AI가 추측하지 않습니다.',
    details:
      '개인 라이선스 만료일, 결제 성공 여부, 크레딧 잔액, 환불 진행 상태는 공식 문서만으로 확인할 수 없습니다. 계정 페이지를 확인하거나 상담사에게 연결해야 합니다. AI는 환불 승인·라이선스 지급을 하지 않습니다.',
    whenToEscalate: '개인 계정/결제/잔액 질문은 상담사 연결을 제안합니다.',
    sourceType: 'structured_data',
    sourceRefs: ['supportAi PERSONAL policy']
  })
];
