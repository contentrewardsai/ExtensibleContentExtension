/**
 * Unit tests for the Wait step.
 *
 * Covers:
 * - computeDuration logic (durationMin/durationMax range, fallback)
 * - waitFor mode detection (time, element, generationComplete)
 * - Timeout clamping for element and generationComplete modes
 * - Default duration fallback
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function computeDuration(action) {
    if (action.durationMin != null && action.durationMax != null) {
      var min = Math.min(action.durationMin, action.durationMax);
      var max = Math.max(action.durationMin, action.durationMax);
      return min === max ? min : Math.floor(min + Math.random() * (max - min + 1));
    }
    return action.duration || 1000;
  }

  function getWaitMode(action) {
    if (action.waitFor === 'generationComplete') return 'generationComplete';
    if (action.waitFor === 'element' && action.waitForSelectors && action.waitForSelectors.length) return 'element';
    return 'time';
  }

  function getGenerationCompleteTimeout(action) {
    return Math.max(action.durationMax || action.duration || 120000, 10000);
  }

  function getElementTimeout(action) {
    return Math.max(action.durationMax || action.duration || 30000, 5000);
  }

  runner.registerStepTests('wait', [
    { name: 'duration when both min and max equal', fn: function () {
      runner.assertEqual(computeDuration({ durationMin: 500, durationMax: 500 }), 500);
    }},
    { name: 'duration in range', fn: function () {
      for (var i = 0; i < 20; i++) {
        var d = computeDuration({ durationMin: 100, durationMax: 200 });
        runner.assertTrue(d >= 100 && d <= 200, 'duration in range');
      }
    }},
    { name: 'duration min > max swaps correctly', fn: function () {
      for (var i = 0; i < 10; i++) {
        var d = computeDuration({ durationMin: 500, durationMax: 100 });
        runner.assertTrue(d >= 100 && d <= 500, 'swapped range');
      }
    }},
    { name: 'duration fallback to action.duration', fn: function () {
      runner.assertEqual(computeDuration({ duration: 3000 }), 3000);
    }},
    { name: 'duration fallback default 1000', fn: function () {
      runner.assertEqual(computeDuration({}), 1000);
    }},
    { name: 'getWaitMode generationComplete', fn: function () {
      runner.assertEqual(getWaitMode({ waitFor: 'generationComplete' }), 'generationComplete');
    }},
    { name: 'getWaitMode element with selectors', fn: function () {
      runner.assertEqual(getWaitMode({ waitFor: 'element', waitForSelectors: ['.done'] }), 'element');
    }},
    { name: 'getWaitMode element without selectors falls back to time', fn: function () {
      runner.assertEqual(getWaitMode({ waitFor: 'element', waitForSelectors: [] }), 'time');
    }},
    { name: 'getWaitMode default is time', fn: function () {
      runner.assertEqual(getWaitMode({}), 'time');
    }},
    { name: 'generationComplete timeout clamps to 10000 minimum', fn: function () {
      runner.assertEqual(getGenerationCompleteTimeout({ duration: 5000 }), 10000);
    }},
    { name: 'generationComplete timeout uses duration when larger', fn: function () {
      runner.assertEqual(getGenerationCompleteTimeout({ duration: 60000 }), 60000);
    }},
    { name: 'generationComplete timeout default is 120000', fn: function () {
      runner.assertEqual(getGenerationCompleteTimeout({}), 120000);
    }},
    { name: 'element timeout clamps to 5000 minimum', fn: function () {
      runner.assertEqual(getElementTimeout({ duration: 2000 }), 5000);
    }},
    { name: 'element timeout uses duration when larger', fn: function () {
      runner.assertEqual(getElementTimeout({ duration: 30000 }), 30000);
    }},
    { name: 'element timeout default is 30000', fn: function () {
      runner.assertEqual(getElementTimeout({}), 30000);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
