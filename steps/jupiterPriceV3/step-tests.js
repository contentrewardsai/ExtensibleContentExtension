/**
 * Unit tests for jupiterPriceV3 — payload shape and variable extraction.
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

  function buildPricePayload(action, row, getRowValue) {
    var mintAddresses = resolveTemplate(String(action.mintAddresses || '').trim(), row, getRowValue).trim();
    return { type: 'CFS_JUPITER_PRICE_V3', mintAddresses: mintAddresses };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var SOL = 'So11111111111111111111111111111111111111112';

  runner.registerStepTests('jupiterPriceV3', [
    { name: 'buildPricePayload single mint', fn: function () {
      var p = buildPricePayload({ mintAddresses: SOL }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_JUPITER_PRICE_V3');
      runner.assertEqual(p.mintAddresses, SOL);
    }},
    { name: 'buildPricePayload multiple mints', fn: function () {
      var p = buildPricePayload({ mintAddresses: SOL + ',EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }, {}, getRowValue);
      runner.assertTrue(p.mintAddresses.indexOf(',') > 0, 'should contain comma');
    }},
    { name: 'buildPricePayload template resolution', fn: function () {
      var row = { myMint: SOL };
      var p = buildPricePayload({ mintAddresses: '{{myMint}}' }, row, getRowValue);
      runner.assertEqual(p.mintAddresses, SOL);
    }},
    { name: 'buildPricePayload empty mints', fn: function () {
      var p = buildPricePayload({}, {}, getRowValue);
      runner.assertEqual(p.mintAddresses, '');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
