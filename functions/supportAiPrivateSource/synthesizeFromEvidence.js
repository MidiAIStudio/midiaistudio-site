'use strict';

/**
 * Deterministic customer-safe answers from accepted evidence families.
 * Used when LLM synthesis is unavailable — never dumps raw source/JSON.
 */

const { detectQuestionFamily } = require('./relevance');

function detectIntentLite(q) {
  const s = String(q || '');
  if (/(어디|위치|메뉴|버튼)/i.test(s)) return 'where';
  if (/(어떻게|방법|써|사용|등록)/i.test(s)) return 'how';
  if (/(뭐야|무엇|이란|설명)/i.test(s)) return 'what';
  if (/(있어|있나|되나|가능)/i.test(s)) return 'exists';
  if (/(오류|에러|안돼|안됨|403|404)/i.test(s)) return 'error';
  return 'general';
}

function synthesizeFromEvidence({ question, locale = 'ko', privateDebug, passages } = {}) {
  const loc = locale || 'ko';
  const q = String(question || '');
  const family =
    detectQuestionFamily(q) ||
    (privateDebug && privateDebug.privateAcceptedHits && privateDebug.privateAcceptedHits.length
      ? detectQuestionFamily(q)
      : null);
  const intent = detectIntentLite(q);
  const hasPrivate = !!(privateDebug && privateDebug.privateSourceUsed);
  const hasPublic = (passages || []).some(
    (p) => p && !String(p.id || '').startsWith('private-source') && p.sourceKind !== 'private_source'
  );

  // Prefer public knowledge summary when available
  const publicTop = (passages || []).find(
    (p) => p && !String(p.id || '').startsWith('private-source') && p.sourceKind !== 'private_source' && (p.summary || p.text)
  );
  if (publicTop && (publicTop.summary || publicTop.text)) {
    const body = String(publicTop.summary || publicTop.text || '').trim();
    if (body && body.length < 500) {
      if (intent === 'exists') {
        return {
          ok: true,
          text:
            loc === 'en'
              ? `Yes. ${body}`
              : loc === 'ja'
                ? `はい。${body}`
                : `네. ${body}`,
          reason: 'public_summary'
        };
      }
      return { ok: true, text: body, reason: 'public_summary' };
    }
  }

  if (!hasPrivate && !hasPublic) {
    return { ok: false, reason: 'no_evidence' };
  }

  const answers = {
    arrange: {
      exists: {
        ko: '네. AI Assistant에서 악기 편곡을 돕는 Instrument Arrange(편곡) 기능을 사용할 수 있습니다. MIDI의 악기 구성을 나누거나 편곡할 때 쓰는 기능입니다.',
        en: 'Yes. AI Assistant includes Instrument Arrange, which helps rearrange MIDI parts for playable instrument layouts.',
        ja: 'はい。AI AssistantのInstrument ArrangeでMIDIの楽器構成を分けたり編曲したりできます。'
      },
      where: {
        ko: 'MIDI Editor의 AI Assistant에서 Instrument Arrange를 실행할 수 있습니다.',
        en: 'Open Instrument Arrange from AI Assistant in the MIDI Editor.',
        ja: 'MIDI EditorのAI AssistantからInstrument Arrangeを実行できます。'
      },
      how: {
        ko: 'MIDI Editor에서 AI Assistant를 연 뒤 Instrument Arrange를 실행하고, 결과를 확인한 다음 필요하면 되돌리기를 사용하세요.',
        en: 'In MIDI Editor, open AI Assistant, run Instrument Arrange, review the result, and Undo if needed.',
        ja: 'MIDI EditorでAI Assistantを開き、Instrument Arrangeを実行して結果を確認します。必要なら元に戻してください。'
      },
      what: {
        ko: 'Instrument Arrange는 MIDI의 악기 구성을 나누거나 특정 악기에서 연주하기 쉬운 파트로 다시 쓰도록 돕는 AI Assistant 기능입니다.',
        en: 'Instrument Arrange helps rewrite MIDI parts so they are easier to play on target instruments.',
        ja: 'Instrument Arrangeは、MIDIのパートを楽器向けに分け直すAI Assistant機能です。'
      }
    },
    easy_key: {
      exists: {
        ko: '네. AI Assistant의 Easier Key(쉬운 조 추천) 기능이 있습니다. 곡 전체를 같은 간격으로 옮겨 연주하기 쉬운 조로 바꾸는 데 도움을 줍니다.',
        en: 'Yes. AI Assistant includes Easier Key, which transposes the whole piece to favor easier (often white-key) playing.',
        ja: 'はい。AI AssistantのEasier Keyで曲全体を弾きやすいキーに移調できます。'
      },
      where: {
        ko: 'MIDI Editor → AI Assistant에서 Easier Key(쉬운 조 추천)를 실행하세요.',
        en: 'Run Easier Key from AI Assistant in the MIDI Editor.',
        ja: 'MIDI EditorのAI AssistantからEasier Keyを実行してください。'
      },
      how: {
        ko: 'AI Assistant에서 Easier Key를 실행한 뒤 결과를 들어보고, 마음에 들지 않으면 되돌리기를 사용하세요.',
        en: 'Run Easier Key in AI Assistant, listen to the result, and Undo if you dislike it.',
        ja: 'AI AssistantでEasier Keyを実行し、結果を確認します。気に入らなければ元に戻してください。'
      },
      what: {
        ko: '쉬운 키(Easier Key)는 MIDI를 연주하기 편한 조로 바꾸는 데 도움을 주는 기능입니다. 곡 전체를 같은 간격으로 이조합니다.',
        en: 'Easier Key helps transpose the whole song by a constant interval toward an easier key.',
        ja: 'Easier Keyは曲全体を一定の間隔で移調し、弾きやすいキーに近づける機能です。'
      }
    },
    cleanup: {
      exists: {
        ko: '네. AI Assistant의 Cleanup(정리)으로 겹침·짧은 노트 등을 정리할 수 있습니다.',
        en: 'Yes. AI Cleanup in AI Assistant can fix overlaps, duplicates, and short notes.',
        ja: 'はい。AI AssistantのCleanupで重なりや短いノートなどを整理できます。'
      },
      where: {
        ko: 'MIDI Editor의 AI Assistant에서 Cleanup을 실행하세요.',
        en: 'Run Cleanup from AI Assistant in the MIDI Editor.',
        ja: 'MIDI EditorのAI AssistantからCleanupを実行してください。'
      },
      how: {
        ko: 'AI Assistant에서 Cleanup을 실행하고 제안을 검토한 뒤 적용하세요. 필요하면 되돌리기를 사용합니다.',
        en: 'Run Cleanup in AI Assistant, review suggestions, apply, and Undo if needed.',
        ja: 'AI AssistantでCleanupを実行し、提案を確認して適用します。必要なら元に戻します。'
      },
      what: {
        ko: 'Cleanup은 겹치는 노트·짧은 노트 등을 정리해 MIDI를 다루기 쉽게 만드는 AI Assistant 기능입니다.',
        en: 'Cleanup tidies overlaps and short notes so MIDI is easier to edit and play.',
        ja: 'Cleanupは重なりや短いノートを整理するAI Assistant機能です。'
      }
    },
    scheduled: {
      exists: {
        ko: '네. 변환을 대기열에 넣어 순서대로 처리하는 예약(대기열) 변환을 사용할 수 있습니다. Studio/검색 결과에서 대기열에 추가하는 방식으로 등록합니다.',
        en: 'Yes. You can queue conversions to run in order (reservation/queue conversion) from Studio search results.',
        ja: 'はい。変換をキューに入れて順番に処理する予約変換を使えます。'
      },
      how: {
        ko: 'Studio에서 변환할 항목을 대기열(예약)에 추가하면 순서대로 변환이 진행됩니다. 시계 예약 타이머가 아니라 변환 대기열입니다.',
        en: 'Add items to the conversion queue in Studio; jobs run in order. It is a queue, not a clock timer.',
        ja: 'Studioで変換キューに追加すると順番に処理されます。時計タイマーではありません。'
      },
      what: {
        ko: '예약 변환은 변환 작업을 대기열에 등록해 순서대로 실행하는 기능입니다.',
        en: 'Scheduled/queue conversion runs conversion jobs in order from a queue.',
        ja: '予約変換は変換ジョブをキューに入れて順番に実行する機能です。'
      }
    },
    tempo: {
      where: {
        ko: 'MIDI Editor 상단 툴바의 BPM(템포) 숫자에서 프로젝트 재생 템포를 바꿀 수 있습니다.',
        en: 'Change project tempo in the BPM field on the MIDI Editor toolbar.',
        ja: 'MIDI Editor上部ツールバーのBPMでテンポを変更できます。'
      },
      how: {
        ko: 'MIDI Editor 상단 BPM 값을 바꾸면 프로젝트 전체 재생 템포가 적용됩니다.',
        en: 'Edit the BPM value on the MIDI Editor toolbar to set project playback tempo.',
        ja: 'MIDI Editor上部のBPM値を変えるとプロジェクト全体のテンポが変わります。'
      },
      what: {
        ko: '템포(BPM)는 프로젝트 전체 재생 속도입니다. 선택 노트만의 개별 템포가 아닙니다.',
        en: 'Tempo (BPM) is the project-wide playback speed, not a per-note tempo.',
        ja: 'テンポ(BPM)はプロジェクト全体の再生速度です。'
      }
    },
    conversion: {
      how: {
        ko: 'Studio에서 YouTube 링크 또는 오디오 파일을 가져온 뒤 미리듣기 구간을 정하고 MIDI로 변환하세요. PDF 악보는 PDF→MIDI 흐름을 사용합니다.',
        en: 'In Studio, import a YouTube link or audio file, set the preview range, then convert to MIDI. Use PDF→MIDI for score PDFs.',
        ja: 'StudioでYouTubeや音声を取り込み、範囲を選んでMIDIに変換します。PDF譜面はPDF→MIDIを使います。'
      },
      what: {
        ko: 'MidiAI Studio는 YouTube·오디오·PDF 악보 등을 MIDI로 변환한 뒤 Editor에서 다듬을 수 있습니다.',
        en: 'MidiAI Studio converts YouTube/audio/PDF scores to MIDI, then you refine them in the editors.',
        ja: 'MidiAI StudioはYouTube・音声・PDF譜面などをMIDIに変換し、Editorで整えられます。'
      }
    },
    humanize: {
      exists: {
        ko: '네. AI Assistant의 Humanize로 노트 타이밍·세기를 조금 흔들어 사람 연주에 가깝게 만들 수 있습니다.',
        en: 'Yes. AI Assistant Humanize gently varies timing and velocity for a more human feel.',
        ja: 'はい。AI AssistantのHumanizeでタイミングや強さを少し揺らし、人の演奏に近づけられます。'
      },
      what: {
        ko: 'Humanize는 기계적인 MIDI 연주를 사람 연주에 가깝게 다듬는 AI Assistant 기능입니다.',
        en: 'Humanize makes rigid MIDI performances feel more human.',
        ja: 'Humanizeは機械的なMIDIを人の演奏に近づける機能です。'
      }
    },
    sound: {
      exists: {
        ko: '네. 고품질 음원(사운드팩)을 설치하고 Use high-quality sounds를 켜면 재생 음질을 바꿀 수 있습니다.',
        en: 'Yes. Install high-quality soundpacks and enable Use high-quality sounds to improve playback tone.',
        ja: 'はい。高品質サウンドパックを入れて Use high-quality sounds をオンにすると再生音質を変えられます。'
      },
      how: {
        ko: '고품질 음원 관리에서 그룹을 설치/업데이트한 뒤 Use high-quality sounds를 켜세요. 특정 악기만 이상하면 해당 그룹 설치 상태를 확인하세요.',
        en: 'Install/update soundpack groups, then enable Use high-quality sounds. If only one instrument sounds wrong, check that group.',
        ja: '高品質サウンドをインストール/更新し、Use high-quality sounds をオンにしてください。'
      }
    },
    velocity: {
      where: {
        ko: 'MIDI Editor에서 노트를 선택한 뒤 벨로시티(세기)를 조절할 수 있습니다.',
        en: 'Select notes in the MIDI Editor, then adjust velocity.',
        ja: 'MIDI Editorでノートを選んでベロシティを調整できます。'
      },
      how: {
        ko: 'MIDI Editor에서 노트를 선택한 다음 벨로시티 값을 바꾸면 연주 세기가 바뀝니다.',
        en: 'Select notes in the MIDI Editor and change velocity to adjust loudness.',
        ja: 'MIDI Editorでノートを選び、ベロシティを変えると強さが変わります。'
      }
    },
    library: {
      how: {
        ko: 'Library에서 저장·최근 작업한 MIDI를 다시 열어 편집을 이어갈 수 있습니다.',
        en: 'Re-open saved or recent MIDI from Library to continue editing.',
        ja: 'Libraryから保存済み・最近のMIDIを開き直して編集を続けられます。'
      },
      where: {
        ko: '앱의 Library에서 저장한 작업물을 찾아 다시 열 수 있습니다.',
        en: 'Open saved work from Library in the app.',
        ja: 'アプリのLibraryから保存した作業を開き直せます。'
      }
    },
    pdf_export: {
      how: {
        ko: 'Score Editor에서 악보를 확인한 뒤 PDF로 내보내기/저장할 수 있습니다. PDF→MIDI(악보 인식)와는 다른 흐름입니다.',
        en: 'From Score Editor, export/save the score as PDF. This is different from PDF→MIDI recognition.',
        ja: 'Score Editorから譜面をPDF書き出しできます。PDF→MIDI認識とは別フローです。'
      },
      exists: {
        ko: '네. Score Editor에서 악보를 PDF로 내보낼 수 있습니다.',
        en: 'Yes. You can export the score as PDF from Score Editor.',
        ja: 'はい。Score Editorから譜面をPDF書き出しできます。'
      }
    }
  };

  const fam = answers[family];
  if (fam) {
    const pack = fam[intent] || fam.exists || fam.what || fam.how || fam.where;
    if (pack) {
      const text = pack[loc] || pack.ko || pack.en;
      if (text) return { ok: true, text, reason: `family_${family}_${intent}` };
    }
  }

  // Generic existence with private evidence but unknown family
  if (hasPrivate && intent === 'exists') {
    return {
      ok: true,
      text:
        loc === 'en'
          ? 'Yes — related product behavior is available in the app. Tell me the menu name you see, or whether you mean Arrange, Cleanup, Easy Key, or conversion.'
          : '네, 관련 기능이 앱에 있습니다. 화면에서 보이는 메뉴 이름, 또는 편곡(Arrange)·정리(Cleanup)·쉬운 키·변환 중 어떤 쪽인지 알려주시면 더 정확히 안내할게요.',
      reason: 'private_exists_generic'
    };
  }

  return { ok: false, reason: 'no_template' };
}

module.exports = {
  synthesizeFromEvidence,
  detectIntentLite
};
