(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterFuturesAccount', [
    { name: 'message category account', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'account' };
      runner.assertEqual(m.asterCategory, 'account');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
