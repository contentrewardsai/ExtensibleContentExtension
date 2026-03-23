(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('type', {
    label: 'Type',
    defaultAction: { type: 'type', selectors: [], variableKey: '', optional: false, reactCompat: false },
    getSummary: function(action) {
      var label = (action.variableKey || action.ariaLabel || action.placeholder || action.name || 'field').toString().slice(0, 28);
      var base = 'Type: ' + label;
      var rv = action.recordedValue != null ? String(action.recordedValue).trim() : '';
      if (rv) base += ' (default: ' + rv.slice(0, 36) + (rv.length > 36 ? '…' : '') + ')';
      return base;
    },
    getVariableKey: function(action) {
      return action.variableKey || action.ariaLabel || action.placeholder || action.name || '';
    },
    getVariableHint: function() { return 'text'; },
    getSimilarityScore: function(a, b) {
      var s = 0;
      if (a.placeholder === b.placeholder) s += 0.2;
      if (a.name === b.name) s += 0.2;
      if (a.ariaLabel === b.ariaLabel) s += 0.2;
      return s;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var reactCompat = !!action.reactCompat;
      var variableKey = action.variableKey || '';
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var fallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label>Variable key (row column name)</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. email"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="reactCompat" data-step="' + i + '"' + (reactCompat ? ' checked' : '') + '> React compatibility</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Primary selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '" rows="4">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback selectors (JSON)</label><span class="step-hint">Tried in score order after primaries fail (e.g. name, aria-label, class).</span><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="6" placeholder="[]">' + escapeHtml(fallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors" title="Append pick as fallback">Select on page (fallback)</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('type', action, i, totalCount, helpers, body);
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
      var out = { type: 'type' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      out.variableKey = getVal('variableKey') && getVal('variableKey').trim() ? getVal('variableKey').trim() : undefined;
      out.optional = getCheck('optional');
      out.reactCompat = getCheck('reactCompat');
      var selVal = getVal('selectors');
      if (selVal !== undefined) {
        try {
          out.selectors = JSON.parse(selVal || '[]');
        } catch (_) {
          return { error: 'Invalid selectors JSON' };
        }
      }
      var fbVal = getVal('fallbackSelectors');
      if (fbVal !== undefined) {
        try {
          var fb = JSON.parse(fbVal || '[]');
          out.fallbackSelectors = Array.isArray(fb) && fb.length ? fb : undefined;
        } catch (_) {
          return { error: 'Invalid fallback selectors JSON' };
        }
      }
      return out;
    },
  });
})();
