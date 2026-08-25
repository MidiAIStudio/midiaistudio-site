import { escapeHtml, buildAdminBrandedEmail } from './admin-email-template.js?v=email-auto-ux-1';

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'scheduled', label: '예약' },
  { id: 'processing', label: '처리 중' },
  { id: 'completed', label: '완료' },
  { id: 'failed', label: '실패' },
  { id: 'cancelled', label: '취소' }
];

const STATUS_META = {
  scheduled: { label: '예약', badge: 'is-trial' },
  processing: { label: '처리 중', badge: 'is-period' },
  completed: { label: '완료', badge: 'is-active' },
  partial: { label: '일부 실패', badge: 'is-trial' },
  failed: { label: '실패', badge: 'is-banned' },
  cancelled: { label: '취소', badge: 'is-none' }
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status || '-', badge: 'is-none' };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatListKst(ms) {
  const n = Number(ms || 0);
  if (!n) return '—';
  const shifted = new Date(n + 9 * 60 * 60 * 1000);
  return `${pad2(shifted.getUTCMonth() + 1)}/${pad2(shifted.getUTCDate())} ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

function listWhen(job) {
  if (String(job.sendType) === 'scheduled') return formatListKst(job.scheduledAtMs);
  return formatListKst(job.completedAtMs || job.startedAtMs || job.createdAtMs);
}

function resultText(job) {
  const n = Number(job.recipientCount || 0);
  const ok = Number(job.successCount || 0);
  if (job.status === 'completed') return n ? `완료 · ${ok}/${n}` : '완료';
  if (job.status === 'partial') return `일부 실패 · ${ok}/${n}`;
  if (job.status === 'failed') return n ? `실패 · ${ok}/${n}` : '실패';
  if (job.status === 'processing') return n ? `처리 중 · ${ok}/${n}` : '처리 중';
  return statusMeta(job.status).label;
}

function statusBadge(status) {
  const meta = statusMeta(status);
  return `<span class="crm-badge ${meta.badge}"><i></i>${escapeHtml(meta.label)}</span>`;
}

function hasActiveJobs(jobs) {
  return (jobs || []).some((job) => job.status === 'scheduled' || job.status === 'processing');
}

export function mountAdminEmailHistory(container, { request, confirmModal } = {}) {
  if (!container) return { refresh: async () => {}, destroy() {} };

  let filter = 'all';
  let jobs = [];
  let cursorMs = 0;
  let hasMore = false;
  let loading = false;
  let detailJobId = null;
  let pollTimer = 0;

  const stopPoll = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  };

  const startPoll = () => {
    stopPoll();
    if (!hasActiveJobs(jobs) || detailJobId) return;
    pollTimer = window.setInterval(() => {
      if (document.hidden) return;
      load({ silent: true }).catch(() => {});
    }, 20000);
  };

  const paint = () => {
    if (detailJobId) return;
    const rows = jobs.map((job) => `<tr data-job="${escapeHtml(job.jobId)}">
      <td>${escapeHtml(listWhen(job))}</td>
      <td><b>${escapeHtml(job.subject || '-')}</b></td>
      <td>${escapeHtml(job.sendType === 'scheduled' ? '예약' : '즉시')}</td>
      <td>${escapeHtml(String(job.recipientCount || 0))}명</td>
      <td>${statusBadge(job.status)} <span class="bulk-email-hist-result">${escapeHtml(resultText(job))}</span></td>
    </tr>`).join('');
    container.innerHTML = `
      <div class="bulk-email-hist-toolbar">
        <div class="bulk-email-hist-filters" role="tablist" aria-label="발송 상태">
          ${FILTERS.map((f) => `<button type="button" class="ghost mini-btn${filter === f.id ? ' is-active' : ''}" data-hist-filter="${f.id}">${f.label}</button>`).join('')}
        </div>
        <button type="button" class="ghost mini-btn" data-hist-refresh>새로고침</button>
      </div>
      <div class="bulk-email-hist-table-wrap">
        ${jobs.length
        ? `<table class="bulk-schedule-table bulk-email-hist-table">
            <thead><tr><th>발송 시각</th><th>제목</th><th>방식</th><th>대상</th><th>결과</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<p class="muted small">발송 내역이 없습니다.</p>'}
      </div>
      ${hasMore ? '<button type="button" class="ghost mini-btn" data-hist-more>더 보기</button>' : ''}`;
    container.querySelectorAll('[data-hist-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.getAttribute('data-hist-filter') || 'all';
        load({ reset: true }).catch(() => {});
      });
    });
    container.querySelector('[data-hist-refresh]')?.addEventListener('click', () => {
      load({ reset: true }).catch(() => {});
    });
    container.querySelector('[data-hist-more]')?.addEventListener('click', () => {
      load({ append: true }).catch(() => {});
    });
    container.querySelectorAll('[data-job]').forEach((row) => {
      row.addEventListener('click', () => openDetail(row.getAttribute('data-job')));
    });
  };

  const paintError = (message) => {
    container.innerHTML = `
      <div class="bulk-email-hist-toolbar">
        <div class="bulk-email-hist-filters">
          ${FILTERS.map((f) => `<button type="button" class="ghost mini-btn${filter === f.id ? ' is-active' : ''}" data-hist-filter="${f.id}">${f.label}</button>`).join('')}
        </div>
        <button type="button" class="ghost mini-btn" data-hist-refresh>새로고침</button>
      </div>
      <p class="bulk-composer-error">${escapeHtml(message || '발송 내역을 불러오지 못했습니다.')}</p>`;
    container.querySelectorAll('[data-hist-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.getAttribute('data-hist-filter') || 'all';
        load({ reset: true }).catch(() => {});
      });
    });
    container.querySelector('[data-hist-refresh]')?.addEventListener('click', () => {
      load({ reset: true }).catch(() => {});
    });
  };

  const load = async ({ reset = false, append = false, silent = false } = {}) => {
    if (typeof request !== 'function') {
      paintError('발송 내역을 불러올 수 없습니다.');
      return;
    }
    if (loading) return;
    if (reset) {
      cursorMs = 0;
      jobs = [];
      detailJobId = null;
    }
    loading = true;
    if (!silent && !append) {
      container.innerHTML = '<p class="muted small">불러오는 중...</p>';
    }
    try {
      const data = await request({
        action: 'list',
        statusFilter: filter,
        limit: 30,
        cursorMs: append ? cursorMs : 0
      });
      const next = Array.isArray(data.jobs) ? data.jobs : [];
      jobs = append ? jobs.concat(next) : next;
      hasMore = !!data.hasMore;
      cursorMs = Number(data.cursorMs || 0);
      paint();
      startPoll();
    } catch (err) {
      paintError(err?.message || '발송 내역을 불러오지 못했습니다.');
    } finally {
      loading = false;
    }
  };

  const openDetail = async (jobId) => {
    stopPoll();
    detailJobId = jobId;
    container.innerHTML = '<p class="muted small">불러오는 중...</p>';
    let job;
    try {
      const data = await request({ action: 'get', jobId });
      job = data.job;
    } catch (err) {
      detailJobId = null;
      paintError(err?.message || '상세를 불러오지 못했습니다.');
      return;
    }
    if (!job) {
      detailJobId = null;
      paint();
      return;
    }
    const canCancel = job.status === 'scheduled';
    const failRows = Array.isArray(job.failedSummary) ? job.failedSummary : [];
    const built = buildAdminBrandedEmail({
      subject: job.subject,
      body: job.body,
      preheader: job.preheader,
      bannerEnabled: job.bannerEnabled,
      bannerEyebrow: job.bannerEyebrow,
      bannerTitle: job.bannerTitle,
      bannerDescription: job.bannerDescription,
      ctaLabel: job.ctaLabel,
      ctaUrl: job.ctaUrl,
      bannerImageUrl: job.bannerImageUrl
    });
    container.innerHTML = `
      <div class="bulk-email-hist-detail">
        <div class="bulk-email-hist-toolbar">
          <button type="button" class="ghost mini-btn" data-hist-back>← 목록</button>
          ${canCancel ? '<button type="button" class="secondary mini-btn danger-btn" data-cancel-job>예약 취소</button>' : ''}
        </div>
        <p class="bulk-confirm-subject"><span>제목</span><b>${escapeHtml(job.subject || '-')}</b></p>
        <div class="bulk-email-hist-meta">
          <p>발송 방식: <b>${escapeHtml(job.sendType === 'scheduled' ? '예약 발송' : '즉시 발송')}</b></p>
          <p>상태: ${statusBadge(job.status)}</p>
          <p>작성 시각: ${escapeHtml(job.createdAtKst || '—')}</p>
          ${job.sendType === 'scheduled' ? `<p>예약 시각: <b>${escapeHtml(job.scheduledAtKst || '—')}</b></p>` : ''}
          <p>실제 발송 시작: ${escapeHtml(job.startedAtKst || '—')}</p>
          <p>발송 완료: ${escapeHtml(job.completedAtKst || '—')}</p>
          <p>대상: <b>${escapeHtml(String(job.recipientCount || 0))}명</b></p>
          <p>성공: <b>${escapeHtml(String(job.successCount || 0))}명</b></p>
          <p>실패: <b>${escapeHtml(String(job.failureCount || 0))}명</b></p>
          <p>등록 관리자: ${escapeHtml(job.createdByEmail || job.createdBy || '—')}</p>
        </div>
        ${job.error ? `<p class="bulk-confirm-warn">${escapeHtml(job.error)}</p>` : ''}
        ${failRows.length ? `<div class="bulk-email-hist-fails"><span>실패 대상</span><ul>${failRows.map((row) => `<li>${escapeHtml(row.message || row.code || '실패')}</li>`).join('')}</ul></div>` : ''}
        <div class="bulk-schedule-body-view"><span>본문</span><pre>${escapeHtml(job.body || '')}</pre></div>
        <iframe class="bulk-preview-iframe bulk-schedule-preview" title="Email history preview" sandbox=""></iframe>
        <p class="muted small bulk-email-hist-tech">기술 정보 · ${escapeHtml(job.jobId || '')}</p>
      </div>`;
    const iframe = container.querySelector('iframe');
    if (iframe) iframe.srcdoc = built.html || '<p></p>';
    container.querySelector('[data-hist-back]')?.addEventListener('click', () => {
      detailJobId = null;
      paint();
      startPoll();
    });
    container.querySelector('[data-cancel-job]')?.addEventListener('click', async () => {
      const ok = await (typeof confirmModal === 'function'
        ? confirmModal({
          title: '예약 취소',
          confirmLabel: '예약 취소',
          cancelLabel: '돌아가기',
          messageHtml: `<p>예약 발송을 취소하시겠습니까?</p>
          <p><b>${escapeHtml(job.scheduledAtKst || '')}</b></p>
          <p>대상 ${escapeHtml(String(job.recipientCount || 0))}명</p>
          <p class="bulk-confirm-subject"><span>제목</span><b>${escapeHtml(job.subject || '')}</b></p>`
        })
        : window.confirm('예약 발송을 취소하시겠습니까?'));
      if (!ok) return;
      try {
        await request({ action: 'cancel', jobId: job.jobId });
        detailJobId = null;
        await load({ reset: true });
      } catch (err) {
        alert(err?.message || '예약 취소에 실패했습니다.');
      }
    });
  };

  load({ reset: true }).catch(() => {});

  return {
    refresh: () => load({ reset: true }),
    destroy() {
      stopPoll();
      detailJobId = null;
      jobs = [];
    }
  };
}
