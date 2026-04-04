(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammSwap', {
    label: 'Meteora CP-AMM swap',
    defaultAction: {
      type: 'meteoraCpammSwap',
      runIf: '',
      pool: '',
      inputMint: '',
      outputMint: '',
      amountInRaw: '',
      minimumAmountOutRaw: '',
      slippagePercent: 1,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveExpectedOutVariable: '',
      saveMinOutVariable: '',
    },
    getSummary: function(action) {
      var p = (action.pool || '').toString().trim();
      return p ? 'Meteora CP-AMM swap ' + p.slice(0, 8) + '…' : 'Meteora CP-AMM swap';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.saveExpectedOutVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'quoted out raw' });
      var s4 = (action.saveMinOutVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'min out raw' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Exact-in swap on one CP-AMM pool. Mints must be the pool’s token A and B (order = direction).</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount in (raw)</label><input type="text" data-field="amountInRaw" data-step="' + i + '" value="' + escapeHtml((action.amountInRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Min out floor (raw, optional)</label><input type="text" data-field="minimumAmountOutRaw" data-step="' + i + '" value="' + escapeHtml((action.minimumAmountOutRaw || '').toString()) + '" placeholder="e.g. {{cpammQuoteMinOutRaw}}"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Compute unit limit (optional)</label><input type="text" data-field="computeUnitLimit" data-step="' + i + '" value="' + escapeHtml((action.computeUnitLimit || '').toString()) + '" placeholder="400000"></div>' +
        '<div class="step-field"><label>Priority fee (micro-lamports/CU)</label><input type="text" data-field="computeUnitPriceMicroLamports" data-step="' + i + '" value="' + escapeHtml((action.computeUnitPriceMicroLamports || '').toString()) + '" placeholder="50000"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save quoted out (optional)</label><input type="text" data-field="saveExpectedOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExpectedOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save min out (optional)</label><input type="text" data-field="saveMinOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveMinOutVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammSwap', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraCpammSwap' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.pool = (getVal('pool') || '').trim();
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountInRaw = (getVal('amountInRaw') || '').trim();
      out.minimumAmountOutRaw = (getVal('minimumAmountOutRaw') || '').trim();
      var sp = parseFloat(getVal('slippagePercent'));
      out.slippagePercent = Number.isFinite(sp) ? Math.min(50, Math.max(0.01, sp)) : 1;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.saveExpectedOutVariable = (getVal('saveExpectedOutVariable') || '').trim();
      out.saveMinOutVariable = (getVal('saveMinOutVariable') || '').trim();
      return out;
    },
  });
})();
