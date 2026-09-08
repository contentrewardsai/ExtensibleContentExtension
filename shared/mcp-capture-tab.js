/**
 * Helpers for CAPTURE_VISIBLE_TAB / capture_tab_screenshot.
 * Loaded in the service worker (importScripts) and unit-tests.html.
 */
(function (global) {
  'use strict';

  var INLINE_MAX_CHARS = 180000;

  var LIMITS = {
    viewportOnly: true,
    iframesAsRenderedPixels: true,
    notFullPage: true,
    note:
      'chrome.tabs.captureVisibleTab captures the visible viewport of a window only. ' +
      'A background tab is activated first. Cross-origin iframes appear as already-rendered pixels, not as a separate DOM.',
  };

  function optionalNonNegInt(v, name) {
    if (v == null || v === '') return { ok: true, value: null };
    var n = Number(v);
    if (!Number.isFinite(n) || n !== Math.floor(n) || n < 0) {
      return { ok: false, error: name + ' must be a non-negative integer when set' };
    }
    return { ok: true, value: n };
  }

  function shouldInlineDataUrl(dataUrl, maxChars) {
    var max = maxChars != null ? Number(maxChars) : INLINE_MAX_CHARS;
    if (!Number.isFinite(max) || max < 1) max = INLINE_MAX_CHARS;
    return typeof dataUrl === 'string' && dataUrl.length <= max;
  }

  function splitDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
      return { ok: false, error: 'expected a data URL' };
    }
    var comma = dataUrl.indexOf(',');
    if (comma < 0) return { ok: false, error: 'malformed data URL' };
    var meta = dataUrl.slice(5, comma);
    var payload = dataUrl.slice(comma + 1);
    var isBase64 = /;base64/i.test(meta);
    var mime = (meta.split(';')[0] || 'image/png').trim() || 'image/png';
    return { ok: true, mime: mime, base64: isBase64 ? payload : null, payload: payload, isBase64: isBase64 };
  }

  function projectRelativePath(tabId, nowMs) {
    var t = nowMs != null ? nowMs : Date.now();
    var id = tabId != null ? String(tabId) : 'active';
    id = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) id = 'active';
    return 'uploads/mcp-screenshots/tab-' + id + '-' + t + '.png';
  }

  global.CFS_mcpCaptureTab = {
    INLINE_MAX_CHARS: INLINE_MAX_CHARS,
    LIMITS: LIMITS,
    optionalNonNegInt: optionalNonNegInt,
    shouldInlineDataUrl: shouldInlineDataUrl,
    splitDataUrl: splitDataUrl,
    projectRelativePath: projectRelativePath,
  };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
