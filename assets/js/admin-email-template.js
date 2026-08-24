/** Browser mirror of functions/adminEmailTemplate.js — keep in sync for Preview ≈ Send. */

const SITE_HOME = 'https://midiaistudio.com/';
const SITE_SUPPORT = 'https://midiaistudio.com/support.html';
const LOGO_URL = 'https://midiaistudio.com/assets/images/symbol.png';
const BRAND_NAME = 'MidiAI Studio';
const BRAND_TAGLINE = 'AI MIDI Conversion & Score Editing';

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (/^(javascript|data|vbscript):/i.test(s)) return null;
  return u.href;
}

function formatInline(escaped) {
  return String(escaped || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (m, label, url) => {
        const safe = validateHttpUrl(url);
        if (!safe) return label;
        return `<a href="${escapeHtml(safe)}" style="color:#5b4cdb;text-decoration:underline;" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
    );
}

export function formatBodyHtml(body) {
  const raw = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return '';
  const blocks = raw.split(/\n{2,}/);
  const parts = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const allBullets = lines.length > 0 && lines.every((ln) => /^\s*[-*]\s+/.test(ln));
    if (allBullets) {
      const items = lines.map((ln) => {
        const text = formatInline(escapeHtml(ln.replace(/^\s*[-*]\s+/, '')));
        return `<li style="margin:0 0 8px;line-height:1.65;color:#1f2937;">${text}</li>`;
      }).join('');
      parts.push(`<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`);
    } else {
      const html = formatInline(escapeHtml(block)).replace(/\n/g, '<br>\n');
      parts.push(`<p style="margin:0 0 16px;line-height:1.7;color:#1f2937;font-size:15px;">${html}</p>`);
    }
  }
  return parts.join('\n');
}

function formatBodyText(body) {
  return String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function normalizeBrandInput(input) {
  const src = input || {};
  const subject = String(src.subject || '').trim().slice(0, 200);
  const body = String(src.body || '').trim().slice(0, 20000);
  const preheader = String(src.preheader || '').trim().slice(0, 150);
  const bannerEnabled = !!src.bannerEnabled;
  const bannerEyebrow = String(src.bannerEyebrow || '').trim().slice(0, 40);
  const bannerTitle = String(src.bannerTitle || '').trim().slice(0, 80);
  const bannerDescription = String(src.bannerDescription || '').trim().slice(0, 200);
  const ctaLabel = String(src.ctaLabel || '').trim().slice(0, 40);
  const ctaUrl = validateHttpUrl(src.ctaUrl);
  const bannerImageUrl = validateHttpUrl(src.bannerImageUrl);
  return {
    subject,
    body,
    preheader,
    bannerEnabled,
    bannerEyebrow,
    bannerTitle,
    bannerDescription,
    ctaLabel,
    ctaUrl,
    bannerImageUrl
  };
}

export function buildAdminBrandedEmail(input) {
  const n = normalizeBrandInput(input);
  const year = new Date().getUTCFullYear();
  const bodyHtml = formatBodyHtml(n.body);
  const bodyText = formatBodyText(n.body);
  const preheader = n.preheader || n.subject;
  const showBanner = n.bannerEnabled && (n.bannerTitle || n.bannerDescription || n.bannerEyebrow || n.bannerImageUrl || (n.ctaLabel && n.ctaUrl));
  const showCta = !!(n.ctaLabel && n.ctaUrl);

  let bannerHtml = '';
  if (showBanner) {
    const eyebrow = n.bannerEyebrow
      ? `<div style="display:inline-block;margin:0 0 10px;padding:5px 10px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:12px;font-weight:700;letter-spacing:.02em;">${escapeHtml(n.bannerEyebrow)}</div>`
      : '';
    const title = n.bannerTitle
      ? `<div style="margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(n.bannerTitle)}</div>`
      : '';
    const desc = n.bannerDescription
      ? `<div style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(n.bannerDescription)}</div>`
      : '';
    const img = n.bannerImageUrl
      ? `<img src="${escapeHtml(n.bannerImageUrl)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;margin:0 0 16px;">`
      : '';
    const cta = showCta
      ? `<a href="${escapeHtml(n.ctaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6d28d9;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(n.ctaLabel)}</a>`
      : '';
    bannerHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:collapse;">
        <tr>
          <td style="padding:24px;border-radius:16px;background:#f5f3ff;border:1px solid #ddd6fe;">
            ${img}
            ${eyebrow}
            ${title}
            ${desc}
            ${cta}
          </td>
        </tr>
      </table>`;
  } else if (showCta) {
    bannerHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr>
          <td>
            <a href="${escapeHtml(n.ctaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6d28d9;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(n.ctaLabel)}</a>
          </td>
        </tr>
      </table>`;
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(n.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 18px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="${LOGO_URL}" width="36" height="36" alt="${escapeHtml(BRAND_NAME)}" style="display:block;border:0;border-radius:10px;">
                </td>
                <td style="vertical-align:middle;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(BRAND_NAME)}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px 28px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">안녕하세요,<br>MidiAI Studio입니다.</p>
              ${bodyHtml}
              ${bannerHtml}
              <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">감사합니다.<br>${escapeHtml(BRAND_NAME)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 0;text-align:center;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(BRAND_NAME)}</div>
              <div style="margin:6px 0 12px;font-size:12px;color:#64748b;">${escapeHtml(BRAND_TAGLINE)}</div>
              <div style="font-size:12px;line-height:1.7;">
                <a href="${SITE_HOME}" style="color:#5b4cdb;text-decoration:none;font-weight:600;">홈페이지</a>
                <span style="color:#94a3b8;"> · </span>
                <a href="${SITE_SUPPORT}" style="color:#5b4cdb;text-decoration:none;font-weight:600;">고객지원</a>
              </div>
              <div style="margin-top:14px;font-size:11px;color:#94a3b8;">© ${year} ${escapeHtml(BRAND_NAME)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    BRAND_NAME,
    '',
    '안녕하세요,',
    'MidiAI Studio입니다.',
    '',
    bodyText,
    ''
  ];
  if (showBanner) {
    if (n.bannerEyebrow) textParts.push(n.bannerEyebrow);
    if (n.bannerTitle) textParts.push(n.bannerTitle);
    if (n.bannerDescription) textParts.push(n.bannerDescription);
    textParts.push('');
  }
  if (showCta) {
    textParts.push(`${n.ctaLabel}:`);
    textParts.push(n.ctaUrl);
    textParts.push('');
  }
  textParts.push('감사합니다.');
  textParts.push(BRAND_NAME);
  textParts.push('');
  textParts.push(BRAND_TAGLINE);
  textParts.push(`홈페이지: ${SITE_HOME}`);
  textParts.push(`고객지원: ${SITE_SUPPORT}`);
  textParts.push(`© ${year} ${BRAND_NAME}`);

  return {
    subject: n.subject,
    text: textParts.join('\n'),
    html,
    meta: {
      preheader,
      bannerEnabled: showBanner,
      hasCta: showCta,
      logoUrl: LOGO_URL,
      siteHome: SITE_HOME,
      siteSupport: SITE_SUPPORT
    }
  };
}

export const BULK_MESSAGE_PRESETS = [
  {
    id: 'blank',
    label: '직접 작성',
    channel: 'both',
    subject: '',
    body: '',
    bannerEnabled: false
  },
  {
    id: 'update',
    label: '업데이트 안내',
    channel: 'both',
    subject: 'MidiAI Studio 업데이트 안내',
    body: '안녕하세요.\n\nMidiAI Studio에 새로운 업데이트가 적용되었습니다.\n\n자세한 내용은 공지와 앱 내 안내를 확인해 주세요.',
    bannerEnabled: false
  },
  {
    id: 'maintenance',
    label: '서비스 점검',
    channel: 'both',
    subject: '서비스 점검 안내',
    body: '안녕하세요.\n\n안정적인 서비스 제공을 위해 일시 점검을 진행합니다.\n\n점검 시간: (시간 입력)\n영향 범위: (범위 입력)\n\n이용에 불편을 드려 죄송합니다.',
    bannerEnabled: false
  },
  {
    id: 'payment',
    label: '결제 안내',
    channel: 'both',
    subject: '결제/이용 안내',
    body: '안녕하세요.\n\n요청하신 결제 및 이용 관련 안내입니다.\n\n문의가 있으시면 고객지원으로 연락해 주세요.',
    bannerEnabled: false
  },
  {
    id: 'event',
    label: '이벤트 안내',
    channel: 'email',
    subject: 'MidiAI Studio 이벤트 안내',
    body: '안녕하세요.\n\nMidiAI Studio에서 특별 이벤트를 진행합니다.\n아래 내용을 확인해 주세요.',
    bannerEnabled: true,
    bannerEyebrow: 'EVENT',
    bannerTitle: '기간제 상품 출시 이벤트',
    bannerDescription: '기간 한정 혜택을 확인해 보세요.',
    ctaLabel: '가격 확인하기',
    ctaUrl: 'https://midiaistudio.com/'
  }
];
