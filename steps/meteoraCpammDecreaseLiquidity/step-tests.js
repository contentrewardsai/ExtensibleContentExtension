/**
 * Unit tests for meteoraCpammDecreaseLiquidity — sendMessage payload mirrors handler.js.
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
    var removeLiquidityBps = resolveTemplate(
      String(action.removeLiquidityBps != null ? action.removeLiquidityBps : '').trim(),
      row,
      getRowValue
    ).trim();
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_DECREASE_LIQUIDITY',
      position: position,
      removeLiquidityBps: removeLiquidityBps,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (pool) payload.pool = pool;
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  runner.registerStepTests('meteoraCpammDecreaseLiquidity', [
    { name: 'payload type and bps', fn: function() {
      var p = buildPayload({
        position: 'Pos111111111111111111111111111111111111111',
        removeLiquidityBps: 5000,
      }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_DECREASE_LIQUIDITY');
      runner.assertEqual(p.removeLiquidityBps, '5000');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
