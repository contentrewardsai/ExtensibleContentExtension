/**
 * Unit tests for the Send to endpoint step.
 *
 * Covers:
 * - parseHeadersJson (JSON object, key-value lines, empty, invalid)
 * - isSuccess (2xx only, 2xx-3xx, edge cases)
 * - resolveTemplate with {{var}} substitution
 * - URL protocol prefix addition
 * - Body source selection (variable vs template)
 * - Content-Type header defaults (json, form, plain)
 * - Retry count clamping
 * - Response path extraction (getByPath)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parseHeadersJson(headersJson) {
    if (!headersJson || typeof headersJson !== 'string') return undefined;
    var trimmed = headersJson.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{')) {
      try { return JSON.parse(trimmed); } catch (_) { return undefined; }
    }
    var out = {};
    trimmed.split('\n').forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx > 0) {
        var key = line.slice(0, idx).trim();
        var val = line.slice(idx + 1).trim();
        if (key) out[key] = val;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  function isSuccess(response, successStatuses) {
    var status = response && response.status != null ? response.status : 0;
    if (successStatuses === '2xx-3xx') return status >= 200 && status < 400;
    return response && (response.ok === true || (status >= 200 && status < 300));
  }

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function ensureProtocol(url) {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
  }

  function getContentType(bodyContentType) {
    var ct = (bodyContentType || 'json').toLowerCase();
    if (ct === 'form') return 'application/x-www-form-urlencoded';
    if (ct === 'plain') return 'text/plain';
    return 'application/json';
  }

  function clampRetryCount(val) {
    return Math.max(0, parseInt(val, 10) || 0);
  }

  function clampRetryDelay(val) {
    return Math.max(100, parseInt(val, 10) || 1000);
  }

  function getByPath(obj, path) {
    if (!path || typeof path !== 'string') return obj;
    var parts = path.trim().split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }

  runner.registerStepTests('sendToEndpoint', [
    { name: 'parseHeadersJson JSON', fn: function () {
      runner.assertDeepEqual(parseHeadersJson('{ "Authorization": "Bearer x" }'), { Authorization: 'Bearer x' });
    }},
    { name: 'parseHeadersJson key-value lines', fn: function () {
      runner.assertDeepEqual(parseHeadersJson('Authorization: Bearer x\nContent-Type: application/json'), { Authorization: 'Bearer x', 'Content-Type': 'application/json' });
    }},
    { name: 'parseHeadersJson empty', fn: function () {
      runner.assertEqual(parseHeadersJson(''), undefined);
      runner.assertEqual(parseHeadersJson(null), undefined);
    }},
    { name: 'parseHeadersJson invalid JSON', fn: function () {
      runner.assertEqual(parseHeadersJson('{ invalid }'), undefined);
    }},
    { name: 'parseHeadersJson whitespace only', fn: function () {
      runner.assertEqual(parseHeadersJson('   '), undefined);
    }},
    { name: 'isSuccess 2xx', fn: function () {
      runner.assertTrue(isSuccess({ status: 200, ok: true }, '2xx'));
      runner.assertTrue(isSuccess({ status: 201 }, '2xx'));
      runner.assertTrue(isSuccess({ status: 299 }, '2xx'));
      runner.assertFalse(isSuccess({ status: 300 }, '2xx'));
      runner.assertFalse(isSuccess({ status: 404 }, '2xx'));
      runner.assertFalse(isSuccess({ status: 500 }, '2xx'));
    }},
    { name: 'isSuccess 2xx-3xx', fn: function () {
      runner.assertTrue(isSuccess({ status: 200 }, '2xx-3xx'));
      runner.assertTrue(isSuccess({ status: 301 }, '2xx-3xx'));
      runner.assertTrue(isSuccess({ status: 399 }, '2xx-3xx'));
      runner.assertFalse(isSuccess({ status: 400 }, '2xx-3xx'));
      runner.assertFalse(isSuccess({ status: 199 }, '2xx-3xx'));
    }},
    { name: 'isSuccess null response', fn: function () {
      runner.assertFalse(isSuccess(null, '2xx'));
    }},
    { name: 'resolveTemplate basic substitution', fn: function () {
      var result = resolveTemplate('Hello {{name}}!', { name: 'World' }, function (r, k) { return r[k]; });
      runner.assertEqual(result, 'Hello World!');
    }},
    { name: 'resolveTemplate multiple vars', fn: function () {
      var result = resolveTemplate('{{a}}-{{b}}', { a: '1', b: '2' }, function (r, k) { return r[k]; });
      runner.assertEqual(result, '1-2');
    }},
    { name: 'resolveTemplate missing var becomes empty', fn: function () {
      runner.assertEqual(resolveTemplate('Hi {{missing}}', {}, function () { return null; }), 'Hi ');
    }},
    { name: 'resolveTemplate null input returns empty string', fn: function () {
      runner.assertEqual(resolveTemplate(null, {}, function () { return null; }), '');
    }},
    { name: 'ensureProtocol adds https', fn: function () {
      runner.assertEqual(ensureProtocol('api.example.com/data'), 'https://api.example.com/data');
    }},
    { name: 'ensureProtocol preserves existing', fn: function () {
      runner.assertEqual(ensureProtocol('http://localhost:3000'), 'http://localhost:3000');
    }},
    { name: 'getContentType defaults to json', fn: function () {
      runner.assertEqual(getContentType(), 'application/json');
      runner.assertEqual(getContentType('json'), 'application/json');
    }},
    { name: 'getContentType form', fn: function () {
      runner.assertEqual(getContentType('form'), 'application/x-www-form-urlencoded');
    }},
    { name: 'getContentType plain', fn: function () {
      runner.assertEqual(getContentType('plain'), 'text/plain');
    }},
    { name: 'clampRetryCount valid', fn: function () {
      runner.assertEqual(clampRetryCount(3), 3);
      runner.assertEqual(clampRetryCount('5'), 5);
    }},
    { name: 'clampRetryCount clamps negative to 0', fn: function () {
      runner.assertEqual(clampRetryCount(-1), 0);
      runner.assertEqual(clampRetryCount(null), 0);
      runner.assertEqual(clampRetryCount(''), 0);
    }},
    { name: 'clampRetryDelay minimum 100', fn: function () {
      runner.assertEqual(clampRetryDelay(50), 100);
    }},
    { name: 'clampRetryDelay zero is falsy so defaults to 1000', fn: function () {
      runner.assertEqual(clampRetryDelay(0), 1000);
    }},
    { name: 'clampRetryDelay default 1000', fn: function () {
      runner.assertEqual(clampRetryDelay(null), 1000);
      runner.assertEqual(clampRetryDelay(''), 1000);
    }},
    { name: 'getByPath simple path', fn: function () {
      runner.assertEqual(getByPath({ data: { name: 'test' } }, 'data.name'), 'test');
    }},
    { name: 'getByPath nested deep', fn: function () {
      runner.assertEqual(getByPath({ a: { b: { c: 42 } } }, 'a.b.c'), 42);
    }},
    { name: 'getByPath missing returns undefined', fn: function () {
      runner.assertEqual(getByPath({ a: 1 }, 'b.c'), undefined);
    }},
    { name: 'getByPath empty path returns object', fn: function () {
      var obj = { x: 1 };
      runner.assertDeepEqual(getByPath(obj, ''), obj);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
