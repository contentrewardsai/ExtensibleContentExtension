(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('qualityCheck', {
    label: 'Quality check',
    defaultAction: {
      type: 'qualityCheck',
      enabled: true,
      threshold: 0.75,
      minOutputs: 1,
      rerunOnFail: true,
      maxRetries: 3,
      strategy: 'retryOnFail',
      comparisonMethod: 'auto',
    },
    getSummary: function(action) {
      if (!action.enabled) return 'Quality check (disabled)';
      var t = action.threshold != null ? action.threshold : 0.75;
      var m = action.comparisonMethod || 'auto';
      var r = action.rerunOnFail ? ', max ' + (action.maxRetries ?? 3) + ' retries' : '';
      return 'QC threshold ' + t + ', ' + m + r;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var enabled = action.enabled !== false;
      var threshold = action.threshold != null ? action.threshold : 0.75;
      var comparisonMethod = action.comparisonMethod || 'auto';
      var minOutputs = action.minOutputs != null ? action.minOutputs : 1;
      var rerunOnFail = action.rerunOnFail !== false;
      var maxRetries = action.maxRetries != null ? action.maxRetries : 3;
      var strategy = action.strategy || 'retryOnFail';
      var body =
        '<div class="step-field"><label><input type="checkbox" data-field="qcEnabled" data-step="' + i + '"' + (enabled ? ' checked' : '') + '> Enabled</label></div>' +
        '<div class="step-field"><label>Pass threshold (0–1)</label><input type="number" data-field="threshold" data-step="' + i + '" value="' + threshold + '" min="0" max="1" step="0.05"></div>' +
        '<div class="step-field"><label>Comparison method</label><select data-field="comparisonMethod" data-step="' + i + '">' +
        '<option value="auto"' + (comparisonMethod === 'auto' ? ' selected' : '') + '>Auto (LaMini then embedding)</option>' +
        '<option value="llm"' + (comparisonMethod === 'llm' ? ' selected' : '') + '>LaMini only</option>' +
        '<option value="embedding"' + (comparisonMethod === 'embedding' ? ' selected' : '') + '>Embedding only (sandbox)</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Min outputs to look for</label><input type="number" data-field="minOutputs" data-step="' + i + '" value="' + minOutputs + '" min="1"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="rerunOnFail" data-step="' + i + '"' + (rerunOnFail ? ' checked' : '') + '> Rerun on fail</label></div>' +
        '<div class="step-field"><label>Max retries</label><input type="number" data-field="maxRetries" data-step="' + i + '" value="' + maxRetries + '" min="1" max="10"></div>' +
        '<div class="step-field"><label>Strategy</label><select data-field="strategy" data-step="' + i + '">' +
        '<option value="retryOnFail"' + (strategy === 'retryOnFail' ? ' selected' : '') + '>Retry on fail</option>' +
        '<option value="bestOutput"' + (strategy === 'bestOutput' ? ' selected' : '') + '>Best output</option>' +
        '</select></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('qualityCheck', action, i, totalCount, helpers, body);
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
      var out = { type: 'qualityCheck' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      var enabledEl = item.querySelector('[data-field="qcEnabled"][data-step="' + idx + '"]');
      out.enabled = enabledEl ? enabledEl.checked : true;
      out.threshold = Math.max(0, Math.min(1, parseFloat(getVal('threshold')) || 0.75));
      out.comparisonMethod = getVal('comparisonMethod') || 'auto';
      out.minOutputs = Math.max(1, parseInt(getVal('minOutputs'), 10) || 1);
      var rerunEl = item.querySelector('[data-field="rerunOnFail"][data-step="' + idx + '"]');
      out.rerunOnFail = rerunEl ? rerunEl.checked : true;
      out.maxRetries = Math.max(1, Math.min(10, parseInt(getVal('maxRetries'), 10) || 3));
      out.strategy = getVal('strategy') || 'retryOnFail';
      return out;
    },
  });
})();
