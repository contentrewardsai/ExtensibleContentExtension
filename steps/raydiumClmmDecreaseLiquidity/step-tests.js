(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmDecreaseLiquidity', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY', 'CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
