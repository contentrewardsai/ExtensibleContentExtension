/**
 * Pump.fun bonding-curve sell: sell token amount (raw smallest units) for SOL. Not for graduated coins.
 */
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

  window.__CFS_registerStepHandler('solanaPumpfunSell', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaPumpfunSell)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    let tokenAmountRaw = resolveTemplate(String(action.tokenAmountRaw != null ? action.tokenAmountRaw : '').trim(), row, getRowValue, action).trim();
    const slippage = Math.max(0, parseInt(action.slippage, 10) || 1);
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = String(action.rpcUrl || '').trim();
    rpcUrl = resolveTemplate(rpcUrl, row, getRowValue, action).trim();

    if (!mint || !tokenAmountRaw) {
      throw new Error('Pump.fun sell: set token mint and amount to sell (tokenAmountRaw, integer string in token smallest units).');
    }

    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;

    const response = await sendMessage({
      type: 'CFS_PUMPFUN_SELL',
      mint,
      tokenAmountRaw,
      slippage,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
    });

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Pump.fun sell failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) {
        throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      }
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
