(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('embeddingCheck', {
    label: 'Embedding check',
    defaultAction: {
      type: 'embeddingCheck',
      outputVariable: 'outputText',
      expectedVariable: 'expectedText',
      threshold: 0.75,
    },
    getSummary: function(action) {
      var o = action.outputVariable || 'outputText';
      var e = action.expectedVariable || 'expectedText';
      var th = action.threshold != null ? action.threshold : 0.75;
      return 'Compare ' + o + ' vs ' + e + ' (≥' + th + ')';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var outputVar = action.outputVariable || 'outputText';
      var expectedVar = action.expectedVariable || 'expectedText';
      var threshold = action.threshold != null ? action.threshold : 0.75;
      var body =
        '<div class="step-field"><label>Row variable with output text</label><input type="text" data-field="outputVariable" data-step="' + i + '" value="' + escapeHtml(outputVar) + '" placeholder="outputText"></div>' +
        '<div class="step-field"><label>Row variable with expected text</label><input type="text" data-field="expectedVariable" data-step="' + i + '" value="' + escapeHtml(expectedVar) + '" placeholder="expectedText"></div>' +
        '<div class="step-field"><label>Pass threshold (0–1)</label><input type="number" data-field="threshold" data-step="' + i + '" value="' + escapeHtml(String(threshold)) + '" min="0" max="1" step="0.05"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('embeddingCheck', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var th = getVal('threshold');
      return {
        type: 'embeddingCheck',
        outputVariable: (getVal('outputVariable') || '').trim() || 'outputText',
        expectedVariable: (getVal('expectedVariable') || '').trim() || 'expectedText',
        threshold: th != null && th !== '' ? Math.max(0, Math.min(1, parseFloat(th) || 0.75)) : 0.75,
      };
    },
  });
})();
