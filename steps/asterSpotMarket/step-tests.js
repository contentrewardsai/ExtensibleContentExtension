/**
 * Unit tests for asterSpotMarket — payload shape mirrors handler.js.
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
      asterCategory: 'spotMarket',
      operation: trim(row, getRowValue, action.operation),
      symbol: trim(row, getRowValue, action.symbol),
      interval: trim(row, getRowValue, action.interval),
      limit: trim(row, getRowValue, action.limit),
    };
  }

  runner.registerStepTests('asterSpotMarket', [
    { name: 'payload type and category', fn: function () {
      var p = buildPayload({ operation: 'ping' }, {});
      runner.assertEqual(p.type, 'CFS_ASTER_FUTURES');
      runner.assertEqual(p.asterCategory, 'spotMarket');
      runner.assertEqual(p.operation, 'ping');
    }},
    { name: 'klines fields', fn: function () {
      var p = buildPayload({ operation: 'klines', symbol: 'BTCUSDT', interval: '4h', limit: '50' }, {});
      runner.assertEqual(p.symbol, 'BTCUSDT');
      runner.assertEqual(p.interval, '4h');
      runner.assertEqual(p.limit, '50');
    }},
    { name: 'template resolution', fn: function () {
      var row = { sym: 'ETHUSDT' };
      var p = buildPayload({ operation: 'ticker24hr', symbol: '{{sym}}' }, row);
      runner.assertEqual(p.symbol, 'ETHUSDT');
    }},
    { name: 'missing operation yields empty', fn: function () {
      var p = buildPayload({}, {});
      runner.assertEqual(p.operation, '');
    }},
    { name: 'missing template var yields empty', fn: function () {
      var p = buildPayload({ symbol: '{{noKey}}' }, {});
      runner.assertEqual(p.symbol, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
