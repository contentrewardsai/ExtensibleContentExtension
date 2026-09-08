/**
 * Whop auth bridge: listens for postMessage from the login page and forwards tokens to the background.
 * Injected on the login origin only (see manifest content_scripts matches).
 */
(function () {
  'use strict';

  if (window.__CFS_WHOP_AUTH_BRIDGE__) return;
  window.__CFS_WHOP_AUTH_BRIDGE__ = true;

  function isAllowedOrigin(origin) {
    if (typeof cfsIsTrustedAuthOrigin === 'function') return cfsIsTrustedAuthOrigin(origin);
    return false;
  }

  function extractLoginCode(data) {
    if (!data || typeof data !== 'object') return '';
    const candidates = [data.code, data.nonce, data.loginNonce, data.login_code, data.state];
    for (let i = 0; i < candidates.length; i++) {
      const v = candidates[i];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  }

  function reportLoginError(error) {
    const msg = error ? String(error) : 'STORE_TOKENS failed';
    try {
      console.warn('[CFS Whop auth]', msg);
    } catch (_) {}
    try {
      chrome.storage.local.set({
        cfs_whop_login_last_error: { at: Date.now(), error: msg },
      });
    } catch (_) {}
  }

  window.addEventListener('message', (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'WHOP_AUTH_SUCCESS') return;
    let { tokens, user } = data;
    if (!tokens || typeof tokens !== 'object') {
      if (data.access_token || data.accessToken) {
        tokens = {
          access_token: data.access_token || data.accessToken,
          refresh_token: data.refresh_token || data.refreshToken,
          expires_in: data.expires_in ?? data.expiresIn,
        };
      }
    }
    if (tokens && typeof tokens === 'object' && tokens.data && typeof tokens.data === 'object') {
      tokens = tokens.data;
    }
    if (!tokens || typeof tokens !== 'object') return;
    const hasAccess = !!(tokens.access_token || tokens.accessToken);
    if (!hasAccess) return;
    // The extension opened /extension/login?code=<nonce>; the page must echo that nonce back
    // explicitly (data.code / nonce / loginNonce / state) so the service worker can verify.
    // Do NOT read `code` from the page URL — after the Whop OAuth redirect that param holds
    // Whop's authorization code, not our nonce, which would fail verification.
    const code = extractLoginCode(data);
    chrome.runtime
      .sendMessage({
        type: 'STORE_TOKENS',
        tokens,
        user: user && typeof user === 'object' ? user : {},
        code,
      })
      .then((res) => {
        if (res && res.ok === false) {
          reportLoginError(res.error || 'STORE_TOKENS rejected');
          return;
        }
        try {
          chrome.storage.local.remove('cfs_whop_login_last_error');
        } catch (_) {}
      })
      .catch((e) => {
        reportLoginError((e && e.message) || e || 'STORE_TOKENS failed');
      });
  });
})();
