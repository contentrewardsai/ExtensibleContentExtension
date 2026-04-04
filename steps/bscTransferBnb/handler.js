/**
 * Thin alias for native BNB send via CFS_BSC_POOL_EXECUTE (transferNative).
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler('bscTransferBnb', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscTransferBnb)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var to = trimResolved(row, getRowValue, action, action.to);
    var ethWei = trimResolved(row, getRowValue, action, action.ethWei);
    if (!to || !ethWei) {
      throw new Error('bscTransferBnb: set to (address) and ethWei (wei, or max/balance after gas reserve).');
    }

    var msg = {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferNative',
      to: to,
      ethWei: ethWei,
      deadline: trimResolved(row, getRowValue, action, action.deadline),
      waitConfirmations: action.waitConfirmations,
      gasLimit: trimResolved(row, getRowValue, action, action.gasLimit),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC transfer failed');
    }

    if (row && typeof row === 'object') {
      var hVar = trimResolved(row, getRowValue, action, action.saveTxHashVariable);
      if (hVar && response.txHash) row[hVar] = response.txHash;
      var eVar = trimResolved(row, getRowValue, action, action.saveExplorerUrlVariable);
      if (eVar && response.explorerUrl) row[eVar] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
