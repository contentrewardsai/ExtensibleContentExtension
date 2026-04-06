/**
 * Unit tests for asterFuturesTrade — payload shape mirrors handler.js.
 * Tests: message shape, template resolution, missing fields, defaults.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }
  function trimResolved(row, getRowValue, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue).trim();
  }
  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    var operation = trimResolved(row, getRowValue, action.operation);
    return {
      type: 'CFS_ASTER_FUTURES',
      asterCategory: 'trade',
      operation: operation,
      symbol: trimResolved(row, getRowValue, action.symbol),
      side: trimResolved(row, getRowValue, action.side),
      positionSide: trimResolved(row, getRowValue, action.positionSide),
      orderType: trimResolved(row, getRowValue, action.orderType),
      timeInForce: trimResolved(row, getRowValue, action.timeInForce),
      quantity: trimResolved(row, getRowValue, action.quantity),
      price: trimResolved(row, getRowValue, action.price),
      leverage: trimResolved(row, getRowValue, action.leverage),
    };
  }

  runner.registerStepTests('asterFuturesTrade', [
    { name: 'payload type and category', fn: function () {
      var p = buildPayload({ operation: 'placeOrder', symbol: 'BTCUSDT', side: 'BUY' }, {});
      runner.assertEqual(p.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(p.asterCategory, 'trade');
      runner.assertEqual(p.operation, 'placeOrder');
    }},
    { name: 'core trade fields', fn: function () {
      var p = buildPayload({
        operation: 'placeOrder', symbol: 'ETHUSDT', side: 'SELL',
        positionSide: 'SHORT', orderType: 'LIMIT', quantity: '0.5',
        price: '1800', leverage: '10', timeInForce: 'GTC',
      }, {});
      runner.assertEqual(p.symbol, 'ETHUSDT');
      runner.assertEqual(p.side, 'SELL');
      runner.assertEqual(p.positionSide, 'SHORT');
      runner.assertEqual(p.orderType, 'LIMIT');
      runner.assertEqual(p.quantity, '0.5');
      runner.assertEqual(p.price, '1800');
      runner.assertEqual(p.leverage, '10');
      runner.assertEqual(p.timeInForce, 'GTC');
    }},
    { name: 'template resolution from row', fn: function () {
      var row = { sym: 'SOLUSDT', qty: '10', px: '25.5' };
      var p = buildPayload({
        operation: 'placeOrder', symbol: '{{sym}}', quantity: '{{qty}}',
        price: '{{px}}', side: 'BUY',
      }, row);
      runner.assertEqual(p.symbol, 'SOLUSDT');
      runner.assertEqual(p.quantity, '10');
      runner.assertEqual(p.price, '25.5');
    }},
    { name: 'missing operation yields empty', fn: function () {
      var p = buildPayload({ symbol: 'BTCUSDT', side: 'BUY' }, {});
      runner.assertEqual(p.operation, '');
    }},
    { name: 'missing symbol yields empty', fn: function () {
      var p = buildPayload({ operation: 'placeOrder', side: 'BUY' }, {});
      runner.assertEqual(p.symbol, '');
    }},
    { name: 'missing side yields empty', fn: function () {
      var p = buildPayload({ operation: 'placeOrder', symbol: 'BTCUSDT' }, {});
      runner.assertEqual(p.side, '');
    }},
    { name: 'missing template var yields empty', fn: function () {
      var p = buildPayload({ operation: 'placeOrder', symbol: '{{noKey}}' }, {});
      runner.assertEqual(p.symbol, '');
    }},
    { name: 'empty fields default to empty string', fn: function () {
      var p = buildPayload({ operation: 'placeOrder' }, {});
      runner.assertEqual(p.quantity, '');
      runner.assertEqual(p.price, '');
      runner.assertEqual(p.leverage, '');
      runner.assertEqual(p.positionSide, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
