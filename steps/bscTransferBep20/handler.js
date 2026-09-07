/**
 * Thin alias for ERC20 transfer via CFS_BSC_POOL_EXECUTE (transferErc20).
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
    if (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate) {
      return CFS_templateResolver.resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
    }
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler('bscTransferBep20', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscTransferBep20)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var token = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'token', row, getRowValue) : trimResolved(row, getRowValue, action, action.token));
    var to = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'to', row, getRowValue) : trimResolved(row, getRowValue, action, action.to));
    var amount = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amount', row, getRowValue) : trimResolved(row, getRowValue, action, action.amount));
    if (!token || !to || !amount) {
      throw new Error('bscTransferBep20: set token (contract), to, and amount (uint256 or max/balance).');
    }

    var msg = {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferErc20',
      token: token,
      to: to,
      amount: amount,
      deadline: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'deadline', row, getRowValue) : trimResolved(row, getRowValue, action, action.deadline)),
      waitConfirmations: action.waitConfirmations,
      gasLimit: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasLimit', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasLimit)),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC token transfer failed');
    }

    if (row && typeof row === 'object') {
      var hVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTxHashVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTxHashVariable));
      if (hVar && response.txHash) row[hVar] = response.txHash;
      var eVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveExplorerUrlVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveExplorerUrlVariable));
      if (eVar && response.explorerUrl) row[eVar] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
