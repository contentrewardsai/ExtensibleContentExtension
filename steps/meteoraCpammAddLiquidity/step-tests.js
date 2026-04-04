/**
 * Unit tests for meteoraCpammAddLiquidity — sendMessage payload mirrors handler.js.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    var pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue).trim();
    var position = resolveTemplate(String(action.position || '').trim(), row, getRowValue).trim();
    var totalTokenARaw = resolveTemplate(String(action.totalTokenARaw != null ? action.totalTokenARaw : '').trim(), row, getRowValue).trim();
    var totalTokenBRaw = resolveTemplate(String(action.totalTokenBRaw != null ? action.totalTokenBRaw : '').trim(), row, getRowValue).trim();
    if (totalTokenARaw === '') totalTokenARaw = '0';
    if (totalTokenBRaw === '') totalTokenBRaw = '0';
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_ADD_LIQUIDITY',
      totalTokenARaw: totalTokenARaw,
      totalTokenBRaw: totalTokenBRaw,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (pool) payload.pool = pool;
    if (position) payload.position = position;
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  runner.registerStepTests('meteoraCpammAddLiquidity', [
    { name: 'payload type and pool', fn: function() {
      var p = buildPayload({
        pool: 'CPMM111111111111111111111111111111111111111',
        totalTokenARaw: '1000000',
        totalTokenBRaw: '0',
      }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_ADD_LIQUIDITY');
      runner.assertEqual(p.pool, 'CPMM111111111111111111111111111111111111111');
      runner.assertEqual(p.totalTokenARaw, '1000000');
      runner.assertEqual(p.totalTokenBRaw, '0');
    }},
    { name: 'two-sided amounts in payload', fn: function() {
      var p = buildPayload({
        pool: 'P',
        totalTokenARaw: '100',
        totalTokenBRaw: '200',
      }, {});
      runner.assertEqual(p.totalTokenARaw, '100');
      runner.assertEqual(p.totalTokenBRaw, '200');
    }},
    { name: 'increase omits pool when only position', fn: function() {
      var p = buildPayload({
        position: 'Pos111111111111111111111111111111111111111',
        totalTokenARaw: '1',
        totalTokenBRaw: '0',
      }, {});
      runner.assertEqual(p.position, 'Pos111111111111111111111111111111111111111');
      runner.assertTrue(!Object.prototype.hasOwnProperty.call(p, 'pool'));
    }},
    { name: 'optional compute budget', fn: function() {
      var p = buildPayload({
        pool: 'P',
        totalTokenARaw: '1',
        totalTokenBRaw: '0',
        computeUnitLimit: '300000',
        computeUnitPriceMicroLamports: '1000',
      }, {});
      runner.assertEqual(p.computeUnitLimit, '300000');
      runner.assertEqual(p.computeUnitPriceMicroLamports, '1000');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
