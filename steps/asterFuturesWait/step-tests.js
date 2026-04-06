/**
 * Unit tests for asterFuturesWait — status-set parsing + payload shape.
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

  function buildPayload(action, row) {
    return {
      type: 'CFS_ASTER_FUTURES',
      asterCategory: 'trade',
      operation: trim(row, getRowValue, action.operation),
      symbol: trim(row, getRowValue, action.symbol),
      orderId: trim(row, getRowValue, action.orderId),
    };
  }

  runner.registerStepTests('asterFuturesWait', [
    { name: 'parseStatusSet comma-separated', fn: function () {
      var o = parseStatusSet('NEW,FILLED');
      runner.assertTrue(!!o.NEW && !!o.FILLED);
    }},
    { name: 'parseStatusSet pipe-separated', fn: function () {
      var o = parseStatusSet('NEW|FILLED');
      runner.assertTrue(!!o.NEW && !!o.FILLED);
    }},
    { name: 'parseStatusSet trims whitespace', fn: function () {
      var o = parseStatusSet('  FILLED , PARTIALLY_FILLED  ');
      runner.assertTrue(!!o.FILLED && !!o.PARTIALLY_FILLED);
    }},
    { name: 'parseStatusSet empty yields empty', fn: function () {
      var o = parseStatusSet('');
      runner.assertEqual(Object.keys(o).length, 0);
    }},
    { name: 'poll payload shape', fn: function () {
      var p = buildPayload({ operation: 'queryOrder', symbol: 'BTCUSDT', orderId: '12345' }, {});
      runner.assertEqual(p.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(p.operation, 'queryOrder');
      runner.assertEqual(p.symbol, 'BTCUSDT');
      runner.assertEqual(p.orderId, '12345');
    }},
    { name: 'template resolution', fn: function () {
      var row = { oid: '99' };
      var p = buildPayload({ operation: 'queryOrder', symbol: 'ETHUSDT', orderId: '{{oid}}' }, row);
      runner.assertEqual(p.orderId, '99');
    }},
    { name: 'missing symbol yields empty', fn: function () {
      var p = buildPayload({ operation: 'queryOrder' }, {});
      runner.assertEqual(p.symbol, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
