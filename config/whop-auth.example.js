/**
 * Default Whop OAuth URLs for the extension (committed). Copy to whop-auth.js to override locally.
 * Side panel loads this file first, then optional whop-auth.js (gitignored) if present.
 * APP_ORIGIN: backend base URL. For dev, use http://localhost:3000; for prod, https://www.extensiblecontent.com
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = 'https://www.extensiblecontent.com';

  function getLoginUrl() {
    return `${APP_ORIGIN.replace(/\/$/, '')}/extension/login`;
  }

  global.WhopAuthConfig = {
    APP_ORIGIN,
    getLoginUrl,
  };
})(typeof window !== 'undefined' ? window : self);
