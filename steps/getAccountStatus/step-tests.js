(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getAccountStatus', [
    { name: 'GET_ACCOUNT_STATUS message shape', fn: function () {
      var m = { type: 'GET_ACCOUNT_STATUS' };
      runner.assertEqual(m.type, 'GET_ACCOUNT_STATUS');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getAccountStatus === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
