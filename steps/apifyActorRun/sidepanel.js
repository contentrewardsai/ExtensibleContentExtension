(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  function cfsApifyRefreshFormVisibility(wrap) {
    if (!wrap || !wrap.querySelectorAll) return;
    var idx = wrap.getAttribute('data-apify-step-idx');
    if (idx == null) return;
    var stepSel = '[data-step="' + idx + '"]';
    var modeEl = wrap.querySelector('select[data-field="mode"]' + stepSel);
    var inputSrcEl = wrap.querySelector('select[data-field="inputSource"]' + stepSel);
    var asyncResEl = wrap.querySelector('select[data-field="asyncResultType"]' + stepSel);
    var mode = modeEl && modeEl.value ? modeEl.value : 'syncDataset';
    var inputSource = inputSrcEl && inputSrcEl.value ? inputSrcEl.value : 'template';
    var asyncResult = asyncResEl && asyncResEl.value ? asyncResEl.value : 'dataset';

    function setRows(className, show) {
      var nodes = wrap.querySelectorAll(className);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.display = show ? '' : 'none';
      }
    }

    setRows('.apify-row-tmpl', inputSource === 'template');
    setRows('.apify-row-var', inputSource === 'variable');
    var showOutKey = mode === 'syncOutput' || (mode === 'asyncPoll' && asyncResult === 'output');
    setRows('.apify-row-outkey', showOutKey);
    setRows('.apify-row-async', mode === 'asyncPoll');
    setRows('.apify-row-async-result', mode === 'asyncPoll');
    var showDatasetCap = mode === 'syncDataset' || (mode === 'asyncPoll' && asyncResult === 'dataset');
    setRows('.apify-row-dataset-cap', showDatasetCap);
    setRows('.apify-row-sync-timeout', mode === 'syncDataset' || mode === 'syncOutput');
    setRows('.apify-row-sync-dataset-page', mode === 'syncDataset');
    var showDatasetFields = mode === 'syncDataset' || (mode === 'asyncPoll' && asyncResult === 'dataset');
    setRows('.apify-row-dataset-fields', showDatasetFields);
    setRows('.apify-row-async-start-wait', mode === 'asyncPoll');
  }

  if (typeof document !== 'undefined' && !window.__CFS_apifyStepFormDelegationBound) {
    window.__CFS_apifyStepFormDelegationBound = true;
    document.addEventListener('change', function(ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var field = t.getAttribute('data-field');
      if (field !== 'mode' && field !== 'inputSource' && field !== 'asyncResultType') return;
      var wrap = t.closest('[data-apify-step-form="1"]');
      if (wrap) cfsApifyRefreshFormVisibility(wrap);
    }, true);
  }

  window.__CFS_registerStepSidepanel('apifyActorRun', {
    label: 'Apify Actor / Task',
    defaultAction: {
      type: 'apifyActorRun',
      runIf: '',
      targetType: 'actor',
      resourceId: '',
      mode: 'syncDataset',
      inputSource: 'template',
      inputTemplate: '{}',
      dataVariable: '',
      tokenVariableKey: '',
      outputRecordKey: '',
      asyncResultType: 'dataset',
      syncTimeoutMs: 310000,
      asyncMaxWaitMs: 600000,
      pollIntervalMs: 500,
      datasetMaxItems: 0,
      apifyRunTimeoutSecs: '',
      apifyRunMemoryMbytes: '',
      apifyRunMaxItems: '',
      apifyBuild: '',
      apifyMaxTotalChargeUsd: '',
      apifyRestartOnError: false,
      apifySyncDatasetLimit: '',
      apifySyncDatasetOffset: '',
      apifySyncDatasetFields: '',
      apifySyncDatasetOmit: '',
      apifyStartWaitForFinishSecs: '',
      saveAsVariable: 'apifyResult',
      saveRunIdVariable: '',
      saveStatusVariable: '',
      saveRunMetaJsonVariable: '',
      saveConsoleUrlVariable: '',
      saveDatasetIdVariable: '',
      saveKeyValueStoreIdVariable: '',
    },
    getSummary: function(action) {
      var t = (action.targetType === 'task' ? 'Task' : 'Actor');
      var id = (action.resourceId || '').toString().trim();
      var m = action.mode || 'syncDataset';
      if (id) return t + ': ' + id.slice(0, 28) + (id.length > 28 ? '…' : '') + ' (' + m + ')';
      return 'Apify ' + t + ' (' + m + ')';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var dv = (action.dataVariable || '').trim();
      if (dv) out.push({ rowKey: dv, label: dv, hint: 'input JSON' });
      var tok = (action.tokenVariableKey || '').trim();
      if (tok) out.push({ rowKey: tok, label: tok, hint: 'Apify token (optional)' });
      var sv = (action.saveAsVariable || '').trim();
      if (sv) out.push({ rowKey: sv, label: sv, hint: 'dataset items or OUTPUT' });
      var rv = (action.saveRunIdVariable || '').trim();
      if (rv) out.push({ rowKey: rv, label: rv, hint: 'run id' });
      var st = (action.saveStatusVariable || '').trim();
      if (st) out.push({ rowKey: st, label: st, hint: 'run status' });
      var mj = (action.saveRunMetaJsonVariable || '').trim();
      if (mj) out.push({ rowKey: mj, label: mj, hint: 'run metadata JSON (async)' });
      var cu = (action.saveConsoleUrlVariable || '').trim();
      if (cu) out.push({ rowKey: cu, label: cu, hint: 'Apify Console run URL (async)' });
      var sd = (action.saveDatasetIdVariable || '').trim();
      if (sd) out.push({ rowKey: sd, label: sd, hint: 'default dataset id (async)' });
      var sk = (action.saveKeyValueStoreIdVariable || '').trim();
      if (sk) out.push({ rowKey: sk, label: sk, hint: 'default key-value store id (async)' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIfVal = (action.runIf || '').trim();
      var targetType = action.targetType === 'task' ? 'task' : 'actor';
      var resourceId = (action.resourceId || '').toString().trim();
      var mode = action.mode || 'syncDataset';
      var inputSource = action.inputSource === 'variable' ? 'variable' : 'template';
      var inputTemplate = (action.inputTemplate != null ? String(action.inputTemplate) : '{}');
      var dataVariable = (action.dataVariable || '').toString().trim();
      var tokenVariableKey = (action.tokenVariableKey || '').toString().trim();
      var outputRecordKey = (action.outputRecordKey || '').toString().trim();
      var asyncResultType = action.asyncResultType === 'output' ? 'output' : 'dataset';
      var syncTimeoutMs = action.syncTimeoutMs != null ? Number(action.syncTimeoutMs) : 310000;
      var asyncMaxWaitMs = action.asyncMaxWaitMs != null ? Number(action.asyncMaxWaitMs) : 600000;
      var pollIntervalMs = action.pollIntervalMs != null ? Number(action.pollIntervalMs) : 500;
      var datasetMaxItems = action.datasetMaxItems != null ? Number(action.datasetMaxItems) : 0;
      var apifyRunTimeoutSecs = action.apifyRunTimeoutSecs != null ? String(action.apifyRunTimeoutSecs) : '';
      var apifyRunMemoryMbytes = action.apifyRunMemoryMbytes != null ? String(action.apifyRunMemoryMbytes) : '';
      var apifyRunMaxItems = action.apifyRunMaxItems != null ? String(action.apifyRunMaxItems) : '';
      var apifyBuild = (action.apifyBuild != null ? String(action.apifyBuild) : '').trim();
      var apifyMaxTotalChargeUsd = action.apifyMaxTotalChargeUsd != null ? String(action.apifyMaxTotalChargeUsd) : '';
      var apifyRestartOnError = action.apifyRestartOnError === true;
      var apifySyncDatasetLimit = action.apifySyncDatasetLimit != null ? String(action.apifySyncDatasetLimit) : '';
      var apifySyncDatasetOffset = action.apifySyncDatasetOffset != null ? String(action.apifySyncDatasetOffset) : '';
      var apifySyncDatasetFields = action.apifySyncDatasetFields != null ? String(action.apifySyncDatasetFields) : '';
      var apifySyncDatasetOmit = action.apifySyncDatasetOmit != null ? String(action.apifySyncDatasetOmit) : '';
      var apifyStartWaitForFinishSecs = action.apifyStartWaitForFinishSecs != null ? String(action.apifyStartWaitForFinishSecs) : '';
      var showDatasetFields = mode === 'syncDataset' || (mode === 'asyncPoll' && asyncResultType === 'dataset');
      var saveAsVariable = (action.saveAsVariable || '').toString().trim();
      var saveRunIdVariable = (action.saveRunIdVariable || '').toString().trim();
      var saveStatusVariable = (action.saveStatusVariable || '').toString().trim();
      var saveRunMetaJsonVariable = (action.saveRunMetaJsonVariable || '').toString().trim();
      var saveConsoleUrlVariable = (action.saveConsoleUrlVariable || '').toString().trim();
      var saveDatasetIdVariable = (action.saveDatasetIdVariable || '').toString().trim();
      var saveKeyValueStoreIdVariable = (action.saveKeyValueStoreIdVariable || '').toString().trim();

      var body =
        '<div data-apify-step-form="1" data-apify-step-idx="' + i + '">' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="Row variable key — skip step when empty/falsy"></div>' +
        '<div class="step-field"><label>Target</label><select data-field="targetType" data-step="' + i + '">' +
        '<option value="actor"' + (targetType === 'actor' ? ' selected' : '') + '>Actor</option>' +
        '<option value="task"' + (targetType === 'task' ? ' selected' : '') + '>Actor task</option>' +
        '</select><span class="step-hint">Actor ID (e.g. username~name) or Task ID from Apify Console.</span></div>' +
        '<div class="step-field"><label>Actor or Task ID</label><input type="text" data-field="resourceId" data-step="' + i + '" value="' + escapeHtml(resourceId) + '" placeholder="e.g. apify~web-scraper or task id"><span class="step-hint">Max 512 characters after {{vars}}.</span></div>' +
        '<div class="step-field"><label>Mode</label><select data-field="mode" data-step="' + i + '">' +
        '<option value="syncDataset"' + (mode === 'syncDataset' ? ' selected' : '') + '>Sync — wait &amp; return dataset items (≤300s server)</option>' +
        '<option value="syncOutput"' + (mode === 'syncOutput' ? ' selected' : '') + '>Sync — wait &amp; return OUTPUT (key-value)</option>' +
        '<option value="asyncPoll"' + (mode === 'asyncPoll' ? ' selected' : '') + '>Async — start run, poll until done, then load results</option>' +
        '</select></div>' +
        '<div class="step-field apify-row-async-result" style="display:' + (mode === 'asyncPoll' ? '' : 'none') + '"><label>After run (async only)</label><select data-field="asyncResultType" data-step="' + i + '">' +
        '<option value="dataset"' + (asyncResultType === 'dataset' ? ' selected' : '') + '>Load default dataset (items array)</option>' +
        '<option value="output"' + (asyncResultType === 'output' ? ' selected' : '') + '>Load OUTPUT from key-value store</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Input source</label><select data-field="inputSource" data-step="' + i + '">' +
        '<option value="template"' + (inputSource === 'template' ? ' selected' : '') + '>JSON template ({{vars}})</option>' +
        '<option value="variable"' + (inputSource === 'variable' ? ' selected' : '') + '>Row variable (object or JSON string)</option>' +
        '</select></div>' +
        '<div class="step-field apify-row-tmpl" style="display:' + (inputSource === 'template' ? '' : 'none') + '"><label>Input JSON template</label><textarea data-field="inputTemplate" data-step="' + i + '" rows="4" placeholder="{}">' + escapeHtml(inputTemplate) + '</textarea><span class="step-hint">Must be a JSON object; max ~2 MiB UTF-8 when serialized.</span></div>' +
        '<div class="step-field apify-row-var" style="display:' + (inputSource === 'variable' ? '' : 'none') + '"><label>Row variable for input</label><input type="text" data-field="dataVariable" data-step="' + i + '" value="' + escapeHtml(dataVariable) + '" placeholder="column key holding JSON object"></div>' +
        '<div class="step-field"><label>Token row variable (optional)</label><input type="text" data-field="tokenVariableKey" data-step="' + i + '" value="' + escapeHtml(tokenVariableKey) + '" placeholder="Leave empty to use Settings → Apify token"></div>' +
        '<div class="step-field apify-row-outkey" style="display:' + ((mode === 'syncOutput' || (mode === 'asyncPoll' && asyncResultType === 'output')) ? '' : 'none') + '"><label>OUTPUT record key</label><input type="text" data-field="outputRecordKey" data-step="' + i + '" value="' + escapeHtml(outputRecordKey) + '" placeholder="Default: OUTPUT"><span class="step-hint">Max 256 characters; supports {{vars}}.</span></div>' +
        '<div class="step-field apify-row-sync-timeout" style="display:' + ((mode === 'syncDataset' || mode === 'syncOutput') ? '' : 'none') + '"><label>Sync HTTP timeout (ms)</label><input type="number" data-field="syncTimeoutMs" data-step="' + i + '" value="' + syncTimeoutMs + '" min="5000" max="600000" step="1000"><span class="step-hint">Client abort; max 600000 ms (10 min).</span></div>' +
        '<div class="step-field apify-row-sync-dataset-page" style="display:' + (mode === 'syncDataset' ? '' : 'none') + '"><label>Sync dataset limit (API)</label><input type="text" data-field="apifySyncDatasetLimit" data-step="' + i + '" value="' + escapeHtml(apifySyncDatasetLimit) + '" placeholder="Apify limit query param"></div>' +
        '<div class="step-field apify-row-sync-dataset-page" style="display:' + (mode === 'syncDataset' ? '' : 'none') + '"><label>Sync dataset offset (API)</label><input type="text" data-field="apifySyncDatasetOffset" data-step="' + i + '" value="' + escapeHtml(apifySyncDatasetOffset) + '" placeholder="0 or {{offset}}"></div>' +
        '<div class="step-field apify-row-dataset-fields" style="display:' + (showDatasetFields ? '' : 'none') + '"><label>Dataset fields (optional)</label><input type="text" data-field="apifySyncDatasetFields" data-step="' + i + '" value="' + escapeHtml(apifySyncDatasetFields) + '" placeholder="Comma-separated, Apify fields param"></div>' +
        '<div class="step-field apify-row-dataset-fields" style="display:' + (showDatasetFields ? '' : 'none') + '"><label>Dataset omit (optional)</label><input type="text" data-field="apifySyncDatasetOmit" data-step="' + i + '" value="' + escapeHtml(apifySyncDatasetOmit) + '" placeholder="Comma-separated, Apify omit param"></div>' +
        '<div class="step-field apify-row-async" style="display:' + (mode === 'asyncPoll' ? '' : 'none') + '"><label>Max wait for run (ms)</label><input type="number" data-field="asyncMaxWaitMs" data-step="' + i + '" value="' + asyncMaxWaitMs + '" min="5000" max="7200000" step="1000"><span class="step-hint">Max 7200000 ms (2 h).</span></div>' +
        '<div class="step-field apify-row-async-start-wait" style="display:' + (mode === 'asyncPoll' ? '' : 'none') + '"><label>Wait on start (sec, 1–60)</label><input type="text" data-field="apifyStartWaitForFinishSecs" data-step="' + i + '" value="' + escapeHtml(apifyStartWaitForFinishSecs) + '" placeholder="Apify waitForFinish on POST /runs"></div>' +
        '<div class="step-field apify-row-async" style="display:' + (mode === 'asyncPoll' ? '' : 'none') + '"><label>Poll interval (ms, after waitForFinish)</label><input type="number" data-field="pollIntervalMs" data-step="' + i + '" value="' + pollIntervalMs + '" min="0" max="300000" step="100"><span class="step-hint">0 = no delay; max 300000 ms.</span></div>' +
        '<div class="step-field apify-row-dataset-cap" style="display:' + ((mode === 'syncDataset' || (mode === 'asyncPoll' && asyncResultType === 'dataset')) ? '' : 'none') + '"><label>Max dataset items (0 = all)</label><input type="number" data-field="datasetMaxItems" data-step="' + i + '" value="' + (datasetMaxItems || '') + '" min="0" max="50000000" step="1"><span class="step-hint">Cap 50M.</span></div>' +
        '<div class="step-field"><label class="step-hint" style="display:block;margin-bottom:4px;">Advanced — Apify run query options (optional)</label><span class="step-hint">Passed to Apify as <code>timeout</code> (seconds), <code>memory</code> (MB), <code>maxItems</code> (pay-per-result cap), <code>build</code> tag. Use numbers or {{vars}}.</span></div>' +
        '<div class="step-field"><label>Run timeout (sec)</label><input type="text" data-field="apifyRunTimeoutSecs" data-step="' + i + '" value="' + escapeHtml(apifyRunTimeoutSecs) + '" placeholder="e.g. 300"></div>' +
        '<div class="step-field"><label>Memory (MB)</label><input type="text" data-field="apifyRunMemoryMbytes" data-step="' + i + '" value="' + escapeHtml(apifyRunMemoryMbytes) + '" placeholder="e.g. 1024"></div>' +
        '<div class="step-field"><label>maxItems (pay-per-result)</label><input type="text" data-field="apifyRunMaxItems" data-step="' + i + '" value="' + escapeHtml(apifyRunMaxItems) + '" placeholder="optional"></div>' +
        '<div class="step-field"><label>Build</label><input type="text" data-field="apifyBuild" data-step="' + i + '" value="' + escapeHtml(apifyBuild) + '" placeholder="Docker build tag"><span class="step-hint">Max 256 characters after {{vars}}.</span></div>' +
        '<div class="step-field"><label>Max total charge (USD)</label><input type="text" data-field="apifyMaxTotalChargeUsd" data-step="' + i + '" value="' + escapeHtml(apifyMaxTotalChargeUsd) + '" placeholder="e.g. 5 or {{maxUsd}}"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="apifyRestartOnError" data-step="' + i + '"' + (apifyRestartOnError ? ' checked' : '') + '> Restart run on failure</label><span class="step-hint">Apify <code>restartOnError=true</code>.</span></div>' +
        '<div class="step-field"><label>Save result to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAsVariable) + '" placeholder="apifyResult"></div>' +
        '<div class="step-field apify-row-async"><label>Save run id to variable</label><input type="text" data-field="saveRunIdVariable" data-step="' + i + '" value="' + escapeHtml(saveRunIdVariable) + '"></div>' +
        '<div class="step-field apify-row-async"><label>Save run status to variable</label><input type="text" data-field="saveStatusVariable" data-step="' + i + '" value="' + escapeHtml(saveStatusVariable) + '"></div>' +
        '<div class="step-field apify-row-async"><label>Save run metadata (JSON string)</label><input type="text" data-field="saveRunMetaJsonVariable" data-step="' + i + '" value="' + escapeHtml(saveRunMetaJsonVariable) + '" placeholder="e.g. apifyRunMeta"></div>' +
        '<div class="step-field apify-row-async"><label>Save Console URL to variable</label><input type="text" data-field="saveConsoleUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveConsoleUrlVariable) + '" placeholder="e.g. apifyRunUrl"></div>' +
        '<div class="step-field apify-row-async"><label>Save default dataset id to variable</label><input type="text" data-field="saveDatasetIdVariable" data-step="' + i + '" value="' + escapeHtml(saveDatasetIdVariable) + '" placeholder="optional"></div>' +
        '<div class="step-field apify-row-async"><label>Save default KV store id to variable</label><input type="text" data-field="saveKeyValueStoreIdVariable" data-step="' + i + '" value="' + escapeHtml(saveKeyValueStoreIdVariable) + '" placeholder="optional"></div>' +
        '</div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('apifyActorRun', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        return el.value;
      };
      var out = { type: 'apifyActorRun' };
      out.runIf = (getVal('runIf') || '').trim();
      out.targetType = getVal('targetType') === 'task' ? 'task' : 'actor';
      out.resourceId = (getVal('resourceId') || '').trim();
      out.mode = getVal('mode') || 'syncDataset';
      out.inputSource = getVal('inputSource') === 'variable' ? 'variable' : 'template';
      out.inputTemplate = (getVal('inputTemplate') || '').trim();
      out.dataVariable = (getVal('dataVariable') || '').trim();
      out.tokenVariableKey = (getVal('tokenVariableKey') || '').trim();
      out.outputRecordKey = (getVal('outputRecordKey') || '').trim();
      out.asyncResultType = getVal('asyncResultType') === 'output' ? 'output' : 'dataset';
      var st = parseInt(getVal('syncTimeoutMs'), 10);
      if (!isNaN(st) && st >= 5000) out.syncTimeoutMs = st;
      var am = parseInt(getVal('asyncMaxWaitMs'), 10);
      if (!isNaN(am) && am >= 5000) out.asyncMaxWaitMs = am;
      var pi = parseInt(getVal('pollIntervalMs'), 10);
      if (!isNaN(pi) && pi >= 0) out.pollIntervalMs = pi;
      var dm = parseInt(getVal('datasetMaxItems'), 10);
      if (!isNaN(dm) && dm > 0) out.datasetMaxItems = dm;
      out.apifyRunTimeoutSecs = (getVal('apifyRunTimeoutSecs') || '').trim();
      out.apifyRunMemoryMbytes = (getVal('apifyRunMemoryMbytes') || '').trim();
      out.apifyRunMaxItems = (getVal('apifyRunMaxItems') || '').trim();
      out.apifyBuild = (getVal('apifyBuild') || '').trim();
      out.apifyMaxTotalChargeUsd = (getVal('apifyMaxTotalChargeUsd') || '').trim();
      out.apifySyncDatasetLimit = (getVal('apifySyncDatasetLimit') || '').trim();
      out.apifySyncDatasetOffset = (getVal('apifySyncDatasetOffset') || '').trim();
      out.apifySyncDatasetFields = (getVal('apifySyncDatasetFields') || '').trim();
      out.apifySyncDatasetOmit = (getVal('apifySyncDatasetOmit') || '').trim();
      out.apifyStartWaitForFinishSecs = (getVal('apifyStartWaitForFinishSecs') || '').trim();
      var restartEl = item.querySelector('[data-field="apifyRestartOnError"][data-step="' + idx + '"]');
      out.apifyRestartOnError = restartEl && restartEl.type === 'checkbox' ? restartEl.checked : false;
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim();
      out.saveRunIdVariable = (getVal('saveRunIdVariable') || '').trim();
      out.saveStatusVariable = (getVal('saveStatusVariable') || '').trim();
      out.saveRunMetaJsonVariable = (getVal('saveRunMetaJsonVariable') || '').trim();
      out.saveConsoleUrlVariable = (getVal('saveConsoleUrlVariable') || '').trim();
      out.saveDatasetIdVariable = (getVal('saveDatasetIdVariable') || '').trim();
      out.saveKeyValueStoreIdVariable = (getVal('saveKeyValueStoreIdVariable') || '').trim();
      return out;
    },
  });
})();
