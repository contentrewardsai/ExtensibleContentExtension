(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmSwapBaseOut', {
    label: 'Raydium CLMM swap (exact out)',
    defaultAction: {
      type: 'raydiumClmmSwapBaseOut',
      runIf: '',
      poolId: '',
      inputMint: '',
      outputMint: '',
      amountOutRaw: '',
      slippageBps: 50,
      amountInMaxRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveAmountInMaxVariable: '',
      saveAmountInExpectedVariable: '',
      saveAmountOutVariable: '',
    },
    getSummary: function(action) {
      var p = (action.poolId || '').toString().trim();
      return p ? 'Raydium CLMM out ' + p.slice(0, 8) + '…' : 'Raydium CLMM swap (exact out)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.saveAmountInMaxVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'max in raw' });
      var s4 = (action.saveAmountInExpectedVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'expected in raw' });
      var s5 = (action.saveAmountOutVariable || '').trim();
      if (s5) out.push({ rowKey: s5, label: s5, hint: 'amount out raw' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Exact output amount; max spend on input from slippage. See raydiumClmmSwap for fixed **in**.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool id</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount out (raw)</label><input type="text" data-field="amountOutRaw" data-step="' + i + '" value="' + escapeHtml((action.amountOutRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage bps</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (action.slippageBps != null ? action.slippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Max in raw (override)</label><input type="text" data-field="amountInMaxRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInMaxRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save max in (var)</label><input type="text" data-field="saveAmountInMaxVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountInMaxVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected in (var)</label><input type="text" data-field="saveAmountInExpectedVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountInExpectedVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save amount out (var)</label><input type="text" data-field="saveAmountOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmSwapBaseOut', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'raydiumClmmSwapBaseOut' };
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
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.saveAmountInMaxVariable = (getVal('saveAmountInMaxVariable') || '').trim();
      out.saveAmountInExpectedVariable = (getVal('saveAmountInExpectedVariable') || '').trim();
      out.saveAmountOutVariable = (getVal('saveAmountOutVariable') || '').trim();
      return out;
    },
  });
})();
