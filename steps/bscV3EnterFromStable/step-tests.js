/**
 * Unit tests for bscV3EnterFromStable — registration + meta.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_STEP_TEST_RUNNER;
  if (!runner) return;

  runner.registerStepTests('bscV3EnterFromStable', [
    { name: 'handler registered', fn: function() {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers.bscV3EnterFromStable === 'function'
      );
    }},
    { name: 'meta marks no element needed', fn: function() {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.bscV3EnterFromStable;
      runner.assertTrue(!!m, 'meta present');
      runner.assertEqual(m.needsElement, false);
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
