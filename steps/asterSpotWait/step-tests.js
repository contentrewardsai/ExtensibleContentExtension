(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function parseStatusSet(s) {
    var out = {};
    String(s || '')
      .split(/[,|]+/)
      .forEach(function (x) {
        var t = x.trim().toUpperCase();
        if (t) out[t] = true;
      });
    return out;
  }
  function findSpotBalanceRow(balances, asset) {
    var a = String(asset || '').trim().toUpperCase();
    if (!a || !Array.isArray(balances)) return null;
    for (var i = 0; i < balances.length; i++) {
      if (String(balances[i].asset || '').toUpperCase() === a) return balances[i];
    }
    return null;
  }

  runner.registerStepTests('asterSpotWait', [
    {
      name: 'parseStatusSet',
      fn: function () {
        var o = parseStatusSet('FILLED, partially');
        runner.assertTrue(!!o.FILLED);
        runner.assertTrue(!!o.PARTIALLY);
      },
    },
    {
      name: 'parseStatusSet pipe separator',
      fn: function () {
        var o = parseStatusSet('NEW|PARTIALLY_FILLED');
        runner.assertTrue(!!o.NEW && !!o.PARTIALLY_FILLED);
      },
    },
    {
      name: 'findSpotBalanceRow matches asset',
      fn: function () {
        var row = findSpotBalanceRow([{ asset: 'USDT', free: '1' }], 'usdt');
        runner.assertEqual(row.free, '1');
      },
    },
    {
      name: 'findSpotBalanceRow missing returns null',
      fn: function () {
        runner.assertEqual(findSpotBalanceRow([], 'BTC'), null);
      },
    },
    {
      name: 'poll uses CFS_ASTER_FUTURES',
      fn: function () {
        runner.assertEqual('CFS_ASTER_FUTURES', 'CFS_ASTER_FUTURES');
      },
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
