// guides-i18n.js
// Lightweight, reversible KO/EN/JA translation layer for /guides/ pages.
// Guide HTML is authored in English; this module swaps recognized text
// nodes/attributes to the active site language and can always restore the
// original English by re-running with lang === 'en'.

function normalize(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

// ---------------------------------------------------------------------------
// PHRASES: { "English source phrase": { ko, en, ja } }
// Keys must match the *exact* full (whitespace-normalized) text of a DOM
// text node or watched attribute value. Partial/substring matches are never
// applied, to avoid corrupting mixed-content nodes.
// ---------------------------------------------------------------------------
const PHRASES = {
  // ---- Chrome: top nav / footer / common labels -----------------------
  "Home": { ko: "홈", en: "Home", ja: "ホーム" },
  "Guides": { ko: "가이드", en: "Guides", ja: "ガイド" },
  "Product": { ko: "제품", en: "Product", ja: "プロダクト" },
  "Downloads": { ko: "다운로드", en: "Downloads", ja: "ダウンロード" },
  "Purchase": { ko: "구매", en: "Purchase", ja: "購入" },
  "FAQ": { ko: "FAQ", en: "FAQ", ja: "FAQ" },
  "Support": { ko: "고객지원", en: "Support", ja: "サポート" },
  "Community": { ko: "커뮤니티", en: "Community", ja: "コミュニティ" },
  "Patch notes": { ko: "패치 노트", en: "Patch notes", ja: "パッチノート" },
  "patch notes": { ko: "패치 노트", en: "patch notes", ja: "パッチノート" },
  "Free trial": { ko: "무료 체험", en: "Free trial", ja: "無料トライアル" },
  "About": { ko: "소개", en: "About", ja: "会社概要" },
  "Business info": { ko: "사업자 정보", en: "Business info", ja: "事業者情報" },
  "business info": { ko: "사업자 정보", en: "business info", ja: "事業者情報" },
  "About & credentials": { ko: "소개 및 이력", en: "About & credentials", ja: "概要と経歴" },
  "Update history": { ko: "업데이트 내역", en: "Update history", ja: "更新履歴" },
  "Skip to guide content": { ko: "가이드 본문으로 건너뛰기", en: "Skip to guide content", ja: "ガイド本文へスキップ" },
  "Breadcrumb": { ko: "이동 경로", en: "Breadcrumb", ja: "パンくずリスト" },
  "Primary": { ko: "주 메뉴", en: "Primary", ja: "メインメニュー" },
  "Open menu": { ko: "메뉴 열기", en: "Open menu", ja: "メニューを開く" },
  "MidiAI Studio": { ko: "MidiAI Studio", en: "MidiAI Studio", ja: "MidiAI Studio" },
  "Table of contents": { ko: "목차", en: "Table of contents", ja: "目次" },
  "Contents": { ko: "목차", en: "Contents", ja: "目次" },
  "Jump to a section": { ko: "섹션으로 이동", en: "Jump to a section", ja: "セクションへ移動" },
  "Related guides": { ko: "관련 가이드", en: "Related guides", ja: "関連ガイド" },
  "Related": { ko: "관련", en: "Related", ja: "関連" },
  "Supporting articles": { ko: "관련 아티클", en: "Supporting articles", ja: "関連記事" },
  "Call to action": { ko: "행동 유도", en: "Call to action", ja: "コールトゥアクション" },
  "About the author": { ko: "저자 소개", en: "About the author", ja: "執筆者について" },
  "Article metadata": { ko: "게시글 정보", en: "Article metadata", ja: "記事情報" },
  "Founder & Product Lead": { ko: "창업자 & 제품 총괄", en: "Founder & Product Lead", ja: "創業者兼プロダクトリード" },
  "Download free trial": { ko: "무료 체험판 다운로드", en: "Download free trial", ja: "無料トライアルをダウンロード" },
  "Buy Lifetime license": { ko: "평생 라이선스 구매", en: "Buy Lifetime license", ja: "永久ライセンスを購入" },
  "Buy Lifetime": { ko: "평생 라이선스 구매", en: "Buy Lifetime", ja: "永久ライセンスを購入" },
  "See product features": { ko: "제품 기능 보기", en: "See product features", ja: "製品機能を見る" },
  "All guides": { ko: "전체 가이드", en: "All guides", ja: "すべてのガイド" },
  "Conversion guides": { ko: "변환 가이드", en: "Conversion guides", ja: "変換ガイド" },
  "Conversion FAQ": { ko: "변환 FAQ", en: "Conversion FAQ", ja: "変換FAQ" },
  "Score": { ko: "악보", en: "Score", ja: "楽譜" },
  "Video": { ko: "영상", en: "Video", ja: "動画" },
  "Audio": { ko: "오디오", en: "Audio", ja: "オーディオ" },
  "AI": { ko: "AI", en: "AI", ja: "AI" },
  "Notation": { ko: "기보", en: "Notation", ja: "記譜" },
  "Help": { ko: "도움말", en: "Help", ja: "ヘルプ" },
  "In-depth article": { ko: "심층 아티클", en: "In-depth article", ja: "詳細記事" },
  "Keep learning": { ko: "계속 학습하기", en: "Keep learning", ja: "学び続ける" },
  "Previous": { ko: "이전", en: "Previous", ja: "前へ" },
  "Next": { ko: "다음", en: "Next", ja: "次へ" },
  "Next pillar": { ko: "다음 필러 가이드", en: "Next pillar", ja: "次のピラーガイド" },
  "Previous pillar": { ko: "이전 필러 가이드", en: "Previous pillar", ja: "前のピラーガイド" },
  "Previous and next pillar guides": { ko: "이전 및 다음 필러 가이드", en: "Previous and next pillar guides", ja: "前後のピラーガイド" },
  "Supporting articles in this topic": { ko: "이 주제의 관련 아티클", en: "Supporting articles in this topic", ja: "このテーマの関連記事" },
  "Full topical map": { ko: "전체 토픽 맵 보기", en: "Full topical map", ja: "全トピックマップを見る" },
  "Publisher:": { ko: "발행사:", en: "Publisher:", ja: "発行者:" },
  "Contact:": { ko: "문의:", en: "Contact:", ja: "お問い合わせ:" },
  "Product proof:": { ko: "제품 정보:", en: "Product proof:", ja: "製品情報:" },
  "Features": { ko: "기능", en: "Features", ja: "機能" },
  "Version history": { ko: "버전 기록", en: "Version history", ja: "バージョン履歴" },
  "1:1 support": { ko: "1:1 고객지원", en: "1:1 support", ja: "1:1サポート" },
  "1:1 inquiry": { ko: "1:1 문의", en: "1:1 inquiry", ja: "1:1お問い合わせ" },
  "Representative:": { ko: "대표자:", en: "Representative:", ja: "代表者:" },
  "Email:": { ko: "이메일:", en: "Email:", ja: "メール:" },
  "Support:": { ko: "고객지원:", en: "Support:", ja: "サポート:" },
  "Hub": { ko: "허브", en: "Hub", ja: "ハブ" },
  "Landing · PDF to MIDI": { ko: "랜딩 · PDF to MIDI", en: "Landing · PDF to MIDI", ja: "ランディング · PDF to MIDI" },
  "Landing · YouTube to MIDI": { ko: "랜딩 · YouTube to MIDI", en: "Landing · YouTube to MIDI", ja: "ランディング · YouTube to MIDI" },
  "Landing · MP3 to MIDI": { ko: "랜딩 · MP3 to MIDI", en: "Landing · MP3 to MIDI", ja: "ランディング · MP3 to MIDI" },
  "Landing · Audio to MIDI": { ko: "랜딩 · Audio to MIDI", en: "Landing · Audio to MIDI", ja: "ランディング · Audio to MIDI" },
  "Landing · MusicXML": { ko: "랜딩 · MusicXML", en: "Landing · MusicXML", ja: "ランディング · MusicXML" },
  "Pillar": { ko: "필러", en: "Pillar", ja: "ピラー" },
  "Intent:": { ko: "검색 의도:", en: "Intent:", ja: "検索意図:" },
  "Cluster:": { ko: "클러스터:", en: "Cluster:", ja: "クラスター:" },
  "Intent: how-to": { ko: "검색 의도: 실용 가이드", en: "Intent: how-to", ja: "検索意図:実践ガイド" },
  "Intent: explainer": { ko: "검색 의도: 개념 설명", en: "Intent: explainer", ja: "検索意図:解説" },
  "Intent: comparison": { ko: "검색 의도: 비교", en: "Intent: comparison", ja: "検索意図:比較" },
  "Intent: legal-edu": { ko: "검색 의도: 법률 안내", en: "Intent: legal-edu", ja: "検索意図:法的情報" },
  "Intent: use-case": { ko: "검색 의도: 활용 사례", en: "Intent: use-case", ja: "検索意図:活用例" },
  "Intent: checklist": { ko: "검색 의도: 체크리스트", en: "Intent: checklist", ja: "検索意図:チェックリスト" },
  "Intent: troubleshooting": { ko: "검색 의도: 문제 해결", en: "Intent: troubleshooting", ja: "検索意図:トラブルシューティング" },
  "Intent: workflow": { ko: "검색 의도: 워크플로우", en: "Intent: workflow", ja: "検索意図:ワークフロー" },
  "PDF to MIDI": { ko: "PDF to MIDI", en: "PDF to MIDI", ja: "PDF to MIDI" },
  "YouTube to MIDI": { ko: "YouTube to MIDI", en: "YouTube to MIDI", ja: "YouTube to MIDI" },
  "MP3 to MIDI": { ko: "MP3 to MIDI", en: "MP3 to MIDI", ja: "MP3 to MIDI" },
  "Audio to MIDI": { ko: "Audio to MIDI", en: "Audio to MIDI", ja: "Audio to MIDI" },
  "MusicXML": { ko: "MusicXML", en: "MusicXML", ja: "MusicXML" },
  "MIDI to PDF": { ko: "MIDI to PDF", en: "MIDI to PDF", ja: "MIDI to PDF" },
  "and": { ko: "및", en: "and", ja: "および" },
  "product": { ko: "제품", en: "product", ja: "プロダクト" },
  "downloads": { ko: "다운로드", en: "downloads", ja: "ダウンロード" },
  "purchase page": { ko: "구매 페이지", en: "purchase page", ja: "購入ページ" },
  "portal FAQ": { ko: "포털 FAQ", en: "portal FAQ", ja: "ポータルFAQ" },
  "guides hub": { ko: "가이드 허브", en: "guides hub", ja: "ガイドハブ" },
  "PDF to MIDI landing": { ko: "PDF to MIDI 랜딩 페이지", en: "PDF to MIDI landing", ja: "PDF to MIDIランディングページ" },
  "Improve MIDI accuracy": { ko: "MIDI 정확도 개선하기", en: "Improve MIDI accuracy", ja: "MIDIの精度を改善する" },
  "Quantize after conversion": { ko: "변환 후 퀀타이즈하기", en: "Quantize after conversion", ja: "変換後のクオンタイズ" },
  "Copyright notes": { ko: "저작권 안내", en: "Copyright notes", ja: "著作権に関する注意" },
  "job-to-be-done comparison": { ko: "작업 목적별 비교", en: "job-to-be-done comparison", ja: "目的別の比較" },
  "the live FAQ board": { ko: "실시간 FAQ 게시판", en: "the live FAQ board", ja: "ライブFAQボード" },
  "AI MIDI converter for Windows": { ko: "Windows용 AI MIDI 변환기", en: "AI MIDI converter for Windows", ja: "Windows向けAI MIDI変換ツール" },
  "AI MIDI converter for Windows · 미디에이아이스튜디오": { ko: "Windows용 AI MIDI 변환기 · 미디에이아이스튜디오", en: "AI MIDI converter for Windows · 미디에이아이스튜디오", ja: "Windows向けAI MIDI変換ツール · 미디에이아이스튜디오" },

  // ---- Author bio (shared across all guide pages) ---------------------
  "Builds MidiAI Studio for practical AI MIDI conversion, score workflows, and musician-first editing on Windows.": {
    ko: "실용적인 AI MIDI 변환, 악보 워크플로우, 그리고 음악가 중심의 편집을 Windows에서 구현하기 위해 MidiAI Studio를 만들고 있습니다.",
    en: "Builds MidiAI Studio for practical AI MIDI conversion, score workflows, and musician-first editing on Windows.",
    ja: "実用的なAI MIDI変換、楽譜ワークフロー、そして音楽家目線の編集をWindows上で実現するためにMidiAI Studioを開発しています。"
  },

  // ---- Hub page (guides/index.html) ------------------------------------
  "MidiAI Studio Guides": { ko: "MidiAI Studio 가이드", en: "MidiAI Studio Guides", ja: "MidiAI Studio ガイド" },
  "MIDI Conversion Guides: PDF, YouTube, MP3, Audio & MusicXML": {
    ko: "MIDI 변환 가이드: PDF, YouTube, MP3, 오디오 & MusicXML",
    en: "MIDI Conversion Guides: PDF, YouTube, MP3, Audio & MusicXML",
    ja: "MIDI変換ガイド:PDF、YouTube、MP3、オーディオ&MusicXML"
  },
  "50 unique articles · 5 pillars": { ko: "아티클 50개 · 필러 5개", en: "50 unique articles · 5 pillars", ja: "記事50本・ピラー5本" },
  "Choose a conversion type below to open a step-by-step guide, then browse related articles for editing, accuracy, and score workflows.": {
    ko: "아래에서 변환 종류를 고르면 단계별 가이드로 이동합니다. 이어서 편집·정확도·악보 관련 아티클도 살펴보세요.",
    en: "Choose a conversion type below to open a step-by-step guide, then browse related articles for editing, accuracy, and score workflows.",
    ja: "下の変換タイプを選ぶと手順ガイドが開きます。続けて編集・精度・楽譜関連の記事もご覧ください。"
  },
  "View complete topical map": { ko: "전체 토픽 맵 보기", en: "View complete topical map", ja: "全トピックマップを見る" },
  "MIDI Converter FAQ": { ko: "MIDI 변환기 FAQ", en: "MIDI Converter FAQ", ja: "MIDI変換ツールFAQ" },
  "About / EEAT": { ko: "소개 / EEAT", en: "About / EEAT", ja: "会社概要 / EEAT" },
  "Start with a landing page": { ko: "랜딩 페이지에서 시작하기", en: "Start with a landing page", ja: "ランディングページから始める" },
  "All articles (50)": { ko: "전체 아티클 (50개)", en: "All articles (50)", ja: "すべての記事(50本)" },
  "PDF to MIDI Converter": { ko: "PDF to MIDI 변환기", en: "PDF to MIDI Converter", ja: "PDF to MIDI 変換ツール" },
  "Convert PDF sheet music to editable MIDI. Learn OMR tips and use MidiAI Studio’s Windows workflow for scores → MIDI.": {
    ko: "PDF 악보를 편집 가능한 MIDI로 변환하세요. OMR 활용 팁을 배우고, 악보 → MIDI 변환을 위한 MidiAI Studio의 Windows 워크플로우를 사용해보세요.",
    en: "Convert PDF sheet music to editable MIDI. Learn OMR tips and use MidiAI Studio’s Windows workflow for scores → MIDI.",
    ja: "PDF楽譜を編集可能なMIDIに変換。OMR活用のコツを学び、楽譜→MIDI変換のためのMidiAI StudioのWindowsワークフローを使いましょう。"
  },
  "YouTube to MIDI Converter": { ko: "YouTube to MIDI 변환기", en: "YouTube to MIDI Converter", ja: "YouTube to MIDI 変換ツール" },
  "Convert YouTube piano covers to MIDI on Windows. Practical accuracy tips, copyright notes, and MidiAI Studio CTA.": {
    ko: "Windows에서 YouTube 피아노 커버를 MIDI로 변환하세요. 실용적인 정확도 향상 팁, 저작권 안내, MidiAI Studio 다운로드 안내까지 담았습니다.",
    en: "Convert YouTube piano covers to MIDI on Windows. Practical accuracy tips, copyright notes, and MidiAI Studio CTA.",
    ja: "WindowsでYouTubeのピアノカバーをMIDIに変換。実用的な精度向上のコツ、著作権の注意点、MidiAI Studioのご案内まで。"
  },
  "MP3 to MIDI Converter": { ko: "MP3 to MIDI 변환기", en: "MP3 to MIDI Converter", ja: "MP3 to MIDI 変換ツール" },
  "Convert MP3 audio to MIDI with AI. Source prep, polyphony tips, editing checklist, and MidiAI Studio download CTA.": {
    ko: "AI로 MP3 오디오를 MIDI로 변환하세요. 소스 준비, 폴리포니 처리 팁, 편집 체크리스트와 MidiAI Studio 다운로드 안내를 확인하세요.",
    en: "Convert MP3 audio to MIDI with AI. Source prep, polyphony tips, editing checklist, and MidiAI Studio download CTA.",
    ja: "AIでMP3オーディオをMIDIに変換。ソースの準備、ポリフォニー処理のコツ、編集チェックリスト、MidiAI Studioダウンロード案内まで。"
  },
  "Audio to MIDI Converter (AI)": { ko: "Audio to MIDI 변환기 (AI)", en: "Audio to MIDI Converter (AI)", ja: "Audio to MIDI 変換ツール(AI)" },
  "AI audio to MIDI for WAV/MP3 and more. Learn realistic accuracy expectations and MidiAI Studio’s convert-edit-export loop.": {
    ko: "WAV/MP3 등 다양한 오디오를 AI로 MIDI로 변환하세요. 현실적인 정확도 기대치를 이해하고, MidiAI Studio의 변환-편집-내보내기 흐름을 배워보세요.",
    en: "AI audio to MIDI for WAV/MP3 and more. Learn realistic accuracy expectations and MidiAI Studio’s convert-edit-export loop.",
    ja: "WAV/MP3などのオーディオをAIでMIDIに変換。現実的な精度の目安を理解し、MidiAI Studioの変換・編集・書き出しループを学びましょう。"
  },
  "MusicXML for Modern Score Workflows": { ko: "현대적인 악보 워크플로우를 위한 MusicXML", en: "MusicXML for Modern Score Workflows", ja: "モダンな楽譜ワークフローのためのMusicXML" },
  "Learn MusicXML vs MIDI, conversion paths from PDF/scores, and how MidiAI Studio fits notation + MIDI pipelines.": {
    ko: "MusicXML과 MIDI의 차이, PDF/악보에서의 변환 경로, 그리고 MidiAI Studio가 표기법 + MIDI 파이프라인에 어떻게 맞물리는지 알아보세요.",
    en: "Learn MusicXML vs MIDI, conversion paths from PDF/scores, and how MidiAI Studio fits notation + MIDI pipelines.",
    ja: "MusicXMLとMIDIの違い、PDF/楽譜からの変換パス、そしてMidiAI Studioが記譜法+MIDIパイプラインにどう組み込まれるかを学びましょう。"
  },
  "Try MidiAI Studio for MIDI conversion": { ko: "MIDI 변환을 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for MIDI conversion", ja: "MIDI変換にMidiAI Studioを試してみましょう" },
  "Download the Windows app, convert YouTube links or audio to MIDI, edit notes, and continue into score workflows. Lifetime licensing is available on the purchase page.": {
    ko: "Windows 앱을 다운로드하고, YouTube 링크나 오디오를 MIDI로 변환한 뒤 노트를 편집하고 악보 워크플로우로 이어가보세요. 평생 라이선스는 구매 페이지에서 이용할 수 있습니다.",
    en: "Download the Windows app, convert YouTube links or audio to MIDI, edit notes, and continue into score workflows. Lifetime licensing is available on the purchase page.",
    ja: "Windowsアプリをダウンロードし、YouTubeリンクやオーディオをMIDIに変換してノートを編集、そのまま楽譜ワークフローへ進めます。永久ライセンスは購入ページでご利用いただけます。"
  },

  // ---- Pillar shared strings -------------------------------------------
  "What is PDF to MIDI?": { ko: "PDF to MIDI란 무엇인가요?", en: "What is PDF to MIDI?", ja: "PDF to MIDIとは何ですか?" },
  "What is YouTube to MIDI?": { ko: "YouTube to MIDI란 무엇인가요?", en: "What is YouTube to MIDI?", ja: "YouTube to MIDIとは何ですか?" },
  "What is MP3 to MIDI?": { ko: "MP3 to MIDI란 무엇인가요?", en: "What is MP3 to MIDI?", ja: "MP3 to MIDIとは何ですか?" },
  "What is Audio to MIDI?": { ko: "Audio to MIDI란 무엇인가요?", en: "What is Audio to MIDI?", ja: "Audio to MIDIとは何ですか?" },
  "What is MusicXML?": { ko: "MusicXML이란 무엇인가요?", en: "What is MusicXML?", ja: "MusicXMLとは何ですか?" },
  "How it works": { ko: "작동 방식", en: "How it works", ja: "仕組み" },
  "Screenshots": { ko: "스크린샷", en: "Screenshots", ja: "スクリーンショット" },
  "Studio conversion workspace (placeholder-ready product screenshot).": {
    ko: "스튜디오 변환 작업 공간(자리표시용 제품 스크린샷).",
    en: "Studio conversion workspace (placeholder-ready product screenshot).",
    ja: "スタジオの変換ワークスペース(仮の製品スクリーンショット)。"
  },
  "Edit converted notes before export.": { ko: "내보내기 전에 변환된 노트를 편집하세요.", en: "Edit converted notes before export.", ja: "書き出す前に変換されたノートを編集します。" },
  "These long-tail guides support the pillar primary": {
    ko: "다음 롱테일 가이드는 필러 핵심 키워드인",
    en: "These long-tail guides support the pillar primary",
    ja: "以下のロングテールガイドは、ピラーのプライマリキーワードである"
  },
  "without competing for it.": { ko: "와 경쟁하지 않으면서 이를 뒷받침합니다.", en: "without competing for it.", ja: "と競合せずにそれを補完します。" },
  "How do I get better accuracy?": { ko: "정확도를 높이려면 어떻게 해야 하나요?", en: "How do I get better accuracy?", ja: "精度を高めるにはどうすればいいですか?" },
  "Does MidiAI Studio support this workflow?": { ko: "MidiAI Studio가 이 워크플로우를 지원하나요?", en: "Does MidiAI Studio support this workflow?", ja: "MidiAI Studioはこのワークフローをサポートしていますか?" },
  "Is this free?": { ko: "무료인가요?", en: "Is this free?", ja: "無料ですか?" },
  "Where is company / support information?": { ko: "회사 정보 및 고객지원 정보는 어디에서 확인하나요?", en: "Where is company / support information?", ja: "会社情報やサポート情報はどこで確認できますか?" },
  "Use cleaner sources, convert shorter sections first, and always edit the MIDI draft. See best practices below.": {
    ko: "더 깨끗한 소스를 사용하고, 짧은 구간부터 먼저 변환한 뒤 항상 MIDI 초안을 편집하세요. 아래 모범 사례를 참고하세요.",
    en: "Use cleaner sources, convert shorter sections first, and always edit the MIDI draft. See best practices below.",
    ja: "よりクリーンなソースを使い、まず短いセクションから変換し、必ずMIDIのドラフトを編集しましょう。下記のベストプラクティスもご参照ください。"
  },
  "Yes. MidiAI Studio is built for AI MIDI conversion on Windows with editing and score-related export paths. Start from the downloads page.": {
    ko: "네. MidiAI Studio는 Windows에서 AI MIDI 변환과 편집, 악보 관련 내보내기 경로를 위해 만들어졌습니다. 다운로드 페이지에서 시작해보세요.",
    en: "Yes. MidiAI Studio is built for AI MIDI conversion on Windows with editing and score-related export paths. Start from the downloads page.",
    ja: "はい。MidiAI StudioはWindows上でAI MIDI変換、編集、楽譜関連の書き出しパスのために作られています。ダウンロードページから始めてください。"
  },
  "A free trial download is available. Lifetime licensing unlocks full conversion and editing capabilities—see the purchase page for current pricing.": {
    ko: "무료 체험판 다운로드를 이용할 수 있습니다. 평생 라이선스를 구매하면 전체 변환 및 편집 기능을 이용할 수 있습니다 — 현재 가격은 구매 페이지에서 확인하세요.",
    en: "A free trial download is available. Lifetime licensing unlocks full conversion and editing capabilities—see the purchase page for current pricing.",
    ja: "無料トライアル版をダウンロードできます。永久ライセンスを購入するとすべての変換・編集機能が利用可能になります — 現在の価格は購入ページをご確認ください。"
  },
  "See the about page for publisher details, patch notes for version history, and support for 1:1 help.": {
    ko: "발행사 정보는 소개 페이지, 버전 기록은 패치 노트, 1:1 도움은 고객지원 페이지에서 확인하세요.",
    en: "See the about page for publisher details, patch notes for version history, and support for 1:1 help.",
    ja: "発行者情報は会社概要ページ、バージョン履歴はパッチノート、1:1サポートはサポートページをご確認ください。"
  },
  "Deeper notes for long-term skill": { ko: "장기적인 실력 향상을 위한 심화 노트", en: "Deeper notes for long-term skill", ja: "長期的なスキル向上のための深掘りノート" },
  "Treat every conversion as a small research project. Write down what failed: was it source noise, extreme polyphony, unclear engraving, or tempo drift? That log becomes your personal accuracy playbook and compounds faster than randomly retrying settings.": {
    ko: "모든 변환을 작은 연구 프로젝트처럼 다뤄보세요. 무엇이 실패했는지 기록하세요: 소스 잡음, 극단적인 폴리포니, 불분명한 인쇄, 아니면 템포 흔들림이었나요? 이 기록은 당신만의 정확도 플레이북이 되어, 설정을 무작위로 재시도하는 것보다 훨씬 빠르게 실력을 쌓아줍니다.",
    en: "Treat every conversion as a small research project. Write down what failed: was it source noise, extreme polyphony, unclear engraving, or tempo drift? That log becomes your personal accuracy playbook and compounds faster than randomly retrying settings.",
    ja: "すべての変換を小さな研究プロジェクトとして扱いましょう。何が失敗の原因だったかを記録してください:ソースのノイズ、極端なポリフォニー、不明瞭な譜面、それともテンポのズレでしょうか?この記録はあなただけの精度向上プレイブックとなり、設定をランダムに試すよりずっと速く効果を積み重ねます。"
  },
  "Build a template project in your DAW with favorite piano, pad, and bass instruments ready for converted MIDI. The less friction between “export MIDI” and “hear something musical,” the more consistently you’ll finish edits instead of abandoning drafts.": {
    ko: "좋아하는 피아노, 패드, 베이스 악기를 미리 준비해둔 템플릿 프로젝트를 DAW에 만들어두세요. \u201cMIDI 내보내기\u201d와 \u201c음악적으로 들리는 순간\u201d 사이의 마찰이 적을수록, 초안을 포기하는 대신 편집을 꾸준히 끝마칠 수 있습니다.",
    en: "Build a template project in your DAW with favorite piano, pad, and bass instruments ready for converted MIDI. The less friction between “export MIDI” and “hear something musical,” the more consistently you’ll finish edits instead of abandoning drafts.",
    ja: "お気に入りのピアノ、パッド、ベース音源をあらかじめ用意したテンプレートプロジェクトをDAWに作っておきましょう。「MIDIを書き出す」ことと「音楽として聴こえる」ことの間の摩擦が少ないほど、ドラフトを放置せずに編集を最後までやり遂げやすくなります。"
  },
  "When collaborating, send both the MIDI and a short note about assumed tempo, key, and leftover problem measures. Clear communication prevents partners from “fixing” musical choices that were intentional.": {
    ko: "협업할 때는 MIDI 파일과 함께 가정한 템포, 키, 그리고 남아 있는 문제 마디에 대한 짧은 메모를 함께 보내세요. 명확한 커뮤니케이션은 협업 파트너가 의도적인 음악적 선택을 \u201c고친다\u201d며 되돌리는 일을 막아줍니다.",
    en: "When collaborating, send both the MIDI and a short note about assumed tempo, key, and leftover problem measures. Clear communication prevents partners from “fixing” musical choices that were intentional.",
    ja: "共同作業を行う際は、MIDIファイルとともに想定テンポ、キー、そして未解決の問題箇所についての簡単なメモを送りましょう。明確なコミュニケーションは、意図的な音楽的判断を相手が「修正」してしまうことを防ぎます。"
  },
  "Revisit older conversions after software updates. Converter quality improves over time; a file that needed heavy cleanup last quarter may need less work after a patch. Check the official patch notes before large batch jobs.": {
    ko: "소프트웨어가 업데이트된 후에는 이전에 변환한 파일들을 다시 살펴보세요. 변환기 품질은 시간이 지나며 개선되므로, 지난 분기에 대대적인 정리가 필요했던 파일이 패치 후에는 훨씬 적은 작업만으로 끝날 수 있습니다. 대규모 배치 작업 전에는 공식 패치 노트를 확인하세요.",
    en: "Revisit older conversions after software updates. Converter quality improves over time; a file that needed heavy cleanup last quarter may need less work after a patch. Check the official patch notes before large batch jobs.",
    ja: "ソフトウェアの更新後は、以前変換したファイルを見直してみましょう。変換ツールの品質は時間とともに向上するため、前四半期に大幅な修正が必要だったファイルも、パッチ適用後は作業量が少なく済む場合があります。大規模なバッチ処理を行う前に、公式パッチノートを確認してください。"
  },
  "Finally, keep ethics close to craft. Use conversions to learn, arrange, and create—not to misrepresent authorship. Crediting sources and respecting rights is part of professional musicianship in the AI era.": {
    ko: "마지막으로, 기술과 윤리를 함께 가져가세요. 변환은 학습하고 편곡하고 창작하기 위한 것이며, 저작자를 왜곡하기 위한 것이 아닙니다. 출처를 밝히고 권리를 존중하는 것은 AI 시대의 전문 음악가로서 갖춰야 할 자세입니다.",
    en: "Finally, keep ethics close to craft. Use conversions to learn, arrange, and create—not to misrepresent authorship. Crediting sources and respecting rights is part of professional musicianship in the AI era.",
    ja: "最後に、技術と同じくらい倫理も大切にしましょう。変換は学び、編曲し、創作するためのものであり、著作者を偽るためのものではありません。出典を明記し権利を尊重することは、AI時代におけるプロフェッショナルな音楽家としての姿勢の一部です。"
  },
  "Checklist before you publish or share": { ko: "공개하거나 공유하기 전 체크리스트", en: "Checklist before you publish or share", ja: "公開・共有前のチェックリスト" },
  "Verify key signature and tempo map.": { ko: "조표와 템포 맵을 확인하세요.", en: "Verify key signature and tempo map.", ja: "調号とテンポマップを確認します。" },
  "Scan for overlapping note duplicates.": { ko: "겹치는 중복 노트를 확인하세요.", en: "Scan for overlapping note duplicates.", ja: "重複して重なっているノートを確認します。" },
  "Confirm instrument mapping and octave placement.": { ko: "악기 매핑과 옥타브 배치를 확인하세요.", en: "Confirm instrument mapping and octave placement.", ja: "楽器マッピングとオクターブの配置を確認します。" },
  "Listen once without looking at the piano roll.": { ko: "피아노 롤을 보지 않고 한 번 들어보세요.", en: "Listen once without looking at the piano roll.", ja: "ピアノロールを見ずに一度通して聴きます。" },
  "Listen again focusing only on rhythm.": { ko: "리듬에만 집중해서 다시 들어보세요.", en: "Listen again focusing only on rhythm.", ja: "リズムだけに集中してもう一度聴きます。" },
  "Export a dated filename (project-title-v03.mid).": { ko: "날짜가 포함된 파일명으로 내보내세요 (project-title-v03.mid).", en: "Export a dated filename (project-title-v03.mid).", ja: "日付入りのファイル名で書き出します(project-title-v03.mid)。" },
  "Convert with MidiAI Studio.": { ko: "MidiAI Studio로 변환하세요.", en: "Convert with MidiAI Studio.", ja: "MidiAI Studioで変換します。" },

  // ---- Pillar: PDF to MIDI ----------------------------------------------
  "Pillar · owns primary “PDF to MIDI”": { ko: "필러 · \u201cPDF to MIDI\u201d 핵심 키워드 보유", en: "Pillar · owns primary “PDF to MIDI”", ja: "ピラー · 「PDF to MIDI」のプライマリキーワードを保有" },
  "PDF to MIDI helps musicians turn engraved or scanned scores into editable note data for practice, arranging, and production.": {
    ko: "PDF to MIDI는 음악가가 인쇄되거나 스캔한 악보를 연습, 편곡, 프로덕션에 활용할 수 있는 편집 가능한 노트 데이터로 바꿔줍니다.",
    en: "PDF to MIDI helps musicians turn engraved or scanned scores into editable note data for practice, arranging, and production.",
    ja: "PDF to MIDIは、印刷またはスキャンした楽譜を、練習・編曲・制作に使える編集可能なノートデータに変換します。"
  },
  "Official MidiAI Studio product UI — starting point for PDF to MIDI.": {
    ko: "MidiAI Studio 공식 제품 UI — PDF to MIDI의 시작점입니다.",
    en: "Official MidiAI Studio product UI — starting point for PDF to MIDI.",
    ja: "MidiAI Studio公式プロダクトUI — PDF to MIDIの出発点です。"
  },
  "PDF to MIDI conversion uses optical music recognition (OMR) and symbolic mapping to transform sheet music pages into MIDI note events.": {
    ko: "PDF to MIDI 변환은 광학 악보 인식(OMR)과 기호 매핑을 사용해 악보 페이지를 MIDI 노트 이벤트로 바꿉니다.",
    en: "PDF to MIDI conversion uses optical music recognition (OMR) and symbolic mapping to transform sheet music pages into MIDI note events.",
    ja: "PDF to MIDI変換は、光学楽譜認識(OMR)とシンボルマッピングを使って楽譜のページをMIDIノートイベントに変換します。"
  },
  "You provide a clear PDF score, the system recognizes musical symbols, then you inspect and edit the resulting MIDI before export.": {
    ko: "선명한 PDF 악보를 제공하면 시스템이 음악 기호를 인식하고, 이후 결과물인 MIDI를 검토하고 편집한 뒤 내보낼 수 있습니다.",
    en: "You provide a clear PDF score, the system recognizes musical symbols, then you inspect and edit the resulting MIDI before export.",
    ja: "鮮明なPDF楽譜を用意すると、システムが音楽記号を認識し、結果として得られたMIDIを確認・編集してから書き出せます。"
  },
  "Prepare a high-contrast, correctly oriented PDF.": { ko: "대비가 선명하고 방향이 올바른 PDF를 준비하세요.", en: "Prepare a high-contrast, correctly oriented PDF.", ja: "コントラストがはっきりした、正しい向きのPDFを準備します。" },
  "Convert with MidiAI Studio’s score-related tools.": { ko: "MidiAI Studio의 악보 관련 도구로 변환하세요.", en: "Convert with MidiAI Studio’s score-related tools.", ja: "MidiAI Studioの楽譜関連ツールで変換します。" },
  "Fix voices, rhythms, and octave errors in the editor.": { ko: "에디터에서 성부, 리듬, 옥타브 오류를 수정하세요.", en: "Fix voices, rhythms, and octave errors in the editor.", ja: "エディタで声部・リズム・オクターブの誤りを修正します。" },
  "Export MIDI or continue to MusicXML/PDF as needed.": { ko: "필요에 따라 MIDI를 내보내거나 MusicXML/PDF로 이어서 작업하세요.", en: "Export MIDI or continue to MusicXML/PDF as needed.", ja: "必要に応じてMIDIを書き出すか、MusicXML/PDFへ進みます。" },
  "Features that matter for PDF to MIDI": { ko: "PDF to MIDI에서 중요한 기능", en: "Features that matter for PDF to MIDI", ja: "PDF to MIDIで重要な機能" },
  "Windows desktop conversion workflow": { ko: "Windows 데스크톱 변환 워크플로우", en: "Windows desktop conversion workflow", ja: "Windowsデスクトップの変換ワークフロー" },
  "MIDI editing after recognition": { ko: "인식 후 MIDI 편집", en: "MIDI editing after recognition", ja: "認識後のMIDI編集" },
  "Score interchange awareness (MusicXML/PDF paths)": { ko: "악보 교환 형식 지원 (MusicXML/PDF 경로)", en: "Score interchange awareness (MusicXML/PDF paths)", ja: "楽譜交換フォーマットへの対応(MusicXML/PDF経路)" },
  "Official support, FAQ, and patch notes": { ko: "공식 지원, FAQ, 패치 노트 제공", en: "Official support, FAQ, and patch notes", ja: "公式サポート、FAQ、パッチノートを提供" },
  "Try MidiAI Studio for PDF to MIDI": { ko: "PDF to MIDI를 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for PDF to MIDI", ja: "PDF to MIDIのためにMidiAI Studioを試してみましょう" },

  // ---- Pillar: YouTube to MIDI ------------------------------------------
  "Pillar · owns primary “YouTube to MIDI”": { ko: "필러 · \u201cYouTube to MIDI\u201d 핵심 키워드 보유", en: "Pillar · owns primary “YouTube to MIDI”", ja: "ピラー · 「YouTube to MIDI」のプライマリキーワードを保有" },
  "YouTube to MIDI is one of the most requested musician workflows—especially for piano covers used as practice and arrangement references.": {
    ko: "YouTube to MIDI는 음악가들이 가장 많이 요청하는 워크플로우 중 하나입니다 — 특히 연습이나 편곡 참고 자료로 쓰이는 피아노 커버에서 자주 활용됩니다.",
    en: "YouTube to MIDI is one of the most requested musician workflows—especially for piano covers used as practice and arrangement references.",
    ja: "YouTube to MIDIは音楽家から最も要望の多いワークフローの一つです — 特に練習や編曲の参考として使われるピアノカバーでよく利用されます。"
  },
  "Official MidiAI Studio product UI — starting point for YouTube to MIDI.": {
    ko: "MidiAI Studio 공식 제품 UI — YouTube to MIDI의 시작점입니다.",
    en: "Official MidiAI Studio product UI — starting point for YouTube to MIDI.",
    ja: "MidiAI Studio公式プロダクトUI — YouTube to MIDIの出発点です。"
  },
  "YouTube to MIDI means extracting audio from a YouTube performance reference and converting it into editable MIDI notes.": {
    ko: "YouTube to MIDI는 YouTube 연주 영상에서 오디오를 추출해 편집 가능한 MIDI 노트로 변환하는 것을 의미합니다.",
    en: "YouTube to MIDI means extracting audio from a YouTube performance reference and converting it into editable MIDI notes.",
    ja: "YouTube to MIDIとは、YouTubeの演奏動画からオーディオを抽出し、編集可能なMIDIノートに変換することを指します。"
  },
  "Paste a URL or import derived audio, run AI conversion, then edit timing and harmony before using the MIDI in a DAW or lesson plan.": {
    ko: "URL을 붙여넣거나 추출한 오디오를 가져온 뒤 AI 변환을 실행하고, DAW나 레슨 계획에 사용하기 전에 타이밍과 화성을 편집하세요.",
    en: "Paste a URL or import derived audio, run AI conversion, then edit timing and harmony before using the MIDI in a DAW or lesson plan.",
    ja: "URLを貼り付けるか、抽出したオーディオを取り込んでAI変換を実行し、DAWやレッスンで使う前にタイミングと和声を編集しましょう。"
  },
  "Choose a clear piano-forward video.": { ko: "피아노가 선명하게 들리는 영상을 선택하세요.", en: "Choose a clear piano-forward video.", ja: "ピアノがはっきり聴こえる動画を選びます。" },
  "Edit the MIDI draft carefully.": { ko: "MIDI 초안을 꼼꼼하게 편집하세요.", en: "Edit the MIDI draft carefully.", ja: "MIDIドラフトを丁寧に編集します。" },
  "Use results for practice/arrangement—respect copyright.": { ko: "결과물은 연습/편곡용으로 활용하고, 저작권을 존중하세요.", en: "Use results for practice/arrangement—respect copyright.", ja: "結果は練習・編曲用に活用し、著作権を尊重しましょう。" },
  "Features that matter for YouTube to MIDI": { ko: "YouTube to MIDI에서 중요한 기능", en: "Features that matter for YouTube to MIDI", ja: "YouTube to MIDIで重要な機能" },
  "YouTube-oriented intake for piano covers": { ko: "피아노 커버에 맞춘 YouTube 기반 입력", en: "YouTube-oriented intake for piano covers", ja: "ピアノカバーに合わせたYouTube向け取り込み" },
  "AI MIDI conversion + editor": { ko: "AI MIDI 변환 + 에디터", en: "AI MIDI conversion + editor", ja: "AI MIDI変換+エディタ" },
  "Export for DAW practice workflows": { ko: "DAW 연습 워크플로우용 내보내기", en: "Export for DAW practice workflows", ja: "DAW練習ワークフロー向けの書き出し" },
  "Publisher support via official portal": { ko: "공식 포털을 통한 발행사 지원", en: "Publisher support via official portal", ja: "公式ポータルによる発行者サポート" },
  "Try MidiAI Studio for YouTube to MIDI": { ko: "YouTube to MIDI를 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for YouTube to MIDI", ja: "YouTube to MIDIのためにMidiAI Studioを試してみましょう" },

  // ---- Pillar: MP3 to MIDI ----------------------------------------------
  "Pillar · owns primary “MP3 to MIDI”": { ko: "필러 · \u201cMP3 to MIDI\u201d 핵심 키워드 보유", en: "Pillar · owns primary “MP3 to MIDI”", ja: "ピラー · 「MP3 to MIDI」のプライマリキーワードを保有" },
  "MP3 to MIDI conversion turns compressed audio performances into note data you can reshape with virtual instruments.": {
    ko: "MP3 to MIDI 변환은 압축된 오디오 연주를 가상 악기로 다시 다듬을 수 있는 노트 데이터로 바꿔줍니다.",
    en: "MP3 to MIDI conversion turns compressed audio performances into note data you can reshape with virtual instruments.",
    ja: "MP3 to MIDI変換は、圧縮されたオーディオの演奏を、ソフト音源で作り直せるノートデータに変換します。"
  },
  "Official MidiAI Studio product UI — starting point for MP3 to MIDI.": {
    ko: "MidiAI Studio 공식 제품 UI — MP3 to MIDI의 시작점입니다.",
    en: "Official MidiAI Studio product UI — starting point for MP3 to MIDI.",
    ja: "MidiAI Studio公式プロダクトUI — MP3 to MIDIの出発点です。"
  },
  "MP3 to MIDI is AI-assisted transcription from MP3 audio files into MIDI note events for editing and playback.": {
    ko: "MP3 to MIDI는 MP3 오디오 파일을 편집 및 재생이 가능한 MIDI 노트 이벤트로 바꿔주는 AI 기반 채보입니다.",
    en: "MP3 to MIDI is AI-assisted transcription from MP3 audio files into MIDI note events for editing and playback.",
    ja: "MP3 to MIDIは、MP3オーディオファイルを編集・再生可能なMIDIノートイベントに変換するAI支援の採譜です。"
  },
  "Import an MP3, convert a test section, inspect the piano roll, then refine and export.": {
    ko: "MP3를 가져와서 일부 구간을 테스트로 변환하고, 피아노 롤을 검토한 뒤 다듬어서 내보내세요.",
    en: "Import an MP3, convert a test section, inspect the piano roll, then refine and export.",
    ja: "MP3を取り込み、テストとして一部を変換し、ピアノロールを確認してから調整して書き出します。"
  },
  "Prefer cleaner piano or melody-forward MP3s.": { ko: "가능하면 깨끗한 피아노나 멜로디가 선명한 MP3를 사용하세요.", en: "Prefer cleaner piano or melody-forward MP3s.", ja: "できるだけクリーンなピアノやメロディが際立つMP3を使いましょう。" },
  "Convert a short section first.": { ko: "먼저 짧은 구간을 변환해보세요.", en: "Convert a short section first.", ja: "まず短いセクションから変換します。" },
  "Clean duplicates and timing.": { ko: "중복과 타이밍을 정리하세요.", en: "Clean duplicates and timing.", ja: "重複とタイミングを整理します。" },
  "Export MIDI to your DAW.": { ko: "MIDI를 DAW로 내보내세요.", en: "Export MIDI to your DAW.", ja: "MIDIをDAWへ書き出します。" },
  "Features that matter for MP3 to MIDI": { ko: "MP3 to MIDI에서 중요한 기능", en: "Features that matter for MP3 to MIDI", ja: "MP3 to MIDIで重要な機能" },
  "Local Windows conversion": { ko: "로컬 Windows 변환", en: "Local Windows conversion", ja: "ローカルWindows変換" },
  "Post-convert MIDI editing": { ko: "변환 후 MIDI 편집", en: "Post-convert MIDI editing", ja: "変換後のMIDI編集" },
  "Instrument remapping options": { ko: "악기 재매핑 옵션", en: "Instrument remapping options", ja: "楽器リマッピングのオプション" },
  "Lifetime license availability": { ko: "평생 라이선스 제공", en: "Lifetime license availability", ja: "永久ライセンスの提供" },
  "Try MidiAI Studio for MP3 to MIDI": { ko: "MP3 to MIDI를 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for MP3 to MIDI", ja: "MP3 to MIDIのためにMidiAI Studioを試してみましょう" },

  // ---- Pillar: Audio to MIDI ---------------------------------------------
  "Pillar · owns primary “Audio to MIDI”": { ko: "필러 · \u201cAudio to MIDI\u201d 핵심 키워드 보유", en: "Pillar · owns primary “Audio to MIDI”", ja: "ピラー · 「Audio to MIDI」のプライマリキーワードを保有" },
  "Audio to MIDI is the umbrella task behind MP3, WAV, FLAC, and many YouTube-derived conversions.": {
    ko: "Audio to MIDI는 MP3, WAV, FLAC, 그리고 여러 YouTube 기반 변환을 아우르는 상위 개념입니다.",
    en: "Audio to MIDI is the umbrella task behind MP3, WAV, FLAC, and many YouTube-derived conversions.",
    ja: "Audio to MIDIは、MP3、WAV、FLAC、そして多くのYouTube由来の変換を包括する上位のタスクです。"
  },
  "Official MidiAI Studio product UI — starting point for Audio to MIDI.": {
    ko: "MidiAI Studio 공식 제품 UI — Audio to MIDI의 시작점입니다.",
    en: "Official MidiAI Studio product UI — starting point for Audio to MIDI.",
    ja: "MidiAI Studio公式プロダクトUI — Audio to MIDIの出発点です。"
  },
  "Audio to MIDI conversion estimates musical notes from an audio waveform using AI transcription models.": {
    ko: "Audio to MIDI 변환은 AI 채보 모델을 사용해 오디오 파형에서 음악적 노트를 추정합니다.",
    en: "Audio to MIDI conversion estimates musical notes from an audio waveform using AI transcription models.",
    ja: "Audio to MIDI変換は、AI採譜モデルを使ってオーディオの波形から音楽的なノートを推定します。"
  },
  "Feed a recording, let AI propose notes, then treat the output as a draft performance to edit.": {
    ko: "녹음 파일을 입력하면 AI가 노트를 제안하며, 그 결과물은 편집이 필요한 초안 연주로 다뤄야 합니다.",
    en: "Feed a recording, let AI propose notes, then treat the output as a draft performance to edit.",
    ja: "録音を入力するとAIがノートを提案します。出力は編集が必要なドラフト演奏として扱いましょう。"
  },
  "Select the best available audio quality.": { ko: "가능한 가장 좋은 음질의 오디오를 선택하세요.", en: "Select the best available audio quality.", ja: "利用可能な中で最も高音質なオーディオを選びます。" },
  "Edit pitch, rhythm, and velocity.": { ko: "음정, 리듬, 벨로시티를 편집하세요.", en: "Edit pitch, rhythm, and velocity.", ja: "音程、リズム、ベロシティを編集します。" },
  "Export and arrange in your DAW.": { ko: "DAW에서 내보내고 편곡하세요.", en: "Export and arrange in your DAW.", ja: "DAWで書き出して編曲します。" },
  "Features that matter for Audio to MIDI": { ko: "Audio to MIDI에서 중요한 기능", en: "Features that matter for Audio to MIDI", ja: "Audio to MIDIで重要な機能" },
  "AI transcription tailored to music production": { ko: "음악 프로덕션에 맞춘 AI 채보", en: "AI transcription tailored to music production", ja: "音楽制作に合わせたAI採譜" },
  "Editor-centric workflow": { ko: "에디터 중심 워크플로우", en: "Editor-centric workflow", ja: "エディタ中心のワークフロー" },
  "Score-related continuations": { ko: "악보 관련 후속 작업 연계", en: "Score-related continuations", ja: "楽譜関連の後続作業への連携" },
  "Documented updates and support": { ko: "문서화된 업데이트와 지원", en: "Documented updates and support", ja: "ドキュメント化された更新とサポート" },
  "Try MidiAI Studio for Audio to MIDI": { ko: "Audio to MIDI를 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for Audio to MIDI", ja: "Audio to MIDIのためにMidiAI Studioを試してみましょう" },

  // ---- Pillar: MusicXML ---------------------------------------------------
  "Pillar · owns primary “MusicXML”": { ko: "필러 · \u201cMusicXML\u201d 핵심 키워드 보유", en: "Pillar · owns primary “MusicXML”", ja: "ピラー · 「MusicXML」のプライマリキーワードを保有" },
  "MusicXML is the open exchange format that keeps digital sheet music editable across notation apps.": {
    ko: "MusicXML은 디지털 악보를 여러 표기 프로그램 사이에서 편집 가능하게 유지해주는 개방형 교환 형식입니다.",
    en: "MusicXML is the open exchange format that keeps digital sheet music editable across notation apps.",
    ja: "MusicXMLは、デジタル楽譜を複数の記譜ソフト間で編集可能な状態に保つオープンな交換フォーマットです。"
  },
  "Official MidiAI Studio product UI — starting point for MusicXML.": {
    ko: "MidiAI Studio 공식 제품 UI — MusicXML의 시작점입니다.",
    en: "Official MidiAI Studio product UI — starting point for MusicXML.",
    ja: "MidiAI Studio公式プロダクトUI — MusicXMLの出発点です。"
  },
  "MusicXML stores symbolic score information—pitches, rhythms, markings—optimized for notation interchange, unlike MIDI’s performance focus.": {
    ko: "MusicXML은 MIDI가 연주 중심인 것과 달리, 음높이, 리듬, 마킹 같은 기호적인 악보 정보를 표기 교환에 최적화된 형태로 저장합니다.",
    en: "MusicXML stores symbolic score information—pitches, rhythms, markings—optimized for notation interchange, unlike MIDI’s performance focus.",
    ja: "MusicXMLは、MIDIが演奏を重視するのとは異なり、音高・リズム・記号といった記譜情報を記譜交換に最適化して保存します。"
  },
  "Recognize or create a score, exchange via MusicXML, and optionally realize playback through MIDI.": {
    ko: "악보를 인식하거나 새로 만든 뒤 MusicXML로 교환하고, 필요하다면 MIDI로 재생을 구현하세요.",
    en: "Recognize or create a score, exchange via MusicXML, and optionally realize playback through MIDI.",
    ja: "楽譜を認識または新規作成し、MusicXMLで交換し、必要に応じてMIDIで再生を実現します。"
  },
  "Decide if you need notation structure (MusicXML) or performance data (MIDI).": {
    ko: "표기 구조(MusicXML)가 필요한지, 연주 데이터(MIDI)가 필요한지 결정하세요.",
    en: "Decide if you need notation structure (MusicXML) or performance data (MIDI).",
    ja: "記譜構造(MusicXML)が必要か、演奏データ(MIDI)が必要かを判断します。"
  },
  "Convert or edit in MidiAI Studio score/MIDI tools.": { ko: "MidiAI Studio의 악보/MIDI 도구로 변환하거나 편집하세요.", en: "Convert or edit in MidiAI Studio score/MIDI tools.", ja: "MidiAI Studioの楽譜/MIDIツールで変換・編集します。" },
  "Validate voices and measures.": { ko: "성부와 마디를 검증하세요.", en: "Validate voices and measures.", ja: "声部と小節を検証します。" },
  "Export to your notation app or DAW.": { ko: "표기 프로그램이나 DAW로 내보내세요.", en: "Export to your notation app or DAW.", ja: "記譜ソフトやDAWへ書き出します。" },
  "Features that matter for MusicXML": { ko: "MusicXML에서 중요한 기능", en: "Features that matter for MusicXML", ja: "MusicXMLで重要な機能" },
  "Score ↔ MIDI oriented tooling": { ko: "악보 ↔ MIDI 중심 도구", en: "Score ↔ MIDI oriented tooling", ja: "楽譜↔MIDI志向のツール群" },
  "PDF/MusicXML related paths": { ko: "PDF/MusicXML 관련 경로", en: "PDF/MusicXML related paths", ja: "PDF/MusicXML関連の経路" },
  "Editor cleanup": { ko: "에디터를 통한 정리", en: "Editor cleanup", ja: "エディタでのクリーンアップ" },
  "Official business & support presence": { ko: "공식 사업자 정보 및 지원 체계", en: "Official business & support presence", ja: "公式な事業者情報とサポート体制" },
  "Try MidiAI Studio for MusicXML": { ko: "MusicXML을 위해 MidiAI Studio를 사용해보세요", en: "Try MidiAI Studio for MusicXML", ja: "MusicXMLのためにMidiAI Studioを試してみましょう" },

  // ---- midi-converter-faq.html ------------------------------------------
  "MIDI Converter FAQ: PDF, YouTube, MP3, Audio & MusicXML": {
    ko: "MIDI 변환기 FAQ: PDF, YouTube, MP3, 오디오 & MusicXML",
    en: "MIDI Converter FAQ: PDF, YouTube, MP3, Audio & MusicXML",
    ja: "MIDI変換ツールFAQ:PDF、YouTube、MP3、オーディオ&MusicXML"
  },
  "Direct answers to the questions musicians ask before converting music to MIDI. For product-specific portal FAQ entries managed in-app, also see": {
    ko: "음악을 MIDI로 변환하기 전에 음악가들이 자주 묻는 질문에 답합니다. 앱 내에서 관리되는 제품별 포털 FAQ 항목은 다음에서도 확인하세요:",
    en: "Direct answers to the questions musicians ask before converting music to MIDI. For product-specific portal FAQ entries managed in-app, also see",
    ja: "音楽をMIDIに変換する前に、音楽家からよく寄せられる質問に答えます。アプリ内で管理されている製品固有のポータルFAQ項目は、こちらでも確認できます:"
  },
  "What is an AI MIDI converter?": { ko: "AI MIDI 변환기란 무엇인가요?", en: "What is an AI MIDI converter?", ja: "AI MIDI変換ツールとは何ですか?" },
  "An AI MIDI converter estimates musical notes from audio (or recognizes symbols from sheet music) and writes them as MIDI events you can edit in a piano roll or score view.": {
    ko: "AI MIDI 변환기는 오디오에서 음악적 노트를 추정하거나(또는 악보에서 기호를 인식하여) 이를 피아노 롤이나 악보 보기에서 편집할 수 있는 MIDI 이벤트로 기록합니다.",
    en: "An AI MIDI converter estimates musical notes from audio (or recognizes symbols from sheet music) and writes them as MIDI events you can edit in a piano roll or score view.",
    ja: "AI MIDI変換ツールは、オーディオから音楽的なノートを推定したり(または楽譜からシンボルを認識したりして)、それらをピアノロールや譜面ビューで編集できるMIDIイベントとして書き出します。"
  },
  "PDF to MIDI turns engraved or scanned sheet music into MIDI using optical music recognition (OMR), then optional cleanup in an editor. See": {
    ko: "PDF to MIDI는 광학 악보 인식(OMR)을 사용해 인쇄되거나 스캔한 악보를 MIDI로 변환한 뒤, 필요하다면 에디터에서 추가로 정리할 수 있습니다. 관련 페이지:",
    en: "PDF to MIDI turns engraved or scanned sheet music into MIDI using optical music recognition (OMR), then optional cleanup in an editor. See",
    ja: "PDF to MIDIは、光学楽譜認識(OMR)を使って印刷またはスキャンした楽譜をMIDIに変換し、必要に応じてエディタで仕上げます。詳しくは:"
  },
  "YouTube to MIDI converts a video’s musical performance—often piano covers—into editable MIDI. Start with clear piano-forward sources. Guide:": {
    ko: "YouTube to MIDI는 영상 속 음악 연주 — 주로 피아노 커버 — 를 편집 가능한 MIDI로 변환합니다. 피아노가 선명하게 들리는 소스로 시작하세요. 가이드:",
    en: "YouTube to MIDI converts a video’s musical performance—often piano covers—into editable MIDI. Start with clear piano-forward sources. Guide:",
    ja: "YouTube to MIDIは、動画内の演奏 — 多くはピアノカバー — を編集可能なMIDIに変換します。まずはピアノがはっきり聴こえる素材から始めましょう。ガイド:"
  },
  "MP3 to MIDI transcribes notes from compressed audio files. Cleaner, less-mixed recordings usually convert more accurately. Guide:": {
    ko: "MP3 to MIDI는 압축된 오디오 파일에서 노트를 채보합니다. 더 깨끗하고 믹싱이 덜 복잡한 녹음일수록 대체로 더 정확하게 변환됩니다. 가이드:",
    en: "MP3 to MIDI transcribes notes from compressed audio files. Cleaner, less-mixed recordings usually convert more accurately. Guide:",
    ja: "MP3 to MIDIは、圧縮されたオーディオファイルからノートを採譜します。よりクリーンでミックスが複雑でない録音ほど、通常はより正確に変換されます。ガイド:"
  },
  "What is audio to MIDI?": { ko: "audio to MIDI란 무엇인가요?", en: "What is audio to MIDI?", ja: "audio to MIDIとは何ですか?" },
  "Audio to MIDI is the general task of turning WAV/MP3/FLAC (or similar) recordings into MIDI note data. Guide:": {
    ko: "Audio to MIDI는 WAV/MP3/FLAC 등의 녹음 파일을 MIDI 노트 데이터로 바꾸는 일반적인 작업을 의미합니다. 가이드:",
    en: "Audio to MIDI is the general task of turning WAV/MP3/FLAC (or similar) recordings into MIDI note data. Guide:",
    ja: "Audio to MIDIは、WAV/MP3/FLACなど(またはそれに類する)録音をMIDIノートデータに変換する作業全般を指します。ガイド:"
  },
  "What is MusicXML and how is it different from MIDI?": { ko: "MusicXML은 무엇이고 MIDI와 어떻게 다른가요?", en: "What is MusicXML and how is it different from MIDI?", ja: "MusicXMLとは何ですか?MIDIとどう違いますか?" },
  "MusicXML stores notation structure for sheet music exchange. MIDI stores performance-oriented note events for playback and DAWs. Guide:": {
    ko: "MusicXML은 악보 교환을 위한 표기 구조를 저장합니다. 반면 MIDI는 재생과 DAW를 위한 연주 중심의 노트 이벤트를 저장합니다. 가이드:",
    en: "MusicXML stores notation structure for sheet music exchange. MIDI stores performance-oriented note events for playback and DAWs. Guide:",
    ja: "MusicXMLは楽譜交換のための記譜構造を保存します。一方MIDIは再生やDAWのための演奏志向のノートイベントを保存します。ガイド:"
  },
  "How does AI MIDI conversion work?": { ko: "AI MIDI 변환은 어떻게 작동하나요?", en: "How does AI MIDI conversion work?", ja: "AI MIDI変換はどのように機能しますか?" },
  "Models analyze time-frequency patterns (audio) or visual symbols (scores) to predict pitches and timings. Output should be treated as a draft that musicians edit.": {
    ko: "모델은 시간-주파수 패턴(오디오) 또는 시각적 기호(악보)를 분석해 음높이와 타이밍을 예측합니다. 결과물은 음악가가 편집해야 하는 초안으로 다뤄야 합니다.",
    en: "Models analyze time-frequency patterns (audio) or visual symbols (scores) to predict pitches and timings. Output should be treated as a draft that musicians edit.",
    ja: "モデルは時間-周波数パターン(オーディオ)や視覚的な記号(楽譜)を分析して音高とタイミングを予測します。出力は音楽家が編集すべきドラフトとして扱ってください。"
  },
  "Why is polyphonic piano harder than melody extraction?": { ko: "폴리포닉 피아노가 멜로디 추출보다 어려운 이유는 무엇인가요?", en: "Why is polyphonic piano harder than melody extraction?", ja: "ポリフォニックなピアノがメロディ抽出より難しいのはなぜですか?" },
  "Multiple simultaneous notes create overlapping spectra, so chord voicings and inner voices are easier to mis-detect than a single sung line.": {
    ko: "여러 음이 동시에 울리면 스펙트럼이 겹치기 때문에, 단선율보다 코드 보이싱과 내부 성부를 잘못 인식하기가 더 쉽습니다.",
    en: "Multiple simultaneous notes create overlapping spectra, so chord voicings and inner voices are easier to mis-detect than a single sung line.",
    ja: "複数の音が同時に鳴るとスペクトルが重なり合うため、単旋律に比べてコードのボイシングや内声部を誤検出しやすくなります。"
  },
  "Can MidiAI Studio convert YouTube links?": { ko: "MidiAI Studio는 YouTube 링크를 변환할 수 있나요?", en: "Can MidiAI Studio convert YouTube links?", ja: "MidiAI StudioはYouTubeのリンクを変換できますか?" },
  "Yes—MidiAI Studio is designed for YouTube-oriented piano cover workflows plus local audio intake on Windows. See": {
    ko: "네 — MidiAI Studio는 YouTube 기반 피아노 커버 워크플로우와 Windows에서의 로컬 오디오 입력을 모두 지원하도록 설계되었습니다. 자세히 보기:",
    en: "Yes—MidiAI Studio is designed for YouTube-oriented piano cover workflows plus local audio intake on Windows. See",
    ja: "はい — MidiAI StudioはYouTube向けピアノカバーのワークフローと、Windows上でのローカルオーディオ取り込みの両方に対応するよう設計されています。詳しくは:"
  },
  "Does MidiAI Studio run in the browser?": { ko: "MidiAI Studio는 브라우저에서 실행되나요?", en: "Does MidiAI Studio run in the browser?", ja: "MidiAI Studioはブラウザで動作しますか?" },
  "No. It is a Windows desktop application for conversion, editing, and score-related workflows with official licensing.": {
    ko: "아니요. MidiAI Studio는 변환, 편집, 악보 관련 워크플로우를 위한 Windows 데스크톱 애플리케이션이며 공식 라이선스를 통해 제공됩니다.",
    en: "No. It is a Windows desktop application for conversion, editing, and score-related workflows with official licensing.",
    ja: "いいえ。MidiAI Studioは、変換・編集・楽譜関連のワークフローのためのWindowsデスクトップアプリケーションで、正式なライセンスのもとで提供されます。"
  },
  "How can I improve conversion accuracy?": { ko: "변환 정확도를 높이려면 어떻게 해야 하나요?", en: "How can I improve conversion accuracy?", ja: "変換の精度を上げるにはどうすればいいですか?" },
  "Use cleaner sources, convert short sections first, avoid extreme effects, and always inspect the MIDI editor. Full tips:": {
    ko: "더 깨끗한 소스를 사용하고, 짧은 구간부터 먼저 변환하고, 과도한 이펙트를 피하고, 항상 MIDI 에디터에서 확인하세요. 자세한 팁:",
    en: "Use cleaner sources, convert short sections first, avoid extreme effects, and always inspect the MIDI editor. Full tips:",
    ja: "よりクリーンなソースを使い、まず短いセクションから変換し、過度なエフェクトを避け、常にMIDIエディタで確認しましょう。詳しいヒント:"
  },
  "Should I quantize AI MIDI?": { ko: "AI MIDI를 퀀타이즈해야 하나요?", en: "Should I quantize AI MIDI?", ja: "AI MIDIはクオンタイズすべきですか?" },
  "Quantize lightly for grid-based genres. For classical/jazz expression, preserve more human timing. Guide:": {
    ko: "그리드 기반 장르라면 가볍게 퀀타이즈하세요. 클래식/재즈처럼 표현이 중요한 경우에는 사람의 타이밍을 더 많이 남겨두세요. 가이드:",
    en: "Quantize lightly for grid-based genres. For classical/jazz expression, preserve more human timing. Guide:",
    ja: "グリッドベースのジャンルでは軽くクオンタイズしましょう。クラシックやジャズのような表現重視の場合は、人間らしいタイミングをより多く残してください。ガイド:"
  },
  "Is converting YouTube covers to MIDI legal?": { ko: "YouTube 커버를 MIDI로 변환하는 것은 합법인가요?", en: "Is converting YouTube covers to MIDI legal?", ja: "YouTubeのカバーをMIDIに変換するのは合法ですか?" },
  "Personal study differs from redistribution or commercial publishing. When unsure, get rights advice. Overview:": {
    ko: "개인 학습 목적과 재배포나 상업적 게시는 다르게 취급됩니다. 확실하지 않다면 권리 관련 조언을 구하세요. 개요:",
    en: "Personal study differs from redistribution or commercial publishing. When unsure, get rights advice. Overview:",
    ja: "個人的な学習目的と、再配布や商用公開は扱いが異なります。判断に迷う場合は権利に関する助言を得てください。概要:"
  },
  "What file should I export—MIDI or MusicXML?": { ko: "MIDI와 MusicXML 중 어떤 파일로 내보내야 하나요?", en: "What file should I export—MIDI or MusicXML?", ja: "MIDIとMusicXML、どちらの形式で書き出すべきですか?" },
  "Choose MIDI for DAWs/performance editing. Choose MusicXML when notation layout and engraving matter.": {
    ko: "DAW 작업이나 연주 편집에는 MIDI를 선택하세요. 표기 레이아웃과 인쇄 품질이 중요하다면 MusicXML을 선택하세요.",
    en: "Choose MIDI for DAWs/performance editing. Choose MusicXML when notation layout and engraving matter.",
    ja: "DAWでの作業や演奏編集にはMIDIを選びましょう。記譜のレイアウトや印刷品質が重要な場合はMusicXMLを選んでください。"
  },
  "Can I go from MIDI back to PDF sheet music?": { ko: "MIDI에서 다시 PDF 악보로 변환할 수 있나요?", en: "Can I go from MIDI back to PDF sheet music?", ja: "MIDIから再びPDF楽譜に変換できますか?" },
  "Yes—score conversion paths can produce printable results after cleanup. See": {
    ko: "네 — 악보 변환 경로를 거치면 정리 후 인쇄 가능한 결과물을 얻을 수 있습니다. 참고:",
    en: "Yes—score conversion paths can produce printable results after cleanup. See",
    ja: "はい — 楽譜変換の経路を使えば、仕上げ後に印刷可能な結果を得られます。参考:"
  },
  "Does MidiAI Studio include a MIDI editor?": { ko: "MidiAI Studio에는 MIDI 에디터가 포함되어 있나요?", en: "Does MidiAI Studio include a MIDI editor?", ja: "MidiAI StudioにはMIDIエディタが含まれていますか?" },
  "Yes. Conversion is paired with editing so you can fix pitches, timing, velocity, and instrument mapping before export.": {
    ko: "네. 변환 기능과 편집 기능이 함께 제공되어, 내보내기 전에 음정, 타이밍, 벨로시티, 악기 매핑을 수정할 수 있습니다.",
    en: "Yes. Conversion is paired with editing so you can fix pitches, timing, velocity, and instrument mapping before export.",
    ja: "はい。変換機能に編集機能が組み合わされているため、書き出す前に音程、タイミング、ベロシティ、楽器マッピングを修正できます。"
  },
  "What operating system is supported?": { ko: "어떤 운영체제를 지원하나요?", en: "What operating system is supported?", ja: "対応OSは何ですか?" },
  "Windows. Check": { ko: "지원 운영체제는 Windows입니다. 최신 설치 파일 위치:", en: "Windows. Check", ja: "対応OSはWindowsです。最新インストーラーの入手先:" },
  "for the current installer.": { ko: "", en: "for the current installer.", ja: "" },
  "How does licensing work?": { ko: "라이선스는 어떻게 작동하나요?", en: "How does licensing work?", ja: "ライセンスはどのように機能しますか?" },
  "Google login ties licenses to your account. Lifetime licenses are sold on the": {
    ko: "Google 로그인으로 계정에 라이선스가 연결됩니다. 평생 라이선스 구매처:",
    en: "Google login ties licenses to your account. Lifetime licenses are sold on the",
    ja: "Googleログインでアカウントにライセンスが紐づけられます。永久ライセンスの購入先:"
  },
  "Where do I get support?": { ko: "고객지원은 어디에서 받을 수 있나요?", en: "Where do I get support?", ja: "サポートはどこで受けられますか?" },
  "Use": { ko: "다음을 이용하세요:", en: "Use", ja: "以下をご利用ください:" },
  ", or email midiaistudio@gmail.com. Company details:": {
    ko: ", 또는 이메일 midiaistudio@gmail.com. 회사 정보:",
    en: ", or email midiaistudio@gmail.com. Company details:",
    ja: ", またはメール midiaistudio@gmail.com。会社情報:"
  },
  "Where is the version / update history?": { ko: "버전 / 업데이트 내역은 어디에서 확인할 수 있나요?", en: "Where is the version / update history?", ja: "バージョン/更新履歴はどこで確認できますか?" },
  "See official": { ko: "공식", en: "See official", ja: "公式の" },
  "for release history and fixes.": { ko: "에서 릴리스 내역과 수정 사항을 확인하세요.", en: "for release history and fixes.", ja: "でリリース履歴と修正内容を確認してください。" },
  "How is MidiAI Studio different from Basic Pitch or Melodyne?": { ko: "MidiAI Studio는 Basic Pitch나 Melodyne과 어떻게 다른가요?", en: "How is MidiAI Studio different from Basic Pitch or Melodyne?", ja: "MidiAI StudioはBasic PitchやMelodyneとどう違いますか?" },
  "Those tools excel at different jobs (research transcription or detailed pitch editing). MidiAI Studio focuses on a connected Windows workflow: intake → AI MIDI → edit → score interchange, with portal support. Read": {
    ko: "이런 도구들은 서로 다른 목적에 강점이 있습니다(연구용 채보 또는 세밀한 음정 편집). MidiAI Studio는 입력 → AI MIDI → 편집 → 악보 교환으로 이어지는 연결된 Windows 워크플로우와 포털 지원에 집중합니다. 더 알아보기:",
    en: "Those tools excel at different jobs (research transcription or detailed pitch editing). MidiAI Studio focuses on a connected Windows workflow: intake → AI MIDI → edit → score interchange, with portal support. Read",
    ja: "これらのツールはそれぞれ異なる用途に強みがあります(研究用の採譜や細かなピッチ編集など)。MidiAI Studioは、取り込み→AI MIDI→編集→楽譜連携という一続きのWindowsワークフローと、ポータルサポートに重点を置いています。詳しくは:"
  },
  "How is this different from ScanScore / PlayScore / MuseScore?": { ko: "ScanScore / PlayScore / MuseScore와는 어떻게 다른가요?", en: "How is this different from ScanScore / PlayScore / MuseScore?", ja: "ScanScore / PlayScore / MuseScoreとはどう違いますか?" },
  "OMR and notation suites specialize in scanning and engraving. MidiAI Studio complements score work with AI audio/YouTube-oriented MIDI conversion and editing in one product path.": {
    ko: "OMR 및 표기 전문 프로그램은 스캔과 인쇄 조판에 특화되어 있습니다. MidiAI Studio는 AI 오디오/YouTube 기반 MIDI 변환과 편집을 하나의 제품 흐름으로 제공하여 악보 작업을 보완합니다.",
    en: "OMR and notation suites specialize in scanning and engraving. MidiAI Studio complements score work with AI audio/YouTube-oriented MIDI conversion and editing in one product path.",
    ja: "OMRや記譜専門ソフトはスキャンや浄書に特化しています。MidiAI Studioは、AIによるオーディオ/YouTube向けMIDI変換と編集を一つの製品フローで提供することで、楽譜作業を補完します。"
  },
  "Where can I read long-form guides?": { ko: "더 긴 형식의 가이드는 어디에서 볼 수 있나요?", en: "Where can I read long-form guides?", ja: "詳細記事はどこで読めますか?" },
  "Open the": { ko: "다음을 열어보세요:", en: "Open the", ja: "こちらを開いてください:" },
  "—50 in-depth articles plus keyword landings for PDF, YouTube, MP3, Audio, and MusicXML.": {
    ko: "— 심층 아티클 50개와 PDF, YouTube, MP3, 오디오, MusicXML 키워드 랜딩 페이지를 만나보세요.",
    en: "—50 in-depth articles plus keyword landings for PDF, YouTube, MP3, Audio, and MusicXML.",
    ja: "— 詳細記事50本と、PDF、YouTube、MP3、オーディオ、MusicXMLのキーワードランディングページをご覧いただけます。"
  },
  "Who publishes MidiAI Studio?": { ko: "MidiAI Studio는 누가 운영하나요?", en: "Who publishes MidiAI Studio?", ja: "MidiAI Studioの運営者は誰ですか?" },
  "미디에이아이스튜디오 (representative 최정환). Business disclosure:": {
    ko: "미디에이아이스튜디오 (대표 최정환). 사업자 정보:",
    en: "미디에이아이스튜디오 (representative 최정환). Business disclosure:",
    ja: "미디에이아이스튜디오(代表:최정환)。事業者情報:"
  },
  "Ready to convert?": { ko: "지금 변환해볼까요?", en: "Ready to convert?", ja: "さっそく変換してみましょう" },
  "Download MidiAI Studio": { ko: "MidiAI Studio 다운로드", en: "Download MidiAI Studio", ja: "MidiAI Studioをダウンロード" },
  "Browse guides": { ko: "가이드 둘러보기", en: "Browse guides", ja: "ガイドを見る" },
  "AI MIDI converter for Windows.": { ko: "Windows용 AI MIDI 변환기입니다.", en: "AI MIDI converter for Windows.", ja: "Windows向けAI MIDI変換ツールです。" },

  // ---- 50 article H1 titles ---------------------------------------------
  "Turning a PDF Score Into Playable, Editable MIDI": { ko: "PDF 악보를 연주 가능한 편집형 MIDI로 바꾸기", en: "Turning a PDF Score Into Playable, Editable MIDI", ja: "PDF楽譜を演奏・編集可能なMIDIに変える" },
  "Making a PDF Score Editable Instead of Just Viewable": { ko: "보기만 하던 PDF 악보를 편집 가능하게 만들기", en: "Making a PDF Score Editable Instead of Just Viewable", ja: "見るだけだったPDF楽譜を編集可能にする" },
  "How Optical Music Recognition Reads a Score": { ko: "광학 악보 인식(OMR)은 악보를 어떻게 읽어낼까", en: "How Optical Music Recognition Reads a Score", ja: "光学楽譜認識(OMR)は楽譜をどう読み取るか" },
  "Turning a PDF Into MusicXML You Can Re-Engrave": { ko: "다시 조판할 수 있는 MusicXML로 PDF 바꾸기", en: "Turning a PDF Into MusicXML You Can Re-Engrave", ja: "再浄書できるMusicXMLにPDFを変換する" },
  "Editing Sheet Music Digitally: A Practical Approach": { ko: "디지털 악보 편집하기: 실전 접근법", en: "Editing Sheet Music Digitally: A Practical Approach", ja: "楽譜をデジタルで編集する:実践的アプローチ" },
  "Turning a MIDI File Into Printable Sheet Music": { ko: "MIDI 파일을 인쇄 가능한 악보로 바꾸기", en: "Turning a MIDI File Into Printable Sheet Music", ja: "MIDIファイルを印刷可能な楽譜に変える" },
  "Building a Reliable Score Editor Workflow": { ko: "신뢰할 수 있는 악보 에디터 워크플로우 만들기", en: "Building a Reliable Score Editor Workflow", ja: "信頼できる譜面エディタのワークフローを構築する" },
  "Converting a YouTube Performance Into MIDI": { ko: "YouTube 연주 영상을 MIDI로 변환하기", en: "Converting a YouTube Performance Into MIDI", ja: "YouTubeの演奏動画をMIDIに変換する" },
  "Turning YouTube Piano Covers Into MIDI You Can Study": { ko: "YouTube 피아노 커버를 학습용 MIDI로 바꾸기", en: "Turning YouTube Piano Covers Into MIDI You Can Study", ja: "YouTubeのピアノカバーを学習用MIDIに変える" },
  "Using Converted YouTube MIDI to Actually Learn Piano": { ko: "변환한 YouTube MIDI로 실제로 피아노 배우기", en: "Using Converted YouTube MIDI to Actually Learn Piano", ja: "変換したYouTube MIDIで実際にピアノを学ぶ" },
  "Understanding Copyright When Converting YouTube to MIDI": { ko: "YouTube를 MIDI로 변환할 때의 저작권 이해하기", en: "Understanding Copyright When Converting YouTube to MIDI", ja: "YouTubeをMIDIに変換する際の著作権を理解する" },
  "Converting Cover Songs to MIDI the Responsible Way": { ko: "커버 곡을 책임감 있게 MIDI로 변환하는 방법", en: "Converting Cover Songs to MIDI the Responsible Way", ja: "カバー曲を責任を持ってMIDIに変換する方法" },
  "How Content Creators Use Converted MIDI": { ko: "콘텐츠 크리에이터는 변환된 MIDI를 어떻게 활용할까", en: "How Content Creators Use Converted MIDI", ja: "コンテンツクリエイターは変換したMIDIをどう活用するか" },
  "Converting an MP3 Recording Into MIDI Notes": { ko: "MP3 녹음을 MIDI 노트로 변환하기", en: "Converting an MP3 Recording Into MIDI Notes", ja: "MP3の録音をMIDIノートに変換する" },
  "Getting Clean Piano MIDI From an MP3 Recording": { ko: "MP3 녹음에서 깨끗한 피아노 MIDI 얻기", en: "Getting Clean Piano MIDI From an MP3 Recording", ja: "MP3の録音からクリーンなピアノMIDIを得る" },
  "How AI Turns Audio Into MIDI": { ko: "AI는 오디오를 어떻게 MIDI로 바꿀까", en: "How AI Turns Audio Into MIDI", ja: "AIはどのようにオーディオをMIDIに変えるのか" },
  "Converting Uncompressed WAV Audio Into MIDI": { ko: "비압축 WAV 오디오를 MIDI로 변환하기", en: "Converting Uncompressed WAV Audio Into MIDI", ja: "非圧縮のWAVオーディオをMIDIに変換する" },
  "Converting FLAC Audio Into MIDI Without Losing Detail": { ko: "디테일을 잃지 않고 FLAC 오디오를 MIDI로 변환하기", en: "Converting FLAC Audio Into MIDI Without Losing Detail", ja: "音の詳細を損なわずにFLACオーディオをMIDIに変換する" },
  "Practical Habits for Accurate Audio-to-MIDI": { ko: "정확한 오디오-투-MIDI를 위한 실전 습관", en: "Practical Habits for Accurate Audio-to-MIDI", ja: "精度の高いオーディオtoMIDIのための実践的な習慣" },
  "Improving the Accuracy of a Converted MIDI File": { ko: "변환된 MIDI 파일의 정확도 높이기", en: "Improving the Accuracy of a Converted MIDI File", ja: "変換したMIDIファイルの精度を高める" },
  "What MusicXML Is and Why It Matters": { ko: "MusicXML이란 무엇이고 왜 중요한가", en: "What MusicXML Is and Why It Matters", ja: "MusicXMLとは何か、なぜ重要なのか" },
  "MusicXML vs MIDI: Choosing the Right Format": { ko: "MusicXML vs MIDI: 올바른 형식 선택하기", en: "MusicXML vs MIDI: Choosing the Right Format", ja: "MusicXML vs MIDI:正しい形式の選び方" },
  "Converting MusicXML Into a MIDI Performance": { ko: "MusicXML을 MIDI 연주로 변환하기", en: "Converting MusicXML Into a MIDI Performance", ja: "MusicXMLをMIDI演奏に変換する" },
  "Converting MIDI Into MusicXML Notation": { ko: "MIDI를 MusicXML 표기로 변환하기", en: "Converting MIDI Into MusicXML Notation", ja: "MIDIをMusicXML記譜に変換する" },
  "Converting Piano to MIDI: The Ideal Case": { ko: "피아노를 MIDI로 변환하기: 가장 이상적인 경우", en: "Converting Piano to MIDI: The Ideal Case", ja: "ピアノをMIDIに変換する:最も理想的なケース" },
  "Transcribing Polyphonic Piano, Note by Note": { ko: "폴리포닉 피아노를 한 음씩 채보하기", en: "Transcribing Polyphonic Piano, Note by Note", ja: "ポリフォニックなピアノを一音ずつ採譜する" },
  "Monophonic vs Polyphonic Transcription Explained": { ko: "모노포닉 vs 폴리포닉 채보, 그 차이 이해하기", en: "Monophonic vs Polyphonic Transcription Explained", ja: "モノフォニックとポリフォニック採譜の違いを解説" },
  "Transcribing Classical Piano Repertoire to MIDI": { ko: "클래식 피아노 레퍼토리를 MIDI로 채보하기", en: "Transcribing Classical Piano Repertoire to MIDI", ja: "クラシックピアノのレパートリーをMIDIに採譜する" },
  "Why Jazz Piano Is Uniquely Hard to Transcribe": { ko: "재즈 피아노 채보가 유난히 어려운 이유", en: "Why Jazz Piano Is Uniquely Hard to Transcribe", ja: "ジャズピアノの採譜が特に難しい理由" },
  "Converting Guitar Recordings Into MIDI": { ko: "기타 녹음을 MIDI로 변환하기", en: "Converting Guitar Recordings Into MIDI", ja: "ギターの録音をMIDIに変換する" },
  "Extracting Drum MIDI From a Recording": { ko: "녹음에서 드럼 MIDI 추출하기", en: "Extracting Drum MIDI From a Recording", ja: "録音からドラムMIDIを抽出する" },
  "Converting a Vocal Melody Into MIDI": { ko: "보컬 멜로디를 MIDI로 변환하기", en: "Converting a Vocal Melody Into MIDI", ja: "ボーカルメロディをMIDIに変換する" },
  "How Different Instruments Convert to MIDI": { ko: "악기별로 MIDI 변환은 어떻게 다를까", en: "How Different Instruments Convert to MIDI", ja: "楽器ごとにMIDI変換はどう違うのか" },
  "The Fundamentals of Editing MIDI": { ko: "MIDI 편집의 기본기", en: "The Fundamentals of Editing MIDI", ja: "MIDI編集の基本" },
  "Turning Raw AI MIDI Into a Clean, Musical Part": { ko: "거친 AI MIDI를 깔끔하고 음악적인 파트로 다듬기", en: "Turning Raw AI MIDI Into a Clean, Musical Part", ja: "生のAI MIDIをクリーンで音楽的なパートに仕上げる" },
  "Adding Real Expression to Converted MIDI": { ko: "변환된 MIDI에 진짜 표현력 더하기", en: "Adding Real Expression to Converted MIDI", ja: "変換したMIDIに本物の表現力を加える" },
  "Quantizing Converted MIDI the Musical Way": { ko: "변환된 MIDI를 음악적으로 퀀타이즈하는 방법", en: "Quantizing Converted MIDI the Musical Way", ja: "変換したMIDIを音楽的にクオンタイズする方法" },
  "Working With Converted MIDI in Your DAW": { ko: "DAW에서 변환된 MIDI 다루기", en: "Working With Converted MIDI in Your DAW", ja: "DAWで変換したMIDIを扱う" },
  "Bringing Converted MIDI Into Ableton Live": { ko: "변환된 MIDI를 Ableton Live로 가져오기", en: "Bringing Converted MIDI Into Ableton Live", ja: "変換したMIDIをAbleton Liveに取り込む" },
  "Bringing Converted MIDI Into FL Studio": { ko: "변환된 MIDI를 FL Studio로 가져오기", en: "Bringing Converted MIDI Into FL Studio", ja: "変換したMIDIをFL Studioに取り込む" },
  "Bringing Converted MIDI Into Logic Pro": { ko: "변환된 MIDI를 Logic Pro로 가져오기", en: "Bringing Converted MIDI Into Logic Pro", ja: "変換したMIDIをLogic Proに取り込む" },
  "How AI MIDI Conversion Actually Works": { ko: "AI MIDI 변환은 실제로 어떻게 작동할까", en: "How AI MIDI Conversion Actually Works", ja: "AI MIDI変換は実際どのように機能するのか" },
  "A Complete Guide to AI Music Transcription": { ko: "AI 음악 채보 완전 가이드", en: "A Complete Guide to AI Music Transcription", ja: "AI音楽採譜の完全ガイド" },
  "MIDI vs Audio: Understanding the Core Difference": { ko: "MIDI vs 오디오: 근본적인 차이 이해하기", en: "MIDI vs Audio: Understanding the Core Difference", ja: "MIDI vs オーディオ:本質的な違いを理解する" },
  "Understanding MIDI Files From Scratch": { ko: "처음부터 이해하는 MIDI 파일", en: "Understanding MIDI Files From Scratch", ja: "ゼロから理解するMIDIファイル" },
  "Comparing AI Music Transcription Tools Fairly": { ko: "AI 음악 채보 도구, 공정하게 비교하기", en: "Comparing AI Music Transcription Tools Fairly", ja: "AI音楽採譜ツールを公平に比較する" },
  "Choosing Between Offline and Online MIDI Conversion": { ko: "오프라인과 온라인 MIDI 변환 중 선택하기", en: "Choosing Between Offline and Online MIDI Conversion", ja: "オフラインとオンラインのMIDI変換、どちらを選ぶか" },
  "MIDI Conversion Software for Windows Users": { ko: "Windows 사용자를 위한 MIDI 변환 소프트웨어", en: "MIDI Conversion Software for Windows Users", ja: "WindowsユーザーのためのMIDI変換ソフト" },
  "AI Conversion vs Transcribing By Hand": { ko: "AI 변환 vs 직접 채보하기", en: "AI Conversion vs Transcribing By Hand", ja: "AI変換 vs 手作業での採譜" },
  "How Music Teachers Can Use Converted MIDI": { ko: "음악 교사는 변환된 MIDI를 어떻게 활용할 수 있을까", en: "How Music Teachers Can Use Converted MIDI", ja: "音楽教師は変換したMIDIをどう活用できるか" },

  // ---- Hub card keyword phrases + descriptions (50 articles) -----------
  "convert PDF sheet music to MIDI": { ko: "PDF 악보를 MIDI로 변환", en: "convert PDF sheet music to MIDI", ja: "PDF楽譜をMIDIに変換" },
  "A practical, end-to-end walkthrough of converting PDF sheet music into MIDI you can edit, transpose, and play back — including where optical music recognition helps and where it needs a human.": {
    ko: "PDF 악보를 편집·이조·재생까지 가능한 MIDI로 변환하는 실전 가이드입니다 — 광학 악보 인식이 도움이 되는 지점과 사람의 손길이 필요한 지점까지 함께 다룹니다.",
    en: "A practical, end-to-end walkthrough of converting PDF sheet music into MIDI you can edit, transpose, and play back — including where optical music recognition helps and where it needs a human.",
    ja: "PDF楽譜を編集・移調・再生できるMIDIに変換する実践的なウォークスルーです — 光学楽譜認識が役立つ場面と、人の手が必要な場面まで解説します。"
  },
  "editable MIDI from PDF scores": { ko: "PDF 악보에서 편집 가능한 MIDI", en: "editable MIDI from PDF scores", ja: "PDF楽譜から編集可能なMIDI" },
  "How to turn a read-only PDF of sheet music into MIDI you can actually rearrange, re-voice, and rescore — with a focus on the editing freedom that conversion unlocks.": {
    ko: "읽기 전용 PDF 악보를 실제로 재편곡하고, 보이싱을 바꾸고, 다시 조판할 수 있는 MIDI로 바꾸는 방법 — 변환이 열어주는 편집의 자유에 초점을 맞춥니다.",
    en: "How to turn a read-only PDF of sheet music into MIDI you can actually rearrange, re-voice, and rescore — with a focus on the editing freedom that conversion unlocks.",
    ja: "読み取り専用のPDF楽譜を、実際に再編曲・ボイシング変更・再浄書できるMIDIに変える方法 — 変換によって得られる編集の自由度に焦点を当てます。"
  },
  "optical music recognition OMR": { ko: "광학 악보 인식(OMR)", en: "optical music recognition OMR", ja: "光学楽譜認識(OMR)" },
  "A clear look at optical music recognition — the sheet-music equivalent of OCR — covering how engines find staves, decode symbols, and where recognition confidence breaks down.": {
    ko: "OCR의 악보판이라 할 수 있는 광학 악보 인식을 명확하게 살펴봅니다 — 엔진이 오선을 찾아내고 기호를 해독하는 방식, 그리고 인식 신뢰도가 흔들리는 지점까지 다룹니다.",
    en: "A clear look at optical music recognition — the sheet-music equivalent of OCR — covering how engines find staves, decode symbols, and where recognition confidence breaks down.",
    ja: "楽譜版のOCRともいえる光学楽譜認識を明快に解説します — エンジンが五線を検出し記号を解読する方法、そして認識の信頼度が崩れる場面まで。"
  },
  "PDF to MusicXML conversion": { ko: "PDF to MusicXML 변환", en: "PDF to MusicXML conversion", ja: "PDF to MusicXML変換" },
  "When you need to re-engrave rather than just play back, MusicXML is the target. This guide covers converting PDF scores into MusicXML and why it preserves more than MIDI.": {
    ko: "단순 재생이 아니라 다시 조판해야 할 때는 MusicXML이 목표가 됩니다. 이 가이드는 PDF 악보를 MusicXML로 변환하는 방법과 MIDI보다 더 많은 정보를 보존하는 이유를 다룹니다.",
    en: "When you need to re-engrave rather than just play back, MusicXML is the target. This guide covers converting PDF scores into MusicXML and why it preserves more than MIDI.",
    ja: "単に再生するだけでなく再浄書が必要な場合、目指すべきはMusicXMLです。このガイドでは、PDF楽譜をMusicXMLに変換する方法と、MIDIより多くの情報を保持できる理由を解説します。"
  },
  "edit sheet music digitally": { ko: "디지털로 악보 편집하기", en: "edit sheet music digitally", ja: "楽譜をデジタルで編集する" },
  "Once a score is digital, editing it is a different craft than marking up paper. This guide covers the mindset and moves for editing converted sheet music cleanly.": {
    ko: "악보가 디지털화되면, 편집은 종이에 표시하는 것과는 전혀 다른 작업이 됩니다. 이 가이드는 변환된 악보를 깔끔하게 편집하기 위한 사고방식과 실제 작업법을 다룹니다.",
    en: "Once a score is digital, editing it is a different craft than marking up paper. This guide covers the mindset and moves for editing converted sheet music cleanly.",
    ja: "楽譜がデジタル化されると、編集は紙に書き込む作業とは全く違う作業になります。このガイドでは、変換した楽譜をきれいに編集するための考え方と具体的な手順を解説します。"
  },
  "MIDI to PDF sheet music": { ko: "MIDI를 PDF 악보로", en: "MIDI to PDF sheet music", ja: "MIDIをPDF楽譜へ" },
  "Going the other direction — from MIDI back to a clean printed page — requires quantization, spelling, and layout choices. Here is how to get readable sheet music out of raw MIDI.": {
    ko: "반대 방향으로 — MIDI에서 깨끗한 인쇄 페이지로 — 가려면 퀀타이즈, 음이름 표기, 레이아웃 선택이 필요합니다. 원본 MIDI에서 읽기 좋은 악보를 뽑아내는 방법을 소개합니다.",
    en: "Going the other direction — from MIDI back to a clean printed page — requires quantization, spelling, and layout choices. Here is how to get readable sheet music out of raw MIDI.",
    ja: "反対方向、つまりMIDIから見やすい印刷ページへ戻すには、クオンタイズ、音名表記、レイアウトの選択が必要です。生のMIDIから読みやすい楽譜を作る方法を紹介します。"
  },
  "MIDI score editor workflow": { ko: "MIDI 악보 에디터 워크플로우", en: "MIDI score editor workflow", ja: "MIDI譜面エディタのワークフロー" },
  "A repeatable workflow for taking a converted score through a notation editor to a clean, performance-ready result — from import checks to part extraction.": {
    ko: "변환된 악보를 표기 에디터에 넣어 깔끔하고 연주 가능한 결과물로 만드는 반복 가능한 워크플로우 — 가져오기 점검부터 파트 추출까지 다룹니다.",
    en: "A repeatable workflow for taking a converted score through a notation editor to a clean, performance-ready result — from import checks to part extraction.",
    ja: "変換した楽譜を記譜エディタに通し、きれいで演奏可能な状態に仕上げるための再現性のあるワークフロー — インポート時の確認からパート抽出まで。"
  },
  "YouTube piano cover to MIDI": { ko: "YouTube 피아노 커버를 MIDI로", en: "YouTube piano cover to MIDI", ja: "YouTubeピアノカバーをMIDIへ" },
  "A grounded explanation of turning the audio from a YouTube performance into MIDI notes, what the compressed source costs you, and how to get the cleanest possible result.": {
    ko: "YouTube 연주의 오디오를 MIDI 노트로 바꾸는 과정을 현실적으로 설명합니다. 압축된 소스가 치르는 대가와 가능한 가장 깨끗한 결과를 얻는 방법까지 다룹니다.",
    en: "A grounded explanation of turning the audio from a YouTube performance into MIDI notes, what the compressed source costs you, and how to get the cleanest possible result.",
    ja: "YouTubeの演奏音源をMIDIノートに変換する過程を現実的に解説します。圧縮されたソースが引き起こす代償と、可能な限りクリーンな結果を得る方法まで。"
  },
  "step-by-step YouTube piano MIDI": { ko: "단계별 YouTube 피아노 MIDI", en: "step-by-step YouTube piano MIDI", ja: "ステップ別YouTubeピアノMIDI" },
  "Piano covers are the sweet spot for audio-to-MIDI. This guide covers getting accurate, study-ready MIDI from solo piano covers, including pedal, voicing, and arrangement quirks.": {
    ko: "피아노 커버는 오디오-투-MIDI에 가장 적합한 영역입니다. 이 가이드는 솔로 피아노 커버에서 정확하고 학습에 바로 쓸 수 있는 MIDI를 얻는 방법을 다루며, 페달, 보이싱, 편곡상의 특징까지 포함합니다.",
    en: "Piano covers are the sweet spot for audio-to-MIDI. This guide covers getting accurate, study-ready MIDI from solo piano covers, including pedal, voicing, and arrangement quirks.",
    ja: "ピアノカバーはオーディオtoMIDIに最適な領域です。このガイドでは、ソロピアノカバーから正確で学習に使えるMIDIを得る方法を、ペダル、ボイシング、編曲の特徴まで含めて解説します。"
  },
  "learn piano with YouTube MIDI": { ko: "YouTube MIDI로 피아노 배우기", en: "learn piano with YouTube MIDI", ja: "YouTube MIDIでピアノを学ぶ" },
  "How to turn YouTube performances into a personal practice system — slowing passages, looping tricky bars, and reading along — using converted MIDI as your study material.": {
    ko: "YouTube 연주를 나만의 연습 시스템으로 바꾸는 방법 — 구간을 느리게 재생하고, 어려운 마디를 반복하고, 악보를 따라 읽는 등 변환된 MIDI를 학습 자료로 활용합니다.",
    en: "How to turn YouTube performances into a personal practice system — slowing passages, looping tricky bars, and reading along — using converted MIDI as your study material.",
    ja: "YouTubeの演奏を自分だけの練習システムに変える方法 — パッセージをスロー再生したり、難しい小節をループしたり、譜面を目で追ったりと、変換したMIDIを学習素材として活用します。"
  },
  "YouTube MIDI copyright basics": { ko: "YouTube MIDI 저작권 기초", en: "YouTube MIDI copyright basics", ja: "YouTube MIDIの著作権基礎" },
  "A plain-language look at how copyright intersects with transcribing YouTube performances to MIDI — what transcription is, where composition rights sit, and how to stay on solid ground.": {
    ko: "YouTube 연주를 MIDI로 채보하는 것과 저작권이 어떻게 맞닿아 있는지 쉬운 말로 살펴봅니다 — 채보란 무엇인지, 작곡 저작권은 어디에 있는지, 안전하게 활동하는 방법까지 다룹니다.",
    en: "A plain-language look at how copyright intersects with transcribing YouTube performances to MIDI — what transcription is, where composition rights sit, and how to stay on solid ground.",
    ja: "YouTubeの演奏をMIDIに採譜することと著作権がどう関わるのかを、わかりやすく解説します — 採譜とは何か、作曲権はどこにあるのか、そして安全な立ち位置を保つ方法まで。"
  },
  "legal checklist cover song MIDI": { ko: "커버 곡 MIDI 법률 체크리스트", en: "legal checklist cover song MIDI", ja: "カバー曲MIDIの法的チェックリスト" },
  "A practical guide to transcribing cover songs into MIDI while respecting both the original composition and the cover arranger, with concrete paths to legitimate use.": {
    ko: "원곡과 커버 편곡자 모두를 존중하면서 커버 곡을 MIDI로 채보하는 실전 가이드입니다. 합법적으로 활용할 수 있는 구체적인 방법까지 안내합니다.",
    en: "A practical guide to transcribing cover songs into MIDI while respecting both the original composition and the cover arranger, with concrete paths to legitimate use.",
    ja: "原曲とカバー編曲者の両方を尊重しながら、カバー曲をMIDIに採譜するための実践ガイドです。合法的に活用するための具体的な方法まで紹介します。"
  },
  "MIDI for music content creators": { ko: "음악 콘텐츠 크리에이터를 위한 MIDI", en: "MIDI for music content creators", ja: "音楽コンテンツクリエイターのためのMIDI" },
  "For video makers, streamers, and podcasters, converted MIDI is a fast route to customizable, adaptable music. This guide shows how creators put transcription to work.": {
    ko: "영상 제작자, 스트리머, 팟캐스터에게 변환된 MIDI는 자유롭게 커스터마이즈할 수 있는 음악으로 가는 빠른 길입니다. 이 가이드는 크리에이터가 채보를 실제로 어떻게 활용하는지 보여줍니다.",
    en: "For video makers, streamers, and podcasters, converted MIDI is a fast route to customizable, adaptable music. This guide shows how creators put transcription to work.",
    ja: "動画クリエイター、ストリーマー、ポッドキャスターにとって、変換したMIDIはカスタマイズ自在な音楽への近道です。このガイドでは、クリエイターが採譜をどう活用しているかを紹介します。"
  },
  "extract MIDI notes from MP3": { ko: "MP3에서 MIDI 노트 추출", en: "extract MIDI notes from MP3", ja: "MP3からMIDIノートを抽出" },
  "MP3 is lossy by design, which shapes every MIDI transcription made from it. This guide explains what an MP3 preserves, what it discards, and how to convert one well.": {
    ko: "MP3는 원래 손실 압축 방식이라 이것에서 만드는 모든 MIDI 채보에 영향을 줍니다. 이 가이드는 MP3가 무엇을 보존하고 무엇을 버리는지, 그리고 잘 변환하는 방법을 설명합니다.",
    en: "MP3 is lossy by design, which shapes every MIDI transcription made from it. This guide explains what an MP3 preserves, what it discards, and how to convert one well.",
    ja: "MP3はもともと非可逆圧縮であり、そこから作るすべてのMIDI採譜に影響します。このガイドでは、MP3が何を保持し何を捨てているのか、そしてうまく変換する方法を解説します。"
  },
  "piano MP3 to MIDI transcription": { ko: "피아노 MP3를 MIDI로 채보", en: "piano MP3 to MIDI transcription", ja: "ピアノMP3のMIDI採譜" },
  "Piano recordings are forgiving audio sources even as MP3s. This guide focuses on transcribing piano from MP3 files, handling pedal, dynamics, and compression together.": {
    ko: "피아노 녹음은 MP3라도 비교적 다루기 쉬운 소스입니다. 이 가이드는 MP3 파일에서 피아노를 채보하는 데 집중하며, 페달, 다이내믹, 압축을 함께 다루는 방법을 설명합니다.",
    en: "Piano recordings are forgiving audio sources even as MP3s. This guide focuses on transcribing piano from MP3 files, handling pedal, dynamics, and compression together.",
    ja: "ピアノの録音はMP3であっても比較的扱いやすいソースです。このガイドはMP3ファイルからのピアノ採譜に焦点を当て、ペダル、ダイナミクス、圧縮を同時に扱う方法を解説します。"
  },
  "AI audio transcription to MIDI": { ko: "AI 오디오 채보 to MIDI", en: "AI audio transcription to MIDI", ja: "AIオーディオ採譜toMIDI" },
  "A focused look at the AI behind modern audio-to-MIDI: what the models learned, why they outperform older methods, and where machine listening still meets its limits.": {
    ko: "현대 오디오-투-MIDI를 뒷받침하는 AI를 집중적으로 살펴봅니다: 모델이 무엇을 학습했는지, 기존 방식보다 뛰어난 이유, 그리고 기계 청취가 여전히 한계에 부딪히는 지점까지 다룹니다.",
    en: "A focused look at the AI behind modern audio-to-MIDI: what the models learned, why they outperform older methods, and where machine listening still meets its limits.",
    ja: "現代のオーディオtoMIDIを支えるAIに焦点を当てて解説します:モデルが何を学習したのか、旧来の手法より優れている理由、そして機械によるリスニングがまだ限界に達する場面まで。"
  },
  "WAV to MIDI conversion quality": { ko: "WAV to MIDI 변환 품질", en: "WAV to MIDI conversion quality", ja: "WAV to MIDI変換の品質" },
  "WAV gives a transcriber everything the recording captured. This guide explains why lossless audio raises your accuracy ceiling and how to make the most of a WAV source.": {
    ko: "WAV는 녹음이 담아낸 모든 정보를 채보 엔진에 그대로 전달합니다. 이 가이드는 무손실 오디오가 정확도의 상한선을 왜 끌어올리는지, WAV 소스를 최대한 활용하는 방법을 설명합니다.",
    en: "WAV gives a transcriber everything the recording captured. This guide explains why lossless audio raises your accuracy ceiling and how to make the most of a WAV source.",
    ja: "WAVは録音が捉えたすべての情報を採譜エンジンにそのまま渡します。このガイドでは、非圧縮オーディオが精度の上限をなぜ引き上げるのか、そしてWAVソースを最大限活用する方法を解説します。"
  },
  "FLAC to MIDI transcription": { ko: "FLAC to MIDI 채보", en: "FLAC to MIDI transcription", ja: "FLAC to MIDI採譜" },
  "FLAC compresses without discarding anything, making it an ideal transcription source. This guide explains how FLAC differs from MP3 and WAV and how to convert it well.": {
    ko: "FLAC는 아무것도 버리지 않고 압축하기 때문에 채보에 이상적인 소스입니다. 이 가이드는 FLAC가 MP3, WAV와 어떻게 다른지, 그리고 잘 변환하는 방법을 설명합니다.",
    en: "FLAC compresses without discarding anything, making it an ideal transcription source. This guide explains how FLAC differs from MP3 and WAV and how to convert it well.",
    ja: "FLACは何も捨てずに圧縮するため、採譜に理想的なソースです。このガイドでは、FLACがMP3やWAVとどう違うのか、そしてうまく変換する方法を解説します。"
  },
  "audio to MIDI accuracy checklist": { ko: "오디오 to MIDI 정확도 체크리스트", en: "audio to MIDI accuracy checklist", ja: "オーディオtoMIDI精度チェックリスト" },
  "A concentrated set of habits that reliably improve audio-to-MIDI results, from source selection through instrument isolation to smart, targeted cleanup.": {
    ko: "오디오-투-MIDI 결과를 확실히 개선하는 습관들을 모았습니다. 소스 선택부터 악기 분리, 목표를 정한 정리 작업까지 다룹니다.",
    en: "A concentrated set of habits that reliably improve audio-to-MIDI results, from source selection through instrument isolation to smart, targeted cleanup.",
    ja: "オーディオtoMIDIの結果を確実に改善する習慣を集めました。ソースの選定から楽器の分離、的を絞ったクリーンアップまでを扱います。"
  },
  "improve AI MIDI accuracy": { ko: "AI MIDI 정확도 개선하기", en: "improve AI MIDI accuracy", ja: "AI MIDIの精度を改善する" },
  "Whatever the source, a converted MIDI can almost always be made more accurate. This guide is a focused toolkit for diagnosing and correcting conversion errors efficiently.": {
    ko: "소스가 무엇이든 변환된 MIDI는 거의 항상 더 정확하게 만들 수 있습니다. 이 가이드는 변환 오류를 효율적으로 진단하고 수정하기 위한 집중 툴킷입니다.",
    en: "Whatever the source, a converted MIDI can almost always be made more accurate. This guide is a focused toolkit for diagnosing and correcting conversion errors efficiently.",
    ja: "ソースが何であれ、変換したMIDIはほぼ常にさらに精度を高められます。このガイドは、変換時のエラーを効率的に診断・修正するための集中ツールキットです。"
  },
  "what is MusicXML format": { ko: "MusicXML 형식이란", en: "what is MusicXML format", ja: "MusicXML形式とは" },
  "A clear explanation of MusicXML — what it stores, why it exists, and how it lets notation travel between programs — for musicians who keep encountering the term.": {
    ko: "MusicXML을 명확하게 설명합니다 — 무엇을 저장하는지, 왜 존재하는지, 그리고 어떻게 여러 프로그램 사이에서 표기가 이동할 수 있게 하는지 — 이 용어를 자주 접하는 음악가를 위한 글입니다.",
    en: "A clear explanation of MusicXML — what it stores, why it exists, and how it lets notation travel between programs — for musicians who keep encountering the term.",
    ja: "MusicXMLをわかりやすく解説します — 何を保存し、なぜ存在し、どのように記譜を複数のソフト間で行き来させるのか — この用語によく出会う音楽家のための記事です。"
  },
  "MusicXML vs MIDI differences": { ko: "MusicXML vs MIDI 차이점", en: "MusicXML vs MIDI differences", ja: "MusicXML vs MIDIの違い" },
  "A side-by-side comparison of MusicXML and MIDI, clarifying what each stores, what each loses, and which to choose for playback, editing, notation, or archiving.": {
    ko: "MusicXML과 MIDI를 나란히 비교하며, 각각 무엇을 저장하고 무엇을 잃는지, 그리고 재생, 편집, 표기, 보관 중 어떤 목적에 어느 형식을 선택해야 하는지 명확히 설명합니다.",
    en: "A side-by-side comparison of MusicXML and MIDI, clarifying what each stores, what each loses, and which to choose for playback, editing, notation, or archiving.",
    ja: "MusicXMLとMIDIを並べて比較し、それぞれが何を保存し何を失うのか、そして再生・編集・記譜・保管のどの目的にどちらを選ぶべきかを明確にします。"
  },
  "MusicXML to MIDI playback": { ko: "MusicXML to MIDI 재생", en: "MusicXML to MIDI playback", ja: "MusicXML to MIDI再生" },
  "When you have notation and need playback, converting MusicXML to MIDI is the move. This guide covers what carries over, what gets interpreted, and how to get musical playback.": {
    ko: "표기 데이터는 있고 재생이 필요할 때는 MusicXML을 MIDI로 변환하는 것이 정답입니다. 이 가이드는 무엇이 그대로 유지되고, 무엇이 해석되며, 어떻게 음악적인 재생을 얻을 수 있는지 다룹니다.",
    en: "When you have notation and need playback, converting MusicXML to MIDI is the move. This guide covers what carries over, what gets interpreted, and how to get musical playback.",
    ja: "記譜データがあり再生が必要な場合、MusicXMLをMIDIに変換するのが正解です。このガイドでは、何がそのまま引き継がれ、何が解釈され、どうすれば音楽的な再生が得られるかを解説します。"
  },
  "MIDI to MusicXML notation": { ko: "MIDI to MusicXML 표기", en: "MIDI to MusicXML notation", ja: "MIDI to MusicXML記譜" },
  "Going from a MIDI performance to clean MusicXML notation means adding the written meaning MIDI never stored. This guide covers quantization, spelling, and structure for a readable score.": {
    ko: "MIDI 연주를 깔끔한 MusicXML 표기로 바꾸는 것은 MIDI가 애초에 저장하지 않은 표기상의 의미를 더하는 작업입니다. 이 가이드는 읽기 좋은 악보를 위한 퀀타이즈, 음이름 표기, 구조화를 다룹니다.",
    en: "Going from a MIDI performance to clean MusicXML notation means adding the written meaning MIDI never stored. This guide covers quantization, spelling, and structure for a readable score.",
    ja: "MIDI演奏をきれいなMusicXML記譜に変えることは、MIDIが元々保存していなかった記譜上の意味を付け加える作業です。このガイドでは、読みやすい楽譜のためのクオンタイズ、音名表記、構造化を解説します。"
  },
  "piano MIDI conversion tips": { ko: "피아노 MIDI 변환 팁", en: "piano MIDI conversion tips", ja: "ピアノMIDI変換のコツ" },
  "Piano is uniquely suited to audio-to-MIDI conversion. This guide explains the acoustic reasons why, and how to get the most from a piano-to-MIDI workflow.": {
    ko: "피아노는 오디오-투-MIDI 변환에 특히 적합한 악기입니다. 이 가이드는 그 음향적인 이유와 피아노-투-MIDI 워크플로우를 최대한 활용하는 방법을 설명합니다.",
    en: "Piano is uniquely suited to audio-to-MIDI conversion. This guide explains the acoustic reasons why, and how to get the most from a piano-to-MIDI workflow.",
    ja: "ピアノはオーディオtoMIDI変換に特に適した楽器です。このガイドでは、その音響的な理由と、ピアノtoMIDIワークフローを最大限に活用する方法を解説します。"
  },
  "polyphonic piano transcription": { ko: "폴리포닉 피아노 채보", en: "polyphonic piano transcription", ja: "ポリフォニックピアノ採譜" },
  "Polyphonic transcription — resolving many simultaneous notes — is the hard problem piano conversion must solve. This guide explains how it works and how to get every voice.": {
    ko: "폴리포닉 채보 — 동시에 울리는 여러 음을 풀어내는 것 — 는 피아노 변환이 해결해야 할 가장 어려운 문제입니다. 이 가이드는 그 작동 원리와 모든 성부를 놓치지 않는 방법을 설명합니다.",
    en: "Polyphonic transcription — resolving many simultaneous notes — is the hard problem piano conversion must solve. This guide explains how it works and how to get every voice.",
    ja: "ポリフォニック採譜 — 同時に鳴る多数の音を解き明かすこと — は、ピアノ変換が解決すべき最も難しい課題です。このガイドでは、その仕組みとすべての声部を取りこぼさない方法を解説します。"
  },
  "monophonic vs polyphonic MIDI": { ko: "모노포닉 vs 폴리포닉 MIDI", en: "monophonic vs polyphonic MIDI", ja: "モノフォニック vs ポリフォニックMIDI" },
  "The single biggest predictor of transcription accuracy is whether a part is monophonic or polyphonic. This guide explains the difference and how to use it to your advantage.": {
    ko: "채보 정확도를 가장 크게 좌우하는 요소는 그 파트가 모노포닉인지 폴리포닉인지입니다. 이 가이드는 그 차이를 설명하고 이를 유리하게 활용하는 방법을 다룹니다.",
    en: "The single biggest predictor of transcription accuracy is whether a part is monophonic or polyphonic. This guide explains the difference and how to use it to your advantage.",
    ja: "採譜精度を最も大きく左右する要素は、そのパートがモノフォニックかポリフォニックかです。このガイドでは、その違いを解説し、うまく活用する方法を紹介します。"
  },
  "classical piano AI transcription": { ko: "클래식 피아노 AI 채보", en: "classical piano AI transcription", ja: "クラシックピアノのAI採譜" },
  "Classical piano spans everything from simple studies to fiendish virtuoso works. This guide matches transcription expectations to repertoire and shows how to handle each.": {
    ko: "클래식 피아노는 간단한 연습곡부터 극도로 어려운 비르투오소 작품까지 폭넓습니다. 이 가이드는 레퍼토리에 맞는 채보 기대치를 제시하고 각각을 다루는 방법을 보여줍니다.",
    en: "Classical piano spans everything from simple studies to fiendish virtuoso works. This guide matches transcription expectations to repertoire and shows how to handle each.",
    ja: "クラシックピアノは、簡単な練習曲から超絶技巧を要する難曲まで幅広くカバーします。このガイドでは、レパートリーに応じた採譜の期待値を示し、それぞれの扱い方を紹介します。"
  },
  "jazz piano MIDI transcription": { ko: "재즈 피아노 MIDI 채보", en: "jazz piano MIDI transcription", ja: "ジャズピアノMIDI採譜" },
  "Jazz piano combines dense extended harmony, swing feel, and improvisation — a perfect storm for transcription. This guide explains the challenges and how to work through them.": {
    ko: "재즈 피아노는 촘촘한 확장 화성, 스윙 느낌, 즉흥연주가 뒤섞여 채보에는 최악의 조합입니다. 이 가이드는 그 어려움과 이를 헤쳐나가는 방법을 설명합니다.",
    en: "Jazz piano combines dense extended harmony, swing feel, and improvisation — a perfect storm for transcription. This guide explains the challenges and how to work through them.",
    ja: "ジャズピアノは、密なテンションコード、スイング感、即興演奏が絡み合い、採譜にとってはまさに難関の組み合わせです。このガイドでは、その難しさと乗り越え方を解説します。"
  },
  "guitar audio to MIDI": { ko: "기타 오디오 to MIDI", en: "guitar audio to MIDI", ja: "ギターオーディオtoMIDI" },
  "Guitar poses distinct transcription challenges — bends, slides, harmonics, and the same note in multiple places. This guide explains them and how to get clean guitar MIDI.": {
    ko: "기타는 채보에 있어 독특한 어려움을 가지고 있습니다 — 벤드, 슬라이드, 하모닉스, 그리고 같은 음이 여러 위치에 존재하는 문제까지. 이 가이드는 이를 설명하고 깨끗한 기타 MIDI를 얻는 방법을 다룹니다.",
    en: "Guitar poses distinct transcription challenges — bends, slides, harmonics, and the same note in multiple places. This guide explains them and how to get clean guitar MIDI.",
    ja: "ギターには採譜特有の難しさがあります — ベンド、スライド、ハーモニクス、そして同じ音が複数の場所に存在する問題まで。このガイドでは、これらを解説し、クリーンなギターMIDIを得る方法を紹介します。"
  },
  "extract drum MIDI from audio": { ko: "오디오에서 드럼 MIDI 추출", en: "extract drum MIDI from audio", ja: "オーディオからドラムMIDIを抽出" },
  "Drums are pitchless but rhythmically rich, so their transcription is a different problem entirely. This guide covers extracting drum MIDI, classifying hits, and capturing groove.": {
    ko: "드럼은 음높이가 없지만 리듬적으로 풍부하기 때문에 채보 문제 자체가 완전히 다릅니다. 이 가이드는 드럼 MIDI 추출, 타격 분류, 그루브 포착 방법을 다룹니다.",
    en: "Drums are pitchless but rhythmically rich, so their transcription is a different problem entirely. This guide covers extracting drum MIDI, classifying hits, and capturing groove.",
    ja: "ドラムには音高がありませんがリズムの情報量は豊富で、採譜の問題そのものが全く異なります。このガイドでは、ドラムMIDIの抽出、ヒットの分類、グルーヴの捉え方を解説します。"
  },
  "vocal melody to MIDI": { ko: "보컬 멜로디를 MIDI로", en: "vocal melody to MIDI", ja: "ボーカルメロディをMIDIへ" },
  "The voice is monophonic but slippery — full of slides, vibrato, and pitch that never sits still. This guide covers transcribing vocals into clean, usable MIDI melodies.": {
    ko: "목소리는 모노포닉이지만 다루기 까다롭습니다 — 슬라이드, 비브라토, 그리고 한시도 고정되지 않는 음높이로 가득하기 때문입니다. 이 가이드는 보컬을 깨끗하고 실용적인 MIDI 멜로디로 채보하는 방법을 다룹니다.",
    en: "The voice is monophonic but slippery — full of slides, vibrato, and pitch that never sits still. This guide covers transcribing vocals into clean, usable MIDI melodies.",
    ja: "声はモノフォニックですが扱いが難しく、スライド、ビブラート、そして一定しない音高に満ちています。このガイドでは、ボーカルをクリーンで使いやすいMIDIメロディに採譜する方法を解説します。"
  },
  "MIDI instrument remapping": { ko: "MIDI 악기 리매핑", en: "MIDI instrument remapping", ja: "MIDI楽器のリマッピング" },
  "Every instrument transcribes differently. This field guide compares how pianos, strings, winds, brass, and more behave under audio-to-MIDI, so you can predict results.": {
    ko: "모든 악기는 채보되는 방식이 제각각입니다. 이 필드 가이드는 피아노, 현악기, 관악기, 브라스 등이 오디오-투-MIDI에서 어떻게 다르게 반응하는지 비교하여 결과를 미리 예측할 수 있게 해줍니다.",
    en: "Every instrument transcribes differently. This field guide compares how pianos, strings, winds, brass, and more behave under audio-to-MIDI, so you can predict results.",
    ja: "楽器ごとに採譜のされ方はまったく異なります。このフィールドガイドでは、ピアノ、弦楽器、木管、ブラスなどがオーディオtoMIDIでどう振る舞うかを比較し、結果を事前に予測できるようにします。"
  },
  "MIDI editing after AI conversion": { ko: "AI 변환 후 MIDI 편집", en: "MIDI editing after AI conversion", ja: "AI変換後のMIDI編集" },
  "Whatever produced your MIDI, editing it comes down to a handful of core skills. This guide teaches the fundamentals — notes, timing, velocity, and structure — from the ground up.": {
    ko: "무엇으로 만들어졌든 MIDI 편집은 몇 가지 핵심 기술로 요약됩니다. 이 가이드는 노트, 타이밍, 벨로시티, 구조라는 기본기를 처음부터 차근차근 가르쳐줍니다.",
    en: "Whatever produced your MIDI, editing it comes down to a handful of core skills. This guide teaches the fundamentals — notes, timing, velocity, and structure — from the ground up.",
    ja: "何によって作られたMIDIであっても、編集は結局いくつかの中核スキルに帰着します。このガイドでは、ノート、タイミング、ベロシティ、構造という基本をゼロから丁寧に解説します。"
  },
  "cleanup checklist AI MIDI": { ko: "AI MIDI 정리 체크리스트", en: "cleanup checklist AI MIDI", ja: "AI MIDIクリーンアップチェックリスト" },
  "An AI transcription is a strong draft, not a finished part. This guide is a systematic cleanup process for the specific artifacts AI conversion tends to introduce.": {
    ko: "AI 채보는 훌륭한 초안이지만 완성된 파트는 아닙니다. 이 가이드는 AI 변환이 흔히 만들어내는 특정 오류들을 체계적으로 정리하는 과정을 제시합니다.",
    en: "An AI transcription is a strong draft, not a finished part. This guide is a systematic cleanup process for the specific artifacts AI conversion tends to introduce.",
    ja: "AI採譜は優れたドラフトですが、完成したパートではありません。このガイドでは、AI変換が引き起こしがちな特有のアーティファクトを体系的に整理する手順を紹介します。"
  },
  "MIDI velocity expression editing": { ko: "MIDI 벨로시티 표현 편집", en: "MIDI velocity expression editing", ja: "MIDIベロシティ表現編集" },
  "Velocity and expression are what separate a lifeless sequence from a performance. This guide goes deep on shaping dynamics, phrasing, and feel in converted MIDI.": {
    ko: "벨로시티와 표현력은 생기 없는 시퀀스와 진짜 연주를 가르는 요소입니다. 이 가이드는 변환된 MIDI에서 다이내믹, 프레이징, 느낌을 다듬는 방법을 깊이 다룹니다.",
    en: "Velocity and expression are what separate a lifeless sequence from a performance. This guide goes deep on shaping dynamics, phrasing, and feel in converted MIDI.",
    ja: "ベロシティと表現力は、生気のないシーケンスと本物の演奏を分けるものです。このガイドでは、変換したMIDIでダイナミクス、フレージング、グルーヴ感を作り込む方法を深く掘り下げます。"
  },
  "quantize AI MIDI timing": { ko: "AI MIDI 타이밍 퀀타이즈", en: "quantize AI MIDI timing", ja: "AI MIDIタイミングのクオンタイズ" },
  "Quantization can rescue loose timing or destroy a performance's feel. This guide covers how to quantize converted MIDI intelligently, with the right grid and strength.": {
    ko: "퀀타이즈는 흐트러진 타이밍을 살릴 수도, 연주의 느낌을 망칠 수도 있습니다. 이 가이드는 적절한 그리드와 강도로 변환된 MIDI를 지능적으로 퀀타이즈하는 방법을 다룹니다.",
    en: "Quantization can rescue loose timing or destroy a performance's feel. This guide covers how to quantize converted MIDI intelligently, with the right grid and strength.",
    ja: "クオンタイズは緩んだタイミングを救うこともあれば、演奏の感覚を壊すこともあります。このガイドでは、適切なグリッドと強さで変換したMIDIを賢くクオンタイズする方法を解説します。"
  },
  "import converted MIDI to DAW": { ko: "변환된 MIDI를 DAW로 가져오기", en: "import converted MIDI to DAW", ja: "変換したMIDIをDAWに取り込む" },
  "Converted MIDI is raw material for production. This guide lays out a DAW-agnostic workflow for importing, organizing, and developing transcribed MIDI into a finished track.": {
    ko: "변환된 MIDI는 프로덕션의 원재료입니다. 이 가이드는 어떤 DAW에서든 쓸 수 있는, 채보된 MIDI를 가져오고 정리하고 완성된 트랙으로 발전시키는 워크플로우를 제시합니다.",
    en: "Converted MIDI is raw material for production. This guide lays out a DAW-agnostic workflow for importing, organizing, and developing transcribed MIDI into a finished track.",
    ja: "変換したMIDIは制作の素材です。このガイドでは、どのDAWでも使える、採譜したMIDIを取り込み、整理し、完成したトラックへ発展させるワークフローを紹介します。"
  },
  "Ableton Live converted MIDI": { ko: "Ableton Live에서 변환된 MIDI", en: "Ableton Live converted MIDI", ja: "Ableton Liveの変換MIDI" },
  "Ableton Live's clip-based, warp-driven approach shapes how converted MIDI fits in. This guide covers importing, warping, and developing transcribed MIDI in Live specifically.": {
    ko: "Ableton Live의 클립 기반, 워프 중심 방식은 변환된 MIDI가 어떻게 자리 잡는지를 결정합니다. 이 가이드는 Live에 특화하여 채보된 MIDI를 가져오고, 워핑하고, 발전시키는 방법을 다룹니다.",
    en: "Ableton Live's clip-based, warp-driven approach shapes how converted MIDI fits in. This guide covers importing, warping, and developing transcribed MIDI in Live specifically.",
    ja: "Ableton Liveのクリップベース・ワープ主導のアプローチは、変換したMIDIの収まり方を左右します。このガイドでは、Liveに特化して、採譜したMIDIの取り込み、ワープ処理、発展方法を解説します。"
  },
  "FL Studio piano roll AI MIDI": { ko: "FL Studio 피아노 롤과 AI MIDI", en: "FL Studio piano roll AI MIDI", ja: "FL StudioのピアノロールとAI MIDI" },
  "FL Studio's pattern-and-playlist workflow and piano roll are ideal for converted MIDI. This guide covers importing, channel routing, and developing transcriptions in FL specifically.": {
    ko: "FL Studio의 패턴-플레이리스트 워크플로우와 피아노 롤은 변환된 MIDI에 이상적입니다. 이 가이드는 FL Studio에 특화하여 가져오기, 채널 라우팅, 채보 발전 방법을 다룹니다.",
    en: "FL Studio's pattern-and-playlist workflow and piano roll are ideal for converted MIDI. This guide covers importing, channel routing, and developing transcriptions in FL specifically.",
    ja: "FL Studioのパターン&プレイリストのワークフローとピアノロールは、変換したMIDIに理想的です。このガイドでは、FL Studioに特化して、インポート、チャンネルルーティング、採譜の発展方法を解説します。"
  },
  "Logic Pro converted MIDI scores": { ko: "Logic Pro와 변환된 MIDI 악보", en: "Logic Pro converted MIDI scores", ja: "Logic Proと変換MIDI楽譜" },
  "Logic Pro's blend of powerful instruments, notation, and a linear timeline suits converted MIDI for composition. This guide covers importing and developing transcriptions in Logic.": {
    ko: "Logic Pro는 강력한 가상악기, 표기 기능, 선형 타임라인을 결합하여 변환된 MIDI로 작곡하기에 적합합니다. 이 가이드는 Logic에서 가져오기와 채보 발전 방법을 다룹니다.",
    en: "Logic Pro's blend of powerful instruments, notation, and a linear timeline suits converted MIDI for composition. This guide covers importing and developing transcriptions in Logic.",
    ja: "Logic Proは強力な音源、記譜機能、リニアなタイムラインを兼ね備え、変換したMIDIでの作曲に適しています。このガイドでは、Logicでのインポートと採譜の発展方法を解説します。"
  },
  "how AI MIDI models work": { ko: "AI MIDI 모델의 작동 원리", en: "how AI MIDI models work", ja: "AI MIDIモデルの仕組み" },
  "A musician-friendly explanation of the full AI MIDI conversion pipeline, from analyzing input to producing note data, covering both audio and score inputs without heavy jargon.": {
    ko: "입력을 분석하는 단계부터 노트 데이터를 만들어내는 단계까지, AI MIDI 변환 파이프라인 전체를 음악가가 이해하기 쉽게 설명합니다. 오디오와 악보 입력을 모두 다루며 어려운 전문 용어는 최소화했습니다.",
    en: "A musician-friendly explanation of the full AI MIDI conversion pipeline, from analyzing input to producing note data, covering both audio and score inputs without heavy jargon.",
    ja: "入力の解析からノートデータの生成まで、AI MIDI変換パイプライン全体を音楽家にもわかりやすく解説します。オーディオと楽譜の両方の入力を扱い、難しい専門用語は最小限にしています。"
  },
  "AI music transcription overview": { ko: "AI 음악 채보 개요", en: "AI music transcription overview", ja: "AI音楽採譜の概要" },
  "A comprehensive, grounded overview of AI music transcription — what it can do today, where it struggles, and how to fold it into a real musical practice effectively.": {
    ko: "AI 음악 채보에 대한 포괄적이고 현실적인 개요입니다 — 지금 무엇을 할 수 있는지, 어디서 어려움을 겪는지, 그리고 실제 음악 활동에 효과적으로 접목하는 방법까지 다룹니다.",
    en: "A comprehensive, grounded overview of AI music transcription — what it can do today, where it struggles, and how to fold it into a real musical practice effectively.",
    ja: "AI音楽採譜についての包括的で現実的な概要です — 今できること、苦手なこと、そして実際の音楽活動に効果的に取り入れる方法まで解説します。"
  },
  "MIDI vs audio explained": { ko: "MIDI vs 오디오 완전 설명", en: "MIDI vs audio explained", ja: "MIDI vs オーディオ徹底解説" },
  "MIDI and audio are constantly confused but fundamentally different. This guide explains the distinction clearly and why it underlies everything about conversion between them.": {
    ko: "MIDI와 오디오는 자주 혼동되지만 근본적으로 다릅니다. 이 가이드는 그 차이를 명확히 설명하고, 이 차이가 둘 사이의 변환 전반을 왜 좌우하는지 다룹니다.",
    en: "MIDI and audio are constantly confused but fundamentally different. This guide explains the distinction clearly and why it underlies everything about conversion between them.",
    ja: "MIDIとオーディオは頻繁に混同されますが、本質的には全く異なるものです。このガイドでは、その違いを明確に解説し、なぜそれが両者の変換すべての根底にあるのかを説明します。"
  },
  "beginner guide to MIDI files": { ko: "MIDI 파일 초보자 가이드", en: "beginner guide to MIDI files", ja: "MIDIファイル初心者ガイド" },
  "New to MIDI? This friendly, jargon-light guide explains what MIDI files are, how they work, what they can and cannot do, and how to start using them confidently.": {
    ko: "MIDI가 처음이신가요? 이 친절하고 쉬운 가이드는 MIDI 파일이 무엇인지, 어떻게 작동하는지, 무엇을 할 수 있고 할 수 없는지, 그리고 자신 있게 사용을 시작하는 방법을 설명합니다.",
    en: "New to MIDI? This friendly, jargon-light guide explains what MIDI files are, how they work, what they can and cannot do, and how to start using them confidently.",
    ja: "MIDIは初めてですか?この親しみやすく専門用語の少ないガイドでは、MIDIファイルとは何か、どう機能するのか、できることとできないこと、そして自信を持って使い始める方法を解説します。"
  },
  "choose AI transcription tool by job": { ko: "목적별 AI 채보 도구 선택", en: "choose AI transcription tool by job", ja: "用途別のAI採譜ツール選び" },
  "Marketing claims make transcription tools hard to compare. This guide gives you a fair, hands-on framework for evaluating any audio-to-MIDI or score-conversion tool on what matters.": {
    ko: "마케팅 문구 때문에 채보 도구를 비교하기가 어렵습니다. 이 가이드는 어떤 오디오-투-MIDI 또는 악보 변환 도구든 정말 중요한 기준으로 평가할 수 있는 공정하고 실용적인 프레임워크를 제공합니다.",
    en: "Marketing claims make transcription tools hard to compare. This guide gives you a fair, hands-on framework for evaluating any audio-to-MIDI or score-conversion tool on what matters.",
    ja: "マーケティングの謳い文句のせいで、採譜ツールの比較は難しくなっています。このガイドは、オーディオtoMIDIや楽譜変換ツールを本当に重要な基準で評価するための、公平で実践的なフレームワークを提供します。"
  },
  "offline vs online MIDI converters": { ko: "오프라인 vs 온라인 MIDI 변환기", en: "offline vs online MIDI converters", ja: "オフライン vs オンラインMIDI変換ツール" },
  "Offline and online converters trade off privacy, performance, convenience, and reliability differently. This guide helps you choose based on your files, needs, and constraints.": {
    ko: "오프라인과 온라인 변환기는 개인정보 보호, 성능, 편의성, 신뢰성 사이에서 서로 다른 절충을 합니다. 이 가이드는 파일, 필요, 제약 조건에 맞게 선택할 수 있도록 도와줍니다.",
    en: "Offline and online converters trade off privacy, performance, convenience, and reliability differently. This guide helps you choose based on your files, needs, and constraints.",
    ja: "オフライン変換ツールとオンライン変換ツールは、プライバシー、パフォーマンス、利便性、信頼性のバランスがそれぞれ異なります。このガイドは、あなたのファイル、ニーズ、制約に合わせて選ぶための手助けをします。"
  },
  "Windows MIDI converter software checklist": { ko: "Windows MIDI 변환 소프트웨어 체크리스트", en: "Windows MIDI converter software checklist", ja: "Windows MIDI変換ソフトチェックリスト" },
  "Windows offers particular considerations for MIDI conversion — audio setup, file handling, and integration. This guide helps Windows users choose and set up conversion software well.": {
    ko: "Windows에서는 MIDI 변환 시 오디오 설정, 파일 처리, 연동 등 특별히 고려할 점들이 있습니다. 이 가이드는 Windows 사용자가 변환 소프트웨어를 잘 선택하고 설정하도록 도와줍니다.",
    en: "Windows offers particular considerations for MIDI conversion — audio setup, file handling, and integration. This guide helps Windows users choose and set up conversion software well.",
    ja: "WindowsでのMIDI変換には、オーディオ設定、ファイル管理、連携など特有の注意点があります。このガイドは、Windowsユーザーが変換ソフトをうまく選び、設定できるよう手助けします。"
  },
  "AI MIDI vs manual transcription": { ko: "AI MIDI vs 수동 채보", en: "AI MIDI vs manual transcription", ja: "AI MIDI vs 手動採譜" },
  "Assisted conversion and manual transcription each have real strengths. This guide compares them honestly and shows how to combine them for the best of both.": {
    ko: "AI 변환과 수동 채보는 각각 확실한 강점이 있습니다. 이 가이드는 둘을 솔직하게 비교하고, 두 방식의 장점을 모두 취하기 위해 결합하는 방법을 보여줍니다.",
    en: "Assisted conversion and manual transcription each have real strengths. This guide compares them honestly and shows how to combine them for the best of both.",
    ja: "AI支援変換と手動採譜には、それぞれ確かな強みがあります。このガイドでは、両者を率直に比較し、両方の良さを組み合わせる方法を紹介します。"
  },
  "MIDI lesson materials for teachers": { ko: "교사를 위한 MIDI 수업 자료", en: "MIDI lesson materials for teachers", ja: "教師のためのMIDI授業資料" },
  "For teachers, converted MIDI is a versatile teaching aid — for creating materials, adapting repertoire, and giving students interactive practice. This guide is full of classroom-ready uses.": {
    ko: "교사에게 변환된 MIDI는 다재다능한 교육 도구입니다 — 자료 제작, 레퍼토리 편곡, 학생을 위한 상호작용형 연습까지. 이 가이드는 수업에 바로 쓸 수 있는 활용법으로 가득합니다.",
    en: "For teachers, converted MIDI is a versatile teaching aid — for creating materials, adapting repertoire, and giving students interactive practice. This guide is full of classroom-ready uses.",
    ja: "教師にとって、変換したMIDIは万能な教材です — 資料作成、レパートリーの編曲、生徒向けの対話的な練習まで。このガイドは、教室でそのまま使える活用法が満載です。"
  },
  // ---- midi-to-pdf-sheet-music.html (full article) ----
  "MusicXML & score interchange": {
    ko: "MusicXML & 악보 교환",
    en: "MusicXML & score interchange",
    ja: "MusicXMLと楽譜交換"
  },
  "Guide · MusicXML & score interchange": {
    ko: "가이드 · MusicXML & 악보 교환",
    en: "Guide · MusicXML & score interchange",
    ja: "ガイド · MusicXMLと楽譜交換"
  },
  "Published 2026-07-20": {
    ko: "게시 2026-07-20",
    en: "Published 2026-07-20",
    ja: "公開 2026-07-20"
  },
  "Updated 2026-07-20": {
    ko: "업데이트 2026-07-20",
    en: "Updated 2026-07-20",
    ja: "更新 2026-07-20"
  },
  "9 min read": {
    ko: "약 9분 읽기",
    en: "9 min read",
    ja: "約9分で読める"
  },
  "Cluster: MusicXML & score interchange": {
    ko: "클러스터: MusicXML & 악보 교환",
    en: "Cluster: MusicXML & score interchange",
    ja: "クラスター: MusicXMLと楽譜交換"
  },
  "· Founder & Product Lead": {
    ko: "· 창업자 & 제품 총괄",
    en: "· Founder & Product Lead",
    ja: "· 創業者兼プロダクトリード"
  },
  "Why raw MIDI rarely prints as readable notation": {
    ko: "원시 MIDI가 읽기 쉬운 악보로 잘 안 찍히는 이유",
    en: "Why raw MIDI rarely prints as readable notation",
    ja: "生のMIDIが読みやすい楽譜になりにくい理由"
  },
  "Quantizing performance timing into notated rhythm": {
    ko: "연주 타이밍을 기보 리듬으로 양자화하기",
    en: "Quantizing performance timing into notated rhythm",
    ja: "演奏タイミングを記譜リズムへクオンタイズする"
  },
  "Choosing enharmonic spellings that read correctly": {
    ko: "읽기 좋은 이명동음 표기 고르기",
    en: "Choosing enharmonic spellings that read correctly",
    ja: "読みやすい異名同音の表記を選ぶ"
  },
  "Splitting a track into treble and bass staves": {
    ko: "트랙을 높은음자리·낮은음자리로 나누기",
    en: "Splitting a track into treble and bass staves",
    ja: "トラックをト音・ヘ音記号へ分ける"
  },
  "Assigning voices so chords notate cleanly": {
    ko: "화음이 깔끔히 기보되도록 보이스 배정하기",
    en: "Assigning voices so chords notate cleanly",
    ja: "和音がきれいに記譜されるよう声部を割り当てる"
  },
  "Adding time and key signatures MIDI never stored": {
    ko: "MIDI에 없던 박자·조표 넣기",
    en: "Adding time and key signatures MIDI never stored",
    ja: "MIDIに無かった拍子・調号を足す"
  },
  "Beaming and rest placement for a legible page": {
    ko: "읽기 쉬운 페이지를 위한 빔·쉼표 배치",
    en: "Beaming and rest placement for a legible page",
    ja: "読みやすいページのためのビームと休符配置"
  },
  "Final layout: measures per line and page turns": {
    ko: "최종 레이아웃: 줄당 마디와 페이지 넘김",
    en: "Final layout: measures per line and page turns",
    ja: "最終レイアウト: 1行あたりの小節とページめくり"
  },
  "MIDI and notation feel like two views of the same thing, but going from MIDI to a printed page is genuinely harder than the reverse. MIDI records a performance in raw time — this note started 12 milliseconds late and lasted an odd fraction of a beat — while notation demands tidy, human-readable rhythms. Bridging that gap is the whole job.": {
    ko: "MIDI와 기보는 같은 것의 두 가지 모습처럼 느껴지지만, MIDI에서 인쇄 페이지로 가는 길은 그 반대보다 확실히 더 어렵습니다. MIDI는 연주를 날것의 시간으로 기록합니다 — 이 음표는 12밀리초 늦게 시작했고 이상한 박자 비율만큼 이어졌습니다 — 반면 기보는 정돈되고 사람이 읽을 수 있는 리듬을 요구합니다. 그 간극을 메우는 것이 전부 작업입니다.",
    en: "MIDI and notation feel like two views of the same thing, but going from MIDI to a printed page is genuinely harder than the reverse. MIDI records a performance in raw time — this note started 12 milliseconds late and lasted an odd fraction of a beat — while notation demands tidy, human-readable rhythms. Bridging that gap is the whole job.",
    ja: "MIDIと記譜は同じものの二つの見え方のように感じられますが、MIDIから印刷ページへ進む道は、その逆より確かに難しいです。MIDIは演奏を生の時間で記録します — この音符は12ミリ秒遅れて始まり、変な拍の端数だけ続きました — 一方で記譜は整った、人が読めるリズムを求めます。そのギャップを埋めることこそが仕事全体です。"
  },
  "The temptation is to expect a MIDI file to simply become sheet music at the push of a button, and it can, but a naive conversion produces a page cluttered with thirty-second rests and unreadable tuplets. Getting a clean score means making deliberate choices about how loosely-timed performance data should be tidied into notation.": {
    ko: "버튼 한 번으로 MIDI 파일이 곧바로 악보가 되길 기대하기 쉽고, 실제로도 가능하지만, 단순한 변환은 삼십이분쉼표와 읽기 힘든 잇단음표로 가득한 페이지를 만듭니다. 깨끗한 악보를 얻으려면, 느슨한 연주 타이밍 데이터를 어떻게 기보로 정리할지 의도적으로 선택해야 합니다.",
    en: "The temptation is to expect a MIDI file to simply become sheet music at the push of a button, and it can, but a naive conversion produces a page cluttered with thirty-second rests and unreadable tuplets. Getting a clean score means making deliberate choices about how loosely-timed performance data should be tidied into notation.",
    ja: "ボタン一つでMIDIファイルがそのまま楽譜になることを期待しがちで、実際に可能でも、素朴な変換は三十二分休符や読めない連符だらけのページになります。きれいな楽譜を得るには、ゆるい演奏タイミングデータをどう記譜へ整えるかを意図的に選ぶ必要があります。"
  },
  "This guide covers those choices in order, from quantization to layout, so that a MIDI file — whether you recorded it or produced it in MidiAI Studio — comes out the other side as sheet music a musician can actually read at a stand.": {
    ko: "이 가이드는 양자화부터 레이아웃까지 그 선택들을 순서대로 다루어, MIDI 파일 — 직접 녹음했든 MidiAI Studio에서 만들었든 — 이 반대편에서 실제로 보면대에서 읽을 수 있는 악보로 나오도록 돕습니다.",
    en: "This guide covers those choices in order, from quantization to layout, so that a MIDI file — whether you recorded it or produced it in MidiAI Studio — comes out the other side as sheet music a musician can actually read at a stand.",
    ja: "このガイドはクオンタイズからレイアウトまで、その選択を順に扱い、MIDIファイル — 自分で録音したものでもMidiAI Studioで作ったものでも — が向こう側で、譜面台で実際に読める楽譜になるようにします。"
  },
  "MidiAI Studio quantizing a rubato D-minor improvisation and engraving it across a readable grand staff.": {
    ko: "MidiAI Studio가 D단조 루바토 즉흥 연주를 양자화해 읽기 쉬운 큰보표로 조각하는 모습.",
    en: "MidiAI Studio quantizing a rubato D-minor improvisation and engraving it across a readable grand staff.",
    ja: "MidiAI StudioがD短調のルバート即興をクオンタイズし、読みやすい大譜表へ彫刻する様子。"
  },
  "Screenshot · MidiAI Studio · illustrates “MIDI to PDF sheet music”": {
    ko: "스크린샷 · MidiAI Studio · 「MIDI를 PDF 악보로」를 보여 줌",
    en: "Screenshot · MidiAI Studio · illustrates “MIDI to PDF sheet music”",
    ja: "スクリーンショット · MidiAI Studio · 「MIDIをPDF楽譜へ」を示す"
  },
  "Converting MIDI to PDF sheet music means interpreting timed performance events as notated rhythms and pitches, then engraving them onto staves and exporting a printable page. It is a translation from how music was played into how music is written.": {
    ko: "MIDI를 PDF 악보로 변환한다는 것은 시간으로 된 연주 이벤트를 기보된 리듬과 음높이로 해석한 뒤, 보표에 조각하고 인쇄 가능한 페이지로 내보내는 일입니다. 음악이 어떻게 연주되었는가에서 어떻게 쓰이는가로의 번역입니다.",
    en: "Converting MIDI to PDF sheet music means interpreting timed performance events as notated rhythms and pitches, then engraving them onto staves and exporting a printable page. It is a translation from how music was played into how music is written.",
    ja: "MIDIをPDF楽譜へ変換するとは、時間付きの演奏イベントを記譜されたリズムと音高として解釈し、譜表に彫刻して印刷可能なページへ書き出すことです。音楽がどう演奏されたかから、どう書かれるかへの翻訳です。"
  },
  "The core challenge is that MIDI has no concept of a bar line, a key signature, or whether a black key is a G-sharp or an A-flat. All of that notational meaning must be inferred or supplied during conversion, which is why the same MIDI file can print several legitimately different ways.": {
    ko: "핵심 난제는 MIDI에 마디선, 조표, 검은 건반이 올림사장조인지 내림가단조인지 같은 개념이 없다는 점입니다. 그 모든 기보 의미는 변환 중에 추론하거나 직접 넣어야 하며, 그래서 같은 MIDI 파일이 여러 정당한 방식으로 인쇄될 수 있습니다.",
    en: "The core challenge is that MIDI has no concept of a bar line, a key signature, or whether a black key is a G-sharp or an A-flat. All of that notational meaning must be inferred or supplied during conversion, which is why the same MIDI file can print several legitimately different ways.",
    ja: "核心の難しさは、MIDIに小節線や調号、黒鍵が嬰トなのか変イなのかという概念がないことです。そうした記譜の意味はすべて変換中に推論するか与える必要があり、だから同じMIDIファイルが複数の正当な形で印刷され得ます。"
  },
  "Quantization is the first and most consequential step. The engine snaps loosely-timed performance events onto a rhythmic grid — sixteenth notes, triplets, or finer — trading a little timing realism for a page you can read. Choose too coarse a grid and you lose real rhythms; too fine and the page fills with clutter.": {
    ko: "양자화는 첫 번째이자 가장 영향 큰 단계입니다. 엔진은 느슨한 연주 이벤트를 리듬 격자 — 십육분음표, 셋잇단음표, 또는 더 세밀한 것 — 에 맞추며, 약간의 타이밍 사실감을 포기하고 읽을 수 있는 페이지를 얻습니다. 격자가 너무 거칠면 실제 리듬을 잃고, 너무 세밀하면 페이지가 잡동사니로 가득합니다.",
    en: "Quantization is the first and most consequential step. The engine snaps loosely-timed performance events onto a rhythmic grid — sixteenth notes, triplets, or finer — trading a little timing realism for a page you can read. Choose too coarse a grid and you lose real rhythms; too fine and the page fills with clutter.",
    ja: "クオンタイズは最初で最も影響の大きいステップです。エンジンはゆるい演奏イベントをリズム格子 — 十六分音符、三連符、またはより細かいもの — に合わせ、少しのタイミングのリアリティと引き換えに読めるページを得ます。格子が粗すぎると本物のリズムを失い、細かすぎるとページが雑多で埋まります。"
  },
  "Pitch spelling comes next, because MIDI note 61 is just a number that could be notated as C-sharp or D-flat. The engine uses the key signature and melodic context to pick the reading that a musician expects, so an ascending line spells sharps and a descending one may spell flats. MidiAI Studio makes these enharmonic decisions so the resulting accidentals look natural rather than arbitrary.": {
    ko: "다음이 음높이 표기입니다. MIDI 노트 61은 숫자일 뿐이고 올림다나 내림레로 쓸 수 있습니다. 엔진은 조표와 선율 맥락으로 연주자가 기대하는 읽기를 고르므로, 상승 선은 올림표를, 하강 선은 내림표를 쓸 수 있습니다. MidiAI Studio는 이 이명동음 결정을 해 결과 임시표가 임의가 아니라 자연스러워 보이게 합니다.",
    en: "Pitch spelling comes next, because MIDI note 61 is just a number that could be notated as C-sharp or D-flat. The engine uses the key signature and melodic context to pick the reading that a musician expects, so an ascending line spells sharps and a descending one may spell flats. MidiAI Studio makes these enharmonic decisions so the resulting accidentals look natural rather than arbitrary.",
    ja: "次は音高の表記です。MIDIノート61は数字にすぎず、嬰ハでも変ニでも書けます。エンジンは調号と旋律の文脈で奏者が期待する読みを選ぶので、上行はシャープ、下行はフラットになり得ます。MidiAI Studioはこうした異名同音の判断をし、結果の臨時記号が恣意的でなく自然に見えるようにします。"
  },
  "Then structure is imposed: a single MIDI track is split across treble and bass staves by pitch, simultaneous notes are grouped into chords, and overlapping lines are separated into voices with independent stems. Only after all that does layout happen — beaming, rests, and the spacing that turns correct notation into a legible one.": {
    ko: "그다음 구조가 잡힙니다: 하나의 MIDI 트랙이 음높이로 높은음자리·낮은음자리로 나뉘고, 동시 음표는 화음으로 묶이며, 겹치는 선은 독립 줄기가 있는 보이스로 갈라집니다. 그 모든 뒤에야 레이아웃 — 빔, 쉼표, 올바른 기보를 읽기 쉬운 것으로 바꾸는 간격 — 이 일어납니다.",
    en: "Then structure is imposed: a single MIDI track is split across treble and bass staves by pitch, simultaneous notes are grouped into chords, and overlapping lines are separated into voices with independent stems. Only after all that does layout happen — beaming, rests, and the spacing that turns correct notation into a legible one.",
    ja: "次に構造が与えられます: 1本のMIDIトラックが音高でト音・ヘ音に分かれ、同時の音符は和音にまとめられ、重なる線は独立した符幹を持つ声部に分けられます。そのすべてがあって初めてレイアウト — ビーム、休符、正しい記譜を読みやすくする間隔 — が行われます。"
  },
  "Printing a recorded piano improvisation in D minor": {
    ko: "녹음한 D단조 피아노 즉흥을 인쇄하기",
    en: "Printing a recorded piano improvisation in D minor",
    ja: "録音したD短調ピアノ即興を印刷する"
  },
  "Imagine a loose, rubato piano improvisation you recorded to MIDI in D minor at a nominal 76 BPM, full of expressive timing that made it feel alive. Printed literally, it would be a nightmare of dotted-thirty-second rests and un-notatable syncopations.": {
    ko: "느슨한 루바토 피아노 즉흥을 D단조·명목 76 BPM으로 MIDI에 녹음했다고 상상해 보세요. 표현력 있는 타이밍으로 살아 있는데, 문자 그대로 인쇄하면 점삼십이분쉼표와 기보 불가능한 싱커페이션의 악몽이 됩니다.",
    en: "Imagine a loose, rubato piano improvisation you recorded to MIDI in D minor at a nominal 76 BPM, full of expressive timing that made it feel alive. Printed literally, it would be a nightmare of dotted-thirty-second rests and un-notatable syncopations.",
    ja: "ゆるいルバートのピアノ即興を、D短調・名目76 BPMでMIDIに録音したと想像してください。表情豊かなタイミングで生き生きしていますが、文字どおり印刷すると点三十二分休符や記譜不能なシンコペーションの悪夢になります。"
  },
  "Running it through MidiAI Studio with a sixteenth-note grid and swing awareness tidies the rhythm into something readable while keeping the phrasing recognizable. The engine splits the two hands across a grand staff, spells the raised leading tone as C-sharp rather than D-flat, and beams the running passages sensibly.": {
    ko: "십육분음표 격자와 스윙 인식을 켠 MidiAI Studio로 돌리면, 프레이징은 알아볼 수 있게 남기면서 리듬을 읽기 좋게 정리합니다. 엔진은 양손을 큰보표로 나누고, 올린 이끈음을 내림레가 아니라 올림다로 쓰며, 빠른 패시지를 합리적으로 빔합니다.",
    en: "Running it through MidiAI Studio with a sixteenth-note grid and swing awareness tidies the rhythm into something readable while keeping the phrasing recognizable. The engine splits the two hands across a grand staff, spells the raised leading tone as C-sharp rather than D-flat, and beams the running passages sensibly.",
    ja: "十六分音符格子とスイング認識を付けたMidiAI Studioに通すと、フレージングは残しつつリズムを読みやすく整えます。エンジンは両手を大譜表に分け、上がった導音を変ニではなく嬰ハと書き、走りのパッセージを妥当にビームします。"
  },
  "A short cleanup follows — you widen a couple of measures per line for a busy passage and confirm one triplet grouping — and the improvisation prints as a page a pianist could sight-read, without erasing the character of the original take.": {
    ko: "짧은 정리 작업이 이어집니다 — 바쁜 패시지를 위해 줄당 마디를 조금 늘리고 셋잇단 묶음을 확인합니다 — 그러면 즉흥은 원테이크의 성격을 지우지 않은 채, 피아니스트가 초견할 수 있는 페이지로 인쇄됩니다.",
    en: "A short cleanup follows — you widen a couple of measures per line for a busy passage and confirm one triplet grouping — and the improvisation prints as a page a pianist could sight-read, without erasing the character of the original take.",
    ja: "短い整理が続きます — 忙しいパッセージのために1行の小節を少し広げ、三連符のまとまりを確認します — すると即興は原テイクの性格を消さずに、ピアニストが初見できるページとして印刷されます。"
  },
  "Supporting view while you follow the steps for “MIDI to PDF sheet music”.": {
    ko: "「MIDI를 PDF 악보로」 단계를 따라갈 때 참고하는 화면.",
    en: "Supporting view while you follow the steps for “MIDI to PDF sheet music”.",
    ja: "「MIDIをPDF楽譜へ」の手順を追うときの参考画面。"
  },
  "MidiAI Studio UI": {
    ko: "MidiAI Studio UI",
    en: "MidiAI Studio UI",
    ja: "MidiAI Studio UI"
  },
  "Practice “MIDI to PDF sheet music” in MidiAI Studio": {
    ko: "MidiAI Studio에서 「MIDI를 PDF 악보로」 연습하기",
    en: "Practice “MIDI to PDF sheet music” in MidiAI Studio",
    ja: "MidiAI Studioで「MIDIをPDF楽譜へ」を試す"
  },
  "Open the Windows app, run a short test conversion for this workflow, then edit the draft before you export.": {
    ko: "Windows 앱을 열고 이 워크플로로 짧은 테스트 변환을 실행한 뒤, 보내기 전에 초안을 편집하세요.",
    en: "Open the Windows app, run a short test conversion for this workflow, then edit the draft before you export.",
    ja: "Windowsアプリを開き、このワークフローで短いテスト変換を実行し、書き出す前に下書きを編集してください。"
  },
  "Quick pause: bookmark this section, then finish the article—or jump to a trial conversion while the example is fresh.": {
    ko: "잠깐 멈추기: 이 섹션을 북마크한 뒤 글을 끝까지 읽거나, 예제가 생생할 때 체험 변환으로 바로 가세요.",
    en: "Quick pause: bookmark this section, then finish the article—or jump to a trial conversion while the example is fresh.",
    ja: "少し休憩: このセクションをブックマークして記事を読み切るか、例が新鮮なうちに体験変換へ飛んでください。"
  },
  "Back to pillar guide": {
    ko: "필러 가이드로 돌아가기",
    en: "Back to pillar guide",
    ja: "ピラーガイドへ戻る"
  },
  "Pick a quantization grid that matches the music.": {
    ko: "곡에 맞는 양자화 격자를 고르세요.",
    en: "Pick a quantization grid that matches the music.",
    ja: "曲に合うクオンタイズ格子を選びます。"
  },
  "Choose the finest rhythmic value the piece actually uses — often sixteenths, sometimes triplets — as your grid. Matching the grid to the material tidies timing without flattening genuine rhythms.": {
    ko: "곡이 실제로 쓰는 가장 세밀한 리듬 값 — 대개 십육분, 때로는 셋잇단 — 을 격자로 고르세요. 재료에 격자를 맞추면 진짜 리듬을 납작하게 만들지 않으면서 타이밍을 정리합니다.",
    en: "Choose the finest rhythmic value the piece actually uses — often sixteenths, sometimes triplets — as your grid. Matching the grid to the material tidies timing without flattening genuine rhythms.",
    ja: "曲が実際に使う最も細かいリズム値 — 多くは十六分、時には三連符 — を格子にします。素材に格子を合わせると、本物のリズムをつぶさずにタイミングを整えます。"
  },
  "Set the key and meter before spelling notes.": {
    ko: "음표를 표기하기 전에 조와 박자를 정하세요.",
    en: "Set the key and meter before spelling notes.",
    ja: "音符を書き分ける前に調と拍子を決めます。"
  },
  "Supply the correct key and time signature up front. They guide enharmonic spelling and bar placement, so setting them first prevents a page full of wrongly-spelled accidentals.": {
    ko: "올바른 조와 박자표를 먼저 넣으세요. 이명동음 표기와 마디 배치를 안내하므로, 먼저 정하면 잘못 쓴 임시표로 가득한 페이지를 막을 수 있습니다.",
    en: "Supply the correct key and time signature up front. They guide enharmonic spelling and bar placement, so setting them first prevents a page full of wrongly-spelled accidentals.",
    ja: "正しい調と拍子記号を先に与えます。異名同音の表記と小節配置の指針になるので、先に決めると誤った臨時記号だらけのページを防げます。"
  },
  "Split hands or parts onto separate staves.": {
    ko: "손이나 파트를 별도 보표로 나누세요.",
    en: "Split hands or parts onto separate staves.",
    ja: "手やパートを別の譜表へ分けます。"
  },
  "Assign a pitch split point or use voice data to place material on treble and bass staves. Clean staff assignment is what makes a two-handed part readable rather than a single overloaded line.": {
    ko: "음높이 분할점이나 보이스 데이터로 재료를 높은음자리·낮은음자리에 두세요. 깨끗한 보표 배정이 양손 파트를 한 줄에 몰아넣은 상태가 아니라 읽기 쉽게 만듭니다.",
    en: "Assign a pitch split point or use voice data to place material on treble and bass staves. Clean staff assignment is what makes a two-handed part readable rather than a single overloaded line.",
    ja: "音高の分割点や声部データで素材をト音・ヘ音に置きます。きれいな譜表割り当てが、両手パートを1本に詰め込んだ状態ではなく読みやすくします。"
  },
  "Resolve chords and overlapping voices.": {
    ko: "화음과 겹치는 보이스를 정리하세요.",
    en: "Resolve chords and overlapping voices.",
    ja: "和音と重なる声部を整理します。"
  },
  "Group simultaneous notes into chords and separate genuinely independent lines into voices with their own stems. This is what stops a dense passage from becoming an unreadable stack.": {
    ko: "동시 음표를 화음으로 묶고, 정말 독립적인 선은 각자 줄기가 있는 보이스로 나누세요. 밀집 패시지가 읽기 불가능한 더미가 되는 것을 막는 방법입니다.",
    en: "Group simultaneous notes into chords and separate genuinely independent lines into voices with their own stems. This is what stops a dense passage from becoming an unreadable stack.",
    ja: "同時の音符を和音にまとめ、本当に独立した線は各自の符幹を持つ声部に分けます。密なパッセージが読めない山になるのを防ぐ方法です。"
  },
  "Do a legibility layout pass.": {
    ko: "가독성 레이아웃 패스를 하세요.",
    en: "Do a legibility layout pass.",
    ja: "可読性のためのレイアウトパスを行います。"
  },
  "Adjust measures per line, beaming, and page turns so a performer can read ahead. Correct notation is not the same as comfortable notation, and this pass closes that gap.": {
    ko: "연주자가 앞을 내다볼 수 있도록 줄당 마디, 빔, 페이지 넘김을 조정하세요. 올바른 기보와 편안한 기보는 다르며, 이 패스가 그 간극을 메웁니다.",
    en: "Adjust measures per line, beaming, and page turns so a performer can read ahead. Correct notation is not the same as comfortable notation, and this pass closes that gap.",
    ja: "奏者が先を読めるよう、1行の小節・ビーム・ページめくりを調整します。正しい記譜と快適な記譜は別物で、このパスがその差を埋めます。"
  },
  "Clean obvious timing outliers in the MIDI before quantizing so the grid has an easier target.": {
    ko: "양자화 전에 MIDI의 분명한 타이밍 이상치를 정리해 격자가 맞추기 쉽게 하세요.",
    en: "Clean obvious timing outliers in the MIDI before quantizing so the grid has an easier target.",
    ja: "クオンタイズ前にMIDIの明らかなタイミング外れを整え、格子が合わせやすくします。"
  },
  "Prefer the coarsest grid that still captures the real rhythms to keep the page uncluttered.": {
    ko: "실제 리듬은 담으면서도 페이지가 산만하지 않도록, 가능한 한 거친 격자를 택하세요.",
    en: "Prefer the coarsest grid that still captures the real rhythms to keep the page uncluttered.",
    ja: "本物のリズムは残しつつページが散らからないよう、できるだけ粗い格子を選びます。"
  },
  "Set a sensible split point for hands rather than accepting a default that strands notes.": {
    ko: "음표를 取り残기는 기본값 대신, 손에 맞는 합리적인 분할점을 정하세요.",
    en: "Set a sensible split point for hands rather than accepting a default that strands notes.",
    ja: "音符を置き去りにする既定値ではなく、手に合う妥当な分割点を決めます。"
  },
  "Confirm enharmonic spelling in chromatic passages where the automatic choice is least certain.": {
    ko: "자동 선택이 가장 불확실한 반음계 패시지에서 이명동음 표기를 확인하세요.",
    en: "Confirm enharmonic spelling in chromatic passages where the automatic choice is least certain.",
    ja: "自動選択がいちばん不確かな半音階パッセージで異名同音表記を確認します。"
  },
  "Print a test page and read it at a stand before committing to the final layout.": {
    ko: "최종 레이아웃을 확정하기 전에 테스트 페이지를 인쇄해 보면대에서 읽어 보세요.",
    en: "Print a test page and read it at a stand before committing to the final layout.",
    ja: "最終レイアウトを決める前にテストページを印刷し、譜面台で読んでみます。"
  },
  "Over-quantizing expressive timing:": {
    ko: "표현력 있는 타이밍을 과도하게 양자화하기:",
    en: "Over-quantizing expressive timing:",
    ja: "表情豊かなタイミングを過度にクオンタイズする:"
  },
  "Snapping everything to a coarse grid erases the rhythms that made the performance musical.": {
    ko: "모든 것을 거친 격자에 맞추면 연주를 음악적으로 만든 리듬이 지워집니다.",
    en: "Snapping everything to a coarse grid erases the rhythms that made the performance musical.",
    ja: "すべてを粗い格子に合わせると、演奏を音楽的にしたリズムが消えます。"
  },
  "Skipping the key signature:": {
    ko: "조표를 건너뛰기:",
    en: "Skipping the key signature:",
    ja: "調号を飛ばす:"
  },
  "Without a key, spelling defaults produce awkward accidentals that make the page hard to read.": {
    ko: "조가 없으면 기본 표기가 어색한 임시표를 만들어 페이지를 읽기 어렵게 합니다.",
    en: "Without a key, spelling defaults produce awkward accidentals that make the page hard to read.",
    ja: "調がないと既定の表記がぎこちない臨時記号を生み、ページが読みにくくなります。"
  },
  "Leaving both hands on one staff:": {
    ko: "양손을 한 보표에 두기:",
    en: "Leaving both hands on one staff:",
    ja: "両手を1つの譜表に残す:"
  },
  "A single overloaded staff turns readable piano writing into an illegible pile of ledger lines.": {
    ko: "과부하된 한 보표는 읽기 좋은 피아노 기보를 가독성 없는 덧줄 더미로 바꿉니다.",
    en: "A single overloaded staff turns readable piano writing into an illegible pile of ledger lines.",
    ja: "過負荷の1譜表は、読みやすいピアノ書法を読めない加線の山に変えます。"
  },
  "Ignoring voice separation in chords:": {
    ko: "화음에서 보이스 분리를 무시하기:",
    en: "Ignoring voice separation in chords:",
    ja: "和音で声部分離を無視する:"
  },
  "Merged voices produce nonsensical stems and rests that no performer can parse at speed.": {
    ko: "합쳐진 보이스는 연주자가 빠르게 해석할 수 없는 말도 안 되는 줄기와 쉼표를 만듭니다.",
    en: "Merged voices produce nonsensical stems and rests that no performer can parse at speed.",
    ja: "混ざった声部は、奏者が速く解釈できない意味不明な符幹と休符を生みます。"
  },
  "Printing without a layout pass:": {
    ko: "레이아웃 패스 없이 인쇄하기:",
    en: "Printing without a layout pass:",
    ja: "レイアウトパスなしで印刷する:"
  },
  "Technically correct notation still fails at the stand if the spacing and page turns fight the reader.": {
    ko: "기술적으로 올바른 기보라도 간격과 페이지 넘김이 읽는 사람과 싸우면 보면대에서 실패합니다.",
    en: "Technically correct notation still fails at the stand if the spacing and page turns fight the reader.",
    ja: "技術的に正しい記譜でも、間隔とページめくりが読み手とぶつかれば譜面台では失敗します。"
  },
  "The counterintuitive truth of MIDI-to-notation is that a perfect performance makes a worse-looking page than a quantized one. Human timing is what makes music feel alive and what makes it un-notatable, so every conversion is a negotiation between fidelity to the take and readability on the stand.": {
    ko: "MIDI-to-기보의 직관에 반하는 진실은, 완벽한 연주가 양자화된 것보다 더 나쁜 페이지를 만든다는 점입니다. 사람 타이밍이 음악을 살아 있게 하면서도 기보 불가능하게 만들므로, 모든 변환은 테이크에 대한 충실과 보면대 가독성 사이의 협상입니다.",
    en: "The counterintuitive truth of MIDI-to-notation is that a perfect performance makes a worse-looking page than a quantized one. Human timing is what makes music feel alive and what makes it un-notatable, so every conversion is a negotiation between fidelity to the take and readability on the stand.",
    ja: "MIDIから記譜への直観に反する真実は、完璧な演奏のほうがクオンタイズしたものより見栄えの悪いページになることです。人間のタイミングが音楽を生き生きさせつつ記譜不能にもするので、変換はどれもテイクへの忠実さと譜面台での読みやすさの交渉です。"
  },
  "This is why quantization is an editorial act, not a mechanical one. Deciding that a passage is really straight sixteenths rather than a swung triplet feel is a musical judgment, and the best results come when you tell the engine what the music is rather than hoping it guesses. MidiAI Studio gives you that grid control precisely because there is no universally correct answer.": {
    ko: "그래서 양자화는 기계적 행위가 아니라 편집 행위입니다. 패시지가 스윙 셋잇단 느낌이 아니라 진짜 곧은 십육분이라고 정하는 것은 음악적 판단이며, 엔진이 짐작하길 바라기보다 음악이 무엇인지 말해 줄 때 결과가 가장 좋습니다. MidiAI Studio가 격자 제어를 주는 이유는 보편적으로 정답인 답이 없기 때문입니다.",
    en: "This is why quantization is an editorial act, not a mechanical one. Deciding that a passage is really straight sixteenths rather than a swung triplet feel is a musical judgment, and the best results come when you tell the engine what the music is rather than hoping it guesses. MidiAI Studio gives you that grid control precisely because there is no universally correct answer.",
    ja: "だからクオンタイズは機械的行為ではなく編集行為です。パッセージがスイング三連ではなく本当にまっすぐな十六分だと決めるのは音楽的判断で、エンジンの推測に頼るより音楽が何かを伝えたときに最良の結果が出ます。MidiAI Studioが格子制御を渡すのは、万人に正しい答えが一つではないからです。"
  },
  "Notation also demands information MIDI never stored. A file has no idea it is in D minor or in four-four; those are frames you impose to make the numbers meaningful. Supplying them thoughtfully up front prevents a cascade of downstream oddities in spelling and barring.": {
    ko: "기보는 MIDI가 저장하지 않은 정보도 요구합니다. 파일은 자신이 D단조인지 4/4인지 모릅니다. 그 틀은 숫자를 의미 있게 만들려고 당신이 얹는 것입니다. 앞에서 신중히 넣으면 표기와 마디 나누기에서 이어지는 연쇄 이상을 막을 수 있습니다.",
    en: "Notation also demands information MIDI never stored. A file has no idea it is in D minor or in four-four; those are frames you impose to make the numbers meaningful. Supplying them thoughtfully up front prevents a cascade of downstream oddities in spelling and barring.",
    ja: "記譜はMIDIが保存しなかった情報も求めます。ファイルは自分がD短調か4/4かを知りません。その枠は数字を意味あるものにするためにあなたが課すものです。先に丁寧に与えると、表記や小節分けの下流の奇妙さを連鎖的に防げます。"
  },
  "Ultimately, printing from MIDI rewards treating the output as a first engraving rather than a finished score. Expect to do a legibility pass, expect to make a few editorial calls, and the reward is a clean, playable page produced in minutes from data that started life as pure performance.": {
    ko: "결국 MIDI에서 인쇄할 때는 출력을 완성 악보가 아니라 첫 조각본으로 다루는 것이 이득입니다. 가독성 패스를 하고 몇 가지 편집 판단을 내릴 각오를 하면, 순수 연주로 시작한 데이터에서 몇 분 만에 깨끗하고 연주 가능한 페이지를 얻는 보상이 있습니다.",
    en: "Ultimately, printing from MIDI rewards treating the output as a first engraving rather than a finished score. Expect to do a legibility pass, expect to make a few editorial calls, and the reward is a clean, playable page produced in minutes from data that started life as pure performance.",
    ja: "結局、MIDIから印刷するときは出力を完成楽譜ではなく最初の彫刻稿として扱うのが得です。可読性パスと少しの編集判断を覚悟すれば、純粋な演奏として始まったデータから数分で清潔で演奏可能なページを得る報酬があります。"
  },
  "Straight answers for musicians researching": {
    ko: "다음을 조사하는 연주자를 위한 짧은 답변",
    en: "Straight answers for musicians researching",
    ja: "次を調べている音楽家向けの簡潔な答え"
  },
  ". Expand any question—answers stay on this page so you do not bounce away mid-read.": {
    ko: ". 질문을 펼쳐 보세요—답은 이 페이지에 남아 읽다 이탈하지 않습니다.",
    en: ". Expand any question—answers stay on this page so you do not bounce away mid-read.",
    ja: ". 質問を開いてください—答えはこのページに残り、途中で離れません。"
  },
  "Why does my MIDI file print with so many tiny rests and odd rhythms?": {
    ko: "MIDI 파일을 인쇄하면 왜 자잘한 쉼표와 이상한 리듬이 많을까요?",
    en: "Why does my MIDI file print with so many tiny rests and odd rhythms?",
    ja: "MIDIファイルを印刷すると、なぜ細かい休符と変なリズムが多いのですか?"
  },
  "Because raw MIDI stores exact performance timing, not tidy notation. Quantizing to an appropriate grid before engraving converts those messy durations into the rounded rhythms a reader expects.": {
    ko: "원시 MIDI는 깔끔한 기보가 아니라 정확한 연주 타이밍을 저장하기 때문입니다. 조각 전에 적절한 격자로 양자화하면 그 지저분한 길이가 읽는 이가 기대하는 둥근 리듬으로 바뀝니다.",
    en: "Because raw MIDI stores exact performance timing, not tidy notation. Quantizing to an appropriate grid before engraving converts those messy durations into the rounded rhythms a reader expects.",
    ja: "生のMIDIはきれいな記譜ではなく正確な演奏タイミングを保存するからです。彫刻前に適切な格子へクオンタイズすると、その乱れた長さが読み手が期待する丸めたリズムに変わります。"
  },
  "How does the converter decide between sharps and flats when printing MIDI?": {
    ko: "MIDI를 인쇄할 때 변환기는 올림표와 내림표를 어떻게 고르나요?",
    en: "How does the converter decide between sharps and flats when printing MIDI?",
    ja: "MIDI印刷時、変換ツールはシャープとフラットをどう決めますか?"
  },
  "It uses the key signature and melodic direction to pick the enharmonic spelling a musician would anticipate. Setting the correct key first is the biggest factor in getting readable accidentals.": {
    ko: "조표와 선율 방향으로 연주자가 예상할 이명동음 표기를 고릅니다. 올바른 조를 먼저 정하는 것이 읽기 좋은 임시표를 얻는 가장 큰 요인입니다.",
    en: "It uses the key signature and melodic direction to pick the enharmonic spelling a musician would anticipate. Setting the correct key first is the biggest factor in getting readable accidentals.",
    ja: "調号と旋律の方向で、奏者が予期する異名同音表記を選びます。正しい調を先に決めることが、読みやすい臨時記号を得る最大の要因です。"
  },
  "Can a single MIDI track become a proper two-staff piano part?": {
    ko: "MIDI 트랙 하나로 제대로 된 두 보표 피아노 파트가 될 수 있나요?",
    en: "Can a single MIDI track become a proper two-staff piano part?",
    ja: "1本のMIDIトラックでちゃんとした2譜表ピアノパートになりますか?"
  },
  "Yes, by splitting notes across treble and bass staves at a pitch boundary or by voice. Choosing a sensible split point is what turns one crowded staff into a readable grand staff.": {
    ko: "네. 음높이 경계나 보이스로 높은음자리·낮은음자리에 나누면 됩니다. 합리적인 분할점이 붐비는 한 보표를 읽기 쉬운 큰보표로 바꿉니다.",
    en: "Yes, by splitting notes across treble and bass staves at a pitch boundary or by voice. Choosing a sensible split point is what turns one crowded staff into a readable grand staff.",
    ja: "はい。音高の境界や声部でト音・ヘ音に分ければできます。妥当な分割点が混んだ1譜表を読みやすい大譜表に変えます。"
  },
  "Will MIDI-to-PDF keep the exact feel of my recorded performance?": {
    ko: "MIDI→PDF가 녹음 연주의 정확한 느낌을 유지하나요?",
    en: "Will MIDI-to-PDF keep the exact feel of my recorded performance?",
    ja: "MIDI→PDFは録音した演奏の正確な感触を保てますか?"
  },
  "It keeps the notes and approximate phrasing, but quantization necessarily rounds expressive timing so the page stays readable. You trade a little literal accuracy for legibility.": {
    ko: "음표와 대략의 프레이징은 남지만, 페이지를 읽기 쉽게 하려면 양자화가 표현 타이밍을 둥글게 만듭니다. 약간의 문자 그대로의 정확도를 가독성과 맞바꿉니다.",
    en: "It keeps the notes and approximate phrasing, but quantization necessarily rounds expressive timing so the page stays readable. You trade a little literal accuracy for legibility.",
    ja: "音符とおおよそのフレージングは残りますが、ページを読みやすくするためクオンタイズが表情タイミングを丸めます。少しの文字どおりの正確さと読みやすさを交換します。"
  },
  "Do I need to add time and key signatures myself for MIDI-to-PDF?": {
    ko: "MIDI→PDF에서 박자·조표를 직접 넣어야 하나요?",
    en: "Do I need to add time and key signatures myself for MIDI-to-PDF?",
    ja: "MIDI→PDFでは拍子・調号を自分で足す必要がありますか?"
  },
  "Often yes, because MIDI does not reliably store them. Supplying the meter and key before conversion lets the engine bar the music correctly and spell notes sensibly.": {
    ko: "대개 그렇습니다. MIDI가 그것들을 안정적으로 저장하지 않기 때문입니다. 변환 전에 박자와 조를 주면 엔진이 마디를 올바르게 나누고 음표를 합리적으로 표기합니다.",
    en: "Often yes, because MIDI does not reliably store them. Supplying the meter and key before conversion lets the engine bar the music correctly and spell notes sensibly.",
    ja: "多くの場合はいです。MIDIがそれらを確実に保存しないからです。変換前に拍子と調を与えると、エンジンが正しく小節を切り、音符を妥当に表記します。"
  },
  "Related guides for “MIDI to PDF sheet music”": {
    ko: "「MIDI를 PDF 악보로」 관련 가이드",
    en: "Related guides for “MIDI to PDF sheet music”",
    ja: "「MIDIをPDF楽譜へ」の関連ガイド"
  },
  "Hand-picked from the": {
    ko: "다음에서 고른 글",
    en: "Hand-picked from the",
    ja: "次から厳選した記事"
  },
  "cluster and nearby intents—not a generic footer dump.": {
    ko: "클러스터와 가까운 의도—일반 푸터 나열이 아닙니다.",
    en: "cluster and nearby intents—not a generic footer dump.",
    ja: "クラスターと近い意図—汎用フッターの羅列ではありません。"
  },
  "Pillar · MusicXML": {
    ko: "필러 · MusicXML",
    en: "Pillar · MusicXML",
    ja: "ピラー · MusicXML"
  },
  "Start here if you need the head-term overview": {
    ko: "핵심어 개요가 필요하면 여기서 시작하세요",
    en: "Start here if you need the head-term overview",
    ja: "ヘッドタームの概要が必要ならここから"
  },
  "MusicXML to MIDI playback · how-to": {
    ko: "MusicXML을 MIDI 재생으로 · 실용 가이드",
    en: "MusicXML to MIDI playback · how-to",
    ja: "MusicXMLからMIDI再生へ · 実践ガイド"
  },
  "MIDI to MusicXML notation · how-to": {
    ko: "MIDI를 MusicXML 기보로 · 실용 가이드",
    en: "MIDI to MusicXML notation · how-to",
    ja: "MIDIからMusicXML記譜へ · 実践ガイド"
  },
  "MIDI score editor workflow · workflow": {
    ko: "MIDI 악보 편집기 워크플로 · 워크플로",
    en: "MIDI score editor workflow · workflow",
    ja: "MIDI楽譜エディタワークフロー · ワークフロー"
  },
  "what is MusicXML format · explainer": {
    ko: "MusicXML 형식이란 · 해설",
    en: "what is MusicXML format · explainer",
    ja: "MusicXML形式とは · 解説"
  },
  "MusicXML vs MIDI differences · comparison": {
    ko: "MusicXML vs MIDI 차이 · 비교",
    en: "MusicXML vs MIDI differences · comparison",
    ja: "MusicXML vs MIDIの違い · 比較"
  },
  "Nearby · convert PDF sheet music to MIDI": {
    ko: "근처 · PDF 악보를 MIDI로",
    en: "Nearby · convert PDF sheet music to MIDI",
    ja: "近く · PDF楽譜をMIDIへ"
  },
  "Nearby · editable MIDI from PDF scores": {
    ko: "근처 · PDF 악보에서 편집 가능한 MIDI",
    en: "Nearby · editable MIDI from PDF scores",
    ja: "近く · PDF楽譜から編集可能なMIDI"
  },
  "All guides hub": {
    ko: "전체 가이드 허브",
    en: "All guides hub",
    ja: "ガイド一覧ハブ"
  },
  "Browse by pillar and cluster": {
    ko: "필러·클러스터별로 살펴보기",
    en: "Browse by pillar and cluster",
    ja: "ピラー・クラスター別に見る"
  },
  "Topical map": {
    ko: "토픽 맵",
    en: "Topical map",
    ja: "トピックマップ"
  },
  "See primary-keyword ownership": {
    ko: "주요 키워드 소유 관계 보기",
    en: "See primary-keyword ownership",
    ja: "主要キーワードの担当関係を見る"
  },
};

// ---------------------------------------------------------------------------
// Runtime state (module-level, reversible)
// ---------------------------------------------------------------------------
const textNodeOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
const WATCHED_ATTRS = ["aria-label", "title", "placeholder"];

function shouldRun() {
  try {
    if (typeof location !== "undefined" && location && typeof location.pathname === "string" && location.pathname.includes("/guides")) {
      return true;
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof document !== "undefined" && document.body && document.body.classList && document.body.classList.contains("seo-page")) {
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function resolveLang(lang) {
  return lang === "ko" || lang === "en" || lang === "ja" ? lang : "en";
}

function pickTranslation(entry, lang, fallbackKey) {
  if (!entry) return fallbackKey;
  return entry[lang] || entry.en || fallbackKey;
}

function isSidebarRegion(el) {
  return !!(el && el.closest && el.closest("#sidebar, .sidebar, #sidebarUserCard"));
}

function walkTextNodes(root, cb) {
  if (typeof document === "undefined" || !document.createTreeWalker) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentNode;
      if (!parent || parent.nodeType !== 1) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      // Portal sidebar uses Korean-source i18n — never rewrite it here.
      if (isSidebarRegion(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node = walker.nextNode();
  while (node) {
    cb(node);
    node = walker.nextNode();
  }
}

function applyTextNodes(body, lang) {
  walkTextNodes(body, (node) => {
    let original = textNodeOriginals.get(node);
    if (original === undefined) {
      original = node.nodeValue;
      textNodeOriginals.set(node, original);
    }
    const key = normalize(original);
    if (!key) return;
    const entry = PHRASES[key];
    if (!entry) {
      if (node.nodeValue !== original) node.nodeValue = original;
      return;
    }
    node.nodeValue = pickTranslation(entry, lang, key);
  });
}

function applyAttributes(body, lang) {
  const selector = WATCHED_ATTRS.map((attr) => "[" + attr + "]").join(",");
  let elements;
  try {
    elements = body.querySelectorAll(selector);
  } catch (e) {
    return;
  }
  elements.forEach((el) => {
    if (isSidebarRegion(el)) return;
    let store = attrOriginals.get(el);
    if (!store) {
      store = {};
      attrOriginals.set(el, store);
    }
    WATCHED_ATTRS.forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      if (store[attr] === undefined) {
        store[attr] = el.getAttribute(attr);
      }
      const original = store[attr];
      const key = normalize(original);
      if (!key) return;
      const entry = PHRASES[key];
      if (!entry) {
        if (el.getAttribute(attr) !== original) el.setAttribute(attr, original);
        return;
      }
      el.setAttribute(attr, pickTranslation(entry, lang, key));
    });
  });
}

/**
 * Translate /guides/ (and other seo-page) content between ko/en/ja.
 * Reversible: always resolves from the originally-captured English text,
 * so re-running with a different lang (including back to 'en') restores
 * the correct state without drift or double-translation.
 */
export function applyGuidesI18n(lang) {
  if (!shouldRun()) return;
  if (typeof document === "undefined" || !document.body) return;

  const targetLang = resolveLang(lang);

  if (document.documentElement) {
    document.documentElement.lang = targetLang;
  }

  const body = document.body;
  applyTextNodes(body, targetLang);
  applyAttributes(body, targetLang);
}

export const GUIDE_PHRASE_COUNT = Object.keys(PHRASES).length;
