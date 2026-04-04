/**
 * Buy small WBNB notional via ParaSwap then sell back. Message: CFS_BSC_SELLABILITY_PROBE.
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, name, value) {
    var n = String(name || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('bscSellabilityProbe', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscSellabilityProbe)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var token = resolveTemplate(String(action.token || '').trim(), row, getRowValue, action).trim();
    var spendBnbWei = resolveTemplate(String(action.spendBnbWei != null ? action.spendBnbWei : '').trim(), row, getRowValue, action).trim();
    var gasLimit = resolveTemplate(String(action.gasLimit != null ? action.gasLimit : '').trim(), row, getRowValue, action).trim();

    var spendUsdApprox = action.spendUsdApprox;
    if (spendUsdApprox != null && String(spendUsdApprox).trim() !== '') {
      var s = resolveTemplate(String(spendUsdApprox).trim(), row, getRowValue, action).trim();
      var n = parseFloat(s);
      if (Number.isFinite(n) && n > 0) spendUsdApprox = n;
    }

    if (!token) throw new Error('BSC sellability probe: set token (BEP-20) address.');

    var payload = {
      type: 'CFS_BSC_SELLABILITY_PROBE',
      token: token,
      slippage:
        action.slippage != null && String(action.slippage).trim() !== ''
          ? Math.min(5000, Math.max(0, Number(action.slippage)))
          : 150,
      waitConfirmations: Math.max(0, Math.min(64, parseInt(action.waitConfirmations, 10) || 1)),
      balancePollIntervalMs: parseInt(action.balancePollIntervalMs, 10) || 500,
      balancePollMaxMs: parseInt(action.balancePollMaxMs, 10) || 60000,
    };
    if (spendBnbWei) payload.spendBnbWei = spendBnbWei;
    else if (spendUsdApprox != null && Number.isFinite(Number(spendUsdApprox)) && Number(spendUsdApprox) > 0) {
      payload.spendUsdApprox = Number(spendUsdApprox);
    }
    if (gasLimit) payload.gasLimit = gasLimit;
    if (action.forceApprove === true) payload.forceApprove = true;

    var response = await sendMessage(payload);
    if (!response || !response.ok) {
      var err = (response && response.error) ? response.error : 'BSC sellability probe failed';
      setRowVar(row, action.saveSellabilityOkVariable, 'false');
      if (response && response.venue) setRowVar(row, action.saveVenueVariable, response.venue);
      if (response && response.tokenReceivedRaw) setRowVar(row, action.saveTokenReceivedRawVariable, response.tokenReceivedRaw);
      if (response && response.buyTxHash) setRowVar(row, action.saveBuyTxHashVariable, response.buyTxHash);
      if (response && response.buyExplorerUrl) setRowVar(row, action.saveBuyExplorerUrlVariable, response.buyExplorerUrl);
      throw new Error(err);
    }

    setRowVar(row, action.saveSellabilityOkVariable, 'true');
    setRowVar(row, action.saveVenueVariable, response.venue || 'paraswap');
    setRowVar(row, action.saveSpendBnbWeiVariable, response.spendBnbWei || '');
    setRowVar(row, action.saveBuyTxHashVariable, response.buyTxHash || '');
    setRowVar(row, action.saveBuyExplorerUrlVariable, response.buyExplorerUrl || '');
    setRowVar(row, action.saveSellTxHashVariable, response.sellTxHash || '');
    setRowVar(row, action.saveSellExplorerUrlVariable, response.sellExplorerUrl || '');
    setRowVar(row, action.saveTokenReceivedRawVariable, response.tokenReceivedRaw || '');
    setRowVar(row, action.saveTokenBalanceAfterBuyVariable, response.tokenBalanceAfterBuy || '');
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
