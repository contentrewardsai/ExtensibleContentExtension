(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterEarn', {
    label: 'Jupiter Earn (Deposit/Withdraw)',
    defaultAction: { type: 'jupiterEarn', runIf: '', earnOperation: 'deposit', mint: '', amount: '', cluster: 'mainnet-beta', rpcUrl: '', saveSignatureVariable: 'solanaTxSignature', saveExplorerUrlVariable: 'solanaExplorerUrl' },
    getSummary: function(action) { var op = (action.earnOperation || 'deposit').trim(); return 'Earn ' + op; },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer URL' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var op = (action.earnOperation || 'deposit').trim();
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Deposit to or withdraw from Jupiter Earn vaults. Uses automation wallet.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="earnOperation" data-step="' + i + '"><option value="deposit"' + (op==='deposit'?' selected':'') + '>Deposit (earn yield)</option><option value="withdraw"' + (op==='withdraw'?' selected':'') + '>Withdraw</option></select></div>' +
        '<div class="step-field"><label>Token mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + e((action.mint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Amount (raw)</label><input type="text" data-field="amount" data-step="' + i + '" value="' + e(String(action.amount||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '"><option value="mainnet-beta"' + ((action.cluster||'mainnet-beta')==='mainnet-beta'?' selected':'') + '>mainnet-beta</option><option value="devnet"' + ((action.cluster)==='devnet'?' selected':'') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + e((action.rpcUrl||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save tx signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterEarn', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); if (!el) return ''; return el.value; };
      return { type: 'jupiterEarn', runIf: (g('runIf')||'').trim(), earnOperation: (g('earnOperation')||'deposit').trim(), mint: (g('mint')||'').trim(), amount: (g('amount')||'').trim(), cluster: (g('cluster')||'mainnet-beta').trim(), rpcUrl: (g('rpcUrl')||'').trim(), saveSignatureVariable: (g('saveSignatureVariable')||'').trim(), saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim() };
    },
  });
})();
