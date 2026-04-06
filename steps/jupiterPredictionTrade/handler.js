/**
 * Jupiter Prediction Market — Trade (buy/sell/close/claim)
 * Creates orders and submits signed transactions.
 */
(function() {
  'use strict';
  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterPredictionTrade', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterPredictionTrade)');
    var row = ctx.currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, ctx.getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_PREDICTION_TRADE',
      operation: String(action.operation || 'buyOrder').trim(),
      marketId: r('marketId') || undefined,
      isYes: action.isYes === true || action.isYes === 'true',
      amount: r('amount') || undefined,
      limitPrice: r('limitPrice') || undefined,
      positionPubkey: r('positionPubkey') || undefined,
    };

    var response = await ctx.sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Prediction trade failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveSignatureVariable || '').trim();
      if (v1 && response.signature) row[v1] = response.signature;
      var v2 = String(action.saveExplorerUrlVariable || '').trim();
      if (v2 && response.explorerUrl) row[v2] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
