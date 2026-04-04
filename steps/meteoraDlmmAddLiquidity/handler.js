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

  window.__CFS_registerStepHandler('meteoraDlmmAddLiquidity', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraDlmmAddLiquidity)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let lbPair = resolveTemplate(String(action.lbPair || '').trim(), row, getRowValue, action).trim();
    let totalXAmountRaw = resolveTemplate(String(action.totalXAmountRaw != null ? action.totalXAmountRaw : '').trim(), row, getRowValue, action).trim();
    let totalYAmountRaw = resolveTemplate(String(action.totalYAmountRaw != null ? action.totalYAmountRaw : '').trim(), row, getRowValue, action).trim();
    if (totalXAmountRaw === '') totalXAmountRaw = '0';
    if (totalYAmountRaw === '') totalYAmountRaw = '0';
    const strategyType = String(action.strategyType || 'spot').trim().toLowerCase();
    const binsEachSide = Math.min(500, Math.max(1, parseInt(action.binsEachSide, 10) || 10));
    const slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!lbPair) throw new Error('Meteora DLMM add: set lbPair (pool address from Meteora).');

    const response = await sendMessage({
      type: 'CFS_METEORA_DLMM_ADD_LIQUIDITY',
      lbPair,
      totalXAmountRaw,
      totalYAmountRaw,
      strategyType,
      binsEachSide,
      slippagePercent,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Meteora DLMM add liquidity failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
      const posVar = String(action.savePositionVariable || '').trim();
      if (posVar && response.positionAddress) row[posVar] = response.positionAddress;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
