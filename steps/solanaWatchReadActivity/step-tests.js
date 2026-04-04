/**
 * Unit tests for solanaWatchReadActivity — limit clamp and message type.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function clampLimit(limitStr) {
    var limit = parseInt(limitStr, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 40;
    if (limit > 100) limit = 100;
    return limit;
  }

  runner.registerStepTests('solanaWatchReadActivity', [
    { name: 'clampLimit', fn: function () {
      runner.assertEqual(clampLimit(''), 40);
      runner.assertEqual(clampLimit('200'), 100);
    }},
    { name: 'message shape', fn: function () {
      var m = { type: 'CFS_SOLANA_WATCH_GET_ACTIVITY', limit: clampLimit('10') };
      runner.assertEqual(m.type, 'CFS_SOLANA_WATCH_GET_ACTIVITY');
      runner.assertEqual(m.limit, 10);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
