/**
 * App origin + backend path guards for the extension client.
 * Loaded in the service worker, side panel, settings, unit tests, Whop auth bridge, and MCP relay.
 */
(function (global) {
  'use strict';

  var TRUSTED_AUTH_ORIGINS = [
    'https://www.extensiblecontent.com',
    'https://extensiblecontent.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  var APP_FETCH_EXACT_PATHS = {
    '/api/box/connections': true,
    '/api/box/browse': true,
    '/api/box/download-url': true,
    '/api/box/upload-token': true,
    '/api/box/auth/start': true,
    '/api/ghl/locations/mine': true,
    '/api/ghl/media/browse': true,
    '/api/ghl/media/browse-shared': true,
    '/api/ghl/media/upload-target': true,
    '/api/ghl/media/create-folder': true,
    '/api/ghl/media/delete': true,
    '/api/ghl/auth/start': true,
    '/api/whop/shared-ghl-upload-target': true,
  };

  var MCP_RELAY_ALLOWED_REQ = {
    STORAGE_READ: true,
    STORAGE_WRITE: true,
    RELOAD_EXTENSION: true,
    FETCH_URL: true,
    BACKEND_FETCH: true,
    MESSAGE: true,
  };

  var MCP_RELAY_DENIED_MESSAGE_TYPES = {
    GET_TOKEN: true,
    STORE_TOKENS: true,
    LOGOUT: true,
  };

  function cfsIsTrustedAuthPageUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      var u = new URL(urlStr);
      var origin = u.origin;
      for (var i = 0; i < TRUSTED_AUTH_ORIGINS.length; i++) {
        if (origin === TRUSTED_AUTH_ORIGINS[i]) return true;
      }
    } catch (_) {}
    return false;
  }

  function cfsIsTrustedAuthOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    for (var i = 0; i < TRUSTED_AUTH_ORIGINS.length; i++) {
      if (origin === TRUSTED_AUTH_ORIGINS[i]) return true;
    }
    return false;
  }

  function stripPathQuery(path) {
    var p = String(path || '').trim();
    var q = p.indexOf('?');
    if (q >= 0) p = p.slice(0, q);
    var h = p.indexOf('#');
    if (h >= 0) p = p.slice(0, h);
    return p;
  }

  /**
   * @returns {{ ok: true, path: string } | { ok: false, error: string }}
   */
  function cfsIsAllowedAppFetchPath(path) {
    var raw = String(path || '').trim();
    if (!raw) return { ok: false, error: 'path required' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) {
      return { ok: false, error: 'path must be relative to the backend origin (no scheme)' };
    }
    var p = raw.charAt(0) === '/' ? raw : '/' + raw;
    if (p.indexOf('..') !== -1) return { ok: false, error: 'path must not contain ..' };
    var pathname = stripPathQuery(p);
    if (pathname.indexOf('/api/extension/') === 0) return { ok: true, path: p };
    if (APP_FETCH_EXACT_PATHS[pathname]) return { ok: true, path: p };
    return { ok: false, error: 'path is not an allowed extension backend route' };
  }

  function cfsIsAllowedMcpBundledPath(urlPath) {
    var raw = String(urlPath || '').trim();
    if (!raw) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) return false;
    raw = raw.replace(/^\/+/, '');
    if (raw.indexOf('..') !== -1 || raw.indexOf('\\') !== -1) return false;
    return raw.indexOf('steps/') === 0 || raw.indexOf('workflows/') === 0;
  }

  function cfsIsAllowedMcpRelayReqType(reqType) {
    return !!(reqType && MCP_RELAY_ALLOWED_REQ[String(reqType)]);
  }

  function cfsIsDeniedMcpRelayMessageType(msgType) {
    return !!(msgType && MCP_RELAY_DENIED_MESSAGE_TYPES[String(msgType)]);
  }

  global.cfsIsTrustedAuthPageUrl = cfsIsTrustedAuthPageUrl;
  global.cfsIsTrustedAuthOrigin = cfsIsTrustedAuthOrigin;
  global.cfsWhopIsTrustedAuthPageUrl = cfsIsTrustedAuthPageUrl;
  global.cfsIsAllowedAppFetchPath = cfsIsAllowedAppFetchPath;
  global.cfsIsAllowedMcpBundledPath = cfsIsAllowedMcpBundledPath;
  global.cfsIsAllowedMcpRelayReqType = cfsIsAllowedMcpRelayReqType;
  global.cfsIsDeniedMcpRelayMessageType = cfsIsDeniedMcpRelayMessageType;
  global.CFS_TRUSTED_AUTH_ORIGINS = TRUSTED_AUTH_ORIGINS.slice();
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
