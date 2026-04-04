/**
 * clipboardRead: validate handler contract (navigator.clipboard is not mockable in some headless runs).
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('clipboardRead', [
    { name: 'meta needsElement false', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.clipboardRead;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.clipboardRead;
      return h({ saveAsVariable: 'x' }, {}).then(
        function () {
          throw new Error('expected throw');
        },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('context') >= 0);
        }
      );
    }},
    { name: 'throws without saveAsVariable', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.clipboardRead;
      return h({}, { ctx: { currentRow: {} } }).then(
        function () {
          throw new Error('expected throw');
        },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('saveAsVariable') >= 0);
        }
      );
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
