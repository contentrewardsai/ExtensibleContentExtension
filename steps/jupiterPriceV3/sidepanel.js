(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('jupiterPriceV3', {
    label: 'Jupiter Price V3 (USD)',
    defaultAction: {
      type: 'jupiterPriceV3',
      runIf: '',
      mintAddresses: '',
      savePriceMapVariable: 'jupiterPrices',
      saveSinglePriceVariable: 'jupiterPrice',
      savePriceChange24hVariable: '',
    },
    getSummary: function(action) {
      var m = (action.mintAddresses || '').toString().trim();
      if (m) return 'Price V3 → ' + m.slice(0, 20) + (m.length > 20 ? '…' : '');
      return 'Jupiter Price V3';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.savePriceMapVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'price map JSON' });
      var s2 = (action.saveSinglePriceVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'USD price' });
      var s3 = (action.savePriceChange24hVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: '24h change' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var mints = (action.mintAddresses || '').toString().trim();
      var mapVar = (action.savePriceMapVariable || '').trim();
      var singleVar = (action.saveSinglePriceVariable || '').trim();
      var changeVar = (action.savePriceChange24hVariable || '').trim();
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Fetch USD prices via Jupiter Price API V3. No wallet needed. Configure API key in <strong>Settings → Solana</strong> for higher rate limits.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint address(es)</label><input type="text" data-field="mintAddresses" data-step="' + i + '" value="' + escapeHtml(mints) + '" placeholder="So111…112 or comma-separated, up to 50"></div>' +
        '<div class="step-field"><label>Save price map to variable</label><input type="text" data-field="savePriceMapVariable" data-step="' + i + '" value="' + escapeHtml(mapVar) + '"></div>' +
        '<div class="step-field"><label>Save single price to variable</label><input type="text" data-field="saveSinglePriceVariable" data-step="' + i + '" value="' + escapeHtml(singleVar) + '"></div>' +
        '<div class="step-field"><label>Save 24h price change to variable</label><input type="text" data-field="savePriceChange24hVariable" data-step="' + i + '" value="' + escapeHtml(changeVar) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterPriceV3', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'jupiterPriceV3' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mintAddresses = (getVal('mintAddresses') || '').trim();
      out.savePriceMapVariable = (getVal('savePriceMapVariable') || '').trim();
      out.saveSinglePriceVariable = (getVal('saveSinglePriceVariable') || '').trim();
      out.savePriceChange24hVariable = (getVal('savePriceChange24hVariable') || '').trim();
      return out;
    },
  });
})();
