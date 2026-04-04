/**
 * Unit tests for raydiumClmmQuoteBaseIn (CLMM fixed-in quote, no tx).
 *
 * Mirrors handler.js: template resolution, slippage clamp, payload shape (no skip flags).
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

  function clampSlippageBps(raw) {
    return Math.min(10000, Math.max(0, parseInt(raw, 10) || 50));
  }

  function buildQuoteBaseInPayload(action, row, getRowValue) {
    var poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue).trim();
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue).trim();
    var slippageBps = clampSlippageBps(action.slippageBps);
    var amountOutMinRaw = resolveTemplate(String(action.amountOutMinRaw != null ? action.amountOutMinRaw : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      poolId: poolId,
      inputMint: inputMint,
      outputMint: outputMint,
      amountInRaw: amountInRaw,
      slippageBps: slippageBps,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (amountOutMinRaw) payload.amountOutMinRaw = amountOutMinRaw;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('raydiumClmmQuoteBaseIn', [
    { name: 'buildQuoteBaseInPayload type', fn: function () {
      var p = buildQuoteBaseInPayload({
        poolId: 'POOL1',
        inputMint: 'A',
        outputMint: 'B',
        amountInRaw: '1000',
        slippageBps: 100,
        cluster: 'devnet',
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN');
      runner.assertEqual(p.poolId, 'POOL1');
      runner.assertEqual(p.amountInRaw, '1000');
      runner.assertEqual(p.slippageBps, 100);
      runner.assertEqual(p.cluster, 'devnet');
    }},
    { name: 'buildQuoteBaseInPayload omits rpcUrl when empty', fn: function () {
      var p = buildQuoteBaseInPayload({ poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1', rpcUrl: '' }, {}, getRowValue);
      runner.assertEqual(p.rpcUrl, undefined);
    }},
    { name: 'buildQuoteBaseInPayload adds amountOutMinRaw when set', fn: function () {
      var p = buildQuoteBaseInPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1', amountOutMinRaw: '99',
      }, {}, getRowValue);
      runner.assertEqual(p.amountOutMinRaw, '99');
    }},
    { name: 'buildQuoteBaseInPayload no skip flags on payload', fn: function () {
      var p = buildQuoteBaseInPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1',
      }, {}, getRowValue);
      runner.assertEqual(p.skipSimulation, undefined);
      runner.assertEqual(p.skipPreflight, undefined);
    }},
    { name: 'buildQuoteBaseInPayload templates from row', fn: function () {
      var row = { pid: 'XYZ', amt: '42' };
      var p = buildQuoteBaseInPayload({
        poolId: '{{pid}}',
        inputMint: 'A',
        outputMint: 'B',
        amountInRaw: '{{amt}}',
      }, row, getRowValue);
      runner.assertEqual(p.poolId, 'XYZ');
      runner.assertEqual(p.amountInRaw, '42');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
