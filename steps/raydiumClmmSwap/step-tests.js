/**
 * Unit tests for raydiumClmmSwap (CLMM fixed-in swap).
 *
 * Mirrors handler.js: template resolution, slippage clamp, payload shape.
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

  function buildBaseInPayload(action, row, getRowValue) {
    var poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue).trim();
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue).trim();
    var slippageBps = clampSlippageBps(action.slippageBps);
    var amountOutMinRaw = resolveTemplate(String(action.amountOutMinRaw != null ? action.amountOutMinRaw : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN',
      poolId: poolId,
      inputMint: inputMint,
      outputMint: outputMint,
      amountInRaw: amountInRaw,
      slippageBps: slippageBps,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (amountOutMinRaw) payload.amountOutMinRaw = amountOutMinRaw;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('raydiumClmmSwap', [
    { name: 'resolveTemplate substitutes row key', fn: function () {
      var row = { mint: 'So11111111111111111111111111111111111111112' };
      runner.assertEqual(resolveTemplate('{{mint}}', row, getRowValue), 'So11111111111111111111111111111111111111112');
    }},
    { name: 'resolveTemplate missing key empty', fn: function () {
      runner.assertEqual(resolveTemplate('{{nope}}', {}, getRowValue), '');
    }},
    { name: 'clampSlippageBps default 50', fn: function () {
      runner.assertEqual(clampSlippageBps(undefined), 50);
      runner.assertEqual(clampSlippageBps(NaN), 50);
    }},
    { name: 'clampSlippageBps clamps high', fn: function () {
      runner.assertEqual(clampSlippageBps(20000), 10000);
    }},
    { name: 'clampSlippageBps clamps negative', fn: function () {
      runner.assertEqual(clampSlippageBps(-5), 0);
    }},
    { name: 'buildBaseInPayload shape and type', fn: function () {
      var p = buildBaseInPayload({
        poolId: 'POOL1',
        inputMint: 'A',
        outputMint: 'B',
        amountInRaw: '1000',
        slippageBps: 100,
        cluster: 'devnet',
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN');
      runner.assertEqual(p.poolId, 'POOL1');
      runner.assertEqual(p.amountInRaw, '1000');
      runner.assertEqual(p.slippageBps, 100);
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.skipSimulation, false);
    }},
    { name: 'buildBaseInPayload omits rpcUrl when empty', fn: function () {
      var p = buildBaseInPayload({ poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1', rpcUrl: '' }, {}, getRowValue);
      runner.assertEqual(p.rpcUrl, undefined);
    }},
    { name: 'buildBaseInPayload adds amountOutMinRaw when set', fn: function () {
      var p = buildBaseInPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1', amountOutMinRaw: '99',
      }, {}, getRowValue);
      runner.assertEqual(p.amountOutMinRaw, '99');
    }},
    { name: 'buildBaseInPayload skips amountOutMinRaw when blank', fn: function () {
      var p = buildBaseInPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountInRaw: '1', amountOutMinRaw: '  ',
      }, {}, getRowValue);
      runner.assertEqual(p.amountOutMinRaw, undefined);
    }},
    { name: 'buildBaseInPayload templates from row', fn: function () {
      var row = { pid: 'XYZ', amt: '42' };
      var p = buildBaseInPayload({
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
