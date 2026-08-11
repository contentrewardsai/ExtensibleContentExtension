/**
 * Jupiter DCA handler — create / list / cancel recurring orders via Jupiter Recurring API.
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

    var dcaOperation = String(action.dcaOperation || 'create').trim().toLowerCase() || 'create';
    var payload = {
      type: 'CFS_JUPITER_DCA_CREATE',
      dcaOperation: dcaOperation,
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
    };

    if (dcaOperation === 'list') {
      payload.orderStatus = String(action.orderStatus || 'active').trim() || 'active';
      payload.recurringType = String(action.recurringType || 'time').trim() || 'time';
      if (r('inputMint')) payload.inputMint = r('inputMint');
      if (r('outputMint')) payload.outputMint = r('outputMint');
      if (r('page')) payload.page = r('page');
    } else if (dcaOperation === 'cancel') {
      payload.dcaOrderKey = r('dcaOrderKey');
      payload.recurringType = String(action.recurringType || 'time').trim() || 'time';
      if (!payload.dcaOrderKey) {
        throw new Error('Jupiter DCA cancel: dcaOrderKey (order account) is required.');
      }
    } else {
      payload.inputMint = r('inputMint');
      payload.outputMint = r('outputMint');
      payload.inAmount = r('inAmount');
      payload.inAmountPerCycle = r('inAmountPerCycle');
      payload.cycleSecondsApart = r('cycleSecondsApart');
      if (r('minOutAmountPerCycle')) payload.minOutAmountPerCycle = r('minOutAmountPerCycle');
      if (r('maxOutAmountPerCycle')) payload.maxOutAmountPerCycle = r('maxOutAmountPerCycle');
      if (r('startAt')) payload.startAt = r('startAt');
      if (!payload.inputMint || !payload.outputMint || !payload.inAmount || !payload.inAmountPerCycle || !payload.cycleSecondsApart) {
        throw new Error('Jupiter DCA create: inputMint, outputMint, inAmount, inAmountPerCycle, and cycleSecondsApart are required.');
      }
    }

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'DCA operation failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveDcaOrderKeyVariable || '').trim();
      if (v1 && response.dcaOrderKey) row[v1] = response.dcaOrderKey;
      var v2 = String(action.saveSignatureVariable || '').trim();
      if (v2 && response.signature) row[v2] = response.signature;
      var v3 = String(action.saveExplorerUrlVariable || '').trim();
      if (v3 && response.explorerUrl) row[v3] = response.explorerUrl;
      var v4 = String(action.saveOrdersJsonVariable || '').trim();
      if (v4 && response.ordersJson != null) row[v4] = String(response.ordersJson);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
