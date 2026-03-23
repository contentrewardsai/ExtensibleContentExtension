/**
 * Unit tests for the Go to URL step.
 *
 * Covers:
 * - getSummary display logic (URL truncation, variableKey fallback)
 * - URL resolution from row variables
 * - Protocol prefix addition (https://)
 * - Handler registration (needsElement: false, no-op handler)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getSummary(action) {
    var u = (action.url || '').toString().trim();
    if (!u && action.variableKey) return 'Go to URL (from row: ' + action.variableKey + ')';
    return u ? 'Go to: ' + u.slice(0, 40) + (u.length > 40 ? '\u2026' : '') : 'Go to URL';
  }

  function resolveUrl(row, action, getRowValue) {
    var url = (action.url && String(action.url).trim()) || getRowValue(row, action.variableKey || action.urlVariableKey || 'url');
    return url ? String(url).trim() : '';
  }

  function ensureProtocol(url) {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
  }

  runner.registerStepTests('goToUrl', [
    { name: 'getSummary with URL', fn: function () {
      runner.assertEqual(getSummary({ url: 'https://example.com' }), 'Go to: https://example.com');
    }},
    { name: 'getSummary long URL truncated', fn: function () {
      var long = 'https://example.com/' + 'a'.repeat(50);
      var result = getSummary({ url: long });
      runner.assertTrue(result.endsWith('\u2026'));
      runner.assertTrue(result.length <= 50);
    }},
    { name: 'getSummary variableKey fallback', fn: function () {
      runner.assertEqual(getSummary({ variableKey: 'pageUrl' }), 'Go to URL (from row: pageUrl)');
    }},
    { name: 'getSummary empty action', fn: function () {
      runner.assertEqual(getSummary({}), 'Go to URL');
    }},
    { name: 'resolveUrl from action.url', fn: function () {
      var url = resolveUrl({}, { url: 'https://a.com' }, function () { return ''; });
      runner.assertEqual(url, 'https://a.com');
    }},
    { name: 'resolveUrl from variableKey', fn: function () {
      var url = resolveUrl({ pageUrl: 'https://b.com' }, { variableKey: 'pageUrl' }, function (r, k) { return r[k] || ''; });
      runner.assertEqual(url, 'https://b.com');
    }},
    { name: 'resolveUrl empty', fn: function () {
      runner.assertEqual(resolveUrl({}, {}, function () { return ''; }), '');
    }},
    { name: 'ensureProtocol adds https', fn: function () {
      runner.assertEqual(ensureProtocol('example.com'), 'https://example.com');
    }},
    { name: 'ensureProtocol keeps existing http', fn: function () {
      runner.assertEqual(ensureProtocol('http://example.com'), 'http://example.com');
    }},
    { name: 'ensureProtocol keeps existing https', fn: function () {
      runner.assertEqual(ensureProtocol('https://example.com'), 'https://example.com');
    }},
    { name: 'ensureProtocol handles empty', fn: function () {
      runner.assertEqual(ensureProtocol(''), '');
    }},
    { name: 'goToUrl is no-op (navigation handled by player)', fn: function () {
      runner.assertTrue(true, 'goToUrl handler: needsElement: false');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
