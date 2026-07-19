/**
 * MidiAI Studio — Topical map + unique primary keywords (anti-cannibalization)
 * Pillars own head terms. Articles own distinct long-tail primaries only.
 */
export const SITE = "https://midiaistudio.com";

/** @typedef {{ slug: string, primary: string, intent: string, cluster: string, parent: string|null, secondaries: string[], screenshot: string }} ArticleSpec */

export const PILLARS = [
  {
    slug: "pdf-to-midi",
    path: "/guides/pdf-to-midi.html",
    primary: "PDF to MIDI",
    cluster: "score-omr",
    role: "pillar",
  },
  {
    slug: "youtube-to-midi",
    path: "/guides/youtube-to-midi.html",
    primary: "YouTube to MIDI",
    cluster: "youtube-covers",
    role: "pillar",
  },
  {
    slug: "mp3-to-midi",
    path: "/guides/mp3-to-midi.html",
    primary: "MP3 to MIDI",
    cluster: "audio-formats",
    role: "pillar",
  },
  {
    slug: "audio-to-midi",
    path: "/guides/audio-to-midi.html",
    primary: "Audio to MIDI",
    cluster: "audio-formats",
    role: "pillar",
  },
  {
    slug: "musicxml",
    path: "/guides/musicxml.html",
    primary: "MusicXML",
    cluster: "score-formats",
    role: "pillar",
  },
];

/**
 * Exactly one unique primary keyword per article URL.
 * Never reuse pillar head terms as article primaries.
 */
export const ARTICLES = [
  // --- score-omr cluster (parent: pdf-to-midi) ---
  {
    slug: "pdf-to-midi-complete-guide",
    primary: "convert PDF sheet music to MIDI",
    intent: "how-to",
    cluster: "score-omr",
    parent: "pdf-to-midi",
    secondaries: ["PDF score to MIDI workflow", "OMR MIDI cleanup"],
    screenshot: "sheet-music-pdf-musicxml-convert.jpg",
  },
  {
    slug: "pdf-sheet-music-to-editable-midi",
    primary: "editable MIDI from PDF scores",
    intent: "how-to",
    cluster: "score-omr",
    parent: "pdf-to-midi",
    secondaries: ["make PDF scores playable", "score to piano roll"],
    screenshot: "sheet-music-score-editor.jpg",
  },
  {
    slug: "sheet-music-recognition-ocr",
    primary: "optical music recognition OMR",
    intent: "explainer",
    cluster: "score-omr",
    parent: "pdf-to-midi",
    secondaries: ["sheet music OCR accuracy", "OMR vs audio transcription"],
    screenshot: "sheet-music-pdf-musicxml-convert.jpg",
  },
  {
    slug: "pdf-to-musicxml",
    primary: "PDF to MusicXML conversion",
    intent: "how-to",
    cluster: "score-omr",
    parent: "musicxml",
    secondaries: ["digitize PDF scores", "MusicXML for MuseScore"],
    screenshot: "sheet-music-pdf-musicxml-convert.jpg",
  },
  {
    slug: "how-to-edit-sheet-music-digitally",
    primary: "edit sheet music digitally",
    intent: "how-to",
    cluster: "score-omr",
    parent: "pdf-to-midi",
    secondaries: ["digital score editing workflow", "fix engraving errors"],
    screenshot: "sheet-music-score-editor.jpg",
  },
  {
    slug: "midi-to-pdf-sheet-music",
    primary: "MIDI to PDF sheet music",
    intent: "how-to",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["print MIDI as score", "MIDI engraving tips"],
    screenshot: "sheet-music-score-editor.jpg",
  },
  {
    slug: "score-editor-workflow",
    primary: "MIDI score editor workflow",
    intent: "workflow",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["piano roll to notation loop", "score cleanup checklist"],
    screenshot: "sheet-music-score-editor.jpg",
  },

  // --- youtube-covers cluster ---
  {
    slug: "youtube-to-midi-converter",
    primary: "YouTube piano cover to MIDI",
    intent: "how-to",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["convert piano cover videos", "YouTube MIDI practice files"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "convert-youtube-piano-covers-to-midi",
    primary: "step-by-step YouTube piano MIDI",
    intent: "how-to",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["piano cover transcription steps", "section-by-section convert"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "piano-learning-from-youtube-midi",
    primary: "learn piano with YouTube MIDI",
    intent: "use-case",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["slow practice from covers", "hands-separate MIDI practice"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "copyright-and-youtube-to-midi",
    primary: "YouTube MIDI copyright basics",
    intent: "legal-edu",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["personal use vs redistribute MIDI", "cover song MIDI rights"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "convert-cover-songs-to-midi-legally",
    primary: "legal checklist cover song MIDI",
    intent: "legal-edu",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["cover MIDI publishing risks", "study-only MIDI use"],
    screenshot: "midiai-studio-community.jpg",
  },
  {
    slug: "midi-for-content-creators",
    primary: "MIDI for music content creators",
    intent: "use-case",
    cluster: "youtube-covers",
    parent: "youtube-to-midi",
    secondaries: ["tutorial MIDI visuals", "Shorts piano MIDI tips"],
    screenshot: "midiai-studio-community.jpg",
  },

  // --- audio-formats cluster ---
  {
    slug: "mp3-to-midi-conversion",
    primary: "extract MIDI notes from MP3",
    intent: "how-to",
    cluster: "audio-formats",
    parent: "mp3-to-midi",
    secondaries: ["MP3 transcription tips", "compressed audio MIDI limits"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "mp3-piano-to-midi",
    primary: "piano MP3 to MIDI transcription",
    intent: "how-to",
    cluster: "audio-formats",
    parent: "mp3-to-midi",
    secondaries: ["solo piano MP3 convert", "piano roll from MP3"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "audio-to-midi-ai",
    primary: "AI audio transcription to MIDI",
    intent: "explainer",
    cluster: "audio-formats",
    parent: "audio-to-midi",
    secondaries: ["neural audio-to-MIDI", "recording to MIDI draft"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "wav-to-midi",
    primary: "WAV to MIDI conversion quality",
    intent: "how-to",
    cluster: "audio-formats",
    parent: "audio-to-midi",
    secondaries: ["lossless audio transcription", "WAV vs MP3 for MIDI"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "flac-to-midi",
    primary: "FLAC to MIDI transcription",
    intent: "how-to",
    cluster: "audio-formats",
    parent: "audio-to-midi",
    secondaries: ["FLAC source prep", "high-res audio MIDI"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "best-practices-audio-to-midi",
    primary: "audio to MIDI accuracy checklist",
    intent: "checklist",
    cluster: "audio-formats",
    parent: "audio-to-midi",
    secondaries: ["prep audio for transcription", "gain staging for MIDI AI"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "improve-midi-accuracy",
    primary: "improve AI MIDI accuracy",
    intent: "troubleshooting",
    cluster: "audio-formats",
    parent: "audio-to-midi",
    secondaries: ["fix bad transcriptions", "reduce MIDI note errors"],
    screenshot: "midi-editor-piano-roll.jpg",
  },

  // --- score-formats / MusicXML ---
  {
    slug: "musicxml-explained",
    primary: "what is MusicXML format",
    intent: "explainer",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["MusicXML definition", "open score exchange format"],
    screenshot: "sheet-music-pdf-musicxml-convert.jpg",
  },
  {
    slug: "musicxml-vs-midi",
    primary: "MusicXML vs MIDI differences",
    intent: "comparison",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["notation vs performance data", "when to use MusicXML"],
    screenshot: "sheet-music-score-editor.jpg",
  },
  {
    slug: "musicxml-to-midi",
    primary: "MusicXML to MIDI playback",
    intent: "how-to",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["realize MusicXML as MIDI", "score to DAW MIDI"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "midi-to-musicxml",
    primary: "MIDI to MusicXML notation",
    intent: "how-to",
    cluster: "score-formats",
    parent: "musicxml",
    secondaries: ["performance to engraving", "quantize before MusicXML"],
    screenshot: "sheet-music-pdf-musicxml-convert.jpg",
  },

  // --- piano / polyphony ---
  {
    slug: "piano-midi-converter",
    primary: "piano MIDI conversion tips",
    intent: "how-to",
    cluster: "piano-polyphony",
    parent: "audio-to-midi",
    secondaries: ["piano cover MIDI quality", "pedal and polyphony"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "polyphonic-piano-transcription",
    primary: "polyphonic piano transcription",
    intent: "explainer",
    cluster: "piano-polyphony",
    parent: "audio-to-midi",
    secondaries: ["chord transcription errors", "dense piano MIDI cleanup"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "monophonic-vs-polyphonic-midi",
    primary: "monophonic vs polyphonic MIDI",
    intent: "comparison",
    cluster: "piano-polyphony",
    parent: "audio-to-midi",
    secondaries: ["melody vs chord transcription", "choose transcription mode"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "transcribe-classical-piano",
    primary: "classical piano AI transcription",
    intent: "use-case",
    cluster: "piano-polyphony",
    parent: "audio-to-midi",
    secondaries: ["rubato MIDI editing", "classical score from audio"],
    screenshot: "sheet-music-score-editor.jpg",
  },
  {
    slug: "jazz-piano-to-midi-challenges",
    primary: "jazz piano MIDI transcription",
    intent: "troubleshooting",
    cluster: "piano-polyphony",
    parent: "audio-to-midi",
    secondaries: ["swing feel MIDI", "jazz voicing cleanup"],
    screenshot: "midi-editor-piano-roll.jpg",
  },

  // --- instruments ---
  {
    slug: "guitar-to-midi",
    primary: "guitar audio to MIDI",
    intent: "how-to",
    cluster: "instruments",
    parent: "audio-to-midi",
    secondaries: ["guitar bends MIDI limits", "DI guitar transcription"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "drum-midi-extraction",
    primary: "extract drum MIDI from audio",
    intent: "how-to",
    cluster: "instruments",
    parent: "audio-to-midi",
    secondaries: ["drum pattern MIDI", "kit mapping after conversion"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "vocal-to-midi",
    primary: "vocal melody to MIDI",
    intent: "how-to",
    cluster: "instruments",
    parent: "audio-to-midi",
    secondaries: ["sing to MIDI notes", "monophonic vocal transcription"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "instrument-conversion-midi",
    primary: "MIDI instrument remapping",
    intent: "workflow",
    cluster: "instruments",
    parent: "audio-to-midi",
    secondaries: ["change MIDI instrument sound", "arrangement remapping"],
    screenshot: "midiai-studio-license-screen.jpg",
  },

  // --- editing ---
  {
    slug: "midi-editing-basics",
    primary: "MIDI editing after AI conversion",
    intent: "how-to",
    cluster: "midi-editing",
    parent: "audio-to-midi",
    secondaries: ["piano roll cleanup basics", "fix AI MIDI drafts"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "cleaning-up-ai-generated-midi",
    primary: "cleanup checklist AI MIDI",
    intent: "checklist",
    cluster: "midi-editing",
    parent: "audio-to-midi",
    secondaries: ["remove doubled MIDI notes", "octave error fixes"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "midi-velocity-and-expression",
    primary: "MIDI velocity expression editing",
    intent: "how-to",
    cluster: "midi-editing",
    parent: "audio-to-midi",
    secondaries: ["restore dynamics in MIDI", "CC and expression data"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "quantize-midi-after-conversion",
    primary: "quantize AI MIDI timing",
    intent: "how-to",
    cluster: "midi-editing",
    parent: "audio-to-midi",
    secondaries: ["grid quantize vs groove", "when not to quantize"],
    screenshot: "midi-editor-piano-roll.jpg",
  },

  // --- DAW ---
  {
    slug: "daw-workflow-with-converted-midi",
    primary: "import converted MIDI to DAW",
    intent: "workflow",
    cluster: "daw-workflows",
    parent: "audio-to-midi",
    secondaries: ["DAW MIDI tempo map", "arrange AI MIDI clips"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "using-midi-in-ableton",
    primary: "Ableton Live converted MIDI",
    intent: "how-to",
    cluster: "daw-workflows",
    parent: "audio-to-midi",
    secondaries: ["Ableton piano roll MIDI", "Live instrument racks"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "using-midi-in-fl-studio",
    primary: "FL Studio piano roll AI MIDI",
    intent: "how-to",
    cluster: "daw-workflows",
    parent: "audio-to-midi",
    secondaries: ["FL Studio MIDI import", "Channel rack MIDI cleanup"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "using-midi-in-logic-pro",
    primary: "Logic Pro converted MIDI scores",
    intent: "how-to",
    cluster: "daw-workflows",
    parent: "audio-to-midi",
    secondaries: ["Logic score editor MIDI", "articulation sets"],
    screenshot: "sheet-music-score-editor.jpg",
  },

  // --- education / product ---
  {
    slug: "how-ai-midi-conversion-works",
    primary: "how AI MIDI models work",
    intent: "explainer",
    cluster: "ai-concepts",
    parent: "audio-to-midi",
    secondaries: ["onset pitch detection", "transcription model limits"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "ai-music-transcription-guide",
    primary: "AI music transcription overview",
    intent: "explainer",
    cluster: "ai-concepts",
    parent: "audio-to-midi",
    secondaries: ["transcription expectations", "AI vs manual transcription"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "midi-vs-audio-explained",
    primary: "MIDI vs audio explained",
    intent: "explainer",
    cluster: "ai-concepts",
    parent: "audio-to-midi",
    secondaries: ["symbolic vs waveform", "why convert to MIDI"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "beginner-guide-midi-files",
    primary: "beginner guide to MIDI files",
    intent: "explainer",
    cluster: "ai-concepts",
    parent: "audio-to-midi",
    secondaries: ["what MIDI files contain", "open MIDI file basics"],
    screenshot: "midi-editor-piano-roll.jpg",
  },
  {
    slug: "compare-ai-transcription-tools",
    primary: "choose AI transcription tool by job",
    intent: "comparison",
    cluster: "product-fit",
    parent: "audio-to-midi",
    secondaries: ["OMR vs pitch editor vs converter", "tool category map"],
    screenshot: "ai-midi-converter-home.jpg",
  },
  {
    slug: "offline-vs-online-midi-converters",
    primary: "offline vs online MIDI converters",
    intent: "comparison",
    cluster: "product-fit",
    parent: "audio-to-midi",
    secondaries: ["desktop MIDI privacy", "upload converter limits"],
    screenshot: "midiai-studio-license-screen.jpg",
  },
  {
    slug: "windows-midi-converter-software",
    primary: "Windows MIDI converter software checklist",
    intent: "checklist",
    cluster: "product-fit",
    parent: "audio-to-midi",
    secondaries: ["Windows MIDI app features", "license and support checklist"],
    screenshot: "midiai-studio-license-screen.jpg",
  },
  {
    slug: "midiai-studio-vs-manual-transcription",
    primary: "AI MIDI vs manual transcription",
    intent: "comparison",
    cluster: "product-fit",
    parent: "audio-to-midi",
    secondaries: ["when to transcribe by ear", "speed vs accuracy tradeoff"],
    screenshot: "ai-audio-to-midi-studio.jpg",
  },
  {
    slug: "midi-for-music-teachers",
    primary: "MIDI lesson materials for teachers",
    intent: "use-case",
    cluster: "education",
    parent: "youtube-to-midi",
    secondaries: ["classroom MIDI practice files", "teacher PDF to MIDI"],
    screenshot: "midiai-studio-community.jpg",
  },
];

export const CLUSTERS = {
  "score-omr": {
    name: "Sheet music & OMR",
    pillar: "pdf-to-midi",
    description: "PDF/score recognition, OMR, editable scores",
  },
  "youtube-covers": {
    name: "YouTube & covers",
    pillar: "youtube-to-midi",
    description: "Piano covers, learning, copyright-aware use",
  },
  "audio-formats": {
    name: "Audio file conversion",
    pillar: "audio-to-midi",
    description: "MP3/WAV/FLAC/audio → MIDI quality & prep",
  },
  "score-formats": {
    name: "MusicXML & score interchange",
    pillar: "musicxml",
    description: "MusicXML ↔ MIDI ↔ PDF notation paths",
  },
  "piano-polyphony": {
    name: "Piano & polyphony",
    pillar: "audio-to-midi",
    description: "Piano-specific transcription difficulty",
  },
  instruments: {
    name: "Other instruments",
    pillar: "audio-to-midi",
    description: "Guitar, drums, vocals, remapping",
  },
  "midi-editing": {
    name: "MIDI editing craft",
    pillar: "audio-to-midi",
    description: "Cleanup, velocity, quantize",
  },
  "daw-workflows": {
    name: "DAW integration",
    pillar: "audio-to-midi",
    description: "Ableton, FL, Logic, generic DAW",
  },
  "ai-concepts": {
    name: "AI & MIDI fundamentals",
    pillar: "audio-to-midi",
    description: "How models work, MIDI vs audio",
  },
  "product-fit": {
    name: "Tool selection",
    pillar: "audio-to-midi",
    description: "Offline/online, Windows checklist, AI vs manual",
  },
  education: {
    name: "Teaching & learning",
    pillar: "youtube-to-midi",
    description: "Teachers and practice workflows",
  },
};

export function assertUniquePrimaries() {
  const all = [
    ...PILLARS.map((p) => ({ slug: p.slug, primary: p.primary, role: "pillar" })),
    ...ARTICLES.map((a) => ({ slug: a.slug, primary: a.primary, role: "article" })),
  ];
  const seen = new Map();
  const dupes = [];
  for (const row of all) {
    const key = row.primary.toLowerCase().trim();
    if (seen.has(key)) dupes.push([seen.get(key), row.slug, row.primary]);
    else seen.set(key, row.slug);
  }
  if (ARTICLES.length !== 50) throw new Error(`Expected 50 articles, got ${ARTICLES.length}`);
  if (dupes.length) throw new Error(`Duplicate primaries: ${JSON.stringify(dupes)}`);
  return all;
}
