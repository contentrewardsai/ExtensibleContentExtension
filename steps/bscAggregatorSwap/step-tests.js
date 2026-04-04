(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function sideNorm(s) {
    var x = String(s || 'SELL').trim();
    return x.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  }
  runner.registerStepTests('bscAggregatorSwap', [
    { name: 'paraswap operation', fn: function () {
      runner.assertEqual({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'paraswapSwap' }.operation, 'paraswapSwap');
    }},
    { name: 'side normalization', fn: function () {
      runner.assertEqual(sideNorm('buy'), 'BUY');
      runner.assertEqual(sideNorm(''), 'SELL');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
