/**
 * Unit tests for watchActivityFilterPriceDrift helper functions.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function nzDrift(x) {
    var n = parseFloat(String(x || '').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveDriftMaxForSide(buy, sell, both, side) {
    var s = String(side || '').toLowerCase();
    if (s === 'buy') {
      if (nzDrift(buy) != null) return nzDrift(buy);
      return nzDrift(both);
    }
    if (s === 'sell') {
      if (nzDrift(sell) != null) return nzDrift(sell);
      return nzDrift(both);
    }
    return null;
  }

  runner.registerStepTests('watchActivityFilterPriceDrift', [
    { name: 'nzDrift', fn: function () {
      runner.assertEqual(nzDrift('1.5'), 1.5);
      runner.assertEqual(nzDrift('0'), null);
      runner.assertEqual(nzDrift('x'), null);
    }},
    { name: 'resolveDriftMaxForSide buy prefers buy', fn: function () {
      runner.assertEqual(resolveDriftMaxForSide('2', '3', '1', 'buy'), 2);
    }},
    { name: 'resolveDriftMaxForSide buy fallback both', fn: function () {
      runner.assertEqual(resolveDriftMaxForSide('', '', '5', 'buy'), 5);
    }},
    { name: 'resolveDriftMaxForSide sell prefers sell', fn: function () {
      runner.assertEqual(resolveDriftMaxForSide('2', '4', '1', 'sell'), 4);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
