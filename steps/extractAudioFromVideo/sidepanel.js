(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('extractAudioFromVideo', {
    label: 'Extract audio from video',
    defaultAction: {
      type: 'extractAudioFromVideo',
      runIf: '',
      videoVariableKey: 'sourceVideo',
      saveAsVariable: 'extractedAudio',
    },
    getSummary: function(action) {
      var v = (action.videoVariableKey || 'sourceVideo').trim();
      var to = (action.saveAsVariable || 'extractedAudio').trim();
      return 'Audio from ' + v + ' → ' + to;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var vk = (action.videoVariableKey || action.videoVariable || 'sourceVideo').trim();
      var saveAs = (action.saveAsVariable || 'extractedAudio').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Video variable (data/blob URL)</label><input type="text" data-field="videoVariableKey" data-step="' + i + '" value="' + escapeHtml(vk) + '" placeholder="sourceVideo"></div>' +
        '<div class="step-field"><label>Save audio to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAs) + '" placeholder="extractedAudio"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('extractAudioFromVideo', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'extractAudioFromVideo' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.videoVariableKey = (getVal('videoVariableKey') || '').trim() || 'sourceVideo';
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || 'extractedAudio';
      return out;
    },
  });
})();
