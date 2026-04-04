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

  window.__CFS_registerStepHandler('raydiumClmmIncreasePosition', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmIncreasePosition)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let positionNftMint = resolveTemplate(String(action.positionNftMint || '').trim(), row, getRowValue, action).trim();
    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    const base = String(action.base || 'MintA').trim();
    let baseAmountRaw = resolveTemplate(String(action.baseAmountRaw != null ? action.baseAmountRaw : '').trim(), row, getRowValue, action).trim();
    let otherAmountMaxRaw = resolveTemplate(String(action.otherAmountMaxRaw != null ? action.otherAmountMaxRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!positionNftMint || !baseAmountRaw || !otherAmountMaxRaw) {
      throw new Error('CLMM increase: set positionNftMint, baseAmountRaw, otherAmountMaxRaw.');
    }
    if (base !== 'MintA' && base !== 'MintB') throw new Error('base must be MintA or MintB');

    const payload = {
      type: 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE',
      positionNftMint,
      base,
      baseAmountRaw,
      otherAmountMaxRaw,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    };
    if (poolId) payload.poolId = poolId;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM increase position failed';
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
