(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('select', {
    label: 'Select',
    defaultAction: { type: 'select', selectors: [], variableKey: '', optional: false },
    getSummary: function(action) {
      return 'Select: ' + (action.name || action.variableKey || 'dropdown').toString().slice(0, 30);
    },
    getVariableKey: function(action) {
      return action.variableKey || action.name || action.ariaLabel || '';
    },
    getVariableHint: function() { return 'text'; },
    getSimilarityScore: function(a, b) {
      return (a.name === b.name) ? 0.3 : 0;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var variableKey = action.variableKey || '';
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var body = '<div class="step-field"><label>Variable key</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. country"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('select', action, i, totalCount, helpers, body);
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
      var out = { type: 'select' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      out.variableKey = getVal('variableKey') && getVal('variableKey').trim() ? getVal('variableKey').trim() : undefined;
      out.optional = getCheck('optional');
      var selVal = getVal('selectors');
      if (selVal !== undefined) {
        try {
          out.selectors = JSON.parse(selVal || '[]');
        } catch (_) {
          return { error: 'Invalid selectors JSON' };
        }
      } else {
        out.selectors = action.selectors || [];
      }
      return out;
    },
  });
})();
