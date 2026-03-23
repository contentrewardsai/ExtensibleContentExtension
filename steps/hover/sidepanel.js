(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('hover', {
    label: 'Hover',
    defaultAction: { type: 'hover', selectors: [], optional: false },
    getSummary: function(action) {
      return 'Hover: ' + (action.text || action.tagName || 'element').toString().slice(0, 30);
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var body = '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional (skip if element not found)</label></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Click the element on the page to use as target">Select on page</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('hover', action, i, totalCount, helpers, body);
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
      var out = { type: 'hover' };
      out.optional = getCheck('optional');
      var selVal = getVal('selectors');
      if (selVal !== undefined) {
        try {
          out.selectors = JSON.parse(selVal || '[]');
        } catch (_) {
          out.selectors = action.selectors || [];
        }
      } else {
        out.selectors = action.selectors || [];
      }
      return out;
    },
  });
})();
