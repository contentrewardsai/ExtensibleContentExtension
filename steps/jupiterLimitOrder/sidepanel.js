(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterLimitOrder', {
    label: 'Jupiter Limit Order (Trigger V2)',
    defaultAction: {
      type: 'jupiterLimitOrder',
      runIf: '',
      limitOperation: 'create',
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: '',
      makingAmount: '',
      triggerPriceUsd: '',
      orderType: 'single',
      takeProfitPriceUsd: '',
      stopLossPriceUsd: '',
      expireInSeconds: '',
      slippageBps: 50,
      orderId: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveOrderIdVariable: 'jupiterOrderId',
      saveVaultVariable: 'jupiterVault',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveSignatureVariable: '',
      saveOrdersJsonVariable: '',
    },
    getSummary: function(action) {
      var op = String(action.limitOperation || 'create').trim();
      if (op === 'list') return 'Limit list';
      if (op === 'cancel') return 'Limit cancel';
      var p = (action.triggerPriceUsd || '').trim();
      return p ? 'Limit @ $' + p : 'Jupiter Limit Order';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveOrderIdVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'order ID' });
      var s2 = (action.saveVaultVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'vault address' });
      var s3 = (action.saveExplorerUrlVariable || '').trim(); if (s3) out.push({ rowKey: s3, label: s3, hint: 'explorer URL' });
      var s4 = (action.saveSignatureVariable || '').trim(); if (s4) out.push({ rowKey: s4, label: s4, hint: 'tx signature' });
      var s5 = (action.saveOrdersJsonVariable || '').trim(); if (s5) out.push({ rowKey: s5, label: s5, hint: 'orders JSON' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var ot = (action.orderType || 'single').trim();
      var op = String(action.limitOperation || 'create').trim();
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Create, list, or cancel vault-based limit orders via Jupiter Trigger V2. Auth handled automatically.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="limitOperation" data-step="' + i + '">' +
          '<option value="create"' + (op==='create'?' selected':'') + '>Create</option>' +
          '<option value="list"' + (op==='list'?' selected':'') + '>List / history</option>' +
          '<option value="cancel"' + (op==='cancel'?' selected':'') + '>Cancel (withdraw)</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Input mint (sell)</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + e((action.inputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Output mint (buy)</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + e((action.outputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Amount to sell (raw) — create</label><input type="text" data-field="makingAmount" data-step="' + i + '" value="' + e(String(action.makingAmount||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Trigger price (USD) — create</label><input type="text" data-field="triggerPriceUsd" data-step="' + i + '" value="' + e(String(action.triggerPriceUsd||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Order type</label><select data-field="orderType" data-step="' + i + '"><option value="single"' + (ot==='single'?' selected':'') + '>Single price</option><option value="oco"' + (ot==='oco'?' selected':'') + '>OCO (TP/SL)</option></select></div>' +
        '<div class="step-field"><label>Take profit USD (OCO)</label><input type="text" data-field="takeProfitPriceUsd" data-step="' + i + '" value="' + e(String(action.takeProfitPriceUsd||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Stop loss USD (OCO)</label><input type="text" data-field="stopLossPriceUsd" data-step="' + i + '" value="' + e(String(action.stopLossPriceUsd||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Expire in seconds</label><input type="text" data-field="expireInSeconds" data-step="' + i + '" value="' + e(String(action.expireInSeconds||'').trim()) + '" placeholder="0 = no expiry"></div>' +
        '<div class="step-field"><label>Slippage (bps)</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (parseInt(action.slippageBps,10)||50) + '" min="0" max="10000"></div>' +
        '<div class="step-field"><label>Order ID (cancel)</label><input type="text" data-field="orderId" data-step="' + i + '" value="' + e(String(action.orderId||'').trim()) + '" placeholder="{{jupiterOrderId}}"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '"><option value="mainnet-beta"' + ((action.cluster||'mainnet-beta')==='mainnet-beta'?' selected':'') + '>mainnet-beta</option><option value="devnet"' + ((action.cluster)==='devnet'?' selected':'') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + e((action.rpcUrl||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save order ID to variable</label><input type="text" data-field="saveOrderIdVariable" data-step="' + i + '" value="' + e((action.saveOrderIdVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save vault to variable</label><input type="text" data-field="saveVaultVariable" data-step="' + i + '" value="' + e((action.saveVaultVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save signature (cancel)</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save orders JSON (list)</label><input type="text" data-field="saveOrdersJsonVariable" data-step="' + i + '" value="' + e((action.saveOrdersJsonVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterLimitOrder', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value; };
      var sl = parseInt(g('slippageBps'), 10); if (!Number.isFinite(sl)) sl = 50;
      return {
        type: 'jupiterLimitOrder',
        runIf: (g('runIf')||'').trim(),
        limitOperation: (g('limitOperation')||'create').trim(),
        inputMint: (g('inputMint')||'').trim(),
        outputMint: (g('outputMint')||'').trim(),
        makingAmount: (g('makingAmount')||'').trim(),
        triggerPriceUsd: (g('triggerPriceUsd')||'').trim(),
        orderType: (g('orderType')||'single').trim(),
        takeProfitPriceUsd: (g('takeProfitPriceUsd')||'').trim(),
        stopLossPriceUsd: (g('stopLossPriceUsd')||'').trim(),
        expireInSeconds: (g('expireInSeconds')||'').trim(),
        slippageBps: Math.min(10000,Math.max(0,sl)),
        orderId: (g('orderId')||'').trim(),
        cluster: (g('cluster')||'mainnet-beta').trim(),
        rpcUrl: (g('rpcUrl')||'').trim(),
        saveOrderIdVariable: (g('saveOrderIdVariable')||'').trim(),
        saveVaultVariable: (g('saveVaultVariable')||'').trim(),
        saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim(),
        saveSignatureVariable: (g('saveSignatureVariable')||'').trim(),
        saveOrdersJsonVariable: (g('saveOrdersJsonVariable')||'').trim(),
      };
    },
  });
})();
