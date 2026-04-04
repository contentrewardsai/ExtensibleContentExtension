(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('waitForElement', {
    label: 'Wait for element',
    defaultAction: { type: 'waitForElement', state: 'visible', selectors: [], timeoutMs: 30000, optional: false },
    getSummary: function(action) {
      var st = action.state || 'visible';
      return st === 'hidden' ? 'Until hidden' : 'Until visible';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var state = action.state || 'visible';
      var optional = !!action.optional;
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var fallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional (continue on timeout)</label></div>' +
        '<div class="step-field"><label>State</label><select data-field="state" data-step="' + i + '">' +
        '<option value="visible"' + (state === 'visible' ? ' selected' : '') + '>Visible</option>' +
        '<option value="hidden"' + (state === 'hidden' ? ' selected' : '') + '>Hidden</option></select></div>' +
        '<div class="step-field"><label>Selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '" rows="4">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback selectors</label><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="3">' + escapeHtml(fallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors">Select on page (fallback)</button></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + escapeHtml(String(action.timeoutMs != null ? action.timeoutMs : 30000)) + '" min="1000"></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('waitForElement', action, i, totalCount, helpers, body);
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
          return [];
        }
      };
      var out = { type: 'waitForElement' };
      out.optional = getCheck('optional');
      out.state = getVal('state') || 'visible';
      out.selectors = parseJson(getVal('selectors'));
      out.fallbackSelectors = parseJson(getVal('fallbackSelectors'));
      if (!out.fallbackSelectors.length) out.fallbackSelectors = undefined;
      var to = getVal('timeoutMs');
      out.timeoutMs = to ? Math.max(1000, parseInt(to, 10)) : 30000;
      out.iframeSelectors = parseJson(getVal('iframeSelectors'));
      if (!out.iframeSelectors.length) out.iframeSelectors = undefined;
      out.iframeFallbackSelectors = parseJson(getVal('iframeFallbackSelectors'));
      if (!out.iframeFallbackSelectors.length) out.iframeFallbackSelectors = undefined;
      out.shadowHostSelectors = parseJson(getVal('shadowHostSelectors'));
      if (!out.shadowHostSelectors.length) out.shadowHostSelectors = undefined;
      out.shadowHostFallbackSelectors = parseJson(getVal('shadowHostFallbackSelectors'));
      if (!out.shadowHostFallbackSelectors.length) out.shadowHostFallbackSelectors = undefined;
      return out;
    },
  });
})();
