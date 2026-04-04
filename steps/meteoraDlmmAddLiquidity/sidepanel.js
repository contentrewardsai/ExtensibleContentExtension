(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraDlmmAddLiquidity', {
    label: 'Meteora DLMM add liquidity',
    defaultAction: {
      type: 'meteoraDlmmAddLiquidity',
      runIf: '',
      lbPair: '',
      totalXAmountRaw: '',
      totalYAmountRaw: '',
      strategyType: 'spot',
      binsEachSide: 10,
      slippagePercent: 1,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      savePositionVariable: 'meteoraPosition',
    },
    getSummary: function(action) {
      var p = (action.lbPair || '').toString().trim();
      return p ? 'Meteora LP + ' + p.slice(0, 8) + '…' : 'Meteora DLMM add liquidity';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.savePositionVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'position pubkey' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var st = (action.strategyType || 'spot').toLowerCase();
      var body =
        '<p class="step-hint">DLMM pools on <strong>meteora.ag</strong>. New position per run; save <code>savePositionVariable</code> for remove/claim.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>LB pair (pool)</label><input type="text" data-field="lbPair" data-step="' + i + '" value="' + escapeHtml((action.lbPair || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Total X (raw)</label><input type="text" data-field="totalXAmountRaw" data-step="' + i + '" value="' + escapeHtml((action.totalXAmountRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Total Y (raw)</label><input type="text" data-field="totalYAmountRaw" data-step="' + i + '" value="' + escapeHtml((action.totalYAmountRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Strategy</label><select data-field="strategyType" data-step="' + i + '">' +
        '<option value="spot"' + (st === 'spot' ? ' selected' : '') + '>Spot</option>' +
        '<option value="curve"' + (st === 'curve' ? ' selected' : '') + '>Curve</option>' +
        '<option value="bidask"' + (st === 'bidask' ? ' selected' : '') + '>Bid-ask</option></select></div>' +
        '<div class="step-field"><label>Bins each side</label><input type="number" data-field="binsEachSide" data-step="' + i + '" value="' + (action.binsEachSide != null ? action.binsEachSide : 10) + '" min="1" max="500"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save position address</label><input type="text" data-field="savePositionVariable" data-step="' + i + '" value="' + escapeHtml((action.savePositionVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraDlmmAddLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraDlmmAddLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.lbPair = (getVal('lbPair') || '').trim();
      out.totalXAmountRaw = (getVal('totalXAmountRaw') || '').trim();
      out.totalYAmountRaw = (getVal('totalYAmountRaw') || '').trim();
      out.strategyType = (getVal('strategyType') || 'spot').trim().toLowerCase();
      out.binsEachSide = Math.min(500, Math.max(1, parseInt(getVal('binsEachSide'), 10) || 10));
      var sp = parseFloat(getVal('slippagePercent'));
      out.slippagePercent = Number.isFinite(sp) ? Math.min(50, Math.max(0.01, sp)) : 1;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.savePositionVariable = (getVal('savePositionVariable') || '').trim();
      return out;
    },
  });
})();
