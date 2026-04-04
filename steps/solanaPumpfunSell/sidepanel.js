(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaPumpfunSell', {
    label: 'Solana Pump.fun sell',
    defaultAction: {
      type: 'solanaPumpfunSell',
      runIf: '',
      mint: '',
      tokenAmountRaw: '',
      slippage: 1,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var a = (action.tokenAmountRaw || '').toString().trim();
      if (m) return 'Pump.fun sell ' + m.slice(0, 8) + '…' + (a ? ' amt ' + a.slice(0, 12) : '');
      return 'Solana Pump.fun sell';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var mint = (action.mint || '').toString().trim();
      var tokenAmountRaw = (action.tokenAmountRaw != null ? String(action.tokenAmountRaw) : '').trim();
      var slippage = action.slippage != null ? Number(action.slippage) : 1;
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var skipSim = action.skipSimulation === true;
      var skipPre = action.skipPreflight === true;
      var saveSig = (action.saveSignatureVariable || '').trim();
      var saveExp = (action.saveExplorerUrlVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Bonding-curve sells only. Wallet: <strong>Settings → Solana automation</strong>. Rebuild <code>npm run build:pump</code> after upgrading the SDK.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint (base58)</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Amount (raw smallest units)</label><input type="text" data-field="tokenAmountRaw" data-step="' + i + '" value="' + escapeHtml(tokenAmountRaw) + '" placeholder="{{tokenRaw}}"></div>' +
        '<div class="step-field"><label>Slippage (Pump SDK)</label><input type="number" data-field="slippage" data-step="' + i + '" value="' + (isNaN(slippage) ? 1 : slippage) + '" min="0"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (skipSim ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (skipPre ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml(saveSig) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveExp) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaPumpfunSell', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaPumpfunSell' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.tokenAmountRaw = (getVal('tokenAmountRaw') || '').trim();
      out.slippage = parseInt(getVal('slippage'), 10) || 1;
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
