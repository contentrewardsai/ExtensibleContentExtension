(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('clipboardRead', {
    label: 'Clipboard read',
    defaultAction: { type: 'clipboardRead', saveAsVariable: 'clipboardText' },
    getSummary: function(action) {
      return 'Read → ' + (action.saveAsVariable || 'row');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body = '<div class="step-field"><span class="step-hint">Clipboard read may fail in automated batches unless the browser treats the run as user-initiated.</span></div>' +
        '<div class="step-field"><label>Save as variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(action.saveAsVariable || '') + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('clipboardRead', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var el = item.querySelector('[data-field="saveAsVariable"][data-step="' + idx + '"]');
      var v = el && el.value ? el.value.trim() : '';
      if (!v) return { error: 'saveAsVariable is required' };
      return { type: 'clipboardRead', saveAsVariable: v };
    },
    getVariableKey: function(action) {
      var k = action && action.saveAsVariable != null ? String(action.saveAsVariable).trim() : '';
      return k || undefined;
    },
  });
})();
