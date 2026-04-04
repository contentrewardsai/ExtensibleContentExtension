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

  window.__CFS_registerStepHandler('meteoraCpammQuoteSwap', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraCpammQuoteSwap)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue, action).trim();
    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue, action).trim();
    const slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!pool || !inputMint || !outputMint || !amountInRaw) {
      throw new Error('Meteora CP-AMM quote: set pool, inputMint, outputMint, and amountInRaw.');
    }

    const response = await sendMessage({
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP',
      pool,
      inputMint,
      outputMint,
      amountInRaw,
      slippagePercent,
      cluster,
      rpcUrl: rpcUrl || undefined,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Meteora CP-AMM quote failed';
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const outVar = String(action.saveExpectedOutVariable || '').trim();
      if (outVar && response.expectedOutAmountRaw) row[outVar] = response.expectedOutAmountRaw;
      const minVar = String(action.saveMinOutVariable || '').trim();
      if (minVar && response.minOutAmountRaw) row[minVar] = response.minOutAmountRaw;
      const bpsVar = String(action.saveSlippageBpsVariable || '').trim();
      if (bpsVar && response.slippageBps != null) row[bpsVar] = String(response.slippageBps);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
