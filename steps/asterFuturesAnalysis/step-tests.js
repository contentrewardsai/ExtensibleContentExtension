(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterFuturesAnalysis', [
    { name: 'message category analysis', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'analysis' };
      runner.assertEqual(m.asterCategory, 'analysis');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
