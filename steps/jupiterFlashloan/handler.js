/**
 * Jupiter Flashloan handler — executes a zero-fee flashloan via Jupiter Lend.
 *
 * Flow:  Borrow A → Swap A→B (Jupiter V2 /build) → Swap B→A (Jupiter V2 /build) → Repay A
 *
 * The entire transaction is atomic — if repayment fails, everything reverts.
 * Sends CFS_JUPITER_FLASHLOAN to background, which constructs the borrow/payback
 * instructions and sandwiches the swap instructions between them.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterFlashloan', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterFlashloan)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_FLASHLOAN',
      borrowMint: r('borrowMint'),
      borrowAmount: r('borrowAmount'),
      swapOutputMint: r('swapOutputMint'),
      slippageBps: parseInt(action.slippageBps, 10) || 50,
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
    };

    if (!payload.borrowMint || !payload.borrowAmount || !payload.swapOutputMint) {
      throw new Error('Jupiter Flashloan: borrowMint, borrowAmount, and swapOutputMint are all required.');
    }

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Flashloan failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveSignatureVariable || '').trim();
      if (v1 && response.signature) row[v1] = response.signature;
      var v2 = String(action.saveExplorerUrlVariable || '').trim();
      if (v2 && response.explorerUrl) row[v2] = response.explorerUrl;
      var v3 = String(action.saveProfitVariable || '').trim();
      if (v3 && response.profitEstimate != null) row[v3] = String(response.profitEstimate);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
