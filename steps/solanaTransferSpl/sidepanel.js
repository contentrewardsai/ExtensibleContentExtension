(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaTransferSpl', {
    label: 'Solana transfer SPL token',
    defaultAction: {
      type: 'solanaTransferSpl',
      runIf: '',
      mint: '',
      toOwner: '',
      amountRaw: '',
      tokenProgram: 'token',
      createDestinationAta: true,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var to = (action.toOwner || '').toString().trim();
      if (m) return 'SPL ' + m.slice(0, 6) + '…' + (to ? ' → ' + to.slice(0, 6) + '…' : '');
      return 'Solana transfer SPL token';
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
      var toOwner = (action.toOwner || '').toString().trim();
      var amountRaw = (action.amountRaw != null ? String(action.amountRaw) : '').trim();
      var tp = (action.tokenProgram || 'token').trim();
      var createAta = action.createDestinationAta !== false;
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var skipSim = action.skipSimulation === true;
      var skipPre = action.skipPreflight === true;
      var cuLim = (action.computeUnitLimit != null ? String(action.computeUnitLimit) : '').trim();
      var cuPrice = (action.computeUnitPriceMicroLamports != null ? String(action.computeUnitPriceMicroLamports) : '').trim();
      var saveSig = (action.saveSignatureVariable || '').trim();
      var saveExp = (action.saveExplorerUrlVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">From your ATA for this mint. Uses <strong>Settings → Solana automation</strong>. Rebuild: <code>npm run build:solana</code>.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Destination wallet</label><input type="text" data-field="toOwner" data-step="' + i + '" value="' + escapeHtml(toOwner) + '" placeholder="Owner pubkey or {{var}}"></div>' +
        '<div class="step-field"><label>Amount (raw)</label><input type="text" data-field="amountRaw" data-step="' + i + '" value="' + escapeHtml(amountRaw) + '"></div>' +
        '<div class="step-field"><label>Token program</label><select data-field="tokenProgram" data-step="' + i + '">' +
        '<option value="token"' + (tp === 'token' ? ' selected' : '') + '>SPL Token</option>' +
        '<option value="token-2022"' + (tp === 'token-2022' ? ' selected' : '') + '>Token-2022</option>' +
        '</select></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="createDestinationAta" data-step="' + i + '"' + (createAta ? ' checked' : '') + '> Create recipient ATA if missing</label></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (skipSim ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (skipPre ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Compute unit limit (optional)</label><input type="text" data-field="computeUnitLimit" data-step="' + i + '" value="' + escapeHtml(cuLim) + '" placeholder="200000"></div>' +
        '<div class="step-field"><label>Priority fee (micro-lamports/CU)</label><input type="text" data-field="computeUnitPriceMicroLamports" data-step="' + i + '" value="' + escapeHtml(cuPrice) + '" placeholder="50000"></div>' +
        '<div class="step-field"><label>Save signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml(saveSig) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveExp) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaTransferSpl', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaTransferSpl' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.toOwner = (getVal('toOwner') || '').trim();
      out.amountRaw = (getVal('amountRaw') || '').trim();
      out.tokenProgram = (getVal('tokenProgram') || 'token').trim();
      out.createDestinationAta = getVal('createDestinationAta') === true;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
