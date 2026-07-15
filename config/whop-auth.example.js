/**
 * Default Whop OAuth URLs for the extension (committed). Copy to whop-auth.js to override locally.
 * Side panel loads this file first, then optional whop-auth.js (gitignored) if present.
 * APP_ORIGIN: backend base URL. For dev, use http://localhost:3000; for prod, https://www.extensiblecontent.com
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = 'https://www.extensiblecontent.com';

  const CONTENT_REWARDS_AI_URL =
    'https://whop.com/joined/content-rewards-ai/content-rewards-ai-1TBjBWdmGMbjk4/app/';

  function getLoginUrl() {
    return `${APP_ORIGIN.replace(/\/$/, '')}/extension/login`;
  }

  global.WhopAuthConfig = {
    APP_ORIGIN,
    CONTENT_REWARDS_AI_URL,
    getLoginUrl,
  };
})(typeof window !== 'undefined' ? window : self);
