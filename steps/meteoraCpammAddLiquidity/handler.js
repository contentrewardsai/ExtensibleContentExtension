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

  window.__CFS_registerStepHandler('meteoraCpammAddLiquidity', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraCpammAddLiquidity)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue, action).trim();
    let position = resolveTemplate(String(action.position || '').trim(), row, getRowValue, action).trim();
    let totalTokenARaw = resolveTemplate(String(action.totalTokenARaw != null ? action.totalTokenARaw : '').trim(), row, getRowValue, action).trim();
    let totalTokenBRaw = resolveTemplate(String(action.totalTokenBRaw != null ? action.totalTokenBRaw : '').trim(), row, getRowValue, action).trim();
    if (totalTokenARaw === '') totalTokenARaw = '0';
    if (totalTokenBRaw === '') totalTokenBRaw = '0';
    const slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    if (!pool && !position) {
      throw new Error('Meteora CP-AMM add: set pool (new position) or position (increase existing).');
    }

    const payload = {
      type: 'CFS_METEORA_CPAMM_ADD_LIQUIDITY',
      totalTokenARaw,
      totalTokenBRaw,
      slippagePercent,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    };
    if (pool) payload.pool = pool;
    if (position) payload.position = position;
    const cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue, action).trim();
    const cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue, action).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Meteora CP-AMM add liquidity failed';
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
      const nftVar = String(action.savePositionNftMintVariable || '').trim();
      if (nftVar && response.positionNftMint) row[nftVar] = response.positionNftMint;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
