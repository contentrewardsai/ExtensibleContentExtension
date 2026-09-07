(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('ensureOpen', {
    label: 'Ensure open',
    defaultAction: { type: 'ensureOpen', checkSelectors: [], openSelectors: [], timeoutMs: 15000, afterOpenTimeoutMs: 8000, optional: false },
    getSummary: function(action) {
      var hint = action.text || action.checkText || '';
      if (!hint && action.checkSelectors && action.checkSelectors[0]) hint = action.checkSelectors[0].value || '';
      return 'Ensure open: ' + String(hint || 'panel').slice(0, 40);
    },
    shortcutLabel: '+ Ensure open',
    mergeInto: function(merged, best) {
      if (best.checkSelectors && best.checkSelectors.length) merged.checkSelectors = best.checkSelectors;
      if (best.openSelectors && best.openSelectors.length) merged.openSelectors = best.openSelectors;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var checkJson = JSON.stringify(action.checkSelectors || [], null, 2);
      var openJson = JSON.stringify(action.openSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional (continue if neither found)</label></div>' +
        '<div class="step-field"><label>Check selectors (skip if already visible)</label><textarea data-field="checkSelectors" data-step="' + i + '" rows="3">' + escapeHtml(checkJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="checkSelectors" title="Select on page (check)">Select on page (check)</button></div>' +
        '<div class="step-field"><label>Open selectors (click if check is hidden)</label><textarea data-field="openSelectors" data-step="' + i + '" rows="3">' + escapeHtml(openJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="openSelectors" title="Select on page (open)">Select on page (open)</button></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + escapeHtml(String(action.timeoutMs != null ? action.timeoutMs : 15000)) + '" min="1000"></div>' +
        '<div class="step-field"><label>Wait after open (ms)</label><input type="number" data-field="afterOpenTimeoutMs" data-step="' + i + '" value="' + escapeHtml(String(action.afterOpenTimeoutMs != null ? action.afterOpenTimeoutMs : 8000)) + '" min="200"></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('ensureOpen', action, i, totalCount, helpers, body);
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
      var parseJson = function(raw) {
        var t = String(raw || '').trim();
        if (!t) return [];
        try {
          var p = JSON.parse(t);
          return Array.isArray(p) ? p : [p];
        } catch (_) {
          return { error: true };
        }
      };
      var out = { type: 'ensureOpen' };
      out.optional = getCheck('optional');
      var check = parseJson(getVal('checkSelectors'));
      var open = parseJson(getVal('openSelectors'));
      if (check.error || open.error) return { error: 'Invalid ensureOpen JSON' };
      out.checkSelectors = check;
      out.openSelectors = open;
      var to = getVal('timeoutMs');
      out.timeoutMs = to ? Math.max(1000, parseInt(to, 10)) : 15000;
      var after = getVal('afterOpenTimeoutMs');
      out.afterOpenTimeoutMs = after ? Math.max(200, parseInt(after, 10)) : 8000;
      function parseSelField(field) {
        var parsed = parseJson(getVal(field));
        if (parsed.error) return undefined;
        return parsed.length ? parsed : undefined;
      }
      out.iframeSelectors = parseSelField('iframeSelectors');
      out.iframeFallbackSelectors = parseSelField('iframeFallbackSelectors');
      out.shadowHostSelectors = parseSelField('shadowHostSelectors');
      out.shadowHostFallbackSelectors = parseSelField('shadowHostFallbackSelectors');
      return out;
    },
  });
})();
