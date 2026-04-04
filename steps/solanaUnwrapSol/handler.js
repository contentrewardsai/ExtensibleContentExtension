/**
 * Unwrap WSOL: close automation wallet’s WSOL ATA (sends lamports to wallet).
 */
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

  function setRowVar(row, action, key, value) {
    const name = String(action[key] || '').trim();
    if (name && row && typeof row === 'object') row[name] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('solanaUnwrapSol', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaUnwrapSol)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    const payload = {
      type: 'CFS_SOLANA_UNWRAP_WSOL',
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };

    const cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue, action).trim();
    const cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue, action).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Unwrap WSOL failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) {
        throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      }
      throw new Error(err);
    }

    setRowVar(row, action, 'saveAtaAddressVariable', response.ataAddress || '');
    setRowVar(row, action, 'saveAmountRawVariable', response.amountRaw != null ? response.amountRaw : '');
    const sigVar = String(action.saveSignatureVariable || '').trim();
    if (sigVar && response.signature) row[sigVar] = response.signature;
    const expVar = String(action.saveExplorerUrlVariable || '').trim();
    if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
