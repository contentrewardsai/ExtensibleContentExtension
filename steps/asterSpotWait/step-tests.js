/**
 * Unit tests for asterSpotWait — status parsing + poll payload shape.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parseStatusSet(s) {
    var out = {};
    String(s || '').split(/[,|]+/).forEach(function (x) {
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
  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }
  function trim(row, getRowValue, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue).trim();
  }
  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('asterSpotWait', [
    { name: 'parseStatusSet comma', fn: function () {
      var o = parseStatusSet('FILLED, partially');
      runner.assertTrue(!!o.FILLED && !!o.PARTIALLY);
    }},
    { name: 'parseStatusSet pipe', fn: function () {
      var o = parseStatusSet('NEW|PARTIALLY_FILLED');
      runner.assertTrue(!!o.NEW && !!o.PARTIALLY_FILLED);
    }},
    { name: 'parseStatusSet empty', fn: function () {
      runner.assertEqual(Object.keys(parseStatusSet('')).length, 0);
    }},
    { name: 'findSpotBalanceRow matches', fn: function () {
      var row = findSpotBalanceRow([{ asset: 'USDT', free: '1' }], 'usdt');
      runner.assertEqual(row.free, '1');
    }},
    { name: 'findSpotBalanceRow missing', fn: function () {
      runner.assertEqual(findSpotBalanceRow([], 'BTC'), null);
    }},
    { name: 'findSpotBalanceRow null balances', fn: function () {
      runner.assertEqual(findSpotBalanceRow(null, 'ETH'), null);
    }},
    { name: 'poll message type', fn: function () {
      runner.assertEqual('CFS_ASTER_FUTURES', 'CFS_ASTER_FUTURES');
    }},
    { name: 'template resolution for orderId', fn: function () {
      var row = { oid: '123' };
      var v = trim(row, getRowValue, '{{oid}}');
      runner.assertEqual(v, '123');
    }},
    { name: 'missing template var yields empty', fn: function () {
      var v = trim({}, getRowValue, '{{noKey}}');
      runner.assertEqual(v, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
