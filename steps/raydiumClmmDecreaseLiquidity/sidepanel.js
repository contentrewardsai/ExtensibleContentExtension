(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmDecreaseLiquidity', {
    label: 'Raydium CLMM decrease liquidity',
    defaultAction: {
      type: 'raydiumClmmDecreaseLiquidity',
      runIf: '',
      positionNftMint: '',
      poolId: '',
      liquidityRaw: '',
      amountMinARaw: '0',
      amountMinBRaw: '0',
      closePosition: false,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var n = (action.positionNftMint || '').toString().trim();
      return n ? 'CLMM decr ' + n.slice(0, 6) + '…' : 'Raydium CLMM decrease liquidity';
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
        '<p class="step-hint">Wallet must hold the position NFT. Empty liquidity = max.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Position NFT mint</label><input type="text" data-field="positionNftMint" data-step="' + i + '" value="' + escapeHtml((action.positionNftMint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Pool id (optional)</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Liquidity raw (empty=max)</label><input type="text" data-field="liquidityRaw" data-step="' + i + '" value="' + escapeHtml((action.liquidityRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Min A out (raw)</label><input type="text" data-field="amountMinARaw" data-step="' + i + '" value="' + escapeHtml((action.amountMinARaw != null ? action.amountMinARaw : '0').toString()) + '"></div>' +
        '<div class="step-field"><label>Min B out (raw)</label><input type="text" data-field="amountMinBRaw" data-step="' + i + '" value="' + escapeHtml((action.amountMinBRaw != null ? action.amountMinBRaw : '0').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="closePosition" data-step="' + i + '"' + (action.closePosition === true ? ' checked' : '') + '> Close position</label></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmDecreaseLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'raydiumClmmDecreaseLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.positionNftMint = (getVal('positionNftMint') || '').trim();
      out.poolId = (getVal('poolId') || '').trim();
      out.liquidityRaw = (getVal('liquidityRaw') || '').trim();
      out.amountMinARaw = (getVal('amountMinARaw') || '').trim();
      out.amountMinBRaw = (getVal('amountMinBRaw') || '').trim();
      out.closePosition = getVal('closePosition') === true;
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
