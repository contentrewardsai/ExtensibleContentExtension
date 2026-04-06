(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterPredictionTrade', {
    label: 'Jupiter Prediction — Trade',
    defaultAction: { type: 'jupiterPredictionTrade', runIf: '', operation: 'buyOrder', marketId: '', isYes: true, amount: '', limitPrice: '', positionPubkey: '', saveSignatureVariable: 'solanaTxSignature', saveExplorerUrlVariable: 'solanaExplorerUrl' },
    getSummary: function(a) { var op = (a.operation||'buyOrder'); return 'Prediction ' + op + (a.isYes === true || a.isYes === 'true' ? ' YES' : ' NO'); },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(a) {
      var out = [];
      var s1 = (a.saveSignatureVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (a.saveExplorerUrlVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer URL' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var ops = ['buyOrder','sellOrder','closePosition','closeAllPositions','claimPayout'];
      var cur = (action.operation||'buyOrder').trim();
      var isYes = action.isYes === true || action.isYes === 'true';
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Trade on Jupiter Prediction Markets. Buy/sell YES or NO contracts on real-world events. Prices in micro USD (1,000,000 = $1).</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="operation" data-step="' + i + '">' + ops.map(function(o){return '<option value="'+o+'"'+(cur===o?' selected':'')+'>'+o+'</option>';}).join('') + '</select></div>' +
        '<div class="step-field"><label>Market ID</label><input type="text" data-field="marketId" data-step="' + i + '" value="' + e((action.marketId||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Side</label><select data-field="isYes" data-step="' + i + '"><option value="true"' + (isYes ? ' selected' : '') + '>YES</option><option value="false"' + (!isYes ? ' selected' : '') + '>NO</option></select></div>' +
        '<div class="step-field"><label>Amount (micro USD)</label><input type="text" data-field="amount" data-step="' + i + '" value="' + e((action.amount||'').toString().trim()) + '" placeholder="1000000 = $1"></div>' +
        '<div class="step-field"><label>Limit price (micro USD, optional)</label><input type="text" data-field="limitPrice" data-step="' + i + '" value="' + e((action.limitPrice||'').toString().trim()) + '"></div>' +
        '<div class="step-field"><label>Position pubkey (for close/claim)</label><input type="text" data-field="positionPubkey" data-step="' + i + '" value="' + e((action.positionPubkey||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save tx signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterPredictionTrade', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); return el ? el.value : ''; };
      return { type: 'jupiterPredictionTrade', runIf: (g('runIf')||'').trim(), operation: (g('operation')||'buyOrder').trim(), marketId: (g('marketId')||'').trim(), isYes: g('isYes') === 'true', amount: (g('amount')||'').trim(), limitPrice: (g('limitPrice')||'').trim(), positionPubkey: (g('positionPubkey')||'').trim(), saveSignatureVariable: (g('saveSignatureVariable')||'').trim(), saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim() };
    },
  });
})();
