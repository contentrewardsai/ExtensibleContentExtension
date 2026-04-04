(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmCollectReward', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_COLLECT_REWARD', 'CFS_RAYDIUM_CLMM_COLLECT_REWARD');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
