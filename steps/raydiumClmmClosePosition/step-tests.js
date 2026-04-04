(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumClmmClosePosition', [
    { name: 'service message type', fn: function () {
      runner.assertEqual('CFS_RAYDIUM_CLMM_CLOSE_POSITION', 'CFS_RAYDIUM_CLMM_CLOSE_POSITION');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
