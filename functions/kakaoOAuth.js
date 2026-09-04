/**
 * Kakao OAuth callback for future admin Talk notifications ("나와의 채팅").
 * Stores refresh token via Admin SDK in a client-denied Firestore doc.
 * Never logs or returns token / secret / authorization-code values.
 */

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
/** Must match Kakao Developers Redirect URI byte-for-byte (Gen2 Host may be *.run.app). */
const CANONICAL_REDIRECT_URI =
  'https://us-central1-midiaistudio.cloudfunctions.net/kakaoOAuthCallback';
const DOC_PATH = { collection: 'systemPrivate', id: 'kakaoAdminOAuth' };
const PLACEHOLDER_RE = /^(unset|none|disabled|-)$/i;

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

function resolveRedirectUri(req) {
  const configured = String(process.env.KAKAO_REDIRECT_URI || '').trim();
  if (configured) return configured;
  // Prefer canonical cloudfunctions.net URL — Gen2 may present Host as *.a.run.app.
  return CANONICAL_REDIRECT_URI;
}

function envSecret(name) {
  return String(process.env[name] || '').trim();
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER_RE.test(value);
}

function safeDiag(fields) {
  // Never accept raw secrets/tokens into logs.
  const out = { tag: '[KAKAO_OAUTH]', ...fields };
  console.error(JSON.stringify(out));
}

/**
 * Persist Kakao OAuth tokens for the admin Talk integration.
 * - refresh_token: required long-lived credential (replaced when Kakao returns a new one)
 * - access_token: not stored permanently; only expiry metadata is kept for future refresh flows
 */
async function storeKakaoAdminTokens(db, FieldValue, tokenPayload) {
  const refreshToken = String(tokenPayload.refresh_token || '').trim();
  if (!refreshToken) {
    throw Object.assign(new Error('Kakao token response missing refresh_token'), {
      status: 502,
      stage: 'token_response_incomplete'
    });
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

  await ref.set(update, { merge: true });
}

/**
 * Exchange authorization code for tokens. Never returns token strings to callers
 * that might log them — only status fields.
 */
async function exchangeAuthorizationCode(code, redirectUri) {
  const restApiKey = envSecret('KAKAO_REST_API_KEY');
  if (isPlaceholder(restApiKey)) {
    safeDiag({
      stage: 'secret_load_failed',
      secret: 'KAKAO_REST_API_KEY',
      reason: 'missing_or_placeholder'
    });
    throw Object.assign(new Error('Kakao REST API key is not configured'), {
      status: 500,
      stage: 'secret_load_failed'
    });
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', restApiKey);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

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

  const data = await res.json().catch(() => null);
  if (data == null) {
    safeDiag({
      stage: 'token_exchange_parse_failed',
      httpStatus: res.status,
      redirectUri,
      clientSecretIncluded,
      restKeyLen: restApiKey.length
    });
    throw Object.assign(new Error('Kakao token response parse failed'), {
      status: 502,
      stage: 'token_exchange_parse_failed'
    });
  }

  if (!res.ok) {
    const oauthError = String(data.error || '').trim();
    const oauthDesc = String(data.error_description || '').trim();
    const kakaoCode = String(data.error_code || data.code || '').trim();
    safeDiag({
      stage: 'token_exchange_failed',
      httpStatus: res.status,
      error: oauthError || null,
      error_description: oauthDesc || null,
      kakao_code: kakaoCode || null,
      redirectUri,
      clientSecretIncluded,
      restKeyLen: restApiKey.length,
      redirectUriExactCanonical: redirectUri === CANONICAL_REDIRECT_URI
    });
    throw Object.assign(new Error('Kakao token exchange failed'), {
      status: 502,
      stage: 'token_exchange_failed',
      kakaoError: oauthError || String(res.status),
      kakaoCode: kakaoCode || null,
      kakaoHttpStatus: res.status,
      kakaoErrorDescription: oauthDesc || null
    });
  }

  if (!data.access_token || !data.refresh_token) {
    safeDiag({
      stage: 'token_response_incomplete',
      hasAccessToken: Boolean(data.access_token),
      hasRefreshToken: Boolean(data.refresh_token)
    });
    throw Object.assign(new Error('Kakao token response incomplete'), {
      status: 502,
      stage: 'token_response_incomplete'
    });
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
      safeDiag({
        stage: 'authorize_redirect_error',
        error: oauthError,
        error_description: desc || null
      });
      return sendHtml(res, 400, 'Kakao authorization failed', [
        'Kakao authorization failed.',
        desc ? `Reason: ${desc}` : `Error: ${oauthError}`,
        'You can close this window.'
      ]);
    }

    const code = String(q.code || '').trim();
    if (!code) {
      safeDiag({ stage: 'missing_authorization_code' });
      return sendHtml(res, 400, 'Missing authorization code', [
        'Kakao authorization code is missing.',
        'Open the Kakao authorize URL to sign in, then you will be redirected here with a code.',
        'You can close this window.'
      ]);
    }

    try {
      const redirectUri = resolveRedirectUri(req);
      const tokens = await exchangeAuthorizationCode(code, redirectUri);
      try {
        await storeKakaoAdminTokens(db, FieldValue, tokens);
      } catch (storeErr) {
        safeDiag({
          stage: 'firestore_store_failed',
          firestoreCode: storeErr && storeErr.code ? String(storeErr.code) : null,
          message: storeErr && storeErr.message ? String(storeErr.message).slice(0, 200) : null
        });
        throw Object.assign(storeErr, { stage: 'firestore_store_failed', status: 500 });
      }
      console.info(JSON.stringify({
        tag: '[KAKAO_OAUTH]',
        stage: 'success',
        hasRefreshToken: true,
        expiresInPresent: Number.isFinite(Number(tokens.expires_in)),
        refreshExpiresInPresent: Number.isFinite(Number(tokens.refresh_token_expires_in))
      }));
      return sendHtml(res, 200, 'Kakao authorization completed', [
        'Kakao authorization completed successfully.',
        'You can close this window.'
      ]);
    } catch (err) {
      const status = err.status || 500;
      safeDiag({
        stage: err.stage || 'callback_unhandled',
        status,
        message: err && err.message ? err.message : String(err),
        kakaoError: err.kakaoError || null,
        kakao_code: err.kakaoCode || null,
        httpStatus: err.kakaoHttpStatus || null,
        error_description: err.kakaoErrorDescription || null
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
  CANONICAL_REDIRECT_URI,
  createKakaoOAuthCallbackHandler,
  resolveRedirectUri,
  storeKakaoAdminTokens,
  replaceRefreshTokenIfPresent,
  exchangeAuthorizationCode
};
