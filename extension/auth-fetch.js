/**
 * Shared Whop auth + REST fetch for extension API clients.
 * Load after extension/config.js (or Whop auth config), before extension/workflow-normalize.js and extension/api.js.
 * Requires shared/app-origin-guard.js (path + origin allowlists).
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = (typeof ExtensionConfig !== 'undefined' && ExtensionConfig?.APP_ORIGIN)
    ? String(ExtensionConfig.APP_ORIGIN).replace(/\/$/, '')
    : (typeof WhopAuthConfig !== 'undefined' && WhopAuthConfig?.APP_ORIGIN)
      ? WhopAuthConfig.APP_ORIGIN.replace(/\/$/, '')
      : 'https://www.extensiblecontent.com';

  async function sendLogout() {
    try {
      chrome.runtime.sendMessage({ type: 'LOGOUT' }, function () {});
    } catch (_) {}
  }

  /**
   * After 401: retry only if GET_TOKEN minted a *new* access token.
   * Same token (or no token) is not a reason to wipe the session.
   */
  async function retryTokenAfter401(previousToken) {
    const refreshed = await getToken();
    const next = refreshed && refreshed.token;
    if (next && next !== previousToken) return next;
    if (!next) await sendLogout();
    return null;
  }

  async function getToken() {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => {
          try {
            const le = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : '';
            if (le) {
              resolve({ ok: false, error: le });
              return;
            }
          } catch (_) {}
          resolve(r || {});
        });
      });
      if (res.ok === false && res.error) {
        return { token: null, error: res.error };
      }
      const token = res.access_token || res.token || null;
      return { token };
    } catch (e) {
      return { token: null, error: e?.message || 'Failed to get token' };
    }
  }

  function assertAllowedPath(path) {
    const check = typeof global.cfsIsAllowedAppFetchPath === 'function'
      ? global.cfsIsAllowedAppFetchPath(path)
      : { ok: false, error: 'App fetch allowlist unavailable' };
    if (!check.ok) {
      const err = new Error(check.error || 'Path not allowed');
      err.code = 'PATH_NOT_ALLOWED';
      throw err;
    }
    return check.path;
  }

  async function apiFetch(path, opts = {}) {
    const { requireAuth = true, logoutOn401 = true, ...fetchOpts } = opts;
    const allowedPath = assertAllowedPath(path);
    const { token, error } = await getToken();
    if (requireAuth && !token) {
      const err = new Error(error || 'Not logged in');
      err.code = 'NOT_LOGGED_IN';
      throw err;
    }
    const url = `${APP_ORIGIN}${allowedPath.startsWith('/') ? allowedPath : '/' + allowedPath}`;
    const isForm = typeof FormData !== 'undefined' && fetchOpts.body instanceof FormData;
    const headers = {
      ...(fetchOpts.headers || {}),
    };
    if (!isForm && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    async function doFetch(bearer) {
      const h = Object.assign({}, headers);
      if (bearer) h.Authorization = 'Bearer ' + bearer;
      else delete h.Authorization;
      return fetch(url, Object.assign({}, fetchOpts, { credentials: 'omit', headers: h }));
    }
    let res = await doFetch(token);
    if (res.status === 401 && requireAuth) {
      const newTok = logoutOn401 ? await retryTokenAfter401(token) : null;
      if (newTok) res = await doFetch(newTok);
      if (res.status === 401) {
        const err = new Error(logoutOn401
          ? 'Session expired. Please log in again.'
          : 'This source is not available with the extension login yet.');
        err.code = 'UNAUTHORIZED';
        err.status = 401;
        throw err;
      }
    } else if (res.status === 401 && !requireAuth) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      let msg = res.statusText || `HTTP ${res.status}`;
      try {
        const json = await res.json().catch(() => ({}));
        msg = json.message || json.error || json.msg || msg;
      } catch (_) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  global.ExtensionAuthFetch = {
    APP_ORIGIN,
    getToken,
    getAccessToken: getToken,
    retryTokenAfter401,
    sendLogout,
    apiFetch,
    assertAllowedPath,
  };
})(typeof window !== 'undefined' ? window : globalThis);
