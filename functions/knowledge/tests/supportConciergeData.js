/**
 * Generalist Support concierge case bank (semantic assertions, not exact wording).
 * Product features listed here must exist in verified Knowledge / app docs.
 */
'use strict';

/** Verified product feature map → expected knowledge id family */
const FEATURE_MAP = [
  { id: 'install', topic: 'install', idRe: /getting-started-install|troubleshooting/, concepts: ['설치', 'installer'] },
  { id: 'login_license', topic: 'license', idRe: /license|trial|credits/, concepts: ['로그인', '이용권'] },
  { id: 'studio', topic: 'studio', idRe: /nav-workspace|youtube|audio|studio/, concepts: ['Studio'] },
  { id: 'youtube', topic: 'youtube', idRe: /youtube/, concepts: ['YouTube', '변환'] },
  { id: 'audio', topic: 'audio', idRe: /audio-to-midi/, concepts: ['오디오', 'MIDI'] },
  { id: 'preview', topic: 'preview', idRe: /studio-preview/, concepts: ['미리듣기', '구간'] },
  { id: 'download_403', topic: 'error_403', idRe: /youtube-fetch-errors|conversion-generic/, concepts: ['403'] },
  { id: 'midi_editor', topic: 'midi_editor', idRe: /midi-editor/, concepts: ['MIDI Editor'] },
  { id: 'note_edit', topic: 'note_edit', idRe: /midi-editor-note-edit|midi-editor/, concepts: ['노트'] },
  { id: 'multi_select', topic: 'multi_select', idRe: /midi-editor-note-edit/, concepts: ['다중선택', '노트'] },
  { id: 'pitch', topic: 'pitch', idRe: /midi-editor-note-edit/, concepts: ['피치', '음높이'] },
  { id: 'velocity', topic: 'velocity', idRe: /midi-editor-velocity/, concepts: ['벨로시티'] },
  { id: 'tempo', topic: 'tempo', idRe: /midi-editor-tempo/, concepts: ['템포', 'BPM'] },
  { id: 'instrument', topic: 'instrument', idRe: /midi-editor-instrument/, concepts: ['악기'] },
  { id: 'undo', topic: 'undo', idRe: /midi-editor-undo-save/, concepts: ['undo', '되돌리기'] },
  { id: 'save', topic: 'save', idRe: /midi-editor-undo-save|library/, concepts: ['저장'] },
  { id: 'ai_assistant', topic: 'ai_assistant', idRe: /ai-assistant/, concepts: ['AI Assistant'] },
  { id: 'analyze', topic: 'analyze', idRe: /ai-assistant/, concepts: ['Analyze', '분석'] },
  { id: 'cleanup', topic: 'cleanup', idRe: /ai-assistant/, concepts: ['Cleanup', '정리'] },
  { id: 'humanize', topic: 'humanize', idRe: /ai-assistant/, concepts: ['Humanize'] },
  { id: 'arrange', topic: 'arrange', idRe: /ai-assistant/, concepts: ['Arrange', '편곡'] },
  { id: 'easy_key', topic: 'easy_key', idRe: /easier-key|ai-assistant/, concepts: ['Easier Key', '쉬운'] },
  { id: 'score', topic: 'score', idRe: /score-editor/, concepts: ['Score Editor', '악보'] },
  { id: 'pdf_export', topic: 'pdf_export', idRe: /score-editor|export/, concepts: ['PDF', '악보'] },
  { id: 'musicxml', topic: 'musicxml', idRe: /export|score/, concepts: ['MusicXML'] },
  { id: 'pdf_to_midi', topic: 'pdf_to_midi', idRe: /pdf-to-midi/, concepts: ['PDF', 'MIDI'] },
  { id: 'library', topic: 'library', idRe: /library/, concepts: ['Library'] },
  { id: 'soundpack', topic: 'soundpack', idRe: /high-quality-sound/, concepts: ['사운드팩', '고품질'] },
  { id: 'playback', topic: 'playback', idRe: /midi-editor-playback|studio-preview-playback/, concepts: ['재생'] },
  { id: 'export', topic: 'export', idRe: /export-formats/, concepts: ['내보내기', 'export'] },
  { id: 'trial', topic: 'trial', idRe: /trial-limits/, concepts: ['체험', 'Trial'] },
  { id: 'credits', topic: 'credits', idRe: /credits-usage/, concepts: ['크레딧'] },
  { id: 'lifetime', topic: 'lifetime', idRe: /license-full-lifetime/, concepts: ['Lifetime', '이용권'] },
  { id: 'patch', topic: 'patch', idRe: /support-contact|getting-started|troubleshooting|nav/, concepts: ['패치', '업데이트'] },
  { id: 'repair', topic: 'repair', idRe: /getting-started-install|troubleshooting/, concepts: ['repair', '설치'] }
];

/** Question templates per feature (intent diversity) */
const QUESTION_TEMPLATES = {
  what: ['{label} 뭐야?', '{label}이 뭔가요', '{label} 설명해줘'],
  exists: ['{label} 있어?', '{label} 되나', '{label} 기능 있나요'],
  where: ['{label} 어디있어?', '{label} 메뉴 어디', '{label} 위치'],
  how: ['{label} 어떻게 써?', '{label} 사용법', '{label} 방법 알려줘'],
  trouble: ['{label} 안돼', '{label} 오류', '{label}이 안됨'],
  colloquial: [] // filled per feature below
};

/** Colloquial / typo / synonym USER questions with expected retrieval family */
const USER_QUESTIONS = [
  // arrange / AI
  { q: '편곡기능있어?', idRe: /ai-assistant/, intent: 'exists', topic: 'arrange' },
  { q: '편곡 해주는거', idRe: /ai-assistant/, intent: 'exists', topic: 'arrange' },
  { q: '악기 나눠주는거', idRe: /ai-assistant|midi-editor/, intent: 'exists', topic: 'arrange' },
  { q: '편곡 같은거 되나', idRe: /ai-assistant/, intent: 'exists', topic: 'arrange' },
  { q: '그거 악기 나누는 기능', idRe: /ai-assistant|midi-editor/, intent: 'exists', topic: 'arrange' },
  { q: 'Arrange 어디', idRe: /ai-assistant/, intent: 'where', topic: 'arrange' },
  // easy key
  { q: '쉬운키 기능은 뭐야?', idRe: /easier-key|ai-assistant/, intent: 'what', topic: 'easy_key' },
  { q: '이지키', idRe: /easier-key|ai-assistant/, intent: 'exists', topic: 'easy_key' },
  { q: '키 쉽게 바꾸는거', idRe: /easier-key|ai-assistant/, intent: 'exists', topic: 'easy_key' },
  { q: '쉬운 키 어디있어', idRe: /easier-key|ai-assistant/, intent: 'where', topic: 'easy_key' },
  { q: 'easy key 사용법', idRe: /easier-key|ai-assistant/, intent: 'how', topic: 'easy_key' },
  // cleanup / humanize / analyze
  { q: '노트 정리', idRe: /ai-assistant/, intent: 'exists', topic: 'cleanup' },
  { q: '노트정리 좀', idRe: /ai-assistant/, intent: 'how', topic: 'cleanup' },
  { q: '클린업 뭐야', idRe: /ai-assistant/, intent: 'what', topic: 'cleanup' },
  { q: '사람처럼 연주하게 하는거', idRe: /ai-assistant/, intent: 'exists', topic: 'humanize' },
  { q: '사람처럼 연주', idRe: /ai-assistant/, intent: 'exists', topic: 'humanize' },
  { q: '휴머나이즈 있어?', idRe: /ai-assistant/, intent: 'exists', topic: 'humanize' },
  { q: 'Analyze 뭐야', idRe: /ai-assistant/, intent: 'what', topic: 'analyze' },
  { q: '분석 기능', idRe: /ai-assistant/, intent: 'exists', topic: 'analyze' },
  // tempo / velocity / notes
  { q: '템포 어디서 바꿔?', idRe: /tempo|midi-editor/, intent: 'where', topic: 'tempo' },
  { q: '템포느리게', idRe: /tempo|midi-editor/, intent: 'how', topic: 'tempo' },
  { q: '속도바꾸기', idRe: /tempo|midi-editor/, intent: 'how', topic: 'tempo' },
  { q: 'BPM 변경', idRe: /tempo|midi-editor/, intent: 'how', topic: 'tempo' },
  { q: 'velocity 조절', idRe: /velocity/, intent: 'how', topic: 'velocity' },
  { q: '벨로시티 어디', idRe: /velocity/, intent: 'where', topic: 'velocity' },
  { q: '노트 여러개 선택', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'multi_select' },
  { q: '다중선택', idRe: /midi-editor-note-edit/, intent: 'how', topic: 'multi_select' },
  { q: '노트 여러개 같이 옮기기', idRe: /midi-editor-note-edit/, intent: 'how', topic: 'multi_select' },
  { q: '피치 바꾸는법', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'pitch' },
  { q: 'undo 어떻게', idRe: /undo|midi-editor/, intent: 'how', topic: 'undo' },
  { q: '되돌리기', idRe: /undo|midi-editor/, intent: 'how', topic: 'undo' },
  { q: '트랙 악기 바꾸기', idRe: /instrument|midi-editor/, intent: 'how', topic: 'instrument' },
  { q: '미디편집', idRe: /midi-editor/, intent: 'how', topic: 'midi_editor' },
  { q: '미디 편집하려고', idRe: /midi-editor/, intent: 'how', topic: 'midi_editor' },
  // conversion
  { q: '유튜브 변환 방법', idRe: /youtube|audio|studio/i, intent: 'how', topic: 'youtube' },
  { q: '유튭 미디로', idRe: /youtube|audio|studio/i, intent: 'how', topic: 'youtube' },
  { q: '유튭 링크 넣으면돼?', idRe: /youtube|audio|studio/i, intent: 'how', topic: 'youtube' },
  { q: '노래를 피아노로', idRe: /audio|youtube|piano|midi|conversion/i, intent: 'how', topic: 'conversion' },
  { q: '유튜브 음악 미디로', idRe: /youtube|audio|studio/i, intent: 'how', topic: 'youtube' },
  { q: '오디오 midi 변환', idRe: /audio/, intent: 'how', topic: 'audio' },
  { q: '변환안돼', idRe: /youtube|audio|conversion|studio/i, intent: 'trouble', topic: 'conversion' },
  { q: '변환 느려', idRe: /conversion|youtube|audio|progress/i, intent: 'trouble', topic: 'conversion' },
  { q: '예액변환 등록', idRe: /.|./, intent: 'how', topic: 'scheduled', soft: true },
  { q: '예약변환 있어?', idRe: /.|./, intent: 'exists', topic: 'scheduled', soft: true },
  { q: '미리듣기 구간', idRe: /studio-preview/, intent: 'how', topic: 'preview' },
  { q: '웨이브폼', idRe: /studio-preview/, intent: 'what', topic: 'preview' },
  { q: '유튜브 403', idRe: /youtube-fetch|conversion/, intent: 'trouble', topic: 'error_403' },
  // score / pdf / library
  { q: 'score editor 뭐야', idRe: /score-editor/, intent: 'what', topic: 'score' },
  { q: '악보뽑기', idRe: /pdf|score|export/i, intent: 'how', topic: 'pdf_export' },
  { q: '악보 pdf로 뽑기', idRe: /pdf|score|export/i, intent: 'how', topic: 'pdf_export' },
  { q: 'pdf저장', idRe: /pdf|score|export/i, intent: 'how', topic: 'pdf_export' },
  { q: 'musicxml 내보내기', idRe: /export|score/, intent: 'how', topic: 'musicxml' },
  { q: 'pdf를 midi로', idRe: /pdf-to-midi/, intent: 'how', topic: 'pdf_to_midi' },
  { q: '라이브러리에서 다시 열기', idRe: /library/, intent: 'how', topic: 'library' },
  { q: '저장한거 다시 열기', idRe: /library|undo-save/, intent: 'how', topic: 'library' },
  // sound
  { q: '소리가 별로야', idRe: /high-quality-sound/, intent: 'trouble', topic: 'soundpack' },
  { q: '소리가 이상해', idRe: /high-quality-sound/, intent: 'trouble', topic: 'soundpack' },
  { q: '음원 바꾸는거', idRe: /high-quality-sound/, intent: 'how', topic: 'soundpack' },
  { q: '사운드팩 켜기', idRe: /high-quality-sound/, intent: 'how', topic: 'soundpack' },
  // license / trial / credits
  { q: '체험판 제한', idRe: /trial/, intent: 'what', topic: 'trial' },
  { q: '라이프타임', idRe: /license-full-lifetime/, intent: 'what', topic: 'lifetime' },
  { q: 'Lifetime 뭐야', idRe: /license-full-lifetime/, intent: 'what', topic: 'lifetime' },
  { q: '패스 이용권', idRe: /license-full-lifetime/, intent: 'what', topic: 'lifetime' },
  { q: '크레딧 소모', idRe: /credits/, intent: 'what', topic: 'credits' },
  // install / nav
  { q: '설치 방법', idRe: /getting-started-install/, intent: 'how', topic: 'install' },
  { q: 'installer repair', idRe: /getting-started-install|troubleshooting/, intent: 'how', topic: 'repair' },
  { q: 'uninstall', idRe: /getting-started-install/, intent: 'how', topic: 'install' },
  { q: '로그인 안돼', idRe: /license|trial|support|getting-started/, intent: 'trouble', topic: 'login' },
  { q: '스튜디오 어디서 시작', idRe: /nav-workspace|youtube|audio|studio/, intent: 'where', topic: 'studio' },
  { q: '패치 노트', idRe: /support|getting-started|troubleshooting|nav|patch/i, intent: 'what', topic: 'patch', soft: true },
  // incomplete / short
  { q: '템포?', idRe: /tempo|midi-editor/, intent: 'general', topic: 'tempo' },
  { q: '편곡?', idRe: /ai-assistant/, intent: 'exists', topic: 'arrange' },
  { q: '쉬운키?', idRe: /easier-key|ai-assistant/, intent: 'exists', topic: 'easy_key' },
  { q: '403떠', idRe: /youtube-fetch|conversion/, intent: 'trouble', topic: 'error_403' },
  { q: '미디에디터', idRe: /midi-editor/, intent: 'what', topic: 'midi_editor' },
  { q: '재생정지', idRe: /playback|preview|midi-editor/, intent: 'how', topic: 'playback', soft: true },
  { q: '내보내기 포맷', idRe: /export/, intent: 'what', topic: 'export' },
  // more domain coverage
  { q: 'AI Assistant 뭐야', idRe: /ai-assistant/, intent: 'what', topic: 'ai_assistant' },
  { q: 'Cleanup 어디', idRe: /ai-assistant/, intent: 'where', topic: 'cleanup' },
  { q: 'Humanize 방법', idRe: /ai-assistant/, intent: 'how', topic: 'humanize' },
  { q: '악보 편집', idRe: /score-editor/, intent: 'how', topic: 'score' },
  { q: '음높이 올리기', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'pitch' },
  { q: '노트 길이 조절', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'note_edit' },
  { q: '줌인 어떻게', idRe: /playback|midi-editor/, intent: 'how', topic: 'playback', soft: true },
  { q: '밴드 미리듣기', idRe: /band|orchestra|preview|studio/i, intent: 'what', topic: 'preview', soft: true },
  { q: '변환 진행 중 피아노', idRe: /conversion-progress|piano|youtube|audio/i, intent: 'what', topic: 'conversion', soft: true },
  { q: '기기변경 후 로그인', idRe: /license|support/, intent: 'trouble', topic: 'license' },
  { q: '크레딧이 뭐야', idRe: /credits/, intent: 'what', topic: 'credits' },
  { q: '체험은 몇번', idRe: /trial/, intent: 'what', topic: 'trial' },
  { q: 'mp3를 미디로', idRe: /audio/, intent: 'how', topic: 'audio' },
  { q: 'wav 변환', idRe: /audio/, intent: 'how', topic: 'audio' },
  { q: '미리듣기 초기화', idRe: /studio-preview/, intent: 'how', topic: 'preview' },
  { q: '고품질 음원 설치', idRe: /high-quality-sound/, intent: 'how', topic: 'soundpack' },
  { q: 'hq 음원', idRe: /high-quality-sound/, intent: 'exists', topic: 'soundpack' },
  { q: '지원문의 어디', idRe: /support-contact|support/, intent: 'where', topic: 'support', soft: true },
  { q: '오류 로그', idRe: /troubleshooting|support|youtube-fetch|conversion/, intent: 'how', topic: 'error', soft: true },
  { q: '성능 느림', idRe: /troubleshooting|conversion|getting-started/, intent: 'trouble', topic: 'perf', soft: true },
  { q: '파일 저장 위치', idRe: /library|undo-save|getting-started/, intent: 'where', topic: 'save', soft: true },
  { q: 'redo 있어?', idRe: /undo|midi-editor/, intent: 'exists', topic: 'undo' },
  { q: '악기 소리 안좋음', idRe: /high-quality-sound/, intent: 'trouble', topic: 'soundpack' },
  { q: '변환범위 설정', idRe: /studio-preview|youtube|audio/, intent: 'how', topic: 'preview' },
  { q: '다운로드 실패', idRe: /youtube-fetch|conversion|getting-started/, intent: 'trouble', topic: 'error_403' },
  { q: 'pdf 타임아웃', idRe: /pdf-timeout|pdf-to-midi/, intent: 'trouble', topic: 'pdf_to_midi' },
  { q: 'workspace 전환', idRe: /nav-workspace/, intent: 'how', topic: 'studio', soft: true },
  { q: '피아노롤에서 삭제', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'note_edit' },
  { q: '재생 배율', idRe: /playback|tempo|midi-editor/, intent: 'how', topic: 'playback', soft: true },
  { q: 'MusicXML 저장', idRe: /export|score/, intent: 'how', topic: 'musicxml' },
  { q: 'MIDI 파일 내보내기', idRe: /export/, intent: 'how', topic: 'export' },
  { q: '이용권 종류', idRe: /license-full-lifetime/, intent: 'what', topic: 'lifetime' },
  { q: '30일 패스', idRe: /license-full-lifetime/, intent: 'what', topic: 'lifetime' },
  { q: '자동결제 있어?', idRe: /license-full-lifetime|credits/, intent: 'exists', topic: 'lifetime' },
  { q: '설치파일 어디', idRe: /getting-started-install/, intent: 'where', topic: 'install' },
  { q: '업데이트 방법', idRe: /getting-started-install|troubleshooting|support/, intent: 'how', topic: 'patch', soft: true },
  { q: 'Repair로 고치기', idRe: /getting-started-install|troubleshooting/, intent: 'how', topic: 'repair' },
  { q: 'AI 어시스턴트 메뉴', idRe: /ai-assistant/, intent: 'where', topic: 'ai_assistant' },
  { q: '가이드 편곡', idRe: /ai-assistant/, intent: 'exists', topic: 'arrange' },
  { q: '쉬운조 추천', idRe: /easier-key|ai-assistant/, intent: 'what', topic: 'easy_key' },
  { q: '겹친 노트 정리', idRe: /ai-assistant/, intent: 'how', topic: 'cleanup' },
  { q: '연주감 살리기', idRe: /ai-assistant/, intent: 'how', topic: 'humanize', soft: true },
  { q: '유튜브만 변환', idRe: /youtube/, intent: 'how', topic: 'youtube' },
  { q: '로컬 오디오만', idRe: /audio/, intent: 'how', topic: 'audio' },
  { q: '구간만 변환', idRe: /studio-preview|youtube|audio/, intent: 'how', topic: 'preview' },
  { q: '403 원인', idRe: /youtube-fetch/, intent: 'trouble', topic: 'error_403' },
  { q: '404 떠', idRe: /youtube-fetch|conversion|troubleshooting/, intent: 'trouble', topic: 'error', soft: true },
  { q: '변환 실패했어', idRe: /conversion|youtube|audio|pdf/, intent: 'trouble', topic: 'conversion' },
  { q: '저장 후 다시열어', idRe: /library|undo-save/, intent: 'how', topic: 'library' },
  { q: 'soundpack 켜짐?', idRe: /high-quality-sound/, intent: 'exists', topic: 'soundpack' },
  { q: 'Use high-quality sounds', idRe: /high-quality-sound/, intent: 'how', topic: 'soundpack' },
  { q: '노트 드래그', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'note_edit' },
  { q: '여러 노트 삭제', idRe: /midi-editor-note-edit|midi-editor/, intent: 'how', topic: 'multi_select' },
  { q: '프로젝트 BPM', idRe: /tempo|midi-editor/, intent: 'how', topic: 'tempo' },
  { q: '세기만 바꾸고싶어', idRe: /velocity/, intent: 'how', topic: 'velocity' },
  { q: '악보 PDF export', idRe: /score|export|pdf/i, intent: 'how', topic: 'pdf_export' },
  { q: 'PDF 인식', idRe: /pdf-to-midi/, intent: 'how', topic: 'pdf_to_midi' },
  { q: '스코어 에디터에서 수정', idRe: /score-editor/, intent: 'how', topic: 'score' },
  { q: '라이브러리 recent', idRe: /library/, intent: 'how', topic: 'library' },
  { q: '체험판 변환 제한', idRe: /trial/, intent: 'what', topic: 'trial' },
  { q: '크레딧 차감', idRe: /credits/, intent: 'what', topic: 'credits' },
  { q: '평생권 차이', idRe: /license-full-lifetime/, intent: 'compare', topic: 'lifetime' },
  { q: '시작하기 설치', idRe: /getting-started-install/, intent: 'how', topic: 'install' },
  { q: '작업공간 이동', idRe: /nav-workspace/, intent: 'how', topic: 'studio', soft: true },
  { q: '변환 후 편집', idRe: /midi-editor|ai-assistant|studio/, intent: 'how', topic: 'midi_editor', soft: true },
  { q: '피아노로 따는거', idRe: /audio|youtube|piano|midi|conversion/i, intent: 'how', topic: 'conversion', soft: true }
];

/** Multi-turn scenarios: expectFollow true/false/null; mustCarry when follow */
const MULTI_TURN_SCENARIOS = [
  {
    name: '편곡→어디→어떻게',
    turns: ['편곡기능있어?', '그거 어디있어?', '어떻게 써?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /편곡|arrange/i, /편곡|arrange|사용/i]
  },
  {
    name: '편곡→변환 switch',
    turns: ['편곡기능있어?', '변환방법알려줘'],
    expectFollow: [null, false],
    mustCarry: [null, /변환/]
  },
  {
    name: '쉬운키→원본→저장',
    turns: ['쉬운키가 뭐야', '원본은 바뀌어?', '저장은 어떻게해?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /쉬운|easy|키/i, /쉬운|easy|키|저장/i]
  },
  {
    name: '오류→유튜브→403→재시도',
    turns: ['오류나', '유튜브야', '403 떠', '재시도해도안됨'],
    expectFollow: [null, false, false, true],
    mustCarry: [null, null, null, /403|유튜브|오류/i]
  },
  {
    name: '소리→특정악기→사운드팩',
    turns: ['소리가 이상해', '특정 악기만 그래', '사운드팩 켰어'],
    expectFollow: [null, true, false],
    mustCarry: [null, /소리|사운드|음질|고품질/i, null]
  },
  {
    name: '미디편집→다중선택→같이옮김',
    turns: ['미디 편집하려고', '노트 여러개 잡았어', '같이 옮길 수 있어?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /미디|편집|노트/i, /미디|편집|노트|옮/i]
  },
  {
    name: '편곡→변환→유튜브',
    turns: ['편곡 기능 있어?', '변환 방법 알려줘', '유튜브로 할거야'],
    expectFollow: [null, false, false],
    mustCarry: [null, /변환/, /유튜브/]
  },
  {
    name: '예약변환→clarification',
    turns: ['예약변환 있어?', '아니 변환을 나중에 자동으로 하는거'],
    expectFollow: [null, true],
    mustCarry: [null, /예약|변환|자동/]
  },
  {
    name: '템포→어디→왜',
    turns: ['템포 바꾸고싶어', '어디있어?', '왜 전체가 바뀌어'],
    expectFollow: [null, true, true],
    mustCarry: [null, /템포/, /템포/]
  },
  {
    name: 'Cleanup→어떻게→되돌리기',
    turns: ['노트 정리 있어?', '어떻게 써?', '되돌리기는?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /노트|정리|cleanup/i, /노트|정리|cleanup|되돌/i]
  },
  {
    name: 'Humanize→어디→결과',
    turns: ['사람처럼 연주하게 하는거', '그거 어디', '적용하면 원본 남아?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /사람|연주|humanize|휴머/i, /사람|연주|humanize|원본/i]
  },
  {
    name: 'EasyKey→어디→undo',
    turns: ['이지키 뭐야', '메뉴 어디', '마음에 안들면?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /이지|쉬운|easy/i, /이지|쉬운|easy/i]
  },
  {
    name: 'PDF→MIDI→타임아웃',
    turns: ['pdf를 midi로', '안돼', '타임아웃 떠'],
    expectFollow: [null, true, false],
    mustCarry: [null, /pdf|midi/i, null]
  },
  {
    name: 'Library→다시열기→저장위치',
    turns: ['라이브러리에서 다시 열기', '그거 어떻게', '저장 위치는?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /라이브러리|다시/i, /라이브러리|저장/i]
  },
  {
    name: '사운드팩→설치→켜기',
    turns: ['고품질 음원 설치', '그다음엔?', '켜는 법'],
    expectFollow: [null, true, true],
    mustCarry: [null, /고품질|음원|사운드/i, /고품질|음원|사운드/i]
  },
  {
    name: '403→원인→로그',
    turns: ['유튜브 403', '왜그래', '로그 어떻게'],
    expectFollow: [null, true, true],
    mustCarry: [null, /403|유튜브/i, /403|유튜브|로그/i]
  },
  {
    name: 'velocity→어디→여러노트',
    turns: ['벨로시티 조절', '어디있어', '여러개 같이'],
    expectFollow: [null, true, true],
    mustCarry: [null, /벨로|velocity/i, /벨로|velocity/i]
  },
  {
    name: '악기→바꾸기→특정트랙',
    turns: ['트랙 악기 바꾸기', '어떻게', '특정트랙만'],
    expectFollow: [null, true, true],
    mustCarry: [null, /악기|트랙/i, /악기|트랙/i]
  },
  {
    name: '미리듣기→구간→초기화',
    turns: ['미리듣기 구간', '변경 방법', '초기화는?'],
    expectFollow: [null, true, true],
    mustCarry: [null, /미리듣|구간/i, /미리듣|구간|초기화/i]
  },
  {
    name: '설치→repair→uninstall',
    turns: ['설치 안돼', 'repair 해볼까', 'uninstall은?'],
    expectFollow: [null, false, false],
    mustCarry: [null, null, null]
  },
  {
    name: 'Lifetime→자동결제→구매페이지',
    turns: ['라이프타임 뭐야', '자동결제 있어?', '어디서 사'],
    expectFollow: [null, false, true],
    mustCarry: [null, null, /라이프|lifetime|이용권|구매/i]
  },
  {
    name: '체험→제한→크레딧',
    turns: ['체험판 제한', '몇번이야', '크레딧이랑 달라?'],
    expectFollow: [null, true, false],
    mustCarry: [null, /체험|trial/i, null]
  },
  {
    name: 'Score→PDF뽑기→MusicXML',
    turns: ['score editor 뭐야', 'pdf로 뽑기', 'musicxml도 돼?'],
    expectFollow: [null, false, false],
    mustCarry: [null, null, null]
  },
  {
    name: 'Arrange→설명→다른주제 tempo',
    turns: ['편곡 있어?', '자세히', '템포 변경 방법은?'],
    expectFollow: [null, true, false],
    mustCarry: [null, /편곡/, null]
  },
  {
    name: '변환실패→오디오→해결',
    turns: ['변환 실패했어', '오디오 파일이야', '해결 방법'],
    expectFollow: [null, false, true],
    mustCarry: [null, null, /변환|오디오|실패/i]
  },
  {
    name: '저장→undo→redo',
    turns: ['저장 어떻게', 'undo는?', 'redo도?'],
    expectFollow: [null, false, false],
    mustCarry: [null, null, null]
  },
  {
    name: 'Analyze→Cleanup 비교 switch',
    turns: ['Analyze 뭐야', 'Cleanup이랑 뭐가달라'],
    expectFollow: [null, false],
    mustCarry: [null, null]
  },
  {
    name: '유튭→링크→403',
    turns: ['유튭 변환', '링크만 넣으면돼?', '403 뜨는데'],
    expectFollow: [null, true, false],
    mustCarry: [null, /유튜브|유튭|변환/i, null]
  },
  {
    name: '짧은반말 편곡 chain',
    turns: ['편곡 같은거 되나', '그거 어디', '아니 악기를 나눠주는거'],
    expectFollow: [null, true, true],
    mustCarry: [null, /편곡/, /편곡|악기/i]
  },
  {
    name: 'manual-style 변환 트러블',
    turns: ['미디로 뽑는건', '링크만 넣으면돼?', '403 뜨는데', '재시도해도안됨'],
    expectFollow: [null, true, false, true],
    mustCarry: [null, /미디|뽑|링크|변환/i, null, /403|미디|변환|뽑/i]
  }
];

const NONEXISTENT_FEATURES = [
  '퀀텀폴드',
  'AI 박자복제',
  '자동핑거링V9',
  '노트텔레포트',
  '스마트피아노분해',
  '우주편곡기',
  'AI 화성텔레포트',
  '메가퀀타이즈X',
  '보이스클론 MIDI',
  '실시간 오케스트라 렌더 클라우드',
  '오토하모닉스프로',
  '딥비트스왑',
  'AI 코드예지',
  '가상드러머X9',
  '스마트핑거프린트MIDI',
  '타임워프퀀타이즈',
  '뉴럴보컬분리V3',
  '감성벨로시티AI',
  '원클릭풀오케스트라',
  '양자얽힘편곡',
  '홀로그램스코어',
  '브레인웨이브MIDI'
];

/** Negative evidence: question must reject unrelated body */
const NEGATIVE_EVIDENCE = [
  {
    name: '예약변환 rejects score editor',
    q: '예약변환 등록',
    body: 'score_editor_palette_lines barline tutorial localization',
    terms: ['예약변환', 'scheduled conversion']
  },
  {
    name: '변환 rejects Arrange-only',
    q: '변환방법알려줘',
    body: '"midi_ai_instrument_arrange": "AI Instrument Arrange"',
    terms: ['conversion', 'youtube']
  },
  {
    name: 'tempo rejects velocity-only',
    q: '템포 어디서 바꿔',
    body: 'velocity lane 벨로시티 only midi_editor_velocity',
    terms: ['tempo', 'bpm']
  },
  {
    name: 'sound rejects score editor',
    q: '소리가 별로야',
    body: 'score editor barline musicxml tutorial',
    terms: ['사운드팩', '고품질']
  },
  {
    name: 'pdf export rejects pdf-to-midi-only',
    q: '악보 pdf로 뽑기',
    body: 'pdf to midi recognition pdftomidi engine only',
    terms: ['pdf export', '악보']
  },
  {
    name: 'library rejects installer',
    q: '라이브러리에서 다시 열기',
    body: 'installer repair uninstall setup.exe',
    terms: ['library', '라이브러리']
  },
  {
    name: 'velocity rejects tempo-only',
    q: 'velocity 조절',
    body: 'project tempo bpm toolbar only',
    terms: ['velocity', '벨로시티']
  },
  {
    name: 'arrange rejects cleanup-only',
    q: '편곡기능있어?',
    body: 'midi_ai_cleanup AI Cleanup goto_cleanup',
    terms: ['Arrange', '편곡']
  }
];

/** Feature labels for randomized QA */
const FEATURE_LABELS = {
  install: '설치',
  login_license: '로그인',
  studio: 'Studio',
  youtube: '유튜브 변환',
  audio: '오디오 변환',
  preview: '미리듣기',
  download_403: '403',
  midi_editor: 'MIDI Editor',
  note_edit: '노트 편집',
  multi_select: '다중선택',
  pitch: '피치',
  velocity: '벨로시티',
  tempo: '템포',
  instrument: '악기',
  undo: '되돌리기',
  save: '저장',
  ai_assistant: 'AI Assistant',
  analyze: 'Analyze',
  cleanup: 'Cleanup',
  humanize: 'Humanize',
  arrange: '편곡',
  easy_key: '쉬운키',
  score: 'Score Editor',
  pdf_export: '악보 PDF',
  musicxml: 'MusicXML',
  pdf_to_midi: 'PDF to MIDI',
  library: 'Library',
  soundpack: '사운드팩',
  playback: '재생',
  export: '내보내기',
  trial: '체험판',
  credits: '크레딧',
  lifetime: 'Lifetime',
  patch: '업데이트',
  repair: 'Repair'
};

module.exports = {
  FEATURE_MAP,
  QUESTION_TEMPLATES,
  USER_QUESTIONS,
  MULTI_TURN_SCENARIOS,
  NONEXISTENT_FEATURES,
  NEGATIVE_EVIDENCE,
  FEATURE_LABELS
};
