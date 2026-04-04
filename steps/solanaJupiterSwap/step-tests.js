/**
 * Unit tests for solanaJupiterSwap — payload shape mirrors handler.js.
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

  function buildJupiterSwapPayload(action, row, getRowValue) {
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountRaw = resolveTemplate(String(action.amountRaw != null ? action.amountRaw : '').trim(), row, getRowValue).trim();
    var slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var skipSimulation = action.skipSimulation === true;
    var skipPreflight = action.skipPreflight === true;
    var onlyDirectRoutes = action.onlyDirectRoutes === true;
    var jupiterDexes = resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValue).trim();
    var jupiterExcludeDexes = resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValue).trim();
    var jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_EXECUTE_SWAP',
      inputMint: inputMint,
      outputMint: outputMint,
      amountRaw: amountRaw,
      slippageBps: slippageBps,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: skipSimulation,
      skipPreflight: skipPreflight,
      onlyDirectRoutes: onlyDirectRoutes,
      jupiterDexes: jupiterDexes || undefined,
      jupiterExcludeDexes: jupiterExcludeDexes || undefined,
    };
    if (jupPrio) payload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
    if (action.jupiterDynamicComputeUnitLimit === false) payload.jupiterDynamicComputeUnitLimit = false;
    if (action.jupiterWrapAndUnwrapSol === false) payload.jupiterWrapAndUnwrapSol = false;
    var crossBps = parseInt(action.jupiterCrossCheckMaxDeviationBps, 10);
    if (Number.isFinite(crossBps) && crossBps > 0) {
      payload.jupiterCrossCheckMaxDeviationBps = Math.min(10000, Math.max(0, crossBps));
    }
    if (action.jupiterCrossCheckOptional === true) payload.jupiterCrossCheckOptional = true;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var WSOL = 'So11111111111111111111111111111111111111112';

  runner.registerStepTests('solanaJupiterSwap', [
    { name: 'buildJupiterSwapPayload core', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL,
        outputMint: 'OutMint1111111111111111111111111111111111',
        amountRaw: '1000000',
        slippageBps: 100,
        onlyDirectRoutes: true,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_EXECUTE_SWAP');
      runner.assertEqual(p.inputMint, WSOL);
      runner.assertEqual(p.outputMint, 'OutMint1111111111111111111111111111111111');
      runner.assertEqual(p.amountRaw, '1000000');
      runner.assertEqual(p.slippageBps, 100);
      runner.assertEqual(p.onlyDirectRoutes, true);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, undefined);
      runner.assertEqual(p.jupiterDynamicComputeUnitLimit, undefined);
      runner.assertEqual(p.jupiterWrapAndUnwrapSol, undefined);
    }},
    { name: 'buildJupiterSwapPayload prioritization auto string', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '1',
        jupiterPrioritizationFeeLamports: 'auto',
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, 'auto');
    }},
    { name: 'buildJupiterSwapPayload prioritization lamports', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '1',
        jupiterPrioritizationFeeLamports: '5000',
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, '5000');
    }},
    { name: 'buildJupiterSwapPayload dynamicComputeUnitLimit false', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '1',
        jupiterDynamicComputeUnitLimit: false,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterDynamicComputeUnitLimit, false);
    }},
    { name: 'buildJupiterSwapPayload jupiterWrapAndUnwrapSol false', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '1',
        jupiterWrapAndUnwrapSol: false,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterWrapAndUnwrapSol, false);
    }},
    { name: 'buildJupiterSwapPayload row template amount', fn: function () {
      var row = { a: '777' };
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '{{a}}',
      }, row, getRowValue);
      runner.assertEqual(p.amountRaw, '777');
    }},
    { name: 'buildJupiterSwapPayload cross-check bps', fn: function () {
      var p = buildJupiterSwapPayload({
        inputMint: WSOL, outputMint: 'O', amountRaw: '1',
        jupiterCrossCheckMaxDeviationBps: 150,
        jupiterCrossCheckOptional: true,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterCrossCheckMaxDeviationBps, 150);
      runner.assertEqual(p.jupiterCrossCheckOptional, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
