(function() {
  'use strict';
  var DEFAULT_MIN = 15000;
  var DEFAULT_MAX = 25000;
  var DEFAULT_MAX_RETRIES = 3;
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('delayBeforeNextRun', {
    label: 'Delay before next run',
    defaultAction: { type: 'delayBeforeNextRun', delayMinMs: DEFAULT_MIN, delayMaxMs: DEFAULT_MAX, maxRetriesOnFail: DEFAULT_MAX_RETRIES },
    getSummary: function(action) {
      const min = action.delayMinMs != null ? action.delayMinMs : DEFAULT_MIN;
      const max = action.delayMaxMs != null ? action.delayMaxMs : DEFAULT_MAX;
      const retries = action.maxRetriesOnFail != null ? action.maxRetriesOnFail : DEFAULT_MAX_RETRIES;
      return 'Wait ' + (min / 1000) + 's–' + (max / 1000) + 's before next row; max ' + retries + ' retries per row';
    },
    renderBody: function(action, i, _wfId, _totalCount, helpers) {
      const escapeHtml = helpers.escapeHtml;
      const min = action.delayMinMs != null ? action.delayMinMs : DEFAULT_MIN;
      const max = action.delayMaxMs != null ? action.delayMaxMs : DEFAULT_MAX;
      const retries = action.maxRetriesOnFail != null ? action.maxRetriesOnFail : DEFAULT_MAX_RETRIES;
      const body =
        '<div class="step-field"><label>Min delay (ms)</label><input type="number" data-field="delayMinMs" data-step="' + i + '" value="' + escapeHtml(String(min)) + '" min="0" placeholder="15000"></div>' +
        '<div class="step-field"><label>Max delay (ms)</label><input type="number" data-field="delayMaxMs" data-step="' + i + '" value="' + escapeHtml(String(max)) + '" min="0" placeholder="25000"></div>' +
        '<div class="step-field"><label>Max retries per row</label><input type="number" data-field="maxRetriesOnFail" data-step="' + i + '" value="' + escapeHtml(String(retries)) + '" min="1" max="10" placeholder="3" title="When a step fails with onFailure: Retry row, retry up to this many times."></div>' +
        '<div class="step-field"><span class="step-hint">Run All Rows: random delay in range after each row; retries use this max when a step has onFailure: Retry row.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('delayBeforeNextRun', action, i, _totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      const minEl = item.querySelector('[data-field="delayMinMs"][data-step="' + idx + '"]');
      const maxEl = item.querySelector('[data-field="delayMaxMs"][data-step="' + idx + '"]');
      const retriesEl = item.querySelector('[data-field="maxRetriesOnFail"][data-step="' + idx + '"]');
      const minVal = minEl ? parseInt(minEl.value, 10) : DEFAULT_MIN;
      const maxVal = maxEl ? parseInt(maxEl.value, 10) : DEFAULT_MAX;
      const retriesVal = retriesEl ? parseInt(retriesEl.value, 10) : DEFAULT_MAX_RETRIES;
      action.delayMinMs = isNaN(minVal) || minVal < 0 ? DEFAULT_MIN : minVal;
      action.delayMaxMs = isNaN(maxVal) || maxVal < 0 ? DEFAULT_MAX : Math.max(action.delayMinMs, maxVal);
      action.maxRetriesOnFail = isNaN(retriesVal) || retriesVal < 1 ? DEFAULT_MAX_RETRIES : Math.min(10, Math.max(1, retriesVal));
      return action;
    },
  });
})();
