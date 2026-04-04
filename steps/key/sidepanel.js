/**
 * Key step – sidepanel UI: label, defaultAction, getSummary, renderBody, saveStep.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('key', {
    label: 'Send key',
    defaultAction: { type: 'key', key: 'Escape', count: 1, optional: false },
    getSummary: function(action) {
      const k = (action.key || 'Escape').trim();
      const c = Math.max(1, parseInt(action.count, 10) || 1);
      return (c > 1 ? 'Key ' + k + ' ×' + c : 'Key: ' + k);
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var keyVal = (action.key || 'Escape').trim();
      var countVal = action.count != null ? action.count : 1;
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var body = '<div class="step-field"><label>Key name</label><input type="text" data-field="key" data-step="' + i + '" value="' + escapeHtml(keyVal) + '" placeholder="Escape"></div>' +
        '<div class="step-field"><label>Times to send</label><input type="number" data-field="count" data-step="' + i + '" value="' + countVal + '" min="1" placeholder="1"></div>' +
        '<div class="step-field"><span class="step-hint">Optional: send keys on iframe contentDocument or shadow host document.</span></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('key', action, i, totalCount, helpers, body);
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
      var out = { type: 'key' };
      var stepLabelVal = getVal('stepLabel');
      if (stepLabelVal != null) out.stepLabel = (stepLabelVal + '').trim() || undefined;
      var delayVal = getVal('delay');
      out.delay = delayVal ? parseInt(delayVal, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      out.key = (getVal('key') || 'Escape').trim() || 'Escape';
      var c = parseInt(getVal('count'), 10);
      out.count = (isNaN(c) || c < 1) ? 1 : c;
      out.optional = getCheck('optional');
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
