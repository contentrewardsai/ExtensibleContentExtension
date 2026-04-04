(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmIncreasePositionFromLiquidity', {
    label: 'Raydium CLMM increase (liquidity)',
    defaultAction: {
      type: 'raydiumClmmIncreasePositionFromLiquidity',
      runIf: '',
      positionNftMint: '',
      poolId: '',
      liquidityRaw: '',
      amountMaxARaw: '',
      amountMaxBRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var n = (action.positionNftMint || '').toString().trim();
      return n ? 'CLMM +L ' + n.slice(0, 6) + '…' : 'Raydium CLMM increase (liquidity)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">liquidityRaw is the CLMM liquidity amount (not token atoms). Caps: amountMaxA/B in raw token units.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Position NFT mint</label><input type="text" data-field="positionNftMint" data-step="' + i + '" value="' + escapeHtml((action.positionNftMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Pool id (optional)</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Liquidity (raw)</label><input type="text" data-field="liquidityRaw" data-step="' + i + '" value="' + escapeHtml((action.liquidityRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Max mint A (raw)</label><input type="text" data-field="amountMaxARaw" data-step="' + i + '" value="' + escapeHtml((action.amountMaxARaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Max mint B (raw)</label><input type="text" data-field="amountMaxBRaw" data-step="' + i + '" value="' + escapeHtml((action.amountMaxBRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmIncreasePositionFromLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'raydiumClmmIncreasePositionFromLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.positionNftMint = (getVal('positionNftMint') || '').trim();
      out.poolId = (getVal('poolId') || '').trim();
      out.liquidityRaw = (getVal('liquidityRaw') || '').trim();
      out.amountMaxARaw = (getVal('amountMaxARaw') || '').trim();
      out.amountMaxBRaw = (getVal('amountMaxBRaw') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
