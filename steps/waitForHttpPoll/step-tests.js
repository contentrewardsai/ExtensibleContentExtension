/**
 * Unit tests for waitForHttpPoll helper logic (mirrors handler.js).
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getByPath(obj, pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return obj;
    var parts = pathStr.trim().split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }

  function parseHeadersJson(headersJson) {
    if (!headersJson || typeof headersJson !== 'string') return undefined;
    var trimmed = headersJson.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        return undefined;
      }
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

  function mergePayloadIntoRow(row, payload) {
    if (!row || typeof row !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = payload[k];
      if (v !== undefined) row[k] = v;
    }
  }

  function isHttpPollSuccess(res) {
    if (!res || res.ok === false) return false;
    var st = res.status != null ? res.status : 0;
    return st >= 200 && st < 300;
  }

  function isPendingResponse(action, json) {
    var pf = (action.pendingField || '').trim();
    if (!pf || json == null || typeof json !== 'object') return false;
    var val = getByPath(json, pf);
    var expected = action.pendingValue;
    if (expected == null || String(expected).trim() === '') return false;
    return String(val) === String(expected).trim();
  }

  runner.registerStepTests('waitForHttpPoll', [
    { name: 'parseHeadersJson JSON', fn: function () {
      runner.assertDeepEqual(parseHeadersJson('{ "X-Key": "v" }'), { 'X-Key': 'v' });
    }},
    { name: 'parseHeadersJson lines', fn: function () {
      runner.assertDeepEqual(parseHeadersJson('A: 1\nB: 2'), { A: '1', B: '2' });
    }},
    { name: 'isHttpPollSuccess', fn: function () {
      runner.assertTrue(isHttpPollSuccess({ ok: true, status: 200 }));
      runner.assertFalse(isHttpPollSuccess({ ok: false, status: 200 }));
      runner.assertFalse(isHttpPollSuccess({ ok: true, status: 404 }));
    }},
    { name: 'isPendingResponse dot path', fn: function () {
      var j = { meta: { state: 'pending' } };
      runner.assertTrue(isPendingResponse({ pendingField: 'meta.state', pendingValue: 'pending' }, j));
      runner.assertFalse(isPendingResponse({ pendingField: 'meta.state', pendingValue: 'done' }, j));
    }},
    { name: 'mergePayloadIntoRow shallow', fn: function () {
      var row = { a: 1 };
      mergePayloadIntoRow(row, { b: 2, a: 3 });
      runner.assertEqual(row.a, 3);
      runner.assertEqual(row.b, 2);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
