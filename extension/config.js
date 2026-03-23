/**
 * Extension config. Override APP_ORIGIN for local dev.
 * In dev: set APP_ORIGIN to http://localhost:3000
 * In prod: use https://www.extensiblecontent.com (from config/whop-auth.example.js or override whop-auth.js)
 */
(function (global) {
  'use strict';
  // Set to true to use localhost for API calls
  const USE_LOCAL_DEV = false;
  global.ExtensionConfig = {
    APP_ORIGIN: USE_LOCAL_DEV ? 'http://localhost:3000' : (typeof WhopAuthConfig !== 'undefined' ? WhopAuthConfig?.APP_ORIGIN : 'https://www.extensiblecontent.com'),
  };
})(typeof window !== 'undefined' ? window : self);
