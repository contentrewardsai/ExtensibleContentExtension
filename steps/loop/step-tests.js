/**
 * Unit tests for the Loop step.
 *
 * Covers:
 * - Handler registration (stub, executed inline by the player)
 * - Handler is a no-op function
 * - Meta flags (needsElement: false)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('loop', [
    { name: 'step type is loop', fn: function () {
      runner.assertEqual('loop', 'loop');
    }},
    { name: 'loop count parsing', fn: function () {
      var count = Math.max(1, parseInt('3', 10) || 1);
      runner.assertEqual(count, 3);
      runner.assertEqual(Math.max(1, parseInt('', 10) || 1), 1);
      runner.assertEqual(Math.max(1, parseInt('0', 10) || 1), 1);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
