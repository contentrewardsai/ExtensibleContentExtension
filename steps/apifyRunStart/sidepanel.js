(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('apifyRunStart', {
    label: 'Apify — start run only',
    defaultAction: {
      type: 'apifyRunStart',
      runIf: '',
      targetType: 'actor',
      resourceId: '',
      inputSource: 'template',
      inputTemplate: '{}',
      dataVariable: '',
      tokenVariableKey: '',
      apifyRunTimeoutSecs: '',
      apifyRunMemoryMbytes: '',
      apifyRunMaxItems: '',
      apifyBuild: '',
      apifyMaxTotalChargeUsd: '',
      apifyRestartOnError: false,
      apifyStartWaitForFinishSecs: '',
      saveRunIdVariable: 'apifyRunId',
      saveStatusVariable: '',
      saveRunMetaJsonVariable: '',
      saveConsoleUrlVariable: '',
      saveDatasetIdVariable: '',
      saveKeyValueStoreIdVariable: '',
    },
    getSummary: function(action) {
      var id = (action.resourceId || '').toString().trim();
      if (id) return 'Start: ' + id.slice(0, 32) + (id.length > 32 ? '…' : '');
      return 'Apify start run';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var dv = (action.dataVariable || '').trim();
      if (dv) out.push({ rowKey: dv, label: dv, hint: 'input JSON' });
      var tok = (action.tokenVariableKey || '').trim();
      if (tok) out.push({ rowKey: tok, label: tok, hint: 'Apify token (optional)' });
      function addSave(k, hint) {
        var v = (action[k] || '').trim();
        if (v) out.push({ rowKey: v, label: v, hint: hint });
      }
      addSave('saveRunIdVariable', 'run id');
      addSave('saveStatusVariable', 'status');
      addSave('saveRunMetaJsonVariable', 'run JSON');
      addSave('saveConsoleUrlVariable', 'Console URL');
      addSave('saveDatasetIdVariable', 'dataset id');
      addSave('saveKeyValueStoreIdVariable', 'KV store id');
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIfVal = (action.runIf || '').trim();
      var targetType = action.targetType === 'task' ? 'task' : 'actor';
      var inputSource = action.inputSource === 'variable' ? 'variable' : 'template';
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '"></div>' +
        '<div class="step-field"><label>Target</label><select data-field="targetType" data-step="' + i + '">' +
        '<option value="actor"' + (targetType === 'actor' ? ' selected' : '') + '>Actor</option>' +
        '<option value="task"' + (targetType === 'task' ? ' selected' : '') + '>Actor task</option></select></div>' +
        '<div class="step-field"><label>Actor or Task ID</label><input type="text" data-field="resourceId" data-step="' + i + '" value="' + escapeHtml((action.resourceId || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Input source</label><select data-field="inputSource" data-step="' + i + '">' +
        '<option value="template"' + (inputSource === 'template' ? ' selected' : '') + '>JSON template</option>' +
        '<option value="variable"' + (inputSource === 'variable' ? ' selected' : '') + '>Row variable</option></select></div>' +
        '<div class="step-field"><label>Input JSON template</label><textarea data-field="inputTemplate" data-step="' + i + '" rows="3">' + escapeHtml(String(action.inputTemplate != null ? action.inputTemplate : '{}')) + '</textarea></div>' +
        '<div class="step-field"><label>Row variable for input</label><input type="text" data-field="dataVariable" data-step="' + i + '" value="' + escapeHtml((action.dataVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Token row variable (optional)</label><input type="text" data-field="tokenVariableKey" data-step="' + i + '" value="' + escapeHtml((action.tokenVariableKey || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Wait on start (sec, 1–60)</label><input type="text" data-field="apifyStartWaitForFinishSecs" data-step="' + i + '" value="' + escapeHtml(String(action.apifyStartWaitForFinishSecs || '')) + '"></div>' +
        '<div class="step-field"><label>Run timeout (sec) / Memory (MB) / maxItems</label><span class="step-hint">Optional {{vars}}</span></div>' +
        '<div class="step-field"><input type="text" data-field="apifyRunTimeoutSecs" data-step="' + i + '" placeholder="timeout sec" value="' + escapeHtml(String(action.apifyRunTimeoutSecs || '')) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="apifyRunMemoryMbytes" data-step="' + i + '" placeholder="memory MB" value="' + escapeHtml(String(action.apifyRunMemoryMbytes || '')) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="apifyRunMaxItems" data-step="' + i + '" placeholder="maxItems" value="' + escapeHtml(String(action.apifyRunMaxItems || '')) + '"></div>' +
        '<div class="step-field"><label>Build / Max USD</label><input type="text" data-field="apifyBuild" data-step="' + i + '" value="' + escapeHtml(String(action.apifyBuild || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="apifyMaxTotalChargeUsd" data-step="' + i + '" value="' + escapeHtml(String(action.apifyMaxTotalChargeUsd || '')) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="apifyRestartOnError" data-step="' + i + '"' + (action.apifyRestartOnError === true ? ' checked' : '') + '> Restart on failure</label></div>' +
        '<div class="step-field"><label>Save run id</label><input type="text" data-field="saveRunIdVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRunIdVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Save status / meta JSON / console URL / dataset id / KV id</label></div>' +
        '<div class="step-field"><input type="text" data-field="saveStatusVariable" data-step="' + i + '" placeholder="status var" value="' + escapeHtml((action.saveStatusVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveRunMetaJsonVariable" data-step="' + i + '" placeholder="meta JSON var" value="' + escapeHtml((action.saveRunMetaJsonVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveConsoleUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveConsoleUrlVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveDatasetIdVariable" data-step="' + i + '" value="' + escapeHtml((action.saveDatasetIdVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><input type="text" data-field="saveKeyValueStoreIdVariable" data-step="' + i + '" value="' + escapeHtml((action.saveKeyValueStoreIdVariable || '').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('apifyRunStart', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function gv(f) {
        var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]');
        return el ? el.value : '';
      }
      var out = {
        type: 'apifyRunStart',
        runIf: (gv('runIf') || '').trim(),
        targetType: gv('targetType') === 'task' ? 'task' : 'actor',
        resourceId: (gv('resourceId') || '').trim(),
        inputSource: gv('inputSource') === 'variable' ? 'variable' : 'template',
        inputTemplate: (gv('inputTemplate') || '').trim(),
        dataVariable: (gv('dataVariable') || '').trim(),
        tokenVariableKey: (gv('tokenVariableKey') || '').trim(),
        apifyRunTimeoutSecs: (gv('apifyRunTimeoutSecs') || '').trim(),
        apifyRunMemoryMbytes: (gv('apifyRunMemoryMbytes') || '').trim(),
        apifyRunMaxItems: (gv('apifyRunMaxItems') || '').trim(),
        apifyBuild: (gv('apifyBuild') || '').trim(),
        apifyMaxTotalChargeUsd: (gv('apifyMaxTotalChargeUsd') || '').trim(),
        apifyStartWaitForFinishSecs: (gv('apifyStartWaitForFinishSecs') || '').trim(),
        saveRunIdVariable: (gv('saveRunIdVariable') || '').trim(),
        saveStatusVariable: (gv('saveStatusVariable') || '').trim(),
        saveRunMetaJsonVariable: (gv('saveRunMetaJsonVariable') || '').trim(),
        saveConsoleUrlVariable: (gv('saveConsoleUrlVariable') || '').trim(),
        saveDatasetIdVariable: (gv('saveDatasetIdVariable') || '').trim(),
        saveKeyValueStoreIdVariable: (gv('saveKeyValueStoreIdVariable') || '').trim(),
      };
      var re = item.querySelector('[data-field="apifyRestartOnError"][data-step="' + idx + '"]');
      out.apifyRestartOnError = re && re.checked;
      return out;
    },
  });
})();
