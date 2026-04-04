(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumRemoveLiquidity', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_REMOVE_LIQUIDITY', 'CFS_RAYDIUM_REMOVE_LIQUIDITY');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
