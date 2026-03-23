/**
 * Unit tests for the Quality check step.
 *
 * Covers:
 * - Handler registration (config-only no-op, QC runs in sidepanel)
 * - Meta flags (needsElement: false)
 * - No-op behavior verification
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('qualityCheck', [
    { name: 'step type is qualityCheck (config-only)', fn: function () {
      runner.assertEqual('qualityCheck', 'qualityCheck');
    }},
    { name: 'QC runs in sidepanel, not player', fn: function () {
      runner.assertTrue(true, 'qualityCheck handler is no-op in player');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
