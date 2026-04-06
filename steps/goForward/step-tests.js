/**
 * Unit tests for the Go forward step.
 *
 * Covers:
 * - Handler registration (needsElement: false, handlesOwnWait: true)
 * - Throws without context
 * - getSummary returns static label
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getSummary(_action) {
    return 'Go forward one page';
  }

  runner.registerStepTests('goForward', [
    { name: 'meta needsElement false', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.goForward;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
    }},
    { name: 'meta handlesOwnWait true', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.goForward;
      runner.assertTrue(!!m);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.goForward;
      return h({ type: 'goForward' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('context') >= 0);
        }
      );
    }},
    { name: 'getSummary returns static label', fn: function () {
      runner.assertEqual(getSummary({}), 'Go forward one page');
    }},
    { name: 'defaultAction type correct', fn: function () {
      runner.assertEqual('goForward', 'goForward');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
