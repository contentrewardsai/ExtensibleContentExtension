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

  window.__CFS_registerStepHandler('raydiumClmmQuoteBaseOut', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmQuoteBaseOut)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountOutRaw = resolveTemplate(String(action.amountOutRaw != null ? action.amountOutRaw : '').trim(), row, getRowValue, action).trim();
    const slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    let amountInMaxRaw = resolveTemplate(String(action.amountInMaxRaw != null ? action.amountInMaxRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!poolId || !inputMint || !outputMint || !amountOutRaw) {
      throw new Error('Raydium CLMM quote (base out): set poolId, inputMint, outputMint, and amountOutRaw.');
    }

    const payload = {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT',
      poolId,
      inputMint,
      outputMint,
      amountOutRaw,
      slippageBps,
      cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (amountInMaxRaw) payload.amountInMaxRaw = amountInMaxRaw;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM quote (base out) failed';
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const maxInV = String(action.saveAmountInMaxVariable || '').trim();
      if (maxInV && response.amountInMaxRaw != null) row[maxInV] = String(response.amountInMaxRaw);
      const expIn = String(action.saveAmountInExpectedVariable || '').trim();
      if (expIn && response.amountInExpectedRaw != null) row[expIn] = String(response.amountInExpectedRaw);
      const outV = String(action.saveAmountOutVariable || '').trim();
      if (outV && response.amountOutRaw != null) row[outV] = String(response.amountOutRaw);
      const remV = String(action.saveRemainingAccountsCountVariable || '').trim();
      if (remV && response.remainingAccountsCount != null) row[remV] = String(response.remainingAccountsCount);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
