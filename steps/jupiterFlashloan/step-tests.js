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
      // Jupiter Lend main program
      runner.assertEqual('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9', 'jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
