(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterSpotTrade', [
    { name: 'message category', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotTrade', operation: 'order' };
      runner.assertEqual(m.asterCategory, 'spotTrade');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
