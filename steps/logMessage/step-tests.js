(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('logMessage', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.logMessage === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
