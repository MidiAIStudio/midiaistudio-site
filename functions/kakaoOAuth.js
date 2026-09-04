/**
 * Kakao OAuth callback for future admin Talk notifications ("나와의 채팅").
 * Stores refresh token via Admin SDK in a client-denied Firestore doc.
 * Never logs or returns token values.
 */

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const DOC_PATH = { collection: 'systemPrivate', id: 'kakaoAdminOAuth' };

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlPage(title, bodyLines) {
  const body = bodyLines.map((line) => `<p>${escHtml(line)}</p>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function sendHtml(res, status, title, lines) {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(htmlPage(title, lines));
}

/**
 * Redirect URI must match Kakao Developers exactly (no query string).
 * Prefer KAKAO_REDIRECT_URI when set; otherwise rebuild from the request host/path.
 */
function resolveRedirectUri(req) {
  const configured = String(process.env.KAKAO_REDIRECT_URI || '').trim();
  if (configured) return configured;

  const host = String(req.get('x-forwarded-host') || req.get('host') || '').trim();
  const proto = String(req.get('x-forwarded-proto') || 'https').split(',')[0].trim() || 'https';
  let path = String(req.path || '/').split('?')[0];
  if (!path || path === '/') {
    path = '/kakaoOAuthCallback';
  }
  if (!host) {
    return 'https://us-central1-midiaistudio.cloudfunctions.net/kakaoOAuthCallback';
  }
  return `${proto}://${host}${path}`;
}

function envSecret(name) {
  return String(process.env[name] || '').trim();
}

/**
 * Persist Kakao OAuth tokens for the admin Talk integration.
 * - refresh_token: required long-lived credential (replaced when Kakao returns a new one)
 * - access_token: not stored permanently; only expiry metadata is kept for future refresh flows
 */
async function storeKakaoAdminTokens(db, FieldValue, tokenPayload) {
  const refreshToken = String(tokenPayload.refresh_token || '').trim();
  if (!refreshToken) {
    throw Object.assign(new Error('Kakao token response missing refresh_token'), { status: 502 });
  }

  const nowMs = Date.now();
  const expiresIn = Number(tokenPayload.expires_in);
  const refreshExpiresIn = Number(tokenPayload.refresh_token_expires_in);

  const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id);
  const update = {
    provider: 'kakao',
    purpose: 'admin_talk_message',
    hasRefreshToken: true,
    refreshToken,
    scope: String(tokenPayload.scope || '').trim(),
    tokenType: String(tokenPayload.token_type || 'bearer').trim(),
    updatedAt: FieldValue.serverTimestamp()
  };

  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    update.accessTokenExpiresAt = new Date(nowMs + expiresIn * 1000);
  }
  if (Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0) {
    update.refreshTokenExpiresAt = new Date(nowMs + refreshExpiresIn * 1000);
  }

  // Merge so a later refresh that omits refresh_token can update access expiry only
  // via a dedicated refresh helper; this callback always writes a refresh_token.
  await ref.set(update, { merge: true });
}

/**
 * Exchange authorization code for tokens. Never returns token strings to callers
 * that might log them — only status fields.
 */
async function exchangeAuthorizationCode(code, redirectUri) {
  const restApiKey = envSecret('KAKAO_REST_API_KEY');
  if (!restApiKey) {
    throw Object.assign(new Error('Kakao REST API key is not configured'), { status: 500 });
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', restApiKey);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

  const clientSecret = envSecret('KAKAO_CLIENT_SECRET');
  // Placeholder values allow the optional secret to exist in Secret Manager
  // when Kakao Console Client Secret is disabled.
  if (clientSecret && !/^(none|disabled|-)$/i.test(clientSecret)) {
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: body.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errCode = data.error || data.error_code || res.status;
    console.error('kakaoOAuthCallback token exchange failed', {
      httpStatus: res.status,
      error: String(errCode),
      // Never log error_description if it might echo tokens; Kakao usually returns codes only.
      hasErrorDescription: Boolean(data.error_description)
    });
    throw Object.assign(new Error('Kakao token exchange failed'), { status: 502, kakaoError: String(errCode) });
  }

  if (!data.access_token || !data.refresh_token) {
    console.error('kakaoOAuthCallback token response incomplete', {
      hasAccessToken: Boolean(data.access_token),
      hasRefreshToken: Boolean(data.refresh_token)
    });
    throw Object.assign(new Error('Kakao token response incomplete'), { status: 502 });
  }

  return data;
}

/**
 * Replace refresh token when a future token refresh returns a new one.
 * Safe to call from later message-send helpers.
 */
async function replaceRefreshTokenIfPresent(db, FieldValue, tokenPayload) {
  const next = String((tokenPayload && tokenPayload.refresh_token) || '').trim();
  if (!next) return false;

  const ref = db.collection(DOC_PATH.collection).doc(DOC_PATH.id);
  const patch = {
    hasRefreshToken: true,
    refreshToken: next,
    updatedAt: FieldValue.serverTimestamp()
  };
  const refreshExpiresIn = Number(tokenPayload.refresh_token_expires_in);
  if (Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0) {
    patch.refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000);
  }
  await ref.set(patch, { merge: true });
  return true;
}

function createKakaoOAuthCallbackHandler({ db, FieldValue }) {
  return async function kakaoOAuthCallback(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendHtml(res, 405, 'Method not allowed', ['Only GET is supported for Kakao OAuth callback.']);
    }

    const q = req.query || {};
    const oauthError = String(q.error || '').trim();
    if (oauthError) {
      const desc = String(q.error_description || '').trim();
      console.warn('kakaoOAuthCallback oauth error', { error: oauthError, hasDescription: Boolean(desc) });
      return sendHtml(res, 400, 'Kakao authorization failed', [
        'Kakao authorization failed.',
        desc ? `Reason: ${desc}` : `Error: ${oauthError}`,
        'You can close this window.'
      ]);
    }

    const code = String(q.code || '').trim();
    if (!code) {
      return sendHtml(res, 400, 'Missing authorization code', [
        'Kakao authorization code is missing.',
        'Open the Kakao authorize URL to sign in, then you will be redirected here with a code.',
        'You can close this window.'
      ]);
    }

    try {
      const redirectUri = resolveRedirectUri(req);
      const tokens = await exchangeAuthorizationCode(code, redirectUri);
      await storeKakaoAdminTokens(db, FieldValue, tokens);
      console.info('kakaoOAuthCallback success', {
        hasRefreshToken: true,
        hasAccessToken: Boolean(tokens.access_token),
        expiresInPresent: Number.isFinite(Number(tokens.expires_in)),
        refreshExpiresInPresent: Number.isFinite(Number(tokens.refresh_token_expires_in))
      });
      return sendHtml(res, 200, 'Kakao authorization completed', [
        'Kakao authorization completed successfully.',
        'You can close this window.'
      ]);
    } catch (err) {
      const status = err.status || 500;
      console.error('kakaoOAuthCallback', {
        status,
        message: err && err.message ? err.message : String(err),
        kakaoError: err.kakaoError || null
      });
      return sendHtml(res, status, 'Kakao authorization error', [
        'Kakao authorization could not be completed.',
        'Please try again or contact the site operator.',
        'You can close this window.'
      ]);
    }
  };
}

module.exports = {
  DOC_PATH,
  createKakaoOAuthCallbackHandler,
  resolveRedirectUri,
  storeKakaoAdminTokens,
  replaceRefreshTokenIfPresent,
  exchangeAuthorizationCode
};
