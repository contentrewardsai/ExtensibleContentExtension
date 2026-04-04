(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaEnsureTokenAccount', {
    label: 'Solana ensure token account (ATA)',
    defaultAction: {
      type: 'solanaEnsureTokenAccount',
      runIf: '',
      mint: '',
      additionalMints: '',
      owner: '',
      tokenProgram: 'token',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      skipSimulation: false,
      skipPreflight: false,
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      saveAtaAddressVariable: 'solanaAtaAddress',
      saveSkippedVariable: 'solanaEnsureAtaSkipped',
      saveEnsureResultsVariable: '',
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var extra = (action.additionalMints || '').toString().trim();
      var n = 1;
      if (extra) {
        extra.split(/\r?\n/).forEach(function (line) {
          line.split(',').forEach(function (p) {
            if (p.trim()) n += 1;
          });
        });
      }
      if (m) return n > 1 ? ('Ensure ATA (' + n + ' mints) ' + m.slice(0, 8) + '…') : ('Ensure ATA ' + m.slice(0, 8) + '…');
      return 'Solana ensure token account (ATA)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var a = (action.saveAtaAddressVariable || '').trim();
      if (a) out.push({ rowKey: a, label: a, hint: 'ATA address' });
      var sk = (action.saveSkippedVariable || '').trim();
      if (sk) out.push({ rowKey: sk, label: sk, hint: 'skipped true/false (primary mint)' });
      var er = (action.saveEnsureResultsVariable || '').trim();
      if (er) out.push({ rowKey: er, label: er, hint: 'JSON array per mint' });
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
      var additionalMints = (action.additionalMints || '').toString();
      var owner = (action.owner || '').toString().trim();
      var tp = (action.tokenProgram || 'token').trim();
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var skipSim = action.skipSimulation === true;
      var skipPre = action.skipPreflight === true;
      var cuLim = (action.computeUnitLimit != null ? String(action.computeUnitLimit) : '').trim();
      var cuPrice = (action.computeUnitPriceMicroLamports != null ? String(action.computeUnitPriceMicroLamports) : '').trim();
      var saveAta = (action.saveAtaAddressVariable || '').trim();
      var saveSk = (action.saveSkippedVariable || '').trim();
      var saveEr = (action.saveEnsureResultsVariable || '').trim();
      var saveSig = (action.saveSignatureVariable || '').trim();
      var saveExp = (action.saveExplorerUrlVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Idempotent ATA create for a mint. No tx if ATA exists. Uses <strong>Settings → Solana automation</strong>.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Additional mints (optional)</label><textarea data-field="additionalMints" data-step="' + i + '" rows="3" placeholder="One per line or comma-separated">' + escapeHtml(additionalMints) + '</textarea></div>' +
        '<div class="step-field"><label>Owner wallet (optional)</label><input type="text" data-field="owner" data-step="' + i + '" value="' + escapeHtml(owner) + '" placeholder="Default: automation wallet"></div>' +
        '<div class="step-field"><label>Token program</label><select data-field="tokenProgram" data-step="' + i + '">' +
        '<option value="token"' + (tp === 'token' ? ' selected' : '') + '>SPL Token</option>' +
        '<option value="token-2022"' + (tp === 'token-2022' ? ' selected' : '') + '>Token-2022</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (skipSim ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (skipPre ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Compute unit limit (optional)</label><input type="text" data-field="computeUnitLimit" data-step="' + i + '" value="' + escapeHtml(cuLim) + '"></div>' +
        '<div class="step-field"><label>Priority fee (micro-lamports/CU)</label><input type="text" data-field="computeUnitPriceMicroLamports" data-step="' + i + '" value="' + escapeHtml(cuPrice) + '"></div>' +
        '<div class="step-field"><label>Save ATA address to variable (primary mint)</label><input type="text" data-field="saveAtaAddressVariable" data-step="' + i + '" value="' + escapeHtml(saveAta) + '"></div>' +
        '<div class="step-field"><label>Save skipped to variable (primary mint)</label><input type="text" data-field="saveSkippedVariable" data-step="' + i + '" value="' + escapeHtml(saveSk) + '"></div>' +
        '<div class="step-field"><label>Save JSON results (all mints, optional)</label><input type="text" data-field="saveEnsureResultsVariable" data-step="' + i + '" value="' + escapeHtml(saveEr) + '" placeholder="e.g. solanaEnsureAtaResults"></div>' +
        '<div class="step-field"><label>Save signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml(saveSig) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveExp) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaEnsureTokenAccount', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaEnsureTokenAccount' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      var addM = (getVal('additionalMints') || '').trim();
      if (addM) out.additionalMints = addM;
      var ow = (getVal('owner') || '').trim();
      if (ow) out.owner = ow;
      out.tokenProgram = (getVal('tokenProgram') || 'token').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.saveAtaAddressVariable = (getVal('saveAtaAddressVariable') || '').trim();
      out.saveSkippedVariable = (getVal('saveSkippedVariable') || '').trim();
      var ser = (getVal('saveEnsureResultsVariable') || '').trim();
      if (ser) out.saveEnsureResultsVariable = ser;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
