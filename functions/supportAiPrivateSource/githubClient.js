'use strict';

const crypto = require('crypto');
const { PRIVATE_SOURCE_CONFIG, repoSlug } = require('./config');

/**
 * Auth preference (Firebase-friendly):
 * 1) Fine-grained PAT via GITHUB_SUPPORT_AI_TOKEN (Contents:Read, Metadata:Read, single repo)
 * 2) GitHub App installation token via GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_INSTALLATION_ID
 *
 * Never log or return secret values.
 */
function readAuthFromEnv(env = process.env) {
  const token = String(env.GITHUB_SUPPORT_AI_TOKEN || '').trim();
  if (token) return { mode: 'pat', token };

  const appId = String(env.GITHUB_APP_ID || '').trim();
  const privateKey = String(env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const installationId = String(env.GITHUB_INSTALLATION_ID || '').trim();
  if (appId && privateKey && installationId) {
    return { mode: 'app', appId, privateKey, installationId };
  }
  return { mode: 'none' };
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createAppJwt({ appId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId
    })
  );
  const data = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  const sig = sign
    .sign(privateKey)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${sig}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function createGitHubClient({
  env = process.env,
  fetchImpl = fetch,
  authOverride = null,
  cache = null
} = {}) {
  const auth = authOverride || readAuthFromEnv(env);
  let installationToken = null;
  let installationTokenExpiresAt = 0;

  function configured() {
    return auth.mode === 'pat' || auth.mode === 'app';
  }

  async function getBearer() {
    if (auth.mode === 'pat') return auth.token;
    if (auth.mode !== 'app') throw Object.assign(new Error('github_auth_missing'), { code: 'github_auth_missing' });

    if (installationToken && Date.now() < installationTokenExpiresAt - 60_000) {
      return installationToken;
    }
    const jwt = createAppJwt({ appId: auth.appId, privateKey: auth.privateKey });
    const url = `https://api.github.com/app/installations/${auth.installationId}/access_tokens`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'midiai-support-ai'
        }
      },
      PRIVATE_SOURCE_CONFIG.searchTimeoutMs
    );
    if (!res.ok) {
      throw Object.assign(new Error('github_installation_token_failed'), {
        code: 'github_auth_failure',
        status: res.status
      });
    }
    const body = await res.json();
    installationToken = String(body.token || '');
    installationTokenExpiresAt = body.expires_at ? Date.parse(body.expires_at) : Date.now() + 50 * 60 * 1000;
    if (!installationToken) {
      throw Object.assign(new Error('github_installation_token_empty'), { code: 'github_auth_failure' });
    }
    return installationToken;
  }

  async function api(pathname, { method = 'GET', accept, timeoutMs } = {}) {
    const token = await getBearer();
    const url = pathname.startsWith('http') ? pathname : `https://api.github.com${pathname}`;
    const res = await fetchWithTimeout(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'midiai-support-ai'
        }
      },
      timeoutMs || PRIVATE_SOURCE_CONFIG.searchTimeoutMs
    );
    return res;
  }

  async function searchCode(query, { limit = 5 } = {}) {
    const q = String(query || '').trim();
    if (!q) return [];
    const full = `${q} repo:${repoSlug()}`;
    const cacheKey = `search:${PRIVATE_SOURCE_CONFIG.sourceRef}:${full}:${limit}`;
    if (cache) {
      const hit = cache.get(cacheKey);
      if (hit) return hit;
    }
    const res = await api(
      `/search/code?q=${encodeURIComponent(full)}&per_page=${Math.min(limit, 10)}`,
      {
        accept: 'application/vnd.github.text-match+json',
        timeoutMs: PRIVATE_SOURCE_CONFIG.searchTimeoutMs
      }
    );
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error('github_auth_failure'), {
        code: 'github_auth_failure',
        status: res.status
      });
    }
    if (!res.ok) {
      throw Object.assign(new Error('github_search_failed'), {
        code: 'github_api_error',
        status: res.status
      });
    }
    const body = await res.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const out = items.slice(0, limit).map((it) => {
      const path = String(it.path || '');
      let line = 1;
      const matches = it.text_matches || [];
      if (matches[0] && matches[0].fragment) {
        // GitHub does not always give line; default 1
        line = 1;
      }
      return { path, line, score: Number(it.score || 0) || 1, kind: 'github_search' };
    });
    if (cache) cache.set(cacheKey, out);
    return out;
  }

  async function getFileContent(filePath, { ref } = {}) {
    const refName = ref || PRIVATE_SOURCE_CONFIG.sourceRef;
    const cacheKey = `file:${refName}:${filePath}`;
    if (cache) {
      const hit = cache.get(cacheKey);
      if (hit) return hit;
    }
    const res = await api(
      `/repos/${repoSlug()}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(refName)}`,
      { timeoutMs: PRIVATE_SOURCE_CONFIG.fetchTimeoutMs }
    );
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error('github_auth_failure'), {
        code: 'github_auth_failure',
        status: res.status
      });
    }
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw Object.assign(new Error('github_fetch_failed'), {
        code: 'github_api_error',
        status: res.status
      });
    }
    const body = await res.json();
    if (body && body.encoding === 'base64' && body.content) {
      const buf = Buffer.from(String(body.content).replace(/\n/g, ''), 'base64');
      const result = { path: filePath, bytes: buf, size: buf.length, sha: body.sha || null };
      if (cache) cache.set(cacheKey, result);
      return result;
    }
    return null;
  }

  async function getPolicyJson() {
    const file = await getFileContent(PRIVATE_SOURCE_CONFIG.policyPath);
    if (!file || !file.bytes) {
      throw Object.assign(new Error('policy_fetch_failed'), { code: 'policy_fetch_failed' });
    }
    try {
      return JSON.parse(file.bytes.toString('utf8'));
    } catch (_) {
      throw Object.assign(new Error('policy_parse_failed'), { code: 'policy_fetch_failed' });
    }
  }

  return {
    configured,
    authMode: () => auth.mode,
    searchCode,
    getFileContent,
    getPolicyJson
  };
}

module.exports = {
  readAuthFromEnv,
  createGitHubClient
};
