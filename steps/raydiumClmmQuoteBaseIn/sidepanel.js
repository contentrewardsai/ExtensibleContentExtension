(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmQuoteBaseIn', {
    label: 'Raydium CLMM quote (fixed in)',
    defaultAction: {
      type: 'raydiumClmmQuoteBaseIn',
      runIf: '',
      poolId: '',
      inputMint: '',
      outputMint: '',
      amountInRaw: '',
      slippageBps: 50,
      amountOutMinRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveAmountOutMinVariable: 'clmmQuoteMinOutRaw',
      saveAmountOutExpectedVariable: 'clmmQuoteExpectedOutRaw',
      saveRemainingAccountsCountVariable: '',
      saveAllTradeVariable: '',
    },
    getSummary: function(action) {
      var p = (action.poolId || '').toString().trim();
      return p ? 'CLMM quote in ' + p.slice(0, 8) + '…' : 'Raydium CLMM quote (fixed in)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveAmountOutMinVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'min out raw' });
      var s2 = (action.saveAmountOutExpectedVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'expected out raw' });
      var s3 = (action.saveRemainingAccountsCountVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'remaining accounts count' });
      var s4 = (action.saveAllTradeVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'allTrade' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">No transaction — RPC quote only. Use before raydiumClmmSwap to fill min/expected out variables.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool id</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount in (raw)</label><input type="text" data-field="amountInRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage bps</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (action.slippageBps != null ? action.slippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Min out raw (optional)</label><input type="text" data-field="amountOutMinRaw" data-step="' + i + '" value="' + escapeHtml((action.amountOutMinRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save min out</label><input type="text" data-field="saveAmountOutMinVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutMinVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected out</label><input type="text" data-field="saveAmountOutExpectedVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutExpectedVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save rem. accounts count</label><input type="text" data-field="saveRemainingAccountsCountVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRemainingAccountsCountVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save allTrade</label><input type="text" data-field="saveAllTradeVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAllTradeVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmQuoteBaseIn', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'raydiumClmmQuoteBaseIn' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.poolId = (getVal('poolId') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountInRaw = (getVal('amountInRaw') || '').trim();
      out.slippageBps = parseInt(getVal('slippageBps'), 10) || 50;
      out.amountOutMinRaw = (getVal('amountOutMinRaw') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.saveAmountOutMinVariable = (getVal('saveAmountOutMinVariable') || '').trim();
      out.saveAmountOutExpectedVariable = (getVal('saveAmountOutExpectedVariable') || '').trim();
      out.saveRemainingAccountsCountVariable = (getVal('saveRemainingAccountsCountVariable') || '').trim();
      out.saveAllTradeVariable = (getVal('saveAllTradeVariable') || '').trim();
      return out;
    },
  });
})();
