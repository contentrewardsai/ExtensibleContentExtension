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

  window.__CFS_registerStepHandler('raydiumClmmQuoteBaseIn', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmQuoteBaseIn)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue, action).trim();
    const slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    let amountOutMinRaw = resolveTemplate(String(action.amountOutMinRaw != null ? action.amountOutMinRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!poolId || !inputMint || !outputMint || !amountInRaw) {
      throw new Error('Raydium CLMM quote (base in): set poolId, inputMint, outputMint, and amountInRaw.');
    }

    const payload = {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      poolId,
      inputMint,
      outputMint,
      amountInRaw,
      slippageBps,
      cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (amountOutMinRaw) payload.amountOutMinRaw = amountOutMinRaw;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM quote failed';
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const minV = String(action.saveAmountOutMinVariable || '').trim();
      if (minV && response.amountOutMinRaw != null) row[minV] = String(response.amountOutMinRaw);
      const expOut = String(action.saveAmountOutExpectedVariable || '').trim();
      if (expOut && response.amountOutExpectedRaw != null) row[expOut] = String(response.amountOutExpectedRaw);
      const remV = String(action.saveRemainingAccountsCountVariable || '').trim();
      if (remV && response.remainingAccountsCount != null) row[remV] = String(response.remainingAccountsCount);
      const allV = String(action.saveAllTradeVariable || '').trim();
      if (allV && response.allTrade != null) row[allV] = response.allTrade ? 'true' : 'false';
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
