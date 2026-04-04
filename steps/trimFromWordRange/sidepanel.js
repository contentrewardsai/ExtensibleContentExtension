(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('trimFromWordRange', {
    label: 'Trim times from word range',
    defaultAction: {
      type: 'trimFromWordRange',
      runIf: '',
      wordsVariableKey: 'transcriptWords',
      startWordIndex: 0,
      endWordIndex: 0,
      saveStartVariable: 'clipStart',
      saveEndVariable: 'clipEnd',
    },
    getSummary: function(action) {
      var w = (action.wordsVariableKey || 'transcriptWords').trim();
      var a = action.startWordIndex != null ? action.startWordIndex : 0;
      var b = action.endWordIndex != null ? action.endWordIndex : a;
      return 'Words ' + w + ' [' + a + '..' + b + '] → times';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var wk = (action.wordsVariableKey || 'transcriptWords').trim();
      var si = action.startWordIndex != null ? String(action.startWordIndex) : '0';
      var ei = action.endWordIndex != null ? String(action.endWordIndex) : si;
      var sv = (action.saveStartVariable || 'clipStart').trim();
      var ev = (action.saveEndVariable || 'clipEnd').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Words JSON variable</label><input type="text" data-field="wordsVariableKey" data-step="' + i + '" value="' + escapeHtml(wk) + '"></div>' +
        '<div class="step-field"><label>Start word index (0-based)</label><input type="number" data-field="startWordIndex" data-step="' + i + '" value="' + escapeHtml(si) + '" min="0"></div>' +
        '<div class="step-field"><label>End word index (inclusive)</label><input type="number" data-field="endWordIndex" data-step="' + i + '" value="' + escapeHtml(ei) + '" min="0"></div>' +
        '<div class="step-field"><label>Save start (seconds) to</label><input type="text" data-field="saveStartVariable" data-step="' + i + '" value="' + escapeHtml(sv) + '"></div>' +
        '<div class="step-field"><label>Save end (seconds) to</label><input type="text" data-field="saveEndVariable" data-step="' + i + '" value="' + escapeHtml(ev) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('trimFromWordRange', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'trimFromWordRange' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.wordsVariableKey = (getVal('wordsVariableKey') || '').trim() || 'transcriptWords';
      out.startWordIndex = parseInt(getVal('startWordIndex'), 10);
      out.endWordIndex = parseInt(getVal('endWordIndex'), 10);
      if (!Number.isFinite(out.startWordIndex)) out.startWordIndex = 0;
      if (!Number.isFinite(out.endWordIndex)) out.endWordIndex = out.startWordIndex;
      out.saveStartVariable = (getVal('saveStartVariable') || '').trim() || 'clipStart';
      out.saveEndVariable = (getVal('saveEndVariable') || '').trim() || 'clipEnd';
      return out;
    },
  });
})();
