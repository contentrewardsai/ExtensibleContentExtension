(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmOpenPositionFromLiquidity', {
    label: 'Raydium CLMM open (liquidity)',
    defaultAction: {
      type: 'raydiumClmmOpenPositionFromLiquidity',
      runIf: '',
      poolId: '',
      tickLower: '',
      tickUpper: '',
      liquidityRaw: '',
      amountMaxARaw: '',
      amountMaxBRaw: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      savePositionNftVariable: 'clmmPositionNft',
    },
    getSummary: function(action) {
      var p = (action.poolId || '').toString().trim();
      return p ? 'CLMM open+L ' + p.slice(0, 8) + '…' : 'Raydium CLMM open (liquidity)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.savePositionNftVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'position NFT' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">New position via liquidity amount + max A/B (raw). See raydiumClmmOpenPosition for base-side open.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool id</label><input type="text" data-field="poolId" data-step="' + i + '" value="' + escapeHtml((action.poolId || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Tick lower</label><input type="text" data-field="tickLower" data-step="' + i + '" value="' + escapeHtml((action.tickLower || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Tick upper</label><input type="text" data-field="tickUpper" data-step="' + i + '" value="' + escapeHtml((action.tickUpper || '').toString()) + '"></div>' +
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
        '<div class="step-field"><label>Save position NFT var</label><input type="text" data-field="savePositionNftVariable" data-step="' + i + '" value="' + escapeHtml((action.savePositionNftVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('raydiumClmmOpenPositionFromLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'raydiumClmmOpenPositionFromLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.poolId = (getVal('poolId') || '').trim();
      out.tickLower = (getVal('tickLower') || '').trim();
      out.tickUpper = (getVal('tickUpper') || '').trim();
      out.liquidityRaw = (getVal('liquidityRaw') || '').trim();
      out.amountMaxARaw = (getVal('amountMaxARaw') || '').trim();
      out.amountMaxBRaw = (getVal('amountMaxBRaw') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.savePositionNftVariable = (getVal('savePositionNftVariable') || '').trim();
      return out;
    },
  });
})();
