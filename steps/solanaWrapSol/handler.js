/**
 * Wrap native SOL into WSOL (classic NATIVE_MINT) without Jupiter.
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

  window.__CFS_registerStepHandler('solanaWrapSol', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaWrapSol)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let lamports = resolveTemplate(String(action.lamports != null ? action.lamports : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!lamports) throw new Error('Wrap SOL: set lamports to wrap into WSOL.');

    const payload = {
      type: 'CFS_SOLANA_WRAP_SOL',
      lamports,
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
      const err = (response && response.error) ? response.error : 'Wrap SOL failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) {
        throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      }
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const ataVar = String(action.saveAtaAddressVariable || '').trim();
      if (ataVar && response.ataAddress) row[ataVar] = response.ataAddress;
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
