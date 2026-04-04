(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmIncreasePositionFromLiquidity', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY', 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
