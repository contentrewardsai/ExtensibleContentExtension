(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterSpotMarket', [
    { name: 'CFS_ASTER_FUTURES spotMarket', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotMarket', operation: 'ping' };
      runner.assertEqual(m.asterCategory, 'spotMarket');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
