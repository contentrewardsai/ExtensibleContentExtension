(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('getShotstackRenders', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getShotstackRenders === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
