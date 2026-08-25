import {
  buildAdminBrandedEmail,
  validateHttpUrl,
  escapeHtml,
  BULK_MESSAGE_PRESETS,
  AUTO_EMAIL_HEADER_LINES,
  AUTO_EMAIL_FOOTER_LINES,
  detectAutoGreetingOverlap
} from './admin-email-template.js?v=email-auto-ux-1';

function shortUid(uid) {
  const s = String(uid || '');
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function openAdminConfirmModal({ title, messageHtml, confirmLabel, cancelLabel = '돌아가기' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-backdrop bulk-confirm-backdrop';
    overlay.innerHTML = `
      <div class="edit-modal bulk-confirm-modal" role="dialog" aria-modal="true">
        <div class="edit-modal-head">
          <div class="edit-modal-head-copy"><h3>${escapeHtml(title)}</h3></div>
          <button type="button" class="edit-modal-x" data-cancel aria-label="close">×</button>
        </div>
        <div class="edit-modal-body"><div class="bulk-confirm-copy">${messageHtml}</div></div>
        <div class="edit-modal-actions">
          <button type="button" class="secondary" data-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="primary" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    const close = (v) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    overlay.querySelectorAll('[data-cancel]').forEach((el) => el.addEventListener('click', () => close(false)));
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm]')?.focus();
  });
}

/**
 * Shared Bulk Message Composer for email + app_message.
 * @returns {Promise<object|null>} draft payload on successful send request approval path handled by onSend; null if cancelled
 */
export function openBulkMessageComposer({
  channel = 'email',
  recipients = [],
  onSend
} = {}) {
  try { window.__midiaiHideAdminFlash?.(); } catch (_) {}
  const isEmail = channel === 'email';
  const list = Array.isArray(recipients) ? recipients.slice() : [];
  const sendable = isEmail
    ? list.filter((r) => r.email && String(r.email).includes('@'))
    : list.slice();
  const invalid = isEmail
    ? list.filter((r) => !(r.email && String(r.email).includes('@')))
    : [];
  const nAll = list.length;
  const nSend = sendable.length;
  const channelLabel = isEmail ? '이메일' : '앱 쪽지';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-backdrop bulk-composer-backdrop';
    const presets = BULK_MESSAGE_PRESETS.filter((p) => p.channel === 'both' || p.channel === channel);

    overlay.innerHTML = `
      <form class="edit-modal bulk-composer-modal" novalidate>
        <div class="edit-modal-head">
          <div class="edit-modal-head-copy">
            <h3>${escapeHtml(channelLabel)} 발송</h3>
            <p class="edit-modal-sub">선택한 사용자 ${nAll}명${isEmail && invalid.length ? ` · 발송 가능 ${nSend}명 · 이메일 없음 ${invalid.length}명` : ''}</p>
          </div>
          <button type="button" class="edit-modal-x" data-close aria-label="close">×</button>
        </div>
        <div class="bulk-composer-layout">
          <div class="bulk-composer-main">
            <div class="bulk-composer-scroll">
              <section class="bulk-composer-section">
                <div class="bulk-composer-label-row">
                  <span>받는 사람</span>
                  ${nAll > 1 ? '<button type="button" class="ghost mini-btn" data-toggle-recipients>목록 보기</button>' : ''}
                </div>
                <div class="bulk-recipient-summary" data-recipient-summary></div>
                <div class="bulk-recipient-list hidden" data-recipient-list></div>
              </section>

              <section class="bulk-composer-section">
                <label class="edit-field">
                  <span>템플릿</span>
                  <select data-field="preset">
                    ${presets.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join('')}
                  </select>
                </label>
              </section>

              <section class="bulk-composer-section">
                <label class="edit-field">
                  <span>제목</span>
                  <input type="text" data-field="subject" maxlength="200" required placeholder="${isEmail ? '메일 제목' : '쪽지 제목'}">
                </label>
                ${isEmail ? `
                <div class="edit-field bulk-email-body-field">
                  <div class="bulk-composer-label-row">
                    <span>본문</span>
                    <span class="bulk-email-auto-hint">ⓘ 상단 인사말과 하단 서명은 자동으로 추가됩니다.</span>
                  </div>
                  <div class="bulk-email-body-shell">
                    <div class="bulk-email-auto-block" aria-hidden="true">
                      <span class="bulk-email-auto-badge">자동</span>
                      <p>${AUTO_EMAIL_HEADER_LINES.map(escapeHtml).join('<br>')}</p>
                    </div>
                    <textarea data-field="body" rows="8" maxlength="20000" required placeholder="여기에 메일 본문만 입력하세요"></textarea>
                    <div class="bulk-email-auto-block" aria-hidden="true">
                      <span class="bulk-email-auto-badge">자동</span>
                      <p>${AUTO_EMAIL_FOOTER_LINES.map(escapeHtml).join('<br>')}</p>
                    </div>
                  </div>
                  <p class="bulk-email-dup-warn hidden" data-body-dup-warn></p>
                </div>
                <p class="bulk-composer-hint muted small">줄바꿈은 문단으로 표시됩니다. **굵게**, [링크](https://…) , - 목록 을 사용할 수 있습니다.</p>
                ` : `
                <label class="edit-field">
                  <span>본문</span>
                  <textarea data-field="body" rows="8" maxlength="20000" required placeholder="쪽지 내용"></textarea>
                </label>
                `}
              </section>

              ${isEmail ? `
              <section class="bulk-composer-section">
                <button type="button" class="secondary mini-btn" data-toggle-decorate>+ 이메일 꾸미기</button>
                <div class="bulk-decorate-panel hidden" data-decorate>
                  <label class="edit-field">
                    <span>프리헤더</span>
                    <input type="text" data-field="preheader" maxlength="150" placeholder="받은편지함 미리보기 문구">
                  </label>
                  <label class="edit-field-check">
                    <input type="checkbox" data-field="bannerEnabled">
                    <span>이벤트 배너 사용</span>
                  </label>
                  <div class="bulk-banner-fields" data-banner-fields>
                    <label class="edit-field"><span>Eyebrow</span><input type="text" data-field="bannerEyebrow" maxlength="40" placeholder="예: 30% OFF"></label>
                    <label class="edit-field"><span>배너 제목</span><input type="text" data-field="bannerTitle" maxlength="80" placeholder="이벤트 제목"></label>
                    <label class="edit-field"><span>배너 설명</span><input type="text" data-field="bannerDescription" maxlength="200" placeholder="짧은 설명"></label>
                    <label class="edit-field"><span>배너 이미지 URL</span><input type="url" data-field="bannerImageUrl" maxlength="500" placeholder="https:// (선택)"></label>
                  </div>
                  <div class="form-split">
                    <label class="edit-field"><span>CTA 문구</span><input type="text" data-field="ctaLabel" maxlength="40" placeholder="가격 확인하기"></label>
                    <label class="edit-field"><span>CTA URL</span><input type="url" data-field="ctaUrl" maxlength="500" placeholder="https://"></label>
                  </div>
                </div>
              </section>` : ''}
            </div>
          </div>
          <aside class="bulk-composer-preview-pane">
            <div class="bulk-preview-toolbar">
              <strong>미리보기</strong>
              ${isEmail ? `
              <div class="bulk-preview-width" role="group">
                <button type="button" class="ghost mini-btn is-active" data-preview-width="desktop">Desktop</button>
                <button type="button" class="ghost mini-btn" data-preview-width="mobile">Mobile</button>
              </div>` : ''}
            </div>
            <div class="bulk-preview-frame" data-preview-frame>
              ${isEmail
      ? '<iframe class="bulk-preview-iframe" data-preview-iframe title="Email preview" sandbox=""></iframe>'
      : '<div class="bulk-app-preview" data-app-preview></div>'}
            </div>
          </aside>
        </div>
        <div class="bulk-composer-footer">
          <div class="bulk-composer-footer-meta" data-footer-meta>${nSend}명에게 발송됩니다</div>
          <div class="bulk-composer-footer-actions">
            <button type="button" class="secondary" data-close>취소</button>
            <button type="submit" class="primary" data-send ${nSend ? '' : 'disabled'}>${nSend}명에게 ${channelLabel} 발송</button>
          </div>
        </div>
        <p class="bulk-composer-error hidden" data-error></p>
      </form>`;

    const form = overlay.querySelector('form');
    const field = (name) => form.querySelector(`[data-field="${name}"]`);
    const errEl = form.querySelector('[data-error]');
    const sendBtn = form.querySelector('[data-send]');
    let sending = false;
    let previewWidth = 'desktop';

    const readDraft = () => {
      const draft = {
        subject: String(field('subject')?.value || '').trim(),
        body: String(field('body')?.value || '').trim()
      };
      if (isEmail) {
        draft.preheader = String(field('preheader')?.value || '').trim();
        draft.bannerEnabled = !!field('bannerEnabled')?.checked;
        draft.bannerEyebrow = String(field('bannerEyebrow')?.value || '').trim();
        draft.bannerTitle = String(field('bannerTitle')?.value || '').trim();
        draft.bannerDescription = String(field('bannerDescription')?.value || '').trim();
        draft.bannerImageUrl = String(field('bannerImageUrl')?.value || '').trim();
        draft.ctaLabel = String(field('ctaLabel')?.value || '').trim();
        draft.ctaUrl = String(field('ctaUrl')?.value || '').trim();
      }
      return draft;
    };

    const showError = (msg) => {
      if (!errEl) return;
      errEl.textContent = msg || '';
      errEl.classList.toggle('hidden', !msg);
    };

    const paintRecipients = () => {
      const summary = form.querySelector('[data-recipient-summary]');
      const listEl = form.querySelector('[data-recipient-list]');
      if (!summary) return;
      if (nAll === 1) {
        const r = list[0] || {};
        summary.innerHTML = `<div class="bulk-recipient-card">
          <b>${escapeHtml(r.displayName || '사용자')}</b>
          <span>${escapeHtml(r.email || (isEmail ? '이메일 없음' : '앱 쪽지'))}</span>
        </div>`;
      } else {
        summary.innerHTML = `<div class="bulk-recipient-card multi">
          <b>선택된 사용자 ${nAll}명</b>
          <span>${isEmail ? `발송 가능 ${nSend}명${invalid.length ? ` · 이메일 없음 ${invalid.length}명` : ''}` : '앱 쪽지 발송'}</span>
        </div>`;
      }
      if (listEl) {
        listEl.innerHTML = list.map((r) => {
          const bad = isEmail && !(r.email && String(r.email).includes('@'));
          return `<div class="bulk-recipient-row${bad ? ' is-invalid' : ''}">
            <div><b>${escapeHtml(r.displayName || '사용자')}</b><small>${escapeHtml(r.email || '이메일 없음')}</small></div>
            <code title="UID">${escapeHtml(shortUid(r.uid))}</code>
          </div>`;
        }).join('');
      }
    };

    const updateDupWarn = () => {
      const warnEl = form.querySelector('[data-body-dup-warn]');
      if (!isEmail || !warnEl) return;
      const hit = detectAutoGreetingOverlap(field('body')?.value || '');
      const lines = [];
      if (hit.header.duplicate) lines.push('⚠ 자동 인사말과 중복될 수 있습니다.');
      if (hit.footer.duplicate) lines.push('⚠ 하단 자동 서명과 중복될 수 있습니다.');
      warnEl.textContent = lines.join('\n');
      warnEl.classList.toggle('hidden', !lines.length);
    };

    const updatePreview = () => {
      const draft = readDraft();
      if (isEmail) {
        const built = buildAdminBrandedEmail(draft);
        const iframe = form.querySelector('[data-preview-iframe]');
        const frame = form.querySelector('[data-preview-frame]');
        if (frame) frame.dataset.width = previewWidth;
        if (iframe) {
          iframe.srcdoc = built.html || '<p></p>';
        }
      } else {
        const box = form.querySelector('[data-app-preview]');
        if (box) {
          box.innerHTML = `<div class="bulk-app-preview-card">
            <div class="bulk-app-preview-title">${escapeHtml(draft.subject || '제목')}</div>
            <div class="bulk-app-preview-body">${escapeHtml(draft.body || '내용')}</div>
          </div>`;
        }
      }
    };

    const applyPreset = (id) => {
      const p = presets.find((x) => x.id === id) || presets[0];
      if (!p) return;
      if (field('subject')) field('subject').value = p.subject || '';
      if (field('body')) field('body').value = p.body || '';
      if (isEmail) {
        if (field('preheader')) field('preheader').value = p.preheader || '';
        if (field('bannerEnabled')) field('bannerEnabled').checked = !!p.bannerEnabled;
        if (field('bannerEyebrow')) field('bannerEyebrow').value = p.bannerEyebrow || '';
        if (field('bannerTitle')) field('bannerTitle').value = p.bannerTitle || '';
        if (field('bannerDescription')) field('bannerDescription').value = p.bannerDescription || '';
        if (field('ctaLabel')) field('ctaLabel').value = p.ctaLabel || '';
        if (field('ctaUrl')) field('ctaUrl').value = p.ctaUrl || '';
        syncBannerFields();
      }
      updatePreview();
      updateDupWarn();
    };

    const syncBannerFields = () => {
      const wrap = form.querySelector('[data-banner-fields]');
      const on = !!field('bannerEnabled')?.checked;
      if (wrap) wrap.classList.toggle('is-dim', !on);
    };

    const validate = () => {
      const draft = readDraft();
      if (!draft.subject) return '제목을 입력하세요.';
      if (!draft.body) return '본문을 입력하세요.';
      if (!nSend) return isEmail ? '발송 가능한 이메일이 없습니다.' : '발송 대상이 없습니다.';
      if (isEmail) {
        if (draft.ctaLabel && !validateHttpUrl(draft.ctaUrl)) {
          return 'CTA URL은 http(s) 주소여야 합니다.';
        }
        if (draft.ctaUrl && !draft.ctaLabel) {
          return 'CTA 문구를 입력하세요.';
        }
        if (draft.bannerImageUrl && !validateHttpUrl(draft.bannerImageUrl)) {
          return '배너 이미지 URL은 http(s) 주소여야 합니다.';
        }
      }
      return '';
    };

    const setSending = (on) => {
      sending = on;
      if (sendBtn) {
        sendBtn.disabled = on || !nSend;
        sendBtn.textContent = on
          ? `${nSend}명에게 발송 중...`
          : `${nSend}명에게 ${channelLabel} 발송`;
      }
    };

    const close = (value) => {
      if (sending) return;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) close(null);
    };

    form.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => close(null));
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !sending) close(null);
    });

    form.querySelector('[data-toggle-recipients]')?.addEventListener('click', (e) => {
      const listEl = form.querySelector('[data-recipient-list]');
      if (!listEl) return;
      const open = listEl.classList.toggle('hidden');
      e.currentTarget.textContent = open ? '목록 보기' : '목록 닫기';
    });

    form.querySelector('[data-toggle-decorate]')?.addEventListener('click', (e) => {
      const panel = form.querySelector('[data-decorate]');
      if (!panel) return;
      const hidden = panel.classList.toggle('hidden');
      e.currentTarget.textContent = hidden ? '+ 이메일 꾸미기' : '이메일 꾸미기 닫기';
    });

    form.querySelectorAll('[data-preview-width]').forEach((btn) => {
      btn.addEventListener('click', () => {
        previewWidth = btn.getAttribute('data-preview-width') || 'desktop';
        form.querySelectorAll('[data-preview-width]').forEach((b) => b.classList.toggle('is-active', b === btn));
        updatePreview();
      });
    });

    field('preset')?.addEventListener('change', () => applyPreset(field('preset').value));
    field('bannerEnabled')?.addEventListener('change', () => {
      syncBannerFields();
      updatePreview();
    });

    ['subject', 'body', 'preheader', 'bannerEyebrow', 'bannerTitle', 'bannerDescription', 'bannerImageUrl', 'ctaLabel', 'ctaUrl']
      .forEach((name) => {
        field(name)?.addEventListener('input', () => {
          showError('');
          updatePreview();
          if (name === 'body') updateDupWarn();
        });
      });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const err = validate();
      if (err) {
        showError(err);
        return;
      }
      const draft = readDraft();
      const ok = await openAdminConfirmModal({
        title: `${channelLabel} 발송 확인`,
        confirmLabel: `${nSend}명에게 발송`,
        messageHtml: `<p><b>${nSend}명</b>에게 ${escapeHtml(channelLabel)}을(를) 발송합니다.</p>
          <p class="bulk-confirm-subject"><span>제목</span><b>${escapeHtml(draft.subject)}</b></p>
          ${invalid.length ? `<p class="bulk-confirm-warn">이메일 없음 ${invalid.length}명은 건너뜁니다.</p>` : ''}
          <p class="muted small">발송 후 취소할 수 없습니다.</p>`
      });
      if (!ok) return;

      if (typeof onSend !== 'function') {
        close({ ...draft, recipientUids: sendable.map((r) => r.uid) });
        return;
      }

      setSending(true);
      showError('');
      try {
        const result = await onSend({
          ...draft,
          recipientUids: sendable.map((r) => r.uid),
          invalidRecipients: invalid
        }, { setSending });
        setSending(false);
        close(result == null ? { ok: true, draft } : result);
      } catch (sendErr) {
        setSending(false);
        showError(sendErr?.message || `${channelLabel} 발송에 실패했습니다.`);
      }
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    paintRecipients();
    syncBannerFields();
    applyPreset('blank');
    updateDupWarn();
    field('subject')?.focus();
  });
}

export { openAdminConfirmModal };
