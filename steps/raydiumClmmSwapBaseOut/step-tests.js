/**
 * Unit tests for raydiumClmmSwapBaseOut (CLMM exact-out swap).
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

  function buildBaseOutPayload(action, row, getRowValue) {
    var poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue).trim();
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountOutRaw = resolveTemplate(String(action.amountOutRaw != null ? action.amountOutRaw : '').trim(), row, getRowValue).trim();
    var slippageBps = clampSlippageBps(action.slippageBps);
    var amountInMaxRaw = resolveTemplate(String(action.amountInMaxRaw != null ? action.amountInMaxRaw : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_RAYDIUM_CLMM_SWAP_BASE_OUT',
      poolId: poolId,
      inputMint: inputMint,
      outputMint: outputMint,
      amountOutRaw: amountOutRaw,
      slippageBps: slippageBps,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (amountInMaxRaw) payload.amountInMaxRaw = amountInMaxRaw;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('raydiumClmmSwapBaseOut', [
    { name: 'buildBaseOutPayload type and amounts', fn: function () {
      var p = buildBaseOutPayload({
        poolId: 'P1',
        inputMint: 'InM',
        outputMint: 'OutM',
        amountOutRaw: '5000',
        slippageBps: 25,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_SWAP_BASE_OUT');
      runner.assertEqual(p.amountOutRaw, '5000');
      runner.assertEqual(p.slippageBps, 25);
      runner.assertEqual(p.inputMint, 'InM');
      runner.assertEqual(p.outputMint, 'OutM');
    }},
    { name: 'buildBaseOutPayload optional amountInMaxRaw', fn: function () {
      var withMax = buildBaseOutPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountOutRaw: '1', amountInMaxRaw: '999',
      }, {}, getRowValue);
      runner.assertEqual(withMax.amountInMaxRaw, '999');
      var without = buildBaseOutPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountOutRaw: '1', amountInMaxRaw: '',
      }, {}, getRowValue);
      runner.assertEqual(without.amountInMaxRaw, undefined);
    }},
    { name: 'buildBaseOutPayload skip flags', fn: function () {
      var p = buildBaseOutPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountOutRaw: '1',
        skipSimulation: true, skipPreflight: true,
      }, {}, getRowValue);
      runner.assertEqual(p.skipSimulation, true);
      runner.assertEqual(p.skipPreflight, true);
    }},
    { name: 'buildBaseOutPayload row templates', fn: function () {
      var row = { outAmt: '777' };
      var p = buildBaseOutPayload({
        poolId: 'P', inputMint: 'A', outputMint: 'B', amountOutRaw: '{{outAmt}}',
      }, row, getRowValue);
      runner.assertEqual(p.amountOutRaw, '777');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
