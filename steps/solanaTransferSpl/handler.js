/**
 * SPL Token transfer (classic Token or Token-2022) from the automation wallet's ATA.
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

  window.__CFS_registerStepHandler('solanaTransferSpl', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaTransferSpl)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    let toOwner = resolveTemplate(String(action.toOwner != null ? action.toOwner : '').trim(), row, getRowValue, action).trim();
    if (!toOwner) {
      toOwner = resolveTemplate(String(action.toPubkey || '').trim(), row, getRowValue, action).trim();
    }
    let amountRaw = resolveTemplate(String(action.amountRaw != null ? action.amountRaw : '').trim(), row, getRowValue, action).trim();
    const tokenProgram = String(action.tokenProgram || 'token').trim();
    const createDestinationAta = action.createDestinationAta !== false;
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = String(action.rpcUrl || '').trim();
    rpcUrl = resolveTemplate(rpcUrl, row, getRowValue, action).trim();

    if (!mint || !toOwner || !amountRaw) {
      throw new Error('SPL transfer: set mint, toOwner (wallet address), and amountRaw (smallest units).');
    }

    const payload = {
      type: 'CFS_SOLANA_TRANSFER_SPL',
      mint,
      toOwner,
      amountRaw,
      tokenProgram,
      createDestinationAta,
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
      const err = (response && response.error) ? response.error : 'SPL transfer failed';
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
