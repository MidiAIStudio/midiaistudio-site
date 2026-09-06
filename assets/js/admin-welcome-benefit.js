/**
 * Admin Welcome Benefit (신규 가입 혜택) console panel.
 */

const LARGE_CONFIRM = 1000;
const MAX_CREDIT = 10000;

function $(id) {
  return document.getElementById(id);
}

async function callFn(name, payload) {
  const fn = window.__midiaiCallFunctionJson;
  if (typeof fn !== 'function') {
    throw new Error('관리자 API가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
  }
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
}

function syncEmailFields() {
  const on = !!$('welcomeEmailEnabled')?.checked;
  ['welcomeEmailSubject', 'welcomeEmailBody', 'welcomeEmailPreviewBtn'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'BUTTON') el.disabled = !on;
    else el.disabled = !on;
  });
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
  try {
    const data = await callFn('previewWelcomeBenefitEmail', {
      emailSubject: form.emailSubject,
      emailBody: form.emailBody,
      credits: Number.isInteger(form.creditAmount) ? form.creditAmount : 0,
      name: '홍길동',
      email: 'user@example.com'
    });
    if (!data || !data.ok) throw new Error((data && data.message) || '미리보기 실패');
    const win = window.open('', '_blank', 'noopener,width=720,height=800');
    if (win) {
      win.document.write(data.html || `<pre>${data.text || ''}</pre>`);
      win.document.close();
    } else {
      flash(`제목: ${data.subject || ''}`, true);
    }
  } catch (e) {
    flash(e.message || '미리보기에 실패했습니다.', false);
  }
}

export function showWelcomeBenefitPanel(visible) {
  const section = $('adminWelcomeBenefitSection');
  if (!section) return;
  section.hidden = !visible;
  if (visible) loadWelcomeBenefitConfig();
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
  syncEmailFields();
}
