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

  window.__CFS_registerStepHandler('raydiumRemoveLiquidity', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumRemoveLiquidity)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let lpAmountRaw = resolveTemplate(String(action.lpAmountRaw != null ? action.lpAmountRaw : '').trim(), row, getRowValue, action).trim();
    let baseAmountMinRaw = resolveTemplate(String(action.baseAmountMinRaw != null ? action.baseAmountMinRaw : '').trim(), row, getRowValue, action).trim();
    let quoteAmountMinRaw = resolveTemplate(String(action.quoteAmountMinRaw != null ? action.quoteAmountMinRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!poolId || !lpAmountRaw || baseAmountMinRaw === '' || quoteAmountMinRaw === '') {
      throw new Error('Raydium remove liquidity: set poolId, lpAmountRaw, baseAmountMinRaw, quoteAmountMinRaw (apply slippage to min outs off-chain).');
    }

    const response = await sendMessage({
      type: 'CFS_RAYDIUM_REMOVE_LIQUIDITY',
      poolId,
      lpAmountRaw,
      baseAmountMinRaw,
      quoteAmountMinRaw,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium remove liquidity failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
