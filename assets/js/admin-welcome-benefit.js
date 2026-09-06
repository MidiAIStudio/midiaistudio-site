/**
 * Admin Welcome Benefit (신규 가입 혜택) console panel.
 */

import { buildAdminBrandedEmail, escapeHtml } from './admin-email-template.js?v=welcome-preview-1';

const LARGE_CONFIRM = 1000;
const MAX_CREDIT = 10000;
const PRODUCT_NAME = 'MidiAI Studio';
const PREVIEW_SAMPLE = {
  name: '홍길동',
  email: 'user@example.com'
};
const API_WAIT_MS = 20000;
const API_POLL_MS = 120;
const PREVIEW_DEBOUNCE_MS = 220;

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
  const map = {
    name: String(vars.name || ''),
    email: String(vars.email || ''),
    credits: String(vars.credits != null ? vars.credits : ''),
    product_name: String(vars.product_name || PRODUCT_NAME)
  };
  return String(text || '').replace(/\{\{\s*(name|email|credits|product_name)\s*\}\}/gi, (_, key) => {
    const k = String(key || '').toLowerCase();
    return map[k] != null ? map[k] : '';
  });
}

function previewVars(form) {
  return {
    name: displayNameFallback(PREVIEW_SAMPLE.name),
    email: PREVIEW_SAMPLE.email,
    credits: Number.isInteger(form.creditAmount) ? form.creditAmount : 0,
    product_name: PRODUCT_NAME
  };
}

function readForm() {
  const creditRaw = String($('welcomeCreditAmount')?.value ?? '').trim();
  const creditAmount = creditRaw === '' ? NaN : Number(creditRaw);
  return {
    enabled: !!$('welcomeBenefitEnabled')?.checked,
    creditAmount,
    emailEnabled: !!$('welcomeEmailEnabled')?.checked,
    emailSubject: String($('welcomeEmailSubject')?.value || ''),
    emailBody: String($('welcomeEmailBody')?.value || '')
  };
}

function renderLivePreview() {
  const form = readForm();
  const vars = previewVars(form);
  const subject = applyTemplate(form.emailSubject, vars);
  const body = applyTemplate(form.emailBody, vars);
  const subjectEl = $('welcomeEmailPreviewSubject');
  const frame = $('welcomeEmailPreviewFrame');
  const hint = $('welcomeEmailPreviewHint');
  if (subjectEl) {
    subjectEl.textContent = subject.trim() || '(제목 없음)';
  }
  if (hint) {
    hint.textContent = form.emailEnabled
      ? `샘플: ${vars.name} · ${vars.email} · ${vars.credits} Credits`
      : '환영 메일 OFF — 미리보기만 표시됩니다';
  }
  if (frame) {
    if (!String(form.emailSubject || '').trim() && !String(form.emailBody || '').trim()) {
      frame.srcdoc = `<!DOCTYPE html><html><body style="margin:0;padding:24px;font:14px/1.6 system-ui,sans-serif;color:#64748b;background:#f8fafc;">메일 제목·본문을 입력하면 여기에 미리보기가 표시됩니다.</body></html>`;
      return;
    }
    const rendered = buildAdminBrandedEmail({ subject, body });
    frame.srcdoc = rendered.html || `<pre>${escapeHtml(rendered.text || body)}</pre>`;
  }
}

let previewTimer = 0;
function scheduleLivePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderLivePreview, PREVIEW_DEBOUNCE_MS);
}

function applyForm(config, limits) {
  const c = config || {};
  if ($('welcomeBenefitEnabled')) $('welcomeBenefitEnabled').checked = !!c.enabled;
  if ($('welcomeCreditAmount')) $('welcomeCreditAmount').value = String(c.creditAmount != null ? c.creditAmount : 0);
  if ($('welcomeEmailEnabled')) $('welcomeEmailEnabled').checked = !!c.emailEnabled;
  if ($('welcomeEmailSubject')) $('welcomeEmailSubject').value = c.emailSubject || '';
  if ($('welcomeEmailBody')) $('welcomeEmailBody').value = c.emailBody || '';
  const meta = $('welcomeBenefitMeta');
  if (meta) {
    const ver = c.configVersion != null ? `v${c.configVersion}` : '';
    const by = c.updatedByEmail || c.updatedBy || '';
    meta.textContent = [ver, by ? `last: ${by}` : '', `max ${limits?.maxCredit || MAX_CREDIT}`]
      .filter(Boolean)
      .join(' · ');
  }
  syncEmailFields();
  renderLivePreview();
}

function syncEmailFields() {
  const on = !!$('welcomeEmailEnabled')?.checked;
  ['welcomeEmailSubject', 'welcomeEmailBody', 'welcomeEmailPreviewBtn'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'BUTTON') el.disabled = !on;
    else el.disabled = !on;
  });
  scheduleLivePreview();
}

function validateLocal(form) {
  if (!Number.isInteger(form.creditAmount) || form.creditAmount < 0) {
    return '크레딧 수량은 0 이상의 정수여야 합니다.';
  }
  if (form.creditAmount > MAX_CREDIT) {
    return `최대 ${MAX_CREDIT} Credits까지 설정할 수 있습니다.`;
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
  const confirmAt = LARGE_CONFIRM;
  if (form.creditAmount >= confirmAt) {
    const ok = window.confirm(
      `신규 가입자에게 ${form.creditAmount} Credits를 자동 지급합니다.\n계속할까요?`
    );
    if (!ok) return;
  }
  flash('저장 중…', true);
  try {
    const data = await callFn('saveWelcomeBenefitConfig', form);
    if (!data || !data.ok) throw new Error((data && data.message) || '저장 실패');
    applyForm(data.config, { maxCredit: MAX_CREDIT, largeAmountConfirm: confirmAt });
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
      credits: Number.isInteger(form.creditAmount) ? form.creditAmount : 0,
      name: PREVIEW_SAMPLE.name,
      email: PREVIEW_SAMPLE.email
    });
    if (!data || !data.ok) throw new Error((data && data.message) || '미리보기 실패');
    const subjectEl = $('welcomeEmailPreviewSubject');
    const frame = $('welcomeEmailPreviewFrame');
    if (subjectEl) subjectEl.textContent = data.subject || '(제목 없음)';
    if (frame && data.html) frame.srcdoc = data.html;
    flash('미리보기를 갱신했습니다.', true);
  } catch (e) {
    // Live panel already updated client-side; keep that visible if API fails.
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
  ['welcomeEmailSubject', 'welcomeEmailBody', 'welcomeCreditAmount'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', scheduleLivePreview);
    el.addEventListener('change', scheduleLivePreview);
  });
  syncEmailFields();
  renderLivePreview();
}
