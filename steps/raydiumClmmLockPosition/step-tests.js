(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmLockPosition', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_LOCK_POSITION', 'CFS_RAYDIUM_CLMM_LOCK_POSITION');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
