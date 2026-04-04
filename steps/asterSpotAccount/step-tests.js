(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterSpotAccount', [
    { name: 'message category', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'spotAccount', operation: 'account' };
      runner.assertEqual(m.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(m.asterCategory, 'spotAccount');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
