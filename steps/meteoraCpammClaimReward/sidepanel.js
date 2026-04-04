(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammClaimReward', {
    label: 'Meteora CP-AMM claim incentive',
    defaultAction: {
      type: 'meteoraCpammClaimReward',
      runIf: '',
      pool: '',
      position: '',
      rewardIndex: 0,
      isSkipReward: false,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var pos = (action.position || '').toString().trim();
      var idx = action.rewardIndex != null ? action.rewardIndex : 0;
      return pos ? 'Meteora incentive r' + idx + ' ' + pos.slice(0, 6) + '…' : 'Meteora CP-AMM claim incentive';
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
      var ri = action.rewardIndex != null ? action.rewardIndex : 0;
      var body =
        '<p class="step-hint">Farming / incentive mints (not swap fees). Use <strong>claim fees</strong> for LP trading fees.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool (optional)</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Position</label><input type="text" data-field="position" data-step="' + i + '" value="' + escapeHtml((action.position || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Reward index</label><select data-field="rewardIndex" data-step="' + i + '">' +
        '<option value="0"' + (Number(ri) === 0 ? ' selected' : '') + '>0</option>' +
        '<option value="1"' + (Number(ri) === 1 ? ' selected' : '') + '>1</option></select></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="isSkipReward" data-step="' + i + '"' + (action.isSkipReward === true ? ' checked' : '') + '> isSkipReward (SDK)</label></div>' +
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
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammClaimReward', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraCpammClaimReward' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.pool = (getVal('pool') || '').trim();
      out.position = (getVal('position') || '').trim();
      var ri = parseInt(getVal('rewardIndex'), 10);
      out.rewardIndex = ri === 1 ? 1 : 0;
      out.isSkipReward = getVal('isSkipReward') === true;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
