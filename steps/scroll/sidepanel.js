(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('scroll', {
    label: 'Scroll',
    defaultAction: { type: 'scroll', mode: 'intoView', selectors: [], behavior: 'auto', optional: false },
    getSummary: function(action) {
      if ((action.mode || 'intoView') === 'delta') {
        var dx = action.scrollX != null ? action.scrollX : action.deltaX || 0;
        var dy = action.scrollY != null ? action.scrollY : action.deltaY || 0;
        return 'Scroll Δ ' + dx + ',' + dy;
      }
      return 'Scroll into view';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var mode = action.mode || 'intoView';
      var optional = !!action.optional;
      var behavior = action.behavior === 'smooth' ? 'smooth' : 'auto';
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var fallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var containerJson = JSON.stringify(action.containerSelectors || [], null, 2);
      var containerFbJson = JSON.stringify(action.containerFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional (intoView: skip if element not found)</label></div>' +
        '<div class="step-field"><label>Mode</label><select data-field="mode" data-step="' + i + '">' +
        '<option value="intoView"' + (mode === 'intoView' ? ' selected' : '') + '>Into view (selectors)</option>' +
        '<option value="delta"' + (mode === 'delta' ? ' selected' : '') + '>Delta (scrollX / scrollY)</option></select></div>' +
        '<div class="step-field"><label>Behavior</label><select data-field="behavior" data-step="' + i + '">' +
        '<option value="auto"' + (behavior === 'auto' ? ' selected' : '') + '>auto</option>' +
        '<option value="smooth"' + (behavior === 'smooth' ? ' selected' : '') + '>smooth</option></select></div>' +
        '<div class="step-field"><label>Primary selectors (into view)</label><textarea data-field="selectors" data-step="' + i + '" rows="4">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback selectors</label><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="3">' + escapeHtml(fallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors">Select on page (fallback)</button></div>' +
        '<div class="step-field"><label>Timeout (ms, into view)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + escapeHtml(String(action.timeoutMs != null ? action.timeoutMs : 30000)) + '" min="1000"></div>' +
        '<div class="step-field"><label>Delta X</label><input type="number" data-field="scrollX" data-step="' + i + '" value="' + escapeHtml(String(action.scrollX != null ? action.scrollX : action.deltaX || 0)) + '"></div>' +
        '<div class="step-field"><label>Delta Y</label><input type="number" data-field="scrollY" data-step="' + i + '" value="' + escapeHtml(String(action.scrollY != null ? action.scrollY : action.deltaY || 0)) + '"></div>' +
        '<div class="step-field"><label>Container selectors (delta, optional)</label><textarea data-field="containerSelectors" data-step="' + i + '" rows="3">' + escapeHtml(containerJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="containerSelectors">Select on page</button></div>' +
        '<div class="step-field"><label>Container fallback selectors</label><textarea data-field="containerFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(containerFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('scroll', action, i, totalCount, helpers, body);
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
      var parseJson = function(raw, fallback) {
        if (raw === undefined || raw === null) return fallback;
        var t = String(raw).trim();
        if (!t) return [];
        try {
          var p = JSON.parse(t);
          return Array.isArray(p) ? p : [p];
        } catch (_) {
          return fallback;
        }
      };
      var out = { type: 'scroll' };
      out.optional = getCheck('optional');
      out.mode = getVal('mode') || 'intoView';
      out.behavior = getVal('behavior') || 'auto';
      out.selectors = parseJson(getVal('selectors'), action.selectors || []);
      out.fallbackSelectors = parseJson(getVal('fallbackSelectors'), []);
      if (!out.fallbackSelectors.length) out.fallbackSelectors = undefined;
      var to = getVal('timeoutMs');
      out.timeoutMs = to ? Math.max(1000, parseInt(to, 10)) : 30000;
      var sx = getVal('scrollX');
      var sy = getVal('scrollY');
      out.scrollX = sx !== undefined && sx !== '' ? parseInt(sx, 10) || 0 : 0;
      out.scrollY = sy !== undefined && sy !== '' ? parseInt(sy, 10) || 0 : 0;
      out.containerSelectors = parseJson(getVal('containerSelectors'), []);
      if (!out.containerSelectors.length) out.containerSelectors = undefined;
      out.containerFallbackSelectors = parseJson(getVal('containerFallbackSelectors'), []);
      if (!out.containerFallbackSelectors.length) out.containerFallbackSelectors = undefined;
      out.iframeSelectors = parseJson(getVal('iframeSelectors'), []);
      if (!out.iframeSelectors.length) out.iframeSelectors = undefined;
      out.iframeFallbackSelectors = parseJson(getVal('iframeFallbackSelectors'), []);
      if (!out.iframeFallbackSelectors.length) out.iframeFallbackSelectors = undefined;
      out.shadowHostSelectors = parseJson(getVal('shadowHostSelectors'), []);
      if (!out.shadowHostSelectors.length) out.shadowHostSelectors = undefined;
      out.shadowHostFallbackSelectors = parseJson(getVal('shadowHostFallbackSelectors'), []);
      if (!out.shadowHostFallbackSelectors.length) out.shadowHostFallbackSelectors = undefined;
      return out;
    },
  });
})();
