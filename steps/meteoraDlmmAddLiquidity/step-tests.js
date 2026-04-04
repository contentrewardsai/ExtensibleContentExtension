/**
 * Unit tests for meteoraDlmmAddLiquidity — sendMessage payload mirrors handler.js.
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

  function buildAddPayload(action, row, getRowValue) {
    var lbPair = resolveTemplate(String(action.lbPair || '').trim(), row, getRowValue).trim();
    var totalXAmountRaw = resolveTemplate(String(action.totalXAmountRaw != null ? action.totalXAmountRaw : '').trim(), row, getRowValue).trim();
    var totalYAmountRaw = resolveTemplate(String(action.totalYAmountRaw != null ? action.totalYAmountRaw : '').trim(), row, getRowValue).trim();
    if (totalXAmountRaw === '') totalXAmountRaw = '0';
    if (totalYAmountRaw === '') totalYAmountRaw = '0';
    var strategyType = String(action.strategyType || 'spot').trim().toLowerCase();
    var binsEachSide = Math.min(500, Math.max(1, parseInt(action.binsEachSide, 10) || 10));
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_METEORA_DLMM_ADD_LIQUIDITY',
      lbPair: lbPair,
      totalXAmountRaw: totalXAmountRaw,
      totalYAmountRaw: totalYAmountRaw,
      strategyType: strategyType,
      binsEachSide: binsEachSide,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('meteoraDlmmAddLiquidity', [
    { name: 'buildAddPayload type and amounts', fn: function () {
      var p = buildAddPayload({
        lbPair: 'LbPair1111111111111111111111111111111111111',
        totalXAmountRaw: '1000000',
        totalYAmountRaw: '0',
        strategyType: 'curve',
        binsEachSide: 20,
        slippagePercent: 2,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_METEORA_DLMM_ADD_LIQUIDITY');
      runner.assertEqual(p.lbPair, 'LbPair1111111111111111111111111111111111111');
      runner.assertEqual(p.totalXAmountRaw, '1000000');
      runner.assertEqual(p.totalYAmountRaw, '0');
      runner.assertEqual(p.strategyType, 'curve');
      runner.assertEqual(p.binsEachSide, 20);
      runner.assertEqual(p.slippagePercent, 2);
    }},
    { name: 'buildAddPayload empty amounts become 0', fn: function () {
      var p = buildAddPayload({ lbPair: 'L', totalXAmountRaw: '', totalYAmountRaw: '' }, {}, getRowValue);
      runner.assertEqual(p.totalXAmountRaw, '0');
      runner.assertEqual(p.totalYAmountRaw, '0');
    }},
    { name: 'buildAddPayload row templates', fn: function () {
      var row = { pool: 'Pp', x: '5' };
      var p = buildAddPayload({ lbPair: '{{pool}}', totalXAmountRaw: '{{x}}', totalYAmountRaw: '0' }, row, getRowValue);
      runner.assertEqual(p.lbPair, 'Pp');
      runner.assertEqual(p.totalXAmountRaw, '5');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
