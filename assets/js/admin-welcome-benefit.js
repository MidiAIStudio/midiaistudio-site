/**
 * Admin Welcome Benefit (신규 가입 혜택) console panel.
 * Grants Full pass for admin-configured days (not credits).
 */

import { buildAdminBrandedEmail, escapeHtml } from './admin-email-template.js?v=welcome-ui-4';

const MAX_PASS_DAYS = 90;
const MIN_PASS_DAYS = 1;
const DEFAULT_PASS_DAYS = 3;
const PRODUCT_NAME = 'MidiAI Studio';
const PREVIEW_SAMPLE = {
  name: '홍길동',
  email: 'user@example.com'
};
const API_WAIT_MS = 20000;
const API_POLL_MS = 120;
const PREVIEW_DEBOUNCE_MS = 220;
const VAR_TOKEN = {
  name: '{{name}}',
  email: '{{email}}',
  days: '{{days}}',
  product_name: '{{product_name}}'
};

const DEFAULT_EMAIL_BODY = `{{name}}님, MidiAI Studio에 가입해주셔서 감사합니다.

신규 가입 혜택으로
{{days}}일 Full 이용권이 계정에 지급되었습니다.

이용권 기간 동안 MidiAI Studio의 Full 기능을 이용할 수 있습니다.

문의가 있으시면 앱 내 고객지원으로 연락해 주세요.`;

/** Preview-only typography: keep sent-mail template at production sizes. */
const PREVIEW_EMAIL_STYLE = `<style id="welcome-preview-density">
p,li{font-size:13.5px!important;line-height:1.6!important}
td[style*="font-size:18px"]{font-size:15px!important}
div[style*="font-size:14px"][style*="font-weight:700"]{font-size:13px!important}
</style>`;

function withPreviewEmailDensity(html) {
  const src = String(html || '');
  if (!src) return src;
  if (/<\/head>/i.test(src)) {
    return src.replace(/<\/head>/i, `${PREVIEW_EMAIL_STYLE}</head>`);
  }
  return `${PREVIEW_EMAIL_STYLE}${src}`;
}

function $(id) {
  return document.getElementById(id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCallFn(timeoutMs = API_WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const fn = window.__midiaiCallFunctionJson;
    if (typeof fn === 'function') return fn;
    await sleep(API_POLL_MS);
  }
  throw new Error('관리자 API가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
}

async function callFn(name, payload) {
  const fn = await waitForCallFn();
  return fn(name, payload);
}

function flash(msg, ok) {
  const el = $('welcomeBenefitMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('is-error', !ok && !!msg);
  el.classList.toggle('is-ok', !!ok && !!msg);
}

function displayNameFallback(name) {
  const n = String(name || '').trim();
  return n || '회원';
}

function applyTemplate(text, vars) {
  const days = String(vars.days != null ? vars.days : '');
  const map = {
    name: String(vars.name || ''),
    email: String(vars.email || ''),
    days,
    pass_days: days,
    credits: days,
    product_name: String(vars.product_name || PRODUCT_NAME)
  };
  return String(text || '').replace(
    /\{\{\s*(name|email|days|pass_days|credits|product_name)\s*\}\}/gi,
    (_, key) => {
      const k = String(key || '').toLowerCase();
      return map[k] != null ? map[k] : '';
    }
  );
}

function migrateCreditEmailBody(body) {
  let text = String(body || '');
  if (!text) return DEFAULT_EMAIL_BODY;
  const looksLikeCredits =
    /\{\{\s*credits\s*\}\}\s*Credits/i.test(text)
    || /Credits가 계정에 지급/i.test(text)
    || /지급된 Credits/i.test(text);
  if (!looksLikeCredits) return text;
  text = text.replace(/\{\{\s*credits\s*\}\}\s*Credits가 계정에 지급되었습니다\.?/gi, '{{days}}일 Full 이용권이 계정에 지급되었습니다.');
  text = text.replace(/지급된 Credits는 MidiAI Studio의 지원되는 변환 기능에서 사용할 수 있습니다\.?/gi, '이용권 기간 동안 MidiAI Studio의 Full 기능을 이용할 수 있습니다.');
  text = text.replace(/\{\{\s*credits\s*\}\}/gi, '{{days}}');
  return text;
}

function previewVars(form) {
  return {
    name: displayNameFallback(PREVIEW_SAMPLE.name),
    email: PREVIEW_SAMPLE.email,
    days: Number.isInteger(form.passDurationDays) ? form.passDurationDays : DEFAULT_PASS_DAYS,
    product_name: PRODUCT_NAME
  };
}

function readForm() {
  const raw = String($('welcomePassDays')?.value ?? '').trim();
  const days = raw === '' ? NaN : Number(raw);
  return {
    enabled: !!$('welcomeBenefitEnabled')?.checked,
    creditAmount: 0,
    passDurationDays: days,
    emailEnabled: !!$('welcomeEmailEnabled')?.checked,
    emailSubject: String($('welcomeEmailSubject')?.value || ''),
    emailBody: String($('welcomeEmailBody')?.value || '')
  };
}

function emptyPreviewHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;min-height:100%;display:grid;place-items:center;padding:20px 16px;box-sizing:border-box;
font:13px/1.5 "Noto Sans KR",system-ui,sans-serif;color:#64748b;background:
radial-gradient(120% 80% at 50% 0%,#eef6ff 0%,#f8fafc 55%,#f1f5f9 100%)}
.box{max-width:300px;text-align:center}
.icon{width:36px;height:36px;margin:0 auto 10px;border-radius:10px;border:1px dashed #cbd5e1;
display:grid;place-items:center;font-size:15px;color:#94a3b8;background:#fff}
h1{margin:0 0 6px;font-size:14px;font-weight:600;color:#334155;letter-spacing:-.02em}
p{margin:0;font-size:12.5px;color:#64748b;line-height:1.5}
</style></head><body><div class="box">
<div class="icon" aria-hidden="true">✉</div>
<h1>미리보기 대기 중</h1>
<p>왼쪽에서 메일 제목·본문을 입력하면 실제 발송 형식의 미리보기가 여기에 표시됩니다.</p>
</div></body></html>`;
}

function renderLivePreview() {
  const form = readForm();
  const vars = previewVars(form);
  const subject = applyTemplate(form.emailSubject, vars);
  const body = applyTemplate(form.emailBody, vars);
  const subjectEl = $('welcomeEmailPreviewSubject');
  const frame = $('welcomeEmailPreviewFrame');
  const hint = $('welcomeEmailPreviewHint');
  const badge = $('welcomeEmailPreviewBadge');
  const toEl = $('welcomeEmailPreviewTo');
  const card = $('welcomeEmailCard');
  if (subjectEl) {
    subjectEl.textContent = subject.trim() || '(제목 없음)';
  }
  if (toEl) {
    toEl.textContent = `${vars.name} <${vars.email}>`;
  }
  if (hint) {
    hint.textContent = `샘플 · ${vars.name} · ${vars.days}일 Full`;
  }
  if (badge) {
    badge.hidden = !!form.emailEnabled;
    badge.textContent = '발송 안 함 · 미리보기만';
  }
  if (card) {
    card.classList.toggle('is-mail-off', !form.emailEnabled);
  }
  if (frame) {
    if (!String(form.emailSubject || '').trim() && !String(form.emailBody || '').trim()) {
      frame.srcdoc = emptyPreviewHtml();
      return;
    }
    const rendered = buildAdminBrandedEmail({ subject, body });
    const html = rendered.html
      ? withPreviewEmailDensity(rendered.html)
      : `<pre style="margin:0;padding:12px;font:13px/1.5 ui-monospace,Consolas,monospace">${escapeHtml(rendered.text || body)}</pre>`;
    frame.srcdoc = html;
  }
}

let previewTimer = 0;
function scheduleLivePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderLivePreview, PREVIEW_DEBOUNCE_MS);
}

function applyForm(config, limits) {
  const c = config || {};
  const minD = Number(limits?.minPassDays) || MIN_PASS_DAYS;
  const maxD = Number(limits?.maxPassDays) || MAX_PASS_DAYS;
  let days = Number(c.passDurationDays);
  if (!Number.isInteger(days) || days < minD) days = DEFAULT_PASS_DAYS;
  if (days > maxD) days = maxD;

  if ($('welcomeBenefitEnabled')) $('welcomeBenefitEnabled').checked = !!c.enabled;
  if ($('welcomePassDays')) {
    $('welcomePassDays').min = String(minD);
    $('welcomePassDays').max = String(maxD);
    $('welcomePassDays').value = String(days);
  }
  if ($('welcomeCreditAmount')) $('welcomeCreditAmount').value = '0';
  if ($('welcomeEmailEnabled')) $('welcomeEmailEnabled').checked = !!c.emailEnabled;
  if ($('welcomeEmailSubject')) $('welcomeEmailSubject').value = c.emailSubject || '';
  if ($('welcomeEmailBody')) {
    const migrated = migrateCreditEmailBody(c.emailBody || '');
    $('welcomeEmailBody').value = migrated;
  }
  const meta = $('welcomeBenefitMeta');
  if (meta) {
    const ver = c.configVersion != null ? `설정 v${c.configVersion}` : '';
    const by = c.updatedByEmail || c.updatedBy || '';
    const hint = $('welcomePassDaysHint');
    if (hint) {
      hint.textContent = `${minD} = ${minD}일 Full · 최대 ${maxD}일 · 예: 3이면 72시간`;
    }
    meta.textContent = [ver, `혜택: ${days}일 Full`, by ? `최근 수정 ${by}` : '']
      .filter(Boolean)
      .join(' · ');
  }
  const policy = $('welcomePassPolicy');
  if (policy) {
    policy.innerHTML =
      `활성화 시 신규 가입자에게 관리자가 지정한 일수(<strong>현재 ${days}일</strong>)의 Full 기간제 이용권을 지급합니다. `
      + '크레딧이 아닌 Full 기간제만 지급합니다. 동일 기기 중복 수령은 기존과 같이 차단됩니다.';
  }
  syncEmailFields();
  renderLivePreview();
}

function syncEmailFields() {
  const on = !!$('welcomeEmailEnabled')?.checked;
  ['welcomeEmailSubject', 'welcomeEmailBody', 'welcomeEmailPreviewBtn'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled = !on;
  });
  document.querySelectorAll('[data-welcome-var]').forEach((btn) => {
    btn.disabled = !on;
  });
  scheduleLivePreview();
}

function insertVariable(token) {
  const subject = $('welcomeEmailSubject');
  const body = $('welcomeEmailBody');
  if (!subject || !body || subject.disabled) return;
  const active = document.activeElement;
  const target = active === subject || active === body
    ? active
    : body;
  const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
  const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);
  target.value = `${before}${token}${after}`;
  const caret = start + token.length;
  target.focus();
  try {
    target.setSelectionRange(caret, caret);
  } catch (_) {}
  target.dispatchEvent(new Event('input', { bubbles: true }));
  scheduleLivePreview();
}

function validateLocal(form) {
  if (!Number.isInteger(form.passDurationDays) || form.passDurationDays < MIN_PASS_DAYS) {
    return `이용권 일수는 ${MIN_PASS_DAYS} 이상의 정수여야 합니다.`;
  }
  if (form.passDurationDays > MAX_PASS_DAYS) {
    return `이용권 일수는 최대 ${MAX_PASS_DAYS}일까지 설정할 수 있습니다.`;
  }
  if (form.emailEnabled) {
    if (!String(form.emailSubject || '').trim()) return '환영 메일 제목을 입력하세요.';
    if (!String(form.emailBody || '').trim()) return '환영 메일 본문을 입력하세요.';
  }
  return '';
}

async function loadWelcomeBenefitConfig() {
  flash('불러오는 중…', true);
  try {
    const data = await callFn('getWelcomeBenefitConfig', {});
    if (!data || !data.ok) throw new Error((data && data.message) || '불러오기 실패');
    applyForm(data.config, data.limits);
    flash('설정을 불러왔습니다.', true);
  } catch (err) {
    console.error('loadWelcomeBenefitConfig', err);
    flash(err.message || '설정을 불러오지 못했습니다.', false);
    renderLivePreview();
  }
}

async function saveWelcomeBenefitConfig() {
  const form = readForm();
  const err = validateLocal(form);
  if (err) {
    flash(err, false);
    return;
  }
  if (form.enabled) {
    const ok = window.confirm(
      `신규 가입자에게 ${form.passDurationDays}일 Full 이용권을 자동 지급합니다.\n크레딧이 아닌 기간제만 지급됩니다.\n계속할까요?`
    );
    if (!ok) return;
  }
  flash('저장 중…', true);
  try {
    const data = await callFn('saveWelcomeBenefitConfig', form);
    if (!data || !data.ok) throw new Error((data && data.message) || '저장 실패');
    applyForm(data.config, {
      minPassDays: MIN_PASS_DAYS,
      maxPassDays: MAX_PASS_DAYS
    });
    flash('저장되었습니다. 새로고침 후에도 유지됩니다.', true);
  } catch (e) {
    console.error('saveWelcomeBenefitConfig', e);
    flash(e.message || '저장에 실패했습니다.', false);
  }
}

async function previewWelcomeEmail() {
  const form = readForm();
  if (!form.emailEnabled) {
    flash('환영 메일을 켠 뒤 미리보기하세요.', false);
    return;
  }
  renderLivePreview();
  try {
    const data = await callFn('previewWelcomeBenefitEmail', {
      emailSubject: form.emailSubject,
      emailBody: form.emailBody,
      days: Number.isInteger(form.passDurationDays) ? form.passDurationDays : DEFAULT_PASS_DAYS,
      passDurationDays: Number.isInteger(form.passDurationDays) ? form.passDurationDays : DEFAULT_PASS_DAYS,
      name: PREVIEW_SAMPLE.name,
      email: PREVIEW_SAMPLE.email
    });
    if (!data || !data.ok) throw new Error((data && data.message) || '미리보기 실패');
    const subjectEl = $('welcomeEmailPreviewSubject');
    const frame = $('welcomeEmailPreviewFrame');
    if (subjectEl) subjectEl.textContent = data.subject || '(제목 없음)';
    if (frame && data.html) frame.srcdoc = withPreviewEmailDensity(data.html);
    flash('미리보기를 갱신했습니다.', true);
  } catch (e) {
    flash(e.message || '서버 미리보기에 실패했습니다. 우측 로컬 미리보기를 확인하세요.', false);
  }
}

export function showWelcomeBenefitPanel(visible) {
  const section = $('adminWelcomeBenefitSection');
  if (!section) return;
  section.hidden = !visible;
  if (visible) {
    renderLivePreview();
    loadWelcomeBenefitConfig();
  }
}

export function bindWelcomeBenefitPanel() {
  if (document.body.dataset.welcomeBenefitBound === '1') return;
  document.body.dataset.welcomeBenefitBound = '1';
  $('welcomeBenefitEnabled')?.addEventListener('change', () => flash('', true));
  $('welcomeEmailEnabled')?.addEventListener('change', syncEmailFields);
  $('welcomeBenefitSaveBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    saveWelcomeBenefitConfig();
  });
  $('welcomeEmailPreviewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    previewWelcomeEmail();
  });
  $('welcomeBenefitReloadBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadWelcomeBenefitConfig();
  });
  document.querySelectorAll('[data-welcome-var]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-welcome-var');
      const token = VAR_TOKEN[key];
      if (token) insertVariable(token);
    });
  });
  ['welcomeEmailSubject', 'welcomeEmailBody', 'welcomePassDays'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', scheduleLivePreview);
    el.addEventListener('change', scheduleLivePreview);
  });
  syncEmailFields();
  renderLivePreview();
}
