(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  function refreshWaitForm(wrap) {
    if (!wrap) return;
    var idx = wrap.getAttribute('data-apify-wait-idx');
    if (idx == null) return;
    var sel = '[data-step="' + idx + '"]';
    var fetchEl = wrap.querySelector('select[data-field="fetchAfter"]' + sel);
    var fetch = fetchEl && fetchEl.value ? fetchEl.value : 'dataset';
    function show(cls, on) {
      var nodes = wrap.querySelectorAll(cls);
      for (var i = 0; i < nodes.length; i++) nodes[i].style.display = on ? '' : 'none';
    }
    show('.apify-wait-dataset', fetch === 'dataset');
    show('.apify-wait-output', fetch === 'output');
    show('.apify-wait-save-result', fetch === 'dataset' || fetch === 'output');
  }

  if (typeof document !== 'undefined' && !window.__CFS_apifyWaitFormDelegationBound) {
    window.__CFS_apifyWaitFormDelegationBound = true;
    document.addEventListener('change', function(ev) {
      var t = ev.target;
      if (!t || t.getAttribute('data-field') !== 'fetchAfter') return;
      var wrap = t.closest('[data-apify-wait-form="1"]');
      if (wrap) refreshWaitForm(wrap);
    }, true);
  }

  window.__CFS_registerStepSidepanel('apifyRunWait', {
    label: 'Apify — wait for run',
    defaultAction: {
      type: 'apifyRunWait',
      runIf: '',
      runId: '{{apifyRunId}}',
      tokenVariableKey: '',
      fetchAfter: 'dataset',
      asyncMaxWaitMs: 600000,
      pollIntervalMs: 500,
      datasetMaxItems: 0,
      outputRecordKey: '',
      apifySyncDatasetFields: '',
      apifySyncDatasetOmit: '',
      saveAsVariable: 'apifyResult',
      saveStatusVariable: '',
      saveRunMetaJsonVariable: '',
      saveConsoleUrlVariable: '',
      saveDatasetIdVariable: '',
      saveKeyValueStoreIdVariable: '',
    },
    getSummary: function(action) {
      var r = (action.runId || '').toString().trim();
      var f = action.fetchAfter || 'dataset';
      if (r) return 'Wait: ' + r.slice(0, 24) + (r.length > 24 ? '…' : '') + ' → ' + f;
      return 'Apify wait (' + f + ')';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var tok = (action.tokenVariableKey || '').trim();
      if (tok) out.push({ rowKey: tok, label: tok, hint: 'Apify token' });
      var sv = (action.saveAsVariable || '').trim();
      if (sv && action.fetchAfter !== 'none') out.push({ rowKey: sv, label: sv, hint: 'items or OUTPUT' });
      ['saveStatusVariable', 'saveRunMetaJsonVariable', 'saveConsoleUrlVariable', 'saveDatasetIdVariable', 'saveKeyValueStoreIdVariable'].forEach(function(k) {
        var v = (action[k] || '').trim();
        if (v) out.push({ rowKey: v, label: v, hint: k });
      });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var fetchAfter = action.fetchAfter === 'output' ? 'output' : (action.fetchAfter === 'none' ? 'none' : 'dataset');
      var body =
        '<div data-apify-wait-form="1" data-apify-wait-idx="' + i + '">' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Run id</label><input type="text" data-field="runId" data-step="' + i + '" value="' + escapeHtml((action.runId || '').trim()) + '" placeholder="{{apifyRunId}}"></div>' +
        '<div class="step-field"><label>Token row variable</label><input type="text" data-field="tokenVariableKey" data-step="' + i + '" value="' + escapeHtml((action.tokenVariableKey || '').trim()) + '"></div>' +
        '<div class="step-field"><label>After run succeeds</label><select data-field="fetchAfter" data-step="' + i + '">' +
        '<option value="none"' + (fetchAfter === 'none' ? ' selected' : '') + '>Metadata only (no dataset/OUTPUT)</option>' +
        '<option value="dataset"' + (fetchAfter === 'dataset' ? ' selected' : '') + '>Load default dataset</option>' +
        '<option value="output"' + (fetchAfter === 'output' ? ' selected' : '') + '>Load OUTPUT (KV)</option></select></div>' +
        '<div class="step-field apify-wait-output" style="display:' + (fetchAfter === 'output' ? '' : 'none') + '"><label>OUTPUT record key</label><input type="text" data-field="outputRecordKey" data-step="' + i + '" value="' + escapeHtml((action.outputRecordKey || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Max wait (ms)</label><input type="number" data-field="asyncMaxWaitMs" data-step="' + i + '" value="' + (action.asyncMaxWaitMs != null ? Number(action.asyncMaxWaitMs) : 600000) + '" min="1000" max="7200000"></div>' +
        '<div class="step-field"><label>Poll interval (ms)</label><input type="number" data-field="pollIntervalMs" data-step="' + i + '" value="' + (action.pollIntervalMs != null ? Number(action.pollIntervalMs) : 500) + '" min="0" max="300000"></div>' +
        '<div class="step-field apify-wait-dataset" style="display:' + (fetchAfter === 'dataset' ? '' : 'none') + '"><label>Max dataset items (0=all)</label><input type="number" data-field="datasetMaxItems" data-step="' + i + '" value="' + (action.datasetMaxItems || '') + '" min="0"></div>' +
        '<div class="step-field apify-wait-dataset" style="display:' + (fetchAfter === 'dataset' ? '' : 'none') + '"><label>Dataset fields / omit</label></div>' +
        '<div class="step-field apify-wait-dataset" style="display:' + (fetchAfter === 'dataset' ? '' : 'none') + '"><input type="text" data-field="apifySyncDatasetFields" data-step="' + i + '" placeholder="fields" value="' + escapeHtml(String(action.apifySyncDatasetFields || '')) + '"></div>' +
        '<div class="step-field apify-wait-dataset" style="display:' + (fetchAfter === 'dataset' ? '' : 'none') + '"><input type="text" data-field="apifySyncDatasetOmit" data-step="' + i + '" placeholder="omit" value="' + escapeHtml(String(action.apifySyncDatasetOmit || '')) + '"></div>' +
        '<div class="step-field apify-wait-save-result" style="display:' + (fetchAfter === 'none' ? 'none' : '') + '"><label>Save result to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml((action.saveAsVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Save status / meta / console / dataset id / KV id</label></div>' +
        '<div class="step-field"><input type="text" data-field="saveStatusVariable" data-step="' + i + '" value="' + escapeHtml((action.saveStatusVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveRunMetaJsonVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRunMetaJsonVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveConsoleUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveConsoleUrlVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveDatasetIdVariable" data-step="' + i + '" value="' + escapeHtml((action.saveDatasetIdVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveKeyValueStoreIdVariable" data-step="' + i + '" value="' + escapeHtml((action.saveKeyValueStoreIdVariable || '').trim()) + '"></div>' +
        '</div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      setTimeout(function() {
        var item = document.querySelector('[data-apify-wait-form="1"][data-apify-wait-idx="' + i + '"]');
        if (item) refreshWaitForm(item);
      }, 0);
      return window.__CFS_buildStepItemShell('apifyRunWait', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function gv(f) {
        var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]');
        return el ? el.value : '';
      }
      var fa = gv('fetchAfter');
      if (fa !== 'none' && fa !== 'output') fa = 'dataset';
      var out = {
        type: 'apifyRunWait',
        runIf: (gv('runIf') || '').trim(),
        runId: (gv('runId') || '').trim(),
        tokenVariableKey: (gv('tokenVariableKey') || '').trim(),
        fetchAfter: fa,
        outputRecordKey: (gv('outputRecordKey') || '').trim(),
        apifySyncDatasetFields: (gv('apifySyncDatasetFields') || '').trim(),
        apifySyncDatasetOmit: (gv('apifySyncDatasetOmit') || '').trim(),
        saveAsVariable: (gv('saveAsVariable') || '').trim(),
        saveStatusVariable: (gv('saveStatusVariable') || '').trim(),
        saveRunMetaJsonVariable: (gv('saveRunMetaJsonVariable') || '').trim(),
        saveConsoleUrlVariable: (gv('saveConsoleUrlVariable') || '').trim(),
        saveDatasetIdVariable: (gv('saveDatasetIdVariable') || '').trim(),
        saveKeyValueStoreIdVariable: (gv('saveKeyValueStoreIdVariable') || '').trim(),
      };
      var am = parseInt(gv('asyncMaxWaitMs'), 10);
      if (!isNaN(am) && am >= 1000) out.asyncMaxWaitMs = am;
      var pi = parseInt(gv('pollIntervalMs'), 10);
      if (!isNaN(pi) && pi >= 0) out.pollIntervalMs = pi;
      var dm = parseInt(gv('datasetMaxItems'), 10);
      if (!isNaN(dm) && dm > 0) out.datasetMaxItems = dm;
      return out;
    },
  });
})();
