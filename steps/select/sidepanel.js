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
      var fallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label>Variable key</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. country"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback selectors (JSON)</label><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="3">' + escapeHtml(fallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors">Select on page (fallback)</button></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
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
      var fbVal = getVal('fallbackSelectors');
      if (fbVal !== undefined && String(fbVal).trim()) {
        try {
          var fb = JSON.parse(fbVal || '[]');
          out.fallbackSelectors = Array.isArray(fb) && fb.length ? fb : undefined;
        } catch (_) {
          return { error: 'Invalid fallback selectors JSON' };
        }
      }
      function parseSelField(field) {
        var v = getVal(field);
        if (v === undefined || !String(v).trim()) return undefined;
        try {
          var p = JSON.parse(v || '[]');
          return Array.isArray(p) && p.length ? p : undefined;
        } catch (_) {
          return undefined;
        }
      }
      out.iframeSelectors = parseSelField('iframeSelectors');
      out.iframeFallbackSelectors = parseSelField('iframeFallbackSelectors');
      out.shadowHostSelectors = parseSelField('shadowHostSelectors');
      out.shadowHostFallbackSelectors = parseSelField('shadowHostFallbackSelectors');
      return out;
    },
  });
})();
