(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('checkSuccessfulGenerations', {
    label: 'Check successful generations',
    defaultAction: {
      type: 'checkSuccessfulGenerations',
      listSelector: '[data-testid="virtuoso-item-list"]',
      itemSelector: '[data-index]',
      minSuccessful: 1,
      failedGenerationPhrases: ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'],
      onZeroSuccess: 'retry',
      maxRetriesOnFail: 5,
    },
    getSummary: function(action) {
      const min = action.minSuccessful ?? 1;
      const onZero = action.onZeroSuccess || 'retry';
      return 'Check successful generations (min ' + min + ', on fail: ' + onZero + ')';
    },
    handlesOwnWait: true,
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var listSelector = action.listSelector || '[data-testid="virtuoso-item-list"]';
      var itemSelector = action.itemSelector || '[data-index]';
      var successContainerJson = action.successContainerSelectors ? JSON.stringify(action.successContainerSelectors, null, 2) : '';
      var minSuccessful = action.minSuccessful ?? 1;
      var phrases = Array.isArray(action.failedGenerationPhrases) ? action.failedGenerationPhrases.join(', ') : 'failed generation, generation failed';
      var onZeroSuccess = action.onZeroSuccess || 'retry';
      var maxRetries = action.maxRetriesOnFail ?? 5;
      var onlyText = !!action.onlyText;
      var onlyImages = !!action.onlyImages;
      var onlyVideo = !!action.onlyVideo;
      var highlight = !!action.highlight;
      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{prompt}}"></div>' +
        '<div class="step-field"><label>List selector (optional if using Success container below)</label><input type="text" data-field="listSelector" data-step="' + i + '" value="' + escapeHtml(listSelector) + '" placeholder="[data-testid=\'virtuoso-item-list\']"></div>' +
        '<div class="step-field"><label>Item selector (within list)</label><input type="text" data-field="itemSelector" data-step="' + i + '" value="' + escapeHtml(itemSelector) + '" placeholder="[data-index]"></div>' +
        '<div class="step-field"><label>Success container selectors (JSON; overrides list when set)</label><textarea data-field="successContainerSelectors" data-step="' + i + '" rows="3" placeholder="[]">' + escapeHtml(successContainerJson) + '</textarea><button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="successContainerSelectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Min successful count</label><input type="number" data-field="minSuccessful" data-step="' + i + '" value="' + minSuccessful + '" min="0"></div>' +
        '<div class="step-field"><label>Failed generation phrases (comma-separated)</label><input type="text" data-field="failedGenerationPhrases" data-step="' + i + '" value="' + escapeHtml(phrases) + '" placeholder="failed generation, generation failed"></div>' +
        '<div class="step-field"><label>On zero success</label><select data-field="onZeroSuccess" data-step="' + i + '"><option value="retry"' + (onZeroSuccess === 'retry' ? ' selected' : '') + '>Retry row</option><option value="stop"' + (onZeroSuccess === 'stop' ? ' selected' : '') + '>Stop batch</option><option value="skip"' + (onZeroSuccess === 'skip' ? ' selected' : '') + '>Skip to next row</option></select></div>' +
        '<div class="step-field"><label>Max retries on fail</label><input type="number" data-field="maxRetriesOnFail" data-step="' + i + '" value="' + maxRetries + '" min="1" max="10"></div>' +
        '<div class="step-field"><label>Filter successful items:</label><label class="inline-label"><input type="checkbox" data-field="onlyText" data-step="' + i + '"' + (onlyText ? ' checked' : '') + '> Only text</label> <label class="inline-label"><input type="checkbox" data-field="onlyImages" data-step="' + i + '"' + (onlyImages ? ' checked' : '') + '> Only images</label> <label class="inline-label"><input type="checkbox" data-field="onlyVideo" data-step="' + i + '"' + (onlyVideo ? ' checked' : '') + '> Only video</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="highlight" data-step="' + i + '"' + (highlight ? ' checked' : '') + '> Highlight matching elements</label></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('checkSuccessfulGenerations', action, i, totalCount, helpers, body);
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
      var out = { type: 'checkSuccessfulGenerations' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      var listVal = (getVal('listSelector') || '').trim();
      out.listSelector = listVal ? listVal : (action.listSelector || '[data-testid="virtuoso-item-list"]');
      var itemVal = (getVal('itemSelector') || '').trim();
      out.itemSelector = itemVal ? itemVal : (action.itemSelector || '[data-index]');
      var successVal = (getVal('successContainerSelectors') || '').trim();
      if (successVal) {
        try {
          out.successContainerSelectors = JSON.parse(successVal);
        } catch (_) {
          out.successContainerSelectors = Array.isArray(action.successContainerSelectors) ? action.successContainerSelectors : null;
        }
      } else {
        out.successContainerSelectors = null;
      }
      var minVal = getVal('minSuccessful');
      out.minSuccessful = minVal !== undefined && minVal !== '' ? Math.max(0, parseInt(minVal, 10) || 1) : 1;
      var phrasesVal = (getVal('failedGenerationPhrases') || '').trim();
      if (phrasesVal) {
        out.failedGenerationPhrases = phrasesVal.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      } else {
        out.failedGenerationPhrases = action.failedGenerationPhrases || ['failed generation', 'generation failed'];
      }
      out.onZeroSuccess = getVal('onZeroSuccess') || 'retry';
      var maxRetriesVal = getVal('maxRetriesOnFail');
      out.maxRetriesOnFail = maxRetriesVal !== undefined && maxRetriesVal !== '' ? Math.min(10, Math.max(1, parseInt(maxRetriesVal, 10) || 5)) : 5;
      out.onlyText = getCheck('onlyText');
      out.onlyImages = getCheck('onlyImages');
      out.onlyVideo = getCheck('onlyVideo');
      out.highlight = getCheck('highlight');
      return out;
    },
  });
})();
