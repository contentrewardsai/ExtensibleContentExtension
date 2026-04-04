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

  window.__CFS_registerStepHandler('raydiumClmmDecreaseLiquidity', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmDecreaseLiquidity)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let positionNftMint = resolveTemplate(String(action.positionNftMint || '').trim(), row, getRowValue, action).trim();
    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let liquidityRaw = resolveTemplate(String(action.liquidityRaw != null ? action.liquidityRaw : '').trim(), row, getRowValue, action).trim();
    let amountMinARaw = resolveTemplate(String(action.amountMinARaw != null ? action.amountMinARaw : '').trim(), row, getRowValue, action).trim();
    let amountMinBRaw = resolveTemplate(String(action.amountMinBRaw != null ? action.amountMinBRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;
    const closePosition = action.closePosition === true;

    if (!positionNftMint || !amountMinARaw || !amountMinBRaw) {
      throw new Error('CLMM decrease: set positionNftMint, amountMinARaw, amountMinBRaw. liquidityRaw empty = remove all liquidity.');
    }

    const payload = {
      type: 'CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY',
      positionNftMint,
      amountMinARaw,
      amountMinBRaw,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
      closePosition,
    };
    if (poolId) payload.poolId = poolId;
    if (liquidityRaw) payload.liquidityRaw = liquidityRaw;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM decrease liquidity failed';
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
