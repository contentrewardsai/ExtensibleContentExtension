(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('download', {
    label: 'Download',
    defaultAction: { type: 'download', selectors: [], variableKey: '', optional: false },
    getSummary: function() { return 'Download'; },
    getVariableKey: function(action) {
      return action.variableKey || action.ariaLabel || '';
    },
    getVariableHint: function() { return 'URL'; },
    getExtraVariableKeys: function() {
      return [{ rowKey: 'downloadFilename', label: 'downloadFilename', hint: 'text' }];
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var variableKey = action.variableKey || '';
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var body = '<div class="step-field"><label>Variable key</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. downloadUrl"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('download', action, i, totalCount, helpers, body);
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
      var out = { type: 'download' };
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
