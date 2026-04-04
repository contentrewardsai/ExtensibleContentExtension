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

  window.__CFS_registerStepHandler('raydiumCpmmRemoveLiquidity', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumCpmmRemoveLiquidity)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let lpAmountRaw = resolveTemplate(String(action.lpAmountRaw != null ? action.lpAmountRaw : '').trim(), row, getRowValue, action).trim();
    const slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;
    const closeWsol = action.closeWsol !== false;

    if (!poolId || !lpAmountRaw) throw new Error('Raydium CPMM remove: set poolId and lpAmountRaw.');

    const response = await sendMessage({
      type: 'CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY',
      poolId,
      lpAmountRaw,
      slippageBps,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
      closeWsol,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CPMM remove liquidity failed';
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
