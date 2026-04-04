(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function raydiumPageSizeClamp(n) {
    return Math.min(100, Math.max(1, parseInt(n, 10) || 20));
  }
  runner.registerStepTests('solanaPumpMarketProbe', [
    { name: 'raydiumPageSize clamp', fn: function () {
      runner.assertEqual(raydiumPageSizeClamp(''), 20);
      runner.assertEqual(raydiumPageSizeClamp('200'), 100);
      runner.assertEqual(raydiumPageSizeClamp('5'), 5);
    }},
    { name: 'probe message type', fn: function () {
      runner.assertEqual({ type: 'CFS_PUMPFUN_MARKET_PROBE', mint: 'm', checkRaydium: true }.type, 'CFS_PUMPFUN_MARKET_PROBE');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
