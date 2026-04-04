(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('apifyDatasetItems', {
    label: 'Apify — fetch dataset items',
    defaultAction: {
      type: 'apifyDatasetItems',
      runIf: '',
      datasetId: '{{apifyDatasetId}}',
      tokenVariableKey: '',
      datasetMaxItems: 0,
      apifySyncDatasetFields: '',
      apifySyncDatasetOmit: '',
      saveAsVariable: 'apifyDatasetItems',
    },
    getSummary: function(action) {
      var d = (action.datasetId || '').toString().trim();
      if (d) return 'Dataset: ' + d.slice(0, 28) + (d.length > 28 ? '…' : '');
      return 'Apify fetch dataset';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var tok = (action.tokenVariableKey || '').trim();
      if (tok) out.push({ rowKey: tok, label: tok, hint: 'Apify token' });
      var sv = (action.saveAsVariable || '').trim();
      if (sv) out.push({ rowKey: sv, label: sv, hint: 'items array' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Dataset id</label><input type="text" data-field="datasetId" data-step="' + i + '" value="' + escapeHtml((action.datasetId || '').trim()) + '" placeholder="{{apifyDatasetId}}"></div>' +
        '<div class="step-field"><label>Token row variable</label><input type="text" data-field="tokenVariableKey" data-step="' + i + '" value="' + escapeHtml((action.tokenVariableKey || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Max items (0 = all)</label><input type="number" data-field="datasetMaxItems" data-step="' + i + '" value="' + (action.datasetMaxItems || '') + '" min="0"></div>' +
        '<div class="step-field"><label>Dataset fields</label><input type="text" data-field="apifySyncDatasetFields" data-step="' + i + '" value="' + escapeHtml(String(action.apifySyncDatasetFields || '')) + '"></div>' +
        '<div class="step-field"><label>Dataset omit</label><input type="text" data-field="apifySyncDatasetOmit" data-step="' + i + '" value="' + escapeHtml(String(action.apifySyncDatasetOmit || '')) + '"></div>' +
        '<div class="step-field"><label>Save to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAsVariable || '').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('apifyDatasetItems', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function gv(f) {
        var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]');
        return el ? el.value : '';
      }
      var out = {
        type: 'apifyDatasetItems',
        runIf: (gv('runIf') || '').trim(),
        datasetId: (gv('datasetId') || '').trim(),
        tokenVariableKey: (gv('tokenVariableKey') || '').trim(),
        apifySyncDatasetFields: (gv('apifySyncDatasetFields') || '').trim(),
        apifySyncDatasetOmit: (gv('apifySyncDatasetOmit') || '').trim(),
        saveAsVariable: (gv('saveAsVariable') || '').trim(),
      };
      var dm = parseInt(gv('datasetMaxItems'), 10);
      if (!isNaN(dm) && dm > 0) out.datasetMaxItems = dm;
      return out;
    },
  });
})();
