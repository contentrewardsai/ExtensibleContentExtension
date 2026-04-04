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

  window.__CFS_registerStepHandler('raydiumClmmCollectRewards', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmCollectRewards)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    let rewardMints = resolveTemplate(String(action.rewardMints != null ? action.rewardMints : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!poolId || !rewardMints) {
      throw new Error('CLMM collect rewards: set poolId and rewardMints (comma/space-separated mints).');
    }

    const response = await sendMessage({
      type: 'CFS_RAYDIUM_CLMM_COLLECT_REWARDS',
      poolId,
      rewardMints,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM collect rewards failed';
      const logs = response && response.simulationLogs;
      const extra = response && response.completedCount != null
        ? ' (completed ' + response.completedCount + ' tx before failure)'
        : '';
      if (logs && logs.length) throw new Error(err + extra + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err + extra);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
      const listVar = String(action.saveSignaturesListVariable || '').trim();
      if (listVar && Array.isArray(response.signatures) && response.signatures.length) {
        row[listVar] = response.signatures.join(',');
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
