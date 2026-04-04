/**
 * Unit tests for solanaPumpOrJupiterSell — Jupiter-branch swap payload mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var WSOL = 'So11111111111111111111111111111111111111112';

  function resolveTemplate(str, row, getRowValueFn) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValueFn(row, k);
      return v != null ? String(v) : '';
    });
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  /** Same object as the handler’s Jupiter branch (else) before sendMessage. */
  function buildSellJupiterSwapPayload(action, row, getRowValueFn) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValueFn).trim();
    var tokenAmountRaw = resolveTemplate(String(action.tokenAmountRaw != null ? action.tokenAmountRaw : '').trim(), row, getRowValueFn).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValueFn).trim();
    var jupiterSlippageBps = Math.min(10000, Math.max(0, parseInt(action.jupiterSlippageBps, 10) || 50));
    var skipSimulation = action.skipSimulation === true;
    var skipPreflight = action.skipPreflight === true;
    var onlyDirectRoutes = action.onlyDirectRoutes === true;
    var jupiterDexes = resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValueFn).trim();
    var jupiterExcludeDexes = resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValueFn).trim();
    var jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValueFn).trim();
    var swapPayload = {
      type: 'CFS_SOLANA_EXECUTE_SWAP',
      inputMint: mint,
      outputMint: WSOL,
      amountRaw: tokenAmountRaw,
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

  runner.registerStepTests('solanaPumpOrJupiterSell', [
    { name: 'buildSellJupiterSwapPayload mint in, WSOL out', fn: function () {
      var p = buildSellJupiterSwapPayload({
        mint: 'SellMint1111111111111111111111111111111111',
        tokenAmountRaw: '999999',
        jupiterSlippageBps: 50,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_EXECUTE_SWAP');
      runner.assertEqual(p.inputMint, 'SellMint1111111111111111111111111111111111');
      runner.assertEqual(p.outputMint, WSOL);
      runner.assertEqual(p.amountRaw, '999999');
    }},
    { name: 'buildSellJupiterSwapPayload prioritization auto', fn: function () {
      var p = buildSellJupiterSwapPayload({
        mint: 'M', tokenAmountRaw: '1',
        jupiterPrioritizationFeeLamports: 'auto',
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, 'auto');
    }},
    { name: 'buildSellJupiterSwapPayload wrapAndUnwrapSol false', fn: function () {
      var p = buildSellJupiterSwapPayload({
        mint: 'M', tokenAmountRaw: '1', jupiterWrapAndUnwrapSol: false,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterWrapAndUnwrapSol, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
