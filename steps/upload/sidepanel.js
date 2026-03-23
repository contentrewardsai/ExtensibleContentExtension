(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('upload', {
    label: 'Upload',
    defaultAction: { type: 'upload', selectors: [], variableKey: 'fileUrl', optional: false },
    getSummary: function(action) {
      return 'Upload: ' + (action.variableKey || 'file').toString().slice(0, 30);
    },
    getVariableKey: function(action) {
      return action.variableKey || 'fileUrl';
    },
    getVariableHint: function() { return 'URL'; },
    mergeInto: function(merged, best) {
      if (best.variableKey) merged.variableKey = merged.variableKey || best.variableKey;
      if (best.accept) merged.accept = merged.accept || best.accept;
      if (!merged.variableKey) merged.variableKey = 'fileUrl';
    },
    getSimilarityScore: function() { return 0.3; },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var variableKey = action.variableKey || 'fileUrl';
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var body = '<div class="step-field"><label>Variable key (e.g. fileUrl)</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('upload', action, i, totalCount, helpers, body);
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
      var out = { type: 'upload' };
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
