/**
 * Jupiter DCA handler — creates a recurring DCA order via Jupiter Recurring API.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterDCA', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterDCA)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(field) { return resolveTemplate(String(action[field] != null ? action[field] : '').trim(), row, getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_DCA_CREATE',
      inputMint: r('inputMint'),
      outputMint: r('outputMint'),
      inAmount: r('inAmount'),
      inAmountPerCycle: r('inAmountPerCycle'),
      cycleSecondsApart: r('cycleSecondsApart'),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
    };
    if (r('minOutAmountPerCycle')) payload.minOutAmountPerCycle = r('minOutAmountPerCycle');
    if (r('maxOutAmountPerCycle')) payload.maxOutAmountPerCycle = r('maxOutAmountPerCycle');
    if (r('startAt')) payload.startAt = r('startAt');

    if (!payload.inputMint || !payload.outputMint || !payload.inAmount || !payload.inAmountPerCycle || !payload.cycleSecondsApart) {
      throw new Error('Jupiter DCA: inputMint, outputMint, inAmount, inAmountPerCycle, and cycleSecondsApart are required.');
    }

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'DCA creation failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveDcaOrderKeyVariable || '').trim();
      if (v1 && response.dcaOrderKey) row[v1] = response.dcaOrderKey;
      var v2 = String(action.saveSignatureVariable || '').trim();
      if (v2 && response.signature) row[v2] = response.signature;
      var v3 = String(action.saveExplorerUrlVariable || '').trim();
      if (v3 && response.explorerUrl) row[v3] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
