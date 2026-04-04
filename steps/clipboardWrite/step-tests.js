/**
 * clipboardWrite: validate handler contract (clipboard API not mocked — see clipboardRead tests).
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('clipboardWrite', [
    { name: 'meta needsElement false', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.clipboardWrite;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.clipboardWrite;
      return h({ text: 'x' }, {}).then(
        function () {
          throw new Error('expected throw');
        },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('context') >= 0);
        }
      );
    }},
    { name: 'resolveTemplate path for row vars', fn: function () {
      var resolve = global.CFS_templateResolver && global.CFS_templateResolver.resolveTemplate;
      if (!resolve) throw new Error('CFS_templateResolver not loaded');
      var row = { token: 'abc' };
      function gv(r, k) {
        return r[k];
      }
      runner.assertEqual(resolve('t={{token}}', row, gv, {}), 't=abc');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
