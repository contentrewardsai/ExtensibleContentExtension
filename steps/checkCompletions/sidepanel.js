(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('checkCompletions', {
    label: 'Check completions',
    defaultAction: { type: 'checkCompletions', listSelector: '[data-testid="virtuoso-item-list"]', minCompletions: 1, failedGenerationPhrases: ['failed generation', 'generation failed'], timeoutMs: 300000 },
    getSummary: function(action) {
      return 'Check completions (min ' + (action.minCompletions ?? 1) + ')';
    },
    handlesOwnWait: true,
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var listSelector = action.listSelector || '[data-testid="virtuoso-item-list"]';
      var minCompletions = action.minCompletions ?? 1;
      var timeoutMs = action.timeoutMs ?? 300000;
      var phrases = Array.isArray(action.failedGenerationPhrases) ? action.failedGenerationPhrases.join(', ') : 'failed generation, generation failed';
      var body = '<div class="step-field"><label>List selector</label><input type="text" data-field="listSelector" data-step="' + i + '" value="' + escapeHtml(listSelector) + '"></div>' +
        '<div class="step-field"><label>Min completions (e.g. videos)</label><input type="number" data-field="minCompletions" data-step="' + i + '" value="' + minCompletions + '" min="1"></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + timeoutMs + '" min="5000"></div>' +
        '<div class="step-field"><label>Failed generation phrases (comma-separated)</label><input type="text" data-field="failedGenerationPhrases" data-step="' + i + '" value="' + escapeHtml(phrases) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('checkCompletions', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'checkCompletions' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      var listVal = (getVal('listSelector') || '').trim();
      out.listSelector = listVal || (action.listSelector || '[data-testid="virtuoso-item-list"]');
      var minVal = getVal('minCompletions');
      out.minCompletions = minVal != null && minVal !== '' ? Math.max(1, parseInt(minVal, 10) || 1) : 1;
      var phrasesVal = (getVal('failedGenerationPhrases') || '').trim();
      if (phrasesVal) {
        out.failedGenerationPhrases = phrasesVal.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      } else {
        out.failedGenerationPhrases = action.failedGenerationPhrases || ['failed generation', 'generation failed'];
      }
      var timeoutVal = getVal('timeoutMs');
      out.timeoutMs = timeoutVal ? Math.max(5000, parseInt(timeoutVal, 10) || 300000) : 300000;
      return out;
    },
  });
})();
