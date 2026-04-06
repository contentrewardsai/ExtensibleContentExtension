(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterDCA', {
    label: 'Jupiter DCA (Recurring buy)',
    defaultAction: { type: 'jupiterDCA', runIf: '', inputMint: 'So11111111111111111111111111111111111111112', outputMint: '', inAmount: '', inAmountPerCycle: '', cycleSecondsApart: '86400', minOutAmountPerCycle: '', maxOutAmountPerCycle: '', startAt: '', cluster: 'mainnet-beta', rpcUrl: '', saveDcaOrderKeyVariable: 'dcaOrderKey', saveSignatureVariable: 'solanaTxSignature', saveExplorerUrlVariable: 'solanaExplorerUrl' },
    getSummary: function(action) { var o = (action.outputMint || '').trim(); return o ? 'DCA → ' + o.slice(0, 8) + '…' : 'Jupiter DCA'; },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveDcaOrderKeyVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'DCA order key' });
      var s2 = (action.saveSignatureVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'tx signature' });
      var s3 = (action.saveExplorerUrlVariable || '').trim(); if (s3) out.push({ rowKey: s3, label: s3, hint: 'explorer URL' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Create a recurring DCA order via Jupiter. Uses automation wallet.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Input mint (spend)</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + e((action.inputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Output mint (buy)</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + e((action.outputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Total amount (raw)</label><input type="text" data-field="inAmount" data-step="' + i + '" value="' + e(String(action.inAmount||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Amount per cycle (raw)</label><input type="text" data-field="inAmountPerCycle" data-step="' + i + '" value="' + e(String(action.inAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Seconds between cycles</label><input type="text" data-field="cycleSecondsApart" data-step="' + i + '" value="' + e(String(action.cycleSecondsApart||'86400').trim()) + '" placeholder="86400 = daily"></div>' +
        '<div class="step-field"><label>Min output per cycle (optional)</label><input type="text" data-field="minOutAmountPerCycle" data-step="' + i + '" value="' + e(String(action.minOutAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Max output per cycle (optional)</label><input type="text" data-field="maxOutAmountPerCycle" data-step="' + i + '" value="' + e(String(action.maxOutAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Start at (Unix timestamp, optional)</label><input type="text" data-field="startAt" data-step="' + i + '" value="' + e(String(action.startAt||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '"><option value="mainnet-beta"' + ((action.cluster||'mainnet-beta')==='mainnet-beta'?' selected':'') + '>mainnet-beta</option><option value="devnet"' + ((action.cluster)==='devnet'?' selected':'') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + e((action.rpcUrl||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save DCA order key to variable</label><input type="text" data-field="saveDcaOrderKeyVariable" data-step="' + i + '" value="' + e((action.saveDcaOrderKeyVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save tx signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterDCA', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value; };
      return { type: 'jupiterDCA', runIf: (g('runIf')||'').trim(), inputMint: (g('inputMint')||'').trim(), outputMint: (g('outputMint')||'').trim(), inAmount: (g('inAmount')||'').trim(), inAmountPerCycle: (g('inAmountPerCycle')||'').trim(), cycleSecondsApart: (g('cycleSecondsApart')||'').trim(), minOutAmountPerCycle: (g('minOutAmountPerCycle')||'').trim(), maxOutAmountPerCycle: (g('maxOutAmountPerCycle')||'').trim(), startAt: (g('startAt')||'').trim(), cluster: (g('cluster')||'mainnet-beta').trim(), rpcUrl: (g('rpcUrl')||'').trim(), saveDcaOrderKeyVariable: (g('saveDcaOrderKeyVariable')||'').trim(), saveSignatureVariable: (g('saveSignatureVariable')||'').trim(), saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim() };
    },
  });
})();
