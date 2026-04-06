/**
 * Unit tests for asterSpotAccount — payload shape mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

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
      asterCategory: 'spotAccount',
      operation: trim(row, getRowValue, action.operation),
      symbol: trim(row, getRowValue, action.symbol),
      recvWindow: trim(row, getRowValue, action.recvWindow),
    };
  }

  runner.registerStepTests('asterSpotAccount', [
    { name: 'payload type and category', fn: function () {
      var p = buildPayload({ operation: 'account' }, {});
      runner.assertEqual(p.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(p.asterCategory, 'spotAccount');
      runner.assertEqual(p.operation, 'account');
    }},
    { name: 'template resolution', fn: function () {
      var row = { op: 'myTrades', sym: 'BTCUSDT' };
      var p = buildPayload({ operation: '{{op}}', symbol: '{{sym}}' }, row);
      runner.assertEqual(p.operation, 'myTrades');
      runner.assertEqual(p.symbol, 'BTCUSDT');
    }},
    { name: 'missing operation yields empty', fn: function () {
      var p = buildPayload({}, {});
      runner.assertEqual(p.operation, '');
    }},
    { name: 'missing symbol yields empty', fn: function () {
      var p = buildPayload({ operation: 'account' }, {});
      runner.assertEqual(p.symbol, '');
    }},
    { name: 'missing template var yields empty', fn: function () {
      var p = buildPayload({ operation: '{{none}}' }, {});
      runner.assertEqual(p.operation, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
