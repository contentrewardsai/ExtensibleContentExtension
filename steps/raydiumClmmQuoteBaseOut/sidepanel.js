(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmQuoteBaseOut', {
    label: 'Raydium CLMM quote (exact out)',
    defaultAction: {
      type: 'raydiumClmmQuoteBaseOut',
      runIf: '',
      poolId: '',
      inputMint: '',
      outputMint: '',
      amountOutRaw: '',
      slippageBps: 50,
      amountInMaxRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveAmountInMaxVariable: 'clmmQuoteMaxInRaw',
      saveAmountInExpectedVariable: 'clmmQuoteExpectedInRaw',
      saveAmountOutVariable: '',
      saveRemainingAccountsCountVariable: '',
    },
    getSummary: function(action) {
      var p = (action.poolId || '').toString().trim();
      return p ? 'CLMM quote out ' + p.slice(0, 8) + '…' : 'Raydium CLMM quote (exact out)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveAmountInMaxVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'max in raw' });
      var s2 = (action.saveAmountInExpectedVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'expected in raw' });
      var s3 = (action.saveAmountOutVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'amount out raw' });
      var s4 = (action.saveRemainingAccountsCountVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'remaining accounts count' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">No transaction. Use before raydiumClmmSwapBaseOut to inspect max input.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool id</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount out (raw)</label><input type="text" data-field="amountOutRaw" data-step="' + i + '" value="' + escapeHtml((action.amountOutRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage bps</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (action.slippageBps != null ? action.slippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Max in raw (optional)</label><input type="text" data-field="amountInMaxRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInMaxRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save max in</label><input type="text" data-field="saveAmountInMaxVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountInMaxVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected in</label><input type="text" data-field="saveAmountInExpectedVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountInExpectedVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save amount out</label><input type="text" data-field="saveAmountOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save rem. accounts count</label><input type="text" data-field="saveRemainingAccountsCountVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRemainingAccountsCountVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmQuoteBaseOut', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'raydiumClmmQuoteBaseOut' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.poolId = (getVal('poolId') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountOutRaw = (getVal('amountOutRaw') || '').trim();
      out.slippageBps = parseInt(getVal('slippageBps'), 10) || 50;
      out.amountInMaxRaw = (getVal('amountInMaxRaw') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.saveAmountInMaxVariable = (getVal('saveAmountInMaxVariable') || '').trim();
      out.saveAmountInExpectedVariable = (getVal('saveAmountInExpectedVariable') || '').trim();
      out.saveAmountOutVariable = (getVal('saveAmountOutVariable') || '').trim();
      out.saveRemainingAccountsCountVariable = (getVal('saveRemainingAccountsCountVariable') || '').trim();
      return out;
    },
  });
})();
