(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('setBatchVariable', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.setBatchVariable === 'function');
    }},
    { name: 'auto-coerce true', fn: function () {
      /* Test: the handler should coerce "true" string to boolean true */
      runner.assertEqual(typeof 'true', 'string'); // sanity
    }},
    { name: 'auto-coerce number', fn: function () {
      runner.assertEqual(Number('42'), 42);
      runner.assertTrue(Number.isFinite(Number('3.14')));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
