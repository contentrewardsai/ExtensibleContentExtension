/**
 * Buy small amount then sell back (Pump vs Jupiter) to test sell path. Message: CFS_SOLANA_SELLABILITY_PROBE.
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, name, value) {
    var n = String(name || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  function parseOptionalUsd(row, getRowValue, action, raw) {
    var s = resolveTemplate(String(raw != null ? raw : '').trim(), row, getRowValue, action).trim();
    if (!s) return undefined;
    var n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  window.__CFS_registerStepHandler('solanaSellabilityProbe', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaSellabilityProbe)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

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

    if (!mint) throw new Error('Solana sellability probe: set token mint.');

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

    var response = await sendMessage(payload);
    if (!response || !response.ok) {
      var err = (response && response.error) ? response.error : 'Sellability probe failed';
      setRowVar(row, action.saveSellabilityOkVariable, 'false');
      if (response && response.venue) setRowVar(row, action.saveVenueVariable, response.venue);
      if (response && response.tokenReceivedRaw) setRowVar(row, action.saveTokenReceivedRawVariable, response.tokenReceivedRaw);
      if (response && response.buySignature) setRowVar(row, action.saveBuySignatureVariable, response.buySignature);
      if (response && response.buyExplorerUrl) setRowVar(row, action.saveBuyExplorerUrlVariable, response.buyExplorerUrl);
      throw new Error(err);
    }

    setRowVar(row, action.saveSellabilityOkVariable, 'true');
    setRowVar(row, action.saveVenueVariable, response.venue || '');
    setRowVar(row, action.saveSolLamportsSpentVariable, response.solLamportsSpent || '');
    setRowVar(row, action.saveBuySignatureVariable, response.buySignature || '');
    setRowVar(row, action.saveBuyExplorerUrlVariable, response.buyExplorerUrl || '');
    setRowVar(row, action.saveSellSignatureVariable, response.sellSignature || '');
    setRowVar(row, action.saveSellExplorerUrlVariable, response.sellExplorerUrl || '');
    setRowVar(row, action.saveTokenReceivedRawVariable, response.tokenReceivedRaw || '');
    setRowVar(row, action.saveTokenBalanceAfterBuyVariable, response.tokenBalanceAfterBuy || '');
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
