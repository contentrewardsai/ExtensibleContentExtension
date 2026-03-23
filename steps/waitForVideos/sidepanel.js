(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('waitForVideos', {
    label: 'Wait for videos',
    defaultAction: { type: 'waitForVideos', listSelector: '[data-testid="virtuoso-item-list"]', itemSelector: '[data-index]', whichItem: 'last', requireRendered: true, failedGenerationPhrases: ['failed generation', 'generation failed'], timeoutMs: 300000 },
    getSummary: function(action) {
      return 'Wait for videos (' + (action.whichItem || 'last') + ' item)';
    },
    handlesOwnWait: true,
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var listSelector = action.listSelector || '[data-testid="virtuoso-item-list"]';
      var itemSelector = action.itemSelector || '[data-index]';
      var whichItem = action.whichItem || 'last';
      var requireRendered = action.requireRendered !== false;
      var timeoutMs = action.timeoutMs ?? 300000;
      var phrases = Array.isArray(action.failedGenerationPhrases) ? action.failedGenerationPhrases.join(', ') : 'failed generation, generation failed';
      var runIfVal = (action.runIf || '').trim();
      var body = '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{prompt}}"></div>' +
        '<div class="step-field"><label>List selector</label><input type="text" data-field="listSelector" data-step="' + i + '" value="' + escapeHtml(listSelector) + '"></div>' +
        '<div class="step-field"><label>Item selector (within list)</label><input type="text" data-field="itemSelector" data-step="' + i + '" value="' + escapeHtml(itemSelector) + '" placeholder="[data-index]"></div>' +
        '<div class="step-field"><label>Which item to wait for</label><select data-field="whichItem" data-step="' + i + '">' +
        '<option value="last"' + (whichItem === 'last' ? ' selected' : '') + '>Last (newest)</option>' +
        '<option value="first"' + (whichItem === 'first' ? ' selected' : '') + '>First</option></select></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="requireRendered" data-step="' + i + '"' + (requireRendered ? ' checked' : '') + '> Require video rendered (width/height)</label></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + timeoutMs + '" min="5000"></div>' +
        '<div class="step-field"><label>Failed generation phrases (comma-separated)</label><input type="text" data-field="failedGenerationPhrases" data-step="' + i + '" value="' + escapeHtml(phrases) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('waitForVideos', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var getCheck = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.checked : false;
      };
      var out = { type: 'waitForVideos' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      var listVal = (getVal('listSelector') || '').trim();
      out.listSelector = listVal || (action.listSelector || '[data-testid="virtuoso-item-list"]');
      out.itemSelector = (getVal('itemSelector') || '').trim() || '[data-index]';
      out.whichItem = getVal('whichItem') || 'last';
      var reqEl = item.querySelector('[data-field="requireRendered"][data-step="' + idx + '"]');
      out.requireRendered = reqEl ? reqEl.checked : true;
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
