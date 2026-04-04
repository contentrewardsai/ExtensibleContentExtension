(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumCpmmAddLiquidity', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CPMM_ADD_LIQUIDITY', 'CFS_RAYDIUM_CPMM_ADD_LIQUIDITY');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
