/**
 * BSC DEX aggregation via ParaSwap API (build + sign). Mainnet chain 56 only.
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

  window.__CFS_registerStepHandler('bscAggregatorSwap', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscAggregatorSwap)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var srcToken = trimResolved(row, getRowValue, action, action.srcToken);
    var destToken = trimResolved(row, getRowValue, action, action.destToken);
    var amount = trimResolved(row, getRowValue, action, action.amount);
    var side = trimResolved(row, getRowValue, action, action.side) || 'SELL';
    if (!srcToken || !destToken || !amount) {
      throw new Error('bscAggregatorSwap: set srcToken, destToken, and amount (smallest units). Use native or WBNB address for BNB.');
    }

    var msg = {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'paraswapSwap',
      srcToken: srcToken,
      destToken: destToken,
      amount: amount,
      side: side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      slippage: trimResolved(row, getRowValue, action, action.slippage),
      waitConfirmations: action.waitConfirmations,
      gasLimit: trimResolved(row, getRowValue, action, action.gasLimit),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC aggregator swap failed');
    }

    if (row && typeof row === 'object') {
      var hVar = trimResolved(row, getRowValue, action, action.saveTxHashVariable);
      if (hVar && response.txHash) row[hVar] = response.txHash;
      var eVar = trimResolved(row, getRowValue, action, action.saveExplorerUrlVariable);
      if (eVar && response.explorerUrl) row[eVar] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
