(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('screenCapture', {
    label: 'Screen capture',
    defaultAction: {
      type: 'screenCapture',
      mode: 'screen',
      proceedWhen: 'time',
      proceedAfterMs: 60000,
      saveAsVariable: '',
    },
    getSummary: function(action) {
      var mode = action.mode || 'screen';
      var when = action.proceedWhen || 'time';
      var v = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      return 'Capture ' + mode + ', proceed when ' + when + v;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var mode = action.mode || 'screen';
      var proceedWhen = action.proceedWhen || 'time';
      var proceedAfterMs = action.proceedAfterMs != null ? action.proceedAfterMs : 60000;
      var proceedSelectors = Array.isArray(action.proceedWhenSelectors) ? JSON.stringify(action.proceedWhenSelectors, null, 2) : '';
      var proceedFallbacks = Array.isArray(action.proceedWhenFallbackSelectors) ? JSON.stringify(action.proceedWhenFallbackSelectors, null, 2) : '[]';
      var saveVar = (action.saveAsVariable || '').trim();
      var body =
        '<div class="step-field"><label>Capture mode</label><select data-field="mode" data-step="' + i + '">' +
        '<option value="screen"' + (mode === 'screen' ? ' selected' : '') + '>Screen video</option>' +
        '<option value="tabAudio"' + (mode === 'tabAudio' ? ' selected' : '') + '>Tab audio only</option>' +
        '<option value="both"' + (mode === 'both' ? ' selected' : '') + '>Screen video + audio</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Proceed when</label><select data-field="proceedWhen" data-step="' + i + '">' +
        '<option value="stepComplete"' + (proceedWhen === 'stepComplete' ? ' selected' : '') + '>Step completes</option>' +
        '<option value="time"' + (proceedWhen === 'time' ? ' selected' : '') + '>Time elapsed</option>' +
        '<option value="element"' + (proceedWhen === 'element' ? ' selected' : '') + '>Element appears</option>' +
        '<option value="manual"' + (proceedWhen === 'manual' ? ' selected' : '') + '>Manual (click Proceed)</option>' +
        '</select></div>' +
        '<div class="step-field step-proceed-time" style="display:' + (proceedWhen === 'time' ? 'block' : 'none') + '"><label>Proceed after (ms)</label><input type="number" data-field="proceedAfterMs" data-step="' + i + '" value="' + proceedAfterMs + '" min="1000" placeholder="60000"></div>' +
        '<div class="step-field step-proceed-element" style="display:' + (proceedWhen === 'element' ? 'block' : 'none') + '"><label>Proceed when element (selectors JSON)</label><textarea data-field="proceedWhenSelectors" data-step="' + i + '" rows="2">' + escapeHtml(proceedSelectors) + '</textarea></div>' +
        '<div class="step-field step-proceed-element" style="display:' + (proceedWhen === 'element' ? 'block' : 'none') + '"><label>Fallback selectors (optional)</label><textarea data-field="proceedWhenFallbackSelectors" data-step="' + i + '" rows="1" placeholder="[]">' + escapeHtml(proceedFallbacks) + '</textarea></div>' +
        '<div class="step-field"><label>Save recording to variable (optional)</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveVar) + '" placeholder="screenRecording"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      var shell = window.__CFS_buildStepItemShell('screenCapture', action, i, totalCount, helpers, body);
      var sel = shell.querySelector('[data-field="proceedWhen"][data-step="' + i + '"]');
      if (sel) {
        sel.addEventListener('change', function() {
          var v = sel.value;
          shell.querySelectorAll('.step-proceed-time').forEach(function(el) { el.style.display = v === 'time' ? 'block' : 'none'; });
          shell.querySelectorAll('.step-proceed-element').forEach(function(el) { el.style.display = v === 'element' ? 'block' : 'none'; });
        });
      }
      return shell;
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'screenCapture' };
      out.mode = (getVal('mode') || 'screen').trim();
      out.proceedWhen = (getVal('proceedWhen') || 'time').trim();
      var ms = getVal('proceedAfterMs');
      out.proceedAfterMs = ms ? Math.max(1000, parseInt(ms, 10) || 60000) : (action.proceedAfterMs != null ? action.proceedAfterMs : 60000);
      if (out.proceedWhen === 'element') {
        var selRaw = (getVal('proceedWhenSelectors') || '').trim();
        try { out.proceedWhenSelectors = selRaw ? JSON.parse(selRaw) : []; } catch (_) { out.proceedWhenSelectors = action.proceedWhenSelectors || []; }
        var fbRaw = (getVal('proceedWhenFallbackSelectors') || '').trim();
        try { out.proceedWhenFallbackSelectors = fbRaw ? JSON.parse(fbRaw) : []; } catch (_) { out.proceedWhenFallbackSelectors = action.proceedWhenFallbackSelectors || []; }
      } else {
        out.proceedWhenSelectors = undefined;
        out.proceedWhenFallbackSelectors = undefined;
        out.proceedAfterMs = out.proceedWhen === 'time' ? out.proceedAfterMs : undefined;
      }
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || undefined;
      return out;
    },
  });
})();
