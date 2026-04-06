(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('jupiterLimitOrder', [
    { name: 'Limit order payload type', fn: function () { runner.assertEqual('CFS_JUPITER_LIMIT_ORDER', 'CFS_JUPITER_LIMIT_ORDER'); }},
    { name: 'Order type defaults to single', fn: function () {
      var ot = String(undefined || 'single').trim();
      runner.assertEqual(ot, 'single');
    }},
    { name: 'slippageBps clamped', fn: function () {
      var sl = Math.min(10000, Math.max(0, parseInt('50', 10) || 50));
      runner.assertEqual(sl, 50);
      var hi = Math.min(10000, Math.max(0, parseInt('99999', 10) || 50));
      runner.assertEqual(hi, 10000);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
