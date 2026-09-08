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

  function decodeUntilStable(s) {
    var cur = String(s || '');
    var i;
    for (i = 0; i < 5; i++) {
      var next;
      try {
        next = decodeURIComponent(cur);
      } catch (_) {
        return null;
      }
      if (next === cur) return cur;
      cur = next;
    }
    return null;
  }

  /**
   * @returns {{ ok: true, path: string, pathname: string } | { ok: false, error: string }}
   */
  function inspectAppFetchPath(path) {
    var raw = String(path || '').trim();
    if (!raw) return { ok: false, error: 'path required' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) {
      return { ok: false, error: 'path must be relative to the backend origin (no scheme)' };
    }
    if (raw.indexOf('\\') !== -1) return { ok: false, error: 'path must not contain backslash' };
    var p = raw.charAt(0) === '/' ? raw : '/' + raw;
    var pathname = stripPathQuery(p);
    var decoded = decodeUntilStable(pathname);
    if (decoded == null) return { ok: false, error: 'path is not a valid encoding' };
    if (pathname.indexOf('..') !== -1 || decoded.indexOf('..') !== -1) {
      return { ok: false, error: 'path must not contain ..' };
    }
    if (decoded.indexOf('\\') !== -1) return { ok: false, error: 'path must not contain backslash' };
    if (decoded.indexOf('//') !== -1) return { ok: false, error: 'path must not contain //' };
    return { ok: true, path: p, pathname: decoded };
  }

  /**
   * @returns {{ ok: true, path: string } | { ok: false, error: string }}
   */
  function cfsIsAllowedAppFetchPath(path) {
    var inspected = inspectAppFetchPath(path);
    if (!inspected.ok) return inspected;
    if (inspected.pathname.indexOf('/api/extension/') === 0) return { ok: true, path: inspected.path };
    if (APP_FETCH_EXACT_PATHS[inspected.pathname]) return { ok: true, path: inspected.path };
    return { ok: false, error: 'path is not an allowed extension backend route' };
  }

  /**
   * MCP BACKEND_FETCH is narrower than the client allowlist: /api/extension/ only
   * (library Box/GHL responses include third-party tokens).
   * @returns {{ ok: true, path: string } | { ok: false, error: string }}
   */
  function cfsIsAllowedMcpBackendFetchPath(path) {
    var inspected = inspectAppFetchPath(path);
    if (!inspected.ok) return inspected;
    if (inspected.pathname.indexOf('/api/extension/') === 0) return { ok: true, path: inspected.path };
    return { ok: false, error: 'path must start with /api/extension/' };
  }

  function cfsIsAllowedMcpBundledPath(urlPath) {
    var raw = String(urlPath || '').trim();
    if (!raw) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) return false;
    raw = raw.replace(/^\/+/, '');
    if (raw.indexOf('\\') !== -1) return false;
    var decoded = decodeUntilStable(raw);
    if (decoded == null) return false;
    if (raw.indexOf('..') !== -1 || decoded.indexOf('..') !== -1) return false;
    if (decoded.indexOf('\\') !== -1) return false;
    return decoded.indexOf('steps/') === 0 || decoded.indexOf('workflows/') === 0;
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
  global.cfsIsAllowedMcpBackendFetchPath = cfsIsAllowedMcpBackendFetchPath;
  global.cfsIsAllowedMcpBundledPath = cfsIsAllowedMcpBundledPath;
  global.cfsIsAllowedMcpRelayReqType = cfsIsAllowedMcpRelayReqType;
  global.cfsIsDeniedMcpRelayMessageType = cfsIsDeniedMcpRelayMessageType;
  global.CFS_TRUSTED_AUTH_ORIGINS = TRUSTED_AUTH_ORIGINS.slice();
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
