/**
 * Whop auth bridge: listens for postMessage from the login page and forwards tokens to the background.
 * Injected on all extensiblecontent.com pages and localhost (OAuth often redirects outside /extension/*).
 */
(function () {
  'use strict';

  if (window.__CFS_WHOP_AUTH_BRIDGE__) return;
  window.__CFS_WHOP_AUTH_BRIDGE__ = true;

  const ALLOWED_ORIGINS = [
    'https://www.extensiblecontent.com',
    'https://extensiblecontent.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  function isAllowedOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    if (ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed + '/'))) {
      return true;
    }
    try {
      const u = new URL(origin);
      if (u.protocol === 'https:' && (u.hostname === 'extensiblecontent.com' || u.hostname.endsWith('.extensiblecontent.com'))) {
        return true;
      }
    } catch (_) {}
    return false;
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
    chrome.runtime.sendMessage({
      type: 'STORE_TOKENS',
      tokens,
      user: user && typeof user === 'object' ? user : {},
    }).catch(() => {});
  });
})();
