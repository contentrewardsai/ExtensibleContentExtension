(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('whisperCheck', {
    label: 'Whisper check',
    defaultAction: {
      type: 'whisperCheck',
      transcriptVariable: 'transcript',
      expectedVariable: 'expectedText',
      threshold: 0.75,
    },
    getSummary: function(action) {
      var t = action.transcriptVariable || 'transcript';
      var e = action.expectedVariable || 'expectedText';
      var th = action.threshold != null ? action.threshold : 0.75;
      return 'Compare ' + t + ' vs ' + e + ' (≥' + th + ')';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var transcriptVar = action.transcriptVariable || 'transcript';
      var expectedVar = action.expectedVariable || 'expectedText';
      var threshold = action.threshold != null ? action.threshold : 0.75;
      var body =
        '<div class="step-field"><label>Row variable with transcript</label><input type="text" data-field="transcriptVariable" data-step="' + i + '" value="' + escapeHtml(transcriptVar) + '" placeholder="transcript"></div>' +
        '<div class="step-field"><label>Row variable with expected text</label><input type="text" data-field="expectedVariable" data-step="' + i + '" value="' + escapeHtml(expectedVar) + '" placeholder="expectedText"></div>' +
        '<div class="step-field"><label>Pass threshold (0–1)</label><input type="number" data-field="threshold" data-step="' + i + '" value="' + escapeHtml(String(threshold)) + '" min="0" max="1" step="0.05"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('whisperCheck', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var th = getVal('threshold');
      return {
        type: 'whisperCheck',
        transcriptVariable: (getVal('transcriptVariable') || '').trim() || 'transcript',
        expectedVariable: (getVal('expectedVariable') || '').trim() || 'expectedText',
        threshold: th != null && th !== '' ? Math.max(0, Math.min(1, parseFloat(th) || 0.75)) : 0.75,
      };
    },
  });
})();
