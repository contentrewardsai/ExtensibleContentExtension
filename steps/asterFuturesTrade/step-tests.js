(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('asterFuturesTrade', [
    { name: 'message category trade', fn: function () {
      var m = { type: 'CFS_ASTER_FUTURES', asterCategory: 'trade' };
      runner.assertEqual(m.asterCategory, 'trade');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
