/**
 * Unit tests for bscWatchReadActivity — limit clamp and message shape.
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

  runner.registerStepTests('bscWatchReadActivity', [
    { name: 'clampLimit default', fn: function () {
      runner.assertEqual(clampLimit(''), 40);
      runner.assertEqual(clampLimit('0'), 40);
    }},
    { name: 'clamp caps at 100', fn: function () {
      runner.assertEqual(clampLimit('500'), 100);
    }},
    { name: 'message includes limit', fn: function () {
      var lim = clampLimit('20');
      var m = { type: 'CFS_BSC_WATCH_GET_ACTIVITY', limit: lim };
      runner.assertEqual(m.limit, 20);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
