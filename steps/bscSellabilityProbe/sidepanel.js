(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscSellabilityProbe', {
    label: 'BSC sellability probe',
    defaultAction: {
      type: 'bscSellabilityProbe',
      runIf: '',
      token: '',
      spendBnbWei: '',
      spendUsdApprox: 1,
      slippage: '150',
      waitConfirmations: 1,
      gasLimit: '',
      balancePollIntervalMs: 500,
      balancePollMaxMs: 60000,
      forceApprove: false,
      saveSellabilityOkVariable: 'bscSellabilityOk',
      saveVenueVariable: 'bscSellabilityVenue',
      saveSpendBnbWeiVariable: 'bscSellabilitySpendWei',
      saveBuyTxHashVariable: 'bscSellabilityBuyTxHash',
      saveBuyExplorerUrlVariable: 'bscSellabilityBuyExplorerUrl',
      saveSellTxHashVariable: 'bscSellabilitySellTxHash',
      saveSellExplorerUrlVariable: 'bscSellabilitySellExplorerUrl',
      saveTokenReceivedRawVariable: 'bscSellabilityTokenReceivedRaw',
      saveTokenBalanceAfterBuyVariable: 'bscSellabilityTokenBalanceAfterBuy',
    },
    getSummary: function(action) {
      var t = (action.token || '').toString().trim();
      return t ? 'BSC sellability ' + t.slice(0, 8) + '…' : 'BSC sellability probe';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'saveSellabilityOkVariable',
        'saveVenueVariable',
        'saveSpendBnbWeiVariable',
        'saveBuyTxHashVariable',
        'saveBuyExplorerUrlVariable',
        'saveSellTxHashVariable',
        'saveSellExplorerUrlVariable',
        'saveTokenReceivedRawVariable',
        'saveTokenBalanceAfterBuyVariable',
      ];
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        var v = String(action[keys[i]] != null ? action[keys[i]] : '').trim();
        if (v) out.push({ rowKey: v, label: v, hint: keys[i] });
      }
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Mainnet 56: WBNB → token → WBNB via ParaSwap. Approve skipped when allowance already covers the sell (2 txs); else buy + approve + sell.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Token address</label><input type="text" data-field="token" data-step="' + i + '" value="' + escapeHtml((action.token || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Spend BNB wei (overrides USD)</label><input type="text" data-field="spendBnbWei" data-step="' + i + '" value="' + escapeHtml((action.spendBnbWei || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Approx USD spend</label><input type="number" step="any" data-field="spendUsdApprox" data-step="' + i + '" value="' + (action.spendUsdApprox != null ? action.spendUsdApprox : 1) + '"></div>' +
        '<div class="step-field"><label>Slippage (ParaSwap)</label><input type="text" data-field="slippage" data-step="' + i + '" value="' + escapeHtml(String(action.slippage != null ? action.slippage : '150')) + '"></div>' +
        '<div class="step-field"><label>Wait confirmations</label><input type="number" data-field="waitConfirmations" data-step="' + i + '" value="' + (action.waitConfirmations != null ? action.waitConfirmations : 1) + '" min="0" max="64"></div>' +
        '<div class="step-field"><label>gasLimit (optional)</label><input type="text" data-field="gasLimit" data-step="' + i + '" value="' + escapeHtml((action.gasLimit || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="forceApprove" data-step="' + i + '"' + (action.forceApprove === true ? ' checked' : '') + '> Always approve (ignore existing allowance)</label></div>' +
        '<div class="step-field"><label>Balance poll ms</label><input type="number" data-field="balancePollIntervalMs" data-step="' + i + '" value="' + (action.balancePollIntervalMs != null ? action.balancePollIntervalMs : 500) + '"></div>' +
        '<div class="step-field"><label>Balance poll max ms</label><input type="number" data-field="balancePollMaxMs" data-step="' + i + '" value="' + (action.balancePollMaxMs != null ? action.balancePollMaxMs : 60000) + '"></div>' +
        '<div class="step-field"><label>Save ok var</label><input type="text" data-field="saveSellabilityOkVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellabilityOkVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save venue</label><input type="text" data-field="saveVenueVariable" data-step="' + i + '" value="' + escapeHtml((action.saveVenueVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save spend wei</label><input type="text" data-field="saveSpendBnbWeiVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSpendBnbWeiVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save buy tx</label><input type="text" data-field="saveBuyTxHashVariable" data-step="' + i + '" value="' + escapeHtml((action.saveBuyTxHashVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save buy explorer</label><input type="text" data-field="saveBuyExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveBuyExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save sell tx</label><input type="text" data-field="saveSellTxHashVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellTxHashVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save sell explorer</label><input type="text" data-field="saveSellExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save token received raw</label><input type="text" data-field="saveTokenReceivedRawVariable" data-step="' + i + '" value="' + escapeHtml((action.saveTokenReceivedRawVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save balance after buy</label><input type="text" data-field="saveTokenBalanceAfterBuyVariable" data-step="' + i + '" value="' + escapeHtml((action.saveTokenBalanceAfterBuyVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('bscSellabilityProbe', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'bscSellabilityProbe' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.token = (getVal('token') || '').trim();
      out.spendBnbWei = (getVal('spendBnbWei') || '').trim();
      var sua = parseFloat(getVal('spendUsdApprox'));
      out.spendUsdApprox = Number.isFinite(sua) && sua > 0 ? sua : 1;
      out.slippage = (getVal('slippage') || '150').trim();
      out.waitConfirmations = Math.max(0, Math.min(64, parseInt(getVal('waitConfirmations'), 10) || 1));
      out.gasLimit = (getVal('gasLimit') || '').trim();
      var fap = item.querySelector('[data-field="forceApprove"][data-step="' + idx + '"]');
      if (fap && fap.checked) out.forceApprove = true;
      out.balancePollIntervalMs = parseInt(getVal('balancePollIntervalMs'), 10) || 500;
      out.balancePollMaxMs = parseInt(getVal('balancePollMaxMs'), 10) || 60000;
      out.saveSellabilityOkVariable = (getVal('saveSellabilityOkVariable') || '').trim();
      out.saveVenueVariable = (getVal('saveVenueVariable') || '').trim();
      out.saveSpendBnbWeiVariable = (getVal('saveSpendBnbWeiVariable') || '').trim();
      out.saveBuyTxHashVariable = (getVal('saveBuyTxHashVariable') || '').trim();
      out.saveBuyExplorerUrlVariable = (getVal('saveBuyExplorerUrlVariable') || '').trim();
      out.saveSellTxHashVariable = (getVal('saveSellTxHashVariable') || '').trim();
      out.saveSellExplorerUrlVariable = (getVal('saveSellExplorerUrlVariable') || '').trim();
      out.saveTokenReceivedRawVariable = (getVal('saveTokenReceivedRawVariable') || '').trim();
      out.saveTokenBalanceAfterBuyVariable = (getVal('saveTokenBalanceAfterBuyVariable') || '').trim();
      return out;
    },
  });
})();
