(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('ensureSelect', {
    label: 'Ensure dropdown',
    defaultAction: { type: 'ensureSelect', expectedText: '', optionText: '', optionTexts: [], checkSelectors: [], openSelectors: [], optionSelectors: [], optional: false },
    getSummary: function(action) {
      var opts = action.optionTexts && action.optionTexts.length ? action.optionTexts.join(', ') : (action.expectedText || action.optionText || 'dropdown');
      return 'Ensure: ' + String(opts).slice(0, 40);
    },
    shortcutLabel: '+ Ensure dropdown',
    mergeInto: function(merged, best) {
      if (best.checkSelectors && best.checkSelectors.length) merged.checkSelectors = best.checkSelectors;
      if (best.openSelectors && best.openSelectors.length) merged.openSelectors = best.openSelectors;
      if (best.optionSelectors && best.optionSelectors.length) merged.optionSelectors = best.optionSelectors;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var expectedText = action.expectedText || '';
      var optionText = action.optionText || action.expectedText || '';
      var checkJson = JSON.stringify(action.checkSelectors || action.selectors || [], null, 2);
      var openJson = JSON.stringify(action.openSelectors || action.checkSelectors || action.selectors || [], null, 2);
      var optionJson = JSON.stringify(action.optionSelectors || [], null, 2);
      var optionTextsJson = JSON.stringify(action.optionTexts || [], null, 2);
      var body = '<div class="step-field"><label>Expected text (if already set, skip)</label><input type="text" data-field="expectedText" data-step="' + i + '" value="' + escapeHtml(expectedText) + '" placeholder="e.g. Frames to Video"></div>' +
        '<div class="step-field"><label>Option text (to click when changing)</label><input type="text" data-field="optionText" data-step="' + i + '" value="' + escapeHtml(optionText) + '" placeholder="e.g. Frames to Video"></div>' +
        '<div class="step-field"><label>Multiple options (tabs) in order — JSON array</label><textarea data-field="optionTexts" data-step="' + i + '" rows="2" placeholder=\'["Video", "Frames", "Landscape", "x4"]\'>' + escapeHtml(optionTextsJson) + '</textarea></div>' +
        '<div class="step-field"><label>Delay after each option click (ms)</label><input type="number" data-field="optionTextsClickDelayMs" data-step="' + i + '" value="' + (action.optionTextsClickDelayMs ?? 250) + '" min="0" placeholder="250"></div>' +
        '<div class="step-field"><label>Key to close menu</label><input type="text" data-field="optionTextsCloseKey" data-step="' + i + '" value="' + escapeHtml(action.optionTextsCloseKey ?? 'Escape') + '" placeholder="Escape"></div>' +
        '<div class="step-field"><label>Times to send close key</label><input type="number" data-field="optionTextsCloseKeyCount" data-step="' + i + '" value="' + (action.optionTextsCloseKeyCount ?? 2) + '" min="0" placeholder="2"></div>' +
        '<div class="step-field"><label>Delay after close (ms)</label><input type="number" data-field="optionTextsAfterCloseDelayMs" data-step="' + i + '" value="' + (action.optionTextsAfterCloseDelayMs ?? 300) + '" min="0" placeholder="300"></div>' +
        '<div class="step-field"><label>Check selectors (element showing current value)</label><textarea data-field="checkSelectors" data-step="' + i + '">' + escapeHtml(checkJson) + '</textarea></div>' +
        '<div class="step-field"><label>Open selectors (click to open dropdown)</label><textarea data-field="openSelectors" data-step="' + i + '">' + escapeHtml(openJson) + '</textarea></div>' +
        '<div class="step-field"><label>Option selectors (optional)</label><textarea data-field="optionSelectors" data-step="' + i + '">' + escapeHtml(optionJson) + '</textarea></div>' +
        '<div class="step-field"><button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="checkSelectors" title="Select on page (check)">Select on page (check)</button> ' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="openSelectors" title="Select on page (open)">Select on page (open)</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('ensureSelect', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'ensureSelect' };
      var stepLabelVal = getVal('stepLabel');
      if (stepLabelVal != null) out.stepLabel = stepLabelVal.trim() ? stepLabelVal.trim() : undefined;
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      out.expectedText = getVal('expectedText') && getVal('expectedText').trim() ? getVal('expectedText').trim() : undefined;
      out.optionText = getVal('optionText') && getVal('optionText').trim() ? getVal('optionText').trim() : out.expectedText;
      var optionTextsVal = (getVal('optionTexts') || '').trim();
      try {
        out.optionTexts = optionTextsVal ? JSON.parse(optionTextsVal) : undefined;
        if (out.optionTexts && !Array.isArray(out.optionTexts)) out.optionTexts = undefined;
      } catch (_) {
        out.optionTexts = undefined;
      }
      var clickDelayVal = getVal('optionTextsClickDelayMs');
      out.optionTextsClickDelayMs = clickDelayVal !== undefined && clickDelayVal !== '' ? parseInt(clickDelayVal, 10) : undefined;
      var closeKeyVal = getVal('optionTextsCloseKey');
      out.optionTextsCloseKey = closeKeyVal != null ? String(closeKeyVal).trim() || undefined : undefined;
      var closeKeyCountVal = getVal('optionTextsCloseKeyCount');
      out.optionTextsCloseKeyCount = closeKeyCountVal !== undefined && closeKeyCountVal !== '' ? parseInt(closeKeyCountVal, 10) : undefined;
      var afterCloseVal = getVal('optionTextsAfterCloseDelayMs');
      out.optionTextsAfterCloseDelayMs = afterCloseVal !== undefined && afterCloseVal !== '' ? parseInt(afterCloseVal, 10) : undefined;
      var checkVal = (getVal('checkSelectors') || '').trim();
      var openVal = (getVal('openSelectors') || '').trim();
      var optVal = (getVal('optionSelectors') || '').trim();
      try {
        out.checkSelectors = checkVal ? JSON.parse(checkVal) : [];
        out.openSelectors = openVal ? JSON.parse(openVal) : (out.checkSelectors.length ? out.checkSelectors : []);
        out.optionSelectors = optVal ? JSON.parse(optVal) : [];
      } catch (_) {
        return { error: 'Invalid ensureSelect JSON' };
      }
      return out;
    },
  });
})();
