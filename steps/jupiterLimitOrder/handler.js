/**
 * Jupiter Limit Order handler — creates vault-based limit orders via Trigger V2 API.
 * Handles full auth flow (challenge → sign → JWT), vault registration, deposit, and order creation.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterLimitOrder', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterLimitOrder)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(field) { return resolveTemplate(String(action[field] != null ? action[field] : '').trim(), row, getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_LIMIT_ORDER',
      inputMint: r('inputMint'),
      outputMint: r('outputMint'),
      makingAmount: r('makingAmount'),
      triggerPriceUsd: r('triggerPriceUsd'),
      orderType: String(action.orderType || 'single').trim(),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
      slippageBps: parseInt(action.slippageBps, 10) || 50,
    };
    if (payload.orderType === 'oco') {
      if (r('takeProfitPriceUsd')) payload.takeProfitPriceUsd = r('takeProfitPriceUsd');
      if (r('stopLossPriceUsd')) payload.stopLossPriceUsd = r('stopLossPriceUsd');
    }
    if (r('expireInSeconds')) payload.expireInSeconds = r('expireInSeconds');

    if (!payload.inputMint || !payload.outputMint || !payload.makingAmount || !payload.triggerPriceUsd) {
      throw new Error('Jupiter Limit Order: inputMint, outputMint, makingAmount, and triggerPriceUsd are required.');
    }

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Limit order creation failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveOrderIdVariable || '').trim();
      if (v1 && response.orderId) row[v1] = response.orderId;
      var v2 = String(action.saveVaultVariable || '').trim();
      if (v2 && response.vault) row[v2] = response.vault;
      var v3 = String(action.saveExplorerUrlVariable || '').trim();
      if (v3 && response.explorerUrl) row[v3] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
