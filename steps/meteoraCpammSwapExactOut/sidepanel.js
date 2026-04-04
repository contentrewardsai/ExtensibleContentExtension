(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammSwapExactOut', {
    label: 'Meteora CP-AMM swap (exact out)',
    defaultAction: {
      type: 'meteoraCpammSwapExactOut',
      runIf: '',
      pool: '',
      inputMint: '',
      outputMint: '',
      amountOutRaw: '',
      slippagePercent: 1,
      maximumAmountInRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveAmountOutVariable: '',
      saveExpectedInVariable: '',
      saveMaxInVariable: '',
    },
    getSummary: function(action) {
      var p = (action.pool || '').toString().trim();
      return p ? 'CP-AMM swap out ' + p.slice(0, 8) + '…' : 'Meteora CP-AMM swap (exact out)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.saveAmountOutVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'amount out raw' });
      var s4 = (action.saveExpectedInVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'expected in raw' });
      var s5 = (action.saveMaxInVariable || '').trim();
      if (s5) out.push({ rowKey: s5, label: s5, hint: 'max in raw' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Exact-out swap (swap2). Mints must be the pool token A and B. Optional cap ties to meteoraCpammQuoteSwapExactOut.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml((action.inputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml((action.outputMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Amount out (raw)</label><input type="text" data-field="amountOutRaw" data-step="' + i + '" value="' + escapeHtml((action.amountOutRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cap max in (raw, optional)</label><input type="text" data-field="maximumAmountInRaw" data-step="' + i + '" value="' + escapeHtml((action.maximumAmountInRaw || '').toString()) + '" placeholder="{{cpammQuoteExactOutMaxInRaw}}"></div>' +
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
        '<div class="step-field"><label>Save amount out (optional)</label><input type="text" data-field="saveAmountOutVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAmountOutVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save expected in (optional)</label><input type="text" data-field="saveExpectedInVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExpectedInVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save max in (optional)</label><input type="text" data-field="saveMaxInVariable" data-step="' + i + '" value="' + escapeHtml((action.saveMaxInVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammSwapExactOut', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraCpammSwapExactOut' };
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
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.saveAmountOutVariable = (getVal('saveAmountOutVariable') || '').trim();
      out.saveExpectedInVariable = (getVal('saveExpectedInVariable') || '').trim();
      out.saveMaxInVariable = (getVal('saveMaxInVariable') || '').trim();
      return out;
    },
  });
})();
