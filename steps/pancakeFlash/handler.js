/**
 * PancakeSwap V3 Flash handler — executes a flash loan via PancakeSwap V3 on BSC.
 *
 * Flow:  pool.flash() → callback contract swaps → repays pool
 *
 * The transaction calls the deployed CFS flash callback contract which:
 * 1. Receives borrowed tokens from the V3 pool
 * 2. Swaps them via PancakeSwap router
 * 3. Swaps back to the original token
 * 4. Repays the pool (borrowed + fee)
 * 5. Sends any profit to the caller
 *
 * Sends CFS_PANCAKE_FLASH to background.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('pancakeFlash', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (pancakeFlash)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_PANCAKE_FLASH',
      poolAddress: r('poolAddress'),
      borrowToken0: action.borrowToken0 !== false && action.borrowToken0 !== 'false',
      borrowAmount: r('borrowAmount'),
      swapRouter: r('swapRouter') || '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
      swapOutputToken: r('swapOutputToken'),
      slippageBps: parseInt(action.slippageBps, 10) || 50,
      callbackContract: r('callbackContract'),
      rpcUrl: r('rpcUrl') || undefined,
      chainId: parseInt(action.chainId, 10) || 56,
    };

    if (!payload.poolAddress) throw new Error('PancakeSwap Flash: poolAddress is required.');
    if (!payload.borrowAmount) throw new Error('PancakeSwap Flash: borrowAmount is required.');
    if (!payload.callbackContract) throw new Error('PancakeSwap Flash: callbackContract (deployed CFS flash receiver) is required.');

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'PancakeSwap flash failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveHashVariable || '').trim();
      if (v1 && response.txHash) row[v1] = response.txHash;
      var v2 = String(action.saveExplorerUrlVariable || '').trim();
      if (v2 && response.explorerUrl) row[v2] = response.explorerUrl;
      var v3 = String(action.saveProfitVariable || '').trim();
      if (v3 && response.profit != null) row[v3] = String(response.profit);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
