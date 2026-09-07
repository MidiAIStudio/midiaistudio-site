/**
 * Admin settlement settings panel (requireAdmin via manageAdminSettlementSettings).
 */

function $(id) {
  return document.getElementById(id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCallFn(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const fn = window.__midiaiCallFunctionJson;
    if (typeof fn === 'function') return fn;
    await sleep(120);
  }
  throw new Error('관리자 API가 아직 준비되지 않았습니다.');
}

async function callFn(payload) {
  const fn = await waitForCallFn();
  return fn('manageAdminSettlementSettings', payload);
}

function flash(msg, ok) {
  const el = $('adminSettlementMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('is-error', !ok && !!msg);
  el.classList.toggle('is-ok', !!ok && !!msg);
}

let excludedDates = [];

function renderExcluded() {
  const root = $('adminSettlementExcludedList');
  if (!root) return;
  if (!excludedDates.length) {
    root.innerHTML = '<span class="muted small">없음</span>';
    return;
  }
  root.innerHTML = excludedDates.map((ymd) => (
    `<button type="button" class="admin-settlement-chip" data-remove-date="${ymd}">${ymd} ×</button>`
  )).join('');
}

function applySettings(settings) {
  const s = settings || {};
  if ($('adminSettlementBusinessDays')) $('adminSettlementBusinessDays').value = s.businessDays != null ? s.businessDays : 7;
  if ($('adminSettlementFeeRate')) $('adminSettlementFeeRate').value = Number(s.feeRatePercent != null ? s.feeRatePercent : 3.2).toFixed(2);
  if ($('adminSettlementFeeVat')) $('adminSettlementFeeVat').value = Number(s.feeVatRatePercent != null ? s.feeVatRatePercent : 10).toFixed(2);
  if ($('adminSettlementExcludeWeekends')) $('adminSettlementExcludeWeekends').checked = s.excludeWeekends !== false;
  if ($('adminSettlementExcludeHolidays')) $('adminSettlementExcludeHolidays').checked = s.excludeKoreanHolidays !== false;
  excludedDates = Array.isArray(s.excludedDates) ? s.excludedDates.slice() : [];
  renderExcluded();
}

async function loadSettings() {
  flash('', true);
  const data = await callFn({ action: 'get' });
  applySettings(data.settings);
}

function readForm() {
  return {
    action: 'save',
    provider: 'kakaopay',
    settlementType: 'business_days',
    businessDays: Number($('adminSettlementBusinessDays')?.value || 7),
    feeRatePercent: Number($('adminSettlementFeeRate')?.value || 3.2),
    feeVatRatePercent: Number($('adminSettlementFeeVat')?.value || 10),
    excludeWeekends: !!$('adminSettlementExcludeWeekends')?.checked,
    excludeKoreanHolidays: !!$('adminSettlementExcludeHolidays')?.checked,
    excludedDates: excludedDates.slice(),
    label: '카카오페이'
  };
}

function bindAdminSettlementPanel() {
  if (document.body.dataset.adminSettlementBound) return;
  document.body.dataset.adminSettlementBound = '1';
  $('adminSettlementReloadBtn')?.addEventListener('click', () => {
    loadSettings().catch((err) => flash(err.message || '불러오기 실패', false));
  });
  $('adminSettlementSaveBtn')?.addEventListener('click', () => {
    callFn(readForm())
      .then((data) => {
        applySettings(data.settings);
        flash('정산 설정을 저장했습니다.', true);
      })
      .catch((err) => flash(err.message || '저장 실패', false));
  });
  $('adminSettlementAddDateBtn')?.addEventListener('click', () => {
    const ymd = String($('adminSettlementExcludeDate')?.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      flash('제외일을 YYYY-MM-DD로 선택하세요.', false);
      return;
    }
    if (!excludedDates.includes(ymd)) {
      excludedDates.push(ymd);
      excludedDates.sort();
    }
    renderExcluded();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-date]');
    if (!btn || !document.getElementById('adminSettlementSection')?.contains(btn)) return;
    const ymd = btn.getAttribute('data-remove-date');
    excludedDates = excludedDates.filter((d) => d !== ymd);
    renderExcluded();
  });
}

export function showAdminSettlementPanel(visible) {
  const el = $('adminSettlementSection');
  if (el) el.hidden = !visible;
  if (visible) {
    bindAdminSettlementPanel();
    loadSettings().catch((err) => flash(err.message || '불러오기 실패', false));
  }
}

export { bindAdminSettlementPanel };
