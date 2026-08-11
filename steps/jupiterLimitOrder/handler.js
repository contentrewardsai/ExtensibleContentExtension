/**
 * Jupiter Limit Order handler — create / list / cancel via Trigger V2 API.
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

    var limitOperation = String(action.limitOperation || 'create').trim().toLowerCase() || 'create';
    var payload = {
      type: 'CFS_JUPITER_LIMIT_ORDER',
      limitOperation: limitOperation,
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
    };

    if (limitOperation === 'list') {
      /* Auth + GET /orders/history — no create fields required */
    } else if (limitOperation === 'cancel') {
      payload.orderId = r('orderId');
      if (!payload.orderId) {
        throw new Error('Jupiter Limit Order cancel: orderId is required.');
      }
    } else {
      payload.inputMint = r('inputMint');
      payload.outputMint = r('outputMint');
      payload.makingAmount = r('makingAmount');
      payload.triggerPriceUsd = r('triggerPriceUsd');
      payload.orderType = String(action.orderType || 'single').trim();
      payload.slippageBps = parseInt(action.slippageBps, 10) || 50;
      if (payload.orderType === 'oco') {
        if (r('takeProfitPriceUsd')) payload.takeProfitPriceUsd = r('takeProfitPriceUsd');
        if (r('stopLossPriceUsd')) payload.stopLossPriceUsd = r('stopLossPriceUsd');
      }
      if (r('expireInSeconds')) payload.expireInSeconds = r('expireInSeconds');
      if (!payload.inputMint || !payload.outputMint || !payload.makingAmount || !payload.triggerPriceUsd) {
        throw new Error('Jupiter Limit Order create: inputMint, outputMint, makingAmount, and triggerPriceUsd are required.');
      }
    }

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Limit order operation failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveOrderIdVariable || '').trim();
      if (v1 && response.orderId) row[v1] = response.orderId;
      var v2 = String(action.saveVaultVariable || '').trim();
      if (v2 && response.vault) row[v2] = response.vault;
      var v3 = String(action.saveExplorerUrlVariable || '').trim();
      if (v3 && response.explorerUrl) row[v3] = response.explorerUrl;
      var v4 = String(action.saveSignatureVariable || '').trim();
      if (v4 && response.signature) row[v4] = response.signature;
      var v5 = String(action.saveOrdersJsonVariable || '').trim();
      if (v5 && response.ordersJson != null) row[v5] = String(response.ordersJson);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
