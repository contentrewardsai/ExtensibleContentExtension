(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammQuoteSwapExactOut', {
    label: 'Meteora CP-AMM quote (exact out)',
    defaultAction: {
      type: 'meteoraCpammQuoteSwapExactOut',
      runIf: '',
      pool: '',
      inputMint: '',
      outputMint: '',
      amountOutRaw: '',
      slippagePercent: 1,
      maximumAmountInRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveAmountOutVariable: '',
      saveExpectedInVariable: 'cpammQuoteExactOutExpectedInRaw',
      saveMaxInVariable: 'cpammQuoteExactOutMaxInRaw',
      saveSlippageBpsVariable: '',
    },
    getSummary: function(action) {
      var p = (action.pool || '').toString().trim();
      return p ? 'CP-AMM quote out ' + p.slice(0, 8) + '…' : 'Meteora CP-AMM quote (exact out)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s0 = (action.saveAmountOutVariable || '').trim();
      if (s0) out.push({ rowKey: s0, label: s0, hint: 'amount out raw' });
      var s1 = (action.saveExpectedInVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'expected in raw' });
      var s2 = (action.saveMaxInVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'max in raw' });
      var s3 = (action.saveSlippageBpsVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'slippage bps' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">No transaction — exact-out quote (getQuote2). Use before meteoraCpammSwapExactOut.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount out (raw)</label><input type="text" data-field="amountOutRaw" data-step="' + i + '" value="' + escapeHtml((action.amountOutRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cap max in (raw, optional)</label><input type="text" data-field="maximumAmountInRaw" data-step="' + i + '" value="' + escapeHtml((action.maximumAmountInRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save amount out (optional)</label><input type="text" data-field="saveAmountOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected in</label><input type="text" data-field="saveExpectedInVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExpectedInVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save max in</label><input type="text" data-field="saveMaxInVariable" data-step="' + i + '" value="' + escapeHtml((action.saveMaxInVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save slippage bps (optional)</label><input type="text" data-field="saveSlippageBpsVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSlippageBpsVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammQuoteSwapExactOut', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'meteoraCpammQuoteSwapExactOut' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.pool = (getVal('pool') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountOutRaw = (getVal('amountOutRaw') || '').trim();
      var sp = parseFloat(getVal('slippagePercent'));
      out.slippagePercent = Number.isFinite(sp) ? Math.min(50, Math.max(0.01, sp)) : 1;
      out.maximumAmountInRaw = (getVal('maximumAmountInRaw') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.saveAmountOutVariable = (getVal('saveAmountOutVariable') || '').trim();
      out.saveExpectedInVariable = (getVal('saveExpectedInVariable') || '').trim();
      out.saveMaxInVariable = (getVal('saveMaxInVariable') || '').trim();
      out.saveSlippageBpsVariable = (getVal('saveSlippageBpsVariable') || '').trim();
      return out;
    },
  });
})();
