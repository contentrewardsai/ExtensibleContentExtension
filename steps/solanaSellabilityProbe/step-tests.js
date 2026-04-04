/**
 * Unit tests for solanaSellabilityProbe — outbound payload mirrors handler.js (before sendMessage).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue, action) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function parseOptionalUsd(row, getRowValue, action, raw) {
    var s = resolveTemplate(String(raw != null ? raw : '').trim(), row, getRowValue, action).trim();
    if (!s) return undefined;
    var n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  function buildProbePayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    var solLamports = resolveTemplate(String(action.solLamports != null ? action.solLamports : '').trim(), row, getRowValue, action).trim();
    var tokenProgram = resolveTemplate(String(action.tokenProgram || '').trim(), row, getRowValue, action).trim();
    var quoteMint = resolveTemplate(String(action.quoteMint || '').trim(), row, getRowValue, action).trim();
    var spendUsdApprox = action.spendUsdApprox;
    if (spendUsdApprox != null && String(spendUsdApprox).trim() !== '') {
      var u = parseOptionalUsd(row, getRowValue, action, spendUsdApprox);
      if (u != null) spendUsdApprox = u;
    }
    var payload = {
      type: 'CFS_SOLANA_SELLABILITY_PROBE',
      mint: mint,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      pumpSlippage: Math.max(0, parseInt(action.pumpSlippage, 10) || 1),
      jupiterSlippageBps: Math.min(10000, Math.max(0, parseInt(action.jupiterSlippageBps, 10) || 50)),
      checkRaydium: action.checkRaydium !== false,
      requireRaydiumPoolForPump: action.requireRaydiumPoolForPump === true,
      skipPumpIfRaydiumPoolFound: action.skipPumpIfRaydiumPoolFound === true,
      raydiumPageSize: parseInt(action.raydiumPageSize, 10) || 20,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
      onlyDirectRoutes: action.onlyDirectRoutes === true,
      jupiterDexes: resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValue, action).trim() || undefined,
      jupiterExcludeDexes: resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValue, action).trim() || undefined,
      jupiterDynamicComputeUnitLimit: action.jupiterDynamicComputeUnitLimit !== false,
      jupiterWrapAndUnwrapSol: action.jupiterWrapAndUnwrapSol !== false,
      balancePollIntervalMs: parseInt(action.balancePollIntervalMs, 10) || 500,
      balancePollMaxMs: parseInt(action.balancePollMaxMs, 10) || 45000,
    };
    if (quoteMint) payload.quoteMint = quoteMint;
    if (tokenProgram) payload.tokenProgram = tokenProgram;
    if (solLamports) payload.solLamports = solLamports;
    else if (spendUsdApprox != null && Number.isFinite(Number(spendUsdApprox)) && Number(spendUsdApprox) > 0) {
      payload.spendUsdApprox = Number(spendUsdApprox);
    }
    var jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValue, action).trim();
    if (jupPrio) payload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
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

  runner.registerStepTests('solanaSellabilityProbe', [
    { name: 'payload type and solLamports', fn: function() {
      var p = buildProbePayload({
        mint: 'Mint1111111111111111111111111111111111111',
        solLamports: '5000000',
        pumpSlippage: 2,
        jupiterSlippageBps: 100,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_SELLABILITY_PROBE');
      runner.assertEqual(p.mint, 'Mint1111111111111111111111111111111111111');
      runner.assertEqual(p.solLamports, '5000000');
      runner.assertEqual(p.spendUsdApprox, undefined);
      runner.assertEqual(p.pumpSlippage, 2);
      runner.assertEqual(p.jupiterSlippageBps, 100);
    }},
    { name: 'payload spendUsdApprox when no lamports', fn: function() {
      var p = buildProbePayload({
        mint: 'M',
        spendUsdApprox: 2.5,
      }, {}, getRowValue);
      runner.assertEqual(p.spendUsdApprox, 2.5);
      runner.assertEqual(p.solLamports, undefined);
    }},
    { name: 'jupiterPrioritizationFeeLamports auto', fn: function() {
      var p = buildProbePayload({
        mint: 'M',
        solLamports: '1',
        jupiterPrioritizationFeeLamports: 'auto',
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterPrioritizationFeeLamports, 'auto');
    }},
    { name: 'checkRaydium false', fn: function() {
      var p = buildProbePayload({ mint: 'M', solLamports: '1', checkRaydium: false }, {}, getRowValue);
      runner.assertEqual(p.checkRaydium, false);
    }},
    { name: 'jupiter cross-check fields', fn: function() {
      var p = buildProbePayload({
        mint: 'M',
        solLamports: '1',
        jupiterCrossCheckMaxDeviationBps: 200,
        jupiterCrossCheckOptional: true,
      }, {}, getRowValue);
      runner.assertEqual(p.jupiterCrossCheckMaxDeviationBps, 200);
      runner.assertEqual(p.jupiterCrossCheckOptional, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
