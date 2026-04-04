/**
 * Unit tests for meteoraCpammSwap — sendMessage payload mirrors handler.js.
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
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue).trim();
    var minimumAmountOutRaw = resolveTemplate(String(action.minimumAmountOutRaw != null ? action.minimumAmountOutRaw : '').trim(), row, getRowValue).trim();
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_SWAP',
      pool: pool,
      inputMint: inputMint,
      outputMint: outputMint,
      amountInRaw: amountInRaw,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (minimumAmountOutRaw) payload.minimumAmountOutRaw = minimumAmountOutRaw;
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  runner.registerStepTests('meteoraCpammSwap', [
    { name: 'payload shape', fn: function() {
      var p = buildPayload({
        pool: 'Pool111111111111111111111111111111111111111',
        inputMint: 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        outputMint: 'MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amountInRaw: '1000000',
        slippagePercent: 2,
      }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_SWAP');
      runner.assertEqual(p.amountInRaw, '1000000');
      runner.assertEqual(p.slippagePercent, 2);
    }},
    { name: 'optional minimumAmountOutRaw', fn: function() {
      var p = buildPayload({
        pool: 'P',
        inputMint: 'A',
        outputMint: 'B',
        amountInRaw: '1',
        minimumAmountOutRaw: '999',
      }, {});
      runner.assertEqual(p.minimumAmountOutRaw, '999');
    }},
    { name: 'optional compute budget', fn: function() {
      var p = buildPayload({
        pool: 'P',
        inputMint: 'A',
        outputMint: 'B',
        amountInRaw: '1',
        computeUnitLimit: '400000',
        computeUnitPriceMicroLamports: '5000',
      }, {});
      runner.assertEqual(p.computeUnitLimit, '400000');
      runner.assertEqual(p.computeUnitPriceMicroLamports, '5000');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
