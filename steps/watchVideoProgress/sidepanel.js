(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('watchVideoProgress', {
    label: 'Watch video progress',
    defaultAction: { type: 'watchVideoProgress', containerSelectors: [], timeoutMs: 120000 },
    getSummary: function() { return 'Watch video progress (no % in container)'; },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var containerJson = JSON.stringify(action.containerSelectors || [], null, 2);
      var timeoutMs = action.timeoutMs ?? 120000;
      var phrases = Array.isArray(action.failedGenerationPhrases) ? action.failedGenerationPhrases.join(', ') : 'failed generation, generation failed';
      var body = '<div class="step-field"><label>Container selectors (JSON)</label><textarea data-field="containerSelectors" data-step="' + i + '">' + escapeHtml(containerJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="containerSelectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + timeoutMs + '" min="5000"></div>' +
        '<div class="step-field"><label>Failed generation phrases (comma-separated)</label><input type="text" data-field="failedGenerationPhrases" data-step="' + i + '" value="' + escapeHtml(phrases) + '" placeholder="failed generation, generation failed"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('watchVideoProgress', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'watchVideoProgress' };
      var containerVal = getVal('containerSelectors');
      if (containerVal && containerVal.trim()) {
        try {
          out.containerSelectors = JSON.parse(containerVal);
        } catch (_) {
          out.containerSelectors = Array.isArray(action.containerSelectors) ? action.containerSelectors : [];
        }
      } else {
        out.containerSelectors = Array.isArray(action.containerSelectors) ? action.containerSelectors : [];
      }
      var timeoutVal = getVal('timeoutMs');
      out.timeoutMs = timeoutVal ? Math.max(5000, parseInt(timeoutVal, 10) || 120000) : 120000;
      var phrasesVal = getVal('failedGenerationPhrases');
      if (phrasesVal && phrasesVal.trim()) {
        out.failedGenerationPhrases = phrasesVal.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      }
      return out;
    },
  });
})();
