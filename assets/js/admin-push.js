/**
 * Admin FCM push settings panel.
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
  return fn('manageAdminPush', payload);
}

function flash(msg, ok) {
  const el = $('adminPushMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('is-error', !ok && !!msg);
  el.classList.toggle('is-ok', !!ok && !!msg);
}

function fmtTime(value) {
  try {
    let d = null;
    if (!value) return '-';
    if (typeof value.toDate === 'function') d = value.toDate();
    else if (value._seconds != null) d = new Date(value._seconds * 1000);
    else d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (_) {
    return '-';
  }
}

function typeLabel(type) {
  return ({
    payment: '신규 결제',
    inquiry: '신규 문의',
    refund: '환불/취소',
    critical: '중요 오류',
    test: '테스트',
    system: '시스템'
  })[type] || type || '-';
}

function statusLabel(device) {
  const st = String(device.status || '');
  if (st === 'approved' && device.enabled) return '활성';
  if (st === 'approved') return '승인 · 중지';
  if (st === 'pending') return '승인 대기';
  if (st === 'disabled') return '일시 중지';
  if (st === 'revoked') return '차단됨';
  if (st === 'rejected') return '거절됨';
  return st || '-';
}

function catRow(device) {
  const id = escapeHtml(device.deviceId);
  return `<div class="admin-push-cats">
    <label><input type="checkbox" data-push-cat="paymentEnabled" data-id="${id}" ${device.paymentEnabled !== false ? 'checked' : ''}> 결제</label>
    <label><input type="checkbox" data-push-cat="inquiryEnabled" data-id="${id}" ${device.inquiryEnabled !== false ? 'checked' : ''}> 문의</label>
    <label><input type="checkbox" data-push-cat="refundEnabled" data-id="${id}" ${device.refundEnabled !== false ? 'checked' : ''}> 환불</label>
    <label><input type="checkbox" data-push-cat="criticalEnabled" data-id="${id}" ${device.criticalEnabled !== false ? 'checked' : ''}> 중요 오류</label>
  </div>`;
}

function renderPending(list) {
  const root = $('adminPushPendingList');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = '<p class="muted small">대기 기기가 없습니다.</p>';
    return;
  }
  root.innerHTML = list.map((d) => `<article class="admin-push-device" data-device="${escapeHtml(d.deviceId)}">
    <div class="admin-push-device-head">
      <strong>${escapeHtml(d.deviceName || d.deviceId.slice(0, 8))}</strong>
      <span class="admin-push-role">${statusLabel(d)}</span>
    </div>
    <p class="admin-push-meta">요청 ${fmtTime(d.requestedAt)} · App ${escapeHtml(d.appVersion || '-')}</p>
    <div class="admin-push-inline">
      <input type="text" maxlength="80" placeholder="라벨" value="${escapeHtml(d.label || d.deviceName || '')}" data-push-label="${escapeHtml(d.deviceId)}">
      <select data-push-role="${escapeHtml(d.deviceId)}">
        <option value="staff" ${d.role === 'owner' ? '' : 'selected'}>Staff</option>
        <option value="owner" ${d.role === 'owner' ? 'selected' : ''}>Owner</option>
      </select>
    </div>
    <div class="admin-push-actions">
      <button type="button" class="primary mini-btn" data-push-act="approve" data-id="${escapeHtml(d.deviceId)}">승인</button>
      <button type="button" class="secondary mini-btn danger-btn" data-push-act="reject" data-id="${escapeHtml(d.deviceId)}">거절</button>
    </div>
  </article>`).join('');
}

function renderDevices(list) {
  const root = $('adminPushDeviceList');
  if (!root) return;
  const shown = list.filter((d) => d.status !== 'pending' && d.status !== 'rejected');
  if (!shown.length) {
    root.innerHTML = '<p class="muted small">등록된 기기가 없습니다.</p>';
    return;
  }
  root.innerHTML = shown.map((d) => `<article class="admin-push-device" data-device="${escapeHtml(d.deviceId)}">
    <div class="admin-push-device-head">
      <div>
        <strong>${escapeHtml(d.label || d.deviceName || d.deviceId.slice(0, 8))}</strong>
        <div class="admin-push-role">${escapeHtml((d.role || 'staff').toUpperCase())} · ${escapeHtml(d.deviceName || '')}</div>
      </div>
      <span class="admin-push-status-line"><span class="admin-push-dot ${d.enabled && d.status === 'approved' ? 'is-ok' : 'is-warn'}"></span>${statusLabel(d)}</span>
    </div>
    <p class="admin-push-meta">App ${escapeHtml(d.appVersion || '-')} ${d.tokenInvalid ? ' · 토큰 무효' : ''}</p>
    <div class="admin-push-inline">
      <input type="text" maxlength="80" placeholder="라벨" value="${escapeHtml(d.label || d.deviceName || '')}" data-push-label="${escapeHtml(d.deviceId)}">
      <select data-push-role="${escapeHtml(d.deviceId)}">
        <option value="staff" ${d.role === 'owner' ? '' : 'selected'}>Staff</option>
        <option value="owner" ${d.role === 'owner' ? 'selected' : ''}>Owner</option>
      </select>
      <button type="button" class="secondary mini-btn" data-push-act="updateDevice" data-id="${escapeHtml(d.deviceId)}">설정 저장</button>
    </div>
    ${catRow(d)}
    <div class="admin-push-actions">
      <button type="button" class="secondary mini-btn" data-push-act="testDevice" data-id="${escapeHtml(d.deviceId)}">테스트 전송</button>
      ${d.status === 'disabled' || (d.status === 'approved' && !d.enabled)
        ? `<button type="button" class="secondary mini-btn" data-push-act="enable" data-id="${escapeHtml(d.deviceId)}">재개</button>`
        : `<button type="button" class="secondary mini-btn" data-push-act="disable" data-id="${escapeHtml(d.deviceId)}">일시 중지</button>`}
      <button type="button" class="secondary mini-btn danger-btn" data-push-act="revoke" data-id="${escapeHtml(d.deviceId)}">접근 차단</button>
    </div>
  </article>`).join('');
}

function renderLogs(list) {
  const root = $('adminPushLogList');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = '<p class="muted small">기록이 없습니다.</p>';
    return;
  }
  root.innerHTML = list.map((row) => {
    const total = Number(row.attempted || 0);
    const ok = Number(row.success || 0);
    const result = total === 0 ? '대상 없음' : (row.failed ? `일부 실패 ${ok}/${total}` : `성공 ${ok}/${total}`);
    return `<div class="admin-push-log">
      <span class="muted">${escapeHtml(fmtTime(row.createdAt).slice(-5))}</span>
      <span>${escapeHtml(typeLabel(row.type))}</span>
      <span class="muted">${escapeHtml(row.title || '')}</span>
      <span>${escapeHtml(result)}</span>
    </div>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadOverview() {
  const data = await callFn({ action: 'overview' });
  const ok = data.fcm === 'ok';
  const label = $('adminPushFcmLabel');
  const dot = $('adminPushFcmDot');
  if (label) label.textContent = ok ? 'FCM 정상' : 'FCM 확인 필요';
  if (dot) {
    dot.classList.toggle('is-ok', ok);
    dot.classList.toggle('is-warn', !ok);
  }
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };
  setText('adminPushCountRegistered', String((data.counts && data.counts.registered) || 0));
  setText('adminPushCountActive', String((data.counts && data.counts.active) || 0));
  setText('adminPushCountPending', String((data.counts && data.counts.pending) || 0));
  setText('adminPushSuccessRate', `${data.successRate != null ? data.successRate : 100}%`);
  const g = data.global || {};
  if ($('adminPushGlobalPayment')) $('adminPushGlobalPayment').checked = g.paymentEnabled !== false;
  if ($('adminPushGlobalInquiry')) $('adminPushGlobalInquiry').checked = g.inquiryEnabled !== false;
  if ($('adminPushGlobalRefund')) $('adminPushGlobalRefund').checked = g.refundEnabled !== false;
  if ($('adminPushGlobalCritical')) $('adminPushGlobalCritical').checked = g.criticalEnabled !== false;
  renderPending(data.pending || []);
  renderDevices(data.devices || []);
  renderLogs(data.logs || []);
}

async function runAction(action, extra) {
  flash('', true);
  const data = await callFn(Object.assign({ action }, extra || {}));
  await loadOverview();
  return data;
}

function bindAdminPushPanel() {
  if (document.body.dataset.adminPushBound) return;
  document.body.dataset.adminPushBound = '1';
  $('adminPushReloadBtn')?.addEventListener('click', () => {
    loadOverview().catch((err) => flash(err.message || '불러오기 실패', false));
  });
  $('adminPushTestAllBtn')?.addEventListener('click', () => {
    runAction('testAll').then(() => flash('전체 테스트 전송을 요청했습니다.', true))
      .catch((err) => flash(err.message || '전송 실패', false));
  });
  $('adminPushGlobalSaveBtn')?.addEventListener('click', () => {
    runAction('updateGlobal', {
      paymentEnabled: $('adminPushGlobalPayment').checked,
      inquiryEnabled: $('adminPushGlobalInquiry').checked,
      refundEnabled: $('adminPushGlobalRefund').checked,
      criticalEnabled: $('adminPushGlobalCritical').checked
    }).then(() => flash('전역 알림 설정을 저장했습니다.', true))
      .catch((err) => flash(err.message || '저장 실패', false));
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-push-act]');
    if (!btn || !document.getElementById('adminPushSection')?.contains(btn)) return;
    const action = btn.getAttribute('data-push-act');
    const deviceId = btn.getAttribute('data-id');
    const extra = { deviceId };
    if (action === 'approve' || action === 'updateDevice') {
      extra.role = document.querySelector(`[data-push-role="${deviceId}"]`)?.value || 'staff';
      extra.label = document.querySelector(`[data-push-label="${deviceId}"]`)?.value || '';
    }
    if (action === 'revoke' && !window.confirm('이 기기의 관리자 접근을 차단할까요?')) return;
    runAction(action, extra)
      .then(() => flash('반영했습니다.', true))
      .catch((err) => flash(err.message || '실패', false));
  });
  document.addEventListener('change', (e) => {
    const input = e.target.closest('[data-push-cat]');
    if (!input || !document.getElementById('adminPushSection')?.contains(input)) return;
    const deviceId = input.getAttribute('data-id');
    const field = input.getAttribute('data-push-cat');
    const payload = { action: 'updateDevice', deviceId };
    payload[field] = input.checked;
    callFn(payload).catch((err) => flash(err.message || '설정 저장 실패', false));
  });
}

export function showAdminPushPanel(visible) {
  const el = $('adminPushSection');
  if (el) el.hidden = !visible;
  if (visible) {
    bindAdminPushPanel();
    loadOverview().catch((err) => flash(err.message || '불러오기 실패', false));
  }
}

export { bindAdminPushPanel };
