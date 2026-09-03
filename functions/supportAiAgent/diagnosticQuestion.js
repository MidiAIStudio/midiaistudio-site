/**
 * Diagnostic clarifying question generator for low-confidence retrieval.
 * Deterministic first (rules based on intent + evidence), optional LLM selection could be added later.
 *
 * Output must be safe customer-facing text: no internal labels, ids, or knowledge-source mentions.
 */
'use strict';

function cleanSpace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function detectErrorCode(text) {
  const m =
    String(text || '').match(/\b(403|404|401|429|500|502|503)\b/) ||
    String(text || '').match(/\b[A-Z]{2,}[-_ ]?\d{2,}\b/);
  return m ? String(m[0]) : null;
}

function generateDiagnosticClarifyQuestion({
  locale = 'ko',
  intent = 'general',
  rawQuestion = '',
  question = '',
  passages = [],
  facts = {},
  hypotheses = []
} = {}) {
  const loc = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko';
  const raw = cleanSpace(rawQuestion || question || '');
  const errCode = facts.errorCode || detectErrorCode(raw);
  const hyps = Array.isArray(hypotheses) ? hypotheses : [];

  if (loc === 'ko') {
    if (hyps.includes('transcription') && hyps.includes('playback')) {
      return '변환 결과 음표가 이상한가요, 악기/사운드 재생이 다른가요, 아니면 재생 자체 문제인가요?';
    }
    if (hyps.includes('youtube_fetch') && !facts.sourceType) {
      return 'YouTube에서 오디오를 가져오는 중인지, 설치 파일을 받는 중인지, 다른 저장/내보내기인지 알려주세요.';
    }
    if (hyps.includes('youtube') && !facts.conversionKind) {
      return '어떤 변환에서 문제가 생기나요? YouTube / 오디오 파일 / PDF 중 하나를 알려주시고, 오류 문구가 있으면 같이 보내주세요.';
    }
    if (facts.conversionKind === 'youtube' && !facts.errorCode) {
      return 'YouTube 영상을 불러오는 단계인지, 오디오 분석/변환 단계인지 확인할게요. 화면에 오류 코드나 문구가 보이나요?';
    }
  }

  // If evidence indicates a "where" style question, prefer location/screen info.
  const evidenceIds = (passages || []).map((p) => String(p.id || ''));
  const evidenceHasPdf = evidenceIds.some((id) => /pdf/i.test(id)) || /\bpdf\b/i.test(raw);
  const evidenceHasYoutube =
    evidenceIds.some((id) => /youtube|yt/i.test(id)) || /\b유튜브\b/i.test(raw) || /\byt\b/i.test(raw);

  if (loc === 'en') {
    if (facts.candidateFeature) {
      const name = cleanSpace(facts.candidateFeature);
      return `I couldn’t verify “${name}” in the official docs yet. Where did you see that label (screen/menu/button)?`;
    }
    if (intent === 'troubleshoot') {
      return `Which step fails (install / login / conversion / playback)? If possible, paste the exact error message (one line is enough).`;
    }
    if (intent === 'install') {
      return `Which step fails in the install flow (download / install / login)? Please include the exact error message or code.`;
    }
    if (intent === 'where') {
      const extra = evidenceHasPdf ? ' (PDF export / PDF import screen)?' : '';
      return `Where are you looking for it (which screen/menu in MidiAI Studio)?${extra} If you can, tell us the screen name.`;
    }
    if (intent === 'how') {
      return `What are you trying to do right now, and what step are you stuck on? (1-2 short details is enough)`;
    }
    if (intent === 'what') {
      return `Which specific feature or menu item are you asking about (name it), and what you want it to accomplish?`;
    }
    // general
    return `What task are you trying to complete, and what exact step is failing? If there is an error, include the message/code${
      errCode ? ` (${errCode})` : ''
    }.`;
  }

  if (loc === 'ja') {
    if (facts.candidateFeature) {
      const name = cleanSpace(facts.candidateFeature);
      return `「${name}」という表示をどの画面・メニューで見ましたか？場所が分かると確認できます。`;
    }
    if (intent === 'troubleshoot') {
      return `どの手順で失敗していますか（インストール / ログイン / 変換 / 再生）？可能なら、エラーメッセージをそのまま1行で教えてください。`;
    }
    if (intent === 'install') {
      return `インストールのどの段階で止まりますか（ダウンロード / インストール / ログイン）？エラー文かコードを送ってください。`;
    }
    if (intent === 'where') {
      const extra = evidenceHasPdf ? '（PDFの書き出し/読み込み画面？）' : '';
      return `どの画面／メニューを探していますか？${extra} 可能なら画面名を教えてください。`;
    }
    if (intent === 'how') {
      return `いま何をやろうとしていて、どの手順で詰まっていますか？（短くでOK）`;
    }
    if (intent === 'what') {
      return `どの機能／メニューについて知りたいですか（名前を教えてください）？そして何ができるようになりたいですか。`;
    }
    return `何をしたいのか、そしてどの手順で失敗しているのかを教えてください。エラーがあれば文言／コード${
      errCode ? `（${errCode}）` : ''
    }もお願いします。`;
  }

  // ko — lock known feature candidate: never re-ask "어떤 작업을"
  if (facts.candidateFeature) {
    const name = cleanSpace(facts.candidateFeature);
    if (hyps.length >= 2) {
      return `"${name}"이 어떤 작업에 가까운지, 그리고 그 이름을 본 화면을 알려주시면 확인하겠습니다.`;
    }
    if (intent === 'where') {
      return `"${name}"이라고 표시된 메뉴나 버튼을 어디에서 보셨나요? 화면 이름이나 근처 버튼 위치를 알려주시면 확인해볼게요.`;
    }
    return `"${name}" 기능을 말씀하시는 거죠? 같은 이름으로 바로 확인이 안 돼서, 그 이름이 보인 화면이나 버튼 위치를 알려주시면 맞춰볼게요.`;
  }

  // ko
  if (intent === 'troubleshoot') {
    return `어느 단계에서 문제가 생기나요? (설치 / 로그인 / 변환 / 재생 중) 가능하면 오류 문구를 한 줄 그대로 알려주세요.`;
  }
  if (intent === 'install') {
    return `설치 과정 중 어디에서 막히나요? (다운로드 / 설치 / 로그인) 오류 문구나 에러 코드를 알려주세요.`;
  }
  if (intent === 'where') {
    const extra = evidenceHasPdf ? ' (PDF 내보내기/불러오기 화면인가요?)' : '';
    return `어디에서 찾으려는 건가요? (MidiAI Studio의 어떤 화면/메뉴인지)${extra} 가능하면 화면 이름을 알려주세요.`;
  }
  if (intent === 'how') {
    return `지금 어떤 작업을 하려는 건가요? 그리고 어느 단계에서 막혔는지 1-2가지만 알려주세요.`;
  }
  if (intent === 'what') {
    return `어떤 기능(메뉴) 질문인지 한 가지만 콕 집어 알려주세요. 그리고 무엇을 하고 싶은지도 같이 적어주시면 정확해요.`;
  }

  // general / fallback
  if (evidenceHasYoutube) {
    return `어느 단계에서 막히나요? (유튜브 링크 준비/다운로드/변환/재생 중) 가능하면 오류 문구나 에러 코드${
      errCode ? ` (${errCode})` : ''
    }를 알려주세요.`;
  }
  return `어떤 작업을 하려는 건지, 그리고 어느 단계에서 막혔는지 한 줄로 알려주세요. 오류가 있다면 문구/에러 코드${
    errCode ? ` (${errCode})` : ''
  }도 함께 부탁드립니다.`;
}

module.exports = { generateDiagnosticClarifyQuestion };

