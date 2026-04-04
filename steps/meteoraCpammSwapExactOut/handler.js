(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  window.__CFS_registerStepHandler('meteoraCpammSwapExactOut', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraCpammSwapExactOut)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue, action).trim();
    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountOutRaw = resolveTemplate(String(action.amountOutRaw != null ? action.amountOutRaw : '').trim(), row, getRowValue, action).trim();
    let maximumAmountInRaw = resolveTemplate(String(action.maximumAmountInRaw != null ? action.maximumAmountInRaw : '').trim(), row, getRowValue, action).trim();
    const slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!pool || !inputMint || !outputMint || !amountOutRaw) {
      throw new Error('Meteora CP-AMM swap (exact out): set pool, inputMint, outputMint, and amountOutRaw.');
    }

    const payload = {
      type: 'CFS_METEORA_CPAMM_SWAP_EXACT_OUT',
      pool,
      inputMint,
      outputMint,
      amountOutRaw,
      slippagePercent,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    };
    if (maximumAmountInRaw) payload.maximumAmountInRaw = maximumAmountInRaw;
    const cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue, action).trim();
    const cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue, action).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Meteora CP-AMM swap (exact out) failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
      const outAmt = String(action.saveAmountOutVariable || '').trim();
      if (outAmt && response.amountOutRaw) row[outAmt] = response.amountOutRaw;
      const expIn = String(action.saveExpectedInVariable || '').trim();
      if (expIn && response.expectedInAmountRaw) row[expIn] = response.expectedInAmountRaw;
      const maxIn = String(action.saveMaxInVariable || '').trim();
      if (maxIn && response.maxInAmountRaw) row[maxIn] = response.maxInAmountRaw;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
