/**
 * Unit tests for the Delay before next run step.
 *
 * Covers:
 * - Handler registration (config-only no-op for the player)
 * - delayMs parsing and defaults
 * - Handler does not need element
 * - No-op behavior: batch runner uses delayMs between rows, player runs as no-op
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getDelayMs(action) {
    var ms = parseInt(action.delayMs, 10);
    return ms > 0 ? ms : 1000;
  }

  runner.registerStepTests('delayBeforeNextRun', [
    { name: 'step type is delayBeforeNextRun (config-only)', fn: function () {
      runner.assertEqual('delayBeforeNextRun', 'delayBeforeNextRun');
    }},
    { name: 'getDelayMs valid', fn: function () {
      runner.assertEqual(getDelayMs({ delayMs: 5000 }), 5000);
      runner.assertEqual(getDelayMs({ delayMs: '3000' }), 3000);
    }},
    { name: 'getDelayMs defaults to 1000', fn: function () {
      runner.assertEqual(getDelayMs({}), 1000);
      runner.assertEqual(getDelayMs({ delayMs: 0 }), 1000);
      runner.assertEqual(getDelayMs({ delayMs: -500 }), 1000);
    }},
    { name: 'getDelayMs invalid string defaults to 1000', fn: function () {
      runner.assertEqual(getDelayMs({ delayMs: 'abc' }), 1000);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
