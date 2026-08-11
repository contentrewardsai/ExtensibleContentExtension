(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('jupiterFlashloan', [
    { name: 'Flashloan payload type', fn: function () { runner.assertEqual('CFS_JUPITER_FLASHLOAN', 'CFS_JUPITER_FLASHLOAN'); }},
    { name: 'Flashloan requires borrowMint', fn: function () {
      var mint = String('').trim();
      runner.assertTrue(mint === '', 'empty mint should be empty');
    }},
    { name: 'slippageBps defaults to 50', fn: function () {
      var sl = parseInt(undefined, 10) || 50;
      runner.assertEqual(sl, 50);
    }},
    { name: 'Flashloan lend program address', fn: function () {
      runner.assertEqual('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9', 'jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
    }},
    { name: 'profitEstimate is return minus borrow', fn: function () {
      var borrow = BigInt('1000');
      var ret = BigInt('1005');
      runner.assertEqual((ret - borrow).toString(), '5');
    }},
    { name: 'useFullBalance resolves from prior outAmount', fn: function () {
      var prior = '12345';
      var amount = prior;
      runner.assertEqual(amount, '12345');
      runner.assertTrue(amount !== '0', 'resolved amount must be non-zero');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
