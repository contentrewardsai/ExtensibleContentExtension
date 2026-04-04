(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterFuturesMarket', [
    { name: 'message category market', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'market', operation: 'time' };
      runner.assertEqual(m.asterCategory, 'market');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
