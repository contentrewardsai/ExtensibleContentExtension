(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaWrapSol', {
    label: 'Solana wrap SOL (WSOL)',
    defaultAction: {
      type: 'solanaWrapSol',
      runIf: '',
      lamports: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      saveAtaAddressVariable: 'solanaWsolAta',
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var l = (action.lamports != null ? String(action.lamports) : '').trim();
      if (l) return 'Wrap ' + l + ' lamports → WSOL';
      return 'Solana wrap SOL (WSOL)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var a = (action.saveAtaAddressVariable || '').trim();
      if (a) out.push({ rowKey: a, label: a, hint: 'WSOL ATA' });
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var lamports = (action.lamports != null ? String(action.lamports) : '').trim();
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var skipSim = action.skipSimulation === true;
      var skipPre = action.skipPreflight === true;
      var cuLim = (action.computeUnitLimit != null ? String(action.computeUnitLimit) : '').trim();
      var cuPrice = (action.computeUnitPriceMicroLamports != null ? String(action.computeUnitPriceMicroLamports) : '').trim();
      var saveAta = (action.saveAtaAddressVariable || '').trim();
      var saveSig = (action.saveSignatureVariable || '').trim();
      var saveExp = (action.saveExplorerUrlVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Native SOL → WSOL (no Jupiter). Uses <strong>Settings → Solana automation</strong>. Rebuild: <code>npm run build:solana</code>.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Lamports to wrap</label><input type="text" data-field="lamports" data-step="' + i + '" value="' + escapeHtml(lamports) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (skipSim ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (skipPre ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Compute unit limit (optional)</label><input type="text" data-field="computeUnitLimit" data-step="' + i + '" value="' + escapeHtml(cuLim) + '"></div>' +
        '<div class="step-field"><label>Priority fee (micro-lamports/CU)</label><input type="text" data-field="computeUnitPriceMicroLamports" data-step="' + i + '" value="' + escapeHtml(cuPrice) + '"></div>' +
        '<div class="step-field"><label>Save WSOL ATA to variable</label><input type="text" data-field="saveAtaAddressVariable" data-step="' + i + '" value="' + escapeHtml(saveAta) + '"></div>' +
        '<div class="step-field"><label>Save signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml(saveSig) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveExp) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaWrapSol', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaWrapSol' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.lamports = (getVal('lamports') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.saveAtaAddressVariable = (getVal('saveAtaAddressVariable') || '').trim();
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
