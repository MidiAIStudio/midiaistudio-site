/**
 * Kakao admin Talk ("나와의 채팅") notifications.
 * Never logs access_token / refresh_token / secrets / authorization codes.
 */

const {
  DOC_PATH,
  replaceRefreshTokenIfPresent
} = require('./kakaoOAuth');

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_MEMO_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const PLACEHOLDER_RE = /^(unset|none|disabled|-)$/i;
const TEXT_MAX = 200;
const DEFAULT_LINK = {
  web_url: 'https://midiaistudio.com',
  mobile_web_url: 'https://midiaistudio.com'
};

function envSecret(name) {
  return String(process.env[name] || '').trim();
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER_RE.test(value);
}

function safeDiag(fields) {
  console.error(JSON.stringify({ tag: '[KAKAO_ADMIN_NOTIFY]', ...fields }));
}

function truncateText(text, max = TEXT_MAX) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 3))}...`;
}

/**
 * Load stored refresh token and exchange for a short-lived access token.
 * Rotates Firestore refresh_token when Kakao returns a new one.
 */
async function getKakaoAdminAccessToken(db, FieldValue) {
  const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id);
  const snap = await ref.get();
  if (!snap.exists) {
    safeDiag({ stage: 'refresh_token_missing', reason: 'doc_absent' });
    throw Object.assign(new Error('Kakao admin OAuth not configured'), {
      status: 500,
      stage: 'refresh_token_missing'
    });
  }
  const data = snap.data() || {};
  const refreshToken = String(data.refreshToken || '').trim();
  if (!refreshToken) {
    safeDiag({ stage: 'refresh_token_missing', reason: 'empty_field' });
    throw Object.assign(new Error('Kakao admin refresh token missing'), {
      status: 500,
      stage: 'refresh_token_missing'
    });
  }

  const restApiKey = envSecret('KAKAO_REST_API_KEY');
  if (isPlaceholder(restApiKey)) {
    safeDiag({ stage: 'secret_load_failed', secret: 'KAKAO_REST_API_KEY' });
    throw Object.assign(new Error('Kakao REST API key not configured'), {
      status: 500,
      stage: 'secret_load_failed'
    });
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('client_id', restApiKey);
  body.set('refresh_token', refreshToken);
  const clientSecret = envSecret('KAKAO_CLIENT_SECRET');
  const clientSecretIncluded = !isPlaceholder(clientSecret);
  if (clientSecretIncluded) {
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: body.toString()
  });
  const payload = await res.json().catch(() => null);
  if (!payload || !res.ok || !payload.access_token) {
    safeDiag({
      stage: 'access_token_refresh_failed',
      httpStatus: res.status,
      error: payload && payload.error ? String(payload.error) : null,
      error_description: payload && payload.error_description
        ? String(payload.error_description).slice(0, 200)
        : null,
      clientSecretIncluded
    });
    throw Object.assign(new Error('Kakao access token refresh failed'), {
      status: 502,
      stage: 'access_token_refresh_failed',
      kakaoError: payload && payload.error ? String(payload.error) : String(res.status)
    });
  }

  if (payload.refresh_token) {
    await replaceRefreshTokenIfPresent(db, FieldValue, payload);
  }

  const expiresIn = Number(payload.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    await ref.set({
      accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return String(payload.access_token);
}

/**
 * Inspect stored OAuth doc metadata without exposing token values.
 */
async function getKakaoAdminOAuthStatus(db) {
  const snap = await db.collection(DOC_PATH.collection).doc(DOC_PATH.id).get();
  if (!snap.exists) {
    return { exists: false, hasRefreshToken: false };
  }
  const data = snap.data() || {};
  const rt = String(data.refreshToken || '');
  return {
    exists: true,
    hasRefreshToken: Boolean(rt),
    refreshTokenLength: rt.length,
    hasRefreshTokenFlag: data.hasRefreshToken === true,
    provider: data.provider || null,
    purpose: data.purpose || null,
    hasScope: Boolean(data.scope),
    hasTokenType: Boolean(data.tokenType),
    hasUpdatedAt: Boolean(data.updatedAt),
    hasAccessTokenExpiresAt: Boolean(data.accessTokenExpiresAt),
    hasRefreshTokenExpiresAt: Boolean(data.refreshTokenExpiresAt),
    hasAccessTokenStored: Boolean(data.accessToken),
    fieldKeys: Object.keys(data).sort()
  };
}

/**
 * Send a text memo to the authorized admin's Kakao "나와의 채팅".
 * Kakao text templates require a link object; no custom buttons are added.
 */
async function sendKakaoAdminNotification(db, FieldValue, { type, title, message } = {}) {
  const accessToken = await getKakaoAdminAccessToken(db, FieldValue);
  const headline = String(title || 'MidiAI Studio').trim();
  const body = String(message || '').trim();
  const typeLine = type ? `[${String(type).trim()}]` : '';
  const text = truncateText([headline, typeLine, body].filter(Boolean).join('\n\n'));

  const templateObject = {
    object_type: 'text',
    text,
    link: DEFAULT_LINK
  };

  const form = new URLSearchParams();
  form.set('template_object', JSON.stringify(templateObject));

  const res = await fetch(KAKAO_MEMO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: form.toString()
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    safeDiag({
      stage: 'memo_send_failed',
      httpStatus: res.status,
      kakaoCode: payload.code != null ? payload.code : null,
      msg: payload.msg ? String(payload.msg).slice(0, 200) : null,
      type: type || null
    });
    throw Object.assign(new Error('Kakao admin memo send failed'), {
      status: 502,
      stage: 'memo_send_failed',
      kakaoCode: payload.code != null ? payload.code : null
    });
  }

  console.info(JSON.stringify({
    tag: '[KAKAO_ADMIN_NOTIFY]',
    stage: 'memo_send_ok',
    type: type || null,
    textLength: text.length
  }));
  return { ok: true };
}

/**
 * Shared admin notification entry (Kakao only).
 */
async function notifyAdmin(db, FieldValue, { type, title, message } = {}) {
  return sendKakaoAdminNotification(db, FieldValue, { type, title, message });
}

function createTestKakaoAdminNotificationHandler({ db, FieldValue, cors, requireAdmin }) {
  return async function testKakaoAdminNotification(req, res) {
    if (cors(req, res, 'POST, OPTIONS')) return;
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'POST only' });
    }
    try {
      // Prefer Firebase admin auth; allow one-time CLI header when KAKAO_ADMIN_TEST_KEY is set.
      let authMode = 'firebase_admin';
      try {
        await requireAdmin(req);
      } catch (authErr) {
        const expected = envSecret('KAKAO_ADMIN_TEST_KEY');
        const provided = String(req.get('x-midiai-admin-test') || '').trim();
        if (!expected || isPlaceholder(expected) || !provided || provided !== expected) {
          throw authErr;
        }
        authMode = 'cli_test_key';
      }

      const storage = await getKakaoAdminOAuthStatus(db);
      if (!storage.exists || !storage.hasRefreshToken) {
        return res.status(500).json({
          ok: false,
          stage: 'refresh_token_missing',
          storage
        });
      }

      await sendKakaoAdminNotification(db, FieldValue, {
        type: 'test',
        title: '🔔 MidiAI Studio',
        message: [
          '카카오 관리자 알림 연결이 완료되었습니다.',
          '',
          '상태: 정상',
          '채널: KakaoTalk'
        ].join('\n')
      });

      return res.json({
        ok: true,
        stage: 'memo_send_ok',
        authMode,
        storage: {
          exists: storage.exists,
          hasRefreshToken: storage.hasRefreshToken,
          refreshTokenLength: storage.refreshTokenLength,
          hasAccessTokenStored: storage.hasAccessTokenStored,
          provider: storage.provider,
          purpose: storage.purpose,
          fieldKeys: storage.fieldKeys
        }
      });
    } catch (err) {
      const status = err.status || 500;
      safeDiag({
        stage: err.stage || 'test_handler_failed',
        status,
        message: err && err.message ? err.message : String(err),
        kakaoError: err.kakaoError || null,
        kakaoCode: err.kakaoCode != null ? err.kakaoCode : null
      });
      return res.status(status).json({
        ok: false,
        stage: err.stage || 'test_handler_failed',
        message: err.message || 'testKakaoAdminNotification failed',
        kakaoCode: err.kakaoCode != null ? err.kakaoCode : null
      });
    }
  };
}

module.exports = {
  getKakaoAdminAccessToken,
  getKakaoAdminOAuthStatus,
  sendKakaoAdminNotification,
  notifyAdmin,
  createTestKakaoAdminNotificationHandler,
  truncateText
};
