(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('raydiumAddLiquidity', [
    { name: 'message type', fn: function () {
      runner.assertEqual({ type: 'CFS_RAYDIUM_ADD_LIQUIDITY', fixedSide: 'a' }.type, 'CFS_RAYDIUM_ADD_LIQUIDITY');
    }},
    { name: 'fixedSide normalized', fn: function () {
      function norm(x) { return String(x || 'a').trim().toLowerCase(); }
      runner.assertEqual(norm('B'), 'b');
      runner.assertEqual(norm(undefined), 'a');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
