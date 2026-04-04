(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaReadBalances', {
    label: 'Solana read balances',
    defaultAction: {
      type: 'solanaReadBalances',
      runIf: '',
      owner: '',
      mint: '',
      tokenProgram: 'token',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveNativeLamportsVariable: 'solanaNativeLamports',
      saveBalanceOwnerVariable: 'solanaBalanceOwner',
      saveTokenAmountRawVariable: 'solanaTokenAmountRaw',
      saveAtaAddressVariable: 'solanaTokenAta',
      saveAtaExistsVariable: 'solanaAtaExists',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      if (m) return 'Read balances + ' + m.slice(0, 6) + '…';
      return 'Solana read native balance';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        ['saveNativeLamportsVariable', 'native lamports'],
        ['saveBalanceOwnerVariable', 'owner'],
        ['saveTokenAmountRawVariable', 'token raw'],
        ['saveAtaAddressVariable', 'ATA'],
        ['saveAtaExistsVariable', 'ATA exists'],
      ];
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        var k = (action[keys[i][0]] || '').trim();
        if (k) out.push({ rowKey: k, label: k, hint: keys[i][1] });
      }
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var owner = (action.owner || '').toString().trim();
      var mint = (action.mint || '').toString().trim();
      var tp = (action.tokenProgram || 'token').trim();
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var v0 = (action.saveNativeLamportsVariable || '').trim();
      var v1 = (action.saveBalanceOwnerVariable || '').trim();
      var v2 = (action.saveTokenAmountRawVariable || '').trim();
      var v3 = (action.saveAtaAddressVariable || '').trim();
      var v4 = (action.saveAtaExistsVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Read-only RPC. Default owner = automation pubkey hint (no unlock).</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Owner (optional)</label><input type="text" data-field="owner" data-step="' + i + '" value="' + escapeHtml(owner) + '"></div>' +
        '<div class="step-field"><label>Mint (optional)</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '" placeholder="If set, read SPL balance"></div>' +
        '<div class="step-field"><label>Token program</label><select data-field="tokenProgram" data-step="' + i + '">' +
        '<option value="token"' + (tp === 'token' ? ' selected' : '') + '>SPL Token</option>' +
        '<option value="token-2022"' + (tp === 'token-2022' ? ' selected' : '') + '>Token-2022</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label>Save native lamports</label><input type="text" data-field="saveNativeLamportsVariable" data-step="' + i + '" value="' + escapeHtml(v0) + '"></div>' +
        '<div class="step-field"><label>Save owner address</label><input type="text" data-field="saveBalanceOwnerVariable" data-step="' + i + '" value="' + escapeHtml(v1) + '"></div>' +
        '<div class="step-field"><label>Save token amount raw</label><input type="text" data-field="saveTokenAmountRawVariable" data-step="' + i + '" value="' + escapeHtml(v2) + '"></div>' +
        '<div class="step-field"><label>Save ATA address</label><input type="text" data-field="saveAtaAddressVariable" data-step="' + i + '" value="' + escapeHtml(v3) + '"></div>' +
        '<div class="step-field"><label>Save ATA exists</label><input type="text" data-field="saveAtaExistsVariable" data-step="' + i + '" value="' + escapeHtml(v4) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaReadBalances', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : '';
      };
      var out = { type: 'solanaReadBalances' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      var ow = (getVal('owner') || '').trim();
      if (ow) out.owner = ow;
      out.mint = (getVal('mint') || '').trim();
      out.tokenProgram = (getVal('tokenProgram') || 'token').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.saveNativeLamportsVariable = (getVal('saveNativeLamportsVariable') || '').trim();
      out.saveBalanceOwnerVariable = (getVal('saveBalanceOwnerVariable') || '').trim();
      out.saveTokenAmountRawVariable = (getVal('saveTokenAmountRawVariable') || '').trim();
      out.saveAtaAddressVariable = (getVal('saveAtaAddressVariable') || '').trim();
      out.saveAtaExistsVariable = (getVal('saveAtaExistsVariable') || '').trim();
      return out;
    },
  });
})();
