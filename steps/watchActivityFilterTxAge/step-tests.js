/**
 * Unit tests for watchActivityFilterTxAge — payload parse and block time helpers.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parseActivityPayload(raw) {
    if (raw == null || raw === '') return null;
    var s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function blockTimeUnixSec(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.targetBlockTimeUnix != null && Number.isFinite(Number(row.targetBlockTimeUnix))) {
      return Number(row.targetBlockTimeUnix);
    }
    if (row.timeStamp != null && String(row.timeStamp).trim() !== '') {
      var ts = parseInt(String(row.timeStamp).trim(), 10);
      if (Number.isFinite(ts) && ts > 0) return ts;
    }
    return null;
  }

  runner.registerStepTests('watchActivityFilterTxAge', [
    { name: 'parseActivityPayload valid', fn: function () {
      var p = parseActivityPayload('{"activity":[{"x":1}],"count":1}');
      runner.assertTrue(p && Array.isArray(p.activity) && p.activity.length === 1);
    }},
    { name: 'parseActivityPayload invalid', fn: function () {
      runner.assertEqual(parseActivityPayload('not json'), null);
    }},
    { name: 'blockTimeUnixSec solana field', fn: function () {
      runner.assertEqual(blockTimeUnixSec({ targetBlockTimeUnix: 123 }), 123);
    }},
    { name: 'blockTimeUnixSec BSC timeStamp', fn: function () {
      runner.assertEqual(blockTimeUnixSec({ timeStamp: '999' }), 999);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
