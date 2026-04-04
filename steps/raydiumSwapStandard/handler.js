(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  window.__CFS_registerStepHandler('raydiumSwapStandard', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumSwapStandard)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue, action).trim();
    const slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!poolId || !inputMint || !outputMint || !amountInRaw) {
      throw new Error('Raydium swap: set poolId, inputMint, outputMint, and amountInRaw.');
    }

    const response = await sendMessage({
      type: 'CFS_RAYDIUM_SWAP_STANDARD',
      poolId,
      inputMint,
      outputMint,
      amountInRaw,
      slippageBps,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium swap failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
      const minV = String(action.saveAmountOutMinVariable || '').trim();
      if (minV && response.amountOutMinRaw != null) row[minV] = String(response.amountOutMinRaw);
      const expOut = String(action.saveAmountOutExpectedVariable || '').trim();
      if (expOut && response.amountOutExpectedRaw != null) row[expOut] = String(response.amountOutExpectedRaw);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
