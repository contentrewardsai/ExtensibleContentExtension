(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterFlashloan', {
    label: 'Jupiter Flashloan (Borrow → Swap → Repay)',
    defaultAction: { type: 'jupiterFlashloan', runIf: '', borrowMint: '', borrowAmount: '', swapOutputMint: '', slippageBps: 50, cluster: 'mainnet-beta', rpcUrl: '', saveSignatureVariable: 'solanaTxSignature', saveExplorerUrlVariable: 'solanaExplorerUrl', saveProfitVariable: '' },
    getSummary: function(action) {
      var b = (action.borrowMint || '').trim();
      var a = (action.borrowAmount || '').trim();
      return b ? 'Flashloan ' + b.slice(0, 8) + '… ' + (a ? 'amt ' + a.slice(0, 10) : '') : 'Jupiter Flashloan';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer URL' });
      var s3 = (action.saveProfitVariable || '').trim(); if (s3) out.push({ rowKey: s3, label: s3, hint: 'profit estimate' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Zero-fee flashloan via Jupiter Lend. Borrows → swaps → repays atomically. If repayment fails, the entire tx reverts.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Borrow asset mint</label><input type="text" data-field="borrowMint" data-step="' + i + '" value="' + e((action.borrowMint||'').trim()) + '" placeholder="e.g. USDC mint"></div>' +
        '<div class="step-field"><label>Borrow amount (raw)</label><input type="text" data-field="borrowAmount" data-step="' + i + '" value="' + e(String(action.borrowAmount||'').trim()) + '" placeholder="100000000 = 100 USDC"></div>' +
        '<div class="step-field"><label>Swap to mint (arbitrage target)</label><input type="text" data-field="swapOutputMint" data-step="' + i + '" value="' + e((action.swapOutputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Slippage (bps)</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (parseInt(action.slippageBps,10)||50) + '" min="0" max="10000"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '"><option value="mainnet-beta"' + ((action.cluster||'mainnet-beta')==='mainnet-beta'?' selected':'') + '>mainnet-beta</option><option value="devnet"' + ((action.cluster)==='devnet'?' selected':'') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + e((action.rpcUrl||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save tx signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save profit estimate</label><input type="text" data-field="saveProfitVariable" data-step="' + i + '" value="' + e((action.saveProfitVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterFlashloan', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value; };
      var sl = parseInt(g('slippageBps'), 10); if (!Number.isFinite(sl)) sl = 50;
      return { type: 'jupiterFlashloan', runIf: (g('runIf')||'').trim(), borrowMint: (g('borrowMint')||'').trim(), borrowAmount: (g('borrowAmount')||'').trim(), swapOutputMint: (g('swapOutputMint')||'').trim(), slippageBps: Math.min(10000,Math.max(0,sl)), cluster: (g('cluster')||'mainnet-beta').trim(), rpcUrl: (g('rpcUrl')||'').trim(), saveSignatureVariable: (g('saveSignatureVariable')||'').trim(), saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim(), saveProfitVariable: (g('saveProfitVariable')||'').trim() };
    },
  });
})();
