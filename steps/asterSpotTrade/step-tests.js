/**
 * Unit tests for asterSpotTrade — payload shape mirrors handler.js.
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
      asterCategory: 'spotTrade',
      operation: trim(row, getRowValue, action.operation),
      symbol: trim(row, getRowValue, action.symbol),
      side: trim(row, getRowValue, action.side),
      orderType: trim(row, getRowValue, action.orderType),
      quantity: trim(row, getRowValue, action.quantity),
      price: trim(row, getRowValue, action.price),
      timeInForce: trim(row, getRowValue, action.timeInForce),
    };
  }

  runner.registerStepTests('asterSpotTrade', [
    { name: 'payload type and category', fn: function () {
      var p = buildPayload({ operation: 'order', symbol: 'BTCUSDT', side: 'BUY' }, {});
      runner.assertEqual(p.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(p.asterCategory, 'spotTrade');
      runner.assertEqual(p.operation, 'order');
    }},
    { name: 'core trade fields', fn: function () {
      var p = buildPayload({
        operation: 'order', symbol: 'ETHUSDT', side: 'SELL',
        orderType: 'LIMIT', quantity: '1.5', price: '1800', timeInForce: 'GTC',
      }, {});
      runner.assertEqual(p.symbol, 'ETHUSDT');
      runner.assertEqual(p.side, 'SELL');
      runner.assertEqual(p.orderType, 'LIMIT');
      runner.assertEqual(p.quantity, '1.5');
      runner.assertEqual(p.price, '1800');
    }},
    { name: 'template resolution from row', fn: function () {
      var row = { sym: 'SOLUSDT', qty: '10' };
      var p = buildPayload({ operation: 'order', symbol: '{{sym}}', quantity: '{{qty}}', side: 'BUY' }, row);
      runner.assertEqual(p.symbol, 'SOLUSDT');
      runner.assertEqual(p.quantity, '10');
    }},
    { name: 'missing operation yields empty', fn: function () {
      var p = buildPayload({ symbol: 'BTCUSDT' }, {});
      runner.assertEqual(p.operation, '');
    }},
    { name: 'missing symbol yields empty', fn: function () {
      var p = buildPayload({ operation: 'order' }, {});
      runner.assertEqual(p.symbol, '');
    }},
    { name: 'missing side yields empty', fn: function () {
      var p = buildPayload({ operation: 'order', symbol: 'BTCUSDT' }, {});
      runner.assertEqual(p.side, '');
    }},
    { name: 'missing template var yields empty', fn: function () {
      var p = buildPayload({ operation: 'order', symbol: '{{noKey}}' }, {});
      runner.assertEqual(p.symbol, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
