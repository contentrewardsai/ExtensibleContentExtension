(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammQuoteSwap', {
    label: 'Meteora CP-AMM quote (swap)',
    defaultAction: {
      type: 'meteoraCpammQuoteSwap',
      runIf: '',
      pool: '',
      inputMint: '',
      outputMint: '',
      amountInRaw: '',
      slippagePercent: 1,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveExpectedOutVariable: 'cpammQuoteExpectedOutRaw',
      saveMinOutVariable: 'cpammQuoteMinOutRaw',
      saveSlippageBpsVariable: '',
    },
    getSummary: function(action) {
      var p = (action.pool || '').toString().trim();
      return p ? 'CP-AMM quote ' + p.slice(0, 8) + '…' : 'Meteora CP-AMM quote (swap)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveExpectedOutVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'quoted out raw' });
      var s2 = (action.saveMinOutVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'min out raw' });
      var s3 = (action.saveSlippageBpsVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'slippage bps' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">No transaction — RPC quote only. Same math as meteoraCpammSwap; use before swap to fill row variables.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount in (raw)</label><input type="text" data-field="amountInRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save quoted out</label><input type="text" data-field="saveExpectedOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExpectedOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save min out</label><input type="text" data-field="saveMinOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveMinOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save slippage bps (optional)</label><input type="text" data-field="saveSlippageBpsVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSlippageBpsVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammQuoteSwap', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'meteoraCpammQuoteSwap' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.pool = (getVal('pool') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountInRaw = (getVal('amountInRaw') || '').trim();
      var sp = parseFloat(getVal('slippagePercent'));
      out.slippagePercent = Number.isFinite(sp) ? Math.min(50, Math.max(0.01, sp)) : 1;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.saveExpectedOutVariable = (getVal('saveExpectedOutVariable') || '').trim();
      out.saveMinOutVariable = (getVal('saveMinOutVariable') || '').trim();
      out.saveSlippageBpsVariable = (getVal('saveSlippageBpsVariable') || '').trim();
      return out;
    },
  });
})();
