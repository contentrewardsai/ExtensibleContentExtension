(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('dragDrop', {
    label: 'Drag and drop',
    defaultAction: { type: 'dragDrop', sourceSelectors: [], targetSelectors: [], optional: false, steps: 12, stepDelayMs: 25 },
    getSummary: function(action) {
      return 'Drag → drop';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var srcJson = JSON.stringify(action.sourceSelectors || [], null, 2);
      var srcFbJson = JSON.stringify(action.sourceFallbackSelectors || [], null, 2);
      var tgtJson = JSON.stringify(action.targetSelectors || [], null, 2);
      var tgtFbJson = JSON.stringify(action.targetFallbackSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional</label></div>' +
        '<div class="step-field"><label>Source selectors (JSON)</label><textarea data-field="sourceSelectors" data-step="' + i + '" rows="4">' + escapeHtml(srcJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="sourceSelectors">Select on page</button></div>' +
        '<div class="step-field"><label>Source fallback selectors</label><textarea data-field="sourceFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(srcFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Target selectors (JSON)</label><textarea data-field="targetSelectors" data-step="' + i + '" rows="4">' + escapeHtml(tgtJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="targetSelectors">Select on page</button></div>' +
        '<div class="step-field"><label>Target fallback selectors</label><textarea data-field="targetFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(tgtFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Move steps (count)</label><input type="number" data-field="steps" data-step="' + i + '" value="' + escapeHtml(String(action.steps != null ? action.steps : 12)) + '" min="3" max="40"></div>' +
        '<div class="step-field"><label>Delay per step (ms)</label><input type="number" data-field="stepDelayMs" data-step="' + i + '" value="' + escapeHtml(String(action.stepDelayMs != null ? action.stepDelayMs : 25)) + '" min="5"></div>' +
        '<div class="step-field"><label>Timeout (ms)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + escapeHtml(String(action.timeoutMs != null ? action.timeoutMs : 30000)) + '" min="1000"></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('dragDrop', action, i, totalCount, helpers, body);
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
      var out = { type: 'dragDrop' };
      out.optional = getCheck('optional');
      out.sourceSelectors = parseJson(getVal('sourceSelectors'));
      out.sourceFallbackSelectors = parseJson(getVal('sourceFallbackSelectors'));
      if (!out.sourceFallbackSelectors.length) out.sourceFallbackSelectors = undefined;
      out.targetSelectors = parseJson(getVal('targetSelectors'));
      out.targetFallbackSelectors = parseJson(getVal('targetFallbackSelectors'));
      if (!out.targetFallbackSelectors.length) out.targetFallbackSelectors = undefined;
      var st = getVal('steps');
      out.steps = st ? Math.max(3, Math.min(40, parseInt(st, 10) || 12)) : 12;
      var sd = getVal('stepDelayMs');
      out.stepDelayMs = sd ? Math.max(5, parseInt(sd, 10) || 25) : 25;
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
