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

  function setRowVar(row, varName, value) {
    const n = String(varName || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('raydiumClmmOpenPosition', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmOpenPosition)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    const tickLowerStr = resolveTemplate(String(action.tickLower != null ? action.tickLower : '').trim(), row, getRowValue, action).trim();
    const tickUpperStr = resolveTemplate(String(action.tickUpper != null ? action.tickUpper : '').trim(), row, getRowValue, action).trim();
    const base = String(action.base || 'MintA').trim();
    let baseAmountRaw = resolveTemplate(String(action.baseAmountRaw != null ? action.baseAmountRaw : '').trim(), row, getRowValue, action).trim();
    let otherAmountMaxRaw = resolveTemplate(String(action.otherAmountMaxRaw != null ? action.otherAmountMaxRaw : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!poolId || !tickLowerStr || !tickUpperStr || !baseAmountRaw || !otherAmountMaxRaw) {
      throw new Error('CLMM open: set poolId, tickLower, tickUpper, baseAmountRaw, otherAmountMaxRaw.');
    }
    if (base !== 'MintA' && base !== 'MintB') throw new Error('base must be MintA or MintB');

    const response = await sendMessage({
      type: 'CFS_RAYDIUM_CLMM_OPEN_POSITION',
      poolId,
      tickLower: parseInt(tickLowerStr, 10),
      tickUpper: parseInt(tickUpperStr, 10),
      base,
      baseAmountRaw,
      otherAmountMaxRaw,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Raydium CLMM open position failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      setRowVar(row, action.saveSignatureVariable, response.signature);
      setRowVar(row, action.saveExplorerUrlVariable, response.explorerUrl);
      setRowVar(row, action.savePositionNftVariable, response.positionNftMint);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
