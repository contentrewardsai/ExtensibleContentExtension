/**
 * Default Whop OAuth URLs for the extension (committed). Edit config/whop-auth.js to override locally.
 * Side panel / Settings load this file first, then config/whop-auth.js (external script tags; MV3 CSP).
 * APP_ORIGIN: backend base URL. For dev, use http://localhost:3000; for prod, https://www.extensiblecontent.com
 * The /extension/login page is served by the same app on both extensiblecontent.com and
 * contentrewardsai.com and now uses the Content Rewards AI design. We keep the OAuth flow on
 * APP_ORIGIN so the Whop redirect_uri matches the registered one and the token exchange backend.
 * getLoginUrl(code, extId): the side panel generates a one-time nonce and passes it as ?code=<nonce>,
 * plus the extension id as ?ext_id=<chrome.runtime.id>. The login page must carry the code through the
 * OAuth round-trip (e.g. in `state`) and echo it back with the tokens (postMessage `code` /
 * STORE_TOKENS `code`) so the service worker can verify the response matches the login it started.
 * The ext_id lets the page deliver tokens directly via chrome.runtime.sendMessage(ext_id, { type:
 * 'STORE_TOKENS', ... }) through externally_connectable, in addition to the postMessage bridge.
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = 'https://www.extensiblecontent.com';

  const CONTENT_REWARDS_AI_URL =
    'https://whop.com/joined/content-rewards-ai/content-rewards-ai-1TBjBWdmGMbjk4/app/';

  function getLoginUrl(code, extId) {
    const base = `${APP_ORIGIN.replace(/\/$/, '')}/extension/login`;
    const params = new URLSearchParams();
    const c = code == null ? '' : String(code).trim();
    if (c) params.set('code', c);
    const e = extId == null ? '' : String(extId).trim();
    if (e) params.set('ext_id', e);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  global.WhopAuthConfig = {
    APP_ORIGIN,
    CONTENT_REWARDS_AI_URL,
    getLoginUrl,
  };
})(typeof window !== 'undefined' ? window : self);
