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

  window.__CFS_registerStepHandler('meteoraCpammQuoteSwapExactOut', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraCpammQuoteSwapExactOut)');
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

    if (!pool || !inputMint || !outputMint || !amountOutRaw) {
      throw new Error('Meteora CP-AMM quote (exact out): set pool, inputMint, outputMint, and amountOutRaw.');
    }

    const payload = {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT',
      pool,
      inputMint,
      outputMint,
      amountOutRaw,
      slippagePercent,
      cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (maximumAmountInRaw) payload.maximumAmountInRaw = maximumAmountInRaw;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Meteora CP-AMM quote (exact out) failed';
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const outAmt = String(action.saveAmountOutVariable || '').trim();
      if (outAmt && response.amountOutRaw) row[outAmt] = response.amountOutRaw;
      const expIn = String(action.saveExpectedInVariable || '').trim();
      if (expIn && response.expectedInAmountRaw) row[expIn] = response.expectedInAmountRaw;
      const maxIn = String(action.saveMaxInVariable || '').trim();
      if (maxIn && response.maxInAmountRaw) row[maxIn] = response.maxInAmountRaw;
      const bpsVar = String(action.saveSlippageBpsVariable || '').trim();
      if (bpsVar && response.slippageBps != null) row[bpsVar] = String(response.slippageBps);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
