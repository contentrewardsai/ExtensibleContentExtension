(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumSwapStandard', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_SWAP_STANDARD', 'CFS_RAYDIUM_SWAP_STANDARD');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
