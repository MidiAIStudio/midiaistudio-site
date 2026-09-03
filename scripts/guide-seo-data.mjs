/** Source of truth for product Guide SEO (pretty URLs + document meta). */
export const SITE = "https://midiaistudio.com";

export const GUIDE_SEO = {
  "getting-started": {
    title: "MidiAI Studio 시작하기 — 설치부터 첫 MIDI 변환",
    description:
      "MidiAI Studio 설치, Google 로그인, 무료 체험으로 첫 MIDI 변환까지. YouTube·음원 변환 전에 확인할 시작 가이드입니다.",
    h1: "MidiAI Studio 시작하기",
    summary:
      "Windows에 MidiAI Studio를 설치하고 로그인한 뒤, YouTube 또는 음원으로 첫 MIDI를 만들어 봅니다.",
    steps: [
      { name: "앱 설치", text: "다운로드 페이지에서 Installer를 받아 설치합니다." },
      { name: "로그인", text: "Google 계정으로 로그인하고 라이선스(또는 체험)를 확인합니다." },
      { name: "첫 변환", text: "Studio에서 YouTube 또는 오디오를 불러와 MIDI로 변환합니다." }
    ],
    faq: [
      { q: "체험판으로 시작할 수 있나요?", a: "네. 다운로드 후 로그인하면 체험 기능을 확인할 수 있습니다." }
    ],
    related: ["youtube-to-midi", "audio-to-midi"]
  },
  "youtube-to-midi": {
    title: "유튜브 MIDI 변환 가이드 | MidiAI Studio",
    description:
      "유튜브 음악·피아노 커버를 MIDI로 변환하는 방법. URL 검색, 구간 선택, AI 변환, 피아노롤 편집까지 MidiAI Studio 화면 기준으로 안내합니다.",
    h1: "유튜브 → MIDI 사용법 (MidiAI Studio)",
    summary:
      "YouTube URL을 붙여넣거나 검색한 뒤 웨이브폼에서 구간을 고르면 AI가 MIDI를 만듭니다. 피아노·솔로 연주 영상이 결과가 좋은 편입니다.",
    steps: [
      { name: "링크 입력", text: "Studio에 YouTube URL을 붙여넣거나 곡명으로 검색합니다." },
      { name: "구간 선택", text: "웨이브폼에서 변환할 구간을 지정하고 미리듣기로 확인합니다." },
      { name: "변환·편집", text: "MIDI를 생성한 뒤 MIDI Editor 피아노롤에서 노트를 다듬습니다." }
    ],
    faq: [
      { q: "모든 유튜브 영상이 MIDI로 변환되나요?", a: "공개 영상이 기본입니다. 비공개·연령 제한·지역 제한 영상은 실패할 수 있습니다." },
      { q: "유튜브 자동 채보에 어떤 영상이 유리한가요?", a: "피아노 커버, 솔로 연주처럼 음정이 뚜렷한 영상이 유리합니다." }
    ],
    related: ["midi-editor", "audio-to-midi"]
  },
  "audio-to-midi": {
    title: "음원·MP3를 MIDI로 변환하는 방법 | MidiAI Studio",
    description:
      "MP3, WAV 등 음원을 MIDI로 변환하는 방법. 파일 업로드, 구간·악기 선택, AI 채보 후 피아노롤 편집까지 안내합니다.",
    h1: "음원 → MIDI 사용법 (MidiAI Studio)",
    summary:
      "로컬 오디오(MP3·WAV 등)를 올려 AI가 노트를 추정합니다. 노이즈가 적고 피치가 뚜렷한 소스가 유리합니다.",
    steps: [
      { name: "파일 불러오기", text: "MP3, WAV 등 오디오를 Studio에 올립니다." },
      { name: "구간·악기", text: "미리듣기로 확인하고 출력 악기(피아노 등)를 고릅니다." },
      { name: "변환", text: "변환 후 MIDI Editor에서 노트를 수정합니다." }
    ],
    faq: [
      { q: "어떤 오디오 포맷을 지원하나요?", a: "일반적인 오디오 포맷(MP3, WAV 등)을 지원합니다. 버전별 목록은 패치노트를 확인하세요." }
    ],
    related: ["youtube-to-midi", "midi-editor"]
  },
  "pdf-to-midi": {
    title: "PDF → MIDI 사용 가이드 | MidiAI Studio",
    description:
      "악보 PDF를 인식해 편집 가능한 MIDI로 만드는 방법. 스캔 악보 팁, MIDI·악보 편집 연동을 안내합니다.",
    h1: "악보 PDF → MIDI 사용법 (MidiAI Studio)",
    summary:
      "인쇄·스캔 악보 PDF를 불러오면 음표를 MIDI로 매핑합니다. 기울기·해상도가 좋을수록 인식이 안정적입니다.",
    steps: [
      { name: "PDF 열기", text: "악보 PDF를 불러옵니다." },
      { name: "인식", text: "페이지를 분석해 음표를 MIDI로 매핑합니다." },
      { name: "보정", text: "MIDI Editor·Score Editor에서 오류를 수정합니다." }
    ],
    faq: [
      { q: "스캔 악보도 되나요?", a: "가능하지만 해상도와 대비가 좋을수록 인식률이 높습니다." }
    ],
    related: ["score-editor", "midi-editor"]
  },
  "midi-editor": {
    title: "MIDI 편집 및 피아노롤 사용법 | MidiAI Studio",
    description:
      "변환된 MIDI를 멀티트랙 피아노롤에서 편집하는 방법. 노트, 벨로시티, 악기 변경, 양자화까지 MidiAI Studio MIDI 에디터 가이드입니다.",
    h1: "MIDI 편집·피아노롤 사용법 (MidiAI Studio)",
    summary:
      "변환 결과를 피아노롤에서 다듬습니다. 트랙별 악기 변경, 노트 길이·벨로시티, 양자화를 지원합니다.",
    steps: [
      { name: "MIDI 열기", text: "변환 결과 또는 라이브러리 MIDI를 엽니다." },
      { name: "노트 편집", text: "피치·길이·벨로시티를 조정하고 악기를 바꿉니다." },
      { name: "저장·내보내기", text: "저장하거나 악보(PDF·MusicXML)로 내보냅니다." }
    ],
    faq: [
      { q: "실행취소가 되나요?", a: "네. 일반적인 편집 작업에 실행취소/다시실행을 지원합니다." }
    ],
    related: ["score-editor", "library"]
  },
  "score-editor": {
    title: "악보 편집기 사용법 | MidiAI Studio",
    description:
      "변환된 악보를 페이지·타임라인에서 수정하는 방법. 음표 속성과 AI 검토, PDF·MusicXML 내보내기를 안내합니다.",
    h1: "Score Editor로 악보 다듬기",
    summary: "MIDI로 만든 악보를 보면서 음표를 고치고 PDF·MusicXML로 내보냅니다.",
    steps: [
      { name: "악보 열기", text: "변환된 악보 또는 MusicXML을 엽니다." },
      { name: "편집", text: "음표를 선택해 피치·길이를 수정합니다." },
      { name: "검토", text: "AI 검토 제안으로 이상 음을 확인합니다." }
    ],
    faq: [
      { q: "PDF로 다시 저장되나요?", a: "네. 편집 후 PDF·MusicXML로 내보낼 수 있습니다." }
    ],
    related: ["pdf-to-midi", "midi-editor"]
  },
  "ai-assistant": {
    title: "AI 채보 보조 — AI Assistant | MidiAI Studio",
    description:
      "AI로 변환·편집한 MIDI를 검토하는 방법. 자동 채보 결과를 다듬을 때 쓰는 MidiAI Studio AI Assistant 가이드입니다.",
    h1: "AI Assistant 사용법 (MidiAI Studio)",
    summary: "변환·편집 중 AI 검토 제안으로 피치 점프·겹침 음을 빠르게 확인합니다. 최종 판단은 청취로 하세요.",
    steps: [
      { name: "제안 열기", text: "편집 화면에서 AI 검토를 실행합니다." },
      { name: "적용", text: "제안 항목을 확인한 뒤 필요한 것만 반영합니다." }
    ],
    faq: [
      { q: "AI 제안은 항상 정확한가요?", a: "제안은 보조입니다. 최종 판단은 연주·청취로 확인하세요." }
    ],
    related: ["score-editor", "midi-editor"]
  },
  library: {
    title: "라이브러리에서 MIDI 다시 열기 | MidiAI Studio",
    description: "변환·편집한 MIDI를 라이브러리에 모아 두고 다시 열어 작업을 이어가는 방법을 안내합니다.",
    h1: "라이브러리 사용법",
    summary: "작업물을 로컬 라이브러리에 저장하고 나중에 MIDI Editor로 다시 엽니다.",
    steps: [
      { name: "저장", text: "작업물을 라이브러리에 저장합니다." },
      { name: "다시 열기", text: "목록에서 선택해 Editor로 이어갑니다." }
    ],
    faq: [
      { q: "클라우드 동기화인가요?", a: "라이브러리는 앱 로컬 저장을 기준으로 합니다. 버전별 동작은 패치노트를 확인하세요." }
    ],
    related: ["midi-editor", "getting-started"]
  },
  license: {
    title: "라이선스 및 이용권 활성화 | MidiAI Studio",
    description:
      "구매한 이용권·라이선스는 구매에 사용한 Google 계정으로 앱에 로그인하면 연결됩니다. 기간 이용권, Lifetime, Credit 안내.",
    h1: "라이선스 및 이용권 활성화",
    summary:
      "구매한 이용권이나 라이선스는 구매에 사용한 Google 계정으로 앱에 로그인하면 연결됩니다.",
    steps: [
      {
        name: "구매",
        text: "구매 페이지에서 원하는 이용권·라이선스·Credit 상품을 구매합니다. 현재 판매 상품은 구매 페이지에서 확인하세요."
      },
      {
        name: "로그인",
        text: "MidiAI Studio 앱에서 구매에 사용한 Google 계정으로 로그인합니다."
      },
      {
        name: "확인",
        text: "계정에 연결된 현재 이용 상태를 앱의 계정/프로필 영역에서 확인합니다."
      }
    ],
    faq: [
      {
        q: "기기를 변경했는데 이용권이 인식되지 않아요.",
        a: "기기 변경 후 인증 문제가 발생하면 1:1 문의를 통해 확인을 요청해 주세요."
      }
    ],
    related: ["getting-started", "troubleshooting"]
  },
  troubleshooting: {
    title: "문제 해결 | MidiAI Studio",
    description:
      "설치 복구, 로그인 실패, MIDI 변환 오류를 해결하는 방법. 오류 메시지·앱 버전·로그를 1:1 문의에 첨부하는 팁을 안내합니다.",
    h1: "설치·변환·로그인 문제 해결",
    summary:
      "Installer 복구 후 오류 메시지·앱 버전을 확인하고, 필요하면 System Check 로그·스크린샷과 함께 1:1 문의에 첨부하세요.",
    steps: [
      { name: "Installer 복구", text: "Installer에서 Install/Update로 복구를 실행합니다." },
      {
        name: "오류 정보 확인",
        text: "화면에 표시된 오류 메시지, 발생 단계, 앱 버전을 확인합니다. 가능하면 System Check 결과도 저장합니다."
      },
      {
        name: "문의",
        text: "문제가 계속되면 1:1 문의에 오류 메시지, 스크린샷, 로그 파일(가능한 경우)을 첨부합니다."
      }
    ],
    faq: [
      { q: "로그인이 안 돼요", a: "인앱 브라우저가 아닌 Chrome/Edge에서 포털에 로그인해 보세요." }
    ],
    related: ["license", "getting-started"]
  }
};

export function canonicalForSlug(slug) {
  return `${SITE}/guide/${slug}/`;
}
