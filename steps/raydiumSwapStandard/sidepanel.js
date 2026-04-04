(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumSwapStandard', {
    label: 'Raydium swap (Standard)',
    defaultAction: {
      type: 'raydiumSwapStandard',
      runIf: '',
      poolId: '',
      inputMint: '',
      outputMint: '',
      amountInRaw: '',
      slippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveAmountOutMinVariable: '',
      saveAmountOutExpectedVariable: '',
    },
    getSummary: function(action) {
      var p = (action.poolId || '').toString().trim();
      return p ? 'Raydium swap ' + p.slice(0, 8) + '…' : 'Raydium swap (Standard)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.saveAmountOutMinVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'min out raw' });
      var s4 = (action.saveAmountOutExpectedVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'expected out raw' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Standard AMM only; input/output mints must match pool legs. WSOL uses wrapped mint.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool id</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount in (raw)</label><input type="text" data-field="amountInRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage bps</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (action.slippageBps != null ? action.slippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save min out (var)</label><input type="text" data-field="saveAmountOutMinVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutMinVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected out (var)</label><input type="text" data-field="saveAmountOutExpectedVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutExpectedVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumSwapStandard', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'raydiumSwapStandard' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.poolId = (getVal('poolId') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountInRaw = (getVal('amountInRaw') || '').trim();
      out.slippageBps = parseInt(getVal('slippageBps'), 10) || 50;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.saveAmountOutMinVariable = (getVal('saveAmountOutMinVariable') || '').trim();
      out.saveAmountOutExpectedVariable = (getVal('saveAmountOutExpectedVariable') || '').trim();
      return out;
    },
  });
})();
