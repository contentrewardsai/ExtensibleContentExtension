(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmIncreasePosition', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE', 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
