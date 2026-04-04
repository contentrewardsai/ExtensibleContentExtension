/**
 * Unit tests for solanaPumpOrJupiterBuy — Jupiter-branch swap payload mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var WSOL = 'So11111111111111111111111111111111111111112';

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  /** Same object as the handler’s Jupiter branch (else) before sendMessage. */
  function buildBuyJupiterSwapPayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue).trim();
    var solLamports = resolveTemplate(String(action.solLamports != null ? action.solLamports : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var jupiterSlippageBps = Math.min(10000, Math.max(0, parseInt(action.jupiterSlippageBps, 10) || 50));
    var skipSimulation = action.skipSimulation === true;
    var skipPreflight = action.skipPreflight === true;
    var onlyDirectRoutes = action.onlyDirectRoutes === true;
    var jupiterDexes = resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValue).trim();
    var jupiterExcludeDexes = resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValue).trim();
    var jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValue).trim();
    var swapPayload = {
      type: 'CFS_SOLANA_EXECUTE_SWAP',
      inputMint: WSOL,
      outputMint: mint,
      amountRaw: solLamports,
      slippageBps: jupiterSlippageBps,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: skipSimulation,
      skipPreflight: skipPreflight,
      onlyDirectRoutes: onlyDirectRoutes,
      jupiterDexes: jupiterDexes || undefined,
      jupiterExcludeDexes: jupiterExcludeDexes || undefined,
    };
    if (jupPrio) swapPayload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
    if (action.jupiterDynamicComputeUnitLimit === false) swapPayload.jupiterDynamicComputeUnitLimit = false;
    if (action.jupiterWrapAndUnwrapSol === false) swapPayload.jupiterWrapAndUnwrapSol = false;
    return swapPayload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('solanaPumpOrJupiterBuy', [
    { name: 'buildBuyJupiterSwapPayload WSOL in, mint out', fn: function () {
      var p = buildBuyJupiterSwapPayload({
        mint: 'TokenMint11111111111111111111111111111111',
        solLamports: '1500000',
        jupiterSlippageBps: 80,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_EXECUTE_SWAP');
      runner.assertEqual(p.inputMint, WSOL);
      runner.assertEqual(p.outputMint, 'TokenMint11111111111111111111111111111111');
      runner.assertEqual(p.amountRaw, '1500000');
      runner.assertEqual(p.slippageBps, 80);
    }},
    { name: 'buildBuyJupiterSwapPayload Jupiter fee + dynamic CU off', fn: function () {
      var p = buildBuyJupiterSwapPayload({
        mint: 'M', solLamports: '1',
        jupiterPrioritizationFeeLamports: '10000',
        jupiterDynamicComputeUnitLimit: false,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, '10000');
      runner.assertEqual(p.jupiterDynamicComputeUnitLimit, false);
    }},
    { name: 'buildBuyJupiterSwapPayload wrapAndUnwrapSol false', fn: function () {
      var p = buildBuyJupiterSwapPayload({
        mint: 'M', solLamports: '1', jupiterWrapAndUnwrapSol: false,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterWrapAndUnwrapSol, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
