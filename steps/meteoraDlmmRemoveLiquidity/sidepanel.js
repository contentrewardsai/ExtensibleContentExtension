(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraDlmmRemoveLiquidity', {
    label: 'Meteora DLMM remove liquidity',
    defaultAction: {
      type: 'meteoraDlmmRemoveLiquidity',
      runIf: '',
      lbPair: '',
      position: '',
      removeBps: 10000,
      shouldClaimAndClose: true,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var pos = (action.position || '').toString().trim();
      return pos ? 'Meteora remove ' + pos.slice(0, 8) + '…' : 'Meteora DLMM remove liquidity';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'last signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var claimClose = action.shouldClaimAndClose !== false;
      var body =
        '<p class="step-hint">Uses your position’s on-chain bin range. Multiple txs possible; last signature saved.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>LB pair</label><input type="text" data-field="lbPair" data-step="' + i + '" value="' + escapeHtml((action.lbPair || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Position</label><input type="text" data-field="position" data-step="' + i + '" value="' + escapeHtml((action.position || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Remove bps</label><input type="number" data-field="removeBps" data-step="' + i + '" value="' + (action.removeBps != null ? action.removeBps : 10000) + '" min="1" max="10000"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="shouldClaimAndClose" data-step="' + i + '"' + (claimClose ? ' checked' : '') + '> Claim & close (full remove)</label></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraDlmmRemoveLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraDlmmRemoveLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.lbPair = (getVal('lbPair') || '').trim();
      out.position = (getVal('position') || '').trim();
      out.removeBps = Math.min(10000, Math.max(1, parseInt(getVal('removeBps'), 10) || 10000));
      out.shouldClaimAndClose = getVal('shouldClaimAndClose') === true;
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
