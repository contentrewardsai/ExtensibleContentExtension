(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('transcribeAudio', {
    label: 'Transcribe audio',
    defaultAction: {
      type: 'transcribeAudio',
      audioVariable: 'capturedAudio',
      saveAsVariable: 'transcript',
      saveWordsToVariable: '',
    },
    getSummary: function(action) {
      var from = action.audioVariable || action.variableKey || 'capturedAudio';
      var to = action.saveAsVariable || 'transcript';
      return 'Transcribe ' + from + ' → ' + to;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var audioVar = action.audioVariable || action.variableKey || 'capturedAudio';
      var saveVar = action.saveAsVariable || 'transcript';
      var wordsVar = (action.saveWordsToVariable || '').trim();
      var body =
        '<div class="step-field"><label>Row variable with audio (data/blob URL or https)</label><input type="text" data-field="audioVariable" data-step="' + i + '" value="' + escapeHtml(audioVar) + '" placeholder="capturedAudio"></div>' +
        '<div class="step-field"><label>Save transcript to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveVar) + '" placeholder="transcript"></div>' +
        '<div class="step-field"><label>Save word timestamps to variable (optional)</label><input type="text" data-field="saveWordsToVariable" data-step="' + i + '" value="' + escapeHtml(wordsVar) + '" placeholder="transcriptWords"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('transcribeAudio', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var sw = (getVal('saveWordsToVariable') || '').trim();
      var out = {
        type: 'transcribeAudio',
        audioVariable: (getVal('audioVariable') || '').trim() || 'capturedAudio',
        saveAsVariable: (getVal('saveAsVariable') || '').trim() || 'transcript',
      };
      if (sw) out.saveWordsToVariable = sw;
      return out;
    },
  });
})();
